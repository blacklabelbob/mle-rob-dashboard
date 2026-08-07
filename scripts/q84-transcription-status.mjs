#!/usr/bin/env node
/**
 * Ask Notion, per row, whether a transcript was ever produced.
 *
 * Q84 inc.49 left 18 rows in `open-in-notion` — "a human must open these in a browser" — on the
 * reasoning that the API returned a `[transcription]` wrapper with no text under it, so the
 * READER was exhausted rather than the page empty. That reasoning never looked at the
 * transcription block itself. It carries a `status`.
 *
 * This script reads it. It performs no read of any meeting, summarises nothing, and writes
 * nothing to Notion or the CRM — it fetches one page of children per row and reports the status
 * field verbatim. All judgement lives in `lib/meetings/transcriptionStatus.ts` (pure, CR-3);
 * this file only does the network and the printing.
 *
 * Usage:
 *   npm run --silent check:archive -- --json > /tmp/q84-check.json
 *   npm run --silent recount:q84 -- --input /tmp/q84-check.json --json > /tmp/q84-recount.json
 *   npm run status:q84 -- --input /tmp/q84-recount.json [--json] [--all]
 *
 * Default scope is the `container-only` rows, because those are the ones whose disposition this
 * answers. `--all` measures every row in the re-count.
 */
import fs from "node:fs";
import { classifyTranscription, pageTranscriptionStatus } from "../lib/meetings/transcriptionStatus.ts";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const input = value("--input");
if (!input) {
  console.error("--input <recount.json> is required. Produce it with:");
  console.error("  npm run --silent check:archive -- --json > /tmp/q84-check.json");
  console.error("  npm run --silent recount:q84 -- --input /tmp/q84-check.json --json > /tmp/q84-recount.json");
  process.exit(2);
}

const key = process.env.NOTION_API_KEY;
if (!key) {
  console.error("NOTION_API_KEY is not set — refusing to report a status nobody measured.");
  process.exit(2);
}

const recount = JSON.parse(fs.readFileSync(input, "utf8"));
const measured = recount.measured ?? [];
const rows = flag("--all") ? measured : measured.filter((r) => r.verdict === "container-only");

const results = [];
for (const row of rows) {
  let status = null;
  let error = null;
  try {
    const res = await fetch(`https://api.notion.com/v1/blocks/${row.id}/children?page_size=100`, {
      headers: { Authorization: `Bearer ${key}`, "Notion-Version": "2022-06-28" },
    });
    const body = await res.json();
    if (!res.ok || !Array.isArray(body.results)) {
      // A failed fetch is reported as a failure, never as an absence. This is the whole point.
      error = body?.message ?? `HTTP ${res.status}`;
    } else {
      status = pageTranscriptionStatus(body.results);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const verdict = error ? null : classifyTranscription(status);
  results.push({
    id: row.id,
    title: row.title,
    day: row.day,
    url: row.url,
    verdict: row.verdict,
    error,
    status: verdict?.status ?? null,
    disposition: error ? "unmeasured" : verdict.disposition,
    why: error ? `status could not be read: ${error}` : verdict.why,
  });
}

const tally = {};
for (const r of results) tally[r.disposition] = (tally[r.disposition] ?? 0) + 1;

if (flag("--json")) {
  console.log(JSON.stringify({ counts: tally, measured: results }, null, 2));
} else {
  const MARK = {
    "never-produced": "␀",
    "transcript-exists": "📄",
    unknown: "?",
    unmeasured: "⚠",
  };
  for (const r of results) {
    console.log(`${MARK[r.disposition]} ${String(r.status ?? "—").padEnd(28)} ${r.day ?? "no-date"}  ${String(r.title ?? "").slice(0, 52)}`);
    if (r.disposition !== "never-produced") console.log(`     open: ${r.url}`);
  }
  console.log("");
  console.log(`${results.length} rows measured: ` + Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(" · "));
  const owed = results.filter((r) => r.disposition !== "never-produced");
  console.log(
    owed.length === 0
      ? "Notion reports NO transcript was ever produced for any of these. Opening them in a browser cannot recover text that does not exist."
      : `${owed.length} row(s) still owe a human read — the rest are answered by Notion's own status field.`,
  );
}
