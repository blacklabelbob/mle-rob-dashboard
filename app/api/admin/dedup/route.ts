import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runDedupDetector } from "@/lib/dedup/detector";

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

// Run the detector across live people + orgs (shared with the nightly cron —
// see lib/dedup/detector.ts for the idempotency/auto-resolve contract).
export async function POST() {
  const result = await runDedupDetector(db(), new Date().toISOString());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
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
