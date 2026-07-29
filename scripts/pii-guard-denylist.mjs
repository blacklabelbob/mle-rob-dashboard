#!/usr/bin/env node
// PII guard, TIER B — the HASHED DENYLIST over every tracked file.
//
// Tier A (scripts/pii-guard-structural.mjs) is the stronger check, but it only
// reaches the three generated JSON files: it works by PARSING, so it has nothing
// to say about a markdown doc, a test fixture, a commit-message-shaped note in
// BUILD-QUEUE.md, or an HTML artifact. Tier B covers the other ~698 tracked
// files with the weaker but broader question:
//
//     does this file contain a contact we already know is real?
//
// It can only catch what has been written down. That is the point of running
// both: Tier A guarantees the data files, Tier B watches everything else for a
// re-paste of a contact that Phase 1 already redacted once.
//
// WHY HASHES, AND WHAT THAT DOES *NOT* BUY
// The denylist is committed, so it may not contain plaintext contacts — a
// committed list of ~35 real emails and ~30 real phones would be the exact
// artifact this whole PRD exists to remove, merely relabelled "security".
// Hashing keeps the file from being readable as a contact list: it does not
// survive grep, a leaked-secret scanner, or a casual reader.
//
// It is NOT confidentiality. A 10-digit phone number is a 10^10 search space;
// anyone holding this file and wanting the numbers back can have them in
// seconds, salt or no salt. The pinned salt below defeats off-the-shelf rainbow
// tables and nothing more. This is written down rather than glossed because a
// guard that oversells its own protection is how the next real leak gets
// committed under the belief that it was safe.
//
// The real protection remains: the plaintext sources live only in gitignored
// files (`data/network.local.json`, `backups/`), and `--build` is the only code
// that reads them.
//
// CLI (no network, no key):
//     node scripts/pii-guard-denylist.mjs                  # scan tracked files
//     node scripts/pii-guard-denylist.mjs <file>...        # scan specific files
//     node scripts/pii-guard-denylist.mjs --build <src>... # rebuild the denylist
// Exit 0 clean, 1 with `file:line` + the label of what was matched.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { isRedactableEmail, isRedactablePhone } from "./prose-redact.mjs";

export const DENYLIST_PATH = "security/pii-denylist.json";

/**
 * Pinned, committed, and deliberately not a secret — see the header. Its only
 * job is to make this list useless to a generic precomputed table.
 */
export const DENYLIST_SALT = "mle-rob-dashboard/pii-denylist/v1";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Same shape rule as Tier A: a separator is required somewhere, and a match may
// not sit flush against another digit or a decimal point. That second guard is
// what keeps SVG path data and `viewBox` geometry out (Phase 1 item 7 found a
// NANP-valid "phone" spanning two coordinates in ARCHITECTURE-ATLAS.html).
const PHONE_RE =
  /(?<![\d.])(?:\+?1[-. ])?(?:\(\d{3}\)[-. ]?|\d{3}[-. ])\d{3}[-. ]\d{4}(?![\d.])/g;

/** Lowercased address, or null when the value isn't one. */
export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(trimmed) ? trimmed : null;
}

/**
 * 10-digit national number, or null. Normalizing to digits is what makes the
 * denylist survive reformatting: `(813) 555-0142`, `813.555.0142` and
 * `+1 813 555 0142` all reduce to the same secret, so a re-paste in a different
 * style still fires.
 */
export function normalizePhone(value) {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 ? national : null;
}

/** SHA-256 over `salt|kind|normalized`. Kind is included so an email and a
 *  phone can never collide into each other's label. */
export function hashSecret(kind, normalized, salt = DENYLIST_SALT) {
  return createHash("sha256").update(`${salt}|${kind}|${normalized}`).digest("hex");
}

/**
 * The human label for a denied contact.
 *
 * Labels are committed, so they follow the precedent Phase 1's prose redactor
 * set: the ORGANISATION survives, the INDIVIDUAL does not. An email is labelled
 * by its domain, a phone by its area code. Both are enough for Rob to recognise
 * which contact a finding is about; neither re-introduces the individual into
 * git, which a label like "Jane Doe — mobile" would.
 */
export function labelFor(kind, normalized) {
  if (kind === "email") {
    const at = normalized.lastIndexOf("@");
    return `real contact · email @${normalized.slice(at + 1)}`;
  }
  return `real contact · phone, area ${normalized.slice(0, 3)}`;
}

/** Every contact-shaped candidate in raw text, normalized and deduped. */
export function extractCandidates(text) {
  const out = [];
  const seen = new Set();
  const push = (kind, raw, normalized) => {
    if (!normalized) return;
    const key = `${kind}|${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, raw, normalized });
  };
  for (const raw of text.match(EMAIL_RE) ?? []) push("email", raw, normalizeEmail(raw));
  for (const raw of text.match(PHONE_RE) ?? []) push("phone", raw, normalizePhone(raw));
  return out;
}

/** 1-indexed line of the first occurrence of `needle`, or 1. */
export function lineOf(text, needle) {
  const at = text.indexOf(needle);
  return at < 0 ? 1 : text.slice(0, at).split("\n").length;
}

/**
 * Scan one file's TEXT against a denylist (CR-3: text in, findings out — no
 * path, no I/O, no clock).
 *
 * `denylist` is `{ salt, entries: { <hash>: <label> } }` — the shape written by
 * `--build` and committed at DENYLIST_PATH.
 */
export function scanDenylist(text, { denylist, label = "<text>" } = {}) {
  const entries = denylist?.entries ?? {};
  const salt = denylist?.salt ?? DENYLIST_SALT;
  const findings = [];
  const candidates = extractCandidates(text);

  for (const { kind, raw, normalized } of candidates) {
    const hit = entries[hashSecret(kind, normalized, salt)];
    if (!hit) continue;
    findings.push({
      file: label,
      line: lineOf(text, raw),
      kind,
      value: raw,
      message: `${hit} — this is a KNOWN REAL contact and may not be committed`,
    });
  }

  return { findings, counts: { candidates: candidates.length, denied: findings.length } };
}

/**
 * Should this contact be DENIED, i.e. is it somebody else's PII?
 *
 * Inherited from the prose redactor rather than restated, and that is
 * load-bearing rather than tidy: `rob@aivoicetech.io` is Rob's own published
 * address and appears in *production code* (`lib/esign/sender.ts`,
 * `lib/n8nEmail.ts`) plus 27 other tracked files. A denylist built without this
 * filter denies the repo's own sender address — 29 findings that a developer
 * can only clear by deleting working code, which is how a guard gets disabled
 * instead of obeyed. The fiction blocks (`@example.com`, `555-01XX`) ride along
 * the same way.
 */
export function isDeniableContact(kind, normalized) {
  return kind === "email" ? isRedactableEmail(normalized) : isRedactablePhone(normalized);
}

/**
 * Build a denylist from plaintext sources (gitignored files only — the caller
 * is responsible for never handing this real data from a tracked path).
 * Returns the committable object; the plaintext never leaves this function.
 */
export function buildDenylist(texts, { salt = DENYLIST_SALT } = {}) {
  const entries = {};
  let emails = 0;
  let phones = 0;
  for (const text of texts) {
    for (const { kind, normalized } of extractCandidates(text)) {
      if (!isDeniableContact(kind, normalized)) continue;
      const hash = hashSecret(kind, normalized, salt);
      if (entries[hash]) continue;
      entries[hash] = labelFor(kind, normalized);
      if (kind === "email") emails += 1;
      else phones += 1;
    }
  }
  // Sorted so a rebuild that finds the same contacts produces the same bytes —
  // otherwise every rebuild is an unreviewable diff.
  const sorted = {};
  for (const hash of Object.keys(entries).sort()) sorted[hash] = entries[hash];
  return { salt, algorithm: "sha256", entries: sorted, counts: { emails, phones } };
}

export function formatFinding(f) {
  return `${f.file}:${f.line}  ${f.kind}  ${f.value}\n    ${f.message}`;
}

export function loadDenylist(path = DENYLIST_PATH) {
  if (!existsSync(path)) return { salt: DENYLIST_SALT, algorithm: "sha256", entries: {} };
  return JSON.parse(readFileSync(path, "utf8"));
}

const invokedDirectly =
  process.argv[1] && process.argv[1].endsWith("pii-guard-denylist.mjs");

if (invokedDirectly) {
  const args = process.argv.slice(2);

  if (args[0] === "--build") {
    const sources = args.slice(1).filter((p) => existsSync(p));
    if (!sources.length) {
      console.error("--build needs at least one existing source file (gitignored plaintext).");
      process.exit(1);
    }
    const built = buildDenylist(sources.map((p) => readFileSync(p, "utf8")));
    writeFileSync(DENYLIST_PATH, `${JSON.stringify(built, null, 2)}\n`);
    console.log(
      `built ${DENYLIST_PATH}: ${built.counts.emails} emails + ${built.counts.phones} phones ` +
        `from ${sources.length} source(s). No plaintext written.`,
    );
    process.exit(0);
  }

  const denylist = loadDenylist();
  const targets = args.length
    ? args
    : (await import("node:child_process")).execSync("git ls-files", { encoding: "utf8" })
        .split("\n")
        .filter(Boolean);

  let failed = 0;
  let scanned = 0;
  for (const target of targets) {
    let text;
    try {
      text = readFileSync(target, "utf8");
    } catch {
      continue; // unreadable/binary — Tier B is a text check
    }
    scanned += 1;
    const { findings } = scanDenylist(text, { denylist, label: target });
    if (findings.length) {
      failed += findings.length;
      console.error(findings.map(formatFinding).join("\n"));
    }
  }

  const size = Object.keys(denylist.entries ?? {}).length;
  if (failed) {
    console.error(
      `\n${failed} finding(s) across ${scanned} file(s). Fix: ` +
        `\`node scripts/prose-redact.mjs <file>\` for prose, ` +
        `\`node scripts/seed-synthetic.mjs\` for data files.`,
    );
    process.exit(1);
  }
  console.log(`ok  ${scanned} files scanned against ${size} denied contacts — 0 findings.`);
}
