import unittest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from main import EvaluateRequest, ScoreRequest, evaluate, score, _score_live_url
from agents.browser_agent import BrowserAgentResult
from agents.lighthouse_agent import LighthouseResult
from agents.roast_agent import RoastResult


class EvaluationFailureTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_page_inspection_cannot_produce_a_trusted_live_score(self):
        with patch("main.capture_screenshots", AsyncMock(return_value=BrowserAgentResult(
            url="https://example.com", error="Page inspection timed out",
        ))), patch("main.run_lighthouse", AsyncMock(return_value=LighthouseResult(url="https://example.com"))):
            errors = []
            result = await _score_live_url("https://example.com", errors)
        self.assertIsNone(result)
        self.assertIn("Browser agent", errors[0])

    async def test_lighthouse_failure_is_not_a_zero_score(self):
        with patch("main.capture_screenshots", AsyncMock(return_value=BrowserAgentResult(url="https://example.com"))), \
             patch("main.run_lighthouse", AsyncMock(return_value=LighthouseResult(url="https://example.com", error="audit failed"))):
            errors = []
            result = await _score_live_url("https://example.com", errors)
        self.assertIsNone(result)
        self.assertIn("Lighthouse", errors[0])

    async def test_strict_combined_evaluation_never_substitutes_a_partial_score(self):
        request = EvaluateRequest(
            live_url="https://example.com", github_url="https://github.com/user/repo",
            self_reported_score=7, strict=True,
        )
        with patch("main._score_live_url", AsyncMock(return_value=None)), \
             patch("main._score_github", AsyncMock(return_value={"score": 8, "breakdown": {}})):
            with self.assertRaises(HTTPException) as caught:
                await evaluate(request)
        self.assertEqual(caught.exception.status_code, 502)

    async def test_preview_mode_explicitly_marks_partial_results(self):
        request = EvaluateRequest(
            live_url="https://example.com", github_url="https://github.com/user/repo",
            self_reported_score=7, strict=False,
        )
        with patch("main._score_live_url", AsyncMock(return_value=None)), \
             patch("main._score_github", AsyncMock(return_value={"score": 8, "breakdown": {}, "repo_id": "graph-1"})), \
             patch("main.generate_roast", AsyncMock(return_value=RoastResult())):
            result = await evaluate(request)
        self.assertTrue(result.degraded)
        self.assertEqual(result.ai_score, 8)
        self.assertEqual(result.repo_id, "graph-1")

    async def test_score_endpoint_uses_distance_not_overclaiming_to_determine_honesty(self):
        request = ScoreRequest(github_url="https://github.com/user/repo", self_score=10)
        with patch("main._score_github", AsyncMock(return_value={"score": 5, "breakdown": {}})), \
             patch("main.generate_roast", AsyncMock(return_value=RoastResult())):
            result = await score(request)
        self.assertFalse(result.user_wins)
        self.assertEqual(result.avg_score, 5)
        self.assertFalse(result.degraded)


if __name__ == "__main__":
    unittest.main()
