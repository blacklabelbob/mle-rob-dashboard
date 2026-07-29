#!/usr/bin/env node
// Pull every Fireflies meeting into the repo (Rob, 2026-07-29: "you should be storing
// the transcripts under MLE ROB Dashboard").
//
// WHY THIS IS A SCRIPT AND NOT A FOLDER OF SAVED FILES: the failure it fixes was that
// thirteen recorded conversations — including two with a live prospect, carrying his
// pricing, his objection and his verbatim commitment — sat in Fireflies while the CRM
// showed empty fields, and a session reported "no calls captured, ever". A folder someone
// remembers to update reproduces that. A script run on a schedule does not.
//
// WHAT LANDS WHERE, AND WHY THE SPLIT:
//   MLE Internal Meetings/transcripts/<id>.json  — full body: every sentence, speaker and
//       offset. GITIGNORED. These are verbatim customer speech: a client's cash position,
//       a prospect's opinion of a competitor who burned him, deal terms said out loud.
//       Git history is permanent and un-deletable; that content does not belong in it even
//       in a private repo. It lives on disk for tooling, and its destination is Supabase
//       (call_transcripts + call_transcript_segments, migration 0021 — already segment-
//       granular with speaker and millisecond offsets, which is exactly Fireflies' shape).
//   MLE Internal Meetings/manifest.json — WHEN, HOW LONG, HOW MANY were in the room (and
//       from which domains), plus the Fireflies link. COMMITTED. Enough for the repo (and a
//       person reading a diff) to know a conversation exists and go find it, with no verbatim
//       speech in history — and, since 2026-07-29, no attendee ADDRESSES either: an earlier
//       version of this file wrote 12 real participant emails into a committed manifest.
//       Attendees now go through redactAttendees() (scripts/manifest-privacy.mjs).
//
// Idempotent: keyed on the Fireflies transcript id, so re-running overwrites a body rather
// than accumulating copies, and the manifest is rebuilt from what is actually on disk.
//
// Usage:  node scripts/fireflies-ingest.mjs [--limit 50]
// Key:    FIREFLIES_API_KEY — read from the environment, else ~/Projects/!env/.env.master

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { redactAttendees } from "./manifest-privacy.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(REPO, "MLE Internal Meetings");
const BODY_DIR = join(OUT_DIR, "transcripts");
const MANIFEST = join(OUT_DIR, "manifest.json");
const ENDPOINT = "https://api.fireflies.ai/graphql";

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 50;

// The key lives in the dashboard's own .env.local, not the machine-wide master env — so
// look there before falling back, or this reports "no key" while sitting next to one.
function resolveKey() {
  if (process.env.FIREFLIES_API_KEY) return process.env.FIREFLIES_API_KEY.trim();
  for (const file of [join(REPO, ".env.local"), join(homedir(), "Projects", "!env", ".env.master")]) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith("FIREFLIES_API_KEY="));
    if (line) return line.trim().slice("FIREFLIES_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

async function gql(key, query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Fireflies HTTP ${res.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text);
  // GraphQL returns 200 with an errors array — a silent partial is worse than a stop.
  if (json.errors?.length) throw new Error(`Fireflies GraphQL: ${JSON.stringify(json.errors).slice(0, 500)}`);
  return json.data;
}

const LIST = `
  query Transcripts($limit: Int) {
    transcripts(limit: $limit) {
      id title dateString duration organizer_email meeting_link participants
      summary { short_summary keywords action_items }
    }
  }`;

const ONE = `
  query Transcript($id: String!) {
    transcript(id: $id) {
      id title dateString duration organizer_email meeting_link participants
      summary { short_summary keywords action_items }
      sentences { index speaker_name raw_text start_time end_time }
    }
  }`;

const key = resolveKey();
if (!key) {
  console.error("FIREFLIES_API_KEY not found in env or ~/Projects/!env/.env.master");
  process.exit(1);
}

mkdirSync(BODY_DIR, { recursive: true });

const { transcripts } = await gql(key, LIST, { limit: LIMIT });
console.log(`Fireflies returned ${transcripts.length} meeting(s).`);

const manifest = [];
let pulled = 0;
let failed = 0;

for (const t of transcripts) {
  let full;
  try {
    ({ transcript: full } = await gql(key, ONE, { id: t.id }));
  } catch (err) {
    // One unreadable meeting must not abandon the other twelve — record it and continue.
    failed += 1;
    console.warn(`  ! ${t.id} (${t.title}): ${err.message.slice(0, 140)}`);
    manifest.push({ id: t.id, title: t.title, date: t.dateString, bodyOnDisk: false, error: "fetch-failed" });
    continue;
  }

  writeFileSync(join(BODY_DIR, `${t.id}.json`), JSON.stringify(full, null, 2));
  pulled += 1;

  manifest.push({
    id: t.id,
    title: t.title ?? null,
    date: t.dateString ?? null,
    durationMinutes: t.duration != null ? Math.round(t.duration) : null,
    // Attendees are shaped, never stored: domains + a count, never an address.
    // The manifest is committed and git never forgets — see scripts/manifest-privacy.mjs.
    ...redactAttendees({ organizer: t.organizer_email, participants: t.participants }),
    keywords: full.summary?.keywords ?? null,
    sentences: full.sentences?.length ?? 0,
    fireflies: `https://app.fireflies.ai/view/${t.id}`,
    bodyOnDisk: true,
    // Deliberately NOT in the manifest: short_summary, action_items, sentence text.
    // Those quote people; the manifest is committed and git never forgets.
  });
  console.log(`  ✓ ${t.dateString?.slice(0, 10) ?? "????-??-??"}  ${t.title ?? t.id}  (${full.sentences?.length ?? 0} lines)`);
}

manifest.sort((a, b) => String(b.date).localeCompare(String(a.date)));
writeFileSync(
  MANIFEST,
  JSON.stringify(
    { generatedBy: "scripts/fireflies-ingest.mjs", source: "fireflies", count: manifest.length, meetings: manifest },
    null,
    2,
  ) + "\n",
);

console.log(`\nBodies: ${pulled} written to "MLE Internal Meetings/transcripts/" (gitignored)`);
if (failed) console.log(`Failed:  ${failed} — listed in the manifest with error: "fetch-failed"`);
console.log(`Manifest: ${manifest.length} meeting(s) -> MLE Internal Meetings/manifest.json (committed)`);
