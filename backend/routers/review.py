"""
/api/review — Structured JSON code review endpoint (V2).
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, validator
from typing import List, Optional
import logging

from services.review_engine_v2 import run_review

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["review"])


class CodeReviewRequest(BaseModel):
    code: str = Field(..., min_length=1, description="Source code to review")
    language: str = Field(default="python", description="Programming language")
    focus_areas: Optional[List[str]] = Field(
        default=None,
        description="Focus areas: bugs, security, performance, best_practices",
    )
    calculate_score: bool = Field(default=True, description="Calculate quality scores")

    @validator("code")
    def validate_code(cls, v):
        if not v or not v.strip():
            raise ValueError("Code cannot be empty")
        if len(v) > 50000:
            raise ValueError("Code too large (max 50,000 characters)")
        return v.strip()

    @validator("language")
    def validate_language(cls, v):
        return v.lower() if v else "python"


@router.post("/review")
def review_code(request: CodeReviewRequest):
    """Structured JSON code review with gamification."""
    try:
        result = run_review(
            code=request.code,
            language=request.language,
            focus_areas=request.focus_areas,
            calculate_score=request.calculate_score,
        )

        if not result.get("success", False):
            code_map = {
                "rate_limit": status.HTTP_429_TOO_MANY_REQUESTS,
                "empty_code": status.HTTP_400_BAD_REQUEST,
            }
            sc = code_map.get(result.get("error"), status.HTTP_500_INTERNAL_SERVER_ERROR)
            raise HTTPException(status_code=sc, detail={
                "error": result.get("error", "unknown"),
                "message": result.get("message", "Review failed"),
            })

        return result  # { success, review: { summary, counts, sections, badges, score, xp, review_text } }

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in review endpoint: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred. Please try again.",
        )
