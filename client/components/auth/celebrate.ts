import confetti from "canvas-confetti";

/** Celebration burst (canvas-confetti, common with Aceternity-style UIs) */
export function runWelcomeConfetti() {
  const count = 3;
  const defaults = {
    origin: { y: 0.65 },
    zIndex: 9999,
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(200 * particleRatio),
    });
  }

  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.2, { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.1, { spread: 120, startVelocity: 45 });

  setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 90,
      spread: 100,
      ticks: 200,
      gravity: 0.8,
      scalar: 1.1,
    });
  }, 240);

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      confetti({
        ...defaults,
        particleCount: 40,
        angle: 60,
        spread: 55,
        startVelocity: 35,
        colors: ["#fbbf24", "#f59e0b", "#fcd34d", "#ffffff"],
      });
      confetti({
        ...defaults,
        particleCount: 40,
        angle: 120,
        spread: 55,
        startVelocity: 35,
        colors: ["#fbbf24", "#f59e0b", "#fcd34d", "#ffffff"],
      });
    }, 400 + i * 180);
  }
}
