#!/usr/bin/env node
// Make Notion's "📞 Master Meetings Database" the complete, trustworthy record of every
// meeting — so it can be used to CHECK the CRM (Rob, 2026-07-30: "having the Notion in
// place will help me confirm the validity of what's in the CRM").
//
// WHY NOTION AND NOT THE CRM: Rob's own reasoning — the CRM is the first piece of software
// he has built start-to-finish and is not commercial grade. The durable archive belongs in
// software he does not maintain. The CRM keeps the RELATIONSHIPS (orgs, people, edges,
// attribution); Notion keeps the MEETING RECORD. Neither duplicates the other's job.
//
// WHY A SCRIPT (CR-3): on 2026-07-30 the database held 32 rows, of which 3 had the literal
// title "Meeting", 2 had no title at all, 26 had an empty summary, and only 3 of 32 carried
// a recording link — while 15 Fireflies transcripts sat on disk and ~8 of them were not in
// Notion at all. Hand-maintenance produced that. A pass that runs on demand does not.
//
// MATCHING IS THE WHOLE PROBLEM, and it is why this does not simply create rows:
// a Fireflies recording titled "bsn-kwzp-wch" is the SAME meeting as the Notion row
// "Call with Dixith & Rob - MLE Intro". Creating from the Fireflies side would have made a
// junk-titled duplicate beside a good row. So every recording is matched to an existing row
// first, and only a genuinely unmatched one is created.
//
// Usage (must go through the TS loader — the junk-title ladder is imported, not copied):
//   npm run sync:meetings              # PLAN (default, writes nothing)
//   npm run sync:meetings -- --apply   # write to Notion
//   npm run sync:meetings -- --json    # machine-readable plan
//   node --import ./scripts/ts-loader.mjs scripts/notion-meetings-sync.mjs [--apply|--json]
//
// Key: NOTION_API_KEY from .env.local, else ~/Projects/!env/.env.master.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
// The junk-title ladder lives in the tested module, not here — see the comment on
// `isJunkTitle` below. This is why the script must be run through `scripts/ts-loader.mjs`
// (`npm run sync:meetings`); `node scripts/notion-meetings-sync.mjs` alone can no longer
// resolve it, and failing loudly on a missing import beats keeping a second copy in step.
import { isPlaceholderTitle } from "../lib/meetings/unexplainedRows.ts";
import { TITLE_MATCH_FLOOR, titleOverlap } from "../lib/meetings/archiveCheck.ts";
// Q84 inc.64 — "whose domain is ours" is now one constant, not two. This script and
// `lib/meetings/attendeeCompany.ts` both have to know that aivoicetech.io / boostuppayments.com /
// fireflies.ai identify no counterparty; a second hand-kept copy is the exact defect inc.4/inc.5
// spent two increments deleting. Same three hosts as before — no behaviour change.
import { OWN_MEETING_HOSTS } from "../lib/meetings/attendeeCompany.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const BODY_DIR = join(REPO, "MLE Internal Meetings", "transcripts");
const DATA_SOURCE_ID = "600498eb-b6e0-41af-a625-e369cbe5fc6a";
const NOTION_VERSION = "2025-09-03";

const APPLY = process.argv.includes("--apply");
const AS_JSON = process.argv.includes("--json");

function resolveKey() {
  if (process.env.NOTION_API_KEY) return process.env.NOTION_API_KEY.trim();
  for (const file of [join(REPO, ".env.local"), join(homedir(), "Projects", "!env", ".env.master")]) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, "utf8").split("\n").find((l) => l.trim().startsWith("NOTION_API_KEY="));
    if (line) return line.trim().slice("NOTION_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const KEY = resolveKey();
if (!KEY) {
  console.error("NOTION_API_KEY not found (.env.local or ~/Projects/!env/.env.master). Nothing done.");
  process.exit(1);
}

async function notion(path, init = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Notion ${init.method || "GET"} ${path} -> ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

// ---------------------------------------------------------------- local side

/** Every Fireflies body on disk. These are gitignored verbatim transcripts — read, never committed. */
function readBodies() {
  if (!existsSync(BODY_DIR)) return [];
  return readdirSync(BODY_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const b = JSON.parse(readFileSync(join(BODY_DIR, f), "utf8"));
      const sentences = Array.isArray(b.sentences) ? b.sentences : [];
      const speakers = [...new Set(sentences.map((s) => s.speaker_name).filter(Boolean))];
      return {
        id: b.id,
        title: (b.title || "").trim(),
        date: b.dateString || "",
        day: (b.dateString || "").slice(0, 10),
        durationMinutes: Math.round(b.duration || 0),
        participants: Array.isArray(b.participants) ? b.participants : [],
        speakers,
        sentenceCount: sentences.length,
        summary: b.summary || {},
        fireflies: `https://app.fireflies.ai/view/${b.id}`,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com"]);
const OWN_DOMAINS = new Set(OWN_MEETING_HOSTS);
// FREE_MAIL above stays this script's own and NARROWER than the comms ladder's ~90-domain
// `genericDomainSet()` on purpose: widening it here would change which guest domains reach the
// derived titles this pass writes into Notion, and that is a behaviour change, not a cleanup.
// Named so it is inherited rather than rediscovered.
const domainOf = (e) => (typeof e === "string" && e.includes("@") ? e.split("@").pop().toLowerCase().trim() : "");

/**
 * A title is JUNK when it identifies nothing: empty, the literal word "Meeting", a Google
 * Meet room code (bsn-kwzp-wch), a bare timestamp ("Jul 29, 02:13 PM" or an ISO stamp), the
 * Fireflies demo placeholder, or the word "Meeting" plus a date it already carries in a
 * column. Anything else is a human's title and is LEFT ALONE — overwriting a title a person
 * chose is the one change that would make this pass untrustworthy.
 *
 * THE LADDER IS NOT DEFINED HERE ANY MORE, and that is the point of Q84 inc.4. This file
 * used to keep its own hand-copied `isJunkTitle` beside `lib/meetings/unexplainedRows.ts`'s
 * `isPlaceholderTitle`, with a comment on each asking the reader to keep them in step. Two
 * copies of the predicate that decides "may this pass destroy what a human typed" is a
 * divergence waiting to happen — so this now imports the tested one and the comment is no
 * longer load-bearing.
 */
const isJunkTitle = isPlaceholderTitle;

/** Build an honest title from what is actually known. Never invents a topic. */
function deriveTitle(body) {
  const people = body.speakers.slice(0, 3);
  const guestDomains = [...new Set(body.participants.map(domainOf))]
    .filter((d) => d && !OWN_DOMAINS.has(d) && !FREE_MAIL.has(d));
  const who = people.length ? people.join(", ") : guestDomains.length ? guestDomains.join(", ") : "";
  const kw = Array.isArray(body.summary?.keywords) ? body.summary.keywords.slice(0, 2).join(" / ") : "";
  const day = body.day;
  const parts = [];
  if (who) parts.push(who);
  if (kw) parts.push(kw);
  // A recording with no speakers, no guest domain and no keywords genuinely says nothing
  // about itself. Label it that way rather than inventing a subject.
  if (!parts.length) return `Untitled recording (${body.durationMinutes} min) — ${day}`;
  return `${parts.join(" | ")} — ${day}`;
}

// --------------------------------------------------------------- notion side

const plainText = (rich) => (Array.isArray(rich) ? rich.map((r) => r.plain_text).join("") : "");

function readProps(page) {
  const p = page.properties || {};
  const get = (name) => p[name] || {};
  return {
    id: page.id,
    url: page.url,
    title: plainText(get("Meeting Title").title),
    callDate: get("Call Date")?.date?.start || "",
    day: (get("Call Date")?.date?.start || "").slice(0, 10),
    recording: get("Call Recording")?.url || "",
    company: plainText(get("Company Meeting with").rich_text),
    summary: plainText(get("Meeting Summary").rich_text),
    actions: plainText(get("Next Steps/Action Items").rich_text),
    transcriptAvailable: get("Transcript Available")?.checkbox === true,
  };
}

async function readAllRows() {
  const out = [];
  let cursor;
  do {
    const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    const res = await notion(`/data_sources/${DATA_SOURCE_ID}/query`, { method: "POST", body: JSON.stringify(body) });
    out.push(...res.results.map(readProps));
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return out;
}

// THE SECOND LADDER, COLLAPSED (Q84 inc.5). `titleOverlap` + `norm` + a hand-typed `0.6`
// lived here as a character-identical copy of `lib/meetings/archiveCheck.ts`, which is the
// exact defect inc.4 named and only half-cured: two copies of the predicate that decides
// "are these the same meeting" is a divergence waiting to happen, and this one carried a
// load-bearing promise — inc.3 documented the classifier's duplicate rule as "deliberately
// inc.1's timid one", a claim that is only true while the two implementations agree. It is
// now true by construction rather than by inspection. Imported through scripts/ts-loader.mjs
// (precedent: notion-crm-check.mjs) — failing loudly on a missing import beats silent drift.
// The import itself sits with the others at the top of the file.

/**
 * Match a recording to an existing row. Order matters — the recording URL is proof, the
 * rest is inference, and an inferred match that is WRONG silently welds two meetings
 * together. So date equality is required for every inferred match, never title alone.
 */
function matchRow(body, rows, claimed) {
  const byUrl = rows.find((r) => r.recording && r.recording.includes(body.id));
  if (byUrl) return { row: byUrl, how: "recording-url" };

  const sameDay = rows.filter((r) => r.day && r.day === body.day && !claimed.has(r.id));
  if (!sameDay.length) return null;

  const strong = sameDay.find((r) => titleOverlap(r.title, body.title) >= TITLE_MATCH_FLOOR);
  if (strong) return { row: strong, how: "date+title" };

  // Exactly one un-claimed row on that day, and this recording has no rival: the only
  // safe form of a weak match. Two rows or two recordings on one day -> leave for a human.
  const rivals = rows.filter((r) => r.day === body.day).length;
  if (sameDay.length === 1 && rivals === 1) return { row: sameDay[0], how: "date-only (sole row that day)" };
  return null;
}

// ------------------------------------------------------------------ planning

const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || "");

function planFor(body, match) {
  const changes = [];
  const props = {};
  const row = match?.row;

  const wantTitle = isJunkTitle(row?.title) ? (isJunkTitle(body.title) ? deriveTitle(body) : body.title) : null;
  if (wantTitle && wantTitle !== row?.title) {
    changes.push(`title: ${JSON.stringify(clip(row?.title, 40) || "(empty)")} -> ${JSON.stringify(clip(wantTitle, 60))}`);
    props["Meeting Title"] = { title: [{ text: { content: clip(wantTitle, 190) } }] };
  }
  if (!row?.recording) {
    changes.push(`recording: (none) -> ${body.fireflies}`);
    props["Call Recording"] = { url: body.fireflies };
  }
  // The checkbox is set from what is ACTUALLY on disk, not from optimism: a 0-sentence
  // body is a recording that captured nothing, and claiming a transcript exists for it
  // is the same false-coverage failure this whole pass is fixing.
  const hasTranscript = body.sentenceCount > 0;
  if (hasTranscript && !row?.transcriptAvailable) {
    changes.push("transcript available: NO -> YES");
    props["Transcript Available"] = { checkbox: true };
  }
  if (!row?.summary && body.summary?.short_summary) {
    changes.push("summary: (empty) -> filled");
    props["Meeting Summary"] = { rich_text: [{ text: { content: clip(body.summary.short_summary, 1900) } }] };
  }
  if (!row?.actions && body.summary?.action_items) {
    changes.push("action items: (empty) -> filled");
    props["Next Steps/Action Items"] = { rich_text: [{ text: { content: clip(String(body.summary.action_items).trim(), 1900) } }] };
  }
  if (!row?.company) {
    const guests = [...new Set(body.participants.map(domainOf))].filter((d) => d && !OWN_DOMAINS.has(d) && !FREE_MAIL.has(d));
    // Exactly one outside domain is an unambiguous counterparty. Two or more is a
    // multi-party call and guessing which one "the meeting is with" is how a CRM
    // ends up attributing a deal to the wrong company.
    if (guests.length === 1) {
      changes.push(`company: (empty) -> ${guests[0]}`);
      props["Company Meeting with"] = { rich_text: [{ text: { content: guests[0] } }] };
    }
  }
  if (!row?.callDate) {
    changes.push(`call date: (empty) -> ${body.day}`);
    props["Call Date"] = { date: { start: body.day } };
  }
  return { changes, props };
}

function newPageProps(body) {
  const title = isJunkTitle(body.title) ? deriveTitle(body) : body.title;
  const props = {
    "Meeting Title": { title: [{ text: { content: clip(title, 190) } }] },
    "Call Date": { date: { start: body.day } },
    "Call Recording": { url: body.fireflies },
    "Transcript Available": { checkbox: body.sentenceCount > 0 },
  };
  if (body.summary?.short_summary) props["Meeting Summary"] = { rich_text: [{ text: { content: clip(body.summary.short_summary, 1900) } }] };
  if (body.summary?.action_items) props["Next Steps/Action Items"] = { rich_text: [{ text: { content: clip(String(body.summary.action_items).trim(), 1900) } }] };
  const guests = [...new Set(body.participants.map(domainOf))].filter((d) => d && !OWN_DOMAINS.has(d) && !FREE_MAIL.has(d));
  if (guests.length === 1) props["Company Meeting with"] = { rich_text: [{ text: { content: guests[0] } }] };
  return { props, title };
}

/**
 * Two recordings can be the SAME meeting — Fireflies emits a second body when a call is
 * re-processed or a second attendee's bot joins the same room. `matchRow` cannot catch
 * this: neither body has a Notion row to collide on, so both get created and the pass
 * writes the very duplicate it exists to prevent (2026-07-10 "MLE -Sales Network Intro"
 * appeared twice in the first live plan).
 *
 * Collapsing is deliberately timid, for the same reason inferred row-matches require date
 * equality: welding two distinct meetings into one is unrecoverable, while two rows for one
 * call is a visible thing a human fixes in a click. So a pair collapses ONLY when both
 * bodies carry a real human title that agrees — a derived title is never evidence, because
 * two different unnamed calls on one day derive nearly the same string.
 * Keeps the richer body (more sentences); the loser is reported, never silently dropped.
 */
function collapseDuplicateRecordings(candidates) {
  const kept = [];
  const suppressed = [];
  for (const c of [...candidates].sort((a, b) => b.body.sentenceCount - a.body.sentenceCount)) {
    const twin = kept.find(
      (k) =>
        k.body.day === c.body.day &&
        !isJunkTitle(k.body.title) &&
        !isJunkTitle(c.body.title) &&
        titleOverlap(k.body.title, c.body.title) >= TITLE_MATCH_FLOOR,
    );
    if (twin) suppressed.push({ ...c, twin });
    else kept.push(c);
  }
  return { kept, suppressed };
}

// ---------------------------------------------------------------------- main

const bodies = readBodies();
const rows = await readAllRows();

const claimed = new Set();
const updates = [];
const createCandidates = [];

for (const body of bodies) {
  const match = matchRow(body, rows, claimed);
  if (match) {
    claimed.add(match.row.id);
    const { changes, props } = planFor(body, match);
    if (changes.length) updates.push({ body, row: match.row, how: match.how, changes, props });
  } else {
    createCandidates.push({ body, ...newPageProps(body) });
  }
}

const { kept: creations, suppressed } = collapseDuplicateRecordings(createCandidates);

// Rows Notion holds that no recording explains. Reported, never touched — these are the
// in-person and externally-recorded meetings, and the Omega 2026-07-28 row is one of them.
const unmatchedRows = rows.filter((r) => !claimed.has(r.id));
const rowsNeedingWork = unmatchedRows.filter((r) => isJunkTitle(r.title) || !r.summary || !r.callDate);

if (AS_JSON) {
  console.log(JSON.stringify({
    counts: { bodies: bodies.length, rows: rows.length, updates: updates.length, creations: creations.length, duplicateRecordings: suppressed.length, rowsNeedingWork: rowsNeedingWork.length },
    updates: updates.map((u) => ({ id: u.row.id, title: u.row.title, how: u.how, changes: u.changes })),
    creations: creations.map((c) => ({ title: c.title, date: c.body.day, fireflies: c.body.fireflies })),
    duplicateRecordings: suppressed.map((s) => ({ date: s.body.day, title: s.title, fireflies: s.body.fireflies, sameMeetingAs: s.twin.body.fireflies })),
    rowsNeedingWork: rowsNeedingWork.map((r) => ({ id: r.id, title: r.title, day: r.day, url: r.url })),
  }, null, 2));
} else {
  console.log(`\nFireflies recordings on disk: ${bodies.length}   ·   Notion rows: ${rows.length}\n`);
  console.log(`── ${updates.length} existing row(s) to enrich ──`);
  for (const u of updates) {
    console.log(`\n  ${u.row.day}  ${clip(u.row.title, 56) || "(untitled)"}   [matched: ${u.how}]`);
    for (const c of u.changes) console.log(`      · ${c}`);
  }
  console.log(`\n── ${creations.length} recording(s) with no Notion row — would CREATE ──`);
  for (const c of creations) console.log(`  ${c.body.day}  ${clip(c.title, 70)}`);
  if (suppressed.length) {
    console.log(`\n── ${suppressed.length} duplicate recording(s) of a call already being created — NOT created ──`);
    for (const s of suppressed) {
      console.log(`  ${s.body.day}  ${clip(s.title, 60)}`);
      console.log(`      · same meeting as ${s.twin.body.fireflies}; this one: ${s.body.fireflies}`);
    }
  }
  console.log(`\n── ${rowsNeedingWork.length} Notion row(s) no recording explains, still incomplete ──`);
  console.log(`   (in-person or externally recorded — a human or an agent must fill these; never auto-filled)`);
  for (const r of rowsNeedingWork) console.log(`  ${r.day || "(no date)"}  ${clip(r.title, 56) || "(untitled)"}  ${r.url}`);
  console.log(APPLY ? "\nAPPLYING…\n" : "\nPLAN ONLY — re-run with --apply to write.\n");
}

if (!APPLY) process.exit(0);

let ok = 0;
let failed = 0;
for (const u of updates) {
  try {
    await notion(`/pages/${u.row.id}`, { method: "PATCH", body: JSON.stringify({ properties: u.props }) });
    ok++;
  } catch (e) {
    failed++;
    console.error(`  FAILED update ${u.row.id}: ${e.message}`);
  }
}
for (const c of creations) {
  try {
    await notion("/pages", {
      method: "POST",
      body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: DATA_SOURCE_ID }, properties: c.props }),
    });
    ok++;
  } catch (e) {
    failed++;
    console.error(`  FAILED create ${c.title}: ${e.message}`);
  }
}
console.log(`\nApplied: ${ok} ok, ${failed} failed.`);
process.exit(failed ? 1 : 0);
