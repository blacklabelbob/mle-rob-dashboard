// PRD Task MC.16 — /api/health response shaping (pure, CR-3).
// The endpoint is reachable UNAUTHENTICATED (uptime monitors carry no creds),
// so the contract here is structural: the payload may never contain business
// data, secrets, or counts — only up/down facts. HTTP status mirrors `ok`
// (503 when degraded) so a plain status-code check is a complete monitor.

export type HealthInput = {
  /** Which store the app is configured to serve from. */
  store: "supabase" | "file";
  /** Error message from the DB probe, null when the probe succeeded. */
  dbError: string | null;
  /** Probe round-trip in ms; null when no probe ran (file store). */
  latencyMs: number | null;
};

export type HealthResult = {
  status: number;
  body: {
    ok: boolean;
    store: "supabase" | "file";
    db: "ok" | "error" | "n/a";
    latencyMs: number | null;
    error?: string;
  };
};

export function summarizeHealth(input: HealthInput): HealthResult {
  if (input.store === "file") {
    // File store has no dependency to probe — the process answering IS the check.
    return {
      status: 200,
      body: { ok: true, store: "file", db: "n/a", latencyMs: null },
    };
  }
  if (input.dbError !== null) {
    return {
      status: 503,
      body: {
        ok: false,
        store: "supabase",
        db: "error",
        latencyMs: input.latencyMs,
        error: input.dbError,
      },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      store: "supabase",
      db: "ok",
      latencyMs: input.latencyMs,
    },
  };
}
