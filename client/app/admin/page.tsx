"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAddress, parseEther } from "viem";
import { AppShell, panel, input, primaryButton, ghostButton } from "@/components/AppShell";
import { useWallet } from "@/context/WalletContext";
import { api, type RoundInfo } from "@/lib/api";
import { GAME_ABI, GAME_CONTRACT_ADDRESS } from "@/lib/contract";
import { publicClient, transactionUrl } from "@/lib/chain";
import { readableError, sendGameTransaction, type GameWrite } from "@/lib/transactions";

export default function AdminPage() {
  const wallet = useWallet();
  const cache = useQueryClient();
  const [stake, setStake] = useState("0.001");
  const [tolerance, setTolerance] = useState("1");
  const [duration, setDuration] = useState("86400");
  const [buffer, setBuffer] = useState("7200");
  const [agent, setAgent] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");
  const owner = useQuery({
    queryKey: ["owner", GAME_CONTRACT_ADDRESS],
    queryFn: () => publicClient.readContract({ address: GAME_CONTRACT_ADDRESS, abi: GAME_ABI, functionName: "owner" }),
  });
  const paused = useQuery({
    queryKey: ["paused", GAME_CONTRACT_ADDRESS],
    queryFn: () => publicClient.readContract({ address: GAME_CONTRACT_ADDRESS, abi: GAME_ABI, functionName: "paused" }),
  });
  const readiness = useQuery({
    queryKey: ["agent-readiness", GAME_CONTRACT_ADDRESS],
    queryFn: () => api<{ ready: boolean; reason: string; agentAddress?: string; contractVersion: number }>("/api/blockchain/agent-info"),
    refetchInterval: 15_000,
  });
  const rounds = useQuery({
    queryKey: ["rounds", GAME_CONTRACT_ADDRESS],
    queryFn: () => api<{ rounds: RoundInfo[] }>("/api/blockchain/rounds"),
    refetchInterval: 10_000,
  });
  const isOwner = !!wallet.address && owner.data?.toLowerCase() === wallet.address.toLowerCase();
  const legacy = readiness.data?.contractVersion === 1;
  const latest = rounds.data?.rounds[0];

  async function transact(name: GameWrite, args: readonly unknown[] = []) {
    setError(""); setHash(""); setPending(name);
    try {
      const result = await sendGameTransaction(name, args);
      setHash(result.hash);
      await cache.invalidateQueries();
    } catch (failure) { setError(readableError(failure)); }
    finally { setPending(""); }
  }

  function createRound(event: FormEvent) {
    event.preventDefault();
    try {
      const stakeWei = parseEther(stake);
      const points = Number(tolerance);
      const seconds = Number(duration);
      const judging = Number(buffer);
      if (stakeWei < parseEther("0.001") || stakeWei > parseEther("10")) throw new Error("Stake must be 0.001–10 ETH");
      if (!Number.isFinite(points) || points < 0 || points > 2 || !Number.isInteger(points * 10)) {
        throw new Error("Tolerance must be 0–2 points in steps of 0.1");
      }
      if (![seconds, judging].every((value) => Number.isSafeInteger(value) && value > 0)) {
        throw new Error("Submission and judging durations must be positive whole seconds");
      }
      void transact("createRound", [stakeWei, BigInt(Math.round(points * 10)), BigInt(seconds), BigInt(judging)]);
    } catch (failure) { setError(readableError(failure)); }
  }

  const explorer = transactionUrl(hash);
  return <AppShell title="Contest administration" description="Create rounds, manage the trusted evaluator, and settle completed contests from the owner wallet.">
    <section className={panel}>
      <p className="break-all font-mono text-xs text-amber-100/60">Contract: {GAME_CONTRACT_ADDRESS}</p>
      <p className="mt-2 break-all text-sm">Owner: {owner.data || (owner.isError ? "Unable to read contract" : "Loading…")}</p>
      <p className="mt-2 text-sm text-amber-100/65">
        Evaluator: {readiness.data?.ready ? "Ready" : readiness.data?.reason || "Checking connection…"}
      </p>
      {readiness.data?.agentAddress && <p className="mt-2 break-all text-xs text-zinc-400">Agent: {readiness.data.agentAddress}</p>}
      {!isOwner && <p className="mt-4 text-sm text-amber-200">Connect the contract owner wallet to use owner controls.</p>}
      {legacy && <p className="mt-4 text-sm text-amber-200">The previous deployment cannot safely open a new contest. Configure the version 2 deployment to accept entries.</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button className={ghostButton} disabled={!isOwner || !!pending || paused.data === undefined}
          onClick={() => { void transact(paused.data ? "unpause" : "pause"); }}>
          {paused.data ? "Resume submissions" : "Pause submissions"}
        </button>
        <button className={ghostButton} onClick={() => { void cache.invalidateQueries(); }}>Refresh state</button>
      </div>
    </section>
    {pending && <p className="text-sm text-amber-200" role="status">Confirm {pending} in your wallet and wait for the transaction…</p>}
    {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
    {hash && <p className="break-all text-sm text-emerald-300">Transaction confirmed. {explorer ?
      <a href={explorer} target="_blank" rel="noopener noreferrer" className="underline">View transaction</a> : hash}</p>}
    <div className="grid gap-6 md:grid-cols-2">
      <form className={panel + " flex flex-col gap-4"} onSubmit={createRound}>
        <h2 className="text-xl font-semibold">Create round</h2>
        {latest?.isOpen && <p className="text-xs text-amber-200">Round #{latest.id} is accepting entries. Its submission window must close before another round opens.</p>}
        <label className="text-sm">Stake per entry (ETH)<input className={input + " mt-2"} value={stake} onChange={(event) => setStake(event.target.value)} required inputMode="decimal" /></label>
        <label className="text-sm">Score tolerance (0–2 points)<input className={input + " mt-2"} type="number" min="0" max="2" step="0.1" value={tolerance} onChange={(event) => setTolerance(event.target.value)} required /></label>
        <label className="text-sm">Submission window (seconds)<input className={input + " mt-2"} type="number" min="1" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} required /></label>
        <label className="text-sm">Extra judging window (seconds)<input className={input + " mt-2"} type="number" min="1" step="1" value={buffer} onChange={(event) => setBuffer(event.target.value)} required /></label>
        <button className={primaryButton} disabled={!isOwner || !!pending || !!latest?.isOpen || legacy || paused.data}>Create round</button>
      </form>
      <section className={panel + " flex flex-col gap-4"}>
        <h2 className="text-xl font-semibold">Trusted evaluator</h2>
        <p className="text-sm leading-relaxed text-amber-100/65">Only trusted wallets can record verified scores. The API wallet must match a trusted address and have ETH for gas.</p>
        <label className="text-sm">Agent wallet address<input className={input + " mt-2"} value={agent} onChange={(event) => setAgent(event.target.value)} placeholder="0x…" /></label>
        <div className="flex flex-wrap gap-3">
          <button className={primaryButton} disabled={!isOwner || !!pending || !isAddress(agent)}
            onClick={() => { void transact("setTrustedAgent", [agent, true]); }}>Trust agent</button>
          <button className={ghostButton} disabled={!isOwner || !!pending || !isAddress(agent)}
            onClick={() => { void transact("setTrustedAgent", [agent, false]); }}>Revoke agent</button>
        </div>
      </section>
    </div>
    <section className={panel}>
      <h2 className="text-xl font-semibold">Rounds</h2>
      {rounds.isError && <p className="mt-4 text-red-300">{readableError(rounds.error)}</p>}
      {rounds.data?.rounds.length === 0 && <p className="mt-4 text-sm text-zinc-400">Create the first round to open submissions.</p>}
      <div className="mt-4 space-y-4">
        {rounds.data?.rounds.map((round) => <div key={round.id} data-testid={"round-card-" + round.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/25 p-4">
          <div><p className="font-medium">Round #{round.id} · {round.phase}</p>
            <p className="mt-1 text-xs text-amber-100/60">{round.totalPoolEth} ETH deposited · {round.winnersCount} winning entries</p>
            <p className="mt-1 text-xs text-zinc-400">Submissions close {new Date(round.endTime * 1000).toLocaleString()}</p></div>
          <div className="flex flex-wrap gap-2">
            <button className={ghostButton} disabled={!!pending || round.isOpen || legacy}
              onClick={() => { void transact("finalizeRound", [BigInt(round.id)]); }}>Finalize</button>
            <button className={ghostButton} disabled={!isOwner || !!pending || round.feesWithdrawn || round.isOpen || legacy}
              onClick={() => { void transact("withdrawPlatformFees", [BigInt(round.id)]); }}>Withdraw fees</button>
          </div>
        </div>)}
      </div>
    </section>
  </AppShell>;
}
