"""
Review Engine V2 — Structured JSON code review with gamification.
Uses Groq LLM; returns strict JSON; includes scoring + badges.
"""

import json
import re
import time
import logging
import uuid
from typing import Dict, Any, Optional, List

from services.groq_service import get_groq_service

logger = logging.getLogger(__name__)

# ── JSON schema sent inside the prompt ────────────────────────────
REVIEW_JSON_SCHEMA = """{
  "summary": ["bullet1", "bullet2", "...max 6 bullets"],
  "issues": {
    "critical": [{"title":"str","detail":"str","line":int_or_null,"suggestion":"str","category":"bugs|security|performance|best_practices"}],
    "high":     [... same shape ...],
    "medium":   [... same shape ...],
    "low":      [... same shape ...]
  }
}"""

ALLOWED_FOCUS = {"bugs", "security", "performance", "best_practices"}


# ── Scoring (no extra LLM call) ───────────────────────────────────
def _compute_scores(counts: Dict[str, int], issues: Dict) -> Dict[str, Any]:
    overall = max(0, min(100,
        100 - counts.get("critical", 0) * 15
            - counts.get("high", 0) * 8
            - counts.get("medium", 0) * 3
            - counts.get("low", 0) * 1
    ))

    # category sub-scores from issue categories
    cat_hits = {"security": 0, "performance": 0, "best_practices": 0, "bugs": 0}
    weights  = {"critical": 12, "high": 6, "medium": 2, "low": 1}
    for sev, items in issues.items():
        for item in items:
            cat = item.get("category", "bugs")
            if cat in cat_hits:
                cat_hits[cat] += weights.get(sev, 1)

    security       = max(0, 100 - cat_hits["security"] * 10)
    performance    = max(0, 100 - cat_hits["performance"] * 10)
    readability    = max(0, 100 - cat_hits["best_practices"] * 5)
    maintainability = max(0, 100 - cat_hits["bugs"] * 5)

    if overall >= 90:   grade = "A"
    elif overall >= 80: grade = "B"
    elif overall >= 70: grade = "C"
    elif overall >= 60: grade = "D"
    else:               grade = "F"

    return {
        "overall": overall,
        "security": security,
        "performance": performance,
        "readability": readability,
        "maintainability": maintainability,
        "grade": grade,
    }


def _compute_badges(counts, scores) -> List[str]:
    badges = []
    if counts.get("critical", 0) == 0 and scores["security"] >= 85:
        badges.append("🛡️ Security Sentinel")
    if scores["performance"] >= 85:
        badges.append("⚡ Performance Booster")
    if scores["readability"] >= 85:
        badges.append("✨ Clean Code Crafter")
    if scores["overall"] >= 90:
        badges.append("🏆 Elite Reviewer")
    if not badges:
        badges.append("🔍 Code Explorer")
    return badges


# ── Prompt builder ────────────────────────────────────────────────
def _build_prompt(code: str, language: str, focus_areas: List[str]) -> str:
    return f"""You are a world-class code reviewer. Analyze the following {language} code.

Focus on: {', '.join(focus_areas)}

Return ONLY valid JSON (no markdown, no explanation outside JSON).
The JSON MUST match this schema exactly:
{REVIEW_JSON_SCHEMA}

Rules:
- "line" must be an integer if you are confident, otherwise null. Never hallucinate line numbers.
- Keep each issue short and actionable (1-2 sentences for detail, 1 sentence for suggestion).
- Maximum 6 issues per severity level.
- Summary should be 3-6 concise bullet strings.
- category must be one of: bugs, security, performance, best_practices

Code to review:
```{language}
{code}
```

Respond with ONLY the JSON object, nothing else."""


# ── JSON extraction / repair ──────────────────────────────────────
def _extract_json(raw: str) -> Optional[Dict]:
    """Try to extract JSON from LLM output, stripping fences."""
    text = raw.strip()
    # strip markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _repair_json(raw: str, groq_service) -> Optional[Dict]:
    """One-shot repair: ask LLM to fix the JSON."""
    logger.warning("JSON parse failed; attempting repair call")
    try:
        completion = groq_service.client.chat.completions.create(
            model=groq_service.model,
            messages=[
                {"role": "system", "content": "Fix the following text so it is valid JSON matching the schema. Return ONLY valid JSON."},
                {"role": "user", "content": raw[:3000]}
            ],
            temperature=0.0,
            max_tokens=2000,
        )
        return _extract_json(completion.choices[0].message.content or "")
    except Exception as e:
        logger.error(f"Repair call failed: {e}")
        return None


# ── Public entry point ────────────────────────────────────────────
def run_review(code: str, language: str = "python",
               focus_areas: Optional[List[str]] = None,
               calculate_score: bool = True) -> Dict[str, Any]:
    """
    Run a structured code review.  Returns the full response dict
    ready to be sent to the frontend.
    """
    request_id = uuid.uuid4().hex[:8]
    t0 = time.time()
    logger.info(f"[{request_id}] Review request: {len(code)} chars, lang={language}")

    # ── validate ──
    if not code or not code.strip():
        return {"success": False, "error": "empty_code", "message": "Code cannot be empty."}

    if focus_areas is None:
        focus_areas = list(ALLOWED_FOCUS)
    else:
        focus_areas = [a for a in focus_areas if a in ALLOWED_FOCUS] or list(ALLOWED_FOCUS)

    groq_service = get_groq_service()
    prompt = _build_prompt(code, language, focus_areas)

    # ── LLM call ──
    try:
        completion = groq_service._make_api_call(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.25,
            max_tokens=2500,
            top_p=0.9,
        )
    except Exception as e:
        elapsed = time.time() - t0
        logger.error(f"[{request_id}] LLM call failed in {elapsed:.1f}s: {e}")
        err_type = "rate_limit" if "rate" in str(e).lower() else "api_error"
        return {"success": False, "error": err_type, "message": str(e)}

    raw = (completion.choices[0].message.content or "").strip() if completion and completion.choices else ""
    if not raw:
        logger.error(f"[{request_id}] Empty LLM response")
        return {"success": False, "error": "empty_response", "message": "AI returned empty response."}

    # ── Parse JSON ──
    parsed = _extract_json(raw)
    if parsed is None:
        parsed = _repair_json(raw, groq_service)
    if parsed is None:
        logger.error(f"[{request_id}] JSON parse failed after repair")
        return {"success": False, "error": "parse_error", "message": "Failed to parse AI response."}

    # ── Normalise ──
    issues = parsed.get("issues", parsed)  # handle flat or nested
    for sev in ("critical", "high", "medium", "low"):
        if sev not in issues:
            issues[sev] = []
        # ensure list of dicts
        issues[sev] = [
            i if isinstance(i, dict) else {"title": str(i), "detail": "", "line": None, "suggestion": "", "category": "bugs"}
            for i in issues[sev]
        ]

    counts = {sev: len(issues[sev]) for sev in ("critical", "high", "medium", "low")}

    summary_raw = parsed.get("summary", [])
    if isinstance(summary_raw, list):
        summary = summary_raw
    else:
        summary = [str(summary_raw)]

    # ── Scores & badges ──
    scores = _compute_scores(counts, issues) if calculate_score else None
    badges = _compute_badges(counts, scores) if scores else []
    xp = max(0, 100 - (scores["overall"] if scores else 100))

    # ── Build backward-compatible review_text (markdown) ──
    md_parts = []
    sev_labels = {"critical": "🔴 Critical", "high": "🟠 High", "medium": "🟡 Medium", "low": "🟢 Low"}
    for sev, label in sev_labels.items():
        if issues[sev]:
            md_parts.append(f"### {label} Issues")
            for item in issues[sev]:
                line_str = f" (line {item['line']})" if item.get('line') else ""
                md_parts.append(f"- **{item.get('title', 'Issue')}**{line_str}: {item.get('detail', '')}")
                if item.get("suggestion"):
                    md_parts.append(f"  - 💡 *{item['suggestion']}*")
    review_text = "\n".join(md_parts)

    # ── Build detailed quality_scores (top-level, for frontend) ──
    def _grade_for(val):
        if val >= 90: return "A"
        elif val >= 80: return "B"
        elif val >= 70: return "C"
        elif val >= 60: return "D"
        return "F"

    quality_scores = None
    if scores:
        sec_issues = sum(1 for sev in issues.values() for i in sev if i.get("category") == "security")
        perf_opts  = sum(1 for sev in issues.values() for i in sev if i.get("category") == "performance")
        quality_scores = {
            "overall_score": scores["overall"],
            "grade": scores["grade"],
            "tech_debt_hours": round((counts["critical"]*2 + counts["high"]*1 + counts["medium"]*0.5 + counts["low"]*0.1), 1),
            "categories": {
                "security":        {"score": scores["security"],        "grade": _grade_for(scores["security"]),        "issues": sec_issues},
                "performance":     {"score": scores["performance"],     "grade": _grade_for(scores["performance"]),     "optimizations_needed": perf_opts},
                "readability":     {"score": scores["readability"],     "grade": _grade_for(scores["readability"]),     "complexity": "Low" if scores["readability"] >= 80 else ("Medium" if scores["readability"] >= 50 else "High")},
                "maintainability": {"score": scores["maintainability"], "grade": _grade_for(scores["maintainability"]), "debt_hours": round(counts["critical"]*1.5 + counts["high"]*0.5, 1)},
            }
        }

    elapsed = time.time() - t0
    logger.info(f"[{request_id}] Review done in {elapsed:.1f}s — counts={counts}")

    return {
        "success": True,
        "quality_scores": quality_scores,
        "review": {
            "summary": summary,
            "counts": counts,
            "sections": issues,
            "badges": badges,
            "score": scores,
            "xp": xp,
            "review_text": review_text,
        },
    }
