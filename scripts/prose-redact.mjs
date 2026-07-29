#!/usr/bin/env node
// Contact redaction for PROSE — the docs, plans and queue notes that quote real
// people while explaining work that was done.
//
// Data files get the structural whitelist (Phase 3 Tier A). Prose can't: a doc
// has to keep saying "Omega Title, Angela Stavros COO" or the record of the work
// is destroyed. So the rule here is narrower and deliberate:
//
//   an individual's MAILBOX and PHONE go; the ORGANISATION stays.
//
// `angela@omegatitlegroup.com` -> `[email redacted @omegatitlegroup.com]`
// `239-351-1405`               -> `[phone redacted]`
//
// The domain is kept on purpose — it is the company, already named in the
// surrounding sentence, and keeping it means the redaction reads as a
// substitution rather than an erasure.
//
// Two false-positive traps this has to survive, because both are in the repo:
//
//   1. RECORD IDS THAT LOOK LIKE PHONES. `2100010339`, `0001594805` and friends
//      are invoice/record numbers. NANP says an area code and an exchange both
//      start 2-9, which rejects every one of them without a hand-maintained
//      exception list.
//   2. SVG PATH DATA. docs/ARCHITECTURE-ATLAS.html holds ~110 digit runs like
//      `3333333333` that pass any phone-shaped regex and are coordinates. Markup
//      is therefore matched on FORMATTED numbers only (see `allowBareDigits`) —
//      a rule the Atlas test pins so nobody has to re-check it by eye.
//
// CLI (no network, no key, idempotent):
//     node scripts/prose-redact.mjs docs/plans/PRD-mle-crm.md [more files...]

import { readFileSync, writeFileSync } from "node:fs";

export const EMAIL_PLACEHOLDER_PREFIX = "[email redacted @";
export const PHONE_PLACEHOLDER = "[phone redacted]";

/**
 * Addresses that are NOT somebody else's PII and must survive redaction:
 * Rob's own published addresses, and the invented domains this repo uses in
 * fixtures and worked examples. Redacting these would break tests and strip the
 * examples that make the docs teachable, for zero privacy gain.
 */
export const ALLOWED_EMAIL_DOMAINS = new Set([
  "aivoicetech.io", // Rob's own — used as the example address throughout
  "example.com", // RFC 2606
  "example.org",
  "example.net",
  "roofco.com", // invented fixture companies
  "proplogix.com",
  "rival.com",
  "bigmailer.com",
  "acme.com",
  "test.com",
  "localhost",
]);

// Reserved for fiction (555-0100..555-0199) — the block the synthetic seed uses.
const RESERVED_555 = /^\(?\d{3}\)?[-. ]?555[-. ]?01\d{2}$/;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// A phone never sits flush against another digit or a decimal point. Without
// this guard `viewBox="0 0 2663.84375 634.171875"` yields "375 634.1718", which
// is phone-shaped, NANP-valid, and a coordinate — the Atlas false positive that
// item 6 of Phase 1 existed to rule out. Both matchers carry it.
const NOT_NUMERIC_BEFORE = /(?<![\d.])/.source;
const NOT_NUMERIC_AFTER = /(?![\d.])/.source;

// Formatted only: a separator is required somewhere, which is what keeps this
// off bare record ids.
const FORMATTED_PHONE_RE = new RegExp(
  `${NOT_NUMERIC_BEFORE}(?:\\+?1[-. ])?(?:\\(\\d{3}\\)[-. ]?|\\d{3}[-. ])\\d{3}[-. ]\\d{4}${NOT_NUMERIC_AFTER}`,
  "g",
);
// Bare 10-digit runs, prose/JSON only. Area + exchange must both start 2-9.
const BARE_PHONE_RE = new RegExp(
  `${NOT_NUMERIC_BEFORE}\\b[2-9]\\d{2}[2-9]\\d{6}\\b${NOT_NUMERIC_AFTER}`,
  "g",
);

/** Domain of an email, lowercased. Null for anything that isn't one. */
export function emailDomain(value) {
  if (typeof value !== "string") return null;
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  return value.slice(at + 1).trim().toLowerCase() || null;
}

/** True when this address belongs to somebody whose mailbox we must not publish. */
export function isRedactableEmail(value) {
  const domain = emailDomain(value);
  if (!domain) return false;
  if (ALLOWED_EMAIL_DOMAINS.has(domain)) return false;
  // Subdomains of an allowed domain (mail.example.com) ride along.
  return ![...ALLOWED_EMAIL_DOMAINS].some((d) => domain.endsWith(`.${d}`));
}

/** True when this digit run is a dialable number rather than an id or a coordinate. */
export function isRedactablePhone(value) {
  if (typeof value !== "string") return false;
  if (RESERVED_555.test(value.trim())) return false;
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return false;
  // NANP: area code and exchange both start 2-9. Rejects every record id in the repo.
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national);
}

/**
 * Redact one blob of prose.
 *
 * `allowBareDigits: false` (markup) drops the bare 10-digit rule entirely, so
 * SVG path data is untouchable by construction rather than by exception list.
 * Idempotent: placeholders contain no email or phone shape, so a second pass is
 * a no-op.
 */
export function redactProse(text, { allowBareDigits = true } = {}) {
  if (typeof text !== "string") return { text, emails: 0, phones: 0 };
  let emails = 0;
  let phones = 0;

  let out = text.replace(EMAIL_RE, (match) => {
    if (!isRedactableEmail(match)) return match;
    emails += 1;
    return `${EMAIL_PLACEHOLDER_PREFIX}${emailDomain(match)}]`;
  });

  const swallowPhone = (match) => {
    if (!isRedactablePhone(match)) return match;
    phones += 1;
    return PHONE_PLACEHOLDER;
  };
  out = out.replace(FORMATTED_PHONE_RE, swallowPhone);
  if (allowBareDigits) out = out.replace(BARE_PHONE_RE, swallowPhone);

  return { text: out, emails, phones };
}

/** Markup (.html/.svg) is matched on formatted numbers only — see trap 2 above. */
export function optionsForPath(path) {
  return { allowBareDigits: !/\.(html?|svg)$/i.test(path) };
}

// --- CLI ---------------------------------------------------------------------
const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (invokedDirectly && process.argv[2]) {
  let dirty = 0;
  for (const path of process.argv.slice(2)) {
    const before = readFileSync(path, "utf8");
    const { text, emails, phones } = redactProse(before, optionsForPath(path));
    if (text === before) {
      console.log(`${path}: clean — no change.`);
      continue;
    }
    writeFileSync(path, text);
    dirty += 1;
    console.log(`${path}: ${emails} email(s), ${phones} phone(s) redacted.`);
  }
  console.log(dirty === 0 ? "nothing to do." : `${dirty} file(s) rewritten.`);
}
