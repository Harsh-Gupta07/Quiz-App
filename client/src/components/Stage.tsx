import { useLayoutEffect, useState, type ReactNode } from 'react';

const W = 1920;
const H = 1080;

/**
 * Fixed 1920×1080 canvas scaled to fit any projector / browser window (letter-boxed).
 * Everything inside is laid out in "projector pixels", so text sizes are predictable.
 */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-navy">
      <div
        className="bg-dots relative shrink-0 overflow-hidden bg-ivory"
        style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'center center' }}
      >
        {children}
      </div>
    </div>
  );
}
