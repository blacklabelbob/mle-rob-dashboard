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
drawn via ZapfDingbats (WinAnsi Helvetica can't encode U+2605 — ReportLab silently
dropped it, per the reference PDF's own extracted text); list indent metrics visually
matched, not metric-identical.

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
evidence); certificate reproduces the full disclosure text + evidence line (§3.4). All
seven §7001(c) checklist elements test-asserted against the disclosure text.

Migration `0009_esign_comms_consent.sql` APPLIED TO PROD (tracked `20260723100000`),
columns verified live; events DDL gate test now parses 0009's superseding constraint.

## Remaining increments (planned, in order)

5. n8n workflow "MLE — agreement link sender" (Gmail cred zafHNwGNRYD8V9aq, from
   rob@aivoicetech.io; copy-to-Rob on signed) + ESIGN_SENDER_WEBHOOK_URL/SECRET env
   (local + Vercel).
6. `components/esign/DocumentsSection.tsx` on the person record: version list w/ status
   chips, signed-URL view, send/resend wired to the pre-send check popup (remembered
   answers + signer_type from presend_answers jsonb).
7. Deploy → E2E signed test agreement on prod (synthetic, cleaned) → nudge lib if the
   night allows.

DoD for the night: migrations live+verified ✅ (0008+0009) · core lib tested ✅ (43
esign tests; suite 530) · E2E on prod pending · CI green (SearchBar lint fix landed —
CI was red before this build started) · this log current.
