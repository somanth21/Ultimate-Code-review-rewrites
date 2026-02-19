from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
import uuid
from services.assistant_engine import get_assistant_engine, AssistantEngine

router = APIRouter(prefix="/api/assistant", tags=["assistant"])

class ChatRequest(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    message: str
    mode: str = "project" # project, general, code
    max_context_files: int = 6

@router.post("/chat")
async def chat_endpoint(request: ChatRequest):
    engine = get_assistant_engine()
    response = engine.chat(
        session_id=request.session_id,
        message=request.message,
        mode=request.mode
    )
    return response

@router.post("/reindex")
async def reindex_endpoint():
    # Simple protection could be added here
    engine = get_assistant_engine()
    engine.rebuild_index()
    return {"status": "Index rebuilding started"}
