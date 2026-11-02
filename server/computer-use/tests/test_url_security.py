import asyncio
import os
import socket
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from url_security import validate_url_syntax, assert_public_host, ensure_public_url, normalize_github_url
from agents.lighthouse_agent import _cat_score


class UrlSecurityTests(unittest.IsolatedAsyncioTestCase):
    def test_blocks_private_and_credential_urls(self):
        with patch.dict(os.environ, {"ALLOW_PRIVATE_TARGETS": "false"}):
            for value in [
                "http://127.0.0.1", "http://10.0.0.1", "http://[::1]", "http://169.254.169.254",
                "http://localhost.", "http://host.local", "https://user:password@example.com",
                "file:///etc/passwd", "javascript:alert(1)",
            ]:
                with self.subTest(value=value):
                    with self.assertRaises(ValueError):
                        validate_url_syntax(value)

    async def test_rejects_public_hostnames_resolving_to_private_addresses(self):
        addresses = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))]
        loop = asyncio.get_running_loop()
        with patch.dict(os.environ, {"ALLOW_PRIVATE_TARGETS": "false"}), \
             patch.object(loop, "getaddrinfo", AsyncMock(return_value=addresses)):
            with self.assertRaises(ValueError):
                await assert_public_host("https://public-looking.example")

    async def test_checks_redirect_targets_before_fetching_them(self):
        requests = []
        def handler(request):
            requests.append(str(request.url))
            return httpx.Response(302, headers={"location": "http://127.0.0.1/admin"})
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        addresses = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
        loop = asyncio.get_running_loop()
        with patch.dict(os.environ, {"ALLOW_PRIVATE_TARGETS": "false"}), \
             patch.object(loop, "getaddrinfo", AsyncMock(return_value=addresses)), \
             patch("url_security.httpx.AsyncClient", return_value=client):
            with self.assertRaises(ValueError):
                await ensure_public_url("https://example.com")
        self.assertEqual(requests, ["https://example.com"])

    def test_github_urls_are_normalized_and_profile_links_rejected(self):
        self.assertEqual(normalize_github_url("https://github.com/u/r.git/"), "https://github.com/u/r")
        for value in ["https://github.com/u", "https://evilgithub.com/u/r", "https://github.com/u/r?x=1"]:
            with self.assertRaises(ValueError):
                normalize_github_url(value)

    def test_missing_lighthouse_categories_are_failures_but_genuine_zero_is_valid(self):
        self.assertEqual(_cat_score({"performance": {"score": 0}}, "performance"), 0)
        for value in [None, "1", float("nan"), -1, 1.1]:
            with self.assertRaises(ValueError):
                _cat_score({"performance": {"score": value}}, "performance")


if __name__ == "__main__":
    unittest.main()
