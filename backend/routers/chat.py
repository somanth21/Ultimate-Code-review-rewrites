from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
import logging
from groq import Groq, RateLimitError, APIConnectionError, APIError
import os
import time

from services.groq_service import get_groq_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["chat"])

class ChatRequest(BaseModel):
    message: str
    language: Optional[str] = None
    context_code: Optional[str] = None
    review_summary: Optional[str] = None

from fastapi.responses import StreamingResponse
import asyncio

@router.post("/chat")
async def chat_assistant(request: ChatRequest):
    try:
        groq_service = get_groq_service()
        client = groq_service.client
        model = groq_service.model
        
        # 1. Context Gating & Intent Analysis
        user_message = request.message.lower()
        needs_context = any(keyword in user_message for keyword in ["this code", "my code", "the bug", "fix this", "explain this", "rewrite"])
        
        language = request.language if request.language else "Not specified"
        context_code = request.context_code if (request.context_code and needs_context) else ""
        review_summary = request.review_summary if (request.review_summary and needs_context) else ""
        
        # 2. Expertise Detection
        is_advanced = any(keyword in user_message for keyword in ["optimize", "refactor", "architecture", "design pattern", "complexity"])
        explanation_style = "Give deep technical reasoning." if is_advanced else "Explain simply."

        system_prompt = f"""You are an elite AI Coding Copilot comparable to ChatGPT and Gemini.

You must:
- Be precise.
- Answer only what is asked.
- Avoid unnecessary length.
- Strictly follow requested programming language.
- Never switch languages.
- Use context_code only if question refers to it.
- Avoid hallucinating libraries or APIs.
- Provide production-grade answers.
- Adapt explanation depth automatically.
- Use structured but concise formatting.

Language Lock Rule:
You MUST generate code only in the requested programming language ({language}).
If user did not request code, do NOT generate code.

Precision Rule:
If question is simple → answer simply.
If advanced → answer technically.

Never:
- Add unrelated information
- Assume missing context
- Default to Python
- Over-explain
- Repeat obvious things

If insufficient data:
→ Ask for clarification instead of guessing.

Be intelligent, efficient, and technically correct.

Role:
- Senior Software Architect
- Security Expert
- Clean Code Specialist

Task:
- Explain bugs clearly
- Provide correct fix
- Provide corrected example in the SAME language
- {explanation_style}

User Question:
{request.message}

Programming Language:
{language}

Code Context:
{context_code if context_code else "No specific code context required."}

Review Summary:
{review_summary if review_summary else "No review summary."}
"""

        # 3. Streaming Response Generator
        async def generate_stream():
            try:
                max_retries = 3
                base_delay = 2
                
                for attempt in range(max_retries + 1):
                    try:
                        stream = client.chat.completions.create(
                            messages=[{"role": "user", "content": system_prompt}],
                            model=model,
                            temperature=0.15,
                            max_tokens=1500,
                            top_p=0.85,
                            stream=True
                        )
                        
                        full_response = ""
                        
                        for chunk in stream:
                            if chunk.choices[0].delta.content is not None:
                                content = chunk.choices[0].delta.content
                                full_response += content
                                yield content
                        
                        # --- Post-Generation Validation (Async) ---
                        # We stream first for UX, but log if invalid.
                        # Strict "Safe Streaming" (buffer first) was proposed, but for a chatbot feels too slow.
                        # We will stick to standard streaming for responsiveness, but check afterwards.
                        
                        validation_msg = ""
                        if language.lower() == "java" and ("def " in full_response or "import matplotlib" in full_response):
                            validation_msg = "Python syntax detected in Java response."
                        elif language.lower() == "python" and ("public class" in full_response or "System.out.println" in full_response):
                            validation_msg = "Java syntax detected in Python response."
                            
                        if validation_msg:
                            logger.warning(f"Validation Warning: {validation_msg}")
                            yield f"\n\n⚠️ *Auto-Correction*: I may have used incorrect syntax for {language}. Please verify."

                        break # Success
                        
                    except RateLimitError:
                        if attempt < max_retries:
                            delay = base_delay * (2 ** attempt)
                            logger.warning(f"Rate limit hit. Retrying in {delay}s")
                            await asyncio.sleep(delay)
                        else:
                            yield "⚠️ **System Busy**: The AI is currently overloaded. Please try again."
                            break
                    except Exception as e:
                        logger.error(f"Stream error: {e}")
                        yield f"⚠️ **Error**: {str(e)}"
                        break

            except Exception as e:
                logger.error(f"Generator error: {e}")
                yield f"⚠️ **System Error**: {str(e)}"

        return StreamingResponse(generate_stream(), media_type="text/plain")

    except Exception as e:
        logger.error(f"Chat setup error: {e}")
        return {"reply": f"⚠️ **System Error**: {str(e)}"}
