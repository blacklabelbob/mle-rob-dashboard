#!/usr/bin/env node
// PII guard, TIER A — the STRUCTURAL WHITELIST over the committed data files.
//
// Tier B (hashed denylist, next item) asks "is this one of the ~35 real contacts
// we know about?" — it can only catch what we already wrote down. Tier A asks the
// opposite and stronger question:
//
//     is EVERY contact-shaped value in this file drawn from a reserved,
//     un-dialable, un-deliverable block?
//
// That inverts the burden. A brand-new customer nobody has ever hashed still
// fails, because their address isn't `@example.com` and their number isn't in
// the 555 area code. This is the check that makes `data/*.json` safe to commit.
//
// WHY IT WALKS PARSED JSON INSTEAD OF GREPPING TEXT
// The DoD is "zero false positives by construction". A regex over raw file text
// cannot promise that — the repo already contains the counter-example, where
// `viewBox="0 0 2663.84375 634.171875"` yields a phone-shaped, NANP-valid
// coordinate (Phase 1 item 7). So Tier A parses the JSON and inspects only leaf
// STRING values. Numbers, coordinates, record ids and money are not strings and
// are therefore unreachable by this scanner — not excluded by an exception list
// that someone has to maintain, but out of scope by construction.
//
// TWO PROFILES, BECAUSE THE TWO FILES MAKE DIFFERENT PROMISES
//   `data` (data/network.json, data/crm.json) — generated fiction. Every address
//     must be RFC 2606 reserved, every number must sit in the non-assignable 555
//     area code, and `__synthetic: true` must be present so the dashboard's
//     disclosure banner has something to read (lib/ui/dataDisclosure.ts).
//   `manifest` (MLE Internal Meetings/manifest.json) — REAL meeting metadata,
//     de-PII'd in Phase 1 item 5. It cannot claim `__synthetic`, and it must not
//     carry a reserved address either: the rule there is zero addresses of any
//     kind, because the whole point of that redaction was domains-only.
//
// CLI (no network, no key):
//     node scripts/pii-guard-structural.mjs            # all default targets
//     node scripts/pii-guard-structural.mjs <file>...  # profile inferred by name
// Exit 0 clean, 1 with `file:line` findings.

import { readFileSync } from "node:fs";

/** RFC 2606 — reserved for documentation, can never route to a real mailbox. */
export const RESERVED_EMAIL_DOMAINS = new Set(["example.com", "example.org", "example.net"]);

/**
 * The one phone rule: the AREA CODE must be 555.
 *
 * 555 is not an assignable NANP area code, so no value that satisfies this can
 * ever ring a real handset — which is a stronger promise than "matches the
 * fiction block we happen to generate today". It deliberately accepts both
 * shapes present in this repo's history: the generator's `+1 (555) 555-01NN`
 * and the older `demo-` rows' `+1 (555) 010-XXXX`. Narrowing it to the current
 * generator's exact line range would make Tier A a test of the generator rather
 * than a test of safety.
 */
export const RESERVED_AREA_CODE = "555";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Contact-shaped digit runs inside a STRING value. A separator is required
// somewhere, which keeps this off stringified ids; the leading-digit guards stop
// a match from starting mid-number.
const PHONE_IN_STRING_RE =
  /(?<![\d.])(?:\+?1[-. ])?(?:\(\d{3}\)[-. ]?|\d{3}[-. ])\d{3}[-. ]\d{4}(?![\d.])/g;

// Keys whose value is a phone by contract even when unformatted.
const PHONE_KEY_RE = /(^|\.)(phone|mobile|tel|telephone|fax)([A-Z_]|$)/i;

/** Domain of an email, lowercased. Null for anything that isn't one. */
export function emailDomain(value) {
  if (typeof value !== "string") return null;
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  return value.slice(at + 1).trim().toLowerCase() || null;
}

/** True when this address is RFC 2606 reserved (or a subdomain of one). */
export function isReservedEmail(value) {
  const domain = emailDomain(value);
  if (!domain) return false;
  if (RESERVED_EMAIL_DOMAINS.has(domain)) return true;
  return [...RESERVED_EMAIL_DOMAINS].some((d) => domain.endsWith(`.${d}`));
}

/** True when this number's area code is the non-assignable 555. */
export function isReservedPhone(value) {
  if (typeof value !== "string") return false;
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return false;
  return national.slice(0, 3) === RESERVED_AREA_CODE;
}

/**
 * Every leaf string in a parsed JSON value, with its dotted path.
 * Exported because the tests grade the walker itself — a scanner that silently
 * skips a branch reports "clean" for the same reason a correct one does.
 */
export function walkStrings(value, path = "$", out = []) {
  if (typeof value === "string") {
    out.push({ path, value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walkStrings(v, `${path}.${k}`, out);
  }
  return out;
}

/** 1-indexed line of the first occurrence of `needle`, or null. */
export function lineOf(text, needle) {
  const at = text.indexOf(needle);
  if (at < 0) return null;
  return text.slice(0, at).split("\n").length;
}

export const PROFILES = {
  data: { requireSynthetic: true, allowReservedEmails: true },
  manifest: { requireSynthetic: false, allowReservedEmails: false },
};

/** Pick a profile from a path. Unknown paths get the strictest one. */
export function profileForPath(path) {
  const p = String(path).replace(/\\/g, "/");
  if (/(^|\/)data\/[^/]+\.json$/.test(p)) return "data";
  if (/manifest\.json$/.test(p)) return "manifest";
  return "manifest";
}

/**
 * Scan one file's TEXT (CR-3: text in, findings out — no path, no I/O, no clock).
 *
 * Returns `{ findings, counts }`. `counts` is reported so a caller can tell
 * "nothing to check" apart from "everything checked and passed" — a guard that
 * scanned zero strings and a guard that scanned 3,000 both exit 0 otherwise.
 */
export function scanStructural(text, { profile = "data", label = "<text>" } = {}) {
  const rules = PROFILES[profile] ?? PROFILES.manifest;
  const findings = [];
  const add = (kind, value, message) =>
    findings.push({ file: label, line: lineOf(text, value) ?? 1, kind, value, message });

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      findings: [
        {
          file: label,
          line: 1,
          kind: "unparseable",
          value: "",
          message: `not valid JSON (${err.message}) — Tier A cannot vouch for it`,
        },
      ],
      counts: { strings: 0, emails: 0, phones: 0 },
    };
  }

  const strings = walkStrings(parsed);
  let emails = 0;
  let phones = 0;

  for (const { path, value } of strings) {
    for (const email of value.match(EMAIL_RE) ?? []) {
      emails += 1;
      if (!rules.allowReservedEmails) {
        add("email", email, `${path}: no address of any kind may appear in this file`);
      } else if (!isReservedEmail(email)) {
        add("email", email, `${path}: not an RFC 2606 reserved domain`);
      }
    }

    const candidates = new Set(value.match(PHONE_IN_STRING_RE) ?? []);
    if (PHONE_KEY_RE.test(path) && /\d/.test(value)) candidates.add(value);
    for (const phone of candidates) {
      phones += 1;
      if (!isReservedPhone(phone)) {
        add("phone", phone, `${path}: area code is not the non-assignable ${RESERVED_AREA_CODE}`);
      }
    }
  }

  if (rules.requireSynthetic && parsed?.__synthetic !== true) {
    findings.push({
      file: label,
      line: 1,
      kind: "marker",
      value: "__synthetic",
      message: "generated file must carry `__synthetic: true` — the disclosure banner reads it",
    });
  }

  return { findings, counts: { strings: strings.length, emails, phones } };
}

export const DEFAULT_TARGETS = [
  "data/network.json",
  "data/crm.json",
  "MLE Internal Meetings/manifest.json",
];

export function formatFinding(f) {
  return `${f.file}:${f.line}  ${f.kind}  ${f.value}\n    ${f.message}`;
}

const invokedDirectly =
  process.argv[1] && process.argv[1].endsWith("pii-guard-structural.mjs");

if (invokedDirectly) {
  const targets = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_TARGETS;
  let failed = 0;
  for (const target of targets) {
    const { findings, counts } = scanStructural(readFileSync(target, "utf8"), {
      profile: profileForPath(target),
      label: target,
    });
    if (findings.length) {
      failed += findings.length;
      console.error(findings.map(formatFinding).join("\n"));
    } else {
      console.log(
        `ok  ${target}  (${counts.strings} strings, ${counts.emails} emails, ${counts.phones} phones — all reserved)`,
      );
    }
  }
  if (failed) {
    console.error(
      `\n${failed} finding(s). Fix: regenerate with \`node scripts/seed-synthetic.mjs\`, ` +
        `or redact prose with \`node scripts/prose-redact.mjs <file>\`.`,
    );
    process.exit(1);
  }
}
