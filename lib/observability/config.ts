/**
 * Observability configuration — one place that decides whether Sentry and PostHog
 * are ON, so nothing else in the app has to know.
 *
 * WHY EVERY CALL SITE IS GATED: this dashboard is live, public, and in daily use.
 * An observability SDK that throws on a missing key would take the whole app down
 * to report that it cannot report. Absent keys mean silence, never a crash.
 *
 * Turning them on is one env var each — no code change:
 *   NEXT_PUBLIC_SENTRY_DSN     (Sentry project settings → Client Keys)
 *   NEXT_PUBLIC_POSTHOG_KEY    (PostHog → Project Settings → Project API Key)
 *   NEXT_PUBLIC_POSTHOG_HOST   (optional; defaults to US cloud)
 */

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
export const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export const SENTRY_ENABLED = SENTRY_DSN.length > 0;
export const POSTHOG_ENABLED = POSTHOG_KEY.length > 0;

/** Vercel gives us the environment and the exact commit for free — use both. */
export const RELEASE =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  "local";

export const ENVIRONMENT =
  process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "development";

/**
 * Sampling. Errors are always captured; traces are not — this dashboard is used by
 * a handful of people, so full tracing in production is affordable and far more
 * useful than a sampled slice when something breaks once.
 */
export const TRACES_SAMPLE_RATE = ENVIRONMENT === "production" ? 1.0 : 0;

/**
 * THIS DASHBOARD SHOWS REAL CLIENT DATA — names, phones, employers, deal values,
 * invoice states. None of it belongs in a third-party error report. Everything
 * below is scrubbed before anything leaves the machine.
 */
const SENSITIVE_KEY = /token|secret|key|password|auth|cookie|session|ssn|dob|email|phone/i;

/** Recursively redact sensitive-looking values. Depth-capped; cycles are safe. */
export function scrub(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 6 || value == null) return value;
  if (typeof value === "string") {
    return value.length > 512 ? `${value.slice(0, 512)}…[truncated]` : value;
  }
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return "[circular]";
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : scrub(v, depth + 1, seen);
  }
  return out;
}

/** Strip query strings and fragments — record ids ride in those. */
export function scrubUrl(url: string): string {
  try {
    const u = new URL(url, "http://local");
    return `${u.origin === "http://local" ? "" : u.origin}${u.pathname}`;
  } catch {
    return url.split("?")[0].split("#")[0];
  }
}
