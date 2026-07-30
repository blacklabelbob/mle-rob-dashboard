#!/usr/bin/env node
// Q80 half 2 — build `data/research-digest.json` from the research docs themselves.
//
// USAGE
//   node --import ./scripts/ts-loader.mjs scripts/gen-research-digest.mjs [--check]
//     (default)  rewrites data/research-digest.json
//     --check    verifies the committed file matches the docs, writes nothing
//
// EXIT CODES
//   0  in sync
//   2  --check and the committed digest is stale (the screen would be showing a
//      version of a doc that no longer exists — the exact failure mode Q79 hit)
//   1  a source doc is missing/unreadable. Loudly, not silently: a digest that
//      quietly drops a doc reads as "there is nothing to see here", which is how
//      these two docs went unseen for a week in the first place.
//
// WHY A COMMITTED FILE AND NOT A REQUEST-TIME PARSE: same reason as the agent
// inventory — the gate and the page must never be able to disagree. The parsing
// rules live in lib/research/digest.ts under 18 tests; this file only reads bytes.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseDigest } from "../lib/research/digest.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_PATH = path.join(REPO_ROOT, "data", "research-digest.json");
const CHECK = process.argv.includes("--check");

// The two docs Q80 names. Adding one here is the whole cost of surfacing it.
const DOCS = [
  {
    slug: "master-view-2",
    path: "docs/plans/MASTER-VIEW-2.0-DESIGN.md",
    blurb: "What the Master View is for, and what it shows Rob that the rep screen never will.",
  },
  {
    slug: "rep-cockpit",
    path: "docs/research/REP-COCKPIT-RESEARCH-2026-07-23.md",
    blurb: "The rep's seat: what a day looks like when the CRM does the logging.",
  },
];

async function build() {
  const digests = [];
  for (const doc of DOCS) {
    let markdown;
    try {
      markdown = await readFile(path.join(REPO_ROOT, doc.path), "utf8");
    } catch (error) {
      console.error(`✖ cannot read ${doc.path}: ${error.message}`);
      process.exit(1);
    }
    digests.push({ ...parseDigest(markdown, doc), blurb: doc.blurb });
  }
  return { docs: digests };
}

const payload = await build();
const serialized = `${JSON.stringify(payload, null, 2)}\n`;

if (CHECK) {
  let committed = "";
  try {
    committed = await readFile(OUT_PATH, "utf8");
  } catch {
    console.error("✖ data/research-digest.json is missing — run `npm run digest:research`.");
    process.exit(2);
  }
  if (committed !== serialized) {
    console.error(
      "✖ data/research-digest.json is stale: a source doc changed since it was generated.\n" +
        "  The /ops/research page renders the committed file, so it would be showing an old\n" +
        "  version of a doc. Run `npm run digest:research` and commit the result.",
    );
    process.exit(2);
  }
  console.log(`✔ research digest in sync (${payload.docs.length} docs).`);
  process.exit(0);
}

await writeFile(OUT_PATH, serialized, "utf8");
for (const doc of payload.docs) {
  const asks = doc.sections.reduce((n, s) => n + (s.asksRob ? s.points.length : 0), 0);
  const decided = doc.sections.filter((s) => s.decision).length;
  console.log(
    `  ${doc.slug}: ${doc.sections.length} sections, ${decided} with a decision, ${asks} asks for Rob`,
  );
}
console.log(`✔ wrote data/research-digest.json`);
