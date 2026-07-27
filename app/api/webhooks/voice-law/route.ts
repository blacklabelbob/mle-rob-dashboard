import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { n8nEmailConfigured, n8nEmailEnv, verifyN8nSecret } from "@/lib/n8nEmail";
import {
  isLegalStatusChange,
  lawItemsFromPayload,
  lawItemToFlag,
} from "@/lib/integrity/lawMonitor";

export const dynamic = "force-dynamic";

const ENTITY = "AI voice law";

// Q21 voice-law monitor endpoint. The weekly "AI Voice Call Law Monitor" n8n
// workflow POSTs its keyword-flagged items here; each lands on the flags
// ledger and surfaces in Overview "Things to Address" (read = dismiss from
// Overview, resolve = archived). Auth reuses the n8n contract (same instance
// is the only caller): x-n8n-secret vs N8N_EMAIL_WEBHOOK_SECRET; unset → 503,
// inert. After auth always 200 so n8n never retry-loops; title = the story's
// headline, deduped against the ledger, so the monitor's overlapping 8-day
// RSS window re-posting the same article never dupes a flag.
export async function POST(req: Request) {
  const env = n8nEmailEnv();
  if (!n8nEmailConfigured(env)) {
    return NextResponse.json(
      { error: "voice-law alerting not configured" },
      { status: 503 }
    );
  }
  const secret = req.headers.get("x-n8n-secret") ?? "";
  if (!verifyN8nSecret(env.webhookSecret!, secret)) {
    return NextResponse.json({ error: "bad secret" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const received = lawItemsFromPayload(body);
  // Rob dev-chat #50 (2026-07-27): law NEWS is not wanted on the Overview —
  // only "an actual full change in the legal status of Voice AI" gets through.
  const items = received.filter(isLegalStatusChange);
  const ignored = received.length - items.length;
  if (items.length === 0) {
    // Rob: "IF theres changes" — an empty/immaterial run is the normal, silent case.
    return NextResponse.json({
      ok: true,
      flagged: 0,
      ignored,
      reason: received.length === 0 ? "no items" : "no legal-status change",
    });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase env not set" }, { status: 503 });
  }
  const client = createClient(url, key, { auth: { persistSession: false } });

  let flagged = 0;
  let skipped = 0;
  for (const item of items) {
    const flag = lawItemToFlag(item);
    // One flag per story ever (title = idempotency key, same contract as
    // /api/webhooks/n8n-error) — read/resolved flags don't resurrect.
    const { data: existing, error: exErr } = await client
      .from("flags")
      .select("id")
      .eq("entity_name", ENTITY)
      .eq("title", flag.title)
      .limit(1);
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    if ((existing ?? []).length > 0) {
      skipped++;
      continue;
    }
    const { error: insErr } = await client.from("flags").insert({
      entity_id: null,
      entity_name: ENTITY,
      title: flag.title,
      detail: flag.detail,
      severity: flag.severity,
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    flagged++;
  }
  console.log(
    `[voice-law] flagged ${flagged}, deduped ${skipped}, ignored ${ignored} of ${received.length}`
  );
  return NextResponse.json({ ok: true, flagged, skipped, ignored });
}
