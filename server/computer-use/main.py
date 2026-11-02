"""
Computer-Use AI Judging Agent — FastAPI orchestrator.

Unified scoring modes (0-10 scale, deterministic formulas):
  1. live_url only  → Lighthouse audit → formula score
  2. github_url only → knowledge-graph metrics → formula score
  3. both            → runs both pipelines, combines 50/50
"""

import asyncio
import hmac
import logging
import os
import time

from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, model_validator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from url_security import validate_url_syntax, normalize_github_url, ensure_public_url
from agents.browser_agent import capture_screenshots
from agents.code_agent import analyze_repo
from agents.lighthouse_agent import run_lighthouse
from agents.roast_agent import generate_roast
from scoring.code_scorer import score_codebase
from scoring.rubric import HONESTY_THRESHOLD
from scoring.vision_scorer import score_website

app = FastAPI(
    title="Computer-Use AI Judge",
    description="Deterministic hackathon scoring: live websites, GitHub repos, or both (0-10 scale)",
    version="0.3.0",
)


@app.middleware("http")
async def internal_auth(request, call_next):
    token = os.getenv("SCORING_API_TOKEN", "")
    if token and request.url.path != "/health":
        supplied = request.headers.get("authorization", "")
        if not hmac.compare_digest(supplied.encode(), ("Bearer " + token).encode()):
            return JSONResponse(status_code=401, content={"error": "Scoring service authentication required"})
    return await call_next(request)

default_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]
extra_cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOW_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(set(default_cors_origins + extra_cors_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LIVE_WEIGHT = 0.5
CODE_WEIGHT = 0.5


# ── Request / Response models ──────────────────────────────────────────

def _validate_live_url(value: str) -> str:
    return validate_url_syntax(value)


def _validate_github_url(value: str) -> str:
    return normalize_github_url(value)


class EvaluateRequest(BaseModel):
    strict: bool = False
    live_url: str | None = Field(None, description="URL of the live website to evaluate")
    github_url: str | None = Field(None, description="GitHub repository URL to evaluate")
    self_reported_score: float = Field(
        ..., ge=0, le=10, description="Participant's self-reported score (0-10)"
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
        return _validate_github_url(v)


class ScoreRequest(BaseModel):
    strict: bool = True
    github_url: str = Field(..., description="GitHub repository URL")
    hosted_url: str | None = Field(None, description="Optional hosted URL")
    self_score: float = Field(..., ge=0, le=10, description="User self-score (0-10)")

    @field_validator("github_url")
    @classmethod
    def validate_score_github_url(cls, v: str) -> str:
        return _validate_github_url(v)

    @field_validator("hosted_url")
    @classmethod
    def validate_hosted_url(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        return _validate_live_url(v)


class ValidateUrlRequest(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def validate(cls, value):
        return validate_url_syntax(value)


class DimensionScoreResponse(BaseModel):
    score: float
    max_score: float


class EvaluateResponse(BaseModel):
    rubric_version: str = "hackx-deterministic-v1"
    degraded: bool = False
    repo_id: str | None = None
    commit_sha: str | None = None
    mode: str  # "live_url" | "github" | "combined"
    live_url: str | None = None
    github_url: str | None = None
    page_title: str | None = None
    ai_score: float
    live_score: float | None = None
    code_score: float | None = None
    live_breakdown: dict[str, DimensionScoreResponse] | None = None
    code_breakdown: dict[str, DimensionScoreResponse] | None = None
    lighthouse: dict[str, float] | None = None
    self_reported_score: float
    delta: float
    honest: bool
    roasts: list[str] = Field(default_factory=list)
    vibe: str = ""
    errors: list[str] = Field(default_factory=list)


class LegacyDimensionScoreResponse(BaseModel):
    score: float
    reasoning: str


class ScoreResponse(BaseModel):
    rubric_version: str = "hackx-deterministic-v1"
    degraded: bool = False
    mode: str = ""
    repo_id: str | None = None
    commit_sha: str | None = None
    roasts: list[str] = Field(default_factory=list)
    vibe: str = ""
    github_url: str
    hosted_url: str
    page_title: str = ""
    user_score: float
    ai_score: float
    github_score: float
    avg_score: float
    breakdown: dict[str, LegacyDimensionScoreResponse] = Field(default_factory=dict)
    summary: str = ""
    lighthouse: dict[str, float] = Field(default_factory=dict)
    delta: float
    honest: bool
    user_wins: bool
    logs: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


# ── Live URL scoring pipeline ─────────────────────────────────────────

async def _score_live_url(url: str, errors: list[str]):
    logger.info("Starting live URL pipeline for %s", url)
    t0 = time.time()

    browser_result, lighthouse_result = await asyncio.gather(
        asyncio.wait_for(capture_screenshots(url), timeout=120),
        run_lighthouse(url),
        return_exceptions=True,
    )
    logger.info("⏱ Browser + Lighthouse (parallel): %.1fs", time.time() - t0)

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
        return None
    if lighthouse_result.error:
        errors.append(f"Lighthouse: {lighthouse_result.error}")
        return None

    lighthouse_scores = {
        "performance": lighthouse_result.scores.performance,
        "accessibility": lighthouse_result.scores.accessibility,
        "best_practices": lighthouse_result.scores.best_practices,
        "seo": lighthouse_result.scores.seo,
    }

    # Deterministic scoring — no LLM, instant
    scorer_result = score_website(lighthouse_scores)

    if scorer_result.error:
        errors.append(f"Live scorer: {scorer_result.error}")
        return None

    breakdown = {
        "performance": DimensionScoreResponse(score=scorer_result.performance, max_score=2.5),
        "accessibility": DimensionScoreResponse(score=scorer_result.accessibility, max_score=2.5),
        "best_practices": DimensionScoreResponse(score=scorer_result.best_practices, max_score=2.5),
        "seo": DimensionScoreResponse(score=scorer_result.seo, max_score=2.5),
    }

    return {
        "score": scorer_result.total_score,
        "breakdown": breakdown,
        "lighthouse": lighthouse_scores,
        "page_title": browser_result.page_title,
        "meta_description": browser_result.meta_description,
        "headings": browser_result.headings,
        "hero_text": browser_result.hero_text,
    }


# ── GitHub code scoring pipeline ──────────────────────────────────────

async def _score_github(github_url: str, errors: list[str]):
    logger.info("Starting code pipeline for %s", github_url)

    repo_result = await analyze_repo(github_url)
    if repo_result.error:
        errors.append(f"Code agent: {repo_result.error}")
        return None

    stats = repo_result.stats
    logger.info("Graph analysis done: %s — %d files, %d functions",
                repo_result.repo_id, stats.files_created, stats.functions_created)

    # Deterministic scoring — no LLM, instant
    code_result = score_codebase(
        files=stats.files_created,
        functions=stats.functions_created,
        classes=stats.classes_created,
        imports=stats.imports_created,
        endpoints=stats.endpoints_created,
        calls_edges=stats.calls_edges,
    )

    if code_result.error:
        errors.append(f"Code scorer: {code_result.error}")
        return None

    breakdown = {
        "project_scale": DimensionScoreResponse(score=code_result.project_scale, max_score=3.0),
        "code_organization": DimensionScoreResponse(score=code_result.code_organization, max_score=2.5),
        "architecture": DimensionScoreResponse(score=code_result.architecture, max_score=2.5),
        "connectivity": DimensionScoreResponse(score=code_result.connectivity, max_score=2.0),
    }

    return {
        "score": code_result.total_score,
        "breakdown": breakdown,
        "repo_id": repo_result.repo_id,
        "commit_sha": repo_result.metadata.commit_sha,
    }


# ── Endpoints ──────────────────────────────────────────────────────────

@app.post("/score", response_model=ScoreResponse)
async def score(req: ScoreRequest):
    logs = [
        f"[Pipeline] Starting evaluation for GitHub={req.github_url} hosted={req.hosted_url or '(none)'}",
        "[Pipeline] Delegating to deterministic evaluator",
    ]

    result = await evaluate(
        EvaluateRequest(
            live_url=req.hosted_url,
            github_url=req.github_url,
            self_reported_score=req.self_score,
            strict=req.strict,
        )
    )

    github_score = round(result.code_score or 0.0, 1)
    avg_score = result.ai_score
    user_wins = result.honest

    logs.append(
        f"[Result] user_score={req.self_score}/10 ai_score={result.ai_score}/10 github_score={github_score}/10"
    )
    logs.append(f"[Result] avg_score={avg_score}/10 user_wins={user_wins}")

    return ScoreResponse(
        rubric_version=result.rubric_version,
        degraded=result.degraded,
        mode=result.mode,
        repo_id=result.repo_id,
        commit_sha=result.commit_sha,
        roasts=result.roasts,
        vibe=result.vibe,
        github_url=req.github_url,
        hosted_url=req.hosted_url or "",
        page_title=result.page_title or "",
        user_score=req.self_score,
        ai_score=result.ai_score,
        github_score=github_score,
        avg_score=avg_score,
        breakdown={
            key: LegacyDimensionScoreResponse(
                score=dimension.score,
                reasoning=f"{key.replace('_', ' ')}: {dimension.score}/{dimension.max_score}",
            )
            for key, dimension in (result.live_breakdown or result.code_breakdown or {}).items()
        },
        summary=f"Deterministic {result.mode} scoring completed.",
        lighthouse=result.lighthouse or {},
        delta=result.delta,
        honest=result.honest,
        user_wins=user_wins,
        logs=logs,
        errors=result.errors,
    )

@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(req: EvaluateRequest):
    t_start = time.time()
    errors: list[str] = []

    has_live = bool(req.live_url)
    has_github = bool(req.github_url)

    live_result = None
    code_result = None

    t_pipeline = time.time()
    if has_live and has_github:
        live_result, code_result = await asyncio.gather(
            _score_live_url(req.live_url, errors),
            _score_github(req.github_url, errors),
        )
    elif has_live:
        live_result = await _score_live_url(req.live_url, errors)
    else:
        code_result = await _score_github(req.github_url, errors)
    logger.info("⏱ Scoring pipeline: %.1fs", time.time() - t_pipeline)

    if req.strict and ((has_live and not live_result) or (has_github and not code_result)):
        raise HTTPException(
            status_code=502,
            detail="A required evaluation pipeline failed. No score was verified. " + "; ".join(errors),
        )

    if has_live and has_github:
        mode = "combined"
        if live_result and code_result:
            ai_score = round(live_result["score"] * LIVE_WEIGHT + code_result["score"] * CODE_WEIGHT, 1)
        elif live_result:
            ai_score = live_result["score"]
            errors.append("Code scoring failed — using live URL score only")
        elif code_result:
            ai_score = code_result["score"]
            errors.append("Live URL scoring failed — using code score only")
        else:
            raise HTTPException(status_code=502, detail=f"Both pipelines failed. Errors: {'; '.join(errors)}")
    elif has_live:
        mode = "live_url"
        if not live_result:
            raise HTTPException(status_code=502, detail=f"Live URL scoring failed. Errors: {'; '.join(errors)}")
        ai_score = live_result["score"]
    else:
        mode = "github"
        if not code_result:
            raise HTTPException(status_code=502, detail=f"Code scoring failed. Errors: {'; '.join(errors)}")
        ai_score = code_result["score"]

    delta = round(abs(ai_score - req.self_reported_score), 1)
    honest = delta <= HONESTY_THRESHOLD

    # Generate funny commentary (non-blocking, best-effort)
    t_roast = time.time()
    roast_result = await generate_roast(
        mode=mode,
        ai_score=ai_score,
        self_reported_score=req.self_reported_score,
        honest=honest,
        page_title=live_result["page_title"] if live_result else None,
        meta_description=live_result.get("meta_description") if live_result else None,
        headings=live_result.get("headings") if live_result else None,
        hero_text=live_result.get("hero_text") if live_result else None,
        live_url=req.live_url,
        lighthouse=live_result["lighthouse"] if live_result else None,
        live_breakdown={k: {"score": v.score, "max_score": v.max_score} for k, v in live_result["breakdown"].items()} if live_result else None,
        code_breakdown={k: {"score": v.score, "max_score": v.max_score} for k, v in code_result["breakdown"].items()} if code_result else None,
        live_score=live_result["score"] if live_result else None,
        code_score=code_result["score"] if code_result else None,
    )
    logger.info("⏱ Roast generation: %.1fs", time.time() - t_roast)
    logger.info("⏱ Total request: %.1fs", time.time() - t_start)

    return EvaluateResponse(
        degraded=(has_live and not live_result) or (has_github and not code_result),
        repo_id=code_result.get("repo_id") if code_result else None,
        commit_sha=code_result.get("commit_sha") if code_result else None,
        mode=mode,
        live_url=req.live_url,
        github_url=req.github_url,
        page_title=live_result["page_title"] if live_result else None,
        ai_score=ai_score,
        live_score=live_result["score"] if live_result else None,
        code_score=code_result["score"] if code_result else None,
        live_breakdown=live_result["breakdown"] if live_result else None,
        code_breakdown=code_result["breakdown"] if code_result else None,
        lighthouse=live_result["lighthouse"] if live_result else None,
        self_reported_score=req.self_reported_score,
        delta=delta,
        honest=honest,
        roasts=roast_result.roasts,
        vibe=roast_result.vibe,
        errors=errors,
    )


@app.post("/validate-url")
async def validate_url(req: ValidateUrlRequest):
    try:
        return {"url": await ensure_public_url(req.url)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="The submitted website could not be reached") from exc


@app.get("/health")
async def health():
    import shutil
    from pathlib import Path
    from playwright.async_api import async_playwright
    async with async_playwright() as playwright:
        chromium = Path(os.getenv("CHROME_PATH") or playwright.chromium.executable_path).exists()
    lighthouse = (Path(__file__).resolve().parent.parent / "node_modules/lighthouse/cli/index.js").exists()
    ready = chromium and lighthouse and bool(shutil.which("node"))
    return JSONResponse(status_code=200 if ready else 503, content={
        "status": "ok" if ready else "missing_dependencies",
        "chromium": chromium, "lighthouse": lighthouse, "rubricVersion": "hackx-deterministic-v1",
    })
