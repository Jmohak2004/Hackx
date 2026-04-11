"""
Vision scorer — sends screenshots + Lighthouse data to Gemma 4 31B
via the NVIDIA API and parses the structured scoring response.
"""

import json
import os
import re
from dataclasses import dataclass, field

import requests

from scoring.rubric import SYSTEM_PROMPT, build_user_message

NVIDIA_INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
MODEL = "google/gemma-4-31b-it"


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
) -> VisionScorerResult:
    """
    Call Gemma 4 31B via NVIDIA API with screenshots and Lighthouse data.
    Returns structured scores.
    """
    result = VisionScorerResult()

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
        "max_tokens": 4096,
        "temperature": 0.3,  # Low temp for consistent scoring
        "top_p": 0.9,
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

        result.visual_design = DimensionScore(
            score=int(parsed["visual_design"]["score"]),
            reasoning=parsed["visual_design"]["reasoning"],
        )
        result.responsiveness = DimensionScore(
            score=int(parsed["responsiveness"]["score"]),
            reasoning=parsed["responsiveness"]["reasoning"],
        )
        result.ux_interactivity = DimensionScore(
            score=int(parsed["ux_interactivity"]["score"]),
            reasoning=parsed["ux_interactivity"]["reasoning"],
        )
        result.performance_accessibility = DimensionScore(
            score=int(parsed["performance_accessibility"]["score"]),
            reasoning=parsed["performance_accessibility"]["reasoning"],
        )
        result.total_score = int(parsed.get("total_score", 0))
        result.summary = parsed.get("summary", "")

        # Validate total matches sum
        computed = (
            result.visual_design.score
            + result.responsiveness.score
            + result.ux_interactivity.score
            + result.performance_accessibility.score
        )
        if result.total_score != computed:
            result.total_score = computed

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
