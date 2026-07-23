-- Q47 amendment (Rob directive 2026-07-23, ~/.claude/rules/ai-voice-legality.md
-- "Consent capture at every intake surface"):
-- 1. signature_events gains type 'comms_consent' — the PEWC-grade optional
--    consent to AI/automated calls+texts captured on the signer page, recorded
--    with IP/timestamp/language-version in meta (proof retention).
-- 2. people.comms_consent jsonb — person-level consent state so any surface
--    can check "on file?" before re-asking (null = never granted; shape:
--    { grantedAt, phone, languageVersion, requestId, ip, source }).
-- 3. signature_requests.signer_type — the business|consumer seam (consumer =
--    §7001(c) disclosure flow per the incoming ESIGN-CONSUMER-DISCLOSURE-SPEC;
--    business = tonight's flow). Default 'business'.
-- Additive / constraint-swap only — zero rows touched.

begin;

alter table signature_events drop constraint signature_events_type_check;
alter table signature_events add constraint signature_events_type_check check (type in
  ('created','sent','resent','viewed','consent','signed','voided','nudge','copy_delivered','comms_consent'));

alter table people add column if not exists comms_consent jsonb;

alter table signature_requests add column if not exists signer_type text not null
  default 'business' check (signer_type in ('business','consumer'));

commit;
