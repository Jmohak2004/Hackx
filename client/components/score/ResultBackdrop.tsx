"use client";

import Image from "next/image";

/** From `result_*.svg` viewBox 0 0 999.75 × 600 — clip rects for the two score panels */
const VB_W = 999.75;
const VB_H = 600;
const ASPECT = VB_W / VB_H;

/** Left card in the art = judge; right card = your score */
const JUDGE_BOX = {
  left: (206.390625 / VB_W) * 100,
  top: (131.722656 / VB_H) * 100,
  width: (175.285156 / VB_W) * 100,
  height: (236.941406 / VB_H) * 100,
} as const;

const YOUR_BOX = {
  left: (570.628906 / VB_W) * 100,
  top: (131.722656 / VB_H) * 100,
  width: (175.285156 / VB_W) * 100,
  height: (236.941406 / VB_H) * 100,
} as const;

function formatScoreDisplay(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const t = n.toFixed(1);
  return t.endsWith(".0") ? String(Math.round(n)) : t;
}

export function ResultBackdrop({
  variant,
  yourScore,
  judgeScore,
}: {
  variant: "match" | "mismatch";
  yourScore: number;
  judgeScore: number;
}) {
  const src = variant === "match" ? "/images/result_1.svg" : "/images/result_2.svg";

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-black select-none">
      <div
        className="absolute left-1/2 top-[35%] -translate-x-1/2 -translate-y-1/2 sm:top-1/2"
        style={{
          width: `min(100vw, calc(100dvh * ${ASPECT}))`,
          aspectRatio: String(ASPECT),
        }}
      >
        <Image
          src={src}
          alt=""
          fill
          className="object-cover object-center"
          priority
          unoptimized
          sizes="100vw"
        />

        <output
          aria-label="Judge score"
          className="absolute flex items-center justify-center font-bold tabular-nums tracking-tight text-black drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]"
          style={{
            left: `${JUDGE_BOX.left}%`,
            top: `${JUDGE_BOX.top}%`,
            width: `${JUDGE_BOX.width}%`,
            height: `${JUDGE_BOX.height}%`,
            fontSize: "clamp(1.75rem, 6vmin, 4rem)",
          }}
        >
          {formatScoreDisplay(judgeScore)}
        </output>

        <output
          aria-label="Your score"
          className="absolute flex items-center justify-center font-bold tabular-nums tracking-tight text-black drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]"
          style={{
            left: `${YOUR_BOX.left}%`,
            top: `${YOUR_BOX.top}%`,
            width: `${YOUR_BOX.width}%`,
            height: `${YOUR_BOX.height}%`,
            fontSize: "clamp(1.75rem, 6vmin, 4rem)",
          }}
        >
          {formatScoreDisplay(yourScore)}
        </output>
      </div>
    </div>
  );
}
