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
  // /video/ and /speaker/ added 7/29 inc.29 — the SAME defect a THIRD time, which is why this
  // increment stopped adding patterns one at a time and built `BENIGN`/`unreviewed()` below.
  // `people.meeting_video_url` and `orgs.meeting_video_url` are a recorded meeting with a
  // person, on the two tables where `transcript_url` is already withheld from a booker: the
  // booker was refused the transcript link and handed the video of the same meeting. inc.28's
  // fix could not catch it, because the column does not say "recording" — it says "video".
  // `speaker` names who said the words that `call_transcript_segments.text` is withheld for.
  /video/, /^speaker$/,
];

/**
 * Column names REVIEWED and found not to carry money or a person — the repo's plumbing:
 * keys, timestamps, enums, hashes, counters, provenance.
 *
 * This list is the point of inc.29, and it exists because the classifier had only two states:
 * *matched a sensitive pattern*, or *not mentioned anywhere*. Those two are not opposites, but
 * every count derived from the file treated them as if they were — so a column nobody had ever
 * looked at was indistinguishable from one that had been looked at and cleared. Three separate
 * increments (25, 28, 29) each found a real leak sitting in that gap, each by chance rather
 * than by the tooling, which is a detection method that does not scale to the next migration.
 *
 * The third state makes the gap FINITE and PRINTED: `unreviewed()` returns the columns that
 * are neither sensitive nor benign, the exposure audit prints them with a count, and a column
 * added tomorrow with an unfamiliar name lands there instead of silently reading as safe.
 * The list shrinks by somebody reviewing a name, never by the report going quiet.
 *
 * Safe to write broadly: sensitive ALWAYS wins (see `unreviewed`), so a benign pattern that
 * also matches a money/PII name cannot downgrade it. `_url$` is deliberately NOT here — that
 * suffix is exactly where the recording/video leaks hid.
 */
export const BENIGN = [
  // Keys and joins.
  /^id$/, /_id$/, /_ids$/, /^idx$/, /^rank$/, /^display_order$/, /^version$/, /supersedes/,
  // Time.
  /_at$/, /^date$/, /_date$/, /_ms$/, /^duration/, /_days$/,
  // Enum / state / shape.
  /^status/, /^stage$/, /^kind$/, /^type$/, /_type$/, /^entity_kind$/, /^severity$/,
  /^scope$/, /^role$/, /^role_at_org$/, /^channel$/, /^provider$/, /^model$/, /^language$/,
  /^category$/, /^data_type$/, /^node_type$/, /^routing_lane$/, /^currency$/, /^phase/,
  /^access_level$/, /^theme$/, /^color$/, /^label$/, /^title$/, /^subject_type$/,
  /^specific_entity_type$/, /^vertical/, /^branch$/, /^source$/, /^filter$/, /^values$/,
  /^string_value$/, /^confidence$/, /^measured_at$/, /^occurred_at$/,
  // Booleans and flags.
  /^is_/, /^has_/, /^can_/, /^requires_/, /^book_protected$/, /^signed$/, /^unchanged$/,
  /^changed$/, /^added$/, /^suggested$/, /^referral_sourced$/, /^consent$/, /^comms_consent$/,
  // Hashes, provenance, storage plumbing.
  /sha256/, /^token_hash$/, /^source_commit$/, /^source_repo$/, /^source_path$/,
  /^source_context$/, /^search_tsv$/, /^row_count$/, /^count$/, /_count$/, /^error$/,
  /^meta$/, /^payload$/, /^detail$/, /^description$/, /^summary$/, /^why$/, /^note$/, /^notes$/,
  /^resolution_note$/, /^refusal_reason$/, /^conflict/, /^action_items$/, /^will_items$/,
  /^buying_signals$/, /^key_dates$/, /^seen_event_ids$/, /^presend_answers$/,
  /^labor_hours_saved$/, /^completion$/, /^storage_path$/, /^pdf$/, /^link$/, /^domain$/,
  /^signed_path$/, /^countersigned_path$/, /^at$/, /^start_ms$/, /^end_ms$/,
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

/** Sensitive wins over benign, always — a benign pattern must never be able to clear a column. */
export const isSensitive = (col) => hits(col, MONEY) || hits(col, PII);

/**
 * table -> the columns that are NEITHER classified sensitive NOR reviewed benign.
 *
 * The printed blind spot. Not a failure list and not a gate: it is the set of names no human
 * has ruled on, which is the only honest third answer a name-based classifier can give. Sorted
 * so the audit's output is stable and a diff shows a real change.
 *
 * @param {Map<string, Set<string>>} schema
 * @returns {Map<string, string[]>}
 */
export function unreviewed(schema) {
  const out = new Map();
  for (const [table, cols] of schema) {
    const list = [...cols].filter((c) => !isSensitive(c) && !hits(c, BENIGN)).sort();
    if (list.length) out.set(table, list);
  }
  return out;
}

/**
 * Names already IDENTIFIED as probably sensitive but not yet decided — carried explicitly so
 * that "unreviewed" does not quietly include things this increment already knows about.
 *
 * inc.29 found these while building `BENIGN` and did NOT classify them, because each one adds
 * decisions to `DENIALS`/`ALLOWANCES` on a covered table and a half-finished privilege model is
 * worse than an honest queue. They are named here, printed by the audit, and flagged to Rob's
 * ledger rather than left to be rediscovered by chance a fourth time.
 */
export const IDENTIFIED_UNDECIDED = [
  { column: "ip", where: "signature_events", note: "the same audit-trail IP as signature_requests.signer_ip, which IS withheld from both roles — the bare name defeats /ip_address/" },
  { column: "client_legal_name", where: "invoice_ledger", note: "a customer's legal name on the money ledger; /^name$/ is exact-match so it does not fire" },
  { column: "estimate / phase2_estimate", where: "people, orgs, deals", note: "dollar figures by every reading, but no MONEY pattern says 'estimate'" },
  { column: "display_name", where: "property_definitions", note: "a schema label here, not a person — listed so the next reader confirms rather than assumes" },
  { column: "business_name", where: "submissions", note: "an inbound lead's company; submissions is not a covered table" },
  { column: "sent_to / attendee_ids", where: "signature_requests, events", note: "who a document went to and who attended — addresses and person ids in a non-name column" },
];
