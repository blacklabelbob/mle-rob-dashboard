#!/usr/bin/env node
/**
 * notion-spine-snapshot.mjs — Q86 inc.9: capture the "📞 Master Meetings Database" for the spine.
 *
 * Same shape and same reason as the calendar and Fathom snapshots: the pure modules take
 * already-read rows, so the fetch, the credential and the pagination live out here in a script and
 * never inside anything a test runs (CR-3).
 *
 * WHY THIS MEASURES THE PAGE BODY AND DOES NOT TRUST THE CHECKBOX — this is the whole point of the
 * increment, and it is DoD (d) verbatim: *"the Notion-AI transcript that lives in a page BODY is
 * read"*. On 2026-07-28 the Omega row carried FOUR fields claiming absence (Call Recording, Meeting
 * Summary, Google Doc Link, Export Status) while the page body held 531 blocks / 104,683 characters
 * — the full summary AND the complete transcript. A daily brief then asked Rob twice to dump from
 * memory a meeting that was sitting on disk. INCIDENT-LEDGER #34 (recurrence of #22).
 *
 * So this walks every page's blocks and records `bodyChars` — a measurement — beside
 * `transcriptAvailable`, the human checkbox. Both are written down; neither is allowed to stand in
 * for the other. `lib/meetings/spineSources.ts` decides coverage from the measurement and reports
 * the disagreement as a finding.
 *
 * PII IS DROPPED AT CAPTURE, not after: no attendee emails, no body text — only counts, titles,
 * days and URLs are written. Same subtraction `calendar-snapshot-from-mcp.mjs` performs, so the
 * prose guard never has to catch this file's output.
 *
 * Usage:
 *   node scripts/notion-spine-snapshot.mjs
 *   node scripts/notion-spine-snapshot.mjs --out "MLE Internal Meetings/notion-snapshot-2026-08-07.json"
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
// The same data source `notion-meetings-sync.mjs` writes to — one id, not two copies drifting.
const DATA_SOURCE_ID = "600498eb-b6e0-41af-a625-e369cbe5fc6a";
const NOTION_VERSION = "2025-09-03";

const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OUT = argOf("--out") ?? join(REPO, "MLE Internal Meetings", "notion-snapshot-2026-08-07.json");

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
  console.error("NOTION_API_KEY not found (.env.local or ~/Projects/!env/.env.master). Nothing written.");
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
  if (!res.ok) throw new Error(`Notion ${init.method || "GET"} ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const plainText = (rich) => (Array.isArray(rich) ? rich.map((r) => r.plain_text).join("") : "");

/**
 * Top-level blocks only, and the character count is of their text — never the text itself.
 *
 * Depth is deliberate: a transcript pasted into a page lands as hundreds of sibling paragraphs, so
 * one level is enough to tell a page holding a transcript from an empty one. Recursing would cost
 * a request per toggle for a number that is already unambiguous at 100 vs 100,000 characters.
 */
async function measureBody(pageId) {
  let chars = 0;
  let blocks = 0;
  let cursor;
  do {
    const qs = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) });
    const res = await notion(`/blocks/${pageId}/children?${qs}`);
    for (const b of res.results ?? []) {
      blocks += 1;
      const payload = b[b.type];
      if (payload && Array.isArray(payload.rich_text)) chars += plainText(payload.rich_text).length;
    }
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return { blocks, chars };
}

async function readAllRows() {
  const out = [];
  let cursor;
  do {
    const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    const res = await notion(`/data_sources/${DATA_SOURCE_ID}/query`, { method: "POST", body: JSON.stringify(body) });
    out.push(...(res.results ?? []));
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return out;
}

const pages = await readAllRows();
const rows = [];
for (const page of pages) {
  const p = page.properties || {};
  const get = (name) => p[name] || {};
  const body = await measureBody(page.id);
  rows.push({
    id: page.id,
    title: plainText(get("Meeting Title").title).trim(),
    day: (get("Call Date")?.date?.start || "").slice(0, 10) || undefined,
    url: page.url,
    // The human's checkbox. Recorded because the DISAGREEMENT is the finding — never used as coverage.
    transcriptAvailable: get("Transcript Available")?.checkbox === true,
    recordingLinked: Boolean(get("Call Recording")?.url),
    bodyBlocks: body.blocks,
    bodyChars: body.chars,
  });
}

const snapshot = {
  source: "notion",
  dataSourceId: DATA_SOURCE_ID,
  fetchedAt: new Date().toISOString(),
  note:
    "Body measured, not read: bodyChars counts characters in top-level blocks; no body text, no " +
    "attendee emails are stored here. transcriptAvailable is the human checkbox and is NEVER used " +
    "as coverage — see fromNotion() in lib/meetings/spineSources.ts.",
  rows,
};

writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`✔ ${rows.length} rows → ${OUT}`);
console.log(
  `   ${rows.filter((r) => r.bodyChars >= 2000).length} with a substantial body · ` +
    `${rows.filter((r) => r.transcriptAvailable).length} with the checkbox ticked · ` +
    `${rows.filter((r) => r.bodyChars >= 2000 && !r.transcriptAvailable).length} body-but-no-checkbox (the Omega shape)`,
);
