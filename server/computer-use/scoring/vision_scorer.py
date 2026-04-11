"""
Vision scorer — deterministic scoring from Lighthouse data.
No LLM calls. Scores are computed via formula in rubric.py.
"""

from dataclasses import dataclass

from scoring.rubric import compute_live_score


@dataclass
class LiveScorerResult:
    performance: float = 0.0
    accessibility: float = 0.0
    best_practices: float = 0.0
    seo: float = 0.0
    total_score: float = 0.0
    error: str | None = None


def score_website(lighthouse_scores: dict) -> LiveScorerResult:
    """
    Deterministic website score from Lighthouse data.
    No screenshots or LLM needed.
    """
    result = LiveScorerResult()

    try:
        breakdown = compute_live_score(lighthouse_scores)
        result.performance = breakdown.performance
        result.accessibility = breakdown.accessibility
        result.best_practices = breakdown.best_practices
        result.seo = breakdown.seo
        result.total_score = breakdown.total
    except Exception as exc:
        result.error = f"Scoring formula error: {exc}"

    return result
