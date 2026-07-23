// Q47 e-sign: the exact ESIGN/UETA B2B consent language, single-sourced for
// the signer page checkbox AND the audit-certificate page (they must match —
// the certificate reproduces what the signer agreed to). Elements per the
// scout doc (15 U.S.C. §7001): intent, consent to transact electronically,
// association, retention/copy delivery.
//
// B2B checkbox is sufficient per the scout's legal read. CONSUMER signers
// (§7001(c) — e.g. a homeowner) need stricter disclosures reviewed by counsel
// BEFORE any use; that flag is carried in the scout doc and BUILD-QUEUE Q47.

export const ESIGN_CONSENT_TEXT =
  "By checking this box, I agree to conduct this transaction electronically and to " +
  "sign this agreement by electronic signature. I intend my electronic signature to " +
  "be the legal equivalent of my handwritten signature, and I agree that it will be " +
  "associated with this document and its audit record. I understand that a copy of " +
  "the signed agreement will be delivered to me and that I may download and retain " +
  "a copy for my records.";

export const CONSENT_VERSION = "b2b-2026-07-23"; // stamped into consent event meta
