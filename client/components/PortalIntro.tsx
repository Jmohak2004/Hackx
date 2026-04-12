"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

const LOGO_VIDEO_SRC = "/images/load_1.mp4";
const MUSIC_SRC = "/sound/web_music.mp3";
const WAIT_DURATION = 0.6;
const PORTAL_DURATION = 1.4;
const ZOOM_SPRING = { stiffness: 100, damping: 20, mass: 1 };

interface PortalIntroProps {
  onComplete?: () => void;
}

export function PortalIntro({ onComplete }: PortalIntroProps) {
  const [videoEnded, setVideoEnded] = useState(false);
  const [started, setStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleStart = useCallback(() => {
    setStarted(true);
    const audio = new Audio(MUSIC_SRC);
    audio.volume = 0;
    audio.loop = false;
    audioRef.current = audio;
    setTimeout(() => {
      audio.play().catch(() => {});
      let vol = 0;
      const fadeIn = setInterval(() => {
        vol = Math.min(0.5, vol + 0.05);
        audio.volume = vol;
        if (vol >= 0.5) clearInterval(fadeIn);
      }, 50);
    }, 2000);
  }, []);

  const handleVideoEnd = useCallback(() => {
    setVideoEnded(true);
    const audio = audioRef.current;
    if (audio) {
      const fade = setInterval(() => {
        if (audio.volume > 0.05) {
          audio.volume = Math.max(0, audio.volume - 0.05);
        } else {
          audio.pause();
          clearInterval(fade);
        }
      }, 50);
    }
    setTimeout(() => onComplete?.(), 1400);
  }, [onComplete]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  if (!started) {
    return (
      <div
        className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 bg-black"
        onClick={handleStart}
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
    <div className="fixed inset-0 z-50 h-dvh w-screen overflow-hidden bg-black">
      {/* ── Layer 1: logo video revealed via expanding circle ── */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ scale: 1.5, opacity: 0, clipPath: "circle(0% at 50% 50%)" }}
        animate={{ scale: 1, opacity: 1, clipPath: "circle(150% at 50% 50%)" }}
        transition={{
          scale: { type: "spring", ...ZOOM_SPRING, delay: WAIT_DURATION },
          opacity: { duration: 0.4, delay: WAIT_DURATION },
          clipPath: { duration: PORTAL_DURATION, ease: [0.16, 1, 0.3, 1], delay: WAIT_DURATION },
        }}
      >
        <div
          className="pointer-events-none absolute h-[500px] w-[500px] rounded-full opacity-30"
          style={{
            background: "radial-gradient(circle, rgba(217,119,6,0.5) 0%, transparent 70%)",
          }}
          aria-hidden
        />

        <motion.video
          className="relative z-10 h-full w-full object-cover"
          src={LOGO_VIDEO_SRC}
          playsInline
          muted
          autoPlay
          preload="auto"
          loop={false}
          onEnded={handleVideoEnd}
          onError={() => handleVideoEnd()}
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            type: "spring",
            ...ZOOM_SPRING,
            delay: WAIT_DURATION + 0.2,
          }}
        />
      </motion.div>

      {/* ── Layer 2: Fade-out when logo video ends ── */}
      {videoEnded && (
        <motion.div
          className="absolute inset-0 z-30 bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
        />
      )}

      {/* ── Sparkles ── */}
      <Sparkles />
    </div>
  );
}

function Sparkles() {
  const [particles, setParticles] = useState<
    { id: number; x: number; y: number; size: number; delay: number; duration: number }[]
  >([]);

  useEffect(() => {
    setParticles(
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 2 + Math.random() * 3,
        delay: WAIT_DURATION + Math.random() * 1.2,
        duration: 1.5 + Math.random() * 2,
      }))
    );
  }, []);

  if (particles.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-amber-300"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0] }}
          transition={{
            delay: p.delay,
            duration: p.duration,
            ease: "easeInOut",
            repeat: 1,
          }}
        />
      ))}
    </div>
  );
}
