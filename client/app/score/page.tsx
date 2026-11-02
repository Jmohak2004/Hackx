"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEther, type Address } from "viem";
import { runJudgeMatchConfetti } from "@/components/auth/celebrate";
import { ResultBackdrop } from "@/components/score/ResultBackdrop";
import { useWallet } from "@/context/WalletContext";
import { api, API_BASE, type EntryState, type EvaluationJob } from "@/lib/api";
import { GAME_CONTRACT_ADDRESS } from "@/lib/contract";
import { SUPPORTED_CHAIN, transactionUrl } from "@/lib/chain";
import { readableError, sendGameTransaction } from "@/lib/transactions";

const primary = "rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-8 py-3 text-sm font-bold tracking-wide text-zinc-950 shadow-lg shadow-amber-900/40 transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
const ghost = "rounded-xl border border-white/20 bg-black/40 px-5 py-2.5 text-sm hover:bg-white/10";

function ResultsContent() {
  const params = useSearchParams();
  const id = params.get("entryId") || "";
  const valid = /^[1-9]\d{0,77}$/.test(id);
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimHash, setClaimHash] = useState<string | null>(null);
  const confettiEntry = useRef("");
  const key = ["evaluation", SUPPORTED_CHAIN.id, GAME_CONTRACT_ADDRESS, id] as const;
  const entryKey = ["entry-state", SUPPORTED_CHAIN.id, GAME_CONTRACT_ADDRESS, id] as const;
  const evaluation = useQuery({
    queryKey: key,
    queryFn: () => api<EvaluationJob>("/api/evaluations/" + id),
    enabled: valid,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && !["failed", "succeeded"].includes(status) ? 1500 : false;
    },
  });
  const state = useQuery({
    queryKey: entryKey,
    queryFn: () => api<EntryState>("/api/blockchain/entry/" + id),
    enabled: valid,
    retry: 1,
    refetchInterval: 10_000,
  });
  const entry = state.data?.entry;
  const result = evaluation.data?.result;
  const winner = entry?.scored ? entry.isWinner : false;

  useEffect(() => {
    if (!winner || !entry?.id || confettiEntry.current === entry.id) return;
    confettiEntry.current = entry.id;
    runJudgeMatchConfetti();
  }, [winner, entry?.id]);

  async function resumeEvaluation() {
    setBusy(true);
    setError(null);
    try {
      const job = await api<EvaluationJob>("/api/evaluations", {
        method: "POST", body: JSON.stringify({ entryId: id, retry: true }),
      });
      queryClient.setQueryData(key, job);
      await evaluation.refetch();
    } catch (failure) { setError(readableError(failure)); }
    finally { setBusy(false); }
  }

  async function claim(kind: "claimPrize" | "claimRefund") {
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      const fresh = await api<EntryState>("/api/blockchain/entry/" + id);
      if (kind === "claimPrize" ? !fresh.canClaimPrize : !fresh.canClaimRefund) {
        throw new Error("This entry is not eligible for that payment yet");
      }
      const { hash } = await sendGameTransaction(kind, [BigInt(id)], {
        expectedAccount: entry.participant as Address,
      });
      setClaimHash(hash);
      await queryClient.invalidateQueries({ queryKey: entryKey });
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (failure) { setError(readableError(failure)); }
    finally { setBusy(false); }
  }

  const confirmedResult = !!entry?.scored && !!result;
  const explorer = claimHash ? transactionUrl(claimHash) : null;
  const reportDigest = /^sha256:([a-f0-9]{64})$/.exec(entry?.proofIpfsHash || "")?.[1];

  return (
    <div className={"relative flex min-h-dvh w-full flex-col items-center overflow-hidden bg-black px-6 text-white " + (confirmedResult ? "justify-end pb-8 pt-[55dvh] sm:justify-center sm:pb-0 sm:pt-0" : "justify-center")}>
      {confirmedResult && (
        <ResultBackdrop variant={winner ? "match" : "mismatch"}
          yourScore={entry.selfScore / 10} judgeScore={entry.verifiedScore / 10} />
      )}
      <div className={"relative z-10 flex flex-col items-center text-center " + (confirmedResult
        ? "w-full max-w-sm rounded-2xl border border-white/10 bg-black/75 p-4 backdrop-blur-md sm:w-[25vw]" : "max-w-lg")}>
        {!valid ? (
          <>
            <p className="text-lg text-zinc-400">Open an entry from your Arena to view its result.</p>
            <Link href="/arena" className={ghost + " mt-6"}>Open Arena</Link>
          </>
        ) : state.isPending ? (
          <p className="text-sm text-zinc-400">Loading entry {id}…</p>
        ) : state.isError ? (
          <>
            <p className="text-sm text-red-300">{readableError(state.error)}</p>
            <button className={ghost + " mt-4"} onClick={() => { void state.refetch(); }}>Retry connection</button>
          </>
        ) : (
          <>
            {!confirmedResult && (
              <div className="rounded-2xl border border-amber-200/15 bg-zinc-950/80 p-6">
                <h1 className="text-xl font-semibold">Entry #{id}</h1>
                <p className="mt-3 text-sm text-zinc-400">
                  {evaluation.data?.status === "failed" ? evaluation.data.error?.message
                    : evaluation.data && evaluation.data.status !== "succeeded"
                      ? "Your evaluation is " + evaluation.data.status + ". This page will update automatically."
                      : entry?.claimed ? "This entry has already been paid."
                        : "This entry is recorded on-chain and can resume evaluation."}
                </p>
                {entry && !entry.scored && !entry.claimed &&
                  !["queued", "validating", "evaluating", "submitting", "confirming"].includes(evaluation.data?.status || "") &&
                  state.data!.round.chainTimestamp <= state.data!.round.judgingDeadline && (
                    <button className={primary + " mt-5"} disabled={busy} onClick={() => { void resumeEvaluation(); }}>
                      {busy ? "Starting…" : "Resume evaluation"}
                    </button>
                  )}
                {evaluation.data?.logs?.length ? (
                  <p className="mt-3 text-xs text-zinc-500">{evaluation.data.logs.at(-1)}</p>
                ) : null}
              </div>
            )}

            <div className="mt-6 text-center">
              {entry?.claimed ? (
                <p className="text-sm font-semibold tracking-wide text-emerald-300">
                  Payment claimed successfully
                </p>
              ) : state.data?.canClaimPrize || state.data?.canClaimRefund ? (
                wallet.isConnected ? (
                  <>
                    <button className={primary} disabled={busy} onClick={() => {
                      void claim(state.data!.canClaimPrize ? "claimPrize" : "claimRefund");
                    }}>
                      {busy ? "Confirming…" : state.data.canClaimPrize ? "Claim Prize" : "Claim Stake Refund"}
                    </button>
                    <p className="mt-2 text-xs text-amber-100/70">{formatEther(BigInt(state.data.claimAmount))} ETH</p>
                  </>
                ) : (
                  <button className={primary} disabled={wallet.isConnecting}
                    onClick={() => { void wallet.connect().catch((failure) => setError(readableError(failure))); }}>
                    Connect wallet to claim
                  </button>
                )
              ) : entry?.contractVersion === 1 ? (
                <p className="max-w-sm text-xs text-zinc-400">This entry belongs to the previous contract. Only eligible expired refunds are available here.</p>
              ) : state.data?.settlement?.ready ? (
                <p className="text-xs text-zinc-400">This entry did not qualify for a prize.</p>
              ) : (
                <p className="max-w-sm text-xs text-zinc-400">
                  Payments open when submissions close and all judging completes, or when the judging deadline passes.
                </p>
              )}
              {explorer && <a className="mt-3 block text-xs text-amber-200 underline" href={explorer} target="_blank" rel="noopener noreferrer">View payment transaction</a>}
              {error && <p className="mt-3 max-w-sm text-xs text-red-300" role="alert">{error}</p>}
            </div>
            {reportDigest && (
              <a href={API_BASE + "/api/reports/" + reportDigest} target="_blank" rel="noopener noreferrer"
                className="mt-5 text-xs text-zinc-400 underline underline-offset-4">View evaluation evidence</a>
            )}
            {result?.repo_id && <Link href={"/graph?repoId=" + encodeURIComponent(result.repo_id)}
              className="mt-4 text-xs text-zinc-400 underline underline-offset-4">View code graph</Link>}
            <Link href="/arena" className="mt-5 text-sm text-zinc-400 underline underline-offset-4">Your entries</Link>
          </>
        )}
        <Link href="/" className="mt-8 text-sm text-zinc-500 underline underline-offset-4 hover:text-white">Back to home</Link>
      </div>
    </div>
  );
}

export default function ScorePage() {
  return <Suspense fallback={<div className="flex min-h-dvh items-center justify-center bg-black text-white">Loading results…</div>}>
    <ResultsContent />
  </Suspense>;
}
