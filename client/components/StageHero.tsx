"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";

const START_SVG = "/images/START.svg";

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
              className="pointer-events-auto block rounded-lg no-underline transition-transform duration-150 hover:scale-[1.04] active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/50"
              aria-label="Start — open registration"
            >
              <Image
                src={START_SVG}
                alt=""
                width={280}
                height={280}
                unoptimized
                className="h-auto w-[min(18rem,82vw)] max-w-[360px] drop-shadow-[0_12px_40px_rgba(0,0,0,0.55)] sm:w-80 sm:max-w-[420px] md:w-96 md:max-w-none"
                priority
              />
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
