"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useConnect, useConnectors, useConnection } from "wagmi";
import { runWelcomeConfetti } from "./celebrate";

const panelClass =
  "rounded-2xl border border-amber-200/15 bg-zinc-950/50 p-6 shadow-[0_25px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl";
const inputClass =
  "w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2.5 text-sm text-amber-50 outline-none placeholder:text-white/35 focus:border-amber-400/45 focus:ring-2 focus:ring-amber-400/20";
const labelClass = "mb-1.5 block text-sm font-medium text-amber-100/85";
const btnPrimaryClass =
  "rounded-xl bg-linear-to-b from-amber-400 to-amber-600 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-900/30 transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";
const btnGhostClass =
  "rounded-xl border border-white/20 bg-black/25 px-4 py-2.5 text-sm font-medium text-amber-50/90 backdrop-blur-sm transition-colors hover:border-amber-300/35 hover:bg-black/40";

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

export function AuthWizard() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [hostedUrl, setHostedUrl] = useState("");
  const [score, setScore] = useState("");
  const [profileError, setProfileError] = useState("");
  const [scoreError, setScoreError] = useState("");

  const { address, isConnected, status } = useConnection();
  const connectors = useConnectors();
  const {
    mutate: connectWallet,
    isPending: isConnecting,
    variables: connectVariables,
    error: connectError,
  } = useConnect();

  useEffect(() => {
    if (step === 4) {
      runWelcomeConfetti();
    }
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

      {step === 4 ? (
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
          </div>
        </div>
      ) : (
        <>
          <header className="relative z-10 px-4 py-4">
            <div className="mx-auto flex max-w-lg items-center justify-between">
              <Link
                href="/"
                className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-sm text-amber-100/90 backdrop-blur-md transition-colors hover:border-amber-300/30 hover:bg-black/45"
              >
                ← Back
              </Link>
              <span className="w-20" aria-hidden />
            </div>
          </header>

          <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-8 px-4 pb-12 pt-2">
            <ol className="flex justify-center gap-2" aria-label="Steps">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                      step === n
                        ? "bg-amber-400 text-zinc-950 ring-2 ring-amber-200/50 shadow-[0_0_20px_rgba(251,191,36,0.35)]"
                        : step > n
                          ? "border border-amber-500/40 bg-amber-600/25 text-amber-100"
                          : "border border-white/10 bg-black/30 text-white/45"
                    }`}
                  >
                    {n}
                  </span>
                  {n < 3 && (
                    <span
                      className={`hidden h-px w-6 sm:block ${
                        step > n ? "bg-amber-500/40" : "bg-white/10"
                      }`}
                      aria-hidden
                    />
                  )}
                </li>
              ))}
            </ol>

            <div className={panelClass}>
          {step === 1 && (
            <form onSubmit={submitProfile} className="flex flex-col gap-5">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-white">
                  Your details
                </h1>
                <p className="mt-1 text-sm text-amber-100/65">
                  GitHub is required; hosted demo link is optional but recommended.
                </p>
              </div>

              <label className="block">
                <span className={labelClass}>Name</span>
                <input
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="Ada Lovelace"
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
                  <span className="font-normal text-white/45">(preferred)</span>
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
                <p className="text-sm text-red-300" role="alert">
                  {profileError}
                </p>
              )}

              <button type="submit" className={`${btnPrimaryClass} mt-1 w-full sm:w-auto`}>
                Continue
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={submitScore} className="flex flex-col gap-5">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-white">
                  Your score
                </h1>
                <p className="mt-1 text-sm text-amber-100/65">
                  Rate from <strong className="text-amber-100">1</strong> (lowest) to{" "}
                  <strong className="text-amber-100">10</strong> (highest). Whole numbers
                  only.
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
                <p className="text-sm text-red-300" role="alert">
                  {scoreError}
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setStep(1)} className={btnGhostClass}>
                  Back
                </button>
                <button
                  type="submit"
                  disabled={!scoreValid}
                  className={btnPrimaryClass}
                >
                  Continue
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-white">
                  Connect your wallet
                </h1>
                <p className="mt-1 text-sm text-amber-100/65">
                  Use a browser wallet (e.g. MetaMask, Rabby). Approve the connection when
                  prompted.
                </p>
              </div>

              {connectors.length === 0 && (
                <p className="text-sm text-amber-200/90">
                  No wallet connectors are available. Install{" "}
                  <a
                    href="https://metamask.io/download/"
                    className="underline decoration-amber-400/50 underline-offset-2 hover:text-white"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    MetaMask
                  </a>{" "}
                  or another EVM wallet, enable it for this site, then refresh the page.
                </p>
              )}

              {!isConnected && connectors.length > 0 && (
                <div className="flex flex-col gap-2">
                  {connectors.map((connector) => {
                    const isThis =
                      isConnecting && connectVariables?.connector === connector;
                    return (
                      <button
                        key={connector.uid}
                        type="button"
                        disabled={isConnecting}
                        onClick={() => connectWallet({ connector })}
                        className={btnPrimaryClass}
                      >
                        {isThis ? "Connecting…" : `Connect ${connector.name}`}
                      </button>
                    );
                  })}
                </div>
              )}

              {connectError && (
                <p className="text-sm text-red-300" role="alert">
                  {connectError.message.includes("Provider not found")
                    ? "No Ethereum provider found. Install MetaMask (or Rabby, etc.), unlock it, allow this site, then try again."
                    : connectError.message}
                </p>
              )}

              {isConnected && address && (
                <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-50 backdrop-blur-sm">
                  Wallet linked — taking you in…
                </p>
              )}

              {!isConnected && (
                <p className="text-xs text-white/40">Status: {status}</p>
              )}

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setStep(2)} className={btnGhostClass}>
                  Back
                </button>
              </div>
            </div>
          )}
            </div>
          </main>
        </>
      )}
    </div>
  );
}
