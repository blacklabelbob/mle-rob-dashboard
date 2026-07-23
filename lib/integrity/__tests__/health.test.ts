import { describe, expect, it } from "vitest";
import { summarizeHealth, type HealthResult } from "../health";

describe("summarizeHealth (MC.16 /api/health contract)", () => {
  it("file store: 200 ok with db n/a (no dependency to probe)", () => {
    const r = summarizeHealth({ store: "file", dbError: null, latencyMs: null });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, store: "file", db: "n/a", latencyMs: null });
  });

  it("supabase reachable: 200 ok with latency reported", () => {
    const r = summarizeHealth({ store: "supabase", dbError: null, latencyMs: 42 });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, store: "supabase", db: "ok", latencyMs: 42 });
  });

  it("supabase down: 503 so a plain status-code monitor reads it as down", () => {
    const r = summarizeHealth({
      store: "supabase",
      dbError: "fetch failed",
      latencyMs: 1500,
    });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.db).toBe("error");
    expect(r.body.error).toBe("fetch failed");
  });

  it("payload is structurally data-free: only whitelisted keys, never counts/names/secrets", () => {
    const results: HealthResult[] = [
      summarizeHealth({ store: "file", dbError: null, latencyMs: null }),
      summarizeHealth({ store: "supabase", dbError: null, latencyMs: 7 }),
      summarizeHealth({ store: "supabase", dbError: "boom", latencyMs: 7 }),
    ];
    const allowed = new Set(["ok", "store", "db", "latencyMs", "error"]);
    for (const r of results) {
      for (const key of Object.keys(r.body)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });
});
