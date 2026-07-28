import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseDealPhasePatch, buildPhaseChangeActivity } from "@/lib/crm";

// Q40 inc.11 — the ONE write door for `deals.phase` (0026).
//
// Why its own route rather than a field on the stage PATCH: that route's whole
// contract is "stage is the only writable column", enforced by a parser that
// refuses every other key. Adding `phase` there would retire that guarantee
// for the sake of one column. Two narrow doors keep both invariants literal.
//
// The phase is what `attributePhaseMoney` reads to decide which money the
// Phase 2 ROI guarantee is measured against, so this is the seam where a
// customer's ROI target stops being inference and becomes something a human
// stated. That is also why it is never inferred here: an absent phase stays
// absent (see 0026's deliberate no-backfill).

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("admin api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

// 0026 is committed-not-applied on some deployments. PostgREST answers an
// unknown column with 42703; that is a DEPLOYMENT state, not a bad request,
// so it earns a 503 that names the migration instead of a 500 that reads as
// "the setter is broken".
const UNDEFINED_COLUMN = "42703";

export async function PATCH(req: NextRequest) {
  const parsed = parseDealPhasePatch(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const client = db();

  const { data: current, error: readErr } = await client
    .from("deals")
    .select("phase")
    .eq("id", parsed.id)
    .maybeSingle();
  if (readErr) {
    if (readErr.code === UNDEFINED_COLUMN) {
      return NextResponse.json(
        { error: "deals.phase does not exist on this database — migration 0026 is not applied" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: `no deal matched id ${parsed.id}` }, { status: 404 });
  }

  // A stored 4 (or anything outside the check) reads as not-stated here for the
  // same reason `toDeal` narrows rather than casts — see lib/types.ts.
  const from =
    current.phase === 1 || current.phase === 2 || current.phase === 3 ? current.phase : null;
  if (from === parsed.phase) return NextResponse.json({ ok: true, changed: false });

  const at = new Date().toISOString();
  const { data, error } = await client
    .from("deals")
    .update({ phase: parsed.phase, updated_at: at })
    .eq("id", parsed.id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) {
    return NextResponse.json({ error: `no deal matched id ${parsed.id}` }, { status: 404 });
  }

  const audit = buildPhaseChangeActivity({ dealId: parsed.id, from, to: parsed.phase, at });
  // Non-null by construction here (the values differ); the deterministic id
  // makes a retried request upsert rather than stack a second row.
  const { error: auditErr } = await client.from("activities").upsert(audit!);
  if (auditErr) {
    // The phase DID save. Say so, and name the missing trail rather than
    // failing a write that already landed.
    console.error(`deals phase PATCH: phase saved but audit row failed: ${auditErr.message}`);
    return NextResponse.json({ ok: true, changed: true, auditError: auditErr.message });
  }
  return NextResponse.json({ ok: true, changed: true });
}
