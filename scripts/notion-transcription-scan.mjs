#!/usr/bin/env node
/**
 * Q86 — ask Notion, for every SPINE row whose body came back empty, whether a transcript was ever
 * produced. Writes the answer to disk so the spine can print a NAMED reason instead of silence.
 *
 * WHY THIS EXISTS. Every Notion body in the archive holding readable prose is now ruled (inc.36).
 * What is left is 20 rows the harvester measured at 0 characters over >=1 block — the
 * `[transcription]` wrapper with nothing under it — plus 9 rows with no body block at all. Those 29
 * rows produce NO finding in `spine:q86` today: they are not "bodies nobody ruled" (there is no
 * body), and they are not ruled. They are simply invisible, which is the one thing this queue does
 * not accept. Rob's bar is DoD (b): a transcript, or an explicit NAMED reason there cannot be one.
 *
 * Q84 inc.49 discovered where that reason lives: the `transcription` block carries a `status`, and
 * `lib/meetings/transcriptionStatus.ts` is the ladder for it. This script is the network half —
 * one `blocks/{id}/children` fetch per row — and it holds no judgement whatsoever.
 *
 * IT NEVER TURNS A FAILURE INTO AN ABSENCE. A row whose fetch errors is written with
 * `status: null` and the error in words, so the spine keeps it OWED. That is the inverted-#22
 * failure this repo keeps killing: a reader's silence must never become a claim about the meeting.
 *
 * Usage:
 *   NOTION_API_KEY=… node scripts/notion-transcription-scan.mjs [--notion <snapshot.json>] [--out <file.json>]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pageTranscriptionStatus } from "../lib/meetings/transcriptionStatus.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const SNAPSHOT =
  argOf("--notion") ?? join(REPO, "MLE Internal Meetings", "notion-snapshot-2026-08-07.json");
const OUT =
  argOf("--out") ?? join(REPO, "MLE Internal Meetings", "notion-transcription-status.json");

if (!existsSync(SNAPSHOT)) {
  console.error(`no notion snapshot at ${SNAPSHOT} — refusing to scan rows nobody harvested.`);
  process.exit(2);
}
const key = process.env.NOTION_API_KEY;
if (!key) {
  console.error("NOTION_API_KEY is not set — refusing to write a status file nobody measured.");
  process.exit(2);
}

const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
// The scope is the rows with a body block and no characters. A row with ZERO blocks has no
// transcription wrapper to ask about, so asking would only produce a confident `null`.
const rows = (snap.rows ?? []).filter((r) => (r.bodyChars ?? 0) === 0 && (r.bodyBlocks ?? 0) > 0);

const measured = [];
for (const row of rows) {
  let status = null;
  let error = null;
  try {
    const res = await fetch(`https://api.notion.com/v1/blocks/${row.id}/children?page_size=100`, {
      headers: { Authorization: `Bearer ${key}`, "Notion-Version": "2022-06-28" },
    });
    const body = await res.json();
    if (!res.ok || !Array.isArray(body.results)) error = body?.message ?? `HTTP ${res.status}`;
    else status = pageTranscriptionStatus(body.results);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  measured.push({ pageId: row.id, title: row.title, status, error });
  console.log(`${(status ?? error ?? "no transcription block").padEnd(30)} ${String(row.title ?? "").slice(0, 54)}`);
}

const tally = {};
for (const m of measured) tally[m.status ?? (m.error ? "ERROR" : "no-block")] = (tally[m.status ?? (m.error ? "ERROR" : "no-block")] ?? 0) + 1;

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: "notion:blocks/{id}/children",
      snapshot: SNAPSHOT.slice(REPO.length + 1),
      // The scan's own date, passed by the caller's environment rather than invented by a library
      // clock inside a pure module — the file is data, and it says when it was taken.
      measuredAt: new Date().toISOString(),
      note:
        "Status verbatim per row, for spine rows measuring 0 chars over >=1 block. `error` non-null " +
        "means UNMEASURED — the spine must keep that row owed, never read it as an absence.",
      counts: tally,
      measured,
    },
    null,
    2,
  ) + "\n",
);

console.log(`\n${measured.length} rows measured → ${OUT.slice(REPO.length + 1)}`);
console.log(Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(" · "));
