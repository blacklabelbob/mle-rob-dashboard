import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { n8nEmailConfigured, n8nEmailEnv, verifyN8nSecret } from "@/lib/n8nEmail";
import { errorToFlag, type N8nErrorPayload } from "@/lib/integrity/captureAlert";

export const dynamic = "force-dynamic";

const ENTITY = "CRM capture";

// n8n error-alert endpoint (PRD Task 3.6). An n8n Error Trigger workflow
// POSTs here whenever ANY capture workflow fails, and the failure lands on
// the flags ledger within seconds — the "alert Rob within 15 min" DoD the
// nightly cron can't meet. Auth reuses the Gmail-capture contract on purpose
// (same n8n instance is the only caller): x-n8n-secret checked against
// N8N_EMAIL_WEBHOOK_SECRET; unset → 503, inert. After auth, always 200 so
// n8n never retry-loops; deterministic per-workflow-per-day flag title means
// a once-a-minute failure storm raises exactly one flag.
export async function POST(req: Request) {
  const env = n8nEmailEnv();
  if (!n8nEmailConfigured(env)) {
    return NextResponse.json(
      { error: "n8n error alerting not configured" },
      { status: 503 }
    );
  }
  const secret = req.headers.get("x-n8n-secret") ?? "";
  if (!verifyN8nSecret(env.webhookSecret!, secret)) {
    return NextResponse.json({ error: "bad secret" }, { status: 403 });
  }

  let payload: N8nErrorPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const flag = errorToFlag(payload, new Date().toISOString());
  if (!flag) {
    console.log("[n8n-error] ignored payload without workflow name");
    return NextResponse.json({ ok: true, flagged: false, reason: "no workflow name" });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase env not set" }, { status: 503 });
  }
  const client = createClient(url, key, { auth: { persistSession: false } });

  // One flag per workflow per day ever (title = idempotency key, same
  // contract as /api/cron/integrity) — resolved flags don't resurrect.
  const { data: existing, error: exErr } = await client
    .from("flags")
    .select("id")
    .eq("entity_name", ENTITY)
    .eq("title", flag.title)
    .limit(1);
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if ((existing ?? []).length > 0) {
    return NextResponse.json({ ok: true, flagged: false, reason: "already flagged" });
  }

  const { error } = await client
    .from("flags")
    .insert({ entity_id: null, entity_name: ENTITY, ...flag });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log("[n8n-error] flagged", flag.title);
  return NextResponse.json({ ok: true, flagged: true });
}
