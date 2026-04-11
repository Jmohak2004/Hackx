import confetti from "canvas-confetti";

const GOLD = ["#fbbf24", "#f59e0b", "#fcd34d", "#fde68a", "#ffffff"] as const;
const ACCENT = ["#22d3ee", "#a78bfa", "#fbbf24", "#ffffff"] as const;

function fire(opts: confetti.Options) {
  void confetti({
    zIndex: 9999,
    ...opts,
  });
}

/**
 * Welcome celebration: layered bursts (center, sides, finale) tuned for step-4 success.
 * Safe to call multiple times; canvas-confetti queues shots.
 */
export function runWelcomeConfetti() {
  const base = { ticks: 220, gravity: 1.05, decay: 0.92 };

  // 1 — soft rain from above
  fire({
    ...base,
    particleCount: 120,
    spread: 180,
    startVelocity: 25,
    origin: { x: 0.5, y: 0.12 },
    colors: [...GOLD],
    scalar: 0.9,
  });

  // 2 — wide mid-screen bloom
  fire({
    ...base,
    particleCount: 140,
    spread: 100,
    startVelocity: 45,
    origin: { x: 0.5, y: 0.55 },
    colors: [...ACCENT],
    scalar: 1,
  });

  // 3 — tight sparkle
  fire({
    ...base,
    particleCount: 80,
    spread: 360,
    startVelocity: 38,
    origin: { x: 0.5, y: 0.5 },
    ticks: 280,
    colors: [...GOLD],
    scalar: 0.75,
  });

  setTimeout(() => {
    fire({
      ...base,
      particleCount: 100,
      spread: 100,
      startVelocity: 35,
      origin: { x: 0.5, y: 0.65 },
      gravity: 0.9,
      colors: [...GOLD],
    });
  }, 180);

  setTimeout(() => {
    fire({
      particleCount: 55,
      angle: 60,
      spread: 55,
      startVelocity: 42,
      origin: { x: 0, y: 0.65 },
      zIndex: 9999,
      colors: [...GOLD],
    });
    fire({
      particleCount: 55,
      angle: 120,
      spread: 55,
      startVelocity: 42,
      origin: { x: 1, y: 0.65 },
      zIndex: 9999,
      colors: [...GOLD],
    });
  }, 320);

  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      fire({
        ...base,
        particleCount: 45,
        angle: 60,
        spread: 50,
        startVelocity: 38,
        origin: { x: 0, y: 0.7 },
        colors: [...GOLD],
      });
      fire({
        ...base,
        particleCount: 45,
        angle: 120,
        spread: 50,
        startVelocity: 38,
        origin: { x: 1, y: 0.7 },
        colors: [...GOLD],
      });
    }, 520 + i * 200);
  }

  setTimeout(() => {
    fire({
      particleCount: 95,
      spread: 360,
      startVelocity: 28,
      origin: { x: 0.5, y: 0.45 },
      zIndex: 9999,
      ticks: 200,
      gravity: 0.85,
      colors: [...ACCENT],
      scalar: 1.05,
    });
  }, 1100);
}
