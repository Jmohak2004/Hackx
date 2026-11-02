export const API_BASE = (process.env.NEXT_PUBLIC_SERVER_URL || "/api/backend").replace(/\/+$/, "");

export interface RoundInfo {
  id: string;
  startTime: number;
  endTime: number;
  judgingDeadline: number;
  stakeAmount: string;
  stakeAmountEth: string;
  scoreTolerance: number;
  totalPool: string;
  totalPoolEth: string;
  platformFeePool: string;
  winnersCount: number;
  isActive: boolean;
  isOpen: boolean;
  feesWithdrawn: boolean;
  chainTimestamp: number;
  paused: boolean;
  phase: "open" | "paused" | "judging" | "complete";
}

export interface EntryInfo {
  id: string;
  participant: string;
  roundId: string;
  selfScore: number;
  verifiedScore: number;
  githubUrl: string;
  websiteUrl: string;
  proofIpfsHash: string;
  scored: boolean;
  claimed: boolean;
  isWinner: boolean;
  contractVersion: number;
}

export interface EntryState {
  entry: EntryInfo;
  round: RoundInfo;
  settlement: { ready: boolean; winnerShare: string; platformFee: string; refundAll: boolean } | null;
  canClaimPrize: boolean;
  canClaimRefund: boolean;
  claimAmount: string;
}

export interface EvaluationResult {
  github_url: string;
  hosted_url: string;
  page_title: string;
  user_score: number;
  ai_score: number;
  github_score: number | null;
  avg_score: number;
  summary: string;
  delta: number;
  honest: boolean;
  user_wins: boolean;
  breakdown: Record<string, { score: number; reasoning: string }>;
  lighthouse: Record<string, number>;
  errors: string[];
  logs: string[];
  roasts?: string[];
  repo_id?: string;
  commit_sha?: string;
  chain: {
    entryId: string;
    roundId: string;
    participant: string;
    chainId: number;
    contractAddress: string;
    proofHash: string;
    scoreTxHash: string | null;
    isWinnerOnChain: boolean;
    claimed: boolean;
    claimTxHash: string | null;
    contractVersion: number;
  };
}

export interface EvaluationJob {
  id: string;
  entryId: string;
  status: "queued" | "validating" | "evaluating" | "submitting" | "confirming" | "succeeded" | "failed";
  logs: string[];
  error: { code: string; message: string } | null;
  result?: EvaluationResult;
}

export interface Readiness {
  ready: boolean;
  reason: string;
  scorer: boolean;
  chain: { chainId: number; contractAddress: string; contractVersion: number; ready: boolean; reason: string };
  round: RoundInfo | null;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(API_BASE + path, { ...options, headers, cache: "no-store" });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch {
    throw new ApiError("The API returned an invalid response. Check that the backend is running.", response.status);
  }
  if (!response.ok) throw new ApiError(data.error || data.reason || "Request failed", response.status, data.code);
  return data as T;
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function watchEvaluation(
  entryId: string,
  options: { signal: AbortSignal; retry?: boolean; onJob: (job: EvaluationJob) => void },
): Promise<EvaluationResult> {
  let job = await api<EvaluationJob>("/api/evaluations", {
    method: "POST", body: JSON.stringify({ entryId, retry: options.retry }), signal: options.signal,
  });
  const deadline = Date.now() + 10 * 60_000;
  while (!options.signal.aborted) {
    options.onJob(job);
    if (job.status === "failed") throw new ApiError(job.error?.message || "Evaluation failed", 502, job.error?.code);
    if (job.status === "succeeded" && job.result) return job.result;
    if (Date.now() > deadline) throw new Error("Evaluation is still running. Reopen this entry from Arena to resume.");
    await delay(1500, options.signal);
    job = await api<EvaluationJob>("/api/evaluations/" + entryId, { signal: options.signal });
  }
  throw new DOMException("Aborted", "AbortError");
}
