#!/usr/bin/env node
/**
 * notion-body-dump.mjs — Q86 inc.22: pull ONE Notion page body to disk so a human can read it end to end.
 *
 * WHY THIS EXISTS AS A SCRIPT AND NOT AS AN AD-HOC CURL. Increments 15-21 each ruled one source
 * document, and every one of those reads was performed by hand. That is fine once and a defect by
 * the fifth time: the ruling in `notion-read-confirmations.json` cites a file at
 * `MLE Internal Meetings/archive-reads/<slug>.deepread.txt`, and Q86 inc.26 (`citedEvidenceExists`)
 * exists precisely because a cited evidence file once did not exist. A script that always writes the
 * file it names is the only version of that guarantee which does not depend on remembering.
 *
 * WHAT IT DOES NOT DO — and this is the whole discipline of the Notion edge:
 *   - It does NOT rule. Dumping a body is "located and pulled, not judged" (the note at the head of
 *     `notion-read-confirmations.json`). Only a human read, followed by a hand-written confirmation
 *     row, turns `hasTranscript` true in `fromNotion()`.
 *   - It does NOT read the `Transcript Available` checkbox, or any other property. Four fields on
 *     the 2026-07-28 Omega row claimed absence over a 104,683-character transcript
 *     (INCIDENT-LEDGER #34); this file measures the body and lets the body speak.
 *   - It does NOT summarise, truncate or reflow. Block text is written verbatim with its block type
 *     in front, because the SHAPE of the body (91 sibling `[paragraph]` blocks vs 7 bullets under a
 *     heading) is the evidence that separates a transcript from an AI summary of one.
 *
 * PII: the opposite call from `notion-spine-snapshot.mjs`, deliberately. The snapshot is committed
 * as counts-only, so it drops body text. This writes body text, which is the point — it lands in
 * `archive-reads/`, alongside 40+ existing deepreads, where transcripts are already kept.
 *
 * Usage:
 *   node scripts/notion-body-dump.mjs <pageId> --slug 2026-07-15-joseph-rob-will-next-steps
 *   node scripts/notion-body-dump.mjs <pageId>            # slug derived from the page title
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOTION_VERSION = "2025-09-03";

const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const pageId = process.argv[2];
if (!pageId || pageId.startsWith("--")) {
  console.error("usage: node scripts/notion-body-dump.mjs <pageId> [--slug <slug>]");
  process.exit(1);
}

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

async function notion(path) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    headers: { Authorization: `Bearer ${KEY}`, "Notion-Version": NOTION_VERSION },
  });
  if (!res.ok) throw new Error(`Notion GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const plainText = (rich) => (Array.isArray(rich) ? rich.map((r) => r.plain_text).join("") : "");

const page = await notion(`/pages/${pageId}`);
const props = page.properties || {};
const title = plainText(props["Meeting Title"]?.title).trim() || "(untitled)";
const callDate = props["Call Date"]?.date?.start || "";

/**
 * Top-level blocks, same depth as the snapshot that measured this page. One level is what
 * distinguishes a transcript from a summary; recursing into toggles would cost a request per node
 * for a distinction already made at the sibling level.
 */
const lines = [];
let blocks = 0;
let chars = 0;
const byType = new Map();
let cursor;
do {
  const qs = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) });
  const res = await notion(`/blocks/${pageId}/children?${qs}`);
  for (const b of res.results ?? []) {
    blocks += 1;
    byType.set(b.type, (byType.get(b.type) ?? 0) + 1);
    const payload = b[b.type];
    const text = payload && Array.isArray(payload.rich_text) ? plainText(payload.rich_text) : "";
    chars += text.length;
    lines.push(`[${b.type}] ${text}`);
  }
  cursor = res.has_more ? res.next_cursor : null;
} while (cursor);

const slug =
  argOf("--slug") ??
  `${(callDate || "undated").slice(0, 10)}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}`;
const out = join(REPO, "MLE Internal Meetings", "archive-reads", `${slug}.deepread.txt`);

/**
 * THE HEADER FORMAT IS NOT COSMETIC — `parseDeepReadHeader` in `lib/meetings/notionReads.ts` reads
 * exactly two lines out of it: `id : <uuid>` and `BODY: <n> blocks, <n> chars`. A dump written in
 * any other shape parses to `null`, the read vanishes from the index, and the ruling that cites it
 * lands in `orphanedConfirmations` — which is how the first run of this script failed its own guard
 * test. Emitting the canonical shape from code is the reason this script exists at all.
 */
const shape = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}×${n}`).join(", ");
const RULE = "=".repeat(78);
const THIN = "-".repeat(78);

// Every property, printed whether set or not. The EMPTY ones are the point: on the 2026-07-28 Omega
// row four populated-looking fields read `None` over a 104,683-char body (INCIDENT-LEDGER #34), so
// a field claiming absence is written down here to be contradicted by the body below, never trusted.
const propLines = [];
const claimsAbsence = [];
for (const [name, prop] of Object.entries(props)) {
  const t = prop.type;
  let value = null;
  if (t === "title" || t === "rich_text") value = plainText(prop[t]).trim() || null;
  else if (t === "url" || t === "email" || t === "phone_number") value = prop[t] || null;
  else if (t === "checkbox") value = prop.checkbox ? "true" : "false";
  else if (t === "select") value = prop.select?.name || null;
  else if (t === "multi_select") value = (prop.multi_select || []).map((s) => s.name).join(", ") || null;
  else if (t === "date") value = prop.date?.start || null;
  else if (t === "number") value = prop.number ?? null;
  const empty = value === null || value === "";
  // Notion returns `created_time` / `last_edited_time` / `formula` / `rollup` without a value in
  // this projection. They are computed, so nobody ever "left them blank" and listing them as
  // fields claiming absence inflates the count that matters. The Omega finding is that a field a
  // HUMAN fills was empty over a full transcript; a warning that cries wolf on 20 fields when 8
  // are real is the same as no warning.
  const humanFillable = !["created_time", "last_edited_time", "formula", "rollup", "checkbox"].includes(t);
  propLines.push(`  ${empty ? "∅" : "·"} ${name} [${t}]: ${empty ? "None" : value}${empty && humanFillable ? "  ← claims absence" : ""}`);
  if (empty && humanFillable) claimsAbsence.push(`      · ${name} [${t}] = None`);
}

const contradiction =
  chars > 0 && claimsAbsence.length
    ? [
        `  ⚠ ${claimsAbsence.length} field(s) imply 'no record'. CONTRADICTED — the body below HAS content.`,
        `    Trust the body, not the field.`,
        ...claimsAbsence,
      ]
    : [];

const header = [
  RULE,
  `TITLE (do not trust): ${title}`,
  `URL: ${page.url}`,
  `id : ${page.id}`,
  `CALL DATE: ${callDate || "(none)"}`,
  THIN,
  `PROPERTIES — in full; this is where the identity the title omits lives:`,
  ...propLines,
  THIN,
  `BODY: ${blocks} blocks, ${chars} chars — ${shape || "(empty)"}`,
  ...contradiction,
  THIN,
  `PULLED, NOT RULED. A verdict lives in MLE Internal Meetings/notion-read-confirmations.json and`,
  `is written by a human after reading this file end to end. This file existing is NOT coverage.`,
  RULE,
  ``,
].join("\n");

writeFileSync(out, header + lines.join("\n") + "\n", "utf8");
console.log(`${blocks} blocks / ${chars} chars -> ${out}`);
console.log(`shape: ${shape}`);
