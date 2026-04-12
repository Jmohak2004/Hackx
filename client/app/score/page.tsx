"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { runJudgeMatchConfetti } from "@/components/auth/celebrate";
import { ResultBackdrop } from "@/components/score/ResultBackdrop";

interface ScoreData {
  user_score: number;
  ai_score: number;
}

function ResultsContent() {
  const params = useSearchParams();
  const raw = params.get("d");

  if (!raw) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-center text-white">
        <p className="text-lg text-zinc-400">No result data found.</p>
        <Link
          href="/auth"
          className="mt-6 rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm hover:bg-white/10"
        >
          ← Go back
        </Link>
      </div>
    );
  }

  let data: ScoreData;
  try {
    data = JSON.parse(decodeURIComponent(raw)) as ScoreData;
  } catch {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-center text-white">
        <p className="text-lg text-zinc-400">Failed to parse result data.</p>
        <Link
          href="/auth"
          className="mt-6 rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm hover:bg-white/10"
        >
          ← Go back
        </Link>
      </div>
    );
  }

  const scoresMatch =
    Math.round(Number(data.user_score)) === Math.round(Number(data.ai_score));
  const resultVariant = scoresMatch ? "match" : "mismatch";

  const confettiOnce = useRef(false);
  useEffect(() => {
    if (!scoresMatch || confettiOnce.current) return;
    confettiOnce.current = true;
    runJudgeMatchConfetti();
  }, [scoresMatch]);

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-black">
      <ResultBackdrop
        variant={resultVariant}
        yourScore={data.user_score}
        judgeScore={data.ai_score}
      />
    </div>
  );
}

export default function ScorePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-black text-white">
          <p className="text-sm text-zinc-500">Loading results…</p>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
