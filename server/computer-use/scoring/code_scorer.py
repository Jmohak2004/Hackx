"""
Code scorer — deterministic scoring from knowledge-graph metrics.
No LLM calls. Scores are computed via formula in rubric.py.
"""

from dataclasses import dataclass

from scoring.rubric import compute_code_score


@dataclass
class CodeScorerResult:
    project_scale: float = 0.0
    code_organization: float = 0.0
    architecture: float = 0.0
    connectivity: float = 0.0
    total_score: float = 0.0
    error: str | None = None


def score_codebase(
    files: int,
    functions: int,
    classes: int,
    imports: int,
    endpoints: int,
    calls_edges: int,
) -> CodeScorerResult:
    """
    Deterministic code score from graph metrics.
    No LLM needed.
    """
    result = CodeScorerResult()

    try:
        breakdown = compute_code_score(
            files=files,
            functions=functions,
            classes=classes,
            imports=imports,
            endpoints=endpoints,
            calls_edges=calls_edges,
        )
        result.project_scale = breakdown.project_scale
        result.code_organization = breakdown.code_organization
        result.architecture = breakdown.architecture
        result.connectivity = breakdown.connectivity
        result.total_score = breakdown.total
    except Exception as exc:
        result.error = f"Scoring formula error: {exc}"

    return result
