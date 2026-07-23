import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { summarizeHealth } from "@/lib/integrity/health";

// PRD Task MC.16 — health endpoint for uptime checks. UNAUTHENTICATED by
// design (proxy isPublicPath exempts it): monitors carry no creds, and the
// payload is structurally data-free (up/down + latency only — shape pinned
// in lib/integrity/health.ts tests). Probes the real dependency (one
// head-count query against Supabase) rather than just answering 200, so a
// dead DB reads as down, not "site up".

export const dynamic = "force-dynamic";

export async function GET() {
  const source = process.env.STORAGE_SOURCE ?? "file";
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (source !== "supabase" || !url || !key) {
    const r = summarizeHealth({ store: "file", dbError: null, latencyMs: null });
    return NextResponse.json(r.body, { status: r.status });
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  const started = Date.now();
  const probe = await client
    .from("people")
    .select("id", { count: "exact", head: true })
    .then(
      (res) => ({ error: res.error ? res.error.message : null }),
      (e: unknown) => ({ error: e instanceof Error ? e.message : "probe failed" })
    );
  const r = summarizeHealth({
    store: "supabase",
    dbError: probe.error,
    latencyMs: Date.now() - started,
  });
  return NextResponse.json(r.body, { status: r.status });
}
