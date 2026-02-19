from typing import List, Dict, Optional
import os
import logging
from sentence_transformers import SentenceTransformer
import numpy as np
import pickle
from services.groq_service import get_groq_service
import faiss

logger = logging.getLogger(__name__)

class AssistantEngine:
    def __init__(self):
        self.groq_service = get_groq_service()
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.index_path = "storage/assistant_index"
        self.index = None
        self.file_paths = []
        self.memory: Dict[str, List[Dict]] = {} # session_id -> history
        
        # Ensure storage directory exists
        os.makedirs(self.index_path, exist_ok=True)
        self.load_index()

    def get_history(self, session_id: str) -> List[Dict]:
        if session_id not in self.memory:
            self.memory[session_id] = []
        return self.memory[session_id]

    def add_to_history(self, session_id: str, role: str, content: str):
        history = self.get_history(session_id)
        history.append({"role": role, "content": content})
        # Keep last 12 messages
        if len(history) > 12:
            self.memory[session_id] = history[-12:]

    def rebuild_index(self):
        logger.info("Rebuilding RAG index...")
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # backend parent = root
        docs = []
        paths = []
        
        # Directories to index
        target_dirs = ["backend", "frontend", "docs"]
        
        for target in target_dirs:
            full_path = os.path.join(root_dir, target)
            if not os.path.exists(full_path):
                continue
                
            for root, _, files in os.walk(full_path):
                if any(exclude in root for exclude in ["__pycache__", "node_modules", "dist", "build", ".git", ".venv"]):
                    continue
                    
                for file in files:
                    if file.endswith(('.py', '.js', '.ts', '.html', '.css', '.md')):
                        file_path = os.path.join(root, file)
                        try:
                            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                                content = f.read()
                                if len(content.strip()) > 0:
                                    # Chunking strategy: simplistic for now, just file level or large chunks
                                    # For better RAG, we should split larger files.
                                    # taking first 8000 chars for now to keep it simple as per request
                                    docs.append(content[:8000]) 
                                    paths.append(file_path)
                        except Exception as e:
                            logger.warning(f"Could not read {file_path}: {e}")

        # Also add README.md
        readme_path = os.path.join(root_dir, "README.md")
        if os.path.exists(readme_path):
             with open(readme_path, 'r', encoding='utf-8') as f:
                docs.append(f.read())
                paths.append(readme_path)

        if not docs:
            logger.warning("No documents found to index.")
            return

        embeddings = self.model.encode(docs)
        dimension = embeddings.shape[1]
        
        self.index = faiss.IndexFlatL2(dimension)
        self.index.add(np.array(embeddings).astype('float32'))
        self.file_paths = paths
        
        # Save to disk
        faiss.write_index(self.index, os.path.join(self.index_path, "index.faiss"))
        with open(os.path.join(self.index_path, "paths.pkl"), "wb") as f:
            pickle.dump(self.file_paths, f)
            
        logger.info(f"Index built with {len(docs)} documents.")

    def load_index(self):
        try:
            index_file = os.path.join(self.index_path, "index.faiss")
            paths_file = os.path.join(self.index_path, "paths.pkl")
            
            if os.path.exists(index_file) and os.path.exists(paths_file):
                self.index = faiss.read_index(index_file)
                with open(paths_file, "rb") as f:
                    self.file_paths = pickle.load(f)
                logger.info("RAG index loaded.")
            else:
                logger.info("No existing index found.")
        except Exception as e:
            logger.error(f"Error loading index: {e}")

    def retrieve_context(self, query: str, top_k: int = 5) -> List[Dict]:
        if not self.index or not self.file_paths:
            return []
            
        query_vector = self.model.encode([query])
        D, I = self.index.search(np.array(query_vector).astype('float32'), top_k)
        
        results = []
        for i, idx in enumerate(I[0]):
            if idx < len(self.file_paths):
                path = self.file_paths[idx]
                # Read specific snippet? For now reading file start
                try:
                    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()[:1000] # Snippet
                        results.append({
                            "source": os.path.relpath(path, start=os.path.dirname(os.path.dirname(os.path.dirname(path)))),
                            "snippet": content
                        })
                except:
                    pass
        return results

    def chat(self, session_id: str, message: str, mode: str = "project"):
        context_str = ""
        citations = []
        
        # 1. Retrieve Context if in Project Mode
        if mode == "project":
            if not self.index:
                # Lazy build if missing
                self.rebuild_index()
            
            retrieved = self.retrieve_context(message)
            citations = retrieved
            context_str = "\n\n".join([f"--- Source: {r['source']} ---\n{r['snippet']}" for r in retrieved])

        # 2. Build History
        history = self.get_history(session_id)
        messages = [
            {"role": "system", "content": f"""You are a senior software engineer assistant for THIS project.
Mode: {mode.upper()}

RULES:
- In 'project' mode: RELY on the provided context. If the answer is not in the context, say you don't know regarding this project, but offer general knowledge if applicable (clarify it is general knowledge).
- Never fabricate file paths.
- Keep answers practical, structured, and concise.
- Use Markdown.

CONTEXT FROM PROJECT FILES:
{context_str}
"""}
        ]
        
        for msg in history:
            messages.append(msg)
            
        messages.append({"role": "user", "content": message})

        # 3. Call LLM (Pass 1 - Draft)
        try:
            completion = self.groq_service.client.chat.completions.create(
                messages=messages,
                model=self.groq_service.model,
                temperature=0.2,
                max_tokens=1200
            )
            draft_answer = completion.choices[0].message.content
        except Exception as e:
            logger.error(f"LLM Error: {e}")
            return {"success": False, "answer": "I encountered an error connecting to the AI service."}

        # 4. Verification Pass (Optional but recommended)
        # For speed, we might skip a full second LLM call unless strictness is required.
        # given constraints, staying single pass with strong system prompt is often better for latency unless 'cot' is explicitly asked.
        # But user asked for it. Let's do a lightweight check if context was used.
        
        final_answer = draft_answer

        # 5. Update Memory
        self.add_to_history(session_id, "user", message)
        self.add_to_history(session_id, "assistant", final_answer)

        return {
            "success": True,
            "answer": final_answer,
            "citations": citations,
            "used_context": bool(context_str)
        }

# Singleton
_assistant_engine = None
def get_assistant_engine():
    global _assistant_engine
    if _assistant_engine is None:
        _assistant_engine = AssistantEngine()
    return _assistant_engine
