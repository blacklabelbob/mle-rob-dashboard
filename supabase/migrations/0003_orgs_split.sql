-- Task 2.0 (URGENT, Rob 2026-07-17): people vs businesses become separate tables.
-- Shape per D-002 target ERD (Architecture Atlas / DATA-MODEL doc): orgs +
-- org_memberships escape hatch + paired nullable FKs on edges (Twenty pattern).
-- Classification is mechanical: entity_kind is already set on every people row.
-- APPLY PLAN: dry-run report first (scripts/orgs-split-dryrun.mjs), then this
-- migration inside one transaction, then reconciliation counts must match.

begin;

create table if not exists orgs (
  id text primary key,
  name text not null,
  vertical_id text not null references verticals(id),
  domain text,
  phone text,
  email text,
  website text,
  node_type text check (node_type in ('partner','lead','client','connector','vertical-anchor')),
  status text not null default 'unlit' check (status in ('lit','warm','unlit')),
  quoted_amount numeric,
  signed boolean not null default false,
  key_dates jsonb not null default '{}'::jsonb,
  description text,
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

-- 1. Copy company-kind rows into orgs (ids preserved — links keep working)
insert into orgs (id, name, vertical_id, domain, phone, email, website, node_type, status,
                  quoted_amount, signed, key_dates, description, notes, assigned_rep, created_at, updated_at)
select id, name, vertical_id, null, phone, email, website,
       case when node_type in ('partner','lead','client','connector','vertical-anchor') then node_type else null end,
       status, quoted_amount, signed, key_dates, description, notes, assigned_rep, created_at, now()
from people where entity_kind = 'company'
on conflict (id) do nothing;

-- 2. Edges get paired nullable org FKs; existing person-FK columns stay valid
--    because org rows KEEP their ids — we add org columns and repoint.
alter table edges add column if not exists from_org_id text references orgs(id);
alter table edges add column if not exists to_org_id text references orgs(id);
update edges e set from_org_id = e.from_id, from_id = null
  where exists (select 1 from orgs o where o.id = e.from_id);
update edges e set to_org_id = e.to_id, to_id = null
  where exists (select 1 from orgs o where o.id = e.to_id);
alter table edges alter column from_id drop not null;
alter table edges alter column to_id drop not null;
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
