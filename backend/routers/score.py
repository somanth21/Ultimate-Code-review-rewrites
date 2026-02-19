"""
/api/score — Standalone Code Score endpoint.
Strict LLM-based evaluation returning numeric metrics + reasoning.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import json
import logging
import traceback

from services.groq_service import get_groq_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["score"])


class ScoreRequest(BaseModel):
    code: str
    language: str = "python"


@router.post("/score")
async def evaluate_score(request: ScoreRequest):
    print("DEBUG: Entered /api/score")
    try:
        if not request.code or not request.code.strip():
            raise HTTPException(status_code=400, detail="Code cannot be empty")

        service = get_groq_service()

        system_prompt = f"""You are a strict senior software engineer and technical interviewer.

Your job is to critically evaluate the following {request.language} code.

IMPORTANT RULES:
1. NEVER give 100% unless the code is PERFECT.
2. If there is ANY syntax error → deduct heavily.
3. If there is ANY logical error → deduct heavily.
4. If edge cases are not handled → deduct marks.
5. If code is incomplete → score below 50%.
6. If code would fail compilation or execution → score below 40%.
7. Do NOT be polite. Be honest and strict.
8. Be extremely critical like a real technical interviewer.

Evaluate based on:
- Syntax correctness (30%)
- Logic correctness (30%)
- Edge case handling (20%)
- Code quality & readability (10%)
- Efficiency (10%)

Return output as a single valid JSON object. Do not wrap in markdown code blocks.
Do not add explanations outside the JSON.
{{
  "performance_score": number,
  "security_score": number,
  "readability_score": number,
  "maintainability_score": number,
  "overall_score": number,
  "time_complexity": "string",
  "space_complexity": "string",
  "reasoning_summary": "string"
}}

For reasoning_summary use this format (use \\n for newlines):
FINAL SCORE: X/100

DETAILED BREAKDOWN:
Syntax: X/30
Logic: X/30
Edge Cases: X/20
Readability: X/10
Efficiency: X/10

REASONS FOR DEDUCTIONS:
- [point 1]
- [point 2]

Programming Language: {request.language}
Code: {request.code}
"""
        completion = service.client.chat.completions.create(
            messages=[{"role": "user", "content": system_prompt}],
            model=service.model,
            temperature=0.2,
            max_tokens=1000,
            top_p=0.85,
        )

        response_text = completion.choices[0].message.content
        print(f"DEBUG: Score LLM Response: {response_text}")

        score_data = None
        try:
            score_data = json.loads(response_text)
        except json.JSONDecodeError:
            try:
                start_idx = response_text.find('{')
                end_idx = response_text.rfind('}')
                if start_idx != -1 and end_idx != -1:
                    json_str = response_text[start_idx:end_idx + 1]
                    score_data = json.loads(json_str)
            except Exception:
                pass

        if not score_data:
            print(f"DEBUG: Failed to parse JSON. Raw: {response_text}")
            raise ValueError("Failed to parse JSON response from LLM")

        required_keys = [
            "performance_score", "security_score", "readability_score",
            "maintainability_score", "overall_score", "time_complexity",
            "space_complexity", "reasoning_summary"
        ]
        for key in required_keys:
            if key not in score_data:
                score_data[key] = "N/A" if "complexity" in key or "summary" in key else 0

        logger.info(f"Score endpoint returning: overall={score_data.get('overall_score')}")
        return JSONResponse(content=score_data)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        error_msg = str(e)
        if "rate_limit_exceeded" in error_msg.lower():
            return JSONResponse(status_code=429, content={"detail": "Rate Limit Exceeded. Try again later."})
        return JSONResponse(status_code=500, content={"detail": f"Internal Server Error: {error_msg}"})
