"""
Browser agent — captures screenshots of a live URL at multiple viewports
using Playwright (headless Chromium).
"""

import asyncio
import base64
import os
from dataclasses import dataclass, field

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from url_security import ensure_public_url, assert_public_host

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
    """Inspect each viewport, bounding screenshots to the first 6,000 pixels."""

    result = BrowserAgentResult(url=url)
    try:
        url = await ensure_public_url(url)
    except Exception as exc:
        result.error = str(exc)
        return result

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, executable_path=os.getenv("CHROME_PATH") or None)
        try:
            for vp in VIEWPORTS:
                context = await browser.new_context(
                    viewport={"width": vp["width"], "height": vp["height"]},
                    device_scale_factor=1,
                    service_workers="block",
                    accept_downloads=False,
                )
                async def guard_request(route):
                    target = route.request.url
                    if target.startswith(("http://", "https://")):
                        try:
                            await assert_public_host(target)
                        except ValueError:
                            await route.abort("blockedbyclient")
                            return
                    await route.continue_()
                await context.route("**/*", guard_request)
                page = await context.new_page()
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
                    # Analytics and polling apps may never become network-idle.
                    try:
                        await page.wait_for_load_state("networkidle", timeout=5000)
                    except PlaywrightTimeout:
                        pass
                    # Grab page title once
                    if not result.page_title:
                        result.page_title = (await page.title())[:300]

                    # Extract website content for commentary (first viewport only)
                    if not result.meta_description:
                        result.meta_description = await page.evaluate(
                            """() => {
                                const el = document.querySelector('meta[name="description"]');
                                return el ? (el.getAttribute('content') || '').substring(0, 1000) : '';
                            }"""
                        )
                        result.headings = await page.evaluate(
                            """() => {
                                const hs = [...document.querySelectorAll('h1, h2')].slice(0, 8);
                                return hs.map(h => h.innerText.trim().substring(0, 300)).filter(t => t.length > 0);
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

                    height = await page.evaluate("Math.min(6000, Math.max(innerHeight, document.documentElement.scrollHeight))")
                    png_bytes = await page.screenshot(
                        clip={"x": 0, "y": 0, "width": vp["width"], "height": height},
                        type="png", timeout=10_000,
                    )
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
                    result.error = "Page inspection timed out at the " + vp["name"] + " viewport"
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
