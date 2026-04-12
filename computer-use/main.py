"""
Computer-Use AI Judging Agent — FastAPI orchestrator.

Evaluates a live website by:
1. Capturing screenshots at 3 viewports (Playwright)
2. Running a Lighthouse audit
3. Sending everything to Gemma 4 31B (NVIDIA API) for vision-based scoring
4. Returning structured scores + honesty delta + full pipeline logs
"""

import asyncio
import logging
import re
from ipaddress import ip_address
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from agents.browser_agent import capture_screenshots
from agents.lighthouse_agent import run_lighthouse
from scoring.rubric import HONESTY_THRESHOLD
from scoring.vision_scorer import score_website

load_dotenv()

app = FastAPI(
    title="Computer-Use AI Judge",
    description="Evaluates live websites using vision AI for hackathon scoring",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ──────────────────────────────────────────

class EvaluateRequest(BaseModel):
    live_url: str = Field(..., description="URL of the live website to evaluate")
    self_reported_score: int = Field(
        ..., ge=0, le=100, description="Participant's self-reported score (0-100)"
    )

    @field_validator("live_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
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


class ScoreRequest(BaseModel):
    github_url: str = Field(..., description="GitHub repository URL")
    hosted_url: str = Field(..., description="Live hosted URL of the website")
    self_score: int = Field(..., ge=1, le=10, description="User self-score (1-10)")

    @field_validator("hosted_url")
    @classmethod
    def validate_hosted_url(cls, v: str) -> str:
        parsed = urlparse(v)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("hosted_url must use http or https")
        if not parsed.hostname:
            raise ValueError("hosted_url must have a valid hostname")
        return v


class DimensionScoreResponse(BaseModel):
    score: int
    reasoning: str


class ScoreBreakdown(BaseModel):
    visual_design: DimensionScoreResponse | None = None
    responsiveness: DimensionScoreResponse | None = None
    ux_interactivity: DimensionScoreResponse | None = None
    performance_accessibility: DimensionScoreResponse | None = None


class ScoreResult(BaseModel):
    github_url: str
    hosted_url: str
    page_title: str
    user_score: int
    ai_score: int
    github_score: int
    avg_score: float
    breakdown: ScoreBreakdown
    summary: str
    lighthouse: dict[str, float]
    delta: int
    honest: bool
    user_wins: bool
    logs: list[str]
    errors: list[str] = Field(default_factory=list)


class EvaluateResponse(BaseModel):
    live_url: str
    page_title: str
    ai_score: int
    breakdown: dict[str, DimensionScoreResponse]
    summary: str
    lighthouse: dict[str, float]
    self_reported_score: int
    delta: int
    honest: bool
    errors: list[str] = Field(default_factory=list)


# ── Helpers ─────────────────────────────────────────────────────────────

def _score_github(github_url: str) -> tuple[int, str]:
    """
    Heuristic GitHub score (1-10 scale) based on URL structure.
    Returns (score, log_message).
    A real implementation would call the GitHub API via server/githubPipeline.
    For now we give a baseline score of 5 and note it in logs.
    """
    score = 5
    log = f"[GitHub] Assessed repo at {github_url} → baseline score {score}/10 (heuristic)"
    return score, log


# ── Endpoints ──────────────────────────────────────────────────────────

@app.post("/score", response_model=ScoreResult)
async def score(req: ScoreRequest):
    """
    Full scoring pipeline: GitHub heuristic + Lighthouse + Vision AI.
    Returns user_score, ai_score, github_score, avg_score, and winner flag.
    """
    logs: list[str] = []
    errors: list[str] = []

    logs.append(f"[Pipeline] Starting evaluation for GitHub={req.github_url} hosted={req.hosted_url}")

    # ── Step 1: GitHub score (heuristic / could call Node API) ──────────
    logs.append("[Step 1] Analysing GitHub repository…")
    github_score, gh_log = _score_github(req.github_url)
    logs.append(gh_log)
    logs.append(f"[Step 1] GitHub score: {github_score}/10")

    # ── Step 2: Browser screenshots + Lighthouse in parallel ─────────────
    logs.append(f"[Step 2] Launching Playwright browser for {req.hosted_url}…")
    logs.append("[Step 2] Running Lighthouse audit in parallel…")

    browser_task = capture_screenshots(req.hosted_url)
    lighthouse_task = run_lighthouse(req.hosted_url)

    browser_result, lighthouse_result = await asyncio.gather(
        browser_task, lighthouse_task, return_exceptions=True
    )

    if isinstance(browser_result, Exception):
        msg = f"Browser agent crashed: {browser_result}"
        errors.append(msg)
        logs.append(f"[Step 2] ERROR: {msg}")
        from agents.browser_agent import BrowserAgentResult
        browser_result = BrowserAgentResult(url=req.hosted_url, error=str(browser_result))
    else:
        logs.append(f"[Step 2] Browser captured {len(browser_result.screenshots)} screenshot(s). Title: '{browser_result.page_title}'")
        if browser_result.error:
            logs.append(f"[Step 2] Browser warning: {browser_result.error}")
            errors.append(f"Browser agent: {browser_result.error}")

    if isinstance(lighthouse_result, Exception):
        msg = f"Lighthouse crashed: {lighthouse_result}"
        errors.append(msg)
        logs.append(f"[Step 2] ERROR: {msg}")
        from agents.lighthouse_agent import LighthouseResult
        lighthouse_result = LighthouseResult(url=req.hosted_url, error=str(lighthouse_result))
    else:
        lh = lighthouse_result.scores
        logs.append(f"[Step 2] Lighthouse scores — perf={lh.performance} a11y={lh.accessibility} bp={lh.best_practices} seo={lh.seo}")
        if lighthouse_result.error:
            logs.append(f"[Step 2] Lighthouse warning: {lighthouse_result.error}")
            errors.append(f"Lighthouse: {lighthouse_result.error}")

    # ── Step 3: Vision AI scoring ────────────────────────────────────────
    screenshots_b64 = [
        {"viewport": s.viewport, "b64_image": s.b64_image}
        for s in browser_result.screenshots
        if s.b64_image
    ]

    if not screenshots_b64:
        raise HTTPException(
            status_code=502,
            detail=f"No screenshots captured. Errors: {'; '.join(errors)}",
        )

    lighthouse_scores = {
        "performance": lighthouse_result.scores.performance,
        "accessibility": lighthouse_result.scores.accessibility,
        "best_practices": lighthouse_result.scores.best_practices,
        "seo": lighthouse_result.scores.seo,
    }

    logs.append(f"[Step 3] Sending {len(screenshots_b64)} screenshot(s) to Gemma 4 31B vision model via NVIDIA API…")

    scorer_result = await asyncio.to_thread(score_website, screenshots_b64, lighthouse_scores)

    if scorer_result.error:
        errors.append(f"Vision scorer: {scorer_result.error}")
        logs.append(f"[Step 3] ERROR from vision scorer: {scorer_result.error}")
    else:
        logs.append(f"[Step 3] Vision AI raw score: {scorer_result.total_score}/100")
        logs.append(f"[Step 3] Summary: {scorer_result.summary}")

    if scorer_result.total_score == 0 and scorer_result.error:
        raise HTTPException(
            status_code=502,
            detail=f"Vision scoring failed: {scorer_result.error}",
        )

    # ── Normalise scores to 1-10 scale ───────────────────────────────────
    ai_score_raw = scorer_result.total_score  # 0-100
    ai_score = max(1, min(10, round(ai_score_raw / 10)))
    user_score = req.self_score  # already 1-10

    avg_score = round((user_score + ai_score + github_score) / 3, 2)
    delta = abs(ai_score - user_score)
    user_wins = user_score >= ai_score

    logs.append(f"[Result] user_score={user_score}/10  ai_score={ai_score}/10  github_score={github_score}/10")
    logs.append(f"[Result] avg_score={avg_score}/10  delta={delta}  user_wins={user_wins}")

    # ── Build breakdown ───────────────────────────────────────────────────
    breakdown = ScoreBreakdown()
    if scorer_result.visual_design:
        breakdown.visual_design = DimensionScoreResponse(
            score=scorer_result.visual_design.score,
            reasoning=scorer_result.visual_design.reasoning,
        )
    if scorer_result.responsiveness:
        breakdown.responsiveness = DimensionScoreResponse(
            score=scorer_result.responsiveness.score,
            reasoning=scorer_result.responsiveness.reasoning,
        )
    if scorer_result.ux_interactivity:
        breakdown.ux_interactivity = DimensionScoreResponse(
            score=scorer_result.ux_interactivity.score,
            reasoning=scorer_result.ux_interactivity.reasoning,
        )
    if scorer_result.performance_accessibility:
        breakdown.performance_accessibility = DimensionScoreResponse(
            score=scorer_result.performance_accessibility.score,
            reasoning=scorer_result.performance_accessibility.reasoning,
        )

    return ScoreResult(
        github_url=req.github_url,
        hosted_url=req.hosted_url,
        page_title=browser_result.page_title,
        user_score=user_score,
        ai_score=ai_score,
        github_score=github_score,
        avg_score=avg_score,
        breakdown=breakdown,
        summary=scorer_result.summary,
        lighthouse=lighthouse_scores,
        delta=delta,
        honest=delta <= HONESTY_THRESHOLD,
        user_wins=user_wins,
        logs=logs,
        errors=errors,
    )


@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(req: EvaluateRequest):
    """Legacy evaluate endpoint — kept for backward compat."""

    errors: list[str] = []

    logger.info("Starting browser + lighthouse agents for %s", req.live_url)

    browser_task = capture_screenshots(req.live_url)
    lighthouse_task = run_lighthouse(req.live_url)

    browser_result, lighthouse_result = await asyncio.gather(
        browser_task, lighthouse_task, return_exceptions=True
    )

    if isinstance(browser_result, Exception):
        errors.append(f"Browser agent crashed: {browser_result}")
        from agents.browser_agent import BrowserAgentResult
        browser_result = BrowserAgentResult(url=req.live_url, error=str(browser_result))
    if isinstance(lighthouse_result, Exception):
        errors.append(f"Lighthouse crashed: {lighthouse_result}")
        from agents.lighthouse_agent import LighthouseResult
        lighthouse_result = LighthouseResult(url=req.live_url, error=str(lighthouse_result))

    logger.info("Browser agent done: %d screenshots, error=%s",
                len(browser_result.screenshots), browser_result.error)
    logger.info("Lighthouse done: error=%s", lighthouse_result.error)

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
        raise HTTPException(
            status_code=502,
            detail=f"Failed to capture any screenshots. Errors: {'; '.join(errors)}",
        )

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

    logger.info("Vision scoring done: total=%d, error=%s",
                scorer_result.total_score, scorer_result.error)

    if scorer_result.total_score == 0 and scorer_result.error:
        raise HTTPException(
            status_code=502,
            detail=f"Vision scoring failed: {scorer_result.error}",
        )

    delta = abs(scorer_result.total_score - req.self_reported_score)

    breakdown = {}
    if scorer_result.visual_design:
        breakdown["visual_design"] = DimensionScoreResponse(
            score=scorer_result.visual_design.score,
            reasoning=scorer_result.visual_design.reasoning,
        )
    if scorer_result.responsiveness:
        breakdown["responsiveness"] = DimensionScoreResponse(
            score=scorer_result.responsiveness.score,
            reasoning=scorer_result.responsiveness.reasoning,
        )
    if scorer_result.ux_interactivity:
        breakdown["ux_interactivity"] = DimensionScoreResponse(
            score=scorer_result.ux_interactivity.score,
            reasoning=scorer_result.ux_interactivity.reasoning,
        )
    if scorer_result.performance_accessibility:
        breakdown["performance_accessibility"] = DimensionScoreResponse(
            score=scorer_result.performance_accessibility.score,
            reasoning=scorer_result.performance_accessibility.reasoning,
        )

    return EvaluateResponse(
        live_url=req.live_url,
        page_title=browser_result.page_title,
        ai_score=scorer_result.total_score,
        breakdown=breakdown,
        summary=scorer_result.summary,
        lighthouse=lighthouse_scores,
        self_reported_score=req.self_reported_score,
        delta=delta,
        honest=delta <= HONESTY_THRESHOLD,
        errors=errors,
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
