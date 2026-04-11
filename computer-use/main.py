"""
Computer-Use AI Judging Agent — FastAPI orchestrator.

Evaluates a live website by:
1. Capturing screenshots at 3 viewports (Playwright)
2. Running a Lighthouse audit
3. Sending everything to Gemma 4 31B (NVIDIA API) for vision-based scoring
4. Returning structured scores + honesty delta
"""

import asyncio
import logging
import re
from ipaddress import ip_address
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
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
    version="0.1.0",
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

        # Must be http or https
        if parsed.scheme not in ("http", "https"):
            raise ValueError("URL must use http or https scheme")

        # Must have a hostname
        if not parsed.hostname:
            raise ValueError("URL must have a valid hostname")

        # Reject private/loopback IPs (SSRF protection)
        try:
            ip = ip_address(parsed.hostname)
            if ip.is_private or ip.is_loopback or ip.is_reserved:
                raise ValueError("URL must not point to a private or loopback address")
        except ValueError as exc:
            if "does not appear to be" not in str(exc):
                raise
            # Not an IP — it's a hostname, which is fine

        # Reject localhost variants
        if parsed.hostname in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
            raise ValueError("URL must not point to localhost")

        return v


class DimensionScoreResponse(BaseModel):
    score: int
    reasoning: str


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


# ── Endpoints ──────────────────────────────────────────────────────────

@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(req: EvaluateRequest):
    """Evaluate a live website and return AI-generated scores."""

    errors: list[str] = []

    # Run browser screenshots and Lighthouse audit in parallel
    logger.info("Starting browser + lighthouse agents for %s", req.live_url)

    browser_task = capture_screenshots(req.live_url)
    lighthouse_task = run_lighthouse(req.live_url)

    browser_result, lighthouse_result = await asyncio.gather(
        browser_task, lighthouse_task, return_exceptions=True
    )

    # Handle exceptions from gather
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

    # Prepare data for vision scorer
    screenshots_b64 = [
        {"viewport": s.viewport, "b64_image": s.b64_image}
        for s in browser_result.screenshots
        if s.b64_image  # skip failed screenshots
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

    # Run vision scoring (synchronous call, run in thread pool)
    logger.info("Starting vision scoring with %d screenshots", len(screenshots_b64))
    scorer_result = await asyncio.to_thread(
        score_website, screenshots_b64, lighthouse_scores
    )

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

    # Build breakdown
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
