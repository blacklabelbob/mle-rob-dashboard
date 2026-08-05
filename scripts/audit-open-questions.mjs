#!/usr/bin/env node
/**
 * Fail the build when a question about something ROB KNOWS has gone unasked.
 *
 * INCIDENT-LEDGER #38. "Gary↔Miga tie is publicly UNVERIFIED — ask Rob its nature"
 * sat in a dossier for 28 days. Every reader downstream, including two docs written
 * on 2026-08-05, treated it as a finding about the world instead of a note that
 * nobody had asked. When Rob was finally asked, he had been right all along.
 *
 * Three prior instances of this shape were each answered with a rule scoped to the
 * surface that had just failed. This is the code version.
 *
 * Usage:
 *   node scripts/audit-open-questions.mjs [--as-of YYYY-MM-DD] [--max-age N] [--json]
 *
 * Exit: 0 clean · 1 stale questions found · 2 bad invocation
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

import { classify, render, scanDoc } from "../lib/research/openQuestions.ts";

// fileURLToPath, NOT .pathname — this repo's directory contains a space, and
// .pathname returns it percent-encoded ("MLE%20ROB%20Dashboard"), which makes every
// readdirSync throw. The first version caught that and reported "0 open questions,
// clean" — a gate that silently passes because it read nothing is worse than no gate.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCAN_DIRS = ["docs/research", "docs/plans"];

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const asOf = flag("--as-of", new Date().toISOString().slice(0, 10));
const maxAge = Number(flag("--max-age", "14"));
const asJson = args.includes("--json");

if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(maxAge)) {
  console.error("usage: audit-open-questions.mjs [--as-of YYYY-MM-DD] [--max-age N] [--json]");
  process.exit(2);
}

/** A date in the filename is the most reliable signal a doc carries. */
function docDateFor(path, body) {
  return (
    path.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ??
    body.match(/^\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/m)?.[1] ??
    body.match(/^#.*\((\d{4}-\d{2}-\d{2})\)/m)?.[1] ??
    body.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ??
    null
  );
}

function walk(dir, out = [], top = true) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (err) {
    // A missing NESTED dir is nothing. A missing SCAN ROOT means this gate is
    // inspecting an empty set and would report clean — fail loudly instead.
    if (top) {
      console.error(`audit-open-questions: cannot read scan root ${dir} — ${err.message}`);
      process.exit(2);
    }
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out, false);
    else if (e.endsWith(".md")) out.push(p);
  }
  return out;
}

const questions = [];
for (const d of SCAN_DIRS) {
  for (const file of walk(join(ROOT, d))) {
    const body = readFileSync(file, "utf8");
    questions.push(
      ...scanDoc(relative(ROOT, file), body, asOf, docDateFor(file, body)),
    );
  }
}

const verdict = classify(questions, maxAge);

if (asJson) {
  console.log(JSON.stringify({ asOf, maxAge, ...verdict }, null, 2));
} else {
  console.log(render(verdict, maxAge));
}

// Undated questions do NOT fail: many are historical and predate this gate. They are
// reported so the number is visible and shrinks deliberately, which is the same
// discipline migrationBacklog uses for pre-convention migrations.
process.exit(verdict.stale.length > 0 ? 1 : 0);
