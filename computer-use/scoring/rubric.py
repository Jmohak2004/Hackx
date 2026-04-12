"""
Scoring rubric — defines dimensions, weights, and the prompt template
used to instruct the vision model.
"""

from dataclasses import dataclass

HONESTY_THRESHOLD = 10  # max allowed delta between self-score and AI score


@dataclass
class Dimension:
    name: str
    max_points: int
    criteria: str


DIMENSIONS: list[Dimension] = [
    Dimension(
        name="Visual Design",
        max_points=30,
        criteria=(
            "Layout quality, visual hierarchy, typography, color palette coherence, "
            "spacing consistency, use of imagery/icons, overall aesthetic polish. "
            "Deduct for cluttered layouts, poor contrast, misaligned elements, "
            "or generic/default styling."
        ),
    ),
    Dimension(
        name="Responsiveness",
        max_points=25,
        criteria=(
            "How well the design adapts across desktop (1920px), tablet (768px), "
            "and mobile (375px) viewports. Check for: content reflow, readable text "
            "without zooming, touch-friendly tap targets on mobile, no horizontal "
            "scrolling, images scale properly, navigation collapses appropriately."
        ),
    ),
    Dimension(
        name="UX & Interactivity",
        max_points=25,
        criteria=(
            "Navigation clarity, information architecture, call-to-action visibility, "
            "user flow logic, feedback indicators (hover states, loading states), "
            "form usability, error handling. Deduct for confusing navigation, "
            "dead-end pages, missing feedback, or poor content organization."
        ),
    ),
    Dimension(
        name="Performance & Accessibility",
        max_points=20,
        criteria=(
            "Grounded in Lighthouse audit data provided below. Consider: page load "
            "performance score, accessibility compliance (alt text, ARIA labels, "
            "color contrast, keyboard navigation), SEO basics (meta tags, headings), "
            "and best practices (HTTPS, no console errors). Weight the Lighthouse "
            "scores proportionally."
        ),
    ),
]

TOTAL_POINTS = sum(d.max_points for d in DIMENSIONS)  # 100


def build_rubric_text() -> str:
    """Return the rubric as formatted text for inclusion in the prompt."""
    lines = [f"Total: {TOTAL_POINTS} points\n"]
    for d in DIMENSIONS:
        lines.append(f"### {d.name} (0–{d.max_points} pts)")
        lines.append(d.criteria)
        lines.append("")
    return "\n".join(lines)


SYSTEM_PROMPT = f"""\
You are an impartial, expert hackathon judge evaluating a live website.

You will receive:
1. Screenshots of the website at three viewport sizes (desktop, tablet, mobile).
2. Lighthouse audit scores (performance, accessibility, best-practices, SEO — each 0-100).

Your job is to score the website on the following rubric:

{build_rubric_text()}

## STRICT OUTPUT RULES — you MUST follow these exactly:

1. Return ONLY a raw JSON object. No markdown fences (```), no preamble, no explanation, no extra keys.
2. Every "score" value MUST be a plain INTEGER (whole number, no decimals, no strings).
3. Score ranges are HARD LIMITS — violating them is an error:
   - visual_design.score: integer 0 to 30 inclusive
   - responsiveness.score: integer 0 to 25 inclusive
   - ux_interactivity.score: integer 0 to 25 inclusive
   - performance_accessibility.score: integer 0 to 20 inclusive
   - total_score: MUST equal visual_design + responsiveness + ux_interactivity + performance_accessibility
4. Do NOT invent information about the website. Only score what you can see in the screenshots.
5. Do NOT inflate scores. Grade strictly against the rubric.

Exact JSON structure (copy this, fill in the values):
{{
  "visual_design": {{ "score": 0, "reasoning": "<1-2 sentences based only on what is visible>" }},
  "responsiveness": {{ "score": 0, "reasoning": "<1-2 sentences based only on what is visible>" }},
  "ux_interactivity": {{ "score": 0, "reasoning": "<1-2 sentences based only on what is visible>" }},
  "performance_accessibility": {{ "score": 0, "reasoning": "<1-2 sentences grounded in the Lighthouse numbers provided>" }},
  "total_score": 0,
  "summary": "<2-3 sentences. Be specific about what you saw, do not hallucinate features>"
}}
"""


def build_user_message(lighthouse_scores: dict) -> str:
    """Build the text portion of the user message with Lighthouse context."""
    return (
        "Here are the Lighthouse audit scores for this website:\n"
        f"- Performance: {lighthouse_scores.get('performance', 'N/A')}/100\n"
        f"- Accessibility: {lighthouse_scores.get('accessibility', 'N/A')}/100\n"
        f"- Best Practices: {lighthouse_scores.get('best_practices', 'N/A')}/100\n"
        f"- SEO: {lighthouse_scores.get('seo', 'N/A')}/100\n\n"
        "The attached screenshots show the website at desktop (1920×1080), "
        "tablet (768×1024), and mobile (375×812) viewports.\n\n"
        "Score this website according to the rubric. Return only JSON."
    )
