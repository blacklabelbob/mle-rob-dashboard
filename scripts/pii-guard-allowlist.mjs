#!/usr/bin/env node
// PII guard — THE ALLOWLIST, pinned to the FINDING and not to the file.
//
// Tier A and Tier B will eventually be right about a value they are wrong to
// stop: a doc that must quote a redaction example verbatim, a fixture whose
// whole job is to look real. The usual escape hatch is a per-file or per-rule
// ignore, and the usual result is that the exception outlives the reason for
// it — the line gets rewritten, something else moves into its place, and the
// file is still exempt.
//
// So the unit of exception here is the FINDING, fingerprinted as:
//
//     sha256( salt | file | kind | value | trimmed text of the matched line )
//
// WHAT IS IN THE HASH, AND WHY EACH PART IS THERE
//   file    an exception is granted for one place; moving the text elsewhere is
//           a new decision and gets a new review.
//   kind    an email and a phone on the same line are separate exceptions.
//   value   so allowlisting one contact on a line never silently covers a
//           second contact added to that same line later.
//   line    THE POINT OF THE ITEM: edit the line and the exception expires.
//           Content, not position — see below.
//
// WHAT IS DELIBERATELY *NOT* IN THE HASH
//   the line NUMBER — inserting a paragraph higher up in a file must not expire
//           every exception below it; that would train people to bulk-refresh
//           the allowlist, which is the same as not having one.
//   leading/trailing whitespace — re-indenting a block is not a content change.
//           Any edit to the line's actual text does expire it.
//
// Entries carry a human `reason`. An allowlist entry that no longer matches any
// finding is reported as STALE rather than ignored: a dead exception is a claim
// about the codebase that has stopped being true, and it should be deleted
// while somebody still remembers why it was added.
//
// CLI (no network, no key):
//     node scripts/pii-guard-allowlist.mjs --fingerprint <file> <line> <value> <kind>
//     node scripts/pii-guard-allowlist.mjs --list
// Pure per CR-3: every exported function is text in, data out.

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

export const ALLOWLIST_PATH = "security/pii-allowlist.json";

/** Pinned and not a secret — it only separates this hash space from Tier B's. */
export const ALLOWLIST_SALT = "mle-rob-dashboard/pii-allowlist/v1";

/** The 1-indexed line's text, or "" when the line does not exist. */
export function lineTextAt(text, line) {
  const lines = String(text).split("\n");
  const at = Number(line) - 1;
  return at >= 0 && at < lines.length ? lines[at] : "";
}

/**
 * The fingerprint of one finding in one file's text.
 *
 * `sourceText` is the file the finding came from, so the line's CONTENT can be
 * read here rather than trusted from the caller — a fingerprint computed from a
 * caller-supplied snippet would let a stale snippet keep an exception alive.
 */
export function fingerprintFinding(finding, { sourceText = "", salt = ALLOWLIST_SALT } = {}) {
  const lineText = lineTextAt(sourceText, finding?.line ?? 1).trim();
  const parts = [salt, finding?.file ?? "", finding?.kind ?? "", finding?.value ?? "", lineText];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Split findings into `{ findings, allowed, stale }` (CR-3: data in, data out).
 *
 * `findings` is what still fails the build. `allowed` is what an entry excused,
 * each carrying its reason. `stale` is every entry that excused nothing this
 * run — a fingerprint whose line has since been edited lands here, which is the
 * expiry being *visible* rather than merely silent.
 */
export function applyAllowlist(findings, { allowlist, sourceText = "" } = {}) {
  const entries = allowlist?.entries ?? {};
  const salt = allowlist?.salt ?? ALLOWLIST_SALT;
  const used = new Set();
  const remaining = [];
  const allowed = [];

  for (const finding of findings ?? []) {
    const hash = fingerprintFinding(finding, { sourceText, salt });
    const entry = entries[hash];
    if (!entry) {
      remaining.push(finding);
      continue;
    }
    used.add(hash);
    allowed.push({ ...finding, hash, reason: entry.reason ?? "" });
  }

  const stale = Object.keys(entries)
    .filter((hash) => !used.has(hash))
    .map((hash) => ({ hash, ...entries[hash] }));

  return { findings: remaining, allowed, stale };
}

/**
 * Fold a whole run's per-file results into one verdict.
 *
 * `results` is `[{ file, text, findings }]`. Staleness can only be decided
 * across the WHOLE run — an entry unused by one file may be the exception that
 * covers another — so the per-file `stale` lists are intersected here rather
 * than unioned, which is why this exists instead of callers reducing by hand.
 */
export function applyAllowlistToRun(results, { allowlist } = {}) {
  const entries = allowlist?.entries ?? {};
  const remaining = [];
  const allowed = [];
  const used = new Set();

  for (const result of results ?? []) {
    const step = applyAllowlist(result?.findings ?? [], {
      allowlist,
      sourceText: result?.text ?? "",
    });
    remaining.push(...step.findings);
    allowed.push(...step.allowed);
    for (const a of step.allowed) used.add(a.hash);
  }

  const stale = Object.keys(entries)
    .filter((hash) => !used.has(hash))
    .map((hash) => ({ hash, ...entries[hash] }));

  return { findings: remaining, allowed, stale };
}

export function loadAllowlist(path = ALLOWLIST_PATH) {
  if (!existsSync(path)) return { salt: ALLOWLIST_SALT, algorithm: "sha256", entries: {} };
  return JSON.parse(readFileSync(path, "utf8"));
}

export function formatStale(entry) {
  return `stale allowlist entry ${entry.hash.slice(0, 12)}…  ${entry.reason ?? "(no reason)"}\n    the line it excused has changed or moved — delete it from ${ALLOWLIST_PATH}`;
}

const invokedDirectly =
  process.argv[1] && process.argv[1].endsWith("pii-guard-allowlist.mjs");

if (invokedDirectly) {
  const [mode, file, line, value, kind = "email"] = process.argv.slice(2);

  if (mode === "--fingerprint") {
    if (!file || !line || !value) {
      console.error(
        "usage: node scripts/pii-guard-allowlist.mjs --fingerprint <file> <line> <value> [kind]",
      );
      process.exit(1);
    }
    const sourceText = readFileSync(file, "utf8");
    const hash = fingerprintFinding({ file, line: Number(line), value, kind }, { sourceText });
    console.log(hash);
    console.log(
      `add to ${ALLOWLIST_PATH} as:\n  "${hash}": { "reason": "<why this one is safe>" }`,
    );
    process.exit(0);
  }

  if (mode === "--list") {
    const allowlist = loadAllowlist();
    const entries = Object.entries(allowlist.entries ?? {});
    if (!entries.length) console.log(`${ALLOWLIST_PATH}: 0 entries — nothing is excused.`);
    for (const [hash, entry] of entries) {
      console.log(`${hash.slice(0, 12)}…  ${entry.reason ?? "(no reason)"}`);
    }
    process.exit(0);
  }

  console.error("usage: --fingerprint <file> <line> <value> [kind] | --list");
  process.exit(1);
}
