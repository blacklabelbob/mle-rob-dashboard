import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/dedup/detector";
import {
  planNudges,
  toNudgeRequestRows,
  toPriorNudges,
  type NudgeAction,
  type RawNudgeRequestRow,
} from "@/lib/esign/nudges";
import { buildEvent } from "@/lib/esign/events";
import { deliverEsignEmail } from "@/lib/esign/sender";

// Q47 e-sign nudge cron — the wiring half of lib/esign/nudges.ts (the planner
// is pure + tested; this route only reads rows, executes the plan, and writes
// the ledger). Same bearer contract as the other crons (backup/overdue/recycle):
// CRON_SECRET unset → 503 inert, wrong bearer → 401. Hourly firing rides an n8n
// schedule (Vercel Hobby caps registered crons at 2) — next increment.
//
// Execution rules that matter:
// * A `nudge` event is written ONLY after the action actually happened, so a
//   failed send retries on the next run instead of being silently swallowed.
// * Customer rungs are email; rep/Rob rungs are flags on Things to Address
//   (findings protocol), deduped on the open title — never both, never spam.
// * `markStalled` is REPORTED, not executed: the deal ladder has no Stalled
//   stage, so nothing is mutated (hard limit: no unrequested record changes).

export const dynamic = "force-dynamic";

const ENTITY = "E-sign agreements";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "cron disabled: CRON_SECRET not set" },
      { status: 503 }
    );
  }
  if (!verifyCronAuth(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase env not set" }, { status: 503 });
  }
  const client = createClient(url, key, { auth: { persistSession: false } });

  const { data: rawRequests, error } = await client
    .from("signature_requests")
    .select(
      "id,document_id,status,sent_to,signer_name,created_at,viewed_at,signed_at,voided_at,expires_at,documents(title)"
    )
    .in("status", ["pending", "viewed"]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const requests = toNudgeRequestRows((rawRequests ?? []) as RawNudgeRequestRow[]);
  if (requests.length === 0) {
    return NextResponse.json({ ok: true, open: 0, planned: 0, emailed: 0, flagged: 0 });
  }

  const { data: priorEvents, error: evErr } = await client
    .from("signature_events")
    .select("request_id,meta")
    .eq("type", "nudge")
    .in(
      "request_id",
      requests.map((r) => r.id)
    );
  if (evErr) {
    return NextResponse.json({ error: evErr.message }, { status: 500 });
  }

  const now = new Date();
  const plan = planNudges(requests, toPriorNudges(priorEvents ?? []), now);

  const nowIso = now.toISOString();
  let emailed = 0;
  let flagged = 0;
  const deferred: { rung: string; requestId: string; reason: string }[] = [];
  const stalled: string[] = [];

  for (const action of plan) {
    const done = await executeAction(client, action, nowIso);
    if (!done.ok) {
      deferred.push({ rung: action.rung, requestId: action.requestId, reason: done.reason });
      continue; // no event written → next run retries this rung
    }
    if (done.emailed) emailed += 1;
    if (done.flagged) flagged += 1;
    if (action.markStalled) stalled.push(action.markStalled.documentId);

    await client.from("signature_events").insert(
      buildEvent(action.requestId, "nudge", nowIso, {
        meta: {
          rung: action.rung,
          audience: action.audience,
          via: done.emailed ? "email" : "flag",
        },
      })
    );
  }

  return NextResponse.json({
    ok: true,
    open: requests.length,
    planned: plan.length,
    emailed,
    flagged,
    deferred,
    // Documents whose 14-day escalation fired: Rob decides the stage himself.
    stalledDocuments: stalled,
  });
}

type ActionResult =
  | { ok: true; emailed: boolean; flagged: boolean }
  | { ok: false; reason: string };

async function executeAction(
  client: SupabaseClient,
  action: NudgeAction,
  nowIso: string
): Promise<ActionResult> {
  if (action.email) {
    const res = await deliverEsignEmail(action.email);
    if (!res.sent) return { ok: false, reason: res.reason };
    return { ok: true, emailed: true, flagged: false };
  }

  // Internal rung → flags ledger, deduped on the open title (overdue contract).
  const { data: existing, error } = await client
    .from("flags")
    .select("id")
    .eq("title", action.flagTitle)
    .eq("status", "open")
    .limit(1);
  if (error) return { ok: false, reason: `flags read: ${error.message}` };
  if (existing && existing.length > 0) {
    // Already on the ledger and unread — count the rung as delivered so the
    // event lands and it never re-fires, but don't double-file.
    return { ok: true, emailed: false, flagged: false };
  }
  const { error: insErr } = await client.from("flags").insert({
    entity_id: null,
    entity_name: ENTITY,
    title: action.flagTitle,
    detail: `${action.flagDetail} (nudge ${action.rung}, ${nowIso})`,
    severity: action.severity,
  });
  if (insErr) return { ok: false, reason: `flags insert: ${insErr.message}` };
  return { ok: true, emailed: false, flagged: true };
}
