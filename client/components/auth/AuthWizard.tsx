"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnect, useConnectors, useAccount } from "wagmi";
import { runWelcomeConfetti } from "./celebrate";

/** Three sequential plays (left panel). Uses one file three times until load_2.mp4 / load_3.mp4 exist in public/images. */
const LOADER_CLIPS = [
  "/images/load_1.mp4",
  "/images/load_1.mp4",
  "/images/load_1.mp4",
] as const;

const ANALYSIS_PHASES = [
  {
    title: "GitHub source",
    detail: "Pulling repo metadata, default branch, and activity signals…",
  },
  {
    title: "Hosted URL",
    detail: "Checking your live deployment and reachability…",
  },
  {
    title: "Project snapshot",
    detail: "Merging wallet, score, and links for your hack profile…",
  },
] as const;

const panelClass =
  "rounded-2xl border border-amber-200/15 bg-zinc-950/60 px-7 pt-6 pb-8 shadow-[0_25px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:px-9 sm:pt-7 sm:pb-9 md:px-10 md:pt-8 md:pb-10";
const inputClass =
  "w-full rounded-xl border border-white/15 bg-black/35 px-4 py-3 text-sm text-amber-50 outline-none placeholder:text-white/35 focus:border-amber-400/45 focus:ring-2 focus:ring-amber-400/20 transition-colors";
const labelClass = "mb-2 block text-sm font-medium text-amber-100/85";
const btnPrimaryClass =
  "rounded-xl bg-linear-to-b from-amber-400 to-amber-600 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-900/30 transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";
const btnGhostClass =
  "rounded-xl border border-white/20 bg-black/25 px-5 py-3 text-sm font-medium text-amber-50/90 backdrop-blur-sm transition-colors hover:border-amber-300/35 hover:bg-black/40";

const STEPS = [
  { n: 1 as const, label: "Details" },
  { n: 2 as const, label: "Score" },
  { n: 3 as const, label: "Wallet" },
] as const;

function isValidGithubUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return /github\.com$/i.test(u.hostname.replace(/^www\./, ""));
  } catch {
    return false;
  }
}

function isValidOptionalHostedUrl(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const AI_API_BASE =
  process.env.NEXT_PUBLIC_AI_API_URL ?? "http://localhost:8000";

type PhaseStatus = "pending" | "active" | "done" | "error";

function ProcessingLoader({
  githubUrl,
  hostedUrl,
  selfScore,
  onComplete,
}: {
  githubUrl: string;
  hostedUrl: string;
  selfScore: number;
  onComplete: () => void;
}) {
  const router = useRouter();
  const [clipIndex, setClipIndex] = useState(0);
  const clipIndexRef = useRef(0);
  clipIndexRef.current = clipIndex;

  const [phaseStatuses, setPhaseStatuses] = useState<PhaseStatus[]>([
    "active", "pending", "pending",
  ]);
  const [logs, setLogs] = useState<string[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const hasCalled = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const pushLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, msg]);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (hasCalled.current) return;
    hasCalled.current = true;

    async function runPipeline() {
      pushLog(`[UI] Calling AI scoring API at ${AI_API_BASE}/score`);
      pushLog(`[UI] github_url=${githubUrl}`);
      pushLog(`[UI] hosted_url=${hostedUrl}`);
      pushLog(`[UI] self_score=${selfScore}`);

      setPhaseStatuses(["active", "pending", "pending"]);

      try {
        const resp = await fetch(`${AI_API_BASE}/score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            github_url: githubUrl,
            hosted_url: hostedUrl,
            self_score: selfScore,
          }),
        });

        setPhaseStatuses(["done", "active", "pending"]);
        pushLog(`[UI] API responded with status ${resp.status}`);

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`API error ${resp.status}: ${errText.slice(0, 300)}`);
        }

        const data = await resp.json();

        // Stream logs from API response into the UI console
        if (Array.isArray(data.logs)) {
          for (const line of data.logs as string[]) {
            pushLog(line);
          }
        }
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          for (const e of data.errors as string[]) {
            pushLog(`[WARN] ${e}`);
          }
        }

        setPhaseStatuses(["done", "done", "active"]);
        pushLog(`[UI] Scores received — user=${data.user_score} ai=${data.ai_score} github=${data.github_score} avg=${data.avg_score}`);
        pushLog(`[UI] user_wins=${data.user_wins}  Redirecting to results page…`);

        await new Promise((r) => setTimeout(r, 800));
        setPhaseStatuses(["done", "done", "done"]);

        // Navigate to /score with result encoded
        const params = new URLSearchParams({
          d: encodeURIComponent(JSON.stringify(data)),
        });
        router.push(`/score?${params.toString()}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        pushLog(`[ERROR] ${msg}`);
        setApiError(msg);
        setPhaseStatuses((prev) =>
          prev.map((s) => (s === "active" ? "error" : s))
        );
      }
    }

    runPipeline();
  }, [githubUrl, hostedUrl, selfScore, pushLog, router]);

  const handleEnded = useCallback(() => {
    const i = clipIndexRef.current;
    if (i < LOADER_CLIPS.length - 1) setClipIndex(i + 1);
  }, []);

  const handleError = useCallback(() => {
    const i = clipIndexRef.current;
    if (i < LOADER_CLIPS.length - 1) setClipIndex(i + 1);
  }, []);

  return (
    <div className="relative z-20 flex min-h-dvh w-full flex-col bg-zinc-950/90 md:flex-row">
      <Link
        href="/"
        className="absolute right-4 top-4 z-30 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-amber-100/90 backdrop-blur-md transition-colors hover:border-amber-300/35 hover:bg-black/55 sm:right-5 sm:top-5 sm:px-4 sm:py-2"
      >
        Home
      </Link>

      <div className="relative flex min-h-[42vh] w-full shrink-0 border-b border-white/10 md:min-h-0 md:w-1/2 md:border-b-0 md:border-r">
        <video
          key={clipIndex}
          className="h-full w-full object-cover"
          src={LOADER_CLIPS[clipIndex]}
          autoPlay
          playsInline
          muted
          onEnded={handleEnded}
          onError={handleError}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-black/30"
          aria-hidden
        />
        <p className="absolute bottom-4 left-4 right-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-white/70 md:text-left">
          Clip {clipIndex + 1} / {LOADER_CLIPS.length}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center px-6 py-10 sm:px-10 md:py-16 md:pl-12 md:pr-10">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-amber-200/75">
          Processing
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white [font-family:var(--font-heading)] sm:text-3xl">
          Analyzing your project
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
          Hang tight while we process your GitHub link
          {hostedUrl.trim() ? " and hosted URL" : ""}. This usually takes a moment.
        </p>

        <ul className="mt-8 flex max-w-lg flex-col gap-3" aria-label="Analysis progress">
          {ANALYSIS_PHASES.map((phase, i) => {
            const status = phaseStatuses[i] ?? "pending";
            return (
              <li
                key={phase.title}
                className={`flex gap-4 rounded-xl border px-4 py-3.5 transition-colors ${status === "active"
                  ? "border-amber-400/35 bg-amber-500/10"
                  : status === "done"
                    ? "border-emerald-500/20 bg-white/[0.04]"
                    : status === "error"
                      ? "border-red-400/30 bg-red-500/10"
                      : "border-white/[0.06] bg-black/20 opacity-60"
                  }`}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${status === "done"
                    ? "bg-emerald-500/25 text-emerald-300"
                    : status === "active"
                      ? "bg-amber-400/20 text-amber-200"
                      : status === "error"
                        ? "bg-red-500/20 text-red-300"
                        : "bg-white/10 text-white/40"
                    }`}
                  aria-hidden
                >
                  {status === "done" ? "✓" : status === "error" ? "✕" : status === "active" ? (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-zinc-100">{phase.title}</p>
                  <p className="mt-1 text-sm text-zinc-500">{phase.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>

        {apiError && (
          <div className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <p className="font-semibold">Scoring error — details below</p>
            <p className="mt-1 font-mono text-xs break-all">{apiError}</p>
          </div>
        )}

        {/* Live log console */}
        <div className="mt-6 max-h-48 overflow-y-auto rounded-xl border border-white/[0.08] bg-black/40 px-4 py-3 text-xs">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Pipeline logs</p>
          {logs.length === 0 ? (
            <p className="text-zinc-600 italic">Starting…</p>
          ) : (
            logs.map((line, idx) => (
              <p
                key={idx}
                className={`font-mono text-[11px] leading-relaxed ${line.startsWith("[ERROR]")
                  ? "text-red-400"
                  : line.startsWith("[WARN]")
                    ? "text-amber-400"
                    : line.startsWith("[Result]")
                      ? "text-emerald-400"
                      : "text-zinc-400"
                  }`}
              >
                {line}
              </p>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3">
          <p className="font-mono text-[11px] leading-relaxed break-all text-zinc-400">
            <span className="text-zinc-500">github </span>
            {githubUrl.trim() || "—"}
          </p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed break-all text-zinc-400">
            <span className="text-zinc-500">hosted </span>
            {hostedUrl.trim() || "(none)"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AuthWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [hostedUrl, setHostedUrl] = useState("");
  const [score, setScore] = useState("");
  const [profileError, setProfileError] = useState("");
  const [scoreError, setScoreError] = useState("");

  const { address, isConnected, status } = useAccount();
  const connectors = useConnectors();
  const {
    mutate: connectWallet,
    isPending: isConnecting,
    variables: connectVariables,
    error: connectError,
  } = useConnect();

  useEffect(() => {
    if (step !== 4) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setTimeout(() => runWelcomeConfetti(), 120);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    if (step !== 3 || !isConnected || !address) return;
    setStep(4);
  }, [step, isConnected, address]);

  function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError("");
    const n = name.trim();
    const gh = githubUrl.trim();
    const host = hostedUrl.trim();
    if (!n) {
      setProfileError("Please enter your name.");
      return;
    }
    if (!gh) {
      setProfileError("GitHub profile or repo URL is required.");
      return;
    }
    if (!isValidGithubUrl(gh)) {
      setProfileError("Enter a valid GitHub URL (e.g. https://github.com/you).");
      return;
    }
    if (!isValidOptionalHostedUrl(host)) {
      setProfileError("Hosted link must be a valid http(s) URL, or leave it empty.");
      return;
    }
    setStep(2);
  }

  function submitScore(e: React.FormEvent) {
    e.preventDefault();
    setScoreError("");
    const s = score.trim();
    const n = Number(s);
    if (s === "" || Number.isNaN(n)) {
      setScoreError("Enter a whole number from 1 to 10.");
      return;
    }
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      setScoreError("Score must be a whole number between 1 and 10.");
      return;
    }
    setStep(3);
  }

  const scoreNum = Number(score.trim());
  const scoreValid =
    score.trim() !== "" &&
    Number.isInteger(scoreNum) &&
    scoreNum >= 1 &&
    scoreNum <= 10;

  return (
    <div className="relative min-h-dvh w-full overflow-hidden text-amber-50">
      {step <= 4 && (
        <>
          <Image
            src="/images/authStage.svg"
            alt=""
            fill
            priority
            unoptimized
            className="object-cover object-center"
            sizes="100vw"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/55 via-black/45 to-black/75"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_100%,rgba(180,83,9,0.12),transparent_55%)]"
            aria-hidden
          />
        </>
      )}

      {step === 5 ? (
        <ProcessingLoader
          githubUrl={githubUrl}
          hostedUrl={hostedUrl}
          selfScore={Number(score.trim()) || 1}
          onComplete={() => router.push("/")}
        />
      ) : step === 4 ? (
        <div className="relative z-20 flex min-h-dvh flex-col">
          <Link
            href="/"
            className="absolute right-5 top-5 z-30 rounded-full border border-white/15 bg-black/35 px-4 py-2 text-sm text-amber-100/90 backdrop-blur-md transition-colors hover:border-amber-300/35 hover:bg-black/50"
          >
            Home
          </Link>
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 pt-20 text-center">
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.35em] text-amber-200/85">
              You&apos;re in
            </p>
            <h1 className="max-w-4xl text-4xl font-bold leading-tight tracking-tight text-white drop-shadow-[0_6px_32px_rgba(0,0,0,0.92)] sm:text-5xl md:text-6xl lg:text-7xl">
              Welcome, {name.trim()}!
            </h1>
            <p className="mt-8 max-w-md text-base text-amber-50/80 sm:text-lg">
              Thanks for completing registration.
            </p>
            <button
              type="button"
              onClick={() => setStep(5)}
              className={`${btnPrimaryClass} mt-10 w-full max-w-sm`}
            >
              Analyze my project
            </button>
            <p className="mt-4 max-w-sm text-xs text-amber-100/50">
              Next we&apos;ll process your GitHub and hosted links while the loader runs.
            </p>
          </div>
        </div>
      ) : (
        <div className="relative z-20 flex min-h-dvh flex-col">
          <header className="shrink-0 border-b border-white/6 bg-black/25 px-5 py-3.5 backdrop-blur-md sm:px-8 sm:py-4 md:px-10">
            <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
              <Link
                href="/"
                className="justify-self-start rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-sm text-amber-100/90 backdrop-blur-md transition-colors hover:border-amber-300/30 hover:bg-black/45"
              >
                ← Back
              </Link>
              <p className="justify-self-center text-center text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-amber-200/75 [font-family:var(--font-heading)] sm:text-xs sm:tracking-[0.32em]">
                Register
              </p>
              <span className="justify-self-end" aria-hidden />
            </div>
          </header>

          <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-5 pt-10 pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] sm:px-8 sm:pt-12 sm:pb-[max(3rem,env(safe-area-inset-bottom,0px))] md:px-10 lg:px-12">
            <div className="mx-auto flex w-full max-w-lg flex-col gap-10">

              {/* Step indicator */}
              <nav aria-label="Steps">
                <ol className="flex w-full items-center">
                  {STEPS.map((item, i) => (
                    <li
                      key={item.n}
                      className="flex min-w-0 flex-1 items-center"
                      aria-current={step === item.n ? "step" : undefined}
                    >
                      {i > 0 ? (
                        <div
                          className={`h-px min-w-2 flex-1 transition-colors duration-300 ${step > STEPS[i - 1]!.n ? "bg-amber-500/50" : "bg-white/10"
                            }`}
                          aria-hidden
                        />
                      ) : (
                        <div className="min-w-2 flex-1" aria-hidden />
                      )}
                      <div className="flex shrink-0 flex-col items-center gap-2 px-2">
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${step === item.n
                            ? "bg-amber-400 text-zinc-950 ring-2 ring-amber-200/50 shadow-[0_0_20px_rgba(251,191,36,0.35)]"
                            : step > item.n
                              ? "border border-amber-500/40 bg-amber-600/25 text-amber-100"
                              : "border border-white/10 bg-black/30 text-white/40"
                            }`}
                        >
                          {step > item.n ? (
                            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                              <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : item.n}
                        </span>
                        <span
                          className={`text-[0.65rem] font-medium uppercase tracking-wide transition-colors duration-300 sm:text-[11px] ${step === item.n
                            ? "text-amber-200/90"
                            : step > item.n
                              ? "text-amber-100/55"
                              : "text-white/30"
                            }`}
                        >
                          {item.label}
                        </span>
                      </div>
                      {i < STEPS.length - 1 ? (
                        <div
                          className={`h-px min-w-2 flex-1 transition-colors duration-300 ${step > item.n ? "bg-amber-500/50" : "bg-white/10"
                            }`}
                          aria-hidden
                        />
                      ) : (
                        <div className="min-w-2 flex-1" aria-hidden />
                      )}
                    </li>
                  ))}
                </ol>
              </nav>

              {/* Panel */}
              <div className={panelClass}>
                {step === 1 && (
                  <form onSubmit={submitProfile} className="flex flex-col gap-4">
                    <div>
                      <h1 className="text-xl font-semibold tracking-tight text-white">
                        Your details
                      </h1>
                      <p className="mt-0.5 text-sm text-amber-100/60">
                        GitHub is required; hosted demo link is optional but recommended.
                      </p>
                    </div>

                    <div className="h-px bg-white/[0.06]" aria-hidden />

                    <label className="block">
                      <span className={labelClass}>Name</span>
                      <input
                        required
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={inputClass}
                        placeholder="Mohak Jaiswal"
                      />
                    </label>

                    <label className="block">
                      <span className={labelClass}>
                        GitHub link <span className="text-amber-300">*</span>
                      </span>
                      <input
                        required
                        type="url"
                        inputMode="url"
                        value={githubUrl}
                        onChange={(e) => setGithubUrl(e.target.value)}
                        className={inputClass}
                        placeholder="https://github.com/your-username"
                      />
                    </label>

                    <label className="block">
                      <span className={labelClass}>
                        Hosted link{" "}
                        <span className="font-normal text-white/40">(preferred)</span>
                      </span>
                      <input
                        type="url"
                        inputMode="url"
                        value={hostedUrl}
                        onChange={(e) => setHostedUrl(e.target.value)}
                        className={inputClass}
                        placeholder="https://your-demo.vercel.app"
                      />
                    </label>

                    {profileError && (
                      <p className="rounded-lg bg-red-500/10 border border-red-400/20 px-4 py-2.5 text-sm text-red-300" role="alert">
                        {profileError}
                      </p>
                    )}

                    <button type="submit" className={`${btnPrimaryClass} mt-2 w-full`}>
                      Continue
                    </button>
                  </form>
                )}

                {step === 2 && (
                  <form onSubmit={submitScore} className="flex flex-col gap-6">
                    <div className="space-y-1">
                      <h1 className="text-xl font-semibold tracking-tight text-white">
                        Your score
                      </h1>
                      <p className="text-sm text-amber-100/60">
                        Rate from <strong className="text-amber-200 font-semibold">1</strong> (lowest) to{" "}
                        <strong className="text-amber-200 font-semibold">10</strong> (highest). Whole numbers only.
                      </p>
                    </div>

                    <label className="block">
                      <span className={labelClass}>Score (1–10)</span>
                      <input
                        required
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={10}
                        step={1}
                        value={score}
                        onChange={(e) => {
                          setScore(e.target.value);
                          setScoreError("");
                        }}
                        className={inputClass}
                        placeholder="e.g. 8"
                      />
                    </label>

                    {scoreError && (
                      <p className="rounded-lg bg-red-500/10 border border-red-400/20 px-4 py-2.5 text-sm text-red-300" role="alert">
                        {scoreError}
                      </p>
                    )}

                    <div className="flex flex-col gap-3 pt-1 sm:flex-row-reverse">
                      <button
                        type="submit"
                        disabled={!scoreValid}
                        className={`${btnPrimaryClass} w-full sm:flex-1`}
                      >
                        Continue
                      </button>
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className={`${btnGhostClass} w-full sm:w-auto`}
                      >
                        Back
                      </button>
                    </div>
                  </form>
                )}

                {step === 3 && (
                  <div className="flex flex-col gap-6">
                    <div className="space-y-1">
                      <h1 className="text-xl font-semibold tracking-tight text-white">
                        Connect your wallet
                      </h1>
                      <p className="text-sm text-amber-100/60">
                        Use a browser wallet (e.g. MetaMask, Rabby). Approve the connection when prompted.
                      </p>
                    </div>

                    {connectors.length === 0 && (
                      <div className="rounded-xl border border-amber-400/15 bg-amber-500/8 px-5 py-4">
                        <p className="text-sm text-amber-200/90">
                          No wallet connectors available. Install{" "}
                          <a
                            href="https://metamask.io/download/"
                            className="underline decoration-amber-400/50 underline-offset-2 hover:text-white"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            MetaMask
                          </a>{" "}
                          or another EVM wallet, enable it for this site, then refresh.
                        </p>
                      </div>
                    )}

                    {!isConnected && connectors.length > 0 && (
                      <ul className="flex flex-col gap-3" role="list">
                        {connectors.map((connector) => {
                          const isThis =
                            isConnecting && connectVariables?.connector === connector;
                          return (
                            <li key={connector.uid}>
                              <button
                                type="button"
                                disabled={isConnecting}
                                onClick={() => connectWallet({ connector })}
                                className={`${btnPrimaryClass} inline-flex w-full items-center justify-center gap-2`}
                              >
                                {isThis && (
                                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                )}
                                {isThis ? "Connecting…" : `Connect ${connector.name}`}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {connectError && (
                      <p className="rounded-lg bg-red-500/10 border border-red-400/20 px-4 py-2.5 text-sm text-red-300" role="alert">
                        {connectError.message.includes("Provider not found")
                          ? "No Ethereum provider found. Install MetaMask (or Rabby, etc.), unlock it, allow this site, then try again."
                          : connectError.message}
                      </p>
                    )}

                    {isConnected && address && (
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-5 py-3.5">
                        <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <p className="text-sm text-emerald-300">
                          Wallet linked — taking you in…
                        </p>
                      </div>
                    )}

                    {!isConnected && (
                      <p className="text-xs text-zinc-500">Status: {status}</p>
                    )}

                    <div className="border-t border-white/[0.06] pt-5">
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        className={`${btnGhostClass} w-full`}
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </main>
        </div>
      )}
    </div>
  );
}