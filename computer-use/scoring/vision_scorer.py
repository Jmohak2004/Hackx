"""
Vision scorer — sends screenshots + Lighthouse data to Gemma 4 31B
via the NVIDIA API and parses the structured scoring response.

Scores are cached on disk keyed by SHA-256(url) so the same URL
always returns identical results across runs.
"""

import hashlib
import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import requests

from scoring.rubric import SYSTEM_PROMPT, build_user_message

NVIDIA_INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
MODEL = "google/gemma-4-31b-it"

_CACHE_DIR = Path(__file__).parent.parent / "score-cache"
_CACHE_DIR.mkdir(exist_ok=True)


def _cache_key(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:16]


def _load_cache(url: str) -> dict | None:
    path = _CACHE_DIR / f"{_cache_key(url)}.json"
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            pass
    return None


def _save_cache(url: str, data: dict) -> None:
    path = _CACHE_DIR / f"{_cache_key(url)}.json"
    try:
        path.write_text(json.dumps(data, indent=2))
    except Exception:
        pass


@dataclass
class DimensionScore:
    score: int
    reasoning: str


@dataclass
class VisionScorerResult:
    visual_design: DimensionScore | None = None
    responsiveness: DimensionScore | None = None
    ux_interactivity: DimensionScore | None = None
    performance_accessibility: DimensionScore | None = None
    total_score: int = 0
    summary: str = ""
    raw_response: str = ""
    error: str | None = None


def score_website(
    screenshots_b64: list[dict],  # [{"viewport": str, "b64_image": str}, ...]
    lighthouse_scores: dict,
    url: str = "",
) -> VisionScorerResult:
    """
    Call Gemma 4 31B via NVIDIA API with screenshots and Lighthouse data.
    Results are cached by URL so the same site always scores identically.
    """
    result = VisionScorerResult()

    # ── Cache hit: return stored result immediately ───────────────────────
    if url:
        cached = _load_cache(url)
        if cached:
            result.raw_response = "[from cache]"
            def _ci(v, lo, hi): return max(lo, min(hi, int(round(float(v)))))
            result.visual_design = DimensionScore(
                score=_ci(cached["visual_design"]["score"], 0, 30),
                reasoning=cached["visual_design"]["reasoning"],
            )
            result.responsiveness = DimensionScore(
                score=_ci(cached["responsiveness"]["score"], 0, 25),
                reasoning=cached["responsiveness"]["reasoning"],
            )
            result.ux_interactivity = DimensionScore(
                score=_ci(cached["ux_interactivity"]["score"], 0, 25),
                reasoning=cached["ux_interactivity"]["reasoning"],
            )
            result.performance_accessibility = DimensionScore(
                score=_ci(cached["performance_accessibility"]["score"], 0, 20),
                reasoning=cached["performance_accessibility"]["reasoning"],
            )
            result.summary = cached.get("summary", "")
            result.total_score = (
                result.visual_design.score + result.responsiveness.score
                + result.ux_interactivity.score + result.performance_accessibility.score
            )
            return result

    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        result.error = "NVIDIA_API_KEY environment variable not set"
        return result

    # Build multimodal content: text + images
    user_content: list[dict] = []

    # Add text context with Lighthouse scores
    user_content.append({
        "type": "text",
        "text": build_user_message(lighthouse_scores),
    })

    # Add screenshot images
    for shot in screenshots_b64:
        if shot.get("b64_image"):
            user_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{shot['b64_image']}",
                },
            })

    if len(user_content) < 2:
        result.error = "No valid screenshots to send to vision model"
        return result

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": 512,
        "temperature": 0.0,
        "top_p": 1.0,
        "seed": 42,
        "stream": False,
    }

    try:
        resp = requests.post(
            NVIDIA_INVOKE_URL,
            headers=headers,
            json=payload,
            timeout=120,
        )
        resp.raise_for_status()

        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        result.raw_response = content

        # Parse JSON from response (handle possible markdown fences)
        parsed = _extract_json(content)
        if parsed is None:
            result.error = f"Failed to parse JSON from model response"
            return result

        def _clamp_int(val, lo: int, hi: int) -> int:
            """Convert val to int and clamp to [lo, hi]. Prevents hallucinated floats/OOB."""
            return max(lo, min(hi, int(round(float(val)))))

        result.visual_design = DimensionScore(
            score=_clamp_int(parsed["visual_design"]["score"], 0, 30),
            reasoning=str(parsed["visual_design"]["reasoning"])[:300],
        )
        result.responsiveness = DimensionScore(
            score=_clamp_int(parsed["responsiveness"]["score"], 0, 25),
            reasoning=str(parsed["responsiveness"]["reasoning"])[:300],
        )
        result.ux_interactivity = DimensionScore(
            score=_clamp_int(parsed["ux_interactivity"]["score"], 0, 25),
            reasoning=str(parsed["ux_interactivity"]["reasoning"])[:300],
        )
        result.performance_accessibility = DimensionScore(
            score=_clamp_int(parsed["performance_accessibility"]["score"], 0, 20),
            reasoning=str(parsed["performance_accessibility"]["reasoning"])[:300],
        )
        result.summary = str(parsed.get("summary", ""))[:500]

        # Always recompute total from clamped dimension scores — never trust model's total
        result.total_score = (
            result.visual_design.score
            + result.responsiveness.score
            + result.ux_interactivity.score
            + result.performance_accessibility.score
        )

        # ── Cache the result for this URL ────────────────────────────────
        if url:
            _save_cache(url, {
                "visual_design": {"score": result.visual_design.score, "reasoning": result.visual_design.reasoning},
                "responsiveness": {"score": result.responsiveness.score, "reasoning": result.responsiveness.reasoning},
                "ux_interactivity": {"score": result.ux_interactivity.score, "reasoning": result.ux_interactivity.reasoning},
                "performance_accessibility": {"score": result.performance_accessibility.score, "reasoning": result.performance_accessibility.reasoning},
                "summary": result.summary,
            })

    except requests.HTTPError as exc:
        result.error = f"NVIDIA API error: {exc.response.status_code} — {exc.response.text[:500]}"
    except (KeyError, ValueError, TypeError) as exc:
        result.error = f"Failed to parse scoring response: {exc}"
    except requests.Timeout:
        result.error = "NVIDIA API request timed out after 120 seconds"
    except Exception as exc:
        result.error = f"Unexpected error: {exc}"

    return result


def _extract_json(text: str) -> dict | None:
    """Extract a JSON object from text that may contain markdown fences or thinking tags."""
    # Remove <think>...</think> blocks if present
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)

    # Try direct parse first
    text = text.strip()
    if text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    # Try extracting from markdown code fences
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Last resort: find the first { ... } block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return None
