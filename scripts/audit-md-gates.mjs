#!/usr/bin/env node
// Q80 increment 1 — enforce "no build item may be gated on an unread .md".
//
// USAGE
//   npm run audit:mdgates            # BUILD-QUEUE.md
//   node --import ./scripts/ts-loader.mjs scripts/audit-md-gates.mjs <file...>
//
// EXIT CODES
//   0  no open item is gated on a markdown deliverable Rob cannot consume
//   1  at least one is — the gate is live and holding work right now
//   2  a file could not be read (a silent skip would read as "clean")
//
// The judgement lives in `lib/queue/mdGates.ts` under 12 tests; this file only
// reads bytes and prints, so nothing decided by the tests is re-decided here.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { findMdGates } from "../lib/queue/mdGates.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (files.length === 0) files.push(path.join(REPO_ROOT, "BUILD-QUEUE.md"));

let findings = 0;
let unreadable = 0;

for (const file of files) {
  const abs = path.resolve(REPO_ROOT, file);
  const rel = path.relative(REPO_ROOT, abs);
  let text;
  try {
    text = await readFile(abs, "utf8");
  } catch (err) {
    console.error(`✖ ${rel}: cannot read (${err.code ?? err.message})`);
    unreadable++;
    continue;
  }

  const gates = findMdGates(text);
  if (gates.length === 0) {
    console.log(`✓ ${rel}: no open item gated on an unread .md`);
    continue;
  }

  for (const g of gates) {
    findings++;
    console.error(`\n✖ ${rel}:${g.line}  ${g.id} is gated on markdown Rob does not read`);
    console.error(`    gate:  "${g.phrase}"`);
    console.error(`    said:  ${g.quote}`);
    console.error(`    doc:   ${g.docs.join(", ")}`);
  }
}

if (unreadable > 0) process.exit(2);

if (findings > 0) {
  console.error(
    `\n${findings} live markdown gate${findings === 1 ? "" : "s"}. ` +
      `Preference #9: Rob does NOT read markdown deliverables — an approval gate on ` +
      `a doc he cannot open is a self-inflicted deadlock (Q80, 2026-07-29).`,
  );
  console.error(
    `Fix by re-shipping the deliverable in a consumable form (dashboard page / PDF / XLSX) ` +
      `and restating the item with a decision Max makes himself — not by deleting the sentence.`,
  );
  console.error(
    `If an item must quote a gate to abolish it, mark it: (md-gate-audit: exempt — <reason>)`,
  );
  process.exit(1);
}

process.exit(0);
