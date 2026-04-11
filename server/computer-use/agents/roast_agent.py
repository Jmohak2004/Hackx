"""
Roast agent — generates funny / sarcastic commentary about a project
based on its evaluation scores, Lighthouse metrics, and code stats.

Uses NVIDIA-hosted LLM for creative text generation (not scoring).
Falls back to deterministic roasts if the API is unavailable.
"""

import logging
import os
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
MODEL = "meta/llama-3.3-70b-instruct"


@dataclass
class RoastResult:
    roasts: list[str] = field(default_factory=list)
    vibe: str = ""          # one-word vibe tag for GIF matching (e.g. "fire", "meh", "disaster")
    error: str | None = None


SYSTEM_PROMPT = """\
You are a brutally funny hackathon commentator who roasts (and occasionally praises) \
tech projects. Your style is a mix of a stand-up comedian and a senior dev doing code review. \
Keep it lighthearted — never mean-spirited or personal. Think of it as friendly trash talk.

Rules:
- Generate exactly 5 short comments (1-2 sentences each).
- At least 2 comments MUST be about the WEBSITE ITSELF — its name, tagline, what it does, \
the headings, the vibe of the product. Roast or praise the actual idea/product, not just numbers.
- The remaining comments should reference specific scores or metrics.
- Mix tones: some savage roasts, some genuine compliments, some sarcastic observations.
- Use modern internet humor, dev culture references, memes. Be creative.
- End with a one-word "vibe" tag that captures the overall energy of the project.
  Pick from: fire, solid, mid, sus, yikes, bruh, goated, cooked, clean, chaos

Respond in this EXACT format (no markdown, no numbering):
COMMENT: <comment 1>
COMMENT: <comment 2>
COMMENT: <comment 3>
COMMENT: <comment 4>
COMMENT: <comment 5>
VIBE: <one word>
"""


def _build_user_prompt(
    mode: str,
    ai_score: float,
    self_reported_score: float,
    honest: bool,
    page_title: str | None = None,
    meta_description: str | None = None,
    headings: list[str] | None = None,
    hero_text: str | None = None,
    live_url: str | None = None,
    lighthouse: dict[str, float] | None = None,
    live_breakdown: dict | None = None,
    code_breakdown: dict | None = None,
    live_score: float | None = None,
    code_score: float | None = None,
) -> str:
    parts = [f"Mode: {mode}", f"AI Score: {ai_score}/10", f"Self-Reported: {self_reported_score}/10"]

    # Website context
    if live_url:
        parts.append(f"URL: {live_url}")
    if page_title:
        parts.append(f"Page Title: {page_title}")
    if meta_description:
        parts.append(f"Meta Description: {meta_description}")
    if headings:
        parts.append(f"Page Headings: {', '.join(headings[:6])}")
    if hero_text:
        parts.append(f"Hero/Above-fold Text: {hero_text[:300]}")

    if not honest:
        parts.append(f"HONESTY CHECK FAILED — delta of {abs(ai_score - self_reported_score):.1f} points!")

    if lighthouse:
        parts.append("Lighthouse Scores:")
        for k, v in lighthouse.items():
            parts.append(f"  {k}: {v}/100")

    if live_breakdown:
        parts.append(f"Live URL Score: {live_score}/10")
        for k, dim in live_breakdown.items():
            parts.append(f"  {k}: {dim['score']}/{dim['max_score']}")

    if code_breakdown:
        parts.append(f"Code Score: {code_score}/10")
        for k, dim in code_breakdown.items():
            parts.append(f"  {k}: {dim['score']}/{dim['max_score']}")

    return "\n".join(parts)


def _parse_response(text: str) -> RoastResult:
    result = RoastResult()
    for line in text.strip().splitlines():
        line = line.strip()
        if line.upper().startswith("COMMENT:"):
            comment = line[len("COMMENT:"):].strip()
            if comment:
                result.roasts.append(comment)
        elif line.upper().startswith("VIBE:"):
            result.vibe = line[len("VIBE:"):].strip().lower()
    if not result.vibe:
        result.vibe = "mid"
    return result


def _fallback_roasts(
    ai_score: float,
    self_reported_score: float,
    honest: bool,
    lighthouse: dict[str, float] | None = None,
    code_score: float | None = None,
) -> RoastResult:
    """Deterministic fallback roasts when API is unavailable."""
    roasts = []

    # Score-based roasts
    if ai_score >= 9:
        roasts.append("This project is so good it made the evaluation script question its own existence.")
        vibe = "goated"
    elif ai_score >= 7:
        roasts.append("Solid work. Your parents would be proud. Your tech lead would say 'ship it'.")
        vibe = "solid"
    elif ai_score >= 5:
        roasts.append("It works. That's... that's about the highest compliment I can give right now.")
        vibe = "mid"
    elif ai_score >= 3:
        roasts.append("I've seen better projects from a 'Hello World' tutorial, but at least you shipped something.")
        vibe = "sus"
    else:
        roasts.append("This project needs a hug. And a rewrite. Mostly a rewrite.")
        vibe = "yikes"

    # Honesty roast
    if not honest:
        delta = abs(ai_score - self_reported_score)
        if self_reported_score > ai_score:
            roasts.append(f"You rated yourself {delta:.1f} points higher than reality. Confidence is not a Lighthouse metric.")
        else:
            roasts.append(f"Wait, you undersold yourself by {delta:.1f} points? Imposter syndrome is real.")

    # Lighthouse roasts
    if lighthouse:
        perf = lighthouse.get("performance", 0)
        a11y = lighthouse.get("accessibility", 0)
        seo = lighthouse.get("seo", 0)

        if perf < 50:
            roasts.append(f"Performance score of {perf}%. My grandma's dial-up loaded faster.")
        elif perf >= 95:
            roasts.append(f"Performance at {perf}%? This thing is faster than my excuses for not deploying on Friday.")

        if a11y < 70:
            roasts.append("Your accessibility score says 'we don't believe in screen readers here'.")
        elif a11y >= 95:
            roasts.append("Accessibility game is strong. Even the bots can navigate this thing.")

        if seo >= 95:
            roasts.append("SEO is immaculate. Google's crawlers are writing fan fiction about your meta tags.")
        elif seo < 60:
            roasts.append(f"SEO at {seo}%? Google doesn't even know you exist. You're in witness protection.")

    # Code roasts
    if code_score is not None:
        if code_score >= 8:
            roasts.append("The codebase is clean enough to eat off of. Who are you people?")
        elif code_score < 4:
            roasts.append("The code structure has more spaghetti than an Italian wedding.")

    # Pad to 5 if needed
    fillers = [
        "I've seen this exact stack on every hackathon since 2019. Innovation is dead.",
        "At least it didn't crash during evaluation. That's more than I can say for production.",
        "The real hack was making this work before the deadline.",
        "Built different. Not necessarily better, but different.",
        "This has 'we pivoted 3 times in 24 hours' energy.",
    ]
    while len(roasts) < 5:
        roasts.append(fillers[len(roasts) % len(fillers)])

    return RoastResult(roasts=roasts[:5], vibe=vibe)


async def generate_roast(
    mode: str,
    ai_score: float,
    self_reported_score: float,
    honest: bool,
    page_title: str | None = None,
    meta_description: str | None = None,
    headings: list[str] | None = None,
    hero_text: str | None = None,
    live_url: str | None = None,
    lighthouse: dict[str, float] | None = None,
    live_breakdown: dict | None = None,
    code_breakdown: dict | None = None,
    live_score: float | None = None,
    code_score: float | None = None,
) -> RoastResult:
    """Generate funny comments about the project. Uses LLM if available, falls back to canned roasts."""

    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        logger.info("No NVIDIA_API_KEY — using fallback roasts")
        return _fallback_roasts(ai_score, self_reported_score, honest, lighthouse, code_score)

    user_prompt = _build_user_prompt(
        mode=mode,
        ai_score=ai_score,
        self_reported_score=self_reported_score,
        honest=honest,
        page_title=page_title,
        meta_description=meta_description,
        headings=headings,
        hero_text=hero_text,
        live_url=live_url,
        lighthouse=lighthouse,
        live_breakdown=live_breakdown,
        code_breakdown=code_breakdown,
        live_score=live_score,
        code_score=code_score,
    )

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                NVIDIA_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": MODEL,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.9,
                    "max_tokens": 512,
                },
            )
            resp.raise_for_status()

        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        result = _parse_response(text)

        if len(result.roasts) < 3:
            logger.warning("LLM returned too few comments, using fallback")
            return _fallback_roasts(ai_score, self_reported_score, honest, lighthouse, code_score)

        return result

    except Exception as exc:
        logger.error("Roast agent failed: %s — using fallback", exc)
        return _fallback_roasts(ai_score, self_reported_score, honest, lighthouse, code_score)
