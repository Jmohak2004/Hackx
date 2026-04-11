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
              className="group pointer-events-auto relative inline-flex items-center justify-center overflow-hidden rounded-md bg-gray-800 px-10 py-3 tracking-tighter text-white shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
            >
              <span className="absolute left-1/2 top-1/2 h-0 w-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-600 transition-all duration-500 ease-out group-hover:h-56 group-hover:w-56" />
              <span className="absolute bottom-0 left-0 -ml-2 h-full">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-full w-auto object-stretch opacity-100"
                  viewBox="0 0 487 487"
                  aria-hidden
                >
                  <path
                    fill="#FFF"
                    fillOpacity=".1"
                    fillRule="nonzero"
                    d="M0 .3c67 2.1 134.1 4.3 186.3 37 52.2 32.7 89.6 95.8 112.8 150.6 23.2 54.8 32.3 101.4 61.2 149.9 28.9 48.4 77.7 98.8 126.4 149.2H0V.3z"
                  />
                </svg>
              </span>
              <span className="absolute top-0 right-0 -mr-3 h-full w-12">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-full w-full object-cover"
                  viewBox="0 0 487 487"
                  aria-hidden
                >
                  <path
                    fill="#FFF"
                    fillOpacity=".1"
                    fillRule="nonzero"
                    d="M487 486.7c-66.1-3.6-132.3-7.3-186.3-37s-95.9-85.3-126.2-137.2c-30.4-51.8-49.3-99.9-76.5-151.4C70.9 109.6 35.6 54.8.3 0H487v486.7z"
                  />
                </svg>
              </span>
              <span className="absolute inset-0 -mt-1 h-full w-full rounded-lg bg-linear-to-b from-transparent via-transparent to-gray-200 opacity-30" />
              <span className="relative z-10 text-base font-semibold">Enter</span>
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
