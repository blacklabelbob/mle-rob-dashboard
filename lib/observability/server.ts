import "server-only";

import { PostHog } from "posthog-node";

import { POSTHOG_ENABLED, POSTHOG_HOST, POSTHOG_KEY, scrub } from "./config";

/**
 * Server-side PostHog. Used for things the browser cannot see — cron outcomes,
 * webhook deliveries, e-sign completions, ingest runs.
 *
 * One client per process. `flushAt: 1` because serverless functions freeze between
 * invocations: a batched event that has not been sent when the function suspends
 * is an event that never happened.
 */
let client: PostHog | null = null;

function get(): PostHog | null {
  if (!POSTHOG_ENABLED) return null;
  if (!client) {
    client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

/**
 * Record a server-side event. Never throws — analytics must not be able to fail a
 * request. `distinctId` defaults to a system actor because this dashboard has no
 * logins by Rob's standing decision, so there is no user to identify.
 */
export async function track(
  event: string,
  properties: Record<string, unknown> = {},
  distinctId = "system",
): Promise<void> {
  const ph = get();
  if (!ph) return;
  try {
    ph.capture({
      distinctId,
      event,
      properties: scrub(properties) as Record<string, unknown>,
    });
  } catch (err) {
    console.error("[posthog] capture failed", err);
  }
}

/** Call before a serverless function returns if it tracked anything. */
export async function flush(): Promise<void> {
  try {
    await client?.flush();
  } catch (err) {
    console.error("[posthog] flush failed", err);
  }
}
