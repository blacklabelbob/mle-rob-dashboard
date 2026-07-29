#!/usr/bin/env node
// ENV MANIFEST — proves `.env.example` lists every environment variable the
// code actually reads (Q71 Phase 5, PRD-scaffolding-in-git-data-in-supabase-v1).
//
// Why this is code and not a careful reading: `.env.example` documented 5 vars
// while tracked code read 22. A fresh clone therefore boots missing seams the
// reader has no way to discover — the exact failure the "one command" phase
// exists to remove. Prose ages; this run fails.
//
// TWO read shapes exist in this repo and BOTH are load-bearing:
//   1. `process.env.X` / `process.env["X"]` — direct reads.
//   2. `env.X` where `env` is an injected `NodeJS.ProcessEnv` (lib/aidreCall.ts,
//      lib/n8nEmail.ts, lib/leads/intakeAuth.ts, lib/vapi.ts). A scanner that
//      only knew shape 1 would report those four secrets as "not read anywhere"
//      and quietly bless an incomplete example file — worse than no scanner.
//
// Deliberately NOT scanned: test files. Tests set vars to drive branches
// (CRM_DATA_PATH, NETWORK_DATA_DIR fixtures); requiring a human to configure
// them in a clone would be documenting the harness, not the app. Vars that are
// read by BOTH test and non-test code are still required — the non-test read is
// what makes them real.
//
// Pure functions take text and return data (CR-3): no clock, no network, and
// the CLI is the only part that touches the filesystem.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Property access on `process.env` or on a bare identifier named `env`.
// The name must be SCREAMING_SNAKE with at least 3 chars so ordinary members
// (`env.NODE`, an accidental `env.X`) can't inflate the required set.
const READ_PATTERN =
  /(?:process\.env|(?<![.\w])env)(?:\.([A-Z][A-Z0-9_]{2,})\b|\[\s*["'`]([A-Z][A-Z0-9_]{2,})["'`]\s*\])/g;

/**
 * Blank out comment bodies so a variable NAMED in prose is not counted as READ.
 * This file is its own first witness: a comment below explains that `env.NODE`
 * must not match, and once this script became tracked the scanner found that
 * sentence and demanded `NODE` be documented.
 *
 * Deliberately conservative — a line comment counts only when `//` opens the
 * line, and a block comment only when `/*` does. Mid-line trailing comments are
 * therefore still scanned, which can over-report a name nobody reads. That is
 * the safe direction: an extra required name is loud and one edit away, while
 * missing a real read is a silent hole in the very guarantee this file sells.
 * The alternative — tracking string state to find mid-line `//` — misreads the
 * quote characters inside this file's own regex literal and can lose real reads.
 */
export function stripComments(text) {
  const out = [];
  let inBlock = false;
  for (const line of String(text).split("\n")) {
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) {
        out.push("");
        continue;
      }
      inBlock = false;
      out.push(line.slice(end + 2));
      continue;
    }
    const start = line.length - line.trimStart().length;
    if (line.startsWith("//", start)) {
      out.push("");
      continue;
    }
    if (line.startsWith("/*", start)) {
      const end = line.indexOf("*/", start + 2);
      if (end === -1) {
        inBlock = true;
        out.push(line.slice(0, start));
        continue;
      }
      out.push(line.slice(0, start) + line.slice(end + 2));
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Every env var name read by this source text, sorted and deduped. */
export function scanEnvReads(text) {
  const found = new Set();
  for (const m of stripComments(text).matchAll(READ_PATTERN)) {
    found.add(m[1] ?? m[2]);
  }
  return [...found].sort();
}

/**
 * Names documented by a .env.example. A name counts as documented when it
 * appears as a `KEY=` assignment at the start of a line — a mention inside a
 * comment does not, because a reader copying the file would not get the key.
 */
export function parseEnvExample(text) {
  const found = new Set();
  for (const line of String(text).split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]{2,})\s*=/.exec(line);
    if (m) found.add(m[1]);
  }
  return [...found].sort();
}

/** True for paths whose env reads are harness-only and need no documentation. */
export function isTestPath(file) {
  return /(^|\/)__tests__\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
}

/**
 * Compare what the code reads against what the example documents.
 * `sources` is [{ file, text }]. Returns undocumented (the failure) and
 * documented-but-unread (reported, never fatal: a var may be consumed by
 * Vercel, a hook, or a human runbook rather than by code in this repo).
 */
export function diffEnvManifest({ sources, exampleText }) {
  const readBy = new Map();
  for (const { file, text } of sources) {
    if (isTestPath(file)) continue;
    for (const name of scanEnvReads(text)) {
      if (!readBy.has(name)) readBy.set(name, []);
      readBy.get(name).push(file);
    }
  }
  const documented = new Set(parseEnvExample(exampleText));
  const undocumented = [...readBy.keys()]
    .filter((n) => !documented.has(n))
    .sort()
    .map((name) => ({ name, files: readBy.get(name).sort() }));
  const unread = [...documented].filter((n) => !readBy.has(n)).sort();
  return { undocumented, unread, readCount: readBy.size };
}

const SCANNABLE = /\.(ts|tsx|mjs|cjs|js|jsx)$/;

function isMain() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && SCANNABLE.test(f));
  const sources = tracked.map((file) => ({
    file,
    text: readFileSync(path.join(repoRoot, file), "utf8"),
  }));
  // Until 2026-07-29 `.gitignore`'s `.env*` swallowed this file, so a fresh
  // clone had none. A cryptic ENOENT would send the next reader hunting; say it.
  const examplePath = path.join(repoRoot, ".env.example");
  if (!existsSync(examplePath)) {
    console.error(".env.example is missing. It is tracked (see the !.env.example line in .gitignore) — restore it with `git checkout .env.example`.");
    process.exit(1);
  }
  const exampleText = readFileSync(examplePath, "utf8");
  const { undocumented, unread, readCount } = diffEnvManifest({ sources, exampleText });

  console.log(`env-manifest: ${readCount} variables read across ${sources.length} tracked files`);
  if (unread.length) {
    console.log(`  documented but not read in code (fine, not a failure): ${unread.join(", ")}`);
  }
  if (undocumented.length === 0) {
    console.log("  .env.example is complete — exit 0");
    process.exit(0);
  }
  console.error(`\n${undocumented.length} variable(s) read by code but MISSING from .env.example:`);
  for (const { name, files } of undocumented) {
    console.error(`  ${name}  ← ${files.slice(0, 3).join(", ")}${files.length > 3 ? ` (+${files.length - 3} more)` : ""}`);
  }
  console.error("\nFix: add each name to .env.example with a one-line comment saying what happens when it is unset.");
  process.exit(1);
}
