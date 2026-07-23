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

## ENGINE DECISION (recorded up front, per assignment): (b) keep Python local, build the upload path

`phase1_engine.py` (408 lines, read in full) is a ReportLab **flowables** document:
justified paragraphs, nested bullets w/ per-entity scope grammar, KeepTogether blocks,
page templates w/ header/footer — it leans on ReportLab's full text-layout engine.
@cantoo/pdf-lib is a low-level PDF writer with **no layout/flow engine** (no automatic
justification, wrapping across pages, or list flowables) — a faithful TS port means
writing a mini layout engine first, which cannot be finished *correctly* in one night and
would drift from the battle-tested CG-Roofing/Gulf-Coast output. Do-not-half-port rule
applied: generation stays local (`python3 phase1_engine.py` in the contracts project),
and the dashboard takes finished PDFs through `POST /api/esign/documents` (base64 PDF +
anchors → sha256 → bucket → documents row). The port stays open as a future increment
(or the engine grows a `POST /generate` sidecar off Vercel, as the onboarding PRD
already planned).

## Remaining increments (planned, in order)

2. Private `agreements` bucket + `lib/esign/storage.ts` (path convention
   `<org_or_person_id>/<document_id>/v<N>.pdf`, signed-URL read helper).
3. `lib/esign` core, pure + vitest: token mint/verify (single-use, expiring,
   hash-at-rest; expired/reused/tampered cases), sha256 helpers, event writer, status
   machine + version-archival rule.
4. Signer flow: public `app/sign/[token]` (proxy `isPublicPath` exemption needed — the
   one out-of-territory edit) + `POST /api/esign/sign` (stamp + audit-cert page via
   @cantoo/pdf-lib, hashes, statuses, timeline activity, token void). Mobile-first.
5. Send path: `POST /api/esign/documents` (upload) + `POST /api/esign/send` + n8n
   workflow "MLE — agreement link sender" (Gmail cred zafHNwGNRYD8V9aq, from
   rob@aivoicetech.io; copy-to-Rob on signed). Email only tonight (SMS Q5b-blocked).
6. `components/esign/DocumentsSection.tsx` on the person record: version list w/ status
   chips, signed-URL view, send/resend wired to the pre-send check popup (remembered
   answers from presend_answers jsonb).
7. If the night allows: `lib/esign/nudges.ts` pure ladder (overdue-watcher pattern; no
   cron wiring tonight).

DoD for the night: migrations live+verified ✅ · core lib tested · E2E signed test
agreement on prod (synthetic, cleaned) · CI green · this log current.
