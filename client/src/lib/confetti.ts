import confetti from 'canvas-confetti';

const COLORS = ['#D97757', '#6A9BCC', '#788C5D', '#D4A72C', '#FAF9F5', '#14213D'];

/** A tasteful celebration: two side cannons followed by a gentle fall. */
export function celebrate(durationMs = 4500) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => undefined;
  const end = Date.now() + durationMs;
  let raf = 0;
  const frame = () => {
    confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors: COLORS, zIndex: 60 });
    confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors: COLORS, zIndex: 60 });
    if (Date.now() < end) raf = requestAnimationFrame(frame);
  };
  confetti({ particleCount: 140, spread: 100, startVelocity: 45, origin: { y: 0.35 }, colors: COLORS, zIndex: 60 });
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    confetti.reset();
  };
}

export function smallBurst() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  confetti({ particleCount: 60, spread: 70, startVelocity: 30, origin: { y: 0.6 }, colors: COLORS, zIndex: 60 });
}
