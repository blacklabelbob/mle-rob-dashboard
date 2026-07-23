-- Q47 (e-sign agreement flow, BUILD-QUEUE line 219): documents +
-- signature_requests + append-only signature_events.
-- Design sources: docs/research/esign-mit-scout-2026-07-23.md (4 ESIGN
-- elements; hash discipline; audit-trail expectations) and
-- docs/plans/esign-flow-walkthrough-2026-07-23.html (status ladder,
-- resend/versioning, nudge ladder).
-- Additive DDL only — zero existing rows touched.
--
-- Shape notes, dated 2026-07-23:
-- * documents anchors mirror activities (0005): paired nullable person/org
--   FKs, at most one of the pair, at least one anchor overall (deal-only
--   documents are legal). Agreements carry their Phase per Rob (`phase`).
-- * signature_requests stores the token HASH only (sha256 hex) — the raw
--   single-use token exists nowhere at rest. presend_answers jsonb is the
--   "remembered answers" store for one-click resend.
-- * signature_events is APPEND-ONLY. RLS-with-no-policies blocks any
--   anon-key path (house style, 0005/0006), but the service-role key
--   bypasses RLS — so append-only is enforced by a trigger that rejects
--   UPDATE/DELETE outright. FK is RESTRICT (not cascade) on purpose: an
--   audit chain must survive its request row.
-- * owner/created_by stay free text until Phase 4 profiles (0005 precedent).

begin;

create table if not exists documents (
  id text primary key,
  person_id text references people(id) on delete cascade,
  org_id text references orgs(id) on delete cascade,
  deal_id text references deals(id) on delete set null,
  title text not null,
  phase text not null default 'phase-1',        -- agreements carry their Phase
  storage_path text not null,                   -- agreements bucket object key
  sha256_at_upload text not null,               -- hex digest of the uploaded PDF
  sha256_signed text,                           -- hex digest of the final signed PDF
  signed_path text,                             -- storage key of the signed copy
  version integer not null default 1,
  status text not null default 'draft' check (status in
    ('draft','sent','viewed','signed','voided','archived')),
  supersedes_id text references documents(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(person_id, org_id) <= 1),
  check (num_nonnulls(person_id, org_id, deal_id) >= 1)
);

create table if not exists signature_requests (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  token_hash text not null unique,              -- sha256 hex of the single-use token
  expires_at timestamptz not null,
  channel text not null default 'email' check (channel in ('email','sms','both')),
  sent_to text not null,                        -- address the link was delivered to
  signer_name text,
  signer_email text,
  signer_ip text,
  signer_user_agent text,
  consent_at timestamptz,                       -- ESIGN element 2 (checkbox instant)
  viewed_at timestamptz,
  signed_at timestamptz,
  voided_at timestamptz,
  sha256_at_sign text,                          -- doc digest re-computed at sign time
  presend_answers jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in
    ('pending','viewed','signed','voided','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists signature_events (
  id bigint generated always as identity primary key,
  request_id text not null references signature_requests(id),
  type text not null check (type in
    ('created','sent','resent','viewed','consent','signed','voided','nudge','copy_delivered')),
  at timestamptz not null default now(),
  ip text,
  meta jsonb not null default '{}'::jsonb
);

-- Append-only, enforced in the database (service role included): the audit
-- chain that wins the court fight must be structurally unfalsifiable.
create or replace function signature_events_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'signature_events is append-only (no % allowed)', tg_op;
end $$;

drop trigger if exists signature_events_no_update on signature_events;
create trigger signature_events_no_update
  before update or delete on signature_events
  for each row execute function signature_events_append_only();

create index if not exists documents_person_idx on documents (person_id);
create index if not exists documents_org_idx on documents (org_id);
create index if not exists documents_deal_idx on documents (deal_id);
create index if not exists documents_status_idx on documents (status);
create index if not exists sig_requests_document_idx on signature_requests (document_id);
create index if not exists sig_requests_status_idx on signature_requests (status);
create index if not exists sig_events_request_idx on signature_events (request_id);
create index if not exists sig_events_at_idx on signature_events (at desc);

-- House style (0005/0006): RLS on, no policies — service-role-only access;
-- any anon/publishable-key path is blocked outright.
alter table documents enable row level security;
alter table signature_requests enable row level security;
alter table signature_events enable row level security;

commit;
