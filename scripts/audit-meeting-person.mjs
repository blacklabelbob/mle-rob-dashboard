#!/usr/bin/env node
/**
 * audit-meeting-person.mjs — Q85 inc.24. Ask the person half of Q85's DoD of the rows that are
 * ALREADY ON PROD, and print the answer per row.
 *
 * READ-ONLY, AND THERE IS NO `--apply` HERE ON PURPOSE. The write this would make is an UPDATE
 * of `activities.person_id` on rows a human authored, and inc.20's lesson is that a write path
 * shipped without being exercised in the same run reads as success while being dead. The live
 * run below is what decides whether there is anything to write at all — shipping the writer
 * ahead of that answer would be guessing at its own inputs.
 *
 * TOUCHES NOTHING, in any mode: no insert, no update, no delete, no Notion PATCH, no money /
 * quoted / signed / paid field, no `STORAGE_SOURCE`.
 *
 * Usage:
 *   node --import ./scripts/ts-loader.mjs scripts/audit-meeting-person.mjs
 *   … --json
 */

import { readFileSync } from "node:fs";

import { decideStoredPerson } from "../lib/meetings/storedActivityPerson.ts";

const args = process.argv.slice(2);
const AS_JSON = args.includes("--json");

function readEnvLocal() {
  const out = {};
  let raw = "";
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...readEnvLocal(), ...process.env };
const SUPABASE_URL = env.SUPABASE_URL || "";
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env or .env.local.");
  process.exit(2);
}

async function get(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

const rows = await get("activities?select=id,org_id,person_id,source_context&type=eq.meeting&order=id");
const people = await get("people?select=id,name,org_id&order=id");

const crmPeople = people.map((p) => ({ id: p.id, name: p.name, orgId: p.org_id ?? "" }));
const decisions = rows.map((r) =>
  decideStoredPerson(
    { id: r.id, orgId: r.org_id ?? null, personId: r.person_id ?? null, sourceContext: r.source_context ?? null },
    crmPeople
  )
);

if (AS_JSON) {
  console.log(JSON.stringify({ meetingRows: rows.length, people: crmPeople.length, decisions }, null, 2));
  process.exit(0);
}

const attach = decisions.filter((d) => d.kind === "attach");
console.log(
  `\n── ${rows.length} meeting row(s) on prod · ${attach.length} would attach a person · read-only, nothing written ──`
);

for (const d of decisions) {
  if (d.kind === "attach") {
    console.log(`\n  ＋ ${d.activityId}`);
    console.log(`     would set person_id = ${d.personId} (${d.personName}) · org ${d.orgId}`);
    continue;
  }
  console.log(`\n  ⛔ ${d.activityId}`);
  console.log(`     [${d.reason}] ${d.detail}`);
}

const byReason = new Map();
for (const d of decisions) if (d.kind === "refused") byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1);
console.log(
  `\n  ${[...byReason].map(([r, n]) => `${r}: ${n}`).join(" · ") || "no refusals"}\n` +
    `  Nothing above has been written. person_id on a stored row is a human's attribution;\n` +
    `  the writer ships the day this audit finds a row it can attach without guessing.\n`
);
