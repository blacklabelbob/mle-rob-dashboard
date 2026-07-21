#!/usr/bin/env node
// Regenerate data/network.json (the file-store fallback) from LIVE Supabase rows,
// so the no-stall fallback serves truth, not stale seed data (Critic Rob R1-#7).
// Field mapping mirrors lib/storage/supabaseStore.ts toPerson/toProject exactly —
// keep the two in sync when the schema changes.
// Usage: node scripts/regen-fallback.mjs   (reads .env.local if env not set)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// Minimal .env.local loader so the script runs standalone (no dotenv dep).
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

const toPerson = (r) => ({
  id: r.id,
  name: r.name,
  business: r.business ?? undefined,
  role: r.role ?? undefined,
  entityKind: r.entity_kind ?? undefined,
  nodeType: r.node_type ?? undefined,
  verticalId: r.vertical_id,
  phone: r.phone ?? undefined,
  email: r.email ?? undefined,
  website: r.website ?? undefined,
  referredById: r.referred_by_id ?? r.referred_by_org_id ?? undefined,
  relationship: r.relationship ?? undefined,
  status: r.status,
  quotedAmount: r.quoted_amount ?? undefined,
  signed: r.signed,
  meetingVideoUrl: r.meeting_video_url ?? undefined,
  transcriptUrl: r.transcript_url ?? undefined,
  keyDates: r.key_dates ?? {},
  phaseOne: r.phase_one,
  description: r.description ?? undefined,
  estimate: r.estimate ?? undefined,
  notes: r.notes ?? undefined,
  assignedRep: r.assigned_rep ?? undefined,
});

const toEdge = (r) => ({
  id: r.id,
  fromId: r.from_id ?? r.from_org_id,
  toId: r.to_id ?? r.to_org_id,
  relationship: r.relationship ?? undefined,
  suggested: r.suggested || undefined,
});

const toProject = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  theme: r.theme,
  completion: r.completion,
  owner: r.owner,
  summary: r.summary ?? undefined,
  link: r.link ?? undefined,
  willItems: r.will_items ?? undefined,
  updatedAt: r.updated_at,
});

async function all(table) {
  const { data, error } = await db.from(table).select("*").order("id");
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}

// Post-0003 split: company rows live in `orgs` and come back as entityKind
// "company" Persons (mirrors supabaseStore merged read). Absent table (pre-split
// database) degrades to an empty list so the script works on both schemas.
async function allOrgs() {
  const { data, error } = await db.from("orgs").select("*").order("id");
  if (error) {
    if (/orgs/.test(error.message) && /not exist|find the table/i.test(error.message)) return [];
    throw new Error(`orgs: ${error.message}`);
  }
  return data;
}

const [verticals, people, edges, projects, orgs] = await Promise.all([
  all("verticals"), all("people"), all("edges"), all("projects"), allOrgs(),
]);

const out = {
  verticals: verticals.map((r) => ({ id: r.id, name: r.name, color: r.color })),
  people: [
    ...people.map(toPerson),
    ...orgs.map((r) => ({ ...toPerson(r), entityKind: "company" })),
  ],
  edges: edges.map(toEdge),
  projects: projects.map(toProject),
};

const target = new URL("../data/network.json", import.meta.url);
writeFileSync(target, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(
  `✓ data/network.json regenerated from live Supabase: ` +
    `${out.people.length} people, ${out.edges.length} edges, ` +
    `${out.verticals.length} verticals, ${out.projects.length} projects`
);
