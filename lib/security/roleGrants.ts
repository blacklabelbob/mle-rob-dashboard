/**
 * Q73 rollout half, the part that is NOT Rob's: the declared model of what each named
 * non-owner role may read, and the SQL that enforces it.
 *
 * Rob's words behind the item: *"As I add bookers and sales reps as users, they will know
 * the software exists and that it holds valuable data."* The audit half already measured the
 * exposure (`docs/ops/EXPOSURE-AUDIT.md`: 41 of 51 routes answer identically to anyone with
 * the URL, over 28 tables holding 10 money and 20 person columns). This is the refusal.
 *
 * THE FINDING THAT SHAPES THIS FILE — the queue item's own DoD says "RLS policies", and RLS
 * ALONE CANNOT SATISFY IT. Row-level security filters *rows*; the DoD asks that a named
 * non-owner token be unable to select a specific column — `equity` is the surviving example.
 * A `people` row a booker is legitimately allowed to see carries `equity` in the same row, so
 * no policy can hide the column. Postgres settles it the other way, with column privileges —
 * and with one rule that dictates the shape of every statement below: **a table-level
 * `GRANT SELECT` cannot be narrowed by a later column-level `REVOKE`.** Table-level privilege
 * wins. So the generated SQL revokes table-level SELECT and re-grants an explicit column list.
 * Which is why this model must know every column that exists, not just the denied ones, and
 * why the generator reads them from the migrations instead of a hand-kept list (CR-3): a
 * column added tomorrow and missed here would be a column these roles keep reading.
 *
 * THE TWO ROLES ARE NOW IDENTICAL. Rob, 2026-08-05: *"Theres nothing an appt booker shouldnt
 * be able to see that a Sales Rep is able to see. At least nothing I can think of at the
 * moment."* Every per-role split this file used to carry is gone, and the roles remain two
 * names rather than one because the line may move again — the DoD's question was always
 * "should a booker see X", and the answer today is "whatever the rep sees". What is still
 * withheld is withheld from BOTH: `equity` (owners only, Rob 2026-07-29), the owners' invoice
 * ledger, the countersign record and the e-sign audit trail.
 *
 * NOT APPLIED. `supabase/migrations/0032_role_read_grants.sql` is generated and committed,
 * never pushed — the rollout half ships only on Rob's go, and a privilege change that lands
 * unannounced can lock the dashboard out of its own data. Nothing here runs at request time.
 */

/** The named populations arriving. `owner` is Rob and Will; the other two are new. */
export const READ_ROLES = ["mle_rep_read", "mle_booker_read"] as const;
export type ReadRole = (typeof READ_ROLES)[number];

export type Denial = {
  table: string;
  column: string;
  roles: ReadRole[];
  /** Why this column is withheld — printed into the SQL, so the refusal is readable in place. */
  because: string;
};

/**
 * The declared refusals. The first pass covered the six tables the audit ranks worst (`orgs`,
 * `people`, `deals`, `signature_requests`, `invoice_ledger`, `phase2_returns`); the second
 * (7/29 inc.27) took the three `uncoveredSensitive()` was still printing that carry real
 * content rather than a name-pattern false positive: `documents` (the countersign record),
 * `call_transcript_segments` (the verbatim words of a call) and `activities` (a recording
 * link). Coverage stays deliberately partial and the remainder is still measured rather than
 * left unsaid. That measurement is why inc.28 exists: adding `/recording/` to the shared
 * classifier (it had `/transcript/` and no `/recording/`) turned the remainder from four
 * tables into FIVE — `call_transcripts` (`recording_sid`, the Twilio handle to the audio)
 * joined `events`, `projects`, `saved_views` and `verticals`, whose only "sensitive" column
 * really is a bare `name`. The count going UP is the point: a blind spot in the classifier
 * had been reading as coverage. A table cannot enter this model on an allowance alone —
 * `COVERED_TABLES` derives from the refusals, so covering a table means refusing something on
 * it. Naming these five here is the honest form of not covering them.
 *
 * PII IS NOT BLANKET-DENIED, on purpose. A booker's job is to phone people, so revoking
 * `phone`/`email` from the booker role would break the role rather than protect it. The DoD's
 * wording is "a phone/email column it *should not*" — which is a question about Rob's org
 * chart, not about SQL, so it is flagged for him instead of guessed at here.
 *
 * DEAL MONEY IS NOT WITHHELD EITHER — reversed 2026-07-29 on Rob's own words, and this is the
 * correction that matters most in this file. Increments 25-30 withheld `quoted_amount`, `value`
 * and `estimate` from both roles on the reading "a customer's price is the owners' number."
 * Rob: *"I WANT the bookers to see quoted amount. I just dont want to show any equity to anyone
 * but Will and I. I want people to see how money can be made."* Deal size is a MOTIVATOR for the
 * floor; hiding it de-motivates the people selling and protects nothing. The line is not
 * money-vs-no-money, it is EQUITY — ownership, not compensation. So what is withheld from both
 * new roles is `equity` (owners only), the owners' invoice ledger, and the countersign and
 * signature audit trail. Source: `docs/plans/sources/ROB-ANSWERS-2026-07-29-night.md` §1.
 *
 * BOOKER == REP, 2026-08-05. Every entry below names BOTH roles, and no entry may name one.
 * Rob: *"The appt Bookers get paid on the clients actually showing up for their meetings and if
 * I see that their giving sales support and pushing to get the deal closed and paid, I'm
 * inclined to pay them more or promote them. Theres nothing an appt booker shouldnt be able to
 * see that a Sales Rep is able to see. At least nothing I can think of at the moment."* Eleven
 * booker-only refusals were removed by that sentence and are now ALLOWANCES with his words as
 * their reason: the transcript/recording/video links on `people`, `orgs` and `activities`, the
 * verbatim `text` and `speaker` on `call_transcript_segments`, the customer cost/revenue
 * figures on `phase2_returns`, and `invoice_ledger.payment_state` (released to the rep alone by
 * Q81, now to both). The compensation logic is the reasoning, not a side note: a booker paid on
 * show-rate and promoted for pushing deals to close is being asked to do rep work, and a role
 * asked to do the work while refused the record is a role set up to fail.
 *
 * WHAT THIS DECISION DOES NOT TOUCH, stated because "booker == rep" reads at a glance like
 * "everyone sees everything" and it is not that: `equity` stays owners-only on all three
 * tables (Rob 2026-07-29 — equity is ownership, not CRM data, and his 8/5 sentence is about
 * booker-vs-rep parity, not about owners-only data), and every column already withheld from
 * BOTH roles stays withheld from both. Parity moved the floor up to the rep's level; it did
 * not move the ceiling.
 */
export const DENIALS: Denial[] = [
  { table: "people", column: "equity", roles: ["mle_rep_read", "mle_booker_read"], because: "spin-off equity is OWNERS-ONLY (Q41) — and per Rob 2026-07-29 this is THE line: 'I dont want to show any equity to anyone but Will and I.' Equity is ownership, not compensation; every other money column on this table is now granted" },
  { table: "orgs", column: "equity", roles: ["mle_rep_read", "mle_booker_read"], because: "spin-off equity is OWNERS-ONLY (Q41) — same line Rob drew on people.equity 2026-07-29" },
  { table: "deals", column: "equity", roles: ["mle_rep_read", "mle_booker_read"], because: "spin-off equity is OWNERS-ONLY (Q41) — same line Rob drew on people.equity 2026-07-29" },
  { table: "signature_requests", column: "signer_name", roles: ["mle_rep_read", "mle_booker_read"], because: "who personally signed is the same evidence as the email/IP beside it — a rep needs to know a doc came back, which `signer_type` gives, not who held the pen" },
  { table: "signature_requests", column: "signer_email", roles: ["mle_rep_read", "mle_booker_read"], because: "the e-sign audit trail is evidence, not CRM data" },
  { table: "signature_requests", column: "signer_ip", roles: ["mle_rep_read", "mle_booker_read"], because: "the e-sign audit trail is evidence, not CRM data" },
  { table: "signature_requests", column: "signer_user_agent", roles: ["mle_rep_read", "mle_booker_read"], because: "the e-sign audit trail is evidence, not CRM data" },
  { table: "invoice_ledger", column: "amount", roles: ["mle_rep_read", "mle_booker_read"], because: "invoiced money is the owners' ledger" },
  { table: "documents", column: "countersigner_name", roles: ["mle_rep_read", "mle_booker_read"], because: "the countersigner on an MLE document is an OWNER (0010_esign_countersign — Rob or Will), so this is the execution record of who bound the company, not CRM data" },
  { table: "documents", column: "countersigner_email", roles: ["mle_rep_read", "mle_booker_read"], because: "same execution record — and an owner's address on a signed agreement is exactly the pair the signature_requests trail is withheld for" },
  { table: "documents", column: "countersigner_title", roles: ["mle_rep_read", "mle_booker_read"], because: "withheld WITH the name rather than kept as a bare role: `signer_type` on signature_requests is a fixed enum ('customer'/'countersigner'), this is free text naming the office a specific person held, and on a table where exactly two people ever countersign a title identifies as well as a name does" },
  { table: "invoice_ledger", column: "client_legal_name", roles: ["mle_rep_read", "mle_booker_read"], because: "a customer's LEGAL name on the owners' money ledger — the amount and the prose columns on this row are already withheld from both roles, and the party to the invoice is the third piece of the same record" },
  { table: "signature_requests", column: "sent_to", roles: ["mle_rep_read", "mle_booker_read"], because: "the address the signing link was delivered to (0008_esign) — the e-sign audit trail is evidence, not CRM data, and this is the same datum as the withheld `signer_email` at a different moment in the flow" },
  { table: "invoice_ledger", column: "payment_plan_note", roles: ["mle_rep_read", "mle_booker_read"], because: "free text carrying the money it describes ('2 x $5,000') — withheld WITH `amount` and `payment_state`, because a prose column on a money row that the classifier reads as a note is exactly the gap a name-based rule cannot see" },
  { table: "invoice_ledger", column: "status_text", roles: ["mle_rep_read", "mle_booker_read"], because: "FOUND WHILE WIRING Q81's rep grant, and it was the hole the last three refusals on this table were aimed at: `status_text` is the RAW status cell, and on the real ledger it reads 'issued — split-payment plan approved 2026-07-16 (2 x $5,000, first due by 2026-07-24…)'. `amount` was withheld, then `payment_plan_note` was withheld for carrying that same prose — while the column both are DERIVED FROM stayed granted to both roles by silence. The money classifier never matched it because the name says 'status'. Both roles get `payment_state` (the classified state) and `due_date`; neither carries a dollar figure" },
  // 2026-08-05, and NOT part of the booker/rep parity change — this one moves in the other
  // direction, on both roles at once. A prior review left it open and Rob's rule decides it:
  // "booker == rep" is not "everyone sees everything", so a leak that reached the rep is still
  // a leak after parity, it just now reaches two roles instead of one.
  { table: "invoice_ledger", column: "pdf", roles: ["mle_rep_read", "mle_booker_read"], because: "A FILENAME THAT CARRIES A WITHHELD COLUMN IS THE SAME LEAK AS THE COLUMN. The live value is 'invoices/paid/Phase 1 Invoice - Gulf Coast RE Group - MLE-2026-100123 (PAID).pdf' — the path spells out `client_legal_name`, which is withheld from both roles one column to the left, and the directory plus the '(PAID)' suffix restate the payment state. Classified BENIGN by /^pdf$/, which is true of the type and false of the content: the name classifier reads column names, and this column's VALUE is a sentence. Withholding `client_legal_name` while granting a string that contains it is a refusal that refuses nothing — the same shape as inc.28's transcript-refused/recording-granted pair, moved from a URL to a storage path. `invoice_number` and `client_slug` stay granted: an id and a slug ('gulf_coast') identify the row without reproducing the legal name" },
];

/**
 * The explicit GRANTS — sensitive columns a new role deliberately KEEPS.
 *
 * This list exists because the model's first run was red on eight columns, and it was right
 * to be: `people.phone` was granted to a booker by *silence*, which reads identically to
 * having been forgotten. A withheld column and a deliberately-shared one are both decisions;
 * an undecided one is the defect. So every money/PII column on a covered table must appear in
 * `DENIALS` or here, and `grantBreaches()` fails on any that appears in neither.
 */
export type Allowance = { table: string; column: string; because: string };

export const ALLOWANCES: Allowance[] = [
  { table: "deals", column: "name", because: "the deal's own label — a rep working a pipeline it cannot name is not working it. Classified PII by the bare /^name$/ pattern; a deal is not a person" },
  { table: "invoice_ledger", column: "invoice_number", because: "the ledger's primary key, an identifier and not an amount — classified money only because /invoice/ matches the name. `amount` and `payment_state` are the money on this table and both are withheld" },
  { table: "people", column: "name", because: "a CRM whose reps cannot see who they are calling is not a CRM" },
  { table: "people", column: "phone", because: "phoning people IS the rep's and the booker's job — withholding it breaks the role instead of protecting it. Whether SOME bookers should be scoped to their own accounts is Rob's org-chart call, flagged not guessed" },
  { table: "people", column: "email", because: "same as phone — outreach is the job" },
  { table: "orgs", column: "name", because: "the company name is the working unit of every rep screen" },
  { table: "orgs", column: "phone", because: "same as people.phone" },
  { table: "orgs", column: "email", because: "same as people.email" },
  { table: "phase2_returns", column: "revenue_basis", because: "not an amount — it names WHICH basis a figure came from ('invoiced' vs 'collected'), so it is classified money by name only" },
  { table: "signature_requests", column: "signer_type", because: "not identity — it is the role that signed ('customer' / 'countersigner'), and a rep tracking whether a doc came back needs it" },
  { table: "call_transcript_segments", column: "transcript_id", because: "the foreign key to call_transcripts, classified PII only because /transcript/ matches the name. A join key carries no words; `text` beside it is the content and that is what the booker is refused" },
  // inc.30 — the staff-attribution and company-name columns, classified as person columns this
  // increment and then deliberately KEPT. They are here rather than absent because silence is
  // the failure mode this whole sub-thread exists to remove: a booker reading `assigned_rep`
  // should be a sentence somebody wrote, not a column nobody mentioned.
  { table: "people", column: "business", because: "the company a contact belongs to. Classified PII because 0003_orgs_split says the field is 'often the legal name' — and granted anyway, because a rep who cannot see which company they are calling cannot call. Sensitive is not the same as withheld" },
  { table: "orgs", column: "business", because: "same as people.business — the legal-name variant of the org's own name, and naming the company is the working unit of every rep screen" },
  { table: "people", column: "assigned_rep", because: "who owns the account. A rep needs to know whether it is theirs; a booker needs to know who to hand it to. Whether a rep should see accounts assigned to OTHER reps is a row rule and Rob's org-chart call — flagged, not guessed" },
  { table: "orgs", column: "assigned_rep", because: "same as people.assigned_rep" },
  { table: "activities", column: "created_by", because: "which MLE person logged the activity — attribution on a shared timeline, and a timeline that cannot say who did the thing is not an audit of anything" },
  { table: "documents", column: "created_by", because: "who generated the document. Kept while `countersigner_name`/`_email` are withheld, and the difference is deliberate: this is authorship of a draft, those are the execution record of who bound the company" },
  { table: "invoice_ledger", column: "owner", because: "which MLE owner owns the client — kept so a rep can tell whose account they are looking at, while every amount on the row stays withheld. Carried in IDENTIFIED_UNDECIDED too, because the real question it raises (should a rep see the whole roster?) is a row rule Rob decides" },
  { table: "phase2_returns", column: "measured_by", because: "who took the measurement — provenance on a number the booker cannot see anyway, and the rep reviewing a Phase-2 result needs to know whose reading it is" },
  // 2026-07-29 REVERSAL (Rob, ROB-ANSWERS-2026-07-29-night.md §1). These five were DENIALS in
  // increments 25-30 and are now grants. They are listed with the reason Rob gave rather than a
  // reason I inferred, because the inferred one was wrong: "I want people to see how money can
  // be made." Deal money motivates the floor. `equity` stays denied and is the only line.
  { table: "people", column: "quoted_amount", because: "what a customer was quoted — GRANTED to rep and booker on Rob's direct instruction. A booker who cannot see deal size cannot see the point of the call they are booking" },
  { table: "orgs", column: "quoted_amount", because: "same as people.quoted_amount — Rob's instruction names the column by name" },
  { table: "deals", column: "value", because: "deal size on the deal itself. Was booker-denied on 'the rep's working number, not the booker's' — Rob's answer says the booker seeing it is the intent, not the leak" },
  { table: "people", column: "estimate", because: "a job's estimated dollars. It followed `quoted_amount` into DENIALS and it follows it back out — same column class, same instruction" },
  { table: "orgs", column: "estimate", because: "same as people.estimate" },
  { table: "deals", column: "estimate", because: "the working figure of the thing the rep is selling, beside `value` which is now granted" },
  { table: "people", column: "phase2_estimate", because: "the Phase-2 ROI projection — the clearest 'how money can be made' number in the schema, which is the sentence Rob used. Granted; the measured `phase2_returns` figures stay booker-withheld because those are a customer's actual revenue and cost basis, not MLE's upside" },
  { table: "orgs", column: "phase2_estimate", because: "same as people.phase2_estimate" },
  // 2026-08-05 PARITY (Rob, verbatim): *"Theres nothing an appt booker shouldnt be able to see
  // that a Sales Rep is able to see. At least nothing I can think of at the moment."* The eleven
  // entries below were BOOKER-ONLY DENIALS until that sentence. They are grants now, listed one
  // by one with his reason rather than deleted in a block, because a column that changed hands
  // by a decision must read as a decision — deleting the denials would have left eleven columns
  // reaching a booker by silence, which is the exact failure mode this file was built to remove.
  //
  // Note what `Allowance` cannot say: it has no `roles` field, so everything here is granted to
  // BOTH roles by construction. Before 8/5 that was the model's limitation (Q81's rep-only
  // release of `payment_state` had to live inside a narrowed DENIAL). After 8/5 it is the model
  // matching the policy — there is no per-role split left to express.
  { table: "people", column: "transcript_url", because: "the call-recording link on a contact. Booker-denied on 'a booker books; other people's call recordings are not part of it' — Rob 8/5 overrules that reading directly, and his reasoning is the compensation: a booker paid on show-rate and promoted for 'giving sales support and pushing to get the deal closed' needs the record of the call they set" },
  { table: "people", column: "meeting_video_url", because: "the video of the meeting `transcript_url` beside it is of. Released as the same pair it was withheld as (inc.28/29 fought three times over splitting this pair; parity keeps them together on the grant side)" },
  { table: "orgs", column: "transcript_url", because: "same as people.transcript_url, on the org row" },
  { table: "orgs", column: "meeting_video_url", because: "same pair as people.meeting_video_url — transcript and video move together, granted or withheld" },
  { table: "activities", column: "transcript_url", because: "the transcript link on the table those links actually hang off. Same release as people/orgs.transcript_url; the rep already had it and the booker now does" },
  { table: "activities", column: "recording_url", because: "the AUDIO the transcript is of — granted with `transcript_url`, never one increment apart. inc.28's leak was refusing the transcript while granting this; the mirror mistake would be granting the transcript while refusing this, and both are the half-refusal the pair rule exists to stop" },
  { table: "call_transcript_segments", column: "text", because: "the verbatim words of a call. Booker-denied on 'the same rule as people.transcript_url' — that rule is gone. Whether a rep or booker should reach only their OWN calls is a ROW question a column privilege cannot answer, and it is still Rob's org-chart call: flagged, not guessed, and unchanged by 8/5" },
  { table: "call_transcript_segments", column: "speaker", because: "who said the words `text` beside it carries. Granted with the text for the same reason it was withheld with the text: a speaker label without the words, or words without the speaker, is half a record" },
  { table: "phase2_returns", column: "labor_cost_per_hour", because: "a customer's cost basis. Booker-denied on 'a customer's cost basis is not a booker's' — under 8/5 the test is not whose it is but whether the rep sees it, and the rep does. It is also the input to the Phase-2 ROI a booker is booking meetings about" },
  { table: "phase2_returns", column: "revenue_since_phase2_start", because: "a customer's measured revenue, the other half of the same ROI figure. Same release, same reason" },
  { table: "invoice_ledger", column: "payment_state", because: "whether an invoice is paid — the `paid` the DoD names (there is no `paid` column; it is a state value). Q81 released it to the REP only, on Rob: 'We just show it at the rep level so they see it when they open up and see the alerts.' 8/5 extends that to the booker, and Rob's own sentence supplies the motive — he is inclined to pay a booker more for 'pushing to get the deal closed AND PAID', which is a job you cannot do without knowing whether it was paid. The rest of the row does NOT follow: `amount`, `client_legal_name`, `payment_plan_note`, `status_text` and now `pdf` stay denied to both, and `lib/rep/receivableAlerts.ts` — the only consumer — has no dollar field on its alert type at all" },
  // TWO COLUMNS DELIBERATELY LEFT GRANTED, ruled 2026-08-05 alongside `invoice_ledger.pdf` and
  // recorded here because "checked and cleared" must not look like "never examined". Neither can
  // appear in the list above: `ALLOWANCES` is only for columns the classifier calls money/PII,
  // and `grantBreaches()` rejects a non-sensitive allowance as noise. So they are named in prose,
  // with the evidence that cleared them.
  //
  //   documents.countersigned_path — the review's premise was that it "will name Rob or Will
  //     once a row exists", which would make it the `pdf` leak again against the withheld
  //     `countersigner_name`. It does not. `lib/esign/storage.ts` builds it purely from ids:
  //     `<anchor_id>/<document_id>/v<n>-countersigned.pdf` (countersignedPath -> documentPath),
  //     written by app/api/esign/countersign/route.ts. No name, no title, no email — the path
  //     says a countersigned copy EXISTS, which `countersigned_at` beside it already says and
  //     which the withheld columns were never about. Granted, with `signed_path` and
  //     `storage_path` on the same construction. If that builder ever interpolates a person,
  //     this becomes a denial the same day.
  //
  //   phase2_returns.note — free text on a returns row, and under the OLD model it was a real
  //     candidate: `labor_cost_per_hour` and `revenue_since_phase2_start` were booker-withheld
  //     and a note reading "cost basis $85/hr" would have walked straight through. Parity
  //     removed the thing it could leak — after 8/5 nothing on `phase2_returns` is withheld from
  //     either role, so there is no withheld column for the prose to carry. The leak test is
  //     "does this reproduce something refused beside it", not "is this free text": denying it
  //     would refuse the measurement's provenance to protect a figure both roles can read.
  //     Content-level PII in the prose is `npm run guard:pii`'s job, not a column privilege's.
];

/**
 * Tables this model covers that now carry NO refusal at all.
 *
 * THIS LIST EXISTS BECAUSE OF THE 8/5 PARITY CHANGE, and without it that change would have
 * quietly taken data AWAY. `activities`, `call_transcript_segments` and `phase2_returns` were
 * covered by booker-only denials and nothing else; releasing those denials emptied their entry
 * in `DENIALS`, and `COVERED_TABLES` used to derive from `DENIALS` alone — so all three would
 * have dropped out of the model, out of the generated SQL, and therefore out of every `grant`
 * statement in it. A table with no GRANT is not a table both roles read freely; it is a table
 * NEITHER role can read at all. Rob's sentence moved the booker UP to the rep; a derivation
 * that answered it by revoking the rep's call transcripts would have inverted it.
 *
 * The old comment on `COVERED_TABLES` — "a table cannot enter this model on an allowance
 * alone… covering a table means refusing something on it" — was guarding against claiming
 * coverage while refusing nothing. That guard is kept by making entry here an explicit,
 * reasoned, breach-checked act rather than a side effect of an allowance appearing.
 */
export type GrantedTable = { table: string; because: string };

export const FULLY_GRANTED_TABLES: GrantedTable[] = [
  { table: "activities", because: "the call/meeting timeline. Both refusals it carried (`transcript_url`, `recording_url`) were booker-only and were released 2026-08-05; the table stays covered so the revoke-then-grant statement still names its columns, and so a sensitive column added here tomorrow is still a breach rather than a silence" },
  { table: "call_transcript_segments", because: "the verbatim call record. `text` and `speaker` were its only refusals and both were booker-only; reviewing calls is the job of both roles now, and the coverage is what keeps the next column on this table from arriving unruled" },
  { table: "phase2_returns", because: "the measured Phase-2 result. `labor_cost_per_hour` and `revenue_since_phase2_start` were its only refusals and both were booker-only. Covered with zero denials: every money column on it is now a stated grant, which is a decision, not an omission" },
];

/**
 * The tables this model takes responsibility for. Still derived — from the refusals PLUS the
 * declared zero-refusal tables above — so it cannot drift from either list.
 */
export const COVERED_TABLES: string[] = [
  ...new Set([...DENIALS.map((d) => d.table), ...FULLY_GRANTED_TABLES.map((g) => g.table)]),
].sort();

export type Breach = { kind: string; detail: string };

/**
 * THE 2026-08-05 PARITY GATE — in code, not in the paragraph above `DENIALS` (CR-3).
 *
 * Rob: *"Theres nothing an appt booker shouldnt be able to see that a Sales Rep is able to
 * see."* A denial naming ONE role is that policy broken, and prose has already proven it
 * cannot stop the next increment from writing one: eleven booker-only denials accumulated
 * under a comment block that never said they were forbidden, each one reasonable in isolation.
 * This makes the twelfth a build failure.
 *
 * Takes its denials as an argument rather than reading the module constant, so the gate is
 * driveable from a test with a deliberately-broken model. A check that can only ever be run
 * against data that satisfies it is a check nobody has seen fail.
 *
 * If Rob moves the line back, this function is what gets edited — deliberately, with his words
 * replaced by his new ones. That is the intent: a per-role split should cost a decision, not a
 * dropped array element.
 */
export function partialRoleDenials(denials: Denial[]): Breach[] {
  return denials
    .filter((d) => d.roles.length > 0 && READ_ROLES.some((r) => !d.roles.includes(r)))
    .map((d) => ({
      kind: "partial-role-denial",
      detail:
        `${d.table}.${d.column} is withheld from ${d.roles.join(", ")} but not from ` +
        `${READ_ROLES.filter((r) => !d.roles.includes(r)).join(", ")} — Rob 2026-08-05: ` +
        `"Theres nothing an appt booker shouldnt be able to see that a Sales Rep is able to ` +
        `see." Deny it to both roles or grant it to both`,
    }));
}

/**
 * Everything wrong with the model, measured against the real schema.
 *
 * Asymmetric on purpose, the same way `coreSeam`'s ruling check is: a denial naming a column
 * that does not exist is a TYPO that silently protects nothing (a `GRANT` would list every
 * real column, including the one the typo meant to withhold), so it is a breach. A sensitive
 * column on a covered table with no denial is also a breach — that is the "column added
 * tomorrow" case, and it must go red here rather than be discovered by a booker reading it.
 *
 * @param schema table -> columns, from `scripts/lib/schema-from-migrations.mjs`
 * @param sensitive table -> the money/PII columns the exposure audit classifies
 * @param unreviewedCols table -> columns neither classified sensitive nor reviewed benign
 * @param queued `table.column` keys a reader has explicitly left undecided (IDENTIFIED_UNDECIDED)
 */
export function grantBreaches(
  schema: Map<string, Set<string>>,
  sensitive: Map<string, string[]>,
  unreviewedCols: Map<string, string[]>,
  queued: Set<string>,
): Breach[] {
  const out: Breach[] = [...partialRoleDenials(DENIALS)];

  for (const d of DENIALS) {
    const cols = schema.get(d.table);
    if (!cols) {
      out.push({ kind: "unknown-table", detail: `${d.table} is denied from but is not in any migration` });
      continue;
    }
    if (!cols.has(d.column)) {
      out.push({ kind: "unknown-column", detail: `${d.table}.${d.column} is denied from but does not exist — a typo protects nothing` });
    }
    if (d.roles.length === 0) {
      out.push({ kind: "empty-denial", detail: `${d.table}.${d.column} denies no role, so it is a comment` });
    }
    if (!d.because.trim()) {
      out.push({ kind: "unexplained", detail: `${d.table}.${d.column} withholds data without saying why` });
    }
  }

  // A zero-refusal covered table is held to the same standard as a refusal: it must be real,
  // it must say why, and it must ACTUALLY have no denial — an entry here for a table that also
  // appears in DENIALS claims a property the model does not have, and the next reader would
  // trust it.
  const fullyGranted = new Set<string>();
  const deniedTables = new Set(DENIALS.map((d) => d.table));
  for (const g of FULLY_GRANTED_TABLES) {
    if (!schema.has(g.table)) {
      out.push({ kind: "unknown-table", detail: `${g.table} is covered with no refusals but is not in any migration` });
    }
    if (deniedTables.has(g.table)) {
      out.push({ kind: "contradiction", detail: `${g.table} is listed as having no refusals but appears in DENIALS — drop it from FULLY_GRANTED_TABLES, which is only for tables covered with zero denials` });
    }
    if (fullyGranted.has(g.table)) {
      out.push({ kind: "duplicate", detail: `${g.table} is listed twice as fully granted; the two reasons can disagree` });
    }
    if (!g.because.trim()) {
      out.push({ kind: "unexplained", detail: `${g.table} is covered without a refusal and without saying why it is still covered` });
    }
    fullyGranted.add(g.table);
  }

  const seen = new Set<string>();
  for (const d of DENIALS) {
    const key = `${d.table}.${d.column}`;
    if (seen.has(key)) out.push({ kind: "duplicate", detail: `${key} is denied twice; the two lines can disagree` });
    seen.add(key);
  }

  // An allowance is a decision too, so it is held to the same standard as a denial: it must
  // name a real column, on a table this model covers, that the classifier actually calls
  // sensitive, and it must not also be denied — a column in both lists is a model that
  // contradicts itself, and the generated SQL would silently pick the denial.
  const allowed = new Set<string>();
  for (const a of ALLOWANCES) {
    const key = `${a.table}.${a.column}`;
    const cols = schema.get(a.table);
    if (!cols) {
      out.push({ kind: "unknown-table", detail: `${a.table} is granted on but is not in any migration` });
    } else if (!cols.has(a.column)) {
      out.push({ kind: "unknown-column", detail: `${key} is granted but does not exist — the decision is about nothing` });
    }
    if (!COVERED_TABLES.includes(a.table)) {
      out.push({ kind: "uncovered-allowance", detail: `${key} is granted on a table this model does not cover, so the grant enforces nothing` });
    }
    if (!(sensitive.get(a.table) ?? []).includes(a.column)) {
      out.push({ kind: "non-sensitive-allowance", detail: `${key} is not money/PII, so listing it as a deliberate share is noise the next reader must re-check` });
    }
    if (seen.has(key)) {
      out.push({ kind: "contradiction", detail: `${key} is both denied and granted — the SQL would apply the denial and the grant line would read as a lie` });
    }
    if (allowed.has(key)) {
      out.push({ kind: "duplicate", detail: `${key} is granted twice; the two reasons can disagree` });
    }
    if (!a.because.trim()) {
      out.push({ kind: "unexplained", detail: `${key} shares data without saying why` });
    }
    allowed.add(key);
  }

  for (const table of COVERED_TABLES) {
    for (const col of sensitive.get(table) ?? []) {
      const key = `${table}.${col}`;
      if (!seen.has(key) && !allowed.has(key)) {
        out.push({
          kind: "undecided-sensitive",
          detail: `${key} is money/PII on a covered table and is neither denied nor deliberately granted — decide it or drop the table from coverage`,
        });
      }
    }
  }

  // THE inc.30 GATE. Three increments (25, 28, 29) each found a real leak on a covered table,
  // and every one was found by a human happening to read output — `activities.recording_url`,
  // `people.meeting_video_url`, `call_transcript_segments.speaker`. All three sat in the same
  // place: a column on a table this model covers, whose name matched no pattern in either
  // direction, so it was neither refused nor deliberately kept. inc.29 made that set printed;
  // printing it does not stop a fourth one, because the detector was still a person's
  // attention. This makes it RED: on a covered table, a column must be classified sensitive
  // (then denied or granted above), reviewed benign, or explicitly queued as undecided. There
  // is no fourth state, and the generator refuses to write SQL while one exists.
  for (const table of COVERED_TABLES) {
    for (const col of unreviewedCols.get(table) ?? []) {
      if (queued.has(`${table}.${col}`)) continue;
      out.push({
        kind: "unreviewed-on-covered-table",
        detail: `${table}.${col} is on a covered table and nobody has ruled on the name — classify it money/PII/benign, or queue it in IDENTIFIED_UNDECIDED. Unruled is how recording_url, meeting_video_url and speaker each reached a booker`,
      });
    }
  }

  // The queue is held to the same standard as a decision, for the same reason a typo'd denial
  // is: an entry naming a column that does not exist reads as "we are watching this" while
  // watching nothing, and it would also let a REAL column of that name slip in later.
  for (const key of queued) {
    const [table, ...rest] = key.split(".");
    const column = rest.join(".");
    const cols = schema.get(table);
    if (!cols) {
      out.push({ kind: "unknown-table", detail: `${key} is queued as undecided but ${table} is not in any migration` });
    } else if (!cols.has(column)) {
      out.push({ kind: "unknown-column", detail: `${key} is queued as undecided but does not exist — the queue entry watches nothing` });
    }
  }

  return out;
}

/**
 * The sensitive columns on tables this model does NOT cover. Reported, never silently
 * dropped: the audit half's whole argument is that a report which overstates its coverage is
 * worse than none.
 */
export function uncoveredSensitive(sensitive: Map<string, string[]>): { table: string; columns: string[] }[] {
  return [...sensitive.entries()]
    .filter(([table, cols]) => cols.length > 0 && !COVERED_TABLES.includes(table))
    .map(([table, columns]) => ({ table, columns }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

/** Columns a role may read on a table: everything that exists, minus what it is denied. */
export function permittedColumns(table: string, all: string[], role: ReadRole): string[] {
  const denied = new Set(
    DENIALS.filter((d) => d.table === table && d.roles.includes(role)).map((d) => d.column),
  );
  return all.filter((c) => !denied.has(c)).sort();
}

/**
 * The migration text. Pure — takes the schema in, returns a string, touches nothing.
 *
 * Shape notes that are decisions, not style: roles are created in a `DO` block so re-running
 * is safe; table-level SELECT is revoked before the column list is granted (see the header —
 * a table grant cannot be narrowed); `service_role` is never touched, because every server
 * route in this repo reads through it and narrowing it would take the dashboard down rather
 * than protect anything; and the file ends with the verification query rather than a claim,
 * so the person applying it can see the refusal for themselves.
 */
export function renderRoleGrantSql(schema: Map<string, Set<string>>): string {
  const L: string[] = [];
  L.push("-- Q73 rollout half — column-level read privileges for named non-owner roles.");
  L.push("-- GENERATED by `npm run gen:role-grants` from lib/security/roleGrants.ts + the");
  L.push("-- migrations themselves. Do not hand-edit: a vitest drift check compares this file to");
  L.push("-- the generator's output and fails on any divergence.");
  L.push("--");
  // Q84 inc.51 — the machine half of the sentence below. Prose is not a ledger:
  // `lib/migrations/applyStatus.ts` reads this marker, so an unapplied migration
  // shows up on the backlog instead of only in a comment a human has to find.
  L.push("-- APPLY-STATUS: PENDING (owner: rob)");
  L.push("--");
  L.push("-- *** NOT APPLIED. *** Rob's go gates the rollout half. Applying this changes who can");
  L.push("-- read what in prod; it is committed so that go costs one `supabase db push`, not a");
  L.push("-- design session.");
  L.push("--");
  L.push("-- THE TWO ROLES READ IDENTICALLY. Rob, 2026-08-05: \"Theres nothing an appt booker");
  L.push("-- shouldnt be able to see that a Sales Rep is able to see. At least nothing I can think");
  L.push("-- of at the moment.\" Every grant below is the same column list for mle_rep_read and");
  L.push("-- mle_booker_read, and every withheld column is withheld from BOTH. If you are reading");
  L.push("-- this file to find out what a booker may see that a rep may not, the answer is");
  L.push("-- nothing, in either direction. The roles stay two names because the line may move");
  L.push("-- again; a per-role split is a breach in lib/security/roleGrants.ts until it does.");
  L.push("--");
  L.push("-- WHAT IS STILL WITHHELD, from both: `equity` on people/orgs/deals (owners only — Rob");
  L.push("-- 2026-07-29, \"I dont want to show any equity to anyone but Will and I\"), the owners'");
  L.push("-- invoice ledger (amount, client_legal_name, payment_plan_note, status_text and the");
  L.push("-- `pdf` path that spells them out), the countersign record on documents, and the e-sign");
  L.push("-- audit trail on signature_requests. Parity raised the booker to the rep; it did not");
  L.push("-- open the owners' data to either.");
  L.push("--");
  L.push("-- RLS is not the instrument. Row-level security filters rows; this model asks that");
  L.push("-- neither role be able to read `equity` on a row it may otherwise see. That is a");
  L.push("-- column privilege, and a table-level GRANT cannot be narrowed by a column-level");
  L.push("-- REVOKE — hence revoke-then-grant-a-list below.");
  L.push("");
  L.push("do $$");
  L.push("begin");
  for (const role of READ_ROLES) {
    L.push(`  if not exists (select 1 from pg_roles where rolname = '${role}') then`);
    L.push(`    create role ${role} nologin;`);
    L.push("  end if;");
  }
  L.push("end $$;");
  L.push("");
  L.push("-- service_role is deliberately untouched: every server route reads through it.");
  L.push("");

  for (const table of COVERED_TABLES) {
    const all = [...(schema.get(table) ?? [])].sort();
    L.push(`-- ${table} — ${all.length} columns on disk`);
    for (const g of FULLY_GRANTED_TABLES.filter((x) => x.table === table)) {
      // Said out loud, because a table with no `withheld:` line beneath it is otherwise
      // indistinguishable from a table nobody ruled on — and the whole file exists to keep
      // "decided to share" from reading like "never looked at".
      L.push(`--   NO column is withheld on this table, deliberately — ${g.because}`);
    }
    for (const d of DENIALS.filter((x) => x.table === table)) {
      L.push(`--   withheld: ${d.column} from ${d.roles.join(", ")} — ${d.because}`);
    }
    // The kept lines matter as much as the withheld ones: without them, a sensitive column
    // reaching a booker reads identically to one nobody thought about.
    for (const a of ALLOWANCES.filter((x) => x.table === table)) {
      L.push(`--   kept, deliberately: ${a.column} — ${a.because}`);
    }
    for (const role of READ_ROLES) {
      const cols = permittedColumns(table, all, role);
      L.push(`revoke select on public.${table} from ${role};`);
      L.push(`grant select (${cols.join(", ")}) on public.${table} to ${role};`);
    }
    L.push("");
  }

  L.push("-- Verify by reading, not by trusting. Each row is a column a role may select;");
  L.push("-- a withheld column must be absent from this result.");
  L.push("--   select grantee, table_name, column_name from information_schema.column_privileges");
  L.push(`--   where grantee in (${READ_ROLES.map((r) => `'${r}'`).join(", ")}) and privilege_type = 'SELECT'`);
  L.push("--   order by grantee, table_name, column_name;");
  L.push("");
  return L.join("\n");
}
