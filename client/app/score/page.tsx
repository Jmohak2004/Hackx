"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  http,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";

import { runJudgeMatchConfetti } from "@/components/auth/celebrate";
import { ResultBackdrop } from "@/components/score/ResultBackdrop";
import { GAME_ABI, GAME_CONTRACT_ADDRESS } from "@/lib/contract";

// --- Types ---

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
  chain?: {
    entryId: string | null;
    roundId: string | null;
    claimableAfter?: number;
    scoreTxHash: string | null;
    isWinnerOnChain: boolean | null;
    claimTxHash: string | null;
  };
}

// --- Blockchain Constants & Clients ---

const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
const MAX_SAFE_CLAIM_GAS = 1_000_000n;
const FALLBACK_CLAIM_GAS = 500_000n;

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

// --- Blockchain Helpers ---

async function ensureWalletOnSepolia() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No wallet detected. Install MetaMask.");
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
      if (typeof err === "object" && err !== null && "code" in err && err.code === 4902) {
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

  if (!window.ethereum) throw new Error("No wallet detected.");
  const ethereum = window.ethereum;

  const accounts = (await ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts?.length) {
    throw new Error("No wallet connected.");
  }

  const walletAddress = accounts[0] as Address;

  const walletClient = createWalletClient({
    account: walletAddress,
    chain: sepolia,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: custom(ethereum as any),
  });

  let gasLimit = FALLBACK_CLAIM_GAS;

  try {
    const estimatedGas = await viemPublicClient.estimateContractGas({
      address: GAME_CONTRACT_ADDRESS,
      abi: GAME_ABI,
      functionName: "claimPrize",
      args: [entryId],
      account: walletAddress,
    });
    const withHeadroom = estimatedGas + estimatedGas / 5n;
    gasLimit = withHeadroom > MAX_SAFE_CLAIM_GAS ? MAX_SAFE_CLAIM_GAS : withHeadroom;
  } catch {
    gasLimit = FALLBACK_CLAIM_GAS;
  }

  const hash = await walletClient.writeContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_ABI,
    functionName: "claimPrize",
    args: [entryId],
    gas: gasLimit,
  });

  await viemPublicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// --- UI Components ---

function ResultsContent() {
  const params = useSearchParams();
  const raw = params.get("d");

  const [claimStatus, setClaimStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const confettiOnce = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!raw) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(raw)) as ScoreData;
      const matches = Math.round(Number(parsed.user_score)) === Math.round(Number(parsed.ai_score));
      if (matches && !confettiOnce.current) {
        confettiOnce.current = true;
        runJudgeMatchConfetti();
      }
    } catch {
      // The page below renders the parse error state.
    }
  }, [raw]);

  if (!raw) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-center text-white">
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
      <div className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-center text-white">
        <p className="text-lg text-zinc-400">Failed to parse result data.</p>
        <Link href="/auth" className="mt-6 rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm hover:bg-white/10">
          ← Go back
        </Link>
      </div>
    );
  }

  const scoresMatch = Math.round(Number(data.user_score)) === Math.round(Number(data.ai_score));
  const resultVariant = scoresMatch ? "match" : "mismatch";

  const chainEntryId = data.chain?.entryId ?? null;
  const effectiveClaimTxHash = claimTxHash ?? data.chain?.claimTxHash ?? null;
  const canClaim = data.chain?.isWinnerOnChain ?? scoresMatch;
  const claimableAfter = data.chain?.claimableAfter;
  const claimWindowOpen = claimableAfter === undefined || nowSeconds >= claimableAfter;

  const handleClaimPrize = async () => {
    if (!chainEntryId) return;
    try {
      setClaimStatus("pending");
      setClaimError(null);
      const tx = await claimPrizeOnChain(BigInt(chainEntryId));
      setClaimTxHash(tx);
      setClaimStatus("success");
    } catch (err: unknown) {
      setClaimError(err instanceof Error ? err.message : "Failed to claim prize");
      setClaimStatus("error");
    }
  };

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-black text-white flex flex-col items-center justify-center px-6">
      <ResultBackdrop
        variant={resultVariant}
        yourScore={data.user_score}
        judgeScore={data.ai_score}
      />

      <div className="relative z-10 flex flex-col items-center">
        {canClaim && (
          <div className="mt-6 text-center">
            {effectiveClaimTxHash ? (
              <div className="space-y-2">
                <p className="font-[family-name:var(--font-geist-sans)] text-sm font-semibold tracking-wide text-emerald-300">
                  Prize Claimed Successfully!
                </p>
                <p className="font-[family-name:var(--font-geist-mono)] text-[10px] text-zinc-500 break-all max-w-xs">
                  TX: {effectiveClaimTxHash}
                </p>
              </div>
            ) : chainEntryId && claimWindowOpen ? (
              <button
                onClick={handleClaimPrize}
                disabled={claimStatus === "pending"}
                className="font-[family-name:var(--font-geist-sans)] rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-8 py-3 text-sm font-bold tracking-wide text-zinc-950 shadow-lg shadow-amber-900/40 transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {claimStatus === "pending" ? "Claiming…" : "Claim Prize"}
              </button>
            ) : chainEntryId ? (
              <p className="font-[family-name:var(--font-geist-sans)] text-xs text-zinc-500 italic">
                Prize claims open after the round&apos;s judging deadline.
              </p>
            ) : (
              <p className="font-[family-name:var(--font-geist-sans)] text-xs text-zinc-500 italic">
                No entry ID found — cannot claim prize
              </p>
            )}

            {claimError && (
              <p className="font-[family-name:var(--font-geist-sans)] mt-3 text-xs text-red-400 max-w-xs">
                {claimError}
              </p>
            )}
          </div>
        )}

        <Link
          href="/"
          className="font-[family-name:var(--font-geist-sans)] mt-10 text-sm text-zinc-500 transition-colors hover:text-white underline underline-offset-4"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}

export default function ScorePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-black text-white">
          <p className="text-sm text-zinc-500">Loading results…</p>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
