#!/usr/bin/env node
// One-shot: push data/network.json into Supabase. Idempotent (upserts by id).
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-supabase.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (project → Settings → API).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const data = JSON.parse(readFileSync(new URL("../data/network.json", import.meta.url), "utf8"));

const person = (p) => ({
  id: p.id, name: p.name, business: p.business ?? null, role: p.role ?? null,
  node_type: p.nodeType ?? null, vertical_id: p.verticalId, phone: p.phone ?? null,
  email: p.email ?? null, website: p.website ?? null, referred_by_id: p.referredById ?? null,
  relationship: p.relationship ?? null, status: p.status, quoted_amount: p.quotedAmount ?? null,
  signed: p.signed, meeting_video_url: p.meetingVideoUrl ?? null,
  transcript_url: p.transcriptUrl ?? null, est_time_to_payment_days: p.estTimeToPaymentDays ?? null,
  key_dates: p.keyDates ?? {}, phase_one: p.phaseOne, description: p.description ?? null,
  estimate: p.estimate ?? null, notes: p.notes ?? null, assigned_rep: p.assignedRep ?? null,
});

async function upsert(table, rows) {
  const { error } = await db.from(table).upsert(rows);
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`✓ ${table}: ${rows.length} rows`);
}

await upsert("verticals", data.verticals);
// two passes so referred_by_id FKs resolve regardless of order
await upsert("people", data.people.map((p) => ({ ...person(p), referred_by_id: null })));
await upsert("people", data.people.map(person));
await upsert("edges", data.edges.map((e) => ({
  id: e.id, from_id: e.fromId, to_id: e.toId,
  relationship: e.relationship ?? null, suggested: e.suggested ?? false,
})));
await upsert("projects", data.projects.map((p) => ({
  id: p.id, name: p.name, category: p.category, theme: p.theme, completion: p.completion,
  owner: p.owner, summary: p.summary ?? null, link: p.link ?? null,
  will_items: p.willItems ?? null, updated_at: p.updatedAt,
})));
console.log("Seed complete. Set STORAGE_SOURCE=supabase and restart/redeploy.");
