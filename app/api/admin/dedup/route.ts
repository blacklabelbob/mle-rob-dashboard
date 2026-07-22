import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { collectDedupRows } from "@/lib/dedup/run";

// Dedup review queue (PRD Task 3.5): POST runs the detector and upserts pairs
// into `dedup_review`; GET lists the queue; PATCH dismisses/reopens a pair.
// The detector NEVER merges — the queue only proposes, Rob (Task 4.2) disposes.

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("dedup api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") ?? "open";
  let q = db().from("dedup_review").select("*");
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q
    .order("confidence", { ascending: true }) // 'high' before 'review'
    .order("pair_key", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pairs: data ?? [] });
}

// Run the detector across live people + orgs. Idempotent: re-runs upsert on
// pair_key. `status` is never in the payload, so dismissed pairs stay
// dismissed; open pairs the detector no longer sees are auto-resolved so the
// queue never shows a duplicate Rob already fixed at the source.
export async function POST() {
  const client = db();
  const [people, orgs] = await Promise.all([
    client.from("people").select("id,name,email,phone,node_type"),
    client.from("orgs").select("id,name,email,phone,node_type"),
  ]);
  if (people.error || orgs.error) {
    return NextResponse.json(
      { error: (people.error ?? orgs.error)!.message },
      { status: 500 }
    );
  }

  const rows = collectDedupRows({ people: people.data ?? [], orgs: orgs.data ?? [] });
  const now = new Date().toISOString();

  if (rows.length > 0) {
    const { error } = await client
      .from("dedup_review")
      .upsert(rows.map((r) => ({ ...r, last_seen_at: now })), { onConflict: "pair_key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-resolve open pairs the detector no longer detects (source data fixed).
  const detectedKeys = new Set(rows.map((r) => r.pair_key));
  const { data: openRows, error: openErr } = await client
    .from("dedup_review")
    .select("pair_key")
    .eq("status", "open");
  if (openErr) return NextResponse.json({ error: openErr.message }, { status: 500 });
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    detected: rows.length,
    high: rows.filter((r) => r.confidence === "high").length,
    review: rows.filter((r) => r.confidence === "review").length,
    autoResolved: stale.length,
  });
}

// Rob's disposition from the queue: dismiss ("not a duplicate" — never
// resurfaces) or reopen. Merging is Task 4.2, not this endpoint.
export async function PATCH(req: NextRequest) {
  const { pairKey, action, note } = await req.json();
  if (typeof pairKey !== "string" || !["dismiss", "reopen"].includes(action)) {
    return NextResponse.json(
      { error: "need { pairKey, action: dismiss|reopen, note? }" },
      { status: 400 }
    );
  }
  const row =
    action === "dismiss"
      ? {
          status: "dismissed",
          resolved_at: new Date().toISOString(),
          resolution_note: typeof note === "string" && note.trim() ? note.trim() : null,
        }
      : { status: "open", resolved_at: null, resolution_note: null };
  const { data, error } = await db()
    .from("dedup_review")
    .update(row)
    .eq("pair_key", pairKey)
    .select("pair_key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "no pair matched that pairKey" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
