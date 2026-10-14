/** Tiny fixed-window rate limiter for Socket.IO events (HTTP uses express-rate-limit). */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {
    const sweep = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
    }, Math.max(windowMs, 30_000));
    sweep.unref();
  }

  /** Returns true when the call is allowed. */
  take(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}
