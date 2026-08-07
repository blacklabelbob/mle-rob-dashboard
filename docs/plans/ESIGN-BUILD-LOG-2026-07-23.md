# E-Sign Build Log — overnight 2026-07-23 (Q47, Max session)

Sources of truth: `docs/research/esign-mit-scout-2026-07-23.md` (legal elements + MIT stack) ·
`docs/plans/esign-flow-walkthrough-2026-07-23.html` (decided UX). File territory:
`supabase/migrations/*esign*`, `lib/esign/**`, `app/sign/**`, `app/api/esign/**`, one
package.json dep add, one Documents-section component. This log is updated per increment —
sections below are marked DONE only after prod evidence.

## Increment 1 — migration 0008_esign ✅ DONE, applied to prod

`supabase/migrations/0008_esign.sql`: `documents` (activities-style anchors: ≤1 of
person/org, ≥1 anchor incl. deal; `phase` per Rob; `storage_path`, `sha256_at_upload`,
`sha256_signed`/`signed_path` for the final copy, `version`, `supersedes_id`, status enum
draft/sent/viewed/signed/voided/archived) · `signature_requests` (token **hash** only at
rest, `expires_at`, channel email/sms/both, `sent_to`, signer meta name/email/IP/UA,
`consent_at`/`viewed_at`/`signed_at`/`voided_at`, `sha256_at_sign`, `presend_answers`
jsonb = remembered pre-send answers) · `signature_events` append-only (identity PK,
request FK **restrict** — audit outlives its request; type enum created/sent/resent/
viewed/consent/signed/voided/nudge/copy_delivered).

**Append-only is enforced by trigger, not prose or RLS**: service-role bypasses RLS, so
`signature_events_no_update` raises on UPDATE/DELETE for every role. RLS enabled with no
policies on all three tables (house style 0005/0006).

**Applied to prod** via Management API, tracked as `supabase_migrations.schema_migrations`
row `20260723090000/esign` (same tracked-migration approach as 0005). Pre-apply gate: 14
public tables, none of the 3 names present. **Round-trip verification via PostgREST**
(the app's real path): person-anchored document round-trip ok · anchorless doc → 23514 ·
bogus status → 23514 · request round-trip ok · duplicate token_hash → 23505 · event
insert ok, then UPDATE → P0001 "append-only", DELETE → P0001 · deleting a request with
events → 23503 (restrict held). Cleanup: trigger transiently disabled via admin DDL
(honest note: admin DDL can always do this — the trigger guards every DML path, not
superuser DDL), all test rows deleted, final counts 0/0/0.

## ENGINE DECISION — AMENDED BY ROB mid-build: TS port, Vercel-runnable ✅ SHIPPED

Original overnight call was (b) keep Python local — rationale preserved in inc.1's
commit message: the engine is ReportLab flowables and pdf-lib has no layout engine.
**Rob overrode it** ("you should be able to replicate it as something that CAN run on
Vercel… make a Skill out of it"). Shipped as **`lib/esign/agreementPdf.ts`** — faithful
port of all 408 lines: §1–§13 clauses verbatim, intake gate (structural scope
enforcement: refuses until the confirmed intake block matches entities[], same
messages), number-to-words, per-entity scope grammar (sole/multi/differing-pages/agent
bundles/label overrides/social-media dict), fee-null → highlighted placeholder,
header/footer, KeepTogether signature blocks. **Skill-wrappable by design**: pure
module, JSON-in → PDF-bytes-out, no Next imports, template data contract documented
in-module (mirrors `contracts/clients/*.json`). Includes the mini layout engine the
original decision feared (wrap + word-spacing justification + pagination + keep-together
measurement) — it fit the night after all.

**Parity vs the Python engine, proven:** reference generated locally via
`python3 phase1_engine.py` on the real CG-Roofing config (scratchpad cwd — contracts
repo ledger and filed PDFs untouched). Result: **4/4 pages both engines; 94.6%
normalized-char similarity; all 13 clauses + parties + fee + scope lines present; the
entire remaining diff is (a) header/footer text-extraction order and (b) ReportLab's
bullet glyph extracting as \x7f vs our •. Zero substantive text differences.** Cosmetic
deviations on record: justification line-break positions may differ by a word; §5's ★
drawn via ZapfDingbats because WinAnsi Helvetica can't encode U+2605 — **correction
(critic-rob punch #3, re-verified 2026-07-23): ReportLab renders the ★ via its own
encoding path and BOTH engines' PDFs extract it (1 occurrence each in the parity
texts); an earlier version of this line wrongly said ReportLab dropped it**; list
indent metrics visually matched, not metric-identical.

Wired as **`POST /api/esign/generate`** (admin; intake-gate refusals return verbatim as
the 400 body — the error doubles as the fix-it instruction). The **upload path stays**
(`POST /api/esign/documents`) — both funnel through `lib/esign/createDocument.ts`
(shared versioning/supersede flow). Ledger + organize.py filing deliberately stay a
contracts-repo concern; the CRM `documents` table is the system of record here. Skill
packaging of agreementPdf.ts = follow-up increment per Rob (lib is ready for wrapping).

## Increment 2 — private `agreements` bucket + lib/esign/storage ✅ DONE

Bucket created via Storage API, verified `{"id":"agreements","public":false}`.
`lib/esign/storage.ts`: pure `documentPath(anchorId, docId, version, signed?)` →
`<org_or_person_id>/<document_id>/v<N>[-signed].pdf` (unit-tested) + service-role-only
`uploadPdf` (upsert:false — a path collision fails loudly, versioning not clobbering),
`downloadPdf`, `signedUrlFor` (time-limited read, default 1h).

## Increment 3 — lib/esign core, pure + tested ✅ DONE (23 tests; suite 496/496)

- `hash.ts` — sha256Hex + hex-shape guard (the three-hash discipline: at_upload,
  at_sign, signed).
- `token.ts` — 32-byte base64url mint; **hash at rest only** (DB leak yields no usable
  links); constant-time compare (verifyVapiSecret idiom); `verifyToken(token, row, now)`
  pure with `now` injected (CR-3) — covers tampered/forged, expired (boundary instant
  fails), reused (signed_at), voided, and tamper-beats-expiry (no liveness oracle).
- `status.ts` — chip ladder as data: `DOC_TRANSITIONS` (draft→sent→viewed→signed;
  sent→signed legal so a sign never loses a race with the view logger; signed terminal;
  draft can't jump to viewed/signed) + `archiveOnNewVersion` planner (changed-answers
  resend: old doc archived, open links voided, **refuses to auto-archive a signed doc**).
- `events.ts` — 0008-enum event builders + deterministic certificate chain formatter.
- `consent.ts` — exact B2B ESIGN consent language (all four §7001 elements asserted in
  tests), versioned `b2b-2026-07-23`, single-sourced for checkbox + certificate.
- DDL drift gate: runtime enums parsed against `0008_esign.sql` (lib/crm.ts precedent).

## Increment 4 — signer flow + send/upload/generate routes + Rob's consent amendments ✅ DONE (build+lint+530 vitest green)

Deps added (the one package.json edit): @cantoo/pdf-lib 2.7.4 · signature_pad 5.1.3 ·
react-pdf 10.4.1 — the decided MIT stack, all in (react-pdf client-only via next/dynamic
ssr:false; pdf.js worker bundled via import.meta.url).

`app/sign/[token]` public signer page (proxy `isPublicPath` gained `/sign/` +
`/api/esign/sign` — the one out-of-territory edit, pinned in proxy.test.ts: send/
documents/generate stay Basic-gated): token verified server-side; honest state screens
(invalid / expired / replaced / already-signed); first view logged idempotently
(`viewed` event + request pending→viewed + doc sent→viewed, race-safe
`.is(viewed_at,null)`); `fixed inset-0` overlay so customers never see CRM chrome.
Client: react-pdf full-document preview (open-PDF fallback), consent checkbox, draw
(signature_pad, DPR-correct redraw) / typed-name toggle, mobile-first.

`POST /api/esign/sign` (public, token-authed): consent required (ESIGN element 2) →
re-download stored PDF → re-hash (mismatch = hard 409 — hash discipline) → single-use
latch FIRST (`.is(signed_at,null)` conditional update; concurrent double-post 409s) →
stamp + audit-certificate page(s) via @cantoo/pdf-lib (signature image or italic typed
name, server-stamped UTC date, consent language, both hashes, IP/UA, full event chain;
long chains roll to continuation pages) → `v<N>-signed.pdf` + sha256_signed → consent +
signed events → timeline activity `esign-signed-<req>` → 7-day signed-copy links emailed
to signer + Rob (copy_delivered events; email failure never loses a signature — record
is durable first). Deliberate choice logged: no coordinate-guessed ink overlay on the
source pages (pdf-lib can't locate text; covering legal text is worse than a clean
certificate page carrying the signature).

`POST /api/esign/send` (admin): mints token (hash at rest), request row w/
presend_answers (1-click resend with empty answers carries the remembered jsonb
forward), voids every open link first (`voided` events), changed-answers → 409
instructing a new version via generate/documents w/ supersedesId, draft→sent flip,
timeline activity, email via the n8n sender (env-gated; response returns signUrl to the
authed admin when the mailer is down so a dead mailer can't strand a deal). SMS/Both →
501 (Q5b Twilio). `POST /api/esign/documents` (upload) + `POST /api/esign/generate`
(TS engine) share `lib/esign/createDocument.ts`.

**Amendment 2 (comms consent, PEWC)** — `COMMS_CONSENT_TEXT` + version
`mle-pewc-2026-07-23-DRAFT-counsel-pending` (`[counsel review]` marked in code):
separate, UNCHECKED, OPTIONAL, quiet-styled checkbox + phone reveal on the signer page;
structurally cannot gate signing (`canSign` never references it — PEWC's
"not a condition" is load-bearing). Recorded as `comms_consent` event (0009 enum value;
IP/timestamp/language-version/phone/UA in meta) + person-level `people.comms_consent`
jsonb (0009), written only `.is(comms_consent,null)` so an earlier grant is never
overwritten; page shows "communications consent on file ✓" instead of re-asking when
the person row already carries consent. All PEWC elements test-asserted (company named,
automated/prerecorded/AI, calls AND texts, number provided, MLE-only scope,
not-a-condition, STOP). Also stamped onto the certificate when granted.

**Amendment 3 (consumer seam — built to the landed ESIGN-CONSUMER-DISCLOSURE-SPEC, not
a placeholder):** `signature_requests.signer_type` (0009) resolved at send
(`body.signerType` or `presend_answers.signer_type`, echoed both places per §3.1);
consumer sends hard-blocked 403 behind `ESIGN_CONSUMER_ENABLED` (unset = business-only
= tonight's scope). Consumer flow per §3.3: full §3.5 draft disclosure (version
`consumer-2026-07-23-DRAFT-counsel-pending`; placeholders resolve to rob@aivoicetech.io
/ My Local Everything) rendered BEFORE the consent step; consent checkbox LOCKED until
react-pdf reports the document rendered (render failure keeps it locked and points at
the paper-copy option); sign route REJECTS consumer signatures lacking render evidence;
consent event meta carries pdf_rendered_at/disclosure_shown_at/viewport (§7001(c)(1)(C)(ii)
evidence); certificate reproduces the full disclosure text + evidence line (§3.4).
**Truth correction (critic-rob punch #2):** the original claim "all seven elements
test-asserted" was one short — element 6 (demonstrable access) was a dangling comment
with no assertion. Closed 2026-07-23: element 6 is now asserted against
`ESIGN_CONSUMER_CONSENT_TEXT` (the checking-this-box-in-the-rendering-browser
mechanic), the render-lock itself is pinned at component level
(`signerGate.test.ts`, pure gate + SignerClient source-drift guard) and server level
(`signRoute.test.ts`: consumer without render evidence → 400 before the latch), and
the spec-§3.4 DoD "certificate reproduces the disclosure verbatim" is proven by
pdf.js text-extraction of a stamped consumer certificate. NOW all seven are
test-asserted.

Migration `0009_esign_comms_consent.sql` APPLIED TO PROD (tracked `20260723100000`),
columns verified live; events DDL gate test now parses 0009's superseding constraint.

## Increment 5 — n8n sender workflow LIVE ✅ DONE

**"MLE — agreement link sender"** (`EIR0mgUWcn26rsjD`, published/activated): Webhook
POST `/webhook/esign-send` (responseNode mode) → `Authorized?` IF on
`headers["x-esign-secret"]` → Gmail send via cred `zafHNwGNRYD8V9aq`
(rob@aivoicetech.io — identity rule; attribution footer off) → Respond 200
`{ok:true}`; false branch → Respond 401. `errorWorkflow → VoOFOPGqObGWe5Jr` backstop
(house pattern). **Proven live:** wrong secret → 401; right secret → 200 + real email
delivered to rob@aivoicetech.io. One real bug caught: the create-API call had its IF
expression quotes eaten by shell quoting (`headers[x-esign-secret]`) — first live 401
exposed it, fixed via workflow PUT, re-proven. ⚠️ registry note (same as the other
bearer workflows): the secret is hardcoded in the IF node (API can't create n8n creds);
rotation must update the workflow AND both env stores by hand.
Env wired: `ESIGN_SENDER_WEBHOOK_URL` + `ESIGN_SENDER_SECRET` in `.env.local` and
Vercel production. Copy-to-Rob on signed was already in the sign route (inc.4).

## Increment 6 — DocumentsSection on the record page ✅ DONE

`components/esign/DocumentsSection.tsx` (the one allowed component) mounted on
`app/people/[id]` (company rows anchor as org per the 0008 ≤1-of-person/org rule):
version list w/ status chips (draft/sent/viewed/signed/voided/archived), View via
time-limited signed URL (`GET /api/esign/documents?view=<id>` — signed copy when it
exists), Upload PDF (base64 → the upload route), Send/Resend opening the PRE-SEND CHECK
popup (walkthrough step 2): legal name / DBA / address / entity descriptor / signer
name+email prefilled from the last request's remembered `presend_answers`; signer-type
select (consumer visible but server-blocked pending counsel); channel select (Email
live, SMS/Both disabled pending Twilio Q5b); server 409s (changed answers → new
version; consumer gate) surface verbatim; mailer-down path shows the manual signUrl.

## Increment 7 — PROD E2E: full signed agreement, verified end-to-end, then cleaned ✅ DONE

Deployed (git auto-deploy of inc.5+6; health ok/66ms; `/sign/<bogus>` publicly reachable
and renders the honest invalid-link page). **The whole loop ran against prod:**

1. `POST /api/esign/generate` — synthetic config (Synthetic Roofing Co LLC, $1 fee,
   intake block present) anchored to `demo-priya-nair` → **TS engine ran ON VERCEL**:
   `doc-mrxce9e3-b7d4ce`, 4 pages, sha256 `a9dd3149…de01`.
2. `POST /api/esign/send` → `req-mrxceexy-52284a`, `emailSent:true` — and the link was
   recovered FROM THE DELIVERED EMAIL (Gmail: rob+esigntest@aivoicetech.io, sender
   rob@aivoicetech.io, n8n workflow) — the delivery leg is part of the proof, not
   assumed.
3. `GET /sign/<token>` → 200, `viewed` logged w/ IP.
4. `POST /api/esign/sign` — typed signature + ESIGN consent + PEWC comms opt-in
   (phone (239) 555-0142) → `{ok:true, downloadUrl}`.
5. **Verified in prod DB + storage:** token reuse → 409 "signing link signed"
   (single-use held) · document `signed` w/ `v1-signed.pdf` + both hashes · request
   `signed` w/ signer name/IP/UA, consent_at/viewed_at/signed_at, sha256_at_sign,
   signer_type business, all 7 remembered presend_answers keys · event chain exactly
   `created → sent → viewed → consent → comms_consent → signed → copy_delivered ×2`
   (signer + Rob copies both 200'd through the sender) · both timeline activities on
   the anchor · `people.comms_consent` populated w/ phone + language version + source.
6. **Signed PDF pulled from the bucket:** sha256 `7e32ffb9…1ca9` == `sha256_signed`
   byte-exact; 5 pages (4 agreement + certificate); certificate page carries signature,
   server-stamped UTC date, full consent text, matching digests line, IP/UA, the
   Communications-opt-in block w/ full PEWC language + number, and the audit event
   chain.
7. **Cleaned per honest-ledger precedent:** events (trigger transiently disabled) +
   request + document + both activities deleted; `comms_consent` reset to null;
   both storage objects deleted; final counts 0/0/0/0, bucket empty. Test emails left
   in Rob's inbox (tagged [E2E TEST] — they're the delivery evidence).

**Security finding (filed, not fixed):** during E2E setup, prod admin routes answered
WITHOUT credentials — `DASHBOARD_PASSWORD` exists in NO Vercel env target, so the
proxy Basic gate is inert and the entire dashboard (not just e-sign) is open. Filed as
**high flag #30** ("Things to Address") with the exact fix; not set unilaterally — a
password Rob doesn't know would lock him out. `/sign` is unaffected (token-authed by
design).

## Increment 8 — nudge ladder as pure lib ✅ DONE (no cron wiring — morning increment by design)

`lib/esign/nudges.ts` — `planNudges(requests, priorNudgeEvents, now)`, overdue-watcher
pattern (caller reads rows + clock; module is pure): full walkthrough ladder
(rep@viewed+24h · customer@sent+2d/+5d(+rep)/+10d-with-real-expiry-date ·
Rob-escalation+`markStalled`@+14d), max-3 customer touches (hard cap), business-hours
guard (09–18 ET Mon–Fri; customer sends DEFERRED not skipped — internal flags file
anytime), instant stop on signed/voided/expired, DEMO-row exclusion, per-(request,rung)
idempotency against prior `nudge` events, deterministic flag titles (= flags-ledger
dedupe keys) and ordering. 11 tests. Morning increment: a cron route + n8n schedule
that executes the plan (emails via the sender workflow, flags via /api/admin/flags,
`nudge` events as the ledger).

## Night DoD — MET

Migrations live+verified ✅ (0008 + 0009, tracked, constraint-gated, test rows cleaned) ·
core lib tested ✅ (77 esign tests; suite 541/541) · **E2E signed test agreement
completed against prod ✅ (synthetic, fully cleaned, evidence above)** · CI green ✅
(and note: CI was RED before this build — SearchBar set-state-in-effect — root-caused
and fixed) · engine decision recorded ✅ (amended by Rob to TS port; shipped with
proven parity) · this log current ✅.

## Critic-rob punch list (92/100 REVISE, 2026-07-23) — ALL SIX CLOSED

1. **Post-latch failure could strand a signature** (loudest): the single-use latch was
   consumed before the stamped PDF existed. Fixed in `app/api/esign/sign/route.ts` —
   stamp/upload/doc-flip now run in a guarded critical section; on failure the latch
   is REVERTED to the exact pre-latch snapshot (link lives again, immediate retry),
   a high flag is filed, and the signer gets an honest 500. Revert-failure sub-case:
   flag says the link is stuck + signer told to request a fresh link. Design choice on
   record in-code: can't lose a signature (nothing durable existed at failure) and
   can't double-sign (the atomic latch just re-arms). Post-durability event-write
   failures now file "audit gap" flags instead of 500ing a completed signature.
   Pinned by `signRoute.test.ts` (stamp-fail, upload-fail, revert-fail, happy path).
2. **"All 7 asserted" was 6/7** — corrected above; element 6 + certificate-verbatim
   assertions added.
3. **★ parity micro-claim was wrong** — corrected above and in agreementPdf.ts's
   header; both engines render AND extract the star.
4. **"Already signed" page over-claimed copy delivery** — now checks `copy_delivered`
   events and only claims delivery when one exists; otherwise honest soft wording.
5. **Upstream attribution in token.ts comment** — reworded to "hash-at-rest";
   provenance stays in the scout doc only.
6. **Render-lock untested** — `lib/esign/signerGate.ts` (pure gate: consentLocked +
   canSign, comms structurally absent) + `signerGate.test.ts` (lock rules + SignerClient
   source-drift guard pinning checkbox/button/submit wiring) + server-side consumer-400
   test. Required before `ESIGN_CONSUMER_ENABLED` ever flips.

## VERDICT — attach the executed PDF to the completion email? (Q93 DoD (b), 2026-08-07)

Rob asked it as a cost question: *"cant we just attach the fully executed pdf to the
email or is that a pain in the ass??"* — so the answer is a cost, measured, not a
preference. **Verdict: YES, it is worth doing, and it is NOT in this driver's hands —
it is an edit to Rob's live n8n workflow, not a code change.** Each of the three
factors the DoD named, answered separately:

**1. Size — a non-issue, by three orders of magnitude.** Measured against the real
objects in the private `agreements` bucket (`P-1002/doc-msj7wohm-c5e551/`), not
estimated: `v1.pdf` = **11,959 bytes**, `v1-signed.pdf` = **15,318 bytes**. The fully
executed copy adds a countersignature and an audit certificate page to the same
document, so it lands in the same tens-of-kilobytes band. Gmail's send ceiling is
**25 MB**. A ~20 KB attachment uses **under 0.1%** of it. Size never becomes the
reason not to attach, and it will not become one as agreements grow — a 25 MB
agreement is not a document, it is a scan problem.

**2. The n8n sender cannot attach anything as it stands — measured from the live
workflow, not assumed.** `EIR0mgUWcn26rsjD` ("MLE — agreement link sender", active)
is four nodes: Webhook (`esign-send`) → secret-check IF → **Gmail send** → respond.
Its Gmail node carries `emailType: "text"` and `options: {appendAttribution: false}`
and **no `attachmentsUi` / `attachmentsBinary` key at all**. The n8n Gmail node
attaches only from *binary* properties on the incoming item, and our webhook posts
JSON — `{to, subject, text}`, the whole of `EsignEmail` in `lib/esign/sender.ts`.
There is no binary anywhere in the flow to attach. So "a pain in the ass" resolves
to a specific, small, three-part job:
  - **n8n (interactive, Rob's cloud instance):** insert an HTTP Request node between
    the IF and the Gmail node that GETs `$json.body.attachmentUrl` with
    `responseFormat: file` → produces a binary property; then set the Gmail node's
    `options.attachmentsUi.attachmentsBinary` to that property. Must be a
    **conditional** branch — the signing-link email has no attachment and must not
    break when the field is absent.
  - **Code (this repo):** widen `EsignEmail` with an optional `attachmentUrl`, and
    have `fullyExecutedEmail`'s caller pass the same signed URL it already mints.
    Everything else — the `copy_delivered` ledger, `pendingExecutedCopies()`, the
    resend path — is untouched, because the receipt is per-address, not per-payload.
  - **Copy:** the link stays in the body regardless. An attachment that fails to
    render on a phone client must never be the only way to get the agreement.
**This driver did not make that n8n edit and should not.** Editing a live workflow
that sends real mail from `rob@aivoicetech.io` is an outward-facing production change
on Rob's instance; it wants his hand on it, or at minimum his say-so, not a headless
increment. The N8N API key in `.env.local` makes it *possible*, which is exactly why
it is being declined in writing rather than silently.

**3. A copy leaving the private bucket is acceptable HERE, and the reasoning does not
generalise.** The bucket is `public:false` and every read today is a 7-day signed URL
(`lib/esign/storage.ts`). An attachment is different in kind: it is permanent,
un-expiring, forwardable, and comes to rest on mail servers we do not control. That
is a real loss of control — and it is the *correct* trade for **this one document to
these two parties**, because a counterparty who has signed an agreement is a party to
it and is entitled to keep their own copy forever. That is the industry norm
(DocuSign attaches the executed PDF). The narrow scope is the safeguard, and it must
be enforced in code rather than remembered: **only `fullyExecutedEmail` may carry an
attachment.** The signing-link email must never carry one — it goes to someone who
has *not* yet signed, sometimes to an address we are still confirming, and the whole
point of the tokenised link is that access is revocable until it isn't.

**Open, and Rob's call, not a blocker:** whether the executed PDF also lands as an
attachment on the MLE-side copy to `rob@aivoicetech.io`, or whether Rob would rather
his own copy stay a link so his inbox does not accumulate duplicates of documents the
bucket already holds. Either is defensible; nobody should guess.

## ANSWER — what ORDER do the two signatures happen in? (Q93 DoD (c), 2026-08-07)

Rob asked it plainly: *"whats going to happen is it going to sign first or is it going
to go to us both at the same time."* Until now the answer was only legible by reading
the code, which is the same as not having one.

**The answer: SEQUENTIAL, counterparty first. It never goes to both parties at once.**

The order, as built:

1. **You send.** `POST /api/esign/send` mints one tokenised link and emails it to **one
   address** — the counterparty's authorized signer, the one confirmed in the pre-send
   check. No link is ever minted for the MLE side, because the MLE side does not sign
   through the signer page at all.
2. **They sign.** `/sign/[token]` stamps their signature + audit certificate, writes
   `documents.signed_path`, moves `documents.status` to `signed` (terminal — 0010
   header), and emails **them** a copy of the one-sided signed agreement.
3. **You countersign, afterwards, from the record page.** The `Countersign` button in
   `components/esign/DocumentsSection.tsx` only renders when
   `d.status === "signed" && !d.countersigned_at`; until then that document reads
   **"awaiting your countersignature."**
4. **Both parties are told it closed.** Countersignature stamps the MLE signature page
   beside their copy and mails the `fully executed` link to **both** addresses,
   ledger-deduped (`copy_delivered` / `meta.kind === "fully_executed"`, Q93 inc.1).

**This is enforced, not merely conventional.** `planCountersign` (`lib/esign/
countersign.ts:72-76`) *throws* on a document that is not yet signed —
`document <id> is '<status>' — the other party has not signed yet` — so there is no
code path, race or double-click that can put the MLE signature on the paper first.
The reverse guard exists too: `state === "complete"` throws rather than re-dating an
executed agreement, and the atomic claim on `countersigned_at` 409s every second POST.

**Why this order and not simultaneous.** The countersignature is stamped *onto the
counterparty's signed PDF* (`stampSourcePath = doc.signed_path`), and the route
refuses to stamp a file whose digest no longer matches `documents.sha256_signed`. A
simultaneous flow would need two independent signatures merged into one document
afterwards — a different, harder design that buys nothing here, because in every MLE
deal to date the counterparty is the party being asked to commit and Rob executes
after. **Sequential is also the safer commercial posture:** MLE is never bound to an
agreement the other side has not already signed.

**Where this is now said in the product, not just here (this increment):** the
pre-send modal states the order *before* the link goes out, and the signer's
confirmation screen tells the counterparty their copy is one-sided until MLE
countersigns — so neither party has to infer it from silence.

## Morning queue (what remains)

- Nudge cron wiring: route (CRON_SECRET bearer) + n8n schedule executing
  `planNudges` (emails / flags / events / Stalled flip).
- Countersign flow (MLE rep signature — walkthrough step 5's provider side).
- Skill packaging of `lib/esign/agreementPdf.ts` (Rob: "make a Skill out of it").
- Org-record + deal-record mounts of DocumentsSection (person/company page shipped).
- SMS channel + SMS nudges (Q5b Twilio creds).
- Consumer flow enablement: counsel review of the two DRAFT language versions
  (§3.5 disclosure + PEWC comms text) → flip `ESIGN_CONSUMER_ENABLED`.
- Rob decisions: DASHBOARD_PASSWORD (flag #30) · walkthrough-HTML step-5 bullet
  update to link the consumer spec (spec DoD item).
