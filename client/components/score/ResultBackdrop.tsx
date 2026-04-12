"use client";

import Image from "next/image";

/** From `result_*.svg` viewBox 0 0 999.75 × 600 — clip rects for the two score panels */
const VB_W = 999.75;
const VB_H = 600;

const YOUR_BOX = {
  left: (206.390625 / VB_W) * 100,
  top: (131.722656 / VB_H) * 100,
  width: (175.285156 / VB_W) * 100,
  height: (236.941406 / VB_H) * 100,
} as const;

const JUDGE_BOX = {
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
    <div className="relative w-full max-w-6xl select-none">
      <div
        className="relative mx-auto w-full overflow-hidden rounded-xl shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
        style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
      >
        <Image
          src={src}
          alt=""
          fill
          className="object-contain object-center"
          priority
          unoptimized
          sizes="(max-width: 1200px) 100vw, 1152px"
        />

        <div
          className="absolute flex items-center justify-center font-bold tabular-nums tracking-tight text-amber-100 drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]"
          style={{
            left: `${YOUR_BOX.left}%`,
            top: `${YOUR_BOX.top}%`,
            width: `${YOUR_BOX.width}%`,
            height: `${YOUR_BOX.height}%`,
            fontSize: "clamp(1.75rem, 5.5vw, 3.25rem)",
          }}
        >
          {formatScoreDisplay(yourScore)}
        </div>

        <div
          className="absolute flex items-center justify-center font-bold tabular-nums tracking-tight text-amber-100 drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]"
          style={{
            left: `${JUDGE_BOX.left}%`,
            top: `${JUDGE_BOX.top}%`,
            width: `${JUDGE_BOX.width}%`,
            height: `${JUDGE_BOX.height}%`,
            fontSize: "clamp(1.75rem, 5.5vw, 3.25rem)",
          }}
        >
          {formatScoreDisplay(judgeScore)}
        </div>
      </div>
    </div>
  );
}
