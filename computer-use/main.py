"""
Computer-Use AI Judging Agent — FastAPI orchestrator.

Unified scoring modes:
  1. live_url only  → screenshots + Lighthouse + vision scoring
  2. github_url only → knowledge-graph analysis + code scoring
  3. both            → runs both pipelines, combines 50/50
"""

import asyncio
import logging
import re
from ipaddress import ip_address
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from agents.browser_agent import capture_screenshots
from agents.code_agent import analyze_repo
from agents.lighthouse_agent import run_lighthouse
from scoring.code_scorer import score_codebase
from scoring.rubric import HONESTY_THRESHOLD
from scoring.vision_scorer import score_website

load_dotenv()

app = FastAPI(
    title="Computer-Use AI Judge",
    description="Unified hackathon scoring: live websites, GitHub repos, or both",
    version="0.2.0",
)

# Weight each pipeline when both inputs are provided
LIVE_WEIGHT = 0.5
CODE_WEIGHT = 0.5


# ── Request / Response models ──────────────────────────────────────────

def _validate_live_url(v: str) -> str:
    """Validate a live URL (SSRF protection)."""
    parsed = urlparse(v)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("URL must use http or https scheme")
    if not parsed.hostname:
        raise ValueError("URL must have a valid hostname")
    try:
        ip = ip_address(parsed.hostname)
        if ip.is_private or ip.is_loopback or ip.is_reserved:
            raise ValueError("URL must not point to a private or loopback address")
    except ValueError as exc:
        if "does not appear to be" not in str(exc):
            raise
    if parsed.hostname in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        raise ValueError("URL must not point to localhost")
    return v


class EvaluateRequest(BaseModel):
    live_url: str | None = Field(None, description="URL of the live website to evaluate")
    github_url: str | None = Field(None, description="GitHub repository URL to evaluate")
    self_reported_score: int = Field(
        ..., ge=0, le=100, description="Participant's self-reported score (0-100)"
    )

    @model_validator(mode="after")
    def at_least_one_url(self):
        if not self.live_url and not self.github_url:
            raise ValueError("At least one of live_url or github_url must be provided")
        return self

    @field_validator("live_url")
    @classmethod
    def validate_live_url(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _validate_live_url(v)

    @field_validator("github_url")
    @classmethod
    def validate_github_url(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip().rstrip("/")
        pattern = re.compile(r"^https?://github\.com/[\w.\-]+/[\w.\-]+/?$")
        if not pattern.match(v):
            raise ValueError("Invalid GitHub URL. Expected: https://github.com/owner/repo")
        return v


class DimensionScoreResponse(BaseModel):
    score: int
    reasoning: str


class EvaluateResponse(BaseModel):
    mode: str  # "live_url" | "github" | "combined"
    live_url: str | None = None
    github_url: str | None = None
    page_title: str | None = None
    ai_score: int
    live_score: int | None = None
    code_score: int | None = None
    live_breakdown: dict[str, DimensionScoreResponse] | None = None
    code_breakdown: dict[str, DimensionScoreResponse] | None = None
    summary: str
    lighthouse: dict[str, float] | None = None
    self_reported_score: int
    delta: int
    honest: bool
    errors: list[str] = Field(default_factory=list)


# ── Live URL scoring pipeline ─────────────────────────────────────────

async def _score_live_url(url: str, errors: list[str]):
    """Run browser + lighthouse + vision scoring. Returns (score, breakdown, summary, lighthouse, page_title)."""
    logger.info("Starting live URL pipeline for %s", url)

    browser_result, lighthouse_result = await asyncio.gather(
        capture_screenshots(url),
        run_lighthouse(url),
        return_exceptions=True,
    )

    if isinstance(browser_result, Exception):
        errors.append(f"Browser agent crashed: {browser_result}")
        from agents.browser_agent import BrowserAgentResult
        browser_result = BrowserAgentResult(url=url, error=str(browser_result))
    if isinstance(lighthouse_result, Exception):
        errors.append(f"Lighthouse crashed: {lighthouse_result}")
        from agents.lighthouse_agent import LighthouseResult
        lighthouse_result = LighthouseResult(url=url, error=str(lighthouse_result))

    if browser_result.error:
        errors.append(f"Browser agent: {browser_result.error}")
    if lighthouse_result.error:
        errors.append(f"Lighthouse: {lighthouse_result.error}")

    screenshots_b64 = [
        {"viewport": s.viewport, "b64_image": s.b64_image}
        for s in browser_result.screenshots
        if s.b64_image
    ]
    if not screenshots_b64:
        return None  # fatal — no screenshots

    lighthouse_scores = {
        "performance": lighthouse_result.scores.performance,
        "accessibility": lighthouse_result.scores.accessibility,
        "best_practices": lighthouse_result.scores.best_practices,
        "seo": lighthouse_result.scores.seo,
    }

    logger.info("Starting vision scoring with %d screenshots", len(screenshots_b64))
    scorer_result = await asyncio.to_thread(score_website, screenshots_b64, lighthouse_scores)

    if scorer_result.error:
        errors.append(f"Vision scorer: {scorer_result.error}")

    if scorer_result.total_score == 0 and scorer_result.error:
        return None

    breakdown = {}
    for key in ("visual_design", "responsiveness", "ux_interactivity", "performance_accessibility"):
        dim = getattr(scorer_result, key, None)
        if dim:
            breakdown[key] = DimensionScoreResponse(score=dim.score, reasoning=dim.reasoning)

    return {
        "score": scorer_result.total_score,
        "breakdown": breakdown,
        "summary": scorer_result.summary,
        "lighthouse": lighthouse_scores,
        "page_title": browser_result.page_title,
    }


# ── GitHub code scoring pipeline ──────────────────────────────────────

async def _score_github(github_url: str, errors: list[str]):
    """Run knowledge-graph analysis + code scoring. Returns (score, breakdown, summary)."""
    logger.info("Starting code pipeline for %s", github_url)

    repo_result = await analyze_repo(github_url)
    if repo_result.error:
        errors.append(f"Code agent: {repo_result.error}")
        return None

    logger.info("Graph analysis done: %s — %d files, %d functions",
                repo_result.repo_id, repo_result.stats.files_created,
                repo_result.stats.functions_created)

    code_result = await asyncio.to_thread(score_codebase, repo_result.graph_summary)
    if code_result.error:
        errors.append(f"Code scorer: {code_result.error}")

    if code_result.total_score == 0 and code_result.error:
        return None

    breakdown = {}
    for key in ("code_structure", "code_quality", "architecture", "completeness"):
        dim = getattr(code_result, key, None)
        if dim:
            breakdown[key] = DimensionScoreResponse(score=dim.score, reasoning=dim.reasoning)

    return {
        "score": code_result.total_score,
        "breakdown": breakdown,
        "summary": code_result.summary,
    }


# ── Endpoints ──────────────────────────────────────────────────────────

@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(req: EvaluateRequest):
    """Unified evaluation endpoint — handles live URL, GitHub repo, or both."""
    errors: list[str] = []

    has_live = bool(req.live_url)
    has_github = bool(req.github_url)

    live_result = None
    code_result = None

    # Run whichever pipelines are needed (in parallel if both)
    if has_live and has_github:
        live_result, code_result = await asyncio.gather(
            _score_live_url(req.live_url, errors),
            _score_github(req.github_url, errors),
        )
    elif has_live:
        live_result = await _score_live_url(req.live_url, errors)
    else:
        code_result = await _score_github(req.github_url, errors)

    # Determine mode and compute final score
    if has_live and has_github:
        mode = "combined"
        if live_result and code_result:
            ai_score = round(live_result["score"] * LIVE_WEIGHT + code_result["score"] * CODE_WEIGHT)
            summary = (
                f"Combined score ({int(LIVE_WEIGHT*100)}% live + {int(CODE_WEIGHT*100)}% code). "
                f"Live: {live_result['summary']} Code: {code_result['summary']}"
            )
        elif live_result:
            ai_score = live_result["score"]
            summary = f"Only live URL scored (code pipeline failed). {live_result['summary']}"
            errors.append("Code scoring failed — using live URL score only")
        elif code_result:
            ai_score = code_result["score"]
            summary = f"Only code scored (live URL pipeline failed). {code_result['summary']}"
            errors.append("Live URL scoring failed — using code score only")
        else:
            raise HTTPException(status_code=502, detail=f"Both pipelines failed. Errors: {'; '.join(errors)}")
    elif has_live:
        mode = "live_url"
        if not live_result:
            raise HTTPException(status_code=502, detail=f"Live URL scoring failed. Errors: {'; '.join(errors)}")
        ai_score = live_result["score"]
        summary = live_result["summary"]
    else:
        mode = "github"
        if not code_result:
            raise HTTPException(status_code=502, detail=f"Code scoring failed. Errors: {'; '.join(errors)}")
        ai_score = code_result["score"]
        summary = code_result["summary"]

    delta = abs(ai_score - req.self_reported_score)

    return EvaluateResponse(
        mode=mode,
        live_url=req.live_url,
        github_url=req.github_url,
        page_title=live_result["page_title"] if live_result else None,
        ai_score=ai_score,
        live_score=live_result["score"] if live_result else None,
        code_score=code_result["score"] if code_result else None,
        live_breakdown=live_result["breakdown"] if live_result else None,
        code_breakdown=code_result["breakdown"] if code_result else None,
        summary=summary,
        lighthouse=live_result["lighthouse"] if live_result else None,
        self_reported_score=req.self_reported_score,
        delta=delta,
        honest=delta <= HONESTY_THRESHOLD,
        errors=errors,
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
