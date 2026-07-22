import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectDedupRows } from "@/lib/dedup/run";

// One detector run, shared by the admin route (manual POST) and the nightly
// Vercel cron (PRD Task 3.5). Caller owns the client and the clock.

export type DetectorSummary = {
  detected: number;
  high: number;
  review: number;
  autoResolved: number;
};

export type DetectorResult =
  | ({ ok: true } & DetectorSummary)
  | { ok: false; error: string };

// Constant-time check of the Vercel cron Authorization header
// ("Bearer <CRON_SECRET>"). Unset secret → never authorized (route 503s).
export function verifyCronAuth(
  header: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Idempotent: re-runs upsert on pair_key with `status` never in the payload,
// so dismissed pairs stay dismissed; open pairs no longer detected are
// auto-resolved so the queue never shows a duplicate already fixed at source.
export async function runDedupDetector(
  client: SupabaseClient,
  now: string
): Promise<DetectorResult> {
  const [people, orgs] = await Promise.all([
    client.from("people").select("id,name,email,phone,node_type"),
    client.from("orgs").select("id,name,email,phone,node_type"),
  ]);
  if (people.error || orgs.error) {
    return { ok: false, error: (people.error ?? orgs.error)!.message };
  }

  const rows = collectDedupRows({ people: people.data ?? [], orgs: orgs.data ?? [] });

  if (rows.length > 0) {
    const { error } = await client
      .from("dedup_review")
      .upsert(rows.map((r) => ({ ...r, last_seen_at: now })), { onConflict: "pair_key" });
    if (error) return { ok: false, error: error.message };
  }

  const detectedKeys = new Set(rows.map((r) => r.pair_key));
  const { data: openRows, error: openErr } = await client
    .from("dedup_review")
    .select("pair_key")
    .eq("status", "open");
  if (openErr) return { ok: false, error: openErr.message };
  const stale = (openRows ?? []).map((r) => r.pair_key).filter((k) => !detectedKeys.has(k));
  if (stale.length > 0) {
    const { error } = await client
      .from("dedup_review")
      .update({
        status: "resolved",
        resolved_at: now,
        resolution_note: "auto: signals no longer present in source records",
      })
      .in("pair_key", stale);
    if (error) return { ok: false, error: error.message };
  }

  return {
    ok: true,
    detected: rows.length,
    high: rows.filter((r) => r.confidence === "high").length,
    review: rows.filter((r) => r.confidence === "review").length,
    autoResolved: stale.length,
  };
}
