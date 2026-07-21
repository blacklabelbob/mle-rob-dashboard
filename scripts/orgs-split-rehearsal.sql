-- Task 2.0 transactional rehearsal of supabase/migrations/0003_orgs_split.sql
-- Runs the FULL migration body against LIVE prod data inside one DO block that
-- always ends in RAISE EXCEPTION → Postgres rolls back the entire statement.
-- Zero persistence, real data — unlike a Supabase branch (branches get schema
-- only, no prod rows, so they cannot exercise the data path or the gates).
--
-- Run via Supabase MCP execute_sql or psql. Expected outcome: ERROR P0001 whose
-- message starts REHEARSAL_ROLLBACK| and carries the gates:
--   recon_ok=t                      people_before = people_after + orgs (and company==orgs)
--   edge_constraint_violations=0/0  every edge has exactly one from / one to
--   fields_ok=t                     per-column carry counts match pre vs post (data-loss gate)
-- Any other error = the migration itself failed; fix 0003 and re-rehearse.
--
-- 2026-07-21 runs:
--   #1 caught 23502: 0003 nulled edges.from_id/to_id BEFORE dropping NOT NULL → 0003 reordered.
--   #2 PASS: before=32 (16 company + 16 person) → after=16 people + 16 orgs, edges 47
--      (1 from_org + 32 to_org), violations 0/0, fields_ok=t. Prod verified untouched after.
--
-- ⚠️ KEEP THE BODY IN SYNC WITH 0003 — this file embeds the migration body
-- verbatim (minus begin/commit). If 0003 changes, re-paste the body here.

DO $mig$
declare
  people_before int; company_before int; person_before int;
  people_after int; orgs_total int;
  edges_total int; edges_from_org int; edges_to_org int;
  chk_from int; chk_to int;
  pre jsonb; post jsonb;
begin
  select count(*),
         count(*) filter (where entity_kind = 'company'),
         count(*) filter (where entity_kind is distinct from 'company')
    into people_before, company_before, person_before
    from people;

  select jsonb_build_object(
    'referred_by', count(referred_by_id),
    'relationship', count(relationship),
    'estimate', count(estimate),
    'phase_one_in_progress', count(*) filter (where phase_one = 'in-progress'),
    'est_ttp', count(est_time_to_payment_days),
    'quoted', count(quoted_amount),
    'signed_true', count(*) filter (where signed),
    'meeting_url', count(meeting_video_url),
    'transcript_url', count(transcript_url),
    'notes', count(notes),
    'role', count(role),
    'business', count(business)
  ) into pre from people where entity_kind = 'company';

  -- ==== 0003_orgs_split.sql body, verbatim minus begin/commit ====
  create table if not exists orgs (
    id text primary key,
    name text not null,
    business text,
    role text,
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

  update orgs o set referred_by_org_id = o.referred_by_id, referred_by_id = null
    where exists (select 1 from orgs x where x.id = o.referred_by_id);

  alter table edges add column if not exists from_org_id text references orgs(id);
  alter table edges add column if not exists to_org_id text references orgs(id);
  alter table edges alter column from_id drop not null;
  alter table edges alter column to_id drop not null;
  update edges e set from_org_id = e.from_id, from_id = null
    where exists (select 1 from orgs o where o.id = e.from_id);
  update edges e set to_org_id = e.to_id, to_id = null
    where exists (select 1 from orgs o where o.id = e.to_id);
  alter table edges add constraint edges_from_one check (num_nonnulls(from_id, from_org_id) = 1);
  alter table edges add constraint edges_to_one check (num_nonnulls(to_id, to_org_id) = 1);

  alter table people add column if not exists org_id text references orgs(id);
  alter table people add column if not exists referred_by_org_id text references orgs(id);
  update people p set referred_by_org_id = p.referred_by_id, referred_by_id = null
    where exists (select 1 from orgs o where o.id = p.referred_by_id);

  delete from people where entity_kind = 'company';
  -- ==== end migration body ====

  select count(*) into people_after from people;
  select count(*) into orgs_total from orgs;
  select count(*), count(from_org_id), count(to_org_id)
    into edges_total, edges_from_org, edges_to_org from edges;
  select count(*) filter (where num_nonnulls(from_id, from_org_id) <> 1),
         count(*) filter (where num_nonnulls(to_id, to_org_id) <> 1)
    into chk_from, chk_to from edges;

  select jsonb_build_object(
    'referred_by', count(referred_by_id) + count(referred_by_org_id),
    'relationship', count(relationship),
    'estimate', count(estimate),
    'phase_one_in_progress', count(*) filter (where phase_one = 'in-progress'),
    'est_ttp', count(est_time_to_payment_days),
    'quoted', count(quoted_amount),
    'signed_true', count(*) filter (where signed),
    'meeting_url', count(meeting_video_url),
    'transcript_url', count(transcript_url),
    'notes', count(notes),
    'role', count(role),
    'business', count(business)
  ) into post from orgs;

  raise exception 'REHEARSAL_ROLLBACK|before=%|company=%|person=%|after=%|orgs=%|recon_ok=%|edges_total=%|from_org=%|to_org=%|edge_constraint_violations=%/%|pre=%|post=%|fields_ok=%',
    people_before, company_before, person_before, people_after, orgs_total,
    (people_before = people_after + orgs_total and company_before = orgs_total and person_before = people_after),
    edges_total, edges_from_org, edges_to_org, chk_from, chk_to, pre, post, (pre = post);
end $mig$;
