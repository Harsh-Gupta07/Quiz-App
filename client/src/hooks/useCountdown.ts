import { useEffect, useState } from 'react';
import { serverNow } from '../lib/socket';

/** Milliseconds remaining until `endsAt` (server epoch), refreshed ~10×/second. */
export function useCountdown(endsAt: number | null | undefined): number {
  const compute = () => (endsAt ? Math.max(0, endsAt - serverNow()) : 0);
  const [remaining, setRemaining] = useState(compute);

  useEffect(() => {
    setRemaining(compute());
    if (!endsAt) return;
    const id = window.setInterval(() => {
      const r = compute();
      setRemaining(r);
      if (r <= 0) window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  return remaining;
}
