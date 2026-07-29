#!/usr/bin/env node
// Regenerate data/network.local.json (the gitignored file-store overlay) from
// LIVE Supabase rows, so the no-stall fallback serves truth, not stale seed
// data (Critic Rob R1-#7). NEVER writes the committed data/network.json (Q71).
// Field mapping mirrors lib/storage/supabaseStore.ts toPerson/toProject exactly —
// keep the two in sync when the schema changes.
// Usage: node scripts/regen-fallback.mjs                (source: live table reads)
//        node scripts/regen-fallback.mjs --from-backup  (source: latest verified
//          nightly backup — `latest.json` in the private `backups` bucket, MC.16.
//          This is the restore path: backup → local overlay file → the running
//          dashboard serves exactly the last verified backup.
//          ⚠️ CHANGED BY Q71: the overlay is gitignored, so a deploy no longer
//          bundles it automatically. Restoring PROD is now a deliberate act
//          (promote the rows into Supabase, or hand-stage the file) instead of
//          a side effect of committing whatever this script last wrote.)
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

// --from-backup: rows come from the last VERIFIED nightly snapshot instead of
// live tables. Same raw Supabase row shape either way, so the mappers above
// apply unchanged; refuse anything that doesn't look like a Q47 snapshot.
async function fromBackup() {
  const { data, error } = await db.storage.from("backups").download("latest.json");
  if (error) throw new Error(`backups/latest.json download: ${error.message}`);
  const snap = JSON.parse(await data.text());
  if (!snap?.takenAt || typeof snap.tables !== "object" || !Array.isArray(snap.tables.people) || snap.tables.people.length === 0) {
    throw new Error("latest.json is not a usable snapshot (missing takenAt/tables or empty people) — refusing to write a bad fallback");
  }
  const t = snap.tables;
  return {
    takenAt: snap.takenAt,
    rows: [t.verticals ?? [], t.people, t.edges ?? [], t.projects ?? [], t.orgs ?? []],
  };
}

const useBackup = process.argv.includes("--from-backup");
const source = useBackup
  ? await fromBackup()
  : { takenAt: null, rows: await Promise.all([all("verticals"), all("people"), all("edges"), all("projects"), allOrgs()]) };
const [verticals, people, edges, projects, orgs] = source.rows;

const out = {
  verticals: verticals.map((r) => ({ id: r.id, name: r.name, color: r.color })),
  people: [
    ...people.map(toPerson),
    ...orgs.map((r) => ({ ...toPerson(r), entityKind: "company" })),
  ],
  edges: edges.map(toEdge),
  projects: projects.map(toProject),
};

// Q71 Phase 1: this writes the GITIGNORED local file, never the committed
// scaffolding. It used to target data/network.json, which is how live customer
// phones and emails kept landing back in git on every run. fileStore.ts prefers
// network.local.json when present, so a run still takes effect immediately.
const target = new URL("../data/network.local.json", import.meta.url);
writeFileSync(target, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(
  `✓ data/network.local.json (gitignored) regenerated from ${
    useBackup ? `last verified backup (taken ${source.takenAt})` : "live Supabase"
  }: ` +
    `${out.people.length} people, ${out.edges.length} edges, ` +
    `${out.verticals.length} verticals, ${out.projects.length} projects`
);
