import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStore } from "@/lib/storage";
import { validateManualLog } from "@/lib/activities/requiredFields";
import { activitySubjectColumn, type TimelineSubject } from "@/lib/activities/timelineSubject";
import type { Activity, ActivityType } from "@/lib/types";

// GET: activity feed for the account workspace (Task 1b.3) — reads
// defensively; any read error returns an empty list instead of a 500 (flags'
// "non-critical, never break the ledger" pattern).
// POST: MANUAL interaction log (Task 1.9) — the save is REJECTED (400, with
// the full missing-field list) unless every mandatory per-interaction field
// is present; rules live in lib/activities/requiredFields.ts per CR-3.
// Automated sources keep their own webhooks — this route is manual-only.

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("activities api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  // Q89 inc.17: an activity is filed against a person OR an org — all four meetings on
  // prod are org-filed with person_id null — so the subject is asked for explicitly.
  // Before this, the company page asked ?person=C-2018, got [] and rendered "Nothing
  // logged yet" over that org's two filed meetings. Both params at once is refused
  // rather than silently resolved: a caller that does not know which subject it means
  // must not get an answer.
  const person = req.nextUrl.searchParams.get("person");
  const org = req.nextUrl.searchParams.get("org");
  if (person && org) {
    return NextResponse.json({ error: "pass ?person= or ?org=, not both" }, { status: 400 });
  }
  const subject: TimelineSubject | null = person
    ? { kind: "person", id: person }
    : org
      ? { kind: "org", id: org }
      : null;
  if (!subject) {
    return NextResponse.json({ error: "need ?person=<id> or ?org=<id>" }, { status: 400 });
  }
  try {
    const { data, error } = await db()
      .from("activities")
      .select("*")
      .eq(activitySubjectColumn(subject.kind), subject.id)
      .order("occurred_at", { ascending: false });
    if (error) throw error; // e.g. 42P01 relation does not exist — table not built yet
    return NextResponse.json({ activities: data ?? [] });
  } catch {
    return NextResponse.json({ activities: [] });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  // Manual-only surface: automated sources (n8n/aidre/dialer) have their own
  // secret-checked webhooks with capture-appropriate validation.
  if (body.source !== undefined && body.source !== "manual") {
    return NextResponse.json(
      { error: "this route logs manual interactions only; automated sources use their webhooks" },
      { status: 400 }
    );
  }

  const verdict = validateManualLog(body);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "missing required interaction fields (Task 1.9)", missing: verdict.missing },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const activity: Activity = {
    id: `manual-${randomUUID()}`,
    personId: typeof body.personId === "string" ? body.personId : undefined,
    orgId: typeof body.orgId === "string" ? body.orgId : undefined,
    dealId: typeof body.dealId === "string" ? body.dealId : undefined,
    createdBy: typeof body.createdBy === "string" ? body.createdBy : undefined,
    type: body.type as ActivityType,
    source: "manual",
    sourceContext: body.sourceContext as Record<string, unknown>,
    summary: typeof body.summary === "string" ? body.summary : undefined,
    bookProtected: false,
    occurredAt: body.occurredAt as string,
    createdAt: now,
  };

  try {
    await getStore().upsertActivity(activity);
    return NextResponse.json({ ok: true, id: activity.id }, { status: 201 });
  } catch (e) {
    console.error("[activities] manual log save failed", e);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
