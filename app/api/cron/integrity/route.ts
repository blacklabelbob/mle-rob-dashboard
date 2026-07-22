import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/dedup/detector";
import { findOrphans, orphanFlagTitle } from "@/lib/integrity/orphans";

// Nightly orphan check (PRD Task 3.7), fired by Vercel cron (vercel.json),
// same auth contract as /api/cron/dedup: CRON_SECRET unset → 503 inert,
// wrong bearer → 401. Findings alert Rob via the flags ledger ("Things to
// Address", findings protocol 2026-07-22) — one flag per orphaned row ever
// (deterministic title = idempotency key), so re-runs never duplicate.

export const dynamic = "force-dynamic";

const ENTITY = "CRM integrity";

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

  const [people, orgs, deals, activities, tasks] = await Promise.all([
    client.from("people").select("id"),
    client.from("orgs").select("id"),
    client.from("deals").select("id"),
    client.from("activities").select("id,person_id,org_id,deal_id"),
    client.from("tasks").select("id,person_id,deal_id,activity_id"),
  ]);
  const failed = [people, orgs, deals, activities, tasks].find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  const findings = findOrphans({
    peopleIds: (people.data ?? []).map((r) => r.id),
    orgIds: (orgs.data ?? []).map((r) => r.id),
    dealIds: (deals.data ?? []).map((r) => r.id),
    activities: activities.data ?? [],
    tasks: tasks.data ?? [],
  });

  let flagged = 0;
  if (findings.length > 0) {
    const { data: existing, error: exErr } = await client
      .from("flags")
      .select("title")
      .eq("entity_name", ENTITY);
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    const seen = new Set((existing ?? []).map((f) => f.title));
    const fresh = findings.filter((f) => !seen.has(orphanFlagTitle(f)));
    if (fresh.length > 0) {
      const { error } = await client.from("flags").insert(
        fresh.map((f) => ({
          entity_id: null,
          entity_name: ENTITY,
          title: orphanFlagTitle(f),
          detail: f.reason,
          severity: "high",
        }))
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      flagged = fresh.length;
    }
  }

  return NextResponse.json({ ok: true, orphans: findings.length, flagged });
}
