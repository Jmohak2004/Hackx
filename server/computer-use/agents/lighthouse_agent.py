"""Run the repository's pinned Lighthouse CLI using Playwright's Chromium."""
import asyncio
import json
import math
import os
import shutil
import signal
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from playwright.async_api import async_playwright
from url_security import ensure_public_url


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
    result = LighthouseResult(url=url)
    node = shutil.which("node")
    cli = Path(__file__).resolve().parents[2] / "node_modules/lighthouse/cli/index.js"
    if not node or not cli.exists():
        result.error = "Install the Node server dependencies to enable Lighthouse"
        return result
    proc = None
    try:
        target = await ensure_public_url(url)
        async with async_playwright() as playwright:
            chrome = os.getenv("CHROME_PATH") or playwright.chromium.executable_path
        if not Path(chrome).exists():
            raise ValueError("Chromium is missing. Run python -m playwright install chromium")
        with tempfile.TemporaryDirectory(prefix="hackx-lighthouse-") as directory:
            output = Path(directory) / "report.json"
            flags = "--headless --disable-gpu"
            if os.getenv("CHROME_NO_SANDBOX") == "true":
                flags += " --no-sandbox"
            proc = await asyncio.create_subprocess_exec(
                node, str(cli), target, "--output=json", f"--output-path={output}",
                f"--chrome-flags={flags}",
                "--only-categories=performance,accessibility,best-practices,seo",
                "--max-wait-for-load=45000", "--quiet",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                env={**os.environ, "CHROME_PATH": chrome},
                start_new_session=os.name != "nt",
            )
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=150)
            if proc.returncode != 0:
                raise ValueError("Lighthouse failed: " + stderr.decode(errors="replace")[-500:])
            if not output.exists():
                raise ValueError("Lighthouse did not produce a report")
            report = json.loads(output.read_text())
            if report.get("runtimeError"):
                raise ValueError("Lighthouse audit failed: " + report["runtimeError"].get("message", "unknown error"))
            categories = report.get("categories", {})
            result.scores = LighthouseScores(
                performance=_cat_score(categories, "performance"),
                accessibility=_cat_score(categories, "accessibility"),
                best_practices=_cat_score(categories, "best-practices"),
                seo=_cat_score(categories, "seo"),
            )
    except asyncio.CancelledError:
        raise
    except asyncio.TimeoutError:
        result.error = "Lighthouse timed out before a valid score was available"
    except Exception as exc:
        result.error = str(exc)
    finally:
        if proc and proc.returncode is None:
            try:
                if os.name != "nt":
                    os.killpg(proc.pid, signal.SIGKILL)
                else:
                    proc.kill()
            except ProcessLookupError:
                pass
            await proc.communicate()
    return result


def _cat_score(categories: dict, key: str) -> float:
    value = categories.get(key, {}).get("score")
    if not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
        raise ValueError(f"Lighthouse category {key} did not produce a valid score")
    return round(value * 100, 1)
