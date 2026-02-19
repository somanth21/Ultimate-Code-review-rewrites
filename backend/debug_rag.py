import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
import sys

def test_rag():
    print(f"Python: {sys.version}")
    print(f"Numpy: {np.__version__}")
    
    try:
        print("Loading SentenceTransformer...")
        model = SentenceTransformer('all-MiniLM-L6-v2')
        
        docs = ["This is a test document.", "Another document."]
        print("Encoding docs...")
        embeddings = model.encode(docs)
        print(f"Embeddings shape: {embeddings.shape}")
        print(f"Embeddings type: {type(embeddings)}")
        
        dimension = embeddings.shape[1]
        print(f"Creating FAISS index (dimension={dimension})...")
        index = faiss.IndexFlatL2(dimension)
        
        print("Adding embeddings to index...")
        # Replicating the line from assistant_engine.py
        data = np.array(embeddings).astype('float32')
        index.add(data)
        
        print("Index size:", index.ntotal)
        print("Success!")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_rag()
