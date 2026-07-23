import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/dedup/detector";
import { todayInET } from "@/lib/integrity/overdue";
import {
  findRecycleCandidates,
  withRecycleTag,
  RECYCLE_STALE_DAYS,
  type RecyclablePerson,
} from "@/lib/leads/recycle";
import type { Activity } from "@/lib/types";

// Dead-lead recycling tagger (PRD Task 5.4). Vercel Hobby caps us at 2 cron
// registrations (dedup + integrity), so — overdue-watcher pattern — the
// weekly firing comes from an n8n schedule calling this route with the same
// Authorization bearer contract: CRON_SECRET unset → 503 inert, wrong bearer
// → 401. All rules live in lib/leads/recycle.ts (CR-3): a candidate's newest
// provable touch is >=RECYCLE_STALE_DAYS old; demo/signed/lit/tagged/no-date
// rows are never candidates. This route only APPENDS the notes tag (single
// tag source: withRecycleTag) and files a low flag to Things to Address
// (findings protocol — the interim surfacing until MC.15's weekly digest
// exists; the digest recycle section rides that build). The tag itself is
// the idempotency: tagged people are never candidates again, so re-runs and
// retries can't double-tag or re-flag. Money/signed/status fields untouched.

export const dynamic = "force-dynamic";

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

  const [{ data: peopleRows, error: pErr }, { data: actRows, error: aErr }] =
    await Promise.all([
      client
        .from("people")
        .select("id,name,signed,status,notes,key_dates,org_id,created_at"),
      client.from("activities").select("person_id,org_id,occurred_at,created_at"),
    ]);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  const byId = new Map((peopleRows ?? []).map((r) => [r.id, r]));
  const people: RecyclablePerson[] = (peopleRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    verticalId: "",
    status: r.status,
    signed: r.signed,
    phaseOne: "not-started" as const, // unused by the recycle rules
    keyDates: r.key_dates ?? {},
    notes: r.notes ?? undefined,
    orgId: r.org_id ?? undefined,
    createdAt: r.created_at ?? undefined,
  }));
  const activities = (actRows ?? []).map((r) => ({
    personId: r.person_id ?? undefined,
    orgId: r.org_id ?? undefined,
    occurredAt: r.occurred_at ?? undefined,
    createdAt: r.created_at ?? undefined,
  })) as Activity[];

  const today = todayInET(new Date());
  const candidates = findRecycleCandidates(people, activities, today);

  let tagged = 0;
  let flagged = 0;
  const errors: string[] = [];
  for (const c of candidates) {
    const row = byId.get(c.personId);
    if (!row) continue;
    // Notes-only append via the single tag source — nothing else on the row.
    const { error: upErr } = await client
      .from("people")
      .update({ notes: withRecycleTag(row.notes ?? undefined, today) })
      .eq("id", c.personId);
    if (upErr) {
      errors.push(`${c.personId}: ${upErr.message}`);
      continue; // don't flag what we couldn't tag
    }
    tagged++;
    // Findings protocol: low flag on the person's record + Things to Address.
    // Best-effort — a flag failure never undoes the tag.
    const { error: flErr } = await client.from("flags").insert({
      entity_id: c.personId,
      entity_name: row.name,
      title: `Recycle candidate — no touch since ${c.lastTouch}`,
      detail: `${row.name}: ${c.reason}. Tagged [recycle_candidate ${today}] — a dead lead worth a re-approach (outbound/AIDRE recycle list). Weekly-digest surfacing lands with the digest build (MC.15); until then this flag is the surfacing.`,
      severity: "low",
    });
    if (flErr) errors.push(`flag ${c.personId}: ${flErr.message}`);
    else flagged++;
  }

  return NextResponse.json({
    ok: errors.length === 0,
    staleDays: RECYCLE_STALE_DAYS,
    candidates: candidates.length,
    tagged,
    flagged,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
