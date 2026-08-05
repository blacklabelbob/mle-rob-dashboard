#!/usr/bin/env node
/**
 * q84-recount.mjs — MEASURE the rows "no recording can complete", never assert them.
 *
 * Q84 carried the number 26 for five days. It was never counted; it was an assertion, and
 * its own worked example — the Omega 2026-07-28 row — turned out to hold a 531-block Notion
 * transcript (INCIDENT-LEDGER #34). The lesson is not "26 was off by seven". It is that the
 * archive check reads a row's FIELDS (Call Recording, Meeting Summary) and a field can be
 * empty on a page whose BODY holds the whole meeting. Absence in a column is not absence of
 * a record.
 *
 * So this pass asks the body, per row:
 *   - blocks > 0  → the row is NOT unexplained. Something is on that page and a human must
 *                   read it. Reported as `body-present`, never auto-filled, never summarized
 *                   here — inventing a summary from a block count is the same sin one level up.
 *   - blocks == 0 → nothing on the page. Still not proof no record exists anywhere: it may
 *                   live under a different date or database, which is what
 *                   `~/.claude/skills/meeting-record-recovery/scripts/find_meeting.py --date`
 *                   sweeps. Reported as `body-empty — sweep owed`, not as "unrecoverable".
 *
 * READ-ONLY. GET only. Writes nothing to Notion — the pages are evidence.
 *
 * Usage — note `--silent` on the producing command, which is not optional:
 *   npm run --silent check:archive -- --json > /tmp/q84-check.json
 *   npm run --silent recount:q84 -- --input /tmp/q84-check.json   # human table
 *   npm run --silent recount:q84 -- --input /tmp/q84-check.json --json
 *
 * Without `--silent`, npm prints its own `> mle-rob-dashboard@… ` banner onto STDOUT ahead of
 * the JSON and the redirect captures a file that no parser will read. The first live run of
 * this script died exactly there. Left as a documented step rather than papered over in code,
 * because the same trap sits in front of every `npm run … --json > file` in this repo.
 *
 * Input is stdin JSON or `--input <file>`; with neither, it says so and exits rather than
 * guessing which rows are open.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const NOTION_VERSION = "2022-06-28";
const REPO = process.cwd();
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
  console.error("NOTION_API_KEY not found (.env.local or ~/Projects/!env/.env.master). Nothing measured.");
  process.exit(1);
}

async function notion(path) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    headers: { Authorization: `Bearer ${KEY}`, "Notion-Version": NOTION_VERSION },
  });
  if (!res.ok) throw new Error(`Notion GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/**
 * Every block on the page, walked RECURSIVELY.
 *
 * The first cut of this counted top level only, and every row came back "1 block / 0 chars"
 * — which reads as "there is something here" and means nothing. Notion nests a transcript
 * under a single `transcription`/toggle container, so a top-level count is the same
 * mistake one layer down: a container is not content. `find_meeting.py` walks the full tree
 * for exactly this reason (its rule 3), and this pass has to walk it too or its number is
 * as unmeasured as the 26 it replaces.
 */
async function countBody(blockId, depth = 0) {
  let cursor;
  let blocks = 0;
  let chars = 0;
  const kinds = new Map();
  do {
    const q = new URLSearchParams({ page_size: "100" });
    if (cursor) q.set("start_cursor", cursor);
    const page = await notion(`/blocks/${blockId}/children?${q}`);
    for (const b of page.results || []) {
      blocks += 1;
      kinds.set(b.type, (kinds.get(b.type) || 0) + 1);
      const rich = b[b.type]?.rich_text;
      if (Array.isArray(rich)) chars += rich.map((r) => r.plain_text || "").join("").length;
      // Depth cap is a rate-limit guard, not a judgement. A tree deeper than this is
      // reported by its container and handed to find_meeting.py, never called empty.
      if (b.has_children && depth < 4) {
        const child = await countBody(b.id, depth + 1);
        blocks += child.blocks;
        chars += child.chars;
        for (const [k, n] of Object.entries(child.kinds)) kinds.set(k, (kinds.get(k) || 0) + n);
      }
    }
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return { blocks, chars, kinds: Object.fromEntries(kinds) };
}

function readInput() {
  const flag = process.argv.indexOf("--input");
  if (flag !== -1 && process.argv[flag + 1]) return JSON.parse(readFileSync(process.argv[flag + 1], "utf8"));
  if (!process.stdin.isTTY) {
    const raw = readFileSync(0, "utf8").trim();
    if (raw) return JSON.parse(raw);
  }
  return null;
}

const input = readInput();
if (!input?.unexplained?.open) {
  console.error(
    "No archive check on stdin. Run (--silent matters — npm's banner corrupts the JSON):\n" +
      "  npm run --silent check:archive -- --json > /tmp/q84-check.json\n" +
      "  npm run --silent recount:q84 -- --input /tmp/q84-check.json",
  );
  process.exit(2);
}

const open = input.unexplained.open;
const measured = [];
for (const item of open) {
  const { row } = item;
  const day = row.day || item.derivedDay || "";
  let body;
  let error;
  try {
    body = await countBody(row.id);
  } catch (err) {
    error = String(err.message || err);
  }
  measured.push({
    id: row.id,
    title: row.title,
    day,
    dayIsDerived: !row.day && Boolean(item.derivedDay),
    disposition: item.disposition,
    url: row.url,
    body,
    error,
    // The verdict is about EVIDENCE, not about the meeting. Text on the page means a human
    // must read it. Blocks with no text are a container and get their own verdict rather
    // than being counted as either content or absence — that conflation is what produced 26.
    verdict: error
      ? "unmeasured"
      : body.chars > 0
        ? "body-present"
        : body.blocks > 0
          ? "container-only"
          : "body-empty",
  });
}

const counts = {
  openRows: measured.length,
  bodyPresent: measured.filter((m) => m.verdict === "body-present").length,
  containerOnly: measured.filter((m) => m.verdict === "container-only").length,
  bodyEmpty: measured.filter((m) => m.verdict === "body-empty").length,
  unmeasured: measured.filter((m) => m.verdict === "unmeasured").length,
};

if (AS_JSON) {
  console.log(JSON.stringify({ counts, measured }, null, 2));
  process.exit(0);
}

console.log(`\n── Q84 re-count: ${counts.openRows} archive row(s) the field-level check calls unexplained ──`);
console.log(
  `   ${counts.bodyPresent} HAVE readable text on the page (a human must read them — they are not unexplainable)\n` +
    `   ${counts.containerOnly} carry blocks but no text (a container — hand to find_meeting.py, never call empty)\n` +
    `   ${counts.bodyEmpty} have NO blocks at all (cross-database sweep with find_meeting.py still owed — not "unrecoverable")\n` +
    `   ${counts.unmeasured} could not be measured (reported, never assumed empty)`,
);
const MARKS = { "body-present": "📄", "container-only": "📦", "body-empty": "␀", unmeasured: "⚠" };
for (const m of measured) {
  const mark = MARKS[m.verdict];
  const size = m.body ? `${m.body.blocks} blocks / ${m.body.chars} chars` : m.error;
  console.log(`  ${mark} ${(m.day || "NO-DATE").padEnd(10)} ${m.title.slice(0, 52).padEnd(52)} ${size}`);
}
console.log(
  `\nNo page was written to. Rows with a body are NOT summarized here on purpose — a block count is not a read.\n` +
    `Next per row with 📄:  find_meeting.py --page <url>   (prints the content; --brief exits 4 if unread)\n`,
);
