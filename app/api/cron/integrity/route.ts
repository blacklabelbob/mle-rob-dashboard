import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/dedup/detector";
import { findOrphans, orphanFlagTitle } from "@/lib/integrity/orphans";
import {
  checkCredentials,
  credentialFlagTitle,
} from "@/lib/integrity/credentials";
import {
  findNoteShapeIssues,
  noteShapeFlagDetail,
  noteShapeFlagTitle,
} from "@/lib/integrity/notes";

// Nightly orphan check (PRD Task 3.7) + credential-expiry check (Task 3.8),
// fired by Vercel cron (vercel.json) — 3.8 rides this cron because Vercel
// Hobby caps us at 2 cron jobs. Same auth contract as /api/cron/dedup:
// CRON_SECRET unset → 503 inert, wrong bearer → 401. Findings alert Rob via
// the flags ledger ("Things to Address", findings protocol 2026-07-22) — one
// flag per finding ever (deterministic title = idempotency key), so re-runs
// never duplicate. Credential flags carry env-var NAMES only, never values.

// JWT-shaped credentials whose real `exp` claim we watch (7-day window).
// Non-JWT secrets have no expiry — see docs/plans/CRM-FAILURE-MODES.md.
const WATCHED_CREDENTIALS = ["SUPABASE_SERVICE_ROLE_KEY", "N8N_API_KEY"];

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
    client.from("people").select("id,name,notes"),
    client.from("orgs").select("id,name,notes"),
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

  const credFindings = checkCredentials(
    WATCHED_CREDENTIALS.map((name) => ({ name, token: process.env[name] })),
    Date.now()
  );

  // Notes-shape watchdog (Q43 punch #2): stored notes whose shape defeats the
  // notes/enrichment split. These flags land on the RECORD itself, not on the
  // "CRM integrity" pseudo-entity, so Rob sees them where he reads the note.
  const noteFindings = findNoteShapeIssues([
    ...(people.data ?? []),
    ...(orgs.data ?? []),
  ]);

  // One flag per finding ever: deterministic title = idempotency key.
  const candidates = [
    ...findings.map((f) => ({
      title: orphanFlagTitle(f),
      detail: f.reason,
      severity: "high",
    })),
    ...credFindings.map((f) => ({
      title: credentialFlagTitle(f),
      detail:
        f.status === "expired"
          ? `${f.name} is EXPIRED (since ${f.expiresAt}) — rotate it now; every feature using it is down.`
          : `${f.name} expires ${f.expiresAt} (${f.daysLeft}d left) — rotate before it lapses.`,
      severity: "high",
    })),
  ];

  let flagged = 0;
  if (candidates.length > 0) {
    const { data: existing, error: exErr } = await client
      .from("flags")
      .select("title")
      .eq("entity_name", ENTITY);
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    const seen = new Set((existing ?? []).map((f) => f.title));
    const fresh = candidates.filter((c) => !seen.has(c.title));
    if (fresh.length > 0) {
      const { error } = await client.from("flags").insert(
        fresh.map((c) => ({ entity_id: null, entity_name: ENTITY, ...c }))
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      flagged = fresh.length;
    }
  }

  // Same idempotency contract, keyed on (entity_id, title) because these are
  // per-record rather than per-system.
  let notesFlagged = 0;
  if (noteFindings.length > 0) {
    const ids = [...new Set(noteFindings.map((f) => f.entityId))];
    const { data: existing, error: exErr } = await client
      .from("flags")
      .select("entity_id,title")
      .in("entity_id", ids);
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    const seen = new Set((existing ?? []).map((f) => `${f.entity_id}|${f.title}`));
    const fresh = noteFindings.filter(
      (f) => !seen.has(`${f.entityId}|${noteShapeFlagTitle(f)}`)
    );
    if (fresh.length > 0) {
      const { error } = await client.from("flags").insert(
        fresh.map((f) => ({
          entity_id: f.entityId,
          entity_name: f.entityName,
          title: noteShapeFlagTitle(f),
          detail: noteShapeFlagDetail(f),
          severity: "low",
        }))
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      notesFlagged = fresh.length;
    }
  }

  return NextResponse.json({
    ok: true,
    orphans: findings.length,
    credsExpiring: credFindings.length,
    noteShapeIssues: noteFindings.length,
    flagged,
    notesFlagged,
  });
}
