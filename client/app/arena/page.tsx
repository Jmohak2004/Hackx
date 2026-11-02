"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseEventLogs } from "viem";
import { AppShell, panel, input, primaryButton, ghostButton } from "@/components/AppShell";
import { useWallet } from "@/context/WalletContext";
import { api, type RoundInfo, type EntryInfo } from "@/lib/api";
import { GAME_ABI, GAME_CONTRACT_ADDRESS } from "@/lib/contract";
import { publicClient } from "@/lib/chain";
import { readableError } from "@/lib/transactions";
import { savedSubmissions, saveSubmission } from "@/lib/submissions";

export default function ArenaPage() {
  const wallet = useWallet();
  const [selectedRound, setSelectedRound] = useState("");
  const [offset, setOffset] = useState(0);
  const rounds = useQuery({
    queryKey: ["rounds", GAME_CONTRACT_ADDRESS],
    queryFn: () => api<{ rounds: RoundInfo[] }>("/api/blockchain/rounds"),
    refetchInterval: 15_000,
  });
  const roundId = selectedRound || rounds.data?.rounds[0]?.id || "";
  const current = rounds.data?.rounds.find((round) => round.id === roundId);
  const entries = useQuery({
    queryKey: ["my-entries", GAME_CONTRACT_ADDRESS, roundId, wallet.address, offset],
    queryFn: () => api<{ entries: EntryInfo[]; total: number }>(
      "/api/blockchain/entries?roundId=" + roundId + "&participant=" + wallet.address + "&offset=" + offset + "&limit=20"),
    enabled: !!roundId && !!wallet.address,
    refetchInterval: 10_000,
  });
  const journal = useQuery({
    queryKey: ["submission-journal", GAME_CONTRACT_ADDRESS, wallet.address],
    enabled: !!wallet.address,
    refetchInterval: 5000,
    queryFn: async () => {
      if (!wallet.address) return [];
      const saved = savedSubmissions(wallet.address);
      for (const submission of saved) {
        if (submission.entryId || submission.status === "reverted") continue;
        try {
          const receipt = await publicClient.getTransactionReceipt({ hash: submission.txHash });
          if (receipt.status !== "success") {
            submission.status = "reverted";
            saveSubmission(submission);
            continue;
          }
          const events = parseEventLogs({
            abi: GAME_ABI, eventName: "EntrySubmitted",
            logs: receipt.logs.filter((log) => log.address.toLowerCase() === GAME_CONTRACT_ADDRESS.toLowerCase()),
          });
          const event = events.find((item) => item.args.participant.toLowerCase() === wallet.address!.toLowerCase());
          if (event) {
            submission.entryId = event.args.entryId.toString();
            submission.roundId = event.args.roundId.toString();
            submission.status = "confirmed";
            saveSubmission(submission);
          }
        } catch { /* A pending receipt remains available for the next poll. */ }
      }
      return saved.reverse();
    },
  });
  return <AppShell title="Arena" description="Track your stakes, resume interrupted evaluations, and open verified results for prizes or eligible refunds.">
    <section className={panel + " flex flex-wrap items-center justify-between gap-5"}>
      <div><h2 className="text-xl font-semibold">{current ? "Round #" + current.id : "No round available"}</h2>
        <p className="mt-2 text-sm text-amber-100/65">{current?.isOpen
          ? current.stakeAmountEth + " ETH per entry · tolerance ±" + current.scoreTolerance / 10
          : current ? "This round is " + current.phase + ". You can still view entries and eligible payments." : "The organizer needs to open a round."}</p>
      </div>
      <Link className={primaryButton} href="/auth">Submit a project</Link>
    </section>
    {!wallet.address && <div className={panel}><p className="text-sm text-amber-100/65">Connect your wallet to view your submission history.</p></div>}
    {!!journal.data?.length && <section className={panel}>
      <h2 className="text-xl font-semibold">Recent submissions on this device</h2>
      <div className="mt-4 space-y-3">{journal.data.slice(0, 5).map((submission) => <div key={submission.txHash} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4">
        <div><p className="text-sm">{submission.githubUrl.split("/").slice(-2).join("/")}</p>
          <p className="mt-1 text-xs text-zinc-400">{submission.entryId ? "Entry #" + submission.entryId
            : submission.status === "reverted" ? "Transaction reverted. No stake was recorded." : "Waiting for transaction confirmation"}</p></div>
        {submission.entryId && <Link href={"/score?entryId=" + submission.entryId} className={ghostButton}>Open entry</Link>}
      </div>)}</div>
    </section>}
    <section className={panel}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="w-full max-w-xs text-sm">Round
          <select className={input + " mt-2"} value={roundId} onChange={(event) => {
            setSelectedRound(event.target.value); setOffset(0);
          }}>
            {!rounds.data?.rounds.length && <option value="">No rounds available</option>}
            {rounds.data?.rounds.map((round) => <option key={round.id} value={round.id}>Round #{round.id} · {round.phase}</option>)}
          </select>
        </label>
        <button className={ghostButton} onClick={() => { void rounds.refetch(); if (wallet.address) void entries.refetch(); }}>Refresh</button>
      </div>
      {(rounds.isError || entries.isError) && <p role="alert" className="mt-4 text-sm text-red-300">{readableError(rounds.error || entries.error)}</p>}
      {wallet.address && entries.data?.entries.length === 0 && <p className="mt-6 text-sm text-zinc-400">You have no entries in this round.</p>}
      <div className="mt-5 space-y-4">{entries.data?.entries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/25 p-4">
        <div><p className="font-semibold">#{entry.id} · {entry.githubUrl.split("/").slice(-2).join("/")}</p>
          <p className="mt-2 text-xs text-amber-100/65">Your score {entry.selfScore / 10} · Judge {entry.scored ? entry.verifiedScore / 10 : "pending"}</p>
          <p className="mt-1 text-xs text-zinc-400">{entry.claimed ? "Payment claimed" : entry.scored ? "Evaluation complete" : "Stake recorded on-chain"}</p>
        </div>
        <Link href={"/score?entryId=" + entry.id} className={ghostButton}>{entry.scored ? "View result" : "Resume evaluation"}</Link>
      </div>)}</div>
      <div className="mt-6 flex items-center justify-between gap-4">
        <button className={ghostButton} disabled={offset === 0 || entries.isFetching} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</button>
        <span className="text-xs text-zinc-400">{entries.data?.total || 0} entries</span>
        <button className={ghostButton} disabled={!entries.data || offset + 20 >= entries.data.total || entries.isFetching} onClick={() => setOffset(offset + 20)}>Next</button>
      </div>
    </section>
  </AppShell>;
}
