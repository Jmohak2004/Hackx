"use client";
import type { Address, Hash } from "viem";
import { GAME_CONTRACT_ADDRESS } from "./contract";
import { SUPPORTED_CHAIN } from "./chain";

export interface SavedSubmission {
  account: Address;
  txHash: Hash;
  entryId?: string;
  roundId: string;
  githubUrl: string;
  hostedUrl: string;
  selfScore: number;
  createdAt: number;
  status?: "pending" | "confirmed" | "reverted";
}

function key(account: string) {
  return ["hackx", "submissions", SUPPORTED_CHAIN.id, GAME_CONTRACT_ADDRESS.toLowerCase(),
    SUPPORTED_CHAIN.id === 31337 ? process.env.NEXT_PUBLIC_LOCAL_RUN_ID || "local" : "public",
    account.toLowerCase()].join(":");
}
export function savedSubmissions(account: string): SavedSubmission[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key(account)) || "[]");
    return Array.isArray(stored) ? stored.filter((item) =>
      item && typeof item === "object" && /^0x[a-fA-F0-9]{64}$/.test(item.txHash)
    ).slice(-30) : [];
  } catch { return []; }
}
export function saveSubmission(submission: SavedSubmission): boolean {
  try {
    const existing = savedSubmissions(submission.account).filter((item) => item.txHash !== submission.txHash);
    localStorage.setItem(key(submission.account), JSON.stringify([...existing, submission].slice(-30)));
    return true;
  } catch { return false; }
}
