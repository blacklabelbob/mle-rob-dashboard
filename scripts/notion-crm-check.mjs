#!/usr/bin/env node
/**
 * `npm run check:archive` — compare the Notion meeting archive against the CRM.
 *
 * Q84's actual purpose, in Rob's words (2026-07-30): *"having the Notion in place will help
 * me confirm the validity of what's in the CRM"*. `scripts/notion-meetings-sync.mjs` FILLS
 * the archive; this script CHECKS the CRM against it. Opposite directions, no overlap.
 *
 * READ-ONLY BY DEFAULT, and the one exception is named rather than buried. It creates and
 * updates nothing on either side it reconciles: no Notion page create or update, no Supabase
 * insert/update, no `--apply` flag to forget. The one POST it always issues is Notion's
 * `/data_sources/<id>/query` — a READ that the Notion API requires be sent as a POST because
 * the filter travels in the body. Stated explicitly rather than claimed as "no POST", because
 * a reviewer who greps for `method: "POST"` will find it, and a comment that has to be
 * explained away is worth less than one that is simply true.
 *
 * `--flag` (Q84 inc.11, opt-in) additionally writes ONE row to Rob's ledger via
 * `/api/admin/flags`, carrying a stable `dedupeKey` so the finding CORRECTS its own row
 * instead of stacking a fourth contradicting count beside #132/#134/#136. That is a write,
 * so it is a flag you have to type — but it is the findings channel, not the archive: it
 * touches no meeting, no company, no money field. Without `--flag` nothing is written.
 *
 * A disagreement between the archive and the CRM is a question for a human — auto-reconciling
 * it would write a meeting record nobody verified onto a company, which is exactly the failure
 * the archive exists to catch.
 *
 * The decisions live in `lib/meetings/archiveCheck.ts` (pure, 10 tests); this file is the
 * I/O around it, imported through `scripts/ts-loader.mjs` so the ladder that runs here is
 * the ladder the tests grade.
 *
 *   node --import ./scripts/ts-loader.mjs scripts/notion-crm-check.mjs [--json]
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkArchiveAgainstCrm } from "../lib/meetings/archiveCheck.ts";
import { classifyUnexplainedRows } from "../lib/meetings/unexplainedRows.ts";
import { buildArchiveFinding } from "../lib/meetings/archiveFinding.ts";
import { buildCrmGapFinding } from "../lib/meetings/crmGapFinding.ts";
import { planMeetingActivities } from "../lib/meetings/activityPlan.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_SOURCE_ID = "600498eb-b6e0-41af-a625-e369cbe5fc6a";
const NOTION_VERSION = "2025-09-03";
const AS_JSON = process.argv.includes("--json");
const FILE_FLAG = process.argv.includes("--flag");
// Prod by default: the ledger Rob reads is the deployed one, and a finding filed onto a
// localhost database is a finding nobody sees.
const FLAGS_BASE = (process.env.FLAGS_BASE_URL || "https://mle-rob-dashboard.vercel.app").replace(/\/$/, "");

function env(key) {
  const inline = process.env[key];
  if (inline) return inline.trim();
  try {
    const file = readFileSync(join(REPO, ".env.local"), "utf8");
    const m = file.match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}

const NOTION_KEY = env("NOTION_API_KEY");
const SUPABASE_URL = env("SUPABASE_URL");
const SUPABASE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

const missing = [
  !NOTION_KEY && "NOTION_API_KEY",
  !SUPABASE_URL && "SUPABASE_URL",
  !SUPABASE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
].filter(Boolean);
if (missing.length) {
  console.error(`Cannot check — missing ${missing.join(", ")} in env or .env.local.`);
  process.exit(2);
}

const plain = (rich) => (Array.isArray(rich) ? rich.map((r) => r.plain_text).join("") : "");

async function readArchive() {
  const out = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) throw new Error(`Notion ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    for (const page of json.results) {
      const p = page.properties || {};
      const start = p["Call Date"]?.date?.start || "";
      out.push({
        id: page.id,
        url: page.url,
        title: plain(p["Meeting Title"]?.title),
        day: start.slice(0, 10),
        recording: p["Call Recording"]?.url || "",
        // Read for the unexplained-rows pass below: what a row is MISSING decides who can
        // close it, and only the row itself knows that.
        summary: plain(p["Meeting Summary"]?.rich_text),
        company: plain(p["Company Meeting with"]?.rich_text),
      });
    }
    cursor = json.has_more ? json.next_cursor : null;
  } while (cursor);
  return out;
}

async function readCrmMeetings() {
  const cols = "id,summary,occurred_at,transcript_url,recording_url,org_id,person_id";
  const url = `${SUPABASE_URL}/rest/v1/activities?select=${cols}&type=eq.meeting&order=occurred_at.desc&limit=1000`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const rows = await res.json();
  return rows.map((r) => ({
    id: r.id,
    summary: r.summary || "",
    // The archive stores a calendar day; `occurred_at` is an instant. Slicing the stored
    // ISO string keeps this module clock-free and matches how the sync writes Call Date.
    day: (r.occurred_at || "").slice(0, 10),
    transcriptUrl: r.transcript_url || "",
    recordingUrl: r.recording_url || "",
    orgId: r.org_id,
    personId: r.person_id,
  }));
}

async function readOrgs() {
  // domain AND website: the live rows use them inconsistently (one org has a bare `domain`,
  // most have only a full `website` URL), and reading one field would miss real orgs.
  const url = `${SUPABASE_URL}/rest/v1/orgs?select=id,name,domain,website&order=id&limit=5000`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).map((o) => ({
    id: o.id,
    name: o.name || "",
    domain: o.domain || "",
    website: o.website || "",
  }));
}

// Q84 inc.18: people, read for ONE purpose — an unknown-company row whose "Company Meeting
// with" holds a human's name ("Dixith") must not be reported as a missing company when the
// CRM already knows that person and their org. Nothing here ever attaches to a person.
async function readPeople() {
  const url = `${SUPABASE_URL}/rest/v1/people?select=id,name,org_id&order=id&limit=5000`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).map((p) => ({ id: p.id, name: p.name || "", orgId: p.org_id || "" }));
}

const [archive, crm, orgs, people] = await Promise.all([
  readArchive(),
  readCrmMeetings(),
  readOrgs(),
  readPeople(),
]);
const check = checkArchiveAgainstCrm(archive, crm);
const unexplained = classifyUnexplainedRows(archive);
// Which company would each orphaned meeting attach to? Answered, never acted on — see
// lib/meetings/activityPlan.ts. The archive rows carry `company`; `ArchiveCheck.archiveOnly`
// passes them straight through, so the plan reads the same rows printed above.
const activityPlan = planMeetingActivities(check.archiveOnly, orgs, people);
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || "");

if (AS_JSON) {
  console.log(JSON.stringify({ ...check, unexplained, activityPlan }, null, 2));
  process.exit(0);
}

const c = check.counts;
console.log(`\nArchive rows: ${c.archiveRows}   ·   CRM meeting activities: ${c.crmMeetings}   ·   agreed: ${c.matched}\n`);

// An empty CRM side and a badly-matching CRM side produce the SAME archiveOnly list, and
// they are not the same problem. With zero meeting activities there is nothing to reconcile:
// the gap is that no path writes one, so saying "40 rows failed to match" would describe a
// matching failure that never happened. Name the real shape instead of implying the other.
if (c.crmMeetings === 0) {
  console.log(`⚠  The CRM holds NO meeting activities at all, so nothing below is a failed`);
  console.log(`   MATCH — there was nothing to match against. Every archived meeting is`);
  console.log(`   missing from the CRM because no path writes one, not because the`);
  console.log(`   reconciliation disagreed.\n`);
}

console.log(`── ${c.archiveOnly} meeting(s) in the archive the CRM has NO activity for ──`);
console.log(`   (the meeting happened; nothing about it reached the org or person record)`);
for (const r of check.archiveOnly) console.log(`  ${r.day || "(no date)"}  ${clip(r.title, 60) || "(untitled)"}  ${r.url || ""}`);

// ── who each orphan would attach to (plan only) ────────────────────────────────────────
// The ledger row says "one pipeline closes all N", which is true and is also why the number
// has never moved: it reads as one 40-row task. It is not. Some of these rows name a company
// the CRM already has and a pipeline could file unattended; the rest need a human before any
// pipeline could help. Printed cheapest-first so the expensive ask shrinks before it is asked.
const ap = activityPlan.counts;
if (ap.considered) {
  console.log(`\n── of those ${ap.considered}, where an activity WOULD go (PLAN ONLY — nothing is written) ──`);
  console.log(
    `   ${ap.attachable} attachable · ${ap.unknownCompany} company not in the CRM · ` +
      `${ap.ambiguousCompany} company name is ambiguous · ${ap.noDate} company known but no readable day · ` +
      `${ap.noCompany} row never said who it was with`,
  );
  const PLAN_BUCKETS = [
    ["attachable", "a pipeline could file these unattended once one exists"],
    ["unknown-company", "cheap for a human — add the org, its domain, or fix the spelling in Notion"],
    ["ambiguous-company", "two CRM orgs share the name — merge/rename first, never picked here"],
    ["no-date", "company known, no day readable anywhere on the row — an activity is an event on a day"],
    ["no-company", "only someone who was there can say who it was with"],
  ];
  for (const [disposition, why] of PLAN_BUCKETS) {
    const items = activityPlan.rows.filter((r) => r.disposition === disposition);
    if (!items.length) continue;
    console.log(`\n  ${items.length} · ${disposition.toUpperCase()}`);
    console.log(`     ${why}`);
    for (const item of items) {
      // A day recovered from the title is printed as such, never in the Call Date column: the
      // reader must be able to see at a glance which rows a human dated and which this pass did.
      const day = item.row.day || (item.dayFrom === "title" ? `${item.occursOn}*` : "(no date)");
      console.log(`     ${day}  ${clip(item.row.title, 52) || "(untitled)"}`);
      console.log(`         → ${item.nextStep}`);
    }
  }
  if (activityPlan.rows.some((r) => r.dayFrom === "title"))
    console.log(`\n  * day read from the row's own title — Notion's Call Date is still empty there`);
}

console.log(`\n── ${c.crmOnly} CRM meeting activit(ies) with no archive row ──`);
console.log(`   (either in-person/unrecorded and the archive is short a row, or the CRM row is wrong)`);
for (const m of check.crmOnly) console.log(`  ${m.day || "(no date)"}  ${clip(m.summary, 60) || "(no summary)"}  [${m.id}]`);

if (c.ambiguous) {
  console.log(`\n── ${c.ambiguous} archive row(s) that could honestly be more than one CRM meeting ──`);
  console.log(`   (never auto-resolved — picking wrong welds a call onto the wrong company)`);
  for (const a of check.ambiguous) {
    console.log(`  ${a.row.day}  ${clip(a.row.title, 56)}`);
    for (const cand of a.candidates) console.log(`      · ${clip(cand.summary, 60) || "(no summary)"}  [${cand.id}]`);
  }
}

// ── the rows no recording can explain ──────────────────────────────────────────────────
// These are not a CRM problem — they are archive rows a recorder never saw. "26 incomplete"
// is an unusable pile, so they are split by WHO CAN CLOSE THEM, cheapest first. Nothing here
// is ever auto-filled: an invented summary for an in-person meeting is worse than an empty one.
const u = unexplained.counts;
console.log(`\n── ${u.unexplained} archive row(s) no recording explains  (${u.recorded} recorded, ${u.complete} already filled in by a human) ──`);

const BUCKETS = [
  ["possible-duplicate", u.possibleDuplicate, "probably the same meeting as a RECORDED row — merge or delete, nobody needs to remember it twice"],
  ["needs-identification", u.needsIdentification, "missing a date or a real title — anyone with the calendar can close these"],
  ["needs-human-account", u.needsHumanAccount, "no recorder was there — only someone who was in the room can close these"],
];
for (const [disposition, count, why] of BUCKETS) {
  if (!count) continue;
  console.log(`\n  ${count} · ${disposition.toUpperCase()}`);
  console.log(`     ${why}`);
  for (const item of unexplained.open.filter((r) => r.disposition === disposition)) {
    console.log(`     ${item.row.day || "(no date)"}  ${clip(item.row.title, 52) || "(untitled)"}  [${item.gaps.join(", ")}]`);
    console.log(`         → ${item.nextStep}`);
    if (item.twin) console.log(`         ↔ recorded row: ${clip(item.twin.title, 52)}  ${item.twin.url || ""}`);
  }
}

// ── the ledger row (opt-in) ────────────────────────────────────────────────────────────
// inc.8 built the dedupe mechanism and then said, in its own commit body, that this script
// "still does not send a dedupeKey, so the count is corrected by hand today". A number a
// human has to retype is a number that goes stale the first time nobody types it — the
// exact way #132 came to say 26 while #134 said 25 about one pile.
//
// Q84 inc.14 — BOTH meeting findings ride the mechanism now. #133 (high severity, "40
// recorded meetings … the CRM has ZERO meeting activities") was filed by hand on 7/30 with
// dedupe_key NULL, while inc.7 put the archive fill on a 30-minute timer — so its count
// goes stale on its own, on the highest-severity row on Rob's page.
async function fileFinding(finding, emptyMessage) {
  if (!finding) {
    // Deliberately does NOT resolve the existing row: whether a finding is DONE is Rob's
    // call, and closing his to-do from a script is the machine deciding his list is finished.
    console.log(`--flag: ${emptyMessage} Any existing ledger row is left for Rob to close.`);
    return;
  }
  const res = await fetch(`${FLAGS_BASE}/api/admin/flags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(finding),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`--flag: ledger write FAILED ${res.status}: ${body.slice(0, 300)}`);
    process.exit(1);
  }
  const json = JSON.parse(body);
  console.log(
    `--flag: [${finding.dedupeKey}] ledger ${json.action} — ${json.reason}` +
      `${json.superseded?.length ? ` (superseded ${json.superseded.join(", ")})` : ""}`,
  );
}

if (FILE_FLAG) {
  // Filed in this order on purpose: the CRM gap is the structural one (no path writes a
  // meeting activity), the human-account rows are the residue no pipeline can ever fix.
  // The plan goes to the ledger row, not just the console: inc.15 proved "one pipeline
  // closes all 40" wrong on the live data and the highest-severity row on Rob's page went on
  // saying it, because the breakdown existed only for whoever ran this in a terminal.
  await fileFinding(
    buildCrmGapFinding(check, activityPlan),
    "nothing to file — every archived meeting has a CRM activity.",
  );
  await fileFinding(buildArchiveFinding(unexplained), "nothing to file — no row needs a human account.");
  console.log("");
}

console.log(
  FILE_FLAG
    ? `Read-only on both sides it reconciles — the only write was the one ledger row above.\n`
    : `READ-ONLY — this script changes nothing on either side.\n`,
);
