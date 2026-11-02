"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEther, parseEther, type Address } from "viem";
import { useState } from "react";
import { GAME_ABI, GAME_CONTRACT_ADDRESS } from "./contract";
import { useWallet } from "@/context/WalletContext";
import { publicClient } from "./chain";
import { readableError, sendGameTransaction, type GameWrite } from "./transactions";
export { publicClient } from "./chain";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface RoundData {
  id: bigint;
  startTime: bigint;
  endTime: bigint;
  judgingDeadline: bigint;
  stakeAmount: bigint;
  scoreTolerance: bigint;
  totalPool: bigint;
  platformFeePool: bigint;
  winnersCount: bigint;
  isActive: boolean;
  feesWithdrawn: boolean;
}

export interface EntryData {
  participant: Address;
  roundId: bigint;
  selfScore: bigint;
  verifiedScore: bigint;
  githubUrl: string;
  websiteUrl: string;
  proofIpfsHash: string;
  scored: boolean;
  claimed: boolean;
  isWinner: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE HELPER
// ─────────────────────────────────────────────────────────────────────────────

function useContractWrite(fnName: GameWrite) {
  const { address } = useWallet();
  const qc = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const execute = async (args: unknown[], value?: bigint) => {
    setIsPending(true); setIsSuccess(false); setError(null);
    try {
      if (!address) throw new Error("Connect your wallet first");
      const result = await sendGameTransaction(fnName, args, {
        value, expectedAccount: address,
        onSubmitted: () => { setIsPending(false); setIsConfirming(true); },
      });
      setIsSuccess(true);
      await qc.invalidateQueries();
      return result;
    } catch (failure) { setError(new Error(readableError(failure))); }
    finally { setIsPending(false); setIsConfirming(false); }
  };
  return { execute, isPending, isConfirming, isSuccess, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useCurrentRoundId() {
  return useQuery<bigint>({
    queryKey: ["currentRoundId"],
    queryFn: () =>
      publicClient.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_ABI,
        functionName: "currentRoundId",
      }) as Promise<bigint>,
    staleTime: 10_000,
  });
}

export function useRound(roundId: bigint | undefined) {
  return useQuery<RoundData>({
    queryKey: ["getRound", roundId?.toString()],
    queryFn: () =>
      publicClient.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_ABI,
        functionName: "getRound",
        args: [roundId!],
      }) as Promise<RoundData>,
    enabled: roundId !== undefined && roundId > 0n,
    staleTime: 10_000,
  });
}

export function useRoundEntryIds(roundId: bigint | undefined) {
  return useQuery<bigint[]>({
    queryKey: ["getRoundEntries", roundId?.toString()],
    queryFn: () =>
      publicClient.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_ABI,
        functionName: "getRoundEntries",
        args: [roundId!],
      }) as Promise<bigint[]>,
    enabled: roundId !== undefined && roundId > 0n,
    staleTime: 10_000,
  });
}

export function useEntry(entryId: bigint | undefined) {
  return useQuery<EntryData>({
    queryKey: ["getEntry", entryId?.toString()],
    queryFn: () =>
      publicClient.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_ABI,
        functionName: "getEntry",
        args: [entryId!],
      }) as Promise<EntryData>,
    enabled: entryId !== undefined && entryId > 0n,
    staleTime: 10_000,
  });
}

export function useMyEntryId(roundId: bigint | undefined) {
  const { address } = useWallet();
  return useQuery<bigint>({
    queryKey: ["getMyEntry", roundId?.toString(), address],
    queryFn: () =>
      publicClient.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_ABI,
        functionName: "getMyEntry",
        args: [roundId!, address!],
      }) as Promise<bigint>,
    enabled: roundId !== undefined && roundId > 0n && !!address,
    staleTime: 10_000,
  });
}

export function usePrizePool(roundId: bigint | undefined) {
  return useQuery({
    queryKey: ["getPrizePool", roundId?.toString()],
    queryFn: () =>
      publicClient.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_ABI,
        functionName: "getPrizePool",
        args: [roundId!],
      }),
    enabled: roundId !== undefined && roundId > 0n,
    staleTime: 10_000,
  });
}

export function useWinnerShare(roundId: bigint | undefined) {
  return useQuery<bigint>({
    queryKey: ["getWinnerShare", roundId?.toString()],
    queryFn: () =>
      publicClient.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_ABI,
        functionName: "getWinnerShare",
        args: [roundId!],
      }) as Promise<bigint>,
    enabled: roundId !== undefined && roundId > 0n,
    staleTime: 10_000,
  });
}

export function useContractOwner() {
  return useQuery<Address>({
    queryKey: ["owner"],
    queryFn: () =>
      publicClient.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_ABI,
        functionName: "owner",
      }) as Promise<Address>,
    staleTime: 60_000,
  });
}

export function useIsPaused() {
  return useQuery<boolean>({
    queryKey: ["paused"],
    queryFn: () =>
      publicClient.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_ABI,
        functionName: "paused",
      }) as Promise<boolean>,
    staleTime: 15_000,
  });
}

export function useIsTrustedAgent(addr: Address | undefined) {
  return useQuery<boolean>({
    queryKey: ["trustedAgents", addr],
    queryFn: () =>
      publicClient.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_ABI,
        functionName: "trustedAgents",
        args: [addr!],
      }) as Promise<boolean>,
    enabled: !!addr,
    staleTime: 30_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useEnterGame() {
  const { execute, isPending, isConfirming, isSuccess, error } =
    useContractWrite("enterGame");

  const enterGame = (
    selfScore: number,
    githubUrl: string,
    websiteUrl: string,
    stakeWei: bigint
  ) => execute([BigInt(selfScore), githubUrl, websiteUrl], stakeWei);

  return { enterGame, isPending, isConfirming, isSuccess, error };
}

export function useClaimPrize() {
  const { execute, isPending, isConfirming, isSuccess, error } =
    useContractWrite("claimPrize");
  const claimPrize = (entryId: bigint) => execute([entryId]);
  return { claimPrize, isPending, isConfirming, isSuccess, error };
}

export function useClaimRefund() {
  const { execute, isPending, isConfirming, isSuccess, error } =
    useContractWrite("claimRefund");
  const claimRefund = (entryId: bigint) => execute([entryId]);
  return { claimRefund, isPending, isConfirming, isSuccess, error };
}

export function useCreateRound() {
  const { execute, isPending, isConfirming, isSuccess, error } =
    useContractWrite("createRound");

  const createRound = (
    stakeEth: string,
    scoreTolerance: number,
    durationSecs: number,
    judgingBufferSecs: number
  ) =>
    execute([
      parseEther(stakeEth),
      BigInt(scoreTolerance),
      BigInt(durationSecs),
      BigInt(judgingBufferSecs),
    ]);

  return { createRound, isPending, isConfirming, isSuccess, error };
}

export function useSubmitVerifiedScore() {
  const { execute, isPending, isConfirming, isSuccess, error } =
    useContractWrite("submitVerifiedScore");

  const submitScore = (
    entryId: bigint,
    verifiedScore: number,
    proofHash: string
  ) => execute([entryId, BigInt(verifiedScore), proofHash]);

  return { submitScore, isPending, isConfirming, isSuccess, error };
}

export function useSetTrustedAgent() {
  const { execute, isPending, isConfirming, isSuccess, error } =
    useContractWrite("setTrustedAgent");

  const setAgent = (agent: Address, trusted: boolean) =>
    execute([agent, trusted]);

  return { setAgent, isPending, isConfirming, isSuccess, error };
}

export function usePauseContract() {
  const { execute, isPending, isConfirming, isSuccess, error } =
    useContractWrite("pause");
  const pause = () => execute([]);
  return { pause, isPending, isConfirming, isSuccess, error };
}

export function useUnpauseContract() {
  const { execute, isPending, isConfirming, isSuccess, error } =
    useContractWrite("unpause");
  const unpause = () => execute([]);
  return { unpause, isPending, isConfirming, isSuccess, error };
}

export function useWithdrawFees() {
  const { execute, isPending, isConfirming, isSuccess, error } =
    useContractWrite("withdrawPlatformFees");
  const withdraw = (roundId: bigint) => execute([roundId]);
  return { withdraw, isPending, isConfirming, isSuccess, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function formatEthValue(wei: bigint | undefined): string {
  if (wei === undefined) return "0";
  return formatEther(wei);
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getRoundStatus(
  round: RoundData | undefined
): "none" | "open" | "judging" | "complete" {
  if (!round || round.id === 0n) return "none";
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now <= round.endTime && round.isActive) return "open";
  if (now <= round.judgingDeadline) return "judging";
  return "complete";
}
