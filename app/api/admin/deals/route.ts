import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseDealStagePatch, buildStageChangeActivity } from "@/lib/crm";
import type { DealStage } from "@/lib/types";

// Drag-to-persist for the /deals board (Task 2.5). Stage is the ONLY writable
// column — parseDealStagePatch rejects any payload carrying more, and the
// update row below is built from scratch, so value/key_dates/signed fields
// are untouchable through this route by construction.
//
// Task 4.7 audit trail: the route reads the deal's current stage first, so a
// same-stage drag is a no-op (no updated_at churn — that column proxies
// stage-entry for the today-rules until the full trail backfills it) and a
// real change writes exactly one status_change activity built server-side
// from the observed before/after, never from client input.

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("admin api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function PATCH(req: NextRequest) {
  const parsed = parseDealStagePatch(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const client = db();

  const { data: current, error: readErr } = await client
    .from("deals")
    .select("stage")
    .eq("id", parsed.id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!current) {
    return NextResponse.json({ error: `no deal matched id ${parsed.id}` }, { status: 404 });
  }
  if (current.stage === parsed.stage) return NextResponse.json({ ok: true, changed: false });

  const at = new Date().toISOString();
  const { data, error } = await client
    .from("deals")
    .update({ stage: parsed.stage, updated_at: at })
    .eq("id", parsed.id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) {
    return NextResponse.json({ error: `no deal matched id ${parsed.id}` }, { status: 404 });
  }

  const audit = buildStageChangeActivity({
    dealId: parsed.id,
    from: current.stage as DealStage,
    to: parsed.stage,
    at,
  });
  // audit is non-null by construction here (stages differ); upsert keeps a
  // retried request from ever producing a second row for the same instant.
  const { error: auditErr } = await client.from("activities").upsert(audit!);
  if (auditErr) {
    // Stage DID save — say so honestly rather than failing the whole request,
    // but never silently: the gap is named in the payload and the server log.
    console.error(`deals PATCH: stage saved but audit row failed: ${auditErr.message}`);
    return NextResponse.json({ ok: true, changed: true, auditError: auditErr.message });
  }
  return NextResponse.json({ ok: true, changed: true });
}
