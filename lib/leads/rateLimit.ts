// Task 5.2 rate-limit (pure, CR-3): sliding-window counter with the clock
// injected — the caller passes `nowMs`, so behavior is fully deterministic
// under test. State is a plain Map the caller owns (the route keeps one at
// module scope). Honest limitation: per-instance memory, so the effective
// ceiling scales with concurrent Vercel instances — fine as abuse braking
// for a two-caller API (AIDRE + AIVA), not a billing-grade quota.

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the oldest hit ages out — only set when blocked. */
  retryAfterSec?: number;
}

export const LEADS_RATE_LIMIT = 60; // per product
export const LEADS_RATE_WINDOW_MS = 60_000;

export function checkRateLimit(
  hits: Map<string, number[]>,
  key: string,
  nowMs: number,
  limit: number = LEADS_RATE_LIMIT,
  windowMs: number = LEADS_RATE_WINDOW_MS
): RateLimitResult {
  const cutoff = nowMs - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length >= limit) {
    hits.set(key, recent); // still prune, or a hammering caller grows the array forever
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - nowMs) / 1000)) };
  }
  recent.push(nowMs);
  hits.set(key, recent);
  return { allowed: true };
}
