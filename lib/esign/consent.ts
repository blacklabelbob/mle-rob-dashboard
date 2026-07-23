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

// ---------------------------------------------------------------------------
// CONSUMER (§7001(c)) flow — ESIGN-CONSUMER-DISCLOSURE-SPEC.md §3.5.
// [counsel review] DRAFT language: ships to no consumer until counsel signs
// off and ESIGN_CONSUMER_ENABLED is set. Placeholders {SENDER_EMAIL}/{COMPANY}
// resolve at render (aivoicetech.io identity). Single-sourced for the
// disclosure screen AND the audit certificate; tests assert all seven
// §7001(c) checklist elements appear.
// ---------------------------------------------------------------------------

export const CONSUMER_CONSENT_VERSION = "consumer-2026-07-23-DRAFT-counsel-pending";

export const ESIGN_CONSUMER_DISCLOSURE_TEXT =
  "Going electronic — please read before you agree\n\n" +
  "Your right to paper. You can get this agreement (and any related documents) on " +
  "paper instead, at no charge. To request a paper copy — before or after signing — " +
  "email {SENDER_EMAIL} or tell your {COMPANY} representative. Your agreement to sign " +
  "electronically applies only to this transaction and its related documents — not to " +
  "anything else.\n\n" +
  "Your right to withdraw. You may withdraw your consent to receive documents " +
  "electronically at any time, at no charge and with no penalty, by emailing " +
  "{SENDER_EMAIL}. Withdrawing does not undo anything you have already signed; it " +
  "means future documents for this transaction will be provided on paper.\n\n" +
  "Updating your contact info. To update the email address or mobile number we use " +
  "to send you documents, email {SENDER_EMAIL} or tell your {COMPANY} representative.\n\n" +
  "What you need. To access and keep these documents you need a device with an " +
  "internet connection and a current web browser able to display PDF files, and " +
  "either a printer or storage (such as your device or email) to retain your copy. " +
  "If these requirements ever change in a way that could prevent you from accessing " +
  "your documents, we will notify you of the new requirements and you may withdraw " +
  "your consent at that time, free of any fee or condition.\n\n" +
  "Your copy. After signing you will be able to download the signed agreement " +
  "immediately, and we will send a copy to the email address you provide.";

export const ESIGN_CONSUMER_CONSENT_TEXT =
  "I consent to receive and sign documents for this transaction electronically. By " +
  "checking this box in the browser in which this agreement is displayed, I confirm " +
  "that I can access documents in this electronic (PDF) form, and I agree that my " +
  "electronic signature is the legal equivalent of my handwritten signature and will " +
  "be associated with this document and its audit record.";

export function renderConsumerDisclosure(senderEmail: string, company: string): string {
  return ESIGN_CONSUMER_DISCLOSURE_TEXT.replaceAll("{SENDER_EMAIL}", senderEmail).replaceAll(
    "{COMPANY}",
    company
  );
}

// ---------------------------------------------------------------------------
// MLE communications consent (Rob directive 2026-07-23; PEWC-grade per
// ~/.claude/rules/ai-voice-legality.md "Consent capture at every intake
// surface"). [counsel review] OPTIONAL + UNCHECKED — never a condition of
// signing ("not a condition" is load-bearing for PEWC). Names the company,
// covers autodialed/prerecorded/AI calls AND texts at the number provided,
// scoped to MLE only, STOP opt-out. Recorded as a comms_consent event
// (IP/timestamp/language-version) + people.comms_consent (0009).
// ---------------------------------------------------------------------------

export const COMMS_CONSENT_TEXT =
  "I agree to receive calls and texts from My Local Everything (MLE) — including " +
  "automated, prerecorded, and AI-assisted calls and texts — at the number provided, " +
  "about my projects and services. For communications with MLE only. Not required " +
  "to sign this agreement. Reply STOP to any text, or say so on any call, to opt " +
  "out anytime.";

export const COMMS_CONSENT_VERSION = "mle-pewc-2026-07-23-DRAFT-counsel-pending";
