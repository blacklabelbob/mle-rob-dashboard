import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/dedup/detector";
import {
  findOverdueTasks,
  overdueFlagTitle,
  overdueFlagDetail,
  todayInET,
} from "@/lib/integrity/overdue";

// Hourly overdue follow-up watcher (PRD Task 3.4). Vercel Hobby caps us at
// 2 cron registrations (dedup + integrity), so the HOURLY firing comes from
// an n8n schedule workflow calling this route with the same Authorization
// bearer contract as the Vercel crons: CRON_SECRET unset → 503 inert, wrong
// bearer → 401. The "ping" is a medium flag on the flags ledger ("Things to
// Address", findings protocol) — deterministic title = one ping per task per
// due date, ever; hourly re-runs never dupe (the DoD).

export const dynamic = "force-dynamic";

const ENTITY = "CRM follow-ups";

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

  const { data: tasks, error } = await client
    .from("tasks")
    .select("id,title,status,due_date,assigned_to")
    .eq("status", "open")
    .not("due_date", "is", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const findings = findOverdueTasks(tasks ?? [], todayInET(new Date()));

  let flagged = 0;
  if (findings.length > 0) {
    const { data: existing, error: exErr } = await client
      .from("flags")
      .select("title")
      .eq("entity_name", ENTITY);
    if (exErr) {
      return NextResponse.json({ error: exErr.message }, { status: 500 });
    }
    const seen = new Set((existing ?? []).map((f) => f.title));
    const fresh = findings.filter((f) => !seen.has(overdueFlagTitle(f)));
    if (fresh.length > 0) {
      const { error: insErr } = await client.from("flags").insert(
        fresh.map((f) => ({
          entity_id: null,
          entity_name: ENTITY,
          title: overdueFlagTitle(f),
          detail: overdueFlagDetail(f),
          severity: "medium",
        }))
      );
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
      flagged = fresh.length;
    }
  }

  return NextResponse.json({ ok: true, overdue: findings.length, flagged });
}
