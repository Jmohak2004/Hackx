"""
Code scorer — sends knowledge-graph analysis data to Gemma 4 31B
via the NVIDIA API and parses the structured code scoring response.
"""

import json
import os
import re
from dataclasses import dataclass

import requests

NVIDIA_INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
MODEL = "google/gemma-4-31b-it"


CODE_SYSTEM_PROMPT = """\
You are an impartial, expert hackathon judge evaluating a GitHub repository's codebase.

You will receive a structured analysis of the repository including:
- File counts, function counts, class counts, import relationships, API endpoints, and call graph edges.
- Language breakdown, file structure, key function names, dependencies, and API routes.

Your job is to score the codebase on the following rubric (100 points total):

### Code Structure (0–25 pts)
Well-organized file/folder structure, clear separation of concerns, appropriate module
decomposition, consistent naming conventions. Deduct for flat structures with everything
in one directory, deeply nested files with no logic, or chaotic file organization.

### Code Quality & Complexity (0–25 pts)
Appropriate number of functions vs file count (not monolithic), reasonable function sizes,
good use of classes/abstractions, manageable import graph (not circular spaghetti).
Deduct for very few functions relative to files, excessive coupling, or no abstractions.

### Architecture & API Design (0–25 pts)
Clear API endpoints (if applicable), proper routing structure, use of established patterns
(MVC, microservices, etc.), appropriate dependency choices, separation of business logic
from infrastructure. Deduct for no clear architecture, random endpoint naming, or
inappropriate dependency choices.

### Completeness & Scope (0–25 pts)
Overall project scope and completeness for a hackathon project. Appropriate number of files
and features implemented. Evidence of testing, documentation, or CI. Deduct for trivially
small projects, boilerplate-only repos, or projects with only scaffolding and no real logic.

## Output format

Return ONLY a valid JSON object (no markdown fences, no extra text) with this exact structure:

{
  "code_structure": { "score": <int 0-25>, "reasoning": "<1-2 sentences>" },
  "code_quality": { "score": <int 0-25>, "reasoning": "<1-2 sentences>" },
  "architecture": { "score": <int 0-25>, "reasoning": "<1-2 sentences>" },
  "completeness": { "score": <int 0-25>, "reasoning": "<1-2 sentences>" },
  "total_score": <int 0-100>,
  "summary": "<2-3 sentence overall assessment>"
}

Be fair but rigorous. A default template or boilerplate repo should score below 30.
"""


@dataclass
class CodeDimensionScore:
    score: int
    reasoning: str


@dataclass
class CodeScorerResult:
    code_structure: CodeDimensionScore | None = None
    code_quality: CodeDimensionScore | None = None
    architecture: CodeDimensionScore | None = None
    completeness: CodeDimensionScore | None = None
    total_score: int = 0
    summary: str = ""
    raw_response: str = ""
    error: str | None = None


def score_codebase(graph_summary: str) -> CodeScorerResult:
    """
    Call Gemma 4 31B via NVIDIA API with the graph summary text.
    Returns structured code scores.
    """
    result = CodeScorerResult()

    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        result.error = "NVIDIA_API_KEY environment variable not set"
        return result

    if not graph_summary or not graph_summary.strip():
        result.error = "No graph summary data to score"
        return result

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": CODE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Here is the knowledge-graph analysis of the repository:\n\n"
                    f"{graph_summary}\n\n"
                    "Score this codebase according to the rubric. Return only JSON."
                ),
            },
        ],
        "max_tokens": 4096,
        "temperature": 0.3,
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

        parsed = _extract_json(content)
        if parsed is None:
            result.error = "Failed to parse JSON from model response"
            return result

        result.code_structure = CodeDimensionScore(
            score=int(parsed["code_structure"]["score"]),
            reasoning=parsed["code_structure"]["reasoning"],
        )
        result.code_quality = CodeDimensionScore(
            score=int(parsed["code_quality"]["score"]),
            reasoning=parsed["code_quality"]["reasoning"],
        )
        result.architecture = CodeDimensionScore(
            score=int(parsed["architecture"]["score"]),
            reasoning=parsed["architecture"]["reasoning"],
        )
        result.completeness = CodeDimensionScore(
            score=int(parsed["completeness"]["score"]),
            reasoning=parsed["completeness"]["reasoning"],
        )
        result.total_score = int(parsed.get("total_score", 0))
        result.summary = parsed.get("summary", "")

        # Validate total
        computed = (
            result.code_structure.score
            + result.code_quality.score
            + result.architecture.score
            + result.completeness.score
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
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = text.strip()

    if text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return None
