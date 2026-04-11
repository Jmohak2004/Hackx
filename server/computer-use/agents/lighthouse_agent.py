"""
Lighthouse agent — runs a Lighthouse audit against a live URL
and extracts the core category scores.

Requires Node.js and `lighthouse` npm package to be installed globally
or available via npx.
"""

import asyncio
import json
import shutil
import tempfile
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class LighthouseScores:
    performance: float = 0.0
    accessibility: float = 0.0
    best_practices: float = 0.0
    seo: float = 0.0


@dataclass
class LighthouseResult:
    url: str
    scores: LighthouseScores = field(default_factory=LighthouseScores)
    raw_json_path: str | None = None
    error: str | None = None


async def run_lighthouse(url: str) -> LighthouseResult:
    """
    Run a Lighthouse audit on *url* and return category scores (0-100 scale).
    Falls back gracefully if lighthouse / npx is not available.
    """
    result = LighthouseResult(url=url)

    # Check if npx is available
    npx = shutil.which("npx")
    if npx is None:
        result.error = "npx not found on PATH — cannot run Lighthouse"
        return result

    tmp_dir = tempfile.mkdtemp(prefix="lh_")
    output_path = Path(tmp_dir) / "report.json"

    cmd = [
        npx, "--yes", "lighthouse", url,
        "--output=json",
        f"--output-path={output_path}",
        "--chrome-flags=--headless --no-sandbox --disable-gpu",
        "--quiet",
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)

        if proc.returncode != 0:
            result.error = f"Lighthouse exited with code {proc.returncode}: {stderr.decode()[:500]}"
            return result

        if not output_path.exists():
            result.error = "Lighthouse did not produce a report file"
            return result

        with open(output_path, "r") as f:
            report = json.load(f)

        categories = report.get("categories", {})
        result.scores = LighthouseScores(
            performance=_cat_score(categories, "performance"),
            accessibility=_cat_score(categories, "accessibility"),
            best_practices=_cat_score(categories, "best-practices"),
            seo=_cat_score(categories, "seo"),
        )
        result.raw_json_path = str(output_path)

    except asyncio.TimeoutError:
        result.error = "Lighthouse timed out after 120 seconds"
    except Exception as exc:
        result.error = str(exc)

    return result


def _cat_score(categories: dict, key: str) -> float:
    """Extract a category score and convert from 0-1 to 0-100 scale."""
    cat = categories.get(key, {})
    score = cat.get("score")
    if score is None:
        return 0.0
    return round(float(score) * 100, 1)
