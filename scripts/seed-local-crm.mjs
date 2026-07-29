#!/usr/bin/env node
// Q71 Phase 5 — the CRM half of `npm run seed:local`.
//
// `regen-fallback.mjs` already pulls people/edges/verticals/projects from live
// Supabase into the GITIGNORED `data/network.local.json`. Deals, activities and
// tasks had no such path: a fresh clone with real Supabase credentials could
// populate the graph but the pipeline stayed on the committed synthetic
// scaffolding, so `/deals` showed demo rows next to real people — the exact
// ambiguity Phase 2 item 5 was built to remove. This closes that half.
//
// Writes `data/crm.local.json` ONLY (gitignored, wins on read in fileStore.ts).
// The committed `data/crm.json` is synthetic scaffolding and is never touched.
//
// Usage: node scripts/seed-local-crm.mjs
//
// CR-3: the mappers below are pure (row in, record out — no path, no clock, no
// network) and mirror lib/crm.ts `toDeal`/`toActivity`/`toTask` exactly. They
// are duplicated here because a .mjs script cannot import the TypeScript
// module, NOT because the two are allowed to disagree —
// lib/__tests__/seedLocalCrmMappers.test.ts imports both and fails when they
// drift, so this copy cannot rot in silence the way regen-fallback.mjs's
// person/project mappers can.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export function toDeal(r) {
  return {
    id: r.id,
    personId: r.person_id ?? undefined,
    orgId: r.org_id ?? undefined,
    verticalId: r.vertical_id ?? undefined,
    ownerId: r.owner_id ?? undefined,
    name: r.name,
    stage: r.stage,
    value: r.value === null || r.value === undefined ? undefined : Number(r.value),
    routingLane: r.routing_lane ?? undefined,
    referralSourced: r.referral_sourced,
    keyDates: r.key_dates ?? {},
    estimate: r.estimate ?? undefined,
    equity: r.equity ?? undefined,
    // Narrowed, not cast — same rule as lib/crm.ts: an out-of-range column value
    // reads as "not stated" rather than becoming a phase nothing can render.
    phase: r.phase === 1 || r.phase === 2 || r.phase === 3 ? r.phase : undefined,
    bookProtected: r.book_protected,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toActivity(r) {
  return {
    id: r.id,
    personId: r.person_id ?? undefined,
    orgId: r.org_id ?? undefined,
    dealId: r.deal_id ?? undefined,
    createdBy: r.created_by ?? undefined,
    type: r.type,
    source: r.source,
    sourceContext: r.source_context ?? {},
    summary: r.summary ?? undefined,
    actionItems: r.action_items ?? undefined,
    buyingSignals: r.buying_signals ?? undefined,
    recordingUrl: r.recording_url ?? undefined,
    transcriptUrl: r.transcript_url ?? undefined,
    bookProtected: r.book_protected,
    occurredAt: r.occurred_at,
    createdAt: r.created_at,
  };
}

export function toTask(r) {
  return {
    id: r.id,
    activityId: r.activity_id ?? undefined,
    dealId: r.deal_id ?? undefined,
    personId: r.person_id ?? undefined,
    assignedTo: r.assigned_to ?? undefined,
    title: r.title,
    detail: r.detail ?? undefined,
    status: r.status,
    dueDate: r.due_date ?? undefined,
    bookProtected: r.book_protected,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Pure: raw table rows in, the exact object `fileStore.shapeCrm` reads out.
// No `__synthetic` marker — these are REAL rows, and claiming otherwise would
// make the demo banner lie in the one direction that matters.
export function buildLocalCrm({ deals = [], activities = [], tasks = [] } = {}) {
  return {
    deals: deals.map(toDeal),
    activities: activities.map(toActivity),
    tasks: tasks.map(toTask),
  };
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("seed-local-crm.mjs");

if (invokedDirectly) {
  // Minimal .env.local loader so the script runs standalone (no dotenv dep) —
  // same shape as regen-fallback.mjs.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const envPath = new URL("../.env.local", import.meta.url);
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
      }
    }
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or put them in .env.local).");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // A CRM table that does not exist yet degrades to an empty list (same rule as
  // regen-fallback's `allOrgs`) — a clone against a pre-CRM database should get
  // an empty pipeline, not a crash. Any OTHER error is real and fails loud.
  async function all(table, order) {
    const { data, error } = await db.from(table).select("*").order(order);
    if (error) {
      if (/not exist|find the table/i.test(error.message)) {
        console.warn(`  · ${table}: table not present in this database — treating as empty`);
        return [];
      }
      throw new Error(`${table}: ${error.message}`);
    }
    return data;
  }

  const [deals, activities, tasks] = await Promise.all([
    all("deals", "created_at"),
    all("activities", "occurred_at"),
    all("tasks", "created_at"),
  ]);

  const out = buildLocalCrm({ deals, activities, tasks });
  const target = new URL("../data/crm.local.json", import.meta.url);
  writeFileSync(target, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(
    `✓ data/crm.local.json (gitignored) regenerated from live Supabase: ` +
      `${out.deals.length} deals, ${out.activities.length} activities, ${out.tasks.length} tasks`
  );
}
