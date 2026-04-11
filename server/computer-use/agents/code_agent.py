"""
Code analysis agent — calls the Graphify knowledge graph server to analyze
a GitHub repository and returns structured graph stats.
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

GRAPHIFY_BASE_URL = "http://localhost:4000"
ANALYZE_TIMEOUT = 120  # seconds — pipeline can take a while


@dataclass
class GraphStats:
    files_created: int = 0
    functions_created: int = 0
    classes_created: int = 0
    imports_created: int = 0
    endpoints_created: int = 0
    calls_edges: int = 0


@dataclass
class RepoMetadata:
    name: str = ""
    description: str = ""
    language: str = ""
    stars: int = 0
    forks: int = 0
    size: int = 0
    topics: list[str] = field(default_factory=list)


@dataclass
class CodeAgentResult:
    github_url: str
    repo_id: str = ""
    metadata: RepoMetadata = field(default_factory=RepoMetadata)
    stats: GraphStats = field(default_factory=GraphStats)
    graph_summary: str = ""  # text summary for LLM
    error: str | None = None


def _validate_github_url(url: str) -> str:
    """Validate and normalize a GitHub repository URL."""
    url = url.strip().rstrip("/")
    pattern = re.compile(
        r"^https?://github\.com/[\w.\-]+/[\w.\-]+/?$"
    )
    if not pattern.match(url):
        raise ValueError(
            "Invalid GitHub URL. Expected format: https://github.com/owner/repo"
        )
    return url


async def analyze_repo(github_url: str) -> CodeAgentResult:
    """
    Trigger the Graphify pipeline for the given GitHub URL and return
    structured graph stats + a text summary for LLM scoring.
    """
    result = CodeAgentResult(github_url=github_url)

    try:
        github_url = _validate_github_url(github_url)
    except ValueError as exc:
        result.error = str(exc)
        return result

    async with httpx.AsyncClient(timeout=ANALYZE_TIMEOUT) as client:
        # Step 1: Trigger the pipeline
        try:
            logger.info("Triggering Graphify pipeline for %s", github_url)
            resp = await client.post(
                f"{GRAPHIFY_BASE_URL}/api/analyze",
                json={"githubUrl": github_url},
            )
            resp.raise_for_status()
            data = resp.json()

            result.repo_id = data.get("repoId", "")
            stats = data.get("stats", {})
            result.stats = GraphStats(
                files_created=stats.get("filesCreated", 0),
                functions_created=stats.get("functionsCreated", 0),
                classes_created=stats.get("classesCreated", 0),
                imports_created=stats.get("importsCreated", 0),
                endpoints_created=stats.get("endpointsCreated", 0),
                calls_edges=stats.get("callsEdges", 0),
            )

        except httpx.HTTPStatusError as exc:
            result.error = f"Graphify API error: {exc.response.status_code} — {exc.response.text[:500]}"
            return result
        except httpx.ConnectError:
            result.error = "Cannot connect to Graphify server at localhost:4000. Is it running?"
            return result
        except Exception as exc:
            result.error = f"Graphify pipeline error: {exc}"
            return result

        # Step 2: Fetch the full graph for richer analysis
        if result.repo_id:
            try:
                graph_resp = await client.get(
                    f"{GRAPHIFY_BASE_URL}/api/graph/{result.repo_id}"
                )
                graph_resp.raise_for_status()
                graph_data = graph_resp.json()

                # Extract metadata
                meta = graph_data.get("metadata", {})
                result.metadata = RepoMetadata(
                    name=meta.get("name", ""),
                    description=meta.get("description", "") or "",
                    language=meta.get("language", ""),
                    stars=meta.get("stars", 0),
                    forks=meta.get("forks", 0),
                    size=meta.get("size", 0),
                    topics=meta.get("topics", []),
                )

                # Build a text summary of the graph for LLM consumption
                result.graph_summary = _build_graph_summary(graph_data, result)

            except Exception as exc:
                logger.warning("Failed to fetch full graph: %s", exc)
                # Not fatal — we still have stats from the pipeline
                result.graph_summary = _build_stats_summary(result)

    if not result.graph_summary:
        result.graph_summary = _build_stats_summary(result)

    return result


def _build_graph_summary(graph_data: dict, result: CodeAgentResult) -> str:
    """Build a detailed text summary from full graph data for LLM scoring."""
    nodes = graph_data.get("nodes", [])

    # Categorize nodes
    files = [n for n in nodes if n.get("type") == "File"]
    functions = [n for n in nodes if n.get("type") == "Function"]
    classes = [n for n in nodes if n.get("type") == "Class"]
    endpoints = [n for n in nodes if n.get("type") == "ApiEndpoint"]
    dependencies = [n for n in nodes if n.get("type") == "Dependency"]

    # Language breakdown
    lang_counts: dict[str, int] = {}
    for f in files:
        lang = f.get("data", {}).get("language", "unknown")
        lang_counts[lang] = lang_counts.get(lang, 0) + 1

    # File paths for structure analysis
    file_paths = sorted(f.get("data", {}).get("path", f.get("label", "")) for f in files[:50])

    # Function names (sample)
    func_names = [f.get("label", "") for f in functions[:30]]

    # Endpoint paths
    endpoint_labels = [e.get("label", "") for e in endpoints[:20]]

    # Dependency names
    dep_names = [d.get("label", "") for d in dependencies[:20]]

    lines = [
        f"## Repository: {result.metadata.name}",
        f"Description: {result.metadata.description or 'None'}",
        f"Primary language: {result.metadata.language}",
        f"Stars: {result.metadata.stars} | Forks: {result.metadata.forks}",
        "",
        "## Codebase Statistics",
        f"- Files: {result.stats.files_created}",
        f"- Functions: {result.stats.functions_created}",
        f"- Classes: {result.stats.classes_created}",
        f"- Import relationships: {result.stats.imports_created}",
        f"- API endpoints: {result.stats.endpoints_created}",
        f"- Function call edges: {result.stats.calls_edges}",
        "",
        "## Language Breakdown",
    ]
    for lang, count in sorted(lang_counts.items(), key=lambda x: -x[1]):
        lines.append(f"- {lang}: {count} files")

    lines.append("\n## File Structure (sample)")
    for path in file_paths:
        lines.append(f"- {path}")

    if func_names:
        lines.append("\n## Key Functions (sample)")
        for name in func_names:
            lines.append(f"- {name}")

    if endpoint_labels:
        lines.append("\n## API Endpoints")
        for ep in endpoint_labels:
            lines.append(f"- {ep}")

    if dep_names:
        lines.append("\n## Dependencies")
        for dep in dep_names:
            lines.append(f"- {dep}")

    return "\n".join(lines)


def _build_stats_summary(result: CodeAgentResult) -> str:
    """Fallback: build summary from stats only."""
    return (
        f"Repository: {result.github_url}\n"
        f"Files: {result.stats.files_created}\n"
        f"Functions: {result.stats.functions_created}\n"
        f"Classes: {result.stats.classes_created}\n"
        f"Import relationships: {result.stats.imports_created}\n"
        f"API endpoints: {result.stats.endpoints_created}\n"
        f"Function call edges: {result.stats.calls_edges}\n"
    )
