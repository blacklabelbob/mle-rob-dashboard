import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runDedupDetector } from "@/lib/dedup/detector";
import { dismissedNote, reopenRefusal } from "@/lib/dedup/resolutionNote";

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

  // Attach display names so the review UI shows people, not ids. A missing
  // record (already deleted) resolves to null — the UI labels it honestly.
  const pairs = data ?? [];
  const ids = { person: new Set<string>(), org: new Set<string>() };
  for (const p of pairs) {
    const bucket = ids[p.kind as "person" | "org"];
    if (bucket) {
      bucket.add(p.a_id);
      bucket.add(p.b_id);
    }
  }
  const names = new Map<string, string>();
  for (const [kind, table] of [["person", "people"], ["org", "orgs"]] as const) {
    const wanted = [...ids[kind]];
    if (wanted.length === 0) continue;
    const { data: rows } = await db().from(table).select("id,name").in("id", wanted);
    for (const r of rows ?? []) names.set(`${kind}:${r.id}`, r.name);
  }
  return NextResponse.json({
    pairs: pairs.map((p) => ({
      ...p,
      a_name: names.get(`${p.kind}:${p.a_id}`) ?? null,
      b_name: names.get(`${p.kind}:${p.b_id}`) ?? null,
    })),
  });
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
//
// Q84 inc.48 — two things this handler used to take on trust:
//   1. the note. It wrote whatever string the caller sent. `DedupQueue` sends
//      `dismissedNote()`, so the queue reads consistently — but only for as long
//      as that one caller is the only caller. The wording is the server's now.
//   2. the reopen. It set ANY pairKey back to `open`, including a merged pair
//      whose duplicate row `merge.ts` has already deleted (a dangling
//      reference) and a pair Rob dismissed himself. The UI draws no reopen
//      control, which is not the same as the endpoint refusing to honour one.
export async function PATCH(req: NextRequest) {
  const { pairKey, action } = await req.json();
  if (typeof pairKey !== "string" || !["dismiss", "reopen"].includes(action)) {
    return NextResponse.json(
      { error: "need { pairKey, action: dismiss|reopen }" },
      { status: 400 }
    );
  }

  if (action === "reopen") {
    const { data: current, error: readErr } = await db()
      .from("dedup_review")
      .select("status,resolution_note")
      .eq("pair_key", pairKey)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!current) {
      return NextResponse.json({ error: "no pair matched that pairKey" }, { status: 404 });
    }
    const refusal = reopenRefusal(current.status, current.resolution_note);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
  }

  const row =
    action === "dismiss"
      ? {
          status: "dismissed",
          resolved_at: new Date().toISOString(),
          resolution_note: dismissedNote(),
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
