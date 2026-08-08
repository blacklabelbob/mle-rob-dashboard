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
 * THE WALK RECURSES, AND THAT IS THE WHOLE POINT OF Q86 inc.26.
 *
 * The first version of this file walked ONE level, "same depth as the snapshot that measured this
 * page", on the reasoning that sibling shape already separates a transcript from a summary. Run
 * against the 2026-07-28 Omega page that reasoning writes a 0-character deepread over a 104,683-
 * character transcript — because that page's entire body is ONE `transcription` block with
 * `has_children: true`. A tool whose job is to make a body readable may not inherit the exact
 * blindness (`notion-spine-snapshot.mjs`'s top-level cap) that the body it is aimed at defeats.
 * Cost is not the objection it was for the snapshot: the snapshot walks 49 rows, this walks one.
 *
 * `MAX_DEPTH` and `MAX_BLOCKS` are stated rather than assumed, and when either bites the header
 * SAYS SO — a truncated read that does not announce its truncation is the defect one layer up.
 */
const MAX_DEPTH = 8;
const MAX_BLOCKS = 20000;

/**
 * Notion does not put block text in one field. Ordinary blocks carry `rich_text`; `table_of_
 * contents`-style and the AI-meeting `transcription` block carry `title`. The single-field read
 * scored Omega's top-level block at 0 chars while its own `title` held 53 — so the field is
 * probed, not assumed, and an unknown block type degrades to empty text rather than to a crash.
 */
const blockText = (payload) => {
  if (!payload) return "";
  if (Array.isArray(payload.rich_text)) return plainText(payload.rich_text);
  if (Array.isArray(payload.title)) return plainText(payload.title);
  return "";
};

const lines = [];
let blocks = 0;
let chars = 0;
let deepest = 0;
let truncated = null;
const byType = new Map();

async function walk(parentId, depth) {
  if (depth > MAX_DEPTH) {
    truncated ??= `depth cap ${MAX_DEPTH} reached — deeper blocks NOT read`;
    return;
  }
  let cursor;
  do {
    const qs = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) });
    const res = await notion(`/blocks/${parentId}/children?${qs}`);
    for (const b of res.results ?? []) {
      if (blocks >= MAX_BLOCKS) {
        truncated ??= `block cap ${MAX_BLOCKS} reached — remaining blocks NOT read`;
        return;
      }
      blocks += 1;
      deepest = Math.max(deepest, depth);
      byType.set(b.type, (byType.get(b.type) ?? 0) + 1);
      const text = blockText(b[b.type]);
      chars += text.length;
      lines.push(`${"  ".repeat(depth)}[${b.type}] ${text}`);
      if (b.has_children) await walk(b.id, depth + 1);
    }
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
}

await walk(pageId, 0);

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
  // `chars` is BLOCK TEXT ONLY, and the label says so because the number next to it in the
  // archive does not mean the same thing. `find_meeting.py:290` computes `sum(len(l) for l in
  // body)` over its RENDERED lines, so its total carries the `[type]` prefix and the indent —
  // on the 2026-07-28 Omega page that is 104,683 against this file's 95,834 over the identical
  // 531 blocks, a ~9% inflation that looks exactly like a bigger read. Comparing the two, or
  // either against the snapshot's text-only count, is inc.24's depth-cap error one layer up:
  // an apples-to-oranges number published as a measurement.
  `BODY: ${blocks} blocks, ${chars} chars of block TEXT (no markup) — ${shape || "(empty)"}`,
  // RECURSIVE, and it says how deep. `notionReads.ts` documents these counts as "typically HIGHER
  // than the snapshot's top-level count"; printing the depth is what lets a reader tell a real
  // agreement from the accident of a flat page. A cap that bit is stated, never silently absorbed.
  `DEPTH: walked ${deepest + 1} level(s), cap ${MAX_DEPTH}${truncated ? ` — ⚠ TRUNCATED: ${truncated}` : " — not truncated"}`,
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
