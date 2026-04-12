"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const START_SVG = "/images/START.svg";
const STAGE_VIDEO_SRC = "/images/stage.mp4";
const MUSIC_SRC = "/sound/web_music.mp3";

export function StageHero() {
  const [audioStarted, setAudioStarted] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleTap = useCallback(() => {
    const audio = new Audio(MUSIC_SRC);
    audio.loop = true;
    audio.volume = 1;
    audioRef.current = audio;
    audio.play().catch(() => { });
    setAudioStarted(true);
  }, []);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const handleEnded = useCallback(() => {
    setHasEnded(true);
  }, []);

  const handleError = useCallback(() => {
    setHasEnded(true);
  }, []);

  if (!audioStarted) {
    return (
      <div
        className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 bg-black"
        onClick={handleTap}
      >
        <motion.div
          className="h-20 w-20 rounded-full border-2 border-amber-400/60"
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <p className="text-sm font-medium tracking-widest text-amber-200/70 uppercase">
          Tap to Enter
        </p>
      </div>
    );
  }

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

      <AnimatePresence>
        {hasEnded && (
          <>
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 z-10 bg-black/50 backdrop-blur-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              aria-hidden
            />

            {/* Content */}
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-0 p-6">
              {/* Title */}
              <motion.h1
                className="text-center text-5xl font-extrabold tracking-tight text-white sm:text-7xl md:text-8xl"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3 }}
              >
                India&apos;s Got{" "}
                <span className="bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
                  Score
                </span>
              </motion.h1>

              {/* Sub-tagline */}
              <motion.p
                className="text-center text-lg font-medium tracking-wide text-amber-200/80 italic sm:text-xl"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
              >
                Brag mat karo, prove karo
              </motion.p>

              {/* Golden ticket button */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.7 }}
              >
                <Link
                  href="/auth"
                  className="pointer-events-auto group relative block focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/50"
                  aria-label="Enter — open registration"
                >
                  <Image
                    src={START_SVG}
                    alt="Enter golden ticket"
                    width={280}
                    height={280}
                    unoptimized
                    className="h-auto w-64 drop-shadow-[0_0_30px_rgba(217,119,6,0.5)] transition-transform duration-300 group-hover:scale-105 sm:w-80"
                    priority
                  />
                </Link>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </section>
  );
}
