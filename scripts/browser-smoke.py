"""Full local-chain acceptance check; never sends a transaction to Sepolia.
Run against `npm run dev:local` using server/computer-use/.venv/bin/python.
"""
import argparse
import asyncio
import json
import threading
import time
from urllib.parse import urlparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import httpx
from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
HTML = b'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="A simple accessible project used to verify the HackX evaluation pipeline."><title>HackX browser acceptance project</title><link rel="icon" href="data:,"><style>body{margin:0;background:#111;color:#fff;font:18px system-ui;line-height:1.6}main{max-width:60rem;padding:3rem 1.5rem;margin:auto}a{color:#ffd878}button{font:inherit;padding:.7rem;border:0;border-radius:.5rem;background:#ffd878;color:#111}</style></head><body><header><nav aria-label="Main"><a href="#project">Project</a></nav></header><main id="project"><h1>A working project</h1><p>This responsive, accessible page verifies real Chromium and Lighthouse audits.</p><h2>Try it</h2><button onclick="document.getElementById('status').textContent='It works!'">Check interaction</button><p id="status" role="status">Ready</p></main><footer><p>Local acceptance fixture</p></footer></body></html>'''


class Website(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(HTML)))
        self.end_headers()
        self.wfile.write(HTML)

    def log_message(self, *_):
        pass


async def main(args):
    output = ROOT / ".local/browser"
    output.mkdir(parents=True, exist_ok=True)
    fixture = ThreadingHTTPServer(("127.0.0.1", 0), Website)
    threading.Thread(target=fixture.serve_forever, daemon=True).start()
    errors = []
    async with httpx.AsyncClient(timeout=30) as http:
        async def rpc(method, params=None):
            result = (await http.post(args.rpc, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []})).json()
            if "error" in result:
                raise AssertionError(result["error"])
            return result["result"]

        assert int(await rpc("eth_chainId"), 16) == 31337, "This check only supports a local Hardhat chain"
        ready = (await http.get(args.api + "/ready")).json()
        assert ready["ready"], ready
        round_id = ready["round"]["id"]
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch()
            async def context(account):
                ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
                config = json.dumps({"rpcUrl": args.rpc, "accountIndex": account})
                await ctx.add_init_script("window.__HACKX_LOCAL_TEST__=" + config + ";\n" + (ROOT / "scripts/fixtures/local-wallet.js").read_text())
                ctx.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))
                return ctx

            participant = await context(1)
            page = await participant.new_page()
            await page.goto(args.client + "/auth")
            await page.get_by_label("Name", exact=True).fill("Browser acceptance")
            await page.get_by_label("GitHub link *", exact=True).fill(args.repository)
            await page.get_by_label("Hosted link (preferred)", exact=True).fill(f"http://127.0.0.1:{fixture.server_port}")
            await page.get_by_role("button", name="Continue", exact=True).click()
            await page.get_by_label("Score (1–10)", exact=True).fill("6")
            await page.get_by_role("button", name="Continue", exact=True).click()
            await page.get_by_role("button", name="Connect Injected", exact=True).click()
            await expect(page.get_by_role("button", name="Analyze my project", exact=True)).to_be_enabled(timeout=30_000)
            await page.screenshot(path=str(output / "registration-desktop.png"))
            await page.get_by_role("button", name="Analyze my project", exact=True).click()
            await expect(page.get_by_role("heading", name="Analyzing your project", exact=True)).to_be_visible(timeout=60_000)
            print("Stake confirmed; reloading while evaluation continues", flush=True)
            await page.reload()
            await page.get_by_role("link", name="Your entries", exact=True).click()
            await expect(page.get_by_role("link", name="Open entry", exact=True).first).to_be_visible(timeout=30_000)
            href = await page.get_by_role("link", name="Open entry", exact=True).first.get_attribute("href")
            entry_id = href.split("entryId=")[1].split("&")[0]
            await page.goto(args.client + href)
            previous = None
            deadline = time.monotonic() + 300
            while time.monotonic() < deadline:
                response = await http.get(args.api + "/api/evaluations/" + entry_id)
                job = response.json()
                if job.get("status") != previous:
                    previous = job.get("status")
                    print("Evaluation: " + str(previous), flush=True)
                assert job.get("status") != "failed", job
                if job.get("status") == "succeeded":
                    break
                await asyncio.sleep(1)
            else:
                raise AssertionError("Evaluation exceeded five minutes")
            state = (await http.get(args.api + "/api/blockchain/entry/" + entry_id)).json()
            assert state["entry"]["scored"], state
            account = (await rpc("eth_accounts"))[1]
            history = (await http.get(args.api + "/api/blockchain/entries", params={"roundId": round_id, "participant": account})).json()
            assert history["total"] == 1, history
            await page.reload()
            await expect(page.get_by_role("link", name="View evaluation evidence")).to_be_visible(timeout=30_000)
            await page.locator("img[src*=result_]").evaluate("image => image.decode()")
            await page.screenshot(path=str(output / "result-desktop.png"))
            await page.set_viewport_size({"width": 375, "height": 812})
            await expect(page.get_by_label("Judge score", exact=True)).to_be_in_viewport()
            await expect(page.get_by_label("Your score", exact=True)).to_be_in_viewport()
            await page.screenshot(path=str(output / "result-mobile.png"))
            # Time travel is guarded above by the local chain-ID assertion.
            await rpc("evm_setNextBlockTimestamp", [state["round"]["judgingDeadline"] + 1])
            await rpc("evm_mine")
            await page.reload()
            claim = "Claim Prize" if state["entry"]["isWinner"] else "Claim Stake Refund"
            await expect(page.get_by_role("button", name=claim, exact=True)).to_be_visible(timeout=30_000)
            await page.get_by_role("button", name=claim, exact=True).click()
            await expect(page.get_by_text("Payment claimed successfully", exact=True)).to_be_visible(timeout=30_000)
            state = (await http.get(args.api + "/api/blockchain/entry/" + entry_id)).json()
            assert state["entry"]["claimed"], state
            await page.screenshot(path=str(output / "payment-mobile.png"))
            await page.goto(args.client + "/leaderboard")
            await expect(page.get_by_role("link", name=urlparse(args.repository).path.strip("/"), exact=True).first).to_be_visible(timeout=30_000)
            repo_id = job["result"].get("repo_id")
            if repo_id:
                await page.goto(args.client + "/graph?repoId=" + repo_id)
                await expect(page.get_by_role("heading", name=urlparse(args.repository).path.strip("/"), exact=True)).to_be_visible(timeout=30_000)
                assert await page.locator("svg circle").count() > 0
                await page.screenshot(path=str(output / "graph-mobile.png"))
            owner = await context(0)
            admin = await owner.new_page()
            await admin.goto(args.client + "/admin")
            await admin.get_by_role("button", name="Connect wallet", exact=True).click()
            await expect(admin.get_by_role("button", name="Create round", exact=True)).to_be_enabled(timeout=30_000)
            await admin.get_by_role("button", name="Create round", exact=True).click()
            await expect(admin.get_by_test_id("round-card-" + str(int(round_id) + 1))).to_be_visible(timeout=30_000)
            await admin.get_by_role("button", name="Pause submissions", exact=True).click()
            await expect(admin.get_by_role("button", name="Resume submissions", exact=True)).to_be_enabled(timeout=30_000)
            paused = (await http.get(args.api + "/ready")).json()
            assert not paused["ready"] and paused["round"]["paused"], paused
            await admin.get_by_role("button", name="Resume submissions", exact=True).click()
            await expect(admin.get_by_role("button", name="Pause submissions", exact=True)).to_be_enabled(timeout=30_000)
            assert (await http.get(args.api + "/ready")).json()["ready"]
            await admin.get_by_test_id("round-card-" + round_id).get_by_role("button", name="Withdraw fees").click()
            await expect(admin.get_by_test_id("round-card-" + round_id).get_by_role("button", name="Withdraw fees")).to_be_disabled(timeout=30_000)
            await admin.evaluate("window.scrollTo(0, 0)")
            await admin.screenshot(path=str(output / "admin-desktop.png"))
            await page.goto(args.client + "/admin")
            await expect(page.get_by_role("button", name="Create round", exact=True)).to_be_disabled()
            assert not errors, errors
            evidence = {"entryId": entry_id, "selfScore": state["entry"]["selfScore"], "verifiedScore": state["entry"]["verifiedScore"], "isWinner": state["entry"]["isWinner"], "claimed": True, "proof": state["entry"]["proofIpfsHash"], "runtimeErrors": errors}
            (output / "acceptance.json").write_text(json.dumps(evidence, indent=2))
            print(json.dumps(evidence, indent=2), flush=True)
            await browser.close()
    fixture.shutdown()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--client", default="http://127.0.0.1:3300")
    parser.add_argument("--api", default="http://127.0.0.1:4000")
    parser.add_argument("--rpc", default="http://127.0.0.1:8545")
    parser.add_argument("--repository", default="https://github.com/octocat/Spoon-Knife")
    asyncio.run(main(parser.parse_args()))
