"use client";

import Link from "next/link";

/** Full arena UI depends on components not yet in this repo; replace when available. */
export default function ArenaPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center text-white">
      <h1 className="mb-4 font-semibold tracking-tight">Arena</h1>
      <p className="mb-8 text-sm text-white/60">
        Arena components (wallet, rounds, entry form) are not checked in yet. The home stage hero is available at{" "}
        <Link href="/" className="text-cyan-400 underline underline-offset-2">
          /
        </Link>
        .
      </p>
      <Link
        href="/"
        className="inline-flex rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
      >
        Back home
      </Link>
    </div>
  );
}
