"use client";

import { useEffect, useRef } from "react";

export default function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio("/sound/web_music.mp3");
    audio.loop = true;
    audio.volume = 1;
    audioRef.current = audio;

    const tryPlay = () => {
      audio.play().catch(() => {});
    };

    // Attempt immediate autoplay
    tryPlay();

    // Fallback: play on first user gesture if autoplay was blocked
    const handleGesture = () => {
      tryPlay();
      window.removeEventListener("click", handleGesture);
      window.removeEventListener("keydown", handleGesture);
      window.removeEventListener("touchstart", handleGesture);
    };

    window.addEventListener("click", handleGesture);
    window.addEventListener("keydown", handleGesture);
    window.addEventListener("touchstart", handleGesture);

    return () => {
      audio.pause();
      window.removeEventListener("click", handleGesture);
      window.removeEventListener("keydown", handleGesture);
      window.removeEventListener("touchstart", handleGesture);
    };
  }, []);

  return null;
}
