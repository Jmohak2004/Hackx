"""
Scoring rubric — deterministic formula-based scoring (0-10 scale).

Live URL: scored from Lighthouse audit data.
Code: scored from knowledge-graph metrics.
No LLM involved — pure math, zero hallucination.
"""

import math
from dataclasses import dataclass

HONESTY_THRESHOLD = 1  # max allowed delta on 0-10 scale


# ── Live URL scoring (Lighthouse formula) ──────────────────────────────

@dataclass
class LiveScoreBreakdown:
    performance: float       # 0-2.5
    accessibility: float     # 0-2.5
    best_practices: float    # 0-2.5
    seo: float               # 0-2.5
    total: float             # 0-10


def compute_live_score(lighthouse_scores: dict) -> LiveScoreBreakdown:
    """
    Deterministic live URL score from Lighthouse audit data.
    Each category (0-100) is scaled to 0-2.5. Total: 0-10.
    """
    perf = (lighthouse_scores.get("performance", 0) or 0) / 100 * 2.5
    a11y = (lighthouse_scores.get("accessibility", 0) or 0) / 100 * 2.5
    bp = (lighthouse_scores.get("best_practices", 0) or 0) / 100 * 2.5
    seo = (lighthouse_scores.get("seo", 0) or 0) / 100 * 2.5

    total = round(perf + a11y + bp + seo, 1)

    return LiveScoreBreakdown(
        performance=round(perf, 2),
        accessibility=round(a11y, 2),
        best_practices=round(bp, 2),
        seo=round(seo, 2),
        total=total,
    )


# ── Code scoring (graph metrics formula) ──────────────────────────────

@dataclass
class CodeScoreBreakdown:
    project_scale: float     # 0-3.0
    code_organization: float # 0-2.5
    architecture: float      # 0-2.5
    connectivity: float      # 0-2.0
    total: float             # 0-10


def compute_code_score(
    files: int,
    functions: int,
    classes: int,
    imports: int,
    endpoints: int,
    calls_edges: int,
) -> CodeScoreBreakdown:
    """
    Deterministic code score from knowledge-graph metrics.

    Dimensions:
      1. Project Scale (0-3):     log-scaled file+function count
      2. Code Organization (0-2.5): functions-per-file ratio (sweet spot: 3-8)
      3. Architecture (0-2.5):    API endpoints + dependency diversity
      4. Connectivity (0-2):      call-graph richness per function
    Total: 0-10
    """

    # 1. Project Scale (0-3)
    combined = max(files, 1) + max(functions, 0)
    scale = min(3.0, math.log2(combined + 1) * 0.45)

    # 2. Code Organization (0-2.5)
    ratio = functions / max(files, 1)
    if ratio < 1:
        org = ratio * 1.0
    elif ratio <= 8:
        org = 1.0 + (ratio - 1) * (1.5 / 7)
    else:
        org = max(1.0, 2.5 - (ratio - 8) * 0.075)

    class_bonus = min(0.3, classes * 0.06)
    org = min(2.5, org + class_bonus)

    # 3. Architecture (0-2.5)
    ep_part = min(1.25, math.log2(endpoints + 1) * 0.35) if endpoints > 0 else 0.0
    imp_part = min(1.25, math.log2(imports + 1) * 0.18) if imports > 0 else 0.0
    arch = min(2.5, ep_part + imp_part)

    # 4. Connectivity (0-2)
    if functions > 0:
        calls_per_fn = calls_edges / functions
        conn = min(2.0, calls_per_fn * 0.3)
    else:
        conn = 0.0

    total = round(min(10.0, scale + org + arch + conn), 1)

    return CodeScoreBreakdown(
        project_scale=round(scale, 2),
        code_organization=round(org, 2),
        architecture=round(arch, 2),
        connectivity=round(conn, 2),
        total=total,
    )
