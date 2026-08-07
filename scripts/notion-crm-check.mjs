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
import {
  indexRecordingsByKey,
  attendanceForRow,
  attendanceNextStep,
} from "../lib/meetings/attendeeCompany.ts";
import { summarizeAttendeeCoverage, readArchiveAttendees } from "../lib/meetings/archiveAttendees.ts";
import { resolveRowAttendees } from "../lib/meetings/attendeePerson.ts";

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
        // Q85 inc.5: the person half of the DoD was unreachable because the read carried no
        // attendees. These four columns are the whole of what the archive knows about who
        // was in the room; `lib/meetings/archiveAttendees.ts` decides what may be resolved
        // from them and what is only a question.
        contactName: plain(p["Contact Name"]?.rich_text),
        nonMleAttendees: plain(p["Non MLE Attendees"]?.rich_text),
        mleAttendees: (p["MLE Attendees"]?.multi_select || []).map((o) => o.name).filter(Boolean),
        salesRep: (p["Sales Rep"]?.people || []).map((o) => o.name).filter(Boolean),
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

/**
 * Q84 inc.65 — the recordings this machine actually holds, read off the manifest the sync
 * already maintains. Read with a `try`: a missing or unparseable manifest must degrade the
 * report to what it printed yesterday, never take down a CRM check over an attendee list.
 */
function readRecordings() {
  try {
    const raw = readFileSync(join(REPO, "MLE Internal Meetings", "manifest.json"), "utf8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed.meetings || [];
    return items.map((m) => ({
      id: m.id || m.fireflies || "",
      title: m.title || "",
      attendeeDomains: [m.organizerDomain, ...(m.participantDomains || [])].filter(Boolean),
    }));
  } catch {
    return [];
  }
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

// Q84 inc.65 — for every planned row, what its own recording's attendee list can say. Keyed by
// the Notion page id so the printer below never re-does the join and reaches a second answer.
// Rows with no recording are absent from this map, which is the honest state, not a gap.
const recordingIndex = indexRecordingsByKey(readRecordings());
const attendanceByRow = new Map();
for (const item of activityPlan.rows) {
  const hit = attendanceForRow(item.row, recordingIndex, orgs);
  if (hit) attendanceByRow.set(item.row.id, hit);
}

// Q85 inc.7 — resolve the archive's own attendee columns to CRM people ONCE, here, and hand the
// answer to every consumer below. Before this, the resolution was computed inside the
// human-readable printer only, so the `--json` output the writer reads carried no people at all
// and `publish-archive-meetings.mjs` hardcoded `person_id: null`. Two call sites computing the
// same answer separately is how the printed number and the written row drift apart; there is one
// call site now, and the printer reads this map rather than re-resolving.
const attendeesByRow = new Map();
for (const item of activityPlan.rows) {
  attendeesByRow.set(item.row.id, resolveRowAttendees(readArchiveAttendees(item.row), people, item.org?.id));
}

if (AS_JSON) {
  // The resolution rides on the plan row it belongs to, so a consumer cannot pair the wrong
  // person list with the wrong meeting by mis-joining two arrays.
  activityPlan.rows = activityPlan.rows.map((item) => ({
    ...item,
    attendeeResolution: attendeesByRow.get(item.row.id),
  }));
  const attendance = [...attendanceByRow].map(([rowId, hit]) => ({
    rowId,
    recording: hit.recording.title || hit.recording.id,
    resolution: hit.resolution,
  }));
  console.log(JSON.stringify({ ...check, unexplained, activityPlan, attendance }, null, 2));
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
      // Q84 inc.65 — a second, INDEPENDENT reading of the same row, printed under the first
      // rather than replacing it: the plan above read Notion's "Company Meeting with" field,
      // this reads who was actually in the room. Where the field is empty and a recorder was
      // there, this is the only line on the row with any evidence on it at all.
      const hit = attendanceByRow.get(item.row.id);
      if (hit) console.log(`         ⌕ recording says: ${attendanceNextStep(hit.resolution)}`);
    }
  }
  // The number this pass can actually move, stated where the ask is made — and the bucket it
  // CANNOT move is named out loud in the same breath. `no-external` rows are not a silent
  // remainder: they are calls where everyone mailed from gmail or our own domain, and inc.64
  // measured that this is most of them. Hiding that would make the yield look bigger than it is.
  const heard = [...attendanceByRow.values()];
  if (heard.length) {
    const tally = (kind) => heard.filter((h) => h.resolution.kind === kind).length;
    console.log(
      `\n  ⌕ ${heard.length} of those rows have a recording on disk — ` +
        `${tally("resolved")} name a CRM company outright · ${tally("unknown-hosts")} name a host no org carries ` +
        `(fix once in the org's Domain field and they answer themselves) · ` +
        `${tally("ambiguous-orgs")} had two companies in the room · ` +
        `${tally("no-external")} carried only our own domains or free mailboxes and can never name a company.`,
    );
  }
  // Q85 inc.5 — the PERSON half of Q85's DoD, measured rather than assumed. Reported next to
  // the company yield above because they are different questions about the same rows: an org
  // can be named by a domain nobody typed, a person cannot. A first name with no surname is
  // counted in its own bucket, not folded into "no attendees" — those rows are not silent,
  // they are one surname away from being work.
  const attendeeCoverage = summarizeAttendeeCoverage(check.archiveOnly.map((r) => r));
  console.log(
    `\n  👤 who was in the room: ${attendeeCoverage.withResolvableCounterparty} of ${attendeeCoverage.total} ` +
      `name a counterparty a person resolver could act on · ` +
      `${attendeeCoverage.counterpartyNotIdentifying} name only a first name (type a surname into Notion and they become work) · ` +
      `${attendeeCoverage.total - attendeeCoverage.withCounterparty} name nobody on the other side.`,
  );

  // Q85 inc.6 — and of the counterparties we CAN act on, how many is the CRM actually holding?
  // Coverage above counts names the archive supplies; this counts names the CRM can answer.
  // The two are deliberately separate numbers: a row naming a resolvable human the CRM has
  // never met is not the same problem as a row naming nobody, and the fix differs (propose a
  // person vs. type a surname into Notion). Nothing here writes — see lib/meetings/attendeePerson.ts.
  const personTally = { matched: 0, ambiguous: 0, unknown: 0 };
  for (const item of activityPlan.rows) {
    // inc.7 — read, not re-resolved. See `attendeesByRow` above.
    const resolved = attendeesByRow.get(item.row.id);
    if (!resolved) continue;
    personTally.matched += resolved.counts.matched;
    personTally.ambiguous += resolved.counts.ambiguous;
    personTally.unknown += resolved.counts.unknown;
  }
  console.log(
    `  🧑‍💼 of those names, the CRM holds: ${personTally.matched} resolved to one person (attachable) · ` +
      `${personTally.ambiguous} name more than one person (a human confirms, nothing is picked) · ` +
      `${personTally.unknown} are people the CRM has never met (propose, never attach to a similar name).`,
  );

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
  // Q84 inc.66 — the attendance evidence rides the SAME deduped row rather than a second
  // hand-filed one. inc.64 posted this finding by hand with no dedupeKey, which is exactly how
  // #133 came to sit on Rob's page saying 40 forever. One row, corrected every run.
  await fileFinding(
    buildCrmGapFinding(
      check,
      activityPlan,
      [...attendanceByRow].map(([rowId, hit]) => ({
        row: activityPlan.rows.find((r) => r.row.id === rowId).row,
        resolution: hit.resolution,
      })),
      // Q84 inc.67 — the same orgs the plan was built from, so an unrecognised guest host can
      // name the org it most likely belongs to instead of asking Rob to go find it.
      orgs,
    ),
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
