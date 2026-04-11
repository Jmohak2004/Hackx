"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

/** Place your file at `public/images/stage.mp4` */
const STAGE_VIDEO_SRC = "/images/stage.mp4";

export function StageHero() {
  const [hasEnded, setHasEnded] = useState(false);

  const handleEnded = useCallback(() => {
    setHasEnded(true);
  }, []);

  const handleError = useCallback(() => {
    setHasEnded(true);
  }, []);

  return (
    <section
      className="relative h-dvh w-screen max-w-[100vw] overflow-hidden bg-black"
      aria-label="Stage hero"
    >
      <video
        className="absolute inset-0 h-full w-full object-cover object-center"
        src={STAGE_VIDEO_SRC}
        playsInline
        muted
        autoPlay
        preload="auto"
        loop={false}
        onEnded={handleEnded}
        onError={handleError}
      />

      {hasEnded && (
        <>
          <div
            className="absolute inset-0 z-10 bg-black/35 backdrop-blur-2xl transition-[backdrop-filter,opacity] duration-500 ease-out"
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
            <Link
              href="/auth"
              className="group pointer-events-auto relative inline-flex rounded-2xl border-b-8 border-amber-800 bg-amber-400 px-8 py-4 font-bold tracking-wider text-amber-950 uppercase shadow-[0_15px_25px_-10px_rgba(217,119,6,0.75)] transition-all duration-100 hover:text-amber-950 focus:outline-none focus:ring-4 focus:ring-amber-300/60 active:translate-y-2 active:border-b-0 no-underline"
            >
              <span
                className="pointer-events-none absolute inset-0 h-full w-full rounded-2xl bg-linear-to-t from-black/20 to-transparent"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute left-3 top-2 h-3 w-6 rounded-full bg-white/40 blur-[2px]"
                aria-hidden
              />
              <span className="relative flex items-center justify-center gap-2 drop-shadow-md">
                <svg
                  className="h-6 w-6 animate-pulse"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                Start
              </span>
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
