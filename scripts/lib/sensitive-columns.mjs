// The repo's ONE money/PII column classifier, by column name.
//
// Extracted from `scripts/exposure-audit.mjs` (Q73 inc.25) when the role-grant generator
// needed the same verdicts. Copying it would mean the audit and the privilege model could
// disagree about which columns are sensitive — and the direction that disagreement fails is a
// column the audit counts as money and the grants hand to a booker.
//
// Coverage limit, same as the audit prints: classification is by NAME. PII inside a free-text
// or jsonb column (`notes`, `payload`, `key_dates`) is not seen here — `npm run guard:pii`
// covers content. Every count derived from this file is a floor, never a total.

/** Column names that carry money. Matched whole-word-ish on the column name. */
export const MONEY = [
  /^value$/, /amount/, /price/, /total/, /^paid$/, /paid_/, /_paid/, /quoted/,
  /invoice/, /balance/, /deposit/, /discount/, /commission/, /residual/,
  /^fee$/, /_fee/, /^rate$/, /_rate$/, /revenue/, /equity/, /cost/,
];

/** Column names that carry a person. */
export const PII = [
  /email/, /phone/, /mobile/, /address/, /street/, /^zip/, /postal/,
  /first_name/, /last_name/, /full_name/, /^name$/, /contact/, /signer/,
  /signature/, /ip_address/, /user_agent/, /transcript/, /^text$/, /recipient/,
  // /recording/ added 7/29 inc.28. Its absence was not cosmetic: `/transcript/` made
  // `activities.transcript_url` sensitive, so the grant model withheld it from a booker on the
  // stated reason "other people's call recordings are not part of it" — while the very same
  // GRANT line handed that booker `activities.recording_url`, the audio the transcript is of.
  // A classifier blind spot became a refusal that refused nothing. Also surfaces
  // `call_transcripts.recording_sid`, the Twilio handle for the same audio.
  /recording/,
];

export const hits = (col, patterns) => patterns.some((re) => re.test(col));

/**
 * table -> the money+PII columns on it, in the table's own column order.
 * @param {Map<string, Set<string>>} schema
 * @returns {Map<string, string[]>}
 */
export function sensitiveByTable(schema) {
  const out = new Map();
  for (const [table, cols] of schema) {
    const list = [...cols];
    out.set(table, list.filter((c) => hits(c, MONEY) || hits(c, PII)));
  }
  return out;
}
