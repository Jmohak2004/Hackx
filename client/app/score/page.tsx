"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  http,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { GAME_ABI, GAME_CONTRACT_ADDRESS } from "@/lib/contract";

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
  avg_score: number;  // integer — rounded average of user+ai+github scores
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
  chain?: {
    entryId: string | null;
    roundId: string | null;
    scoreTxHash: string | null;
    isWinnerOnChain: boolean | null;
    claimTxHash: string | null;
  };
}

const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

const viemPublicClient = createPublicClient({
  chain: sepolia,
  transport: rpcUrl
    ? http(rpcUrl)
    : fallback([
        http("https://ethereum-sepolia-rpc.publicnode.com"),
        http("https://sepolia.drpc.org"),
      ]),
});

async function ensureWalletOnSepolia() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No wallet detected. Please install MetaMask.");
  }

  const currentChainId = (await window.ethereum.request({
    method: "eth_chainId",
  })) as string;

  if (currentChainId?.toLowerCase() === SEPOLIA_CHAIN_ID_HEX) return;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID_HEX,
            chainName: "Sepolia Testnet",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: [rpcUrl || "https://ethereum-sepolia-rpc.publicnode.com"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
      return;
    }

    throw err;
  }
}

async function claimPrizeOnChain(entryId: bigint): Promise<string> {
  await ensureWalletOnSepolia();

  const accounts = (await window.ethereum!.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts?.length) {
    throw new Error("No wallet account connected.");
  }

  const walletAddress = accounts[0] as Address;

  const walletClient = createWalletClient({
    account: walletAddress,
    chain: sepolia,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: custom(window.ethereum as any),
  });

  const hash = await walletClient.writeContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_ABI,
    functionName: "claimPrize",
    args: [entryId],
  });

  await viemPublicClient.waitForTransactionReceipt({ hash });
  return hash;
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
  const [claimStatus, setClaimStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);

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

  const roundedAverageScore = Math.round(data.avg_score);
  const isScoreTie = data.user_score === roundedAverageScore;
  const chainEntryId = data.chain?.entryId ?? null;
  const effectiveClaimTxHash = claimTxHash ?? data.chain?.claimTxHash ?? null;
  const canClaimPrize = isScoreTie && !!chainEntryId && !effectiveClaimTxHash;

  const handleClaimPrize = async () => {
    if (!chainEntryId) {
      setClaimStatus("error");
      setClaimError("Entry ID is missing. Please submit again and retry claim.");
      return;
    }

    try {
      setClaimStatus("pending");
      setClaimError(null);
      const tx = await claimPrizeOnChain(BigInt(chainEntryId));
      setClaimTxHash(tx);
      setClaimStatus("success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setClaimError(message);
      setClaimStatus("error");
    }
  };

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
          className={`mt-8 rounded-2xl border px-6 py-5 text-center ${data.user_wins
            ? "border-emerald-400/30 bg-emerald-500/10"
            : "border-red-400/25 bg-red-500/8"
            }`}
        >
          <p
            className={`text-3xl font-bold ${data.user_wins ? "text-emerald-300" : "text-red-300"
              }`}
          >
            {data.user_wins ? "🏆 You Win!" : "🤖 Not quite!"}
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            {data.user_wins
              ? `Your self-score (${data.user_score}) matched the average score (${data.avg_score}). Perfect call!`
              : `Your self-score was ${data.user_score}, but the average was ${data.avg_score}. Try again!`}
          </p>
          {data.page_title && (
            <p className="mt-3 text-xs text-zinc-600 font-mono">{data.page_title}</p>
          )}
        </div>

        {/* Two score cards */}
        <div className="mt-8 grid grid-cols-2 gap-4">
          <ScoreCard label="Your Score" value={data.user_score} max={10} color="amber" />
          <ScoreCard label="Average Score" value={roundedAverageScore} max={10} color="emerald" />
        </div>
        <p className="mt-2 text-center text-xs text-zinc-600">Win condition: your score = average score</p>

        {isScoreTie && (
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-6 py-5">
            <p className="text-sm font-semibold text-emerald-300">
              Tie detected: your score matches the average score.
            </p>

            {effectiveClaimTxHash ? (
              <p className="mt-2 text-xs text-emerald-200">
                Prize claim submitted:{" "}
                <a
                  href={`https://sepolia.etherscan.io/tx/${effectiveClaimTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-emerald-300/70 underline-offset-2 hover:text-emerald-100"
                >
                  {effectiveClaimTxHash}
                </a>
              </p>
            ) : chainEntryId ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleClaimPrize}
                  disabled={!canClaimPrize || claimStatus === "pending"}
                  className="rounded-xl bg-linear-to-b from-emerald-300 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-950/35 transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {claimStatus === "pending" ? "Claiming..." : "Claim Pool Prize"}
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-zinc-300">
                Entry ID not found for this run, so claim is unavailable.
              </p>
            )}

            {claimError && (
              <p className="mt-2 text-xs text-red-300">Claim failed: {claimError}</p>
            )}
          </div>
        )}

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
                  className={`font-mono text-[11px] leading-relaxed ${line.startsWith("[ERROR]")
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
