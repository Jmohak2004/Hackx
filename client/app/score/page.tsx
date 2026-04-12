"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface DimensionScore {
  score: number;
  reasoning: string;
}

interface ScoreData {
  github_url: string;
  hosted_url: string;
  page_title: string;
  user_score: number;
  ai_score: number;
  github_score: number;
  avg_score: number;
  breakdown: {
    visual_design?: DimensionScore;
    responsiveness?: DimensionScore;
    ux_interactivity?: DimensionScore;
    performance_accessibility?: DimensionScore;
  };
  summary: string;
  lighthouse: Record<string, number>;
  delta: number;
  honest: boolean;
  user_wins: boolean;
  logs: string[];
  errors: string[];
}

const SCORE_LABELS: Record<string, string> = {
  visual_design: "Visual Design",
  responsiveness: "Responsiveness",
  ux_interactivity: "UX & Interactivity",
  performance_accessibility: "Performance & A11y",
};

function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="mt-1.5 h-2 w-full rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ScoreCard({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: "amber" | "emerald" | "cyan";
}) {
  const ring =
    color === "amber"
      ? "border-amber-400/40 shadow-amber-900/30"
      : color === "emerald"
      ? "border-emerald-400/40 shadow-emerald-900/30"
      : "border-cyan-400/40 shadow-cyan-900/30";
  const text =
    color === "amber"
      ? "text-amber-300"
      : color === "emerald"
      ? "text-emerald-300"
      : "text-cyan-300";

  return (
    <div
      className={`flex flex-col items-center rounded-2xl border ${ring} bg-zinc-950/70 px-6 py-6 shadow-lg backdrop-blur-md`}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`mt-3 text-5xl font-bold tabular-nums ${text}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-600">/ {max}</p>
    </div>
  );
}

function ResultsContent() {
  const params = useSearchParams();
  const raw = params.get("d");

  if (!raw) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center text-white">
        <p className="text-lg text-zinc-400">No result data found.</p>
        <Link href="/auth" className="mt-6 rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm hover:bg-white/10">
          ← Go back
        </Link>
      </div>
    );
  }

  let data: ScoreData;
  try {
    data = JSON.parse(decodeURIComponent(raw)) as ScoreData;
  } catch {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center text-white">
        <p className="text-lg text-zinc-400">Failed to parse result data.</p>
        <Link href="/auth" className="mt-6 rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm hover:bg-white/10">
          ← Go back
        </Link>
      </div>
    );
  }

  const breakdownEntries = Object.entries(data.breakdown ?? {}).filter(
    ([, v]) => v != null
  ) as [string, DimensionScore][];

  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden bg-zinc-950 text-amber-50">
      {/* Background glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(180,83,9,0.18) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-3xl px-5 pb-24 pt-12 sm:px-8">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <Link
            href="/"
            className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-sm text-amber-100/90 backdrop-blur-md transition-colors hover:border-amber-300/30"
          >
            ← Home
          </Link>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-amber-200/60">
            Results
          </p>
          <span className="w-16" />
        </div>

        {/* Winner banner */}
        <div
          className={`mt-8 rounded-2xl border px-6 py-5 text-center ${
            data.user_wins
              ? "border-emerald-400/30 bg-emerald-500/10"
              : "border-red-400/25 bg-red-500/8"
          }`}
        >
          <p
            className={`text-3xl font-bold ${
              data.user_wins ? "text-emerald-300" : "text-red-300"
            }`}
          >
            {data.user_wins ? "🏆 You Win!" : "🤖 AI Wins"}
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            {data.user_wins
              ? "Your self-score matched or beat the AI's assessment."
              : "The AI scored your project differently — keep building!"}
          </p>
          {data.page_title && (
            <p className="mt-3 text-xs text-zinc-600 font-mono">{data.page_title}</p>
          )}
        </div>

        {/* Three score cards */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          <ScoreCard label="Your Score" value={data.user_score} max={10} color="amber" />
          <ScoreCard label="AI Score" value={data.ai_score} max={10} color="cyan" />
          <ScoreCard label="GitHub Score" value={data.github_score} max={10} color="emerald" />
        </div>

        {/* Avg score */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900/60 px-6 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Average Score
          </p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-white">
            {data.avg_score.toFixed(2)}
            <span className="ml-1 text-xl font-normal text-zinc-500">/ 10</span>
          </p>
        </div>

        {/* AI Summary */}
        {data.summary && (
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-zinc-900/50 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              AI Assessment
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">{data.summary}</p>
          </div>
        )}

        {/* Dimension breakdown */}
        {breakdownEntries.length > 0 && (
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-zinc-900/50 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Score Breakdown
            </p>
            <ul className="mt-4 flex flex-col gap-5">
              {breakdownEntries.map(([key, dim]) => {
                const maxMap: Record<string, number> = {
                  visual_design: 30,
                  responsiveness: 25,
                  ux_interactivity: 25,
                  performance_accessibility: 20,
                };
                const max = maxMap[key] ?? 100;
                return (
                  <li key={key}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-zinc-200">
                        {SCORE_LABELS[key] ?? key}
                      </p>
                      <p className="text-sm font-semibold text-amber-300 tabular-nums">
                        {dim.score}/{max}
                      </p>
                    </div>
                    <ScoreBar value={dim.score} max={max} />
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                      {dim.reasoning}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Lighthouse */}
        {data.lighthouse && Object.keys(data.lighthouse).length > 0 && (
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-zinc-900/50 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Lighthouse Audit
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(data.lighthouse).map(([k, v]) => (
                <li
                  key={k}
                  className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-3 text-center"
                >
                  <p className="text-xs text-zinc-500 capitalize">{k.replace(/_/g, " ")}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-white">{v}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Links */}
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-zinc-900/50 px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">
            Submitted Links
          </p>
          <p className="font-mono text-[11px] break-all text-zinc-400">
            <span className="text-zinc-600">github </span>{data.github_url}
          </p>
          <p className="mt-1 font-mono text-[11px] break-all text-zinc-400">
            <span className="text-zinc-600">hosted </span>{data.hosted_url}
          </p>
        </div>

        {/* Errors */}
        {data.errors?.length > 0 && (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/8 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-400/70 mb-2">
              Pipeline warnings
            </p>
            {data.errors.map((e, i) => (
              <p key={i} className="font-mono text-xs text-red-300 leading-relaxed">{e}</p>
            ))}
          </div>
        )}

        {/* Pipeline logs */}
        {data.logs?.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors">
              Pipeline logs ({data.logs.length} lines)
            </summary>
            <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-white/[0.08] bg-black/40 px-4 py-3">
              {data.logs.map((line, i) => (
                <p
                  key={i}
                  className={`font-mono text-[11px] leading-relaxed ${
                    line.startsWith("[ERROR]")
                      ? "text-red-400"
                      : line.startsWith("[WARN]")
                      ? "text-amber-400"
                      : line.startsWith("[Result]")
                      ? "text-emerald-400"
                      : "text-zinc-500"
                  }`}
                >
                  {line}
                </p>
              ))}
            </div>
          </details>
        )}

        {/* CTA */}
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/auth"
            className="flex-1 rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-center text-sm text-amber-50/90 hover:bg-white/10 transition-colors"
          >
            Submit another project
          </Link>
          <Link
            href="/"
            className="flex-1 rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-5 py-3 text-center text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-900/30 hover:brightness-110 transition-[filter]"
          >
            Back to stage
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ScorePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-white">
          <p className="text-sm text-zinc-500">Loading results…</p>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
