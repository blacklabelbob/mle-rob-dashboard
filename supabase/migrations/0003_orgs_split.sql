-- Task 2.0 (URGENT, Rob 2026-07-17): people vs businesses become separate tables.
-- Shape per D-002 target ERD (Architecture Atlas / DATA-MODEL doc): orgs +
-- org_memberships escape hatch + paired nullable FKs on edges (Twenty pattern).
-- Classification is mechanical: entity_kind is already set on every people row.
-- APPLY PLAN: dry-run report first (scripts/orgs-split-dryrun.mjs), then this
-- migration inside one transaction, then reconciliation counts must match.

begin;

-- Column set mirrors people (minus entity_kind/org_id) — 2026-07-21 amendment:
-- the original draft dropped referred_by/relationship/estimate/phase_one/role/
-- business/meeting urls, but ALL 17 live company rows carry referred_by_id and
-- most carry relationship/estimate (4 are phase_one in-progress). Verbatim
-- carry = zero data loss; pruning person-only columns is a later Rob call.
create table if not exists orgs (
  id text primary key,
  name text not null,
  business text,         -- carried over: often the legal name (e.g. "MFS Naples, Inc.")
  role text,             -- carried over: used as the company descriptor line in the UI
  vertical_id text not null references verticals(id),
  domain text,
  phone text,
  email text,
  website text,
  node_type text check (node_type in ('partner','lead','client','connector','vertical-anchor')),
  status text not null default 'unlit' check (status in ('lit','warm','unlit')),
  referred_by_id text references people(id),
  referred_by_org_id text references orgs(id),
  relationship text,
  quoted_amount numeric,
  signed boolean not null default false,
  meeting_video_url text,
  transcript_url text,
  key_dates jsonb not null default '{}'::jsonb,
  phase_one text not null default 'not-started' check (phase_one in ('not-started','in-progress','complete')),
  est_time_to_payment_days integer,
  description text,
  estimate jsonb,
  notes text,
  assigned_rep text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists org_memberships (
  id bigint generated always as identity primary key,
  person_id text not null references people(id) on delete cascade,
  org_id text not null references orgs(id) on delete cascade,
  is_primary boolean not null default false,
  role_at_org text,
  unique (person_id, org_id)
);

-- 1. Copy company-kind rows into orgs (ids preserved — links keep working).
--    referred_by_id FK to people is valid here: referrer rows (person OR
--    company) are all still in people at insert time; org-referrers are
--    repointed in step 1b before the company rows are deleted in step 5.
insert into orgs (id, name, business, role, vertical_id, domain, phone, email, website,
                  node_type, status, referred_by_id, relationship, quoted_amount, signed,
                  meeting_video_url, transcript_url, key_dates, phase_one,
                  est_time_to_payment_days, description,
                  estimate, notes, assigned_rep, created_at, updated_at)
select id, name, business, role, vertical_id, null, phone, email, website,
       case when node_type in ('partner','lead','client','connector','vertical-anchor') then node_type else null end,
       status, referred_by_id, relationship, quoted_amount, signed,
       meeting_video_url, transcript_url, key_dates, phase_one,
       est_time_to_payment_days, description,
       estimate, notes, assigned_rep, created_at, now()
from people where entity_kind = 'company'
on conflict (id) do nothing;

-- 1b. Org referred-by-an-org: move the pointer to the paired org column
--     (mirrors step 4 for people) so referred_by_id only ever names a person.
update orgs o set referred_by_org_id = o.referred_by_id, referred_by_id = null
  where exists (select 1 from orgs x where x.id = o.referred_by_id);

-- 2. Edges get paired nullable org FKs; existing person-FK columns stay valid
--    because org rows KEEP their ids — we add org columns and repoint.
alter table edges add column if not exists from_org_id text references orgs(id);
alter table edges add column if not exists to_org_id text references orgs(id);
-- drop not null BEFORE the repoint updates set from_id/to_id to null
-- (2026-07-21 transactional rehearsal on prod caught the original order failing 23502)
alter table edges alter column from_id drop not null;
alter table edges alter column to_id drop not null;
update edges e set from_org_id = e.from_id, from_id = null
  where exists (select 1 from orgs o where o.id = e.from_id);
update edges e set to_org_id = e.to_id, to_id = null
  where exists (select 1 from orgs o where o.id = e.to_id);
alter table edges add constraint edges_from_one check (num_nonnulls(from_id, from_org_id) = 1);
alter table edges add constraint edges_to_one check (num_nonnulls(to_id, to_org_id) = 1);

-- 3. People gain org_id; person→their company via referred_by/business-name match
alter table people add column if not exists org_id text references orgs(id);

-- 4. referred_by pointers at now-org rows move to a new column
alter table people add column if not exists referred_by_org_id text references orgs(id);
update people p set referred_by_org_id = p.referred_by_id, referred_by_id = null
  where exists (select 1 from orgs o where o.id = p.referred_by_id);

-- 5. Remove company rows from people (AFTER edges + referrals repointed)
delete from people where entity_kind = 'company';

-- 6. Reconciliation gate: counts must satisfy people_before = people_after + orgs_total
--    (checked by the dry-run script output vs post-apply query; abort = rollback)

commit;
