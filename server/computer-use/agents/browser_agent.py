"""
Browser agent — captures screenshots of a live URL at multiple viewports
using Playwright (headless Chromium).
"""

import asyncio
import base64
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

VIEWPORTS = [
    {"name": "desktop", "width": 1920, "height": 1080},
    {"name": "tablet", "width": 768, "height": 1024},
    {"name": "mobile", "width": 375, "height": 812},
]

PAGE_TIMEOUT_MS = 30_000  # 30 seconds


@dataclass
class ScreenshotResult:
    viewport: str
    width: int
    height: int
    b64_image: str  # base64-encoded PNG


@dataclass
class BrowserAgentResult:
    url: str
    screenshots: list[ScreenshotResult] = field(default_factory=list)
    page_title: str = ""
    meta_description: str = ""
    headings: list[str] = field(default_factory=list)  # first few h1/h2 texts
    hero_text: str = ""  # visible text from the hero/above-fold area
    error: str | None = None


async def capture_screenshots(url: str) -> BrowserAgentResult:
    """Navigate to *url* and capture full-page screenshots at each viewport."""

    result = BrowserAgentResult(url=url)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            for vp in VIEWPORTS:
                context = await browser.new_context(
                    viewport={"width": vp["width"], "height": vp["height"]},
                    device_scale_factor=1,
                )
                page = await context.new_page()
                try:
                    await page.goto(url, wait_until="networkidle", timeout=PAGE_TIMEOUT_MS)
                    # Grab page title once
                    if not result.page_title:
                        result.page_title = await page.title()

                    # Extract website content for commentary (first viewport only)
                    if not result.meta_description:
                        result.meta_description = await page.evaluate(
                            """() => {
                                const el = document.querySelector('meta[name="description"]');
                                return el ? el.getAttribute('content') || '' : '';
                            }"""
                        )
                        result.headings = await page.evaluate(
                            """() => {
                                const hs = [...document.querySelectorAll('h1, h2')].slice(0, 8);
                                return hs.map(h => h.innerText.trim()).filter(t => t.length > 0);
                            }"""
                        )
                        result.hero_text = await page.evaluate(
                            """() => {
                                const el = document.querySelector('main, [role="main"], .hero, #hero, header');
                                if (!el) return '';
                                return el.innerText.substring(0, 500).trim();
                            }"""
                        )

                    # Scroll to bottom and back to trigger lazy-loaded content
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await asyncio.sleep(0.5)
                    await page.evaluate("window.scrollTo(0, 0)")
                    await asyncio.sleep(0.3)

                    png_bytes = await page.screenshot(full_page=True, type="png")
                    b64 = base64.b64encode(png_bytes).decode()

                    result.screenshots.append(
                        ScreenshotResult(
                            viewport=vp["name"],
                            width=vp["width"],
                            height=vp["height"],
                            b64_image=b64,
                        )
                    )
                except PlaywrightTimeout:
                    result.screenshots.append(
                        ScreenshotResult(
                            viewport=vp["name"],
                            width=vp["width"],
                            height=vp["height"],
                            b64_image="",
                        )
                    )
                finally:
                    await context.close()

        except Exception as exc:
            result.error = str(exc)
        finally:
            await browser.close()

    return result
