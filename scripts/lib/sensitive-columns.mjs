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
  // /estimate/ and /^payment_state$/ ruled 7/29 inc.30, out of inc.29's printed queue.
  // `estimate` and `phase2_estimate` are jsonb holding dollar figures on people/orgs/deals —
  // money by every reading, and no MONEY pattern said "estimate". `payment_state` was the
  // stranger case: it was ALREADY withheld from both roles by name in DENIALS while the
  // classifier called it non-sensitive, so the audit's money count did not include a column
  // the privilege model treats as money. A denial the classifier disagrees with is the same
  // two-sources-of-truth risk that made this module shared in the first place.
  /estimate/, /^payment_state$/,
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
  // Ruled 7/29 inc.30 out of inc.29's printed queue — each was already named there as
  // "probably sensitive, not yet decided", and leaving a named suspicion unruled is the state
  // this increment is removing.
  //   sent_to           — 0008_esign: "address the link was delivered to". An email address.
  //   client_legal_name — a customer's legal name on the money ledger; /^name$/ is exact-match.
  //   ip                — signature_events' audit-trail IP, the same datum as the withheld
  //                       signature_requests.signer_ip; the bare name defeats /ip_address/.
  //   business          — 0003_orgs_split says it plainly: "often the legal name (e.g. 'MFS
  //                       Naples, Inc.')". Same datum class as client_legal_name, so it is
  //                       classified the same way — and then deliberately GRANTED, because
  //                       naming the company is the job. Sensitive ≠ withheld; that is what
  //                       ALLOWANCES is for.
  /^sent_to$/, /^client_legal_name$/, /^ip$/, /^business$/,
  // Staff attribution. These name a person — an MLE person rather than a customer, which
  // changes who is exposed, not whether a person is. Classified, then granted where the role
  // needs them, so "who is assigned / who created this" is a written decision instead of the
  // silence that inc.25/28/29 each mistook for coverage.
  // `^owner$` is the same staff-attribution shape (invoice_ledger.owner names an MLE owner);
  // anchored so it cannot swallow `owner_id`, which is a join key and benign.
  /^created_by$/, /^assigned_rep$/, /^measured_by$/, /^owner$/,
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
  // Reviewed and cleared 7/29 inc.30. `website` is a company's own public URL — neither money
  // nor a person, and a rep who cannot see it cannot do the job. `legacy_slug`/`client_slug`
  // are identifiers, the same class as `_id`.
  /^website$/, /^legacy_slug$/, /^client_slug$/,
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
 * The open queue: column names a reader has LOOKED AT and deliberately not ruled yet.
 *
 * inc.29 introduced this as prose. inc.30 made it a checked structure, because a printed list
 * is only as good as the next person's attention — and the whole lesson of inc.25/28/29 is that
 * attention is what kept failing. Every entry now names real `(table, column)` pairs, and
 * `grantBreaches()` treats an unruled column on a covered table as a BREACH unless it appears
 * here. So the queue is no longer a place things can sit unnoticed: it is the only way to leave
 * a covered column unruled, it is finite, and it is printed with a count.
 *
 * Entries removed by being RULED in inc.30 (they are decisions now, not questions): `ip`,
 * `client_legal_name`, `sent_to`, `business`, `estimate`/`phase2_estimate`, `payment_state`.
 * What is left is genuinely undecided, and each says what the decision hinges on.
 *
 * @type {{column: string, tables: string[], note: string}[]}
 */
export const IDENTIFIED_UNDECIDED = [
  { column: "relationship", tables: ["people", "orgs"], note: "free text describing how MLE knows them ('Caleb's brother-in-law'). Neither a name nor an amount by column type, but it is the one covered column whose CONTENT routinely identifies a third party — a content question `guard:pii` answers, not a name classifier" },
  { column: "payment_plan_note", tables: ["invoice_ledger"], note: "free text on a money row ('2 x $5,000') — prose that carries amounts without being an amount column. Withheld with the ledger's money today; listed so the next reader knows the withholding rests on content, not on the name" },
  { column: "display_name", tables: ["property_definitions"], note: "a schema label here, not a person — listed so the next reader confirms rather than assumes" },
  { column: "business_name", tables: ["submissions"], note: "an inbound lead's company. `business` was ruled PII this increment; this is the same datum under a different name, on a table this model does not cover — ruling it changes a count without changing a privilege, so it waits for submissions to be covered" },
  { column: "attendee_ids", tables: ["events"], note: "who attended, as people ids in a jsonb array. `_ids$` reads benign as a join key, which is true of the type and false of the meaning; events is not a covered table" },
];

/** Fast lookup for the queue: `table.column` keys. */
export const undecidedKeys = new Set(
  IDENTIFIED_UNDECIDED.flatMap((u) => u.tables.map((t) => `${t}.${u.column}`)),
);
