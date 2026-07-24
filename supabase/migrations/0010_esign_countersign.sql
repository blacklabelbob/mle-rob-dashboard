-- Q47 countersign leg (walkthrough step 5, "MLE side": the MLE representative
-- countersigns from inside the CRM — same signature box, same auto-date; both
-- signatures are stamped onto the signature block by the server).
--
-- DESIGN DECISION (recorded here because it is load-bearing): document.status
-- stays TERMINAL at 'signed'. Countersignature does NOT become a sixth status.
-- Reasons: (a) 'signed' means "the counterparty is bound", which is true the
-- instant they sign and must never be walked back by an internal step; (b) the
-- status ladder is already blessed as immutable-after-signed (status.ts), and
-- widening it would re-open the archiveOnNewVersion / transition invariants a
-- critic pass already certified. Countersignature is therefore recorded as
-- FACTS on the document (who, when, which file, which digest) plus one
-- append-only audit event on the signer's request, so the certificate chain
-- reads created→sent→viewed→consent→signed→countersigned→copy_delivered.
-- UI derives "signed · awaiting countersignature" from countersigned_at IS NULL.
--
-- Additive only: five nullable columns + one constraint swap. Zero rows touched.

begin;

alter table documents add column if not exists countersigned_at timestamptz;
alter table documents add column if not exists countersigner_name text;
alter table documents add column if not exists countersigner_title text;
alter table documents add column if not exists countersigner_email text;
-- Stamped-by-both-parties copy: its own key + its own digest, so the
-- signer-only copy (signed_path/sha256_signed) stays byte-verifiable forever.
alter table documents add column if not exists countersigned_path text;
alter table documents add column if not exists sha256_countersigned text;

alter table signature_events drop constraint signature_events_type_check;
alter table signature_events add constraint signature_events_type_check check (type in
  ('created','sent','resent','viewed','consent','signed','voided','nudge','copy_delivered','comms_consent','countersigned'));

commit;
