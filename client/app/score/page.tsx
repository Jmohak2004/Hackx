"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { runJudgeMatchConfetti } from "@/components/auth/celebrate";
import { ResultBackdrop } from "@/components/score/ResultBackdrop";

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
scoreTxHash: string | null;
isWinnerOnChain: boolean | null;
claimTxHash: string | null;
};
}

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

async function ensureWalletOnSepolia() {
if (typeof window === "undefined" || !window.ethereum) {
throw new Error("No wallet detected. Install MetaMask.");
}

const currentChainId = await window.ethereum.request({
method: "eth_chainId",
});

if (currentChainId?.toLowerCase() === SEPOLIA_CHAIN_ID_HEX) return;

try {
await window.ethereum.request({
method: "wallet_switchEthereumChain",
params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
});
} catch (err: any) {
if (err.code === 4902) {
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

const accounts = await window.ethereum.request({
method: "eth_requestAccounts",
});

if (!accounts?.length) {
throw new Error("No wallet connected.");
}

const walletAddress = accounts[0] as Address;

const walletClient = createWalletClient({
account: walletAddress,
chain: sepolia,
transport: custom(window.ethereum as any),
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

```
const withHeadroom = estimatedGas + estimatedGas / 5n;
gasLimit =
  withHeadroom > MAX_SAFE_CLAIM_GAS
    ? MAX_SAFE_CLAIM_GAS
    : withHeadroom;
```

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

function ScoreBar({ value, max }: { value: number; max: number }) {
const pct = Math.round((value / max) * 100);
return ( <div className="mt-1.5 h-2 w-full rounded-full bg-white/10 overflow-hidden">
<div
className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-700"
style={{ width: `${pct}%` }}
/> </div>
);
}

function ResultsContent() {
const params = useSearchParams();
const raw = params.get("d");

const [claimStatus, setClaimStatus] = useState("idle");
const [claimError, setClaimError] = useState<string | null>(null);
const [claimTxHash, setClaimTxHash] = useState<string | null>(null);

if (!raw) return <div>No data</div>;

const data: ScoreData = JSON.parse(decodeURIComponent(raw));

const scoresMatch =
Math.round(data.user_score) === Math.round(data.ai_score);

const resultVariant = scoresMatch ? "match" : "mismatch";

const confettiOnce = useRef(false);

useEffect(() => {
if (!scoresMatch || confettiOnce.current) return;
confettiOnce.current = true;
runJudgeMatchConfetti();
}, [scoresMatch]);

const chainEntryId = data.chain?.entryId ?? null;
const effectiveClaimTxHash =
claimTxHash ?? data.chain?.claimTxHash ?? null;

const canClaimPrize =
scoresMatch && !!chainEntryId && !effectiveClaimTxHash;

const handleClaimPrize = async () => {
if (!chainEntryId) return;

```
try {
  setClaimStatus("pending");
  const tx = await claimPrizeOnChain(BigInt(chainEntryId));
  setClaimTxHash(tx);
  setClaimStatus("success");
} catch (err: any) {
  setClaimError(err.message);
  setClaimStatus("error");
}
```

};

return ( <div className="min-h-dvh bg-black text-white flex flex-col items-center justify-center px-6"> <ResultBackdrop
     variant={resultVariant}
     yourScore={data.user_score}
     judgeScore={data.ai_score}
   />

```
  <p className="mt-6 text-sm text-zinc-400 text-center max-w-md">
    {scoresMatch
      ? "Perfect match with AI 🎯"
      : "Mismatch — check breakdown below"}
  </p>

  {scoresMatch && (
    <div className="mt-6 text-center">
      {effectiveClaimTxHash ? (
        <p className="text-xs text-emerald-300">
          Claimed: {effectiveClaimTxHash}
        </p>
      ) : chainEntryId ? (
        <button
          onClick={handleClaimPrize}
          disabled={claimStatus === "pending"}
          className="mt-3 rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-black hover:brightness-110"
        >
          {claimStatus === "pending"
            ? "Claiming..."
            : "Claim Prize"}
        </button>
      ) : (
        <p className="text-xs text-zinc-400">
          No entry ID → cannot claim
        </p>
      )}

      {claimError && (
        <p className="text-xs text-red-400 mt-2">
          {claimError}
        </p>
      )}
    </div>
  )}

  <Link href="/" className="mt-10 text-sm text-zinc-400 underline">
    Back
  </Link>
</div>
```

);
}

export default function ScorePage() {
return (
<Suspense fallback={<div>Loading...</div>}> <ResultsContent /> </Suspense>
);
}
