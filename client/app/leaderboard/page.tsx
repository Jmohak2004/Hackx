"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Trophy,
  Filter,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Code2,
  Globe,
  Search,
} from "lucide-react";
import {
  useCurrentRoundId,
  useRound,
  useRoundEntryIds,
  useEntry,
  formatEthValue,
  getRoundStatus,
  truncateAddress,
} from "@/lib/hooks";

function EntryRow({ entryId, rank }: { entryId: bigint; rank: number }) {
  const { data: e } = useEntry(entryId);

  if (!e) {
    return (
      <tr>
        <td colSpan={6} style={{ padding: "16px", textAlign: "center" }}>
          <div className="shimmer" style={{ height: 20, borderRadius: 4 }} />
        </td>
      </tr>
    );
  }
  const scoreDiff = e.scored
    ? Math.abs(Number(e.selfScore) - Number(e.verifiedScore))
    : null;

  return (
    <motion.tr
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.03 }}
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        background: e.isWinner ? "rgba(6, 182, 212, 0.03)" : "transparent",
      }}
    >
      {/* Rank */}
      <td style={{ padding: "14px 16px" }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: rank <= 3 ? "var(--gradient-hero)" : "var(--bg-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            fontSize: 12,
            color: rank <= 3 ? "var(--bg-primary)" : "var(--text-muted)",
          }}
        >
          {rank}
        </div>
      </td>

      {/* Address */}
      <td style={{ padding: "14px 16px" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14 }}>
          {truncateAddress(e.participant)}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Entry #{entryId.toString()}
        </div>
      </td>

      {/* Self Score */}
      <td style={{ padding: "14px 16px", textAlign: "center" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: "var(--accent-cyan)" }}>
          {e.selfScore.toString()}
        </span>
      </td>

      {/* Verified Score */}
      <td style={{ padding: "14px 16px", textAlign: "center" }}>
        {e.scored ? (
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: "var(--accent-purple)" }}>
            {e.verifiedScore.toString()}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Pending...</span>
        )}
      </td>

      {/* Diff */}
      <td style={{ padding: "14px 16px", textAlign: "center" }}>
        {scoreDiff !== null ? (
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 700,
              fontSize: 14,
              color: e.isWinner ? "var(--accent-emerald)" : "var(--accent-pink)",
            }}
          >
            ±{scoreDiff}
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        )}
      </td>

      {/* Status */}
      <td style={{ padding: "14px 16px" }}>
        {e.scored ? (
          e.isWinner ? (
            <span className="badge badge--winner">🏆 Winner</span>
          ) : (
            <span className="badge badge--lost">Lost</span>
          )
        ) : (
          <span className="badge badge--pending">Pending</span>
        )}
      </td>

      {/* Links */}
      <td style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <a
            href={e.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
            }}
          >
            <Code2 size={14} />
          </a>
          <a
            href={e.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
            }}
          >
            <Globe size={14} />
          </a>
        </div>
      </td>
    </motion.tr>
  );
}

export default function LeaderboardPage() {
  const { data: currentRoundId } = useCurrentRoundId();
  const [selectedRound, setSelectedRound] = useState<bigint | undefined>(undefined);

  useEffect(() => {
    if (currentRoundId && currentRoundId > 0n && selectedRound === undefined) {
      setSelectedRound(currentRoundId);
    }
  }, [currentRoundId, selectedRound]);

  const { data: round } = useRound(selectedRound);
  const { data: entryIds } = useRoundEntryIds(selectedRound);

  const status = getRoundStatus(round);
  const roundCount = currentRoundId ? Number(currentRoundId) : 0;

  return (
    <div style={{ padding: "40px 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 32 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Trophy size={24} color="var(--accent-cyan)" />
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 5vw, 36px)", fontWeight: 800 }}>
            Leader<span className="gradient-text">board</span>
          </h1>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
          View all entries and see who matched their self-declared score.
        </p>
      </motion.div>

      {/* Round Selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Filter size={16} color="var(--text-muted)" />
          <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>ROUND</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              className="cyber-btn cyber-btn--secondary cyber-btn--small"
              onClick={() => setSelectedRound((prev) => (prev && prev > 1n ? prev - 1n : prev))}
              disabled={!selectedRound || selectedRound <= 1n}
              style={{ padding: "6px 10px" }}
            >
              <ChevronLeft size={14} />
            </button>
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 800,
                fontSize: 18,
                color: "var(--accent-cyan)",
                minWidth: 40,
                textAlign: "center",
              }}
            >
              #{selectedRound?.toString() ?? "0"}
            </span>
            <button
              className="cyber-btn cyber-btn--secondary cyber-btn--small"
              onClick={() =>
                setSelectedRound((prev) =>
                  prev && currentRoundId && prev < currentRoundId ? prev + 1n : prev
                )
              }
              disabled={!selectedRound || !currentRoundId || selectedRound >= currentRoundId}
              style={{ padding: "6px 10px" }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {round && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              className={
                status === "open"
                  ? "badge badge--open"
                  : status === "judging"
                  ? "badge badge--judging"
                  : "badge badge--complete"
              }
            >
              {status === "open" ? "Open" : status === "judging" ? "Judging" : "Complete"}
            </span>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Pool: <strong style={{ color: "var(--accent-cyan)" }}>{formatEthValue(round.totalPool)} ETH</strong>
              {" • "}
              {entryIds?.length ?? 0} entries
              {round.winnersCount > 0n && (
                <>
                  {" • "}
                  <strong style={{ color: "var(--accent-emerald)" }}>{round.winnersCount.toString()} winners</strong>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass-card"
        style={{ overflow: "hidden" }}
      >
        {entryIds && entryIds.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(0,0,0,0.2)" }}>
                  {["Rank", "Participant", "Self Score", "AI Score", "Diff", "Status", "Links"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        textAlign: h === "Participant" || h === "Rank" || h === "Links" ? "left" : "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entryIds.map((id, i) => (
                  <EntryRow key={id.toString()} entryId={id} rank={i + 1} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              No Entries Yet
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
              {roundCount === 0 ? "No rounds have been created yet." : "Be the first to enter this round!"}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
