-- Task 2.1 (PRD Phase 2 / BUILD-QUEUE Q9): CRM core — deals, activities, tasks.
-- Shape per D-002 target ERD (docs/plans/sources/DATA-MODEL-crm-erd-2026-07-17.md).
-- Named 0005 (PRD's "0002_crm_core" predates 0002_node_type_taxonomy + 0004_flags).
-- Additive DDL only — zero existing rows touched. Backfill from people money
-- fields (D-002 migration-path steps 7-9) is a separate script, NOT this file.
--
-- Deliberate deviations from the ERD, all dated 2026-07-22:
-- * owner_id / created_by / assigned_to are free TEXT, not FK→profiles —
--   profiles doesn't exist until Phase 4 ACCESS (Q6, on hold). D-002 step 9
--   explicitly plans this: "free-text fallback until profiles/RLS ship".
-- * transcript linkage is transcript_url TEXT (matches people convention) —
--   transcripts/embeddings tables are Task 7.4 scope, FK lands with them.
-- * deals.stage check follows the Task 1.6 DRAFT list (pre + post signature).
--   Task 1.6 is NOT yet Rob-approved; widening/renaming is one cheap
--   ALTER ... DROP CONSTRAINT + ADD CONSTRAINT when he locks it.

begin;

create table if not exists deals (
  id text primary key,
  -- D-002: a deal has a contact AND/OR an org; at least one anchor required.
  person_id text references people(id) on delete set null,
  org_id text references orgs(id) on delete set null,
  vertical_id text references verticals(id),
  owner_id text,          -- free text until profiles (Phase 4); D-002 step 9
  name text not null,
  stage text not null default 'new_lead' check (stage in
    ('new_lead','contacted','meeting_booked','meeting_held','quote_sent',
     'negotiating','signed','invoiced','paid','delivering','stalled','lost')),
  value numeric,          -- what closing is worth (backfill: people.quoted_amount)
  routing_lane text check (routing_lane in ('auto_close','rep','bounty_hunter','booker')),
  referral_sourced boolean not null default false,
  key_dates jsonb not null default '{}'::jsonb,  -- quoted/signed/invoiced/paid stamps
  estimate jsonb,         -- carried short-term per D-002 step 10; scoring supersedes
  book_protected boolean not null default false, -- sales_agent book (RLS sketch §5)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(person_id, org_id) >= 1)
);

create table if not exists activities (
  id text primary key,
  -- Twenty pattern (D-002): paired nullable FKs, at most one of person/org,
  -- and at least one anchor overall (deal-only rows are legal).
  person_id text references people(id) on delete cascade,
  org_id text references orgs(id) on delete cascade,
  deal_id text references deals(id) on delete cascade,
  created_by text,        -- free text until profiles (Phase 4)
  type text not null check (type in ('call','email','meeting','note','status_change')),
  source text not null default 'manual' check (source in ('manual','n8n','api','aidre','dialer')),
  source_context jsonb not null default '{}'::jsonb, -- Task 1.15 differentiator
  summary text,
  action_items jsonb,
  buying_signals jsonb,
  recording_url text,
  transcript_url text,    -- becomes FK when transcripts table lands (Task 7.4)
  book_protected boolean not null default false,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (num_nonnulls(person_id, org_id) <= 1),
  check (num_nonnulls(person_id, org_id, deal_id) >= 1)
);

create table if not exists tasks (
  id text primary key,
  activity_id text references activities(id) on delete set null,
  deal_id text references deals(id) on delete set null,
  person_id text references people(id) on delete cascade,
  assigned_to text,       -- free text until profiles (Phase 4)
  title text not null,
  detail text,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  due_date date,
  book_protected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deals_person_idx on deals (person_id);
create index if not exists deals_org_idx on deals (org_id);
create index if not exists deals_stage_idx on deals (stage);
create index if not exists deals_owner_idx on deals (owner_id);
create index if not exists activities_person_idx on activities (person_id);
create index if not exists activities_org_idx on activities (org_id);
create index if not exists activities_deal_idx on activities (deal_id);
create index if not exists activities_occurred_idx on activities (occurred_at desc);
create index if not exists tasks_deal_idx on tasks (deal_id);
create index if not exists tasks_status_due_idx on tasks (status, due_date);

-- Service-role key bypasses RLS (all app access is server-side); enabling with
-- no policies blocks any anon/publishable-key path outright — same as flags.
alter table deals enable row level security;
alter table activities enable row level security;
alter table tasks enable row level security;

commit;
