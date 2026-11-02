"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell, panel, input, ghostButton } from "@/components/AppShell";
import { api, type RoundInfo, type EntryInfo } from "@/lib/api";
import { GAME_CONTRACT_ADDRESS } from "@/lib/contract";
import { readableError } from "@/lib/transactions";

const PAGE_SIZE = 20;
export default function LeaderboardPage() {
  const [selectedRound, setSelectedRound] = useState("");
  const [offset, setOffset] = useState(0);
  const rounds = useQuery({
    queryKey: ["rounds", GAME_CONTRACT_ADDRESS],
    queryFn: () => api<{ rounds: RoundInfo[] }>("/api/blockchain/rounds"),
    refetchInterval: 15_000,
  });
  const roundId = selectedRound || rounds.data?.rounds[0]?.id || "";
  const board = useQuery({
    queryKey: ["leaderboard", GAME_CONTRACT_ADDRESS, roundId, offset],
    queryFn: () => api<{ entries: (EntryInfo & { rank: number | null })[]; total: number }>(
      "/api/blockchain/leaderboard?roundId=" + roundId + "&offset=" + offset + "&limit=" + PAGE_SIZE),
    enabled: !!roundId, refetchInterval: 15_000,
  });
  return <AppShell title="Leaderboard" description="Verified project scores for each round. Scores are shown on a 0–10 scale; prize eligibility follows that round's self-score tolerance.">
    <section className={panel}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="w-full max-w-xs text-sm">Round
          <select className={input + " mt-2"} value={roundId} onChange={(event) => {
            setSelectedRound(event.target.value); setOffset(0);
          }}>
            {!rounds.data?.rounds.length && <option value="">No rounds available</option>}
            {rounds.data?.rounds.map((round) => <option key={round.id} value={round.id}>
              Round #{round.id} · {round.phase}
            </option>)}
          </select>
        </label>
        <button className={ghostButton} onClick={() => { void rounds.refetch(); void board.refetch(); }}>Refresh</button>
      </div>
      {(rounds.isError || board.isError) && <p className="mt-5 text-sm text-red-300" role="alert">
        {readableError(rounds.error || board.error)}
      </p>}
      {board.isFetching && <p className="mt-4 text-xs text-zinc-400" role="status">Updating verified scores…</p>}
      {board.data?.entries.length === 0 && <p className="mt-8 text-sm text-amber-100/65">No entries in this round yet.</p>}
      {!!board.data?.entries.length && <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="border-b border-white/15 text-xs uppercase tracking-wider text-amber-200/65">
            <tr><th className="pb-3 pr-4">Rank</th><th className="pb-3 pr-4">Project</th>
              <th className="pb-3 pr-4">Self</th><th className="pb-3 pr-4">Judge</th><th className="pb-3">Result</th></tr>
          </thead>
          <tbody>{board.data.entries.map((entry) => <tr key={entry.id} className="border-b border-white/[0.06]">
            <td className="py-4 pr-4 font-mono text-amber-200">{entry.rank ?? "—"}</td>
            <td className="py-4 pr-4">
              <Link href={"/score?entryId=" + entry.id} className="font-semibold text-amber-50">
                {entry.githubUrl.split("/").filter(Boolean).slice(-2).join("/")}
              </Link>
              <p className="mt-1 font-mono text-xs text-zinc-500">{entry.participant.slice(0, 6)}…{entry.participant.slice(-4)} · #{entry.id}</p>
            </td>
            <td className="py-4 pr-4 tabular-nums">{entry.selfScore / 10}</td>
            <td className="py-4 pr-4 tabular-nums">{entry.scored ? entry.verifiedScore / 10 : "Pending"}</td>
            <td className="py-4 text-xs">
              {entry.claimed ? <span className="text-emerald-300">Payment claimed</span>
                : !entry.scored ? <span className="text-zinc-400">Awaiting evaluation</span>
                  : entry.isWinner ? <span className="text-amber-200">Within tolerance</span>
                    : <span className="text-zinc-400">Outside tolerance</span>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
      <div className="mt-6 flex items-center justify-between gap-4">
        <button className={ghostButton} disabled={offset === 0 || board.isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</button>
        <span className="text-xs text-zinc-400">{board.data?.total || 0} entries</span>
        <button className={ghostButton} disabled={!board.data || offset + PAGE_SIZE >= board.data.total || board.isFetching} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button>
      </div>
    </section>
  </AppShell>;
}
