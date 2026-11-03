/**
 * Minimal in-memory sliding-window rate limiter, keyed by client IP.
 *
 * Best-effort only: on serverless hosts each instance keeps its own memory, so the
 * effective limit is per-instance. That's enough to stop casual spamming of a public
 * demo from burning through API credit; use a shared store (e.g. Redis) for anything stricter.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  return function check(key: string, now = Date.now()): RateLimitResult {
    const cutoff = now - windowMs;
    const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

    if (recent.length >= limit) {
      hits.set(key, recent);
      return { ok: false, remaining: 0, retryAfterSec: Math.ceil((recent[0] + windowMs - now) / 1000) };
    }

    recent.push(now);
    hits.set(key, recent);

    // Keep memory bounded: occasionally drop keys with no recent hits.
    if (hits.size > 5000) {
      for (const [k, times] of hits) {
        if (times.every((t) => t <= cutoff)) hits.delete(k);
      }
    }

    return { ok: true, remaining: limit - recent.length, retryAfterSec: 0 };
  };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}
