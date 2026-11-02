"use client";
import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useWallet } from "@/context/WalletContext";
import { SUPPORTED_CHAIN } from "@/lib/chain";
import { readableError } from "@/lib/transactions";

export const panel = "rounded-2xl border border-amber-200/15 bg-zinc-950/70 p-6 shadow-[0_25px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:p-8";
export const input = "w-full rounded-xl border border-white/15 bg-black/35 px-4 py-3 text-sm text-amber-50 outline-none placeholder:text-white/35 focus:border-amber-400/45 focus:ring-2 focus:ring-amber-400/20";
export const primaryButton = "rounded-xl bg-linear-to-b from-amber-400 to-amber-600 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-900/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";
export const ghostButton = "rounded-xl border border-white/20 bg-black/25 px-4 py-2.5 text-sm text-amber-50/90 hover:border-amber-300/35 disabled:opacity-40";

export function AppShell({ title, description, children }: {
  title: string; description: string; children: ReactNode;
}) {
  const wallet = useWallet();
  const [error, setError] = useState("");
  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden text-amber-50">
      <Image src="/images/authStage.svg" alt="" fill unoptimized priority className="fixed object-cover object-center" sizes="100vw" />
      <div className="pointer-events-none fixed inset-0 bg-linear-to-b from-black/65 via-black/65 to-black/90" aria-hidden />
      <header className="relative z-10 border-b border-white/10 bg-black/25 px-5 py-4 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/" className="font-semibold tracking-wide text-amber-200">HackX</Link>
            <Link href="/arena">Arena</Link><Link href="/auth">Submit</Link>
            <Link href="/leaderboard">Leaderboard</Link><Link href="/graph">Graph</Link>
            <Link href="/admin">Admin</Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-xs text-amber-100/60">{SUPPORTED_CHAIN.name}</span>
            {wallet.address ? (
              <button className={ghostButton} onClick={wallet.disconnect}
                title={wallet.address + " — disconnect"}>
                {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
              </button>
            ) : (
              <button className={ghostButton} disabled={wallet.isConnecting}
                onClick={() => { void wallet.connect().catch((failure) => setError(readableError(failure))); }}>
                {wallet.isConnecting ? "Connecting…" : "Connect wallet"}
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8 sm:py-14">
        <div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-amber-50/65">{description}</p></div>
        {(error || wallet.error) && <p role="alert" className="text-sm text-red-300">{error || wallet.error}</p>}
        {children}
      </main>
    </div>
  );
}
