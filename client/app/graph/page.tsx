"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";

// ─── Types ────────────────────────────────────────────────────────────────────
interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: "Repo" | "File" | "Function" | "Class" | "Dependency" | "ApiEndpoint";
  label: string;
  data: Record<string, unknown>;
}

interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

interface GraphData {
  repoId: string;
  owner: string;
  repo: string;
  githubUrl: string;
  metadata: Record<string, unknown>;
  fetchedAt: string;
  stats: Record<string, number>;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface CachedGraph {
  repoId: string;
  owner: string;
  repo: string;
  fetchedAt: string;
  stats: Record<string, number>;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

const NODE_COLORS: Record<string, string> = {
  Repo:        "#f97316",
  File:        "#3b82f6",
  Function:    "#a855f7",
  Class:       "#10b981",
  Dependency:  "#f59e0b",
  ApiEndpoint: "#ef4444",
};

const EDGE_COLORS: Record<string, string> = {
  CONTAINS_FILE: "#3b82f680",
  CONTAINS:      "#a855f780",
  IMPORTS:       "#f59e0b80",
  ROUTES_TO:     "#ef444480",
  CALLS:         "#6366f180",
  HAS_DEPENDENCY:"#f59e0b40",
};

const NODE_RADIUS: Record<string, number> = {
  Repo:        20,
  File:        10,
  Function:    7,
  Class:       9,
  Dependency:  7,
  ApiEndpoint: 8,
};

const NODE_TYPES = ["Repo", "File", "Function", "Class", "Dependency", "ApiEndpoint"] as const;

// ─── Component ────────────────────────────────────────────────────────────────
export default function GraphPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [graphs, setGraphs] = useState<CachedGraph[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(NODE_TYPES));
  const [nodeLimit, setNodeLimit] = useState(300);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);

  // ── Fetch list of cached graphs
  useEffect(() => {
    fetch(`${API_BASE}/api/graphs`)
      .then((r) => r.json())
      .then((d) => {
        setGraphs(d.graphs || []);
        if (d.graphs?.length > 0) setSelectedId(d.graphs[0].repoId);
      })
      .catch(() => setError("Cannot reach API server. Make sure it's running on port 4000."));
  }, []);

  // ── Load graph when selection changes
  useEffect(() => {
    if (!selectedId) return;
    // The fetch is external work; these flags describe its pending state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/api/graph/${selectedId}`)
      .then((r) => r.json())
      .then((d) => { setGraphData(d); setLoading(false); })
      .catch(() => { setError("Failed to load graph data."); setLoading(false); });
  }, [selectedId]);

  // ── D3 force simulation
  const renderGraph = useCallback(() => {
    if (!graphData || !svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    if (simulationRef.current) simulationRef.current.stop();

    const { width, height } = containerRef.current.getBoundingClientRect();

    // Filter nodes by active types and search
    const searchLower = search.toLowerCase();
    const filteredNodes = graphData.nodes
      .filter((n) => activeTypes.has(n.type))
      .filter((n) => !searchLower || n.label.toLowerCase().includes(searchLower) || n.type.toLowerCase().includes(searchLower))
      .slice(0, nodeLimit);

    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = graphData.edges.filter(
      (e) => nodeIds.has(e.source as string) && nodeIds.has(e.target as string)
    );

    setNodeCount(filteredNodes.length);
    setEdgeCount(filteredEdges.length);

    // Deep clone to avoid mutation of original data
    const nodes: GraphNode[] = filteredNodes.map((n) => ({ ...n }));
    const edges = filteredEdges.map((e) => ({ ...e }));

    // SVG setup
    const svgEl = svg
      .attr("width", width)
      .attr("height", height)
      .style("background", "#0d0d14");

    // Defs — arrow markers
    const defs = svgEl.append("defs");
    Object.entries(EDGE_COLORS).forEach(([type, color]) => {
      defs.append("marker")
        .attr("id", `arrow-${type}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 18)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", color.slice(0, 7));
    });

    // Zoom container
    const g = svgEl.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 4])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svgEl.call(zoom);

    // Simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphEdge>(edges)
        .id((d) => d.id)
        .distance(80)
        .strength(0.3))
      .force("charge", d3.forceManyBody().strength(-120))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d) => NODE_RADIUS[(d as GraphNode).type] + 4));
    simulationRef.current = simulation;

    // Edges
    const link = g.append("g")
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke", (d) => EDGE_COLORS[d.type] || "#ffffff20")
      .attr("stroke-width", 1)
      .attr("marker-end", (d) => `url(#arrow-${d.type})`);

    // Nodes group
    const nodeG = g.append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, GraphNode, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      );

    // Node circle
    nodeG.append("circle")
      .attr("r", (d) => NODE_RADIUS[d.type])
      .attr("fill", (d) => NODE_COLORS[d.type])
      .attr("fill-opacity", 0.9)
      .attr("stroke", (d) => NODE_COLORS[d.type])
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.4);

    // Glow ring on hover
    nodeG.append("circle")
      .attr("r", (d) => NODE_RADIUS[d.type] + 5)
      .attr("fill", "none")
      .attr("stroke", (d) => NODE_COLORS[d.type])
      .attr("stroke-width", 1)
      .attr("opacity", 0)
      .attr("class", "glow-ring");

    // Labels — only show for Repo, File, ApiEndpoint; show Function/Class on hover
    nodeG.append("text")
      .text((d) => d.label.length > 20 ? d.label.slice(0, 18) + "…" : d.label)
      .attr("x", (d) => NODE_RADIUS[d.type] + 4)
      .attr("y", 4)
      .attr("fill", "#e2e8f0")
      .attr("font-size", (d) => d.type === "Repo" ? "13px" : "10px")
      .attr("font-family", "'JetBrains Mono', 'Fira Code', monospace")
      .attr("opacity", (d) => ["Repo", "File", "ApiEndpoint"].includes(d.type) ? 0.85 : 0)
      .attr("class", "node-label")
      .style("pointer-events", "none")
      .style("user-select", "none");

    // Hover interactions
    nodeG
      .on("mouseenter", (event, d) => {
        setHoveredNode(d);
        d3.select(event.currentTarget).select(".glow-ring").attr("opacity", 0.6);
        d3.select(event.currentTarget).select(".node-label").attr("opacity", 1);
      })
      .on("mouseleave", (event, d) => {
        setHoveredNode(null);
        d3.select(event.currentTarget).select(".glow-ring").attr("opacity", 0);
        d3.select(event.currentTarget).select(".node-label")
          .attr("opacity", ["Repo", "File", "ApiEndpoint"].includes(d.type) ? 0.85 : 0);
      });

    // Tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);
      nodeG.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Center view button
    (svgEl.node() as SVGSVGElement & { centerView?: () => void }).centerView = () => {
      svgEl.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.6));
    };

    return () => simulation.stop();
  }, [graphData, search, activeTypes, nodeLimit]);

  useEffect(() => { renderGraph(); }, [renderGraph]);

  // ── Resize handler
  useEffect(() => {
    const observer = new ResizeObserver(() => renderGraph());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [renderGraph]);

  const toggleType = (type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  const centerView = () => {
    const svg = svgRef.current as SVGSVGElement & { centerView?: () => void };
    svg?.centerView?.();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: "#0d0d14", fontFamily: "'JetBrains Mono', monospace" }}>

      {/* ── Sidebar */}
      <aside className="flex flex-col gap-4 w-64 shrink-0 border-r overflow-y-auto p-4"
        style={{ borderColor: "#1e1e2e", background: "#0a0a12" }}>

        {/* Header */}
        <div className="flex items-center gap-2 pb-3 border-b" style={{ borderColor: "#1e1e2e" }}>
          <div className="w-8 h-8 rounded flex items-center justify-center text-sm font-bold"
            style={{ background: "#f97316", color: "#000" }}>G</div>
          <div>
            <div className="text-white text-sm font-bold leading-none">Knowledge Graph</div>
            <div className="text-xs mt-0.5" style={{ color: "#4a4a6a" }}>Interactive Visualization</div>
          </div>
        </div>

        {/* Stats */}
        {nodeCount > 0 && (
          <div className="flex gap-2">
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: "#10b98120", color: "#10b981" }}>
              ● {nodeCount} nodes
            </span>
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: "#3b82f620", color: "#3b82f6" }}>
              ● {edgeCount} edges
            </span>
          </div>
        )}

        {/* Repo selector */}
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: "#4a4a6a" }}>REPOSITORY</label>
          {graphs.length === 0 ? (
            <div className="text-xs p-2 rounded" style={{ background: "#1e1e2e", color: "#ef4444" }}>
              No cached graphs. Run the pipeline first.
            </div>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full text-xs p-2 rounded outline-none"
              style={{ background: "#1e1e2e", color: "#e2e8f0", border: "1px solid #2e2e4e" }}
            >
              {graphs.map((g) => (
                <option key={g.repoId} value={g.repoId}>{g.owner}/{g.repo}</option>
              ))}
            </select>
          )}
        </div>

        {/* Search */}
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: "#4a4a6a" }}>SEARCH & FOCUS</label>
          <input
            type="text"
            placeholder="Search nodes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs p-2 rounded outline-none"
            style={{ background: "#1e1e2e", color: "#e2e8f0", border: "1px solid #2e2e4e" }}
          />
        </div>

        {/* Node types */}
        <div>
          <label className="text-xs font-semibold mb-2 block" style={{ color: "#4a4a6a" }}>NODE TYPES</label>
          <div className="flex flex-col gap-1">
            {NODE_TYPES.map((type) => {
              const count = graphData?.nodes.filter((n) => n.type === type).length ?? 0;
              const active = activeTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className="flex items-center justify-between px-3 py-2 rounded text-xs transition-all"
                  style={{
                    background: active ? `${NODE_COLORS[type]}18` : "#1a1a24",
                    border: `1px solid ${active ? NODE_COLORS[type] + "60" : "#1e1e2e"}`,
                    color: active ? "#e2e8f0" : "#4a4a6a",
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: active ? NODE_COLORS[type] : "#2e2e4e" }} />
                    {type.toUpperCase()}
                  </span>
                  <span style={{ color: active ? NODE_COLORS[type] : "#2e2e4e" }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Node limit */}
        <div>
          <label className="text-xs font-semibold mb-1 flex justify-between" style={{ color: "#4a4a6a" }}>
            <span>NODE LIMIT</span>
            <span style={{ color: "#e2e8f0" }}>{nodeLimit}</span>
          </label>
          <input
            type="range" min={50} max={800} step={50}
            value={nodeLimit}
            onChange={(e) => setNodeLimit(Number(e.target.value))}
            className="w-full accent-orange-500"
          />
          <div className="flex justify-between text-xs mt-1" style={{ color: "#2e2e4e" }}>
            <span>50</span><span>800</span>
          </div>
        </div>

        {/* Controls */}
        <div>
          <label className="text-xs font-semibold mb-2 block" style={{ color: "#4a4a6a" }}>CONTROLS</label>
          <button
            onClick={centerView}
            className="w-full text-xs py-2 px-3 rounded flex items-center gap-2 transition-all hover:opacity-80"
            style={{ background: "#1e1e2e", color: "#e2e8f0", border: "1px solid #2e2e4e" }}
          >
            <span>⊕</span> CENTER VIEW
          </button>
        </div>

        {/* Repo stats */}
        {graphData?.stats && (
          <div className="mt-auto pt-3 border-t" style={{ borderColor: "#1e1e2e" }}>
            <label className="text-xs font-semibold mb-2 block" style={{ color: "#4a4a6a" }}>PIPELINE STATS</label>
            {Object.entries(graphData.stats).map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs py-0.5">
                <span style={{ color: "#4a4a6a" }}>{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                <span style={{ color: "#e2e8f0" }}>{v.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ── Main canvas */}
      <main className="flex-1 flex flex-col relative">

        {/* Top bar */}
        <header className="flex items-center justify-between px-5 py-3 shrink-0 border-b"
          style={{ background: "#0a0a12", borderColor: "#1e1e2e" }}>
          <div>
            <h1 className="text-white font-bold text-base leading-none">
              {graphData ? `${graphData.owner}/${graphData.repo}` : "Knowledge Graph"}
            </h1>
            {graphData && (
              <p className="text-xs mt-0.5" style={{ color: "#4a4a6a" }}>
                Fetched {new Date(graphData.fetchedAt).toLocaleDateString()} · {graphData.githubUrl}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {graphData && (
              <a href={graphData.githubUrl} target="_blank" rel="noreferrer"
                className="text-xs px-3 py-1.5 rounded transition-all hover:opacity-80"
                style={{ background: "#1e1e2e", color: "#e2e8f0", border: "1px solid #2e2e4e" }}>
                ↗ GitHub
              </a>
            )}
          </div>
        </header>

        {/* Canvas */}
        <div ref={containerRef} className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10"
              style={{ background: "#0d0d14cc" }}>
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 rounded-full animate-spin"
                  style={{ borderColor: "#f97316", borderTopColor: "transparent" }} />
                <span className="text-xs" style={{ color: "#4a4a6a" }}>Loading graph…</span>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center p-8 rounded-xl" style={{ background: "#1e1e2e", border: "1px solid #ef444440" }}>
                <div className="text-2xl mb-2">⚠</div>
                <div className="text-sm" style={{ color: "#ef4444" }}>{error}</div>
                <div className="text-xs mt-2" style={{ color: "#4a4a6a" }}>
                  Start the server: <code className="px-1 rounded" style={{ background: "#0d0d14" }}>node index.js</code> in <code>/server</code>
                </div>
              </div>
            </div>
          )}
          {!loading && !error && graphs.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center p-8 rounded-xl max-w-md" style={{ background: "#1e1e2e", border: "1px solid #f9731640" }}>
                <div className="text-3xl mb-3">🧩</div>
                <div className="text-white font-bold mb-2">No Graphs Yet</div>
                <div className="text-xs" style={{ color: "#4a4a6a" }}>
                  Run the pipeline to generate a knowledge graph:
                </div>
                <code className="block mt-3 p-3 rounded text-xs text-left" style={{ background: "#0d0d14", color: "#f97316" }}>
                  node githubPipeline.js
                </code>
              </div>
            </div>
          )}
          <svg ref={svgRef} className="w-full h-full" />
        </div>

        {/* Hovered node tooltip */}
        {hoveredNode && (
          <div
            className="absolute bottom-4 right-4 p-4 rounded-xl text-xs max-w-xs"
            style={{ background: "#1e1e2e", border: `1px solid ${NODE_COLORS[hoveredNode.type]}40`, color: "#e2e8f0" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full" style={{ background: NODE_COLORS[hoveredNode.type] }} />
              <span className="font-bold" style={{ color: NODE_COLORS[hoveredNode.type] }}>{hoveredNode.type}</span>
            </div>
            <div className="font-mono break-all">{hoveredNode.label}</div>
            {hoveredNode.data && Object.keys(hoveredNode.data).length > 0 && (
              <div className="mt-2 pt-2 border-t" style={{ borderColor: "#2e2e4e" }}>
                {Object.entries(hoveredNode.data).slice(0, 4).map(([k, v]) => (
                  <div key={k} className="flex gap-1 mt-0.5">
                    <span style={{ color: "#4a4a6a" }}>{k}:</span>
                    <span className="truncate">{String(v).slice(0, 40)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Edge legend */}
        <div className="absolute bottom-4 left-[270px] flex items-center gap-4 px-4 py-2 rounded-xl text-xs"
          style={{ background: "#0a0a1299", border: "1px solid #1e1e2e", backdropFilter: "blur(8px)" }}>
          {Object.entries(EDGE_COLORS).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-px" style={{ background: color.slice(0, 7), opacity: 0.8 }} />
              <span style={{ color: "#4a4a6a" }}>{type.replace(/_/g, " ")}</span>
            </span>
          ))}
        </div>
      </main>
    </div>
  );
}
