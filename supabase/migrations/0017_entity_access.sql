-- Q66 inc.1 (2026-07-25): `entity_access` — the grant edge.
-- Design ported (not code-copied) from the 2026-07-25 Macro teardown, 01-architecture.md
-- §4.4 "the single best thing in this repo". Macro is AGPL-3.0; every line below is
-- retyped against the documented SHAPE, and the enforcement point is deliberately
-- INVERTED (see WHERE WE DIVERGE, note 1).
--
-- WHY THIS EXISTS: MLE today has Macro's weakness (service-role everywhere) without
-- their compensating check. `owner_id` / `assigned_to` / `created_by` are free text
-- (0005's own header), RLS is on with zero policies everywhere, and prod serves real
-- names, phones and deal values unauthenticated. Q66 is what Phase 4 / ACCESS (Q64,
-- Q6) sits behind. This migration is the DATA half of it, and only that half.
--
-- SCOPE OF THIS INCREMENT — read this before assuming anything is enforced:
--   * the table, its constraints, its indexes and its revocation triggers exist
--   * NOTHING enforces access yet. No RLS policy on people/orgs/deals reads this table,
--     no API route consults it, no row is granted. It is inert by design.
--   * the policies + the "a non-owner read returns zero rows" test are the NEXT
--     increments of Q66. Do not tick Q66 on this file.
-- An inert grant table cannot lock Rob out of his own dashboard, and it lets the
-- policy increment be reviewed against a schema that already exists.
--
-- THE THREE DESIGN DECISIONS TAKEN VERBATIM FROM MACRO:
--
--   1. THE SUBJECT IS POLYMORPHIC, NOT JUST THE OBJECT. subject_type in
--      (user, team, role) means one table expresses "Rob can edit this", "the sales
--      team can view this" and "every rep can comment on this" with no extra tables and
--      no UNION at write time.
--
--   2. PROVENANCE SOLVES REVOCATION. granted_from_* records WHY a grant exists. The
--      hardest problem in inherited permissions is un-sharing: when a container goes
--      away, which grants go with it? Recording the reason makes a cascade revoke
--      exactly the inherited grants and leave direct ones untouched. Hand-rolled
--      permission systems that skip this leak access forever.
--
--   3. THE TWO PARTIAL UNIQUE INDEXES. Postgres treats NULL as distinct in a unique
--      index, so ONE unique constraint spanning the provenance columns would allow
--      unlimited duplicate DIRECT grants (the NULL-provenance ones). Splitting into
--      WHERE ... IS NOT NULL / WHERE ... IS NULL closes that hole. Subtle, and shipped
--      broken by most people who write this table from scratch.
--
-- WHERE WE DIVERGE FROM MACRO, ON PURPOSE:
--
--   1. ENFORCEMENT POINT. Macro checks in application code, copy-pasted across 10+
--      query files behind a 30-second stale cache (teardown §4.4 / crates/entity_access).
--      A check that lives in call sites is a check somebody forgets. Ours will live in
--      RLS, where a forgotten call site fails closed instead of open. That is the whole
--      reason this item exists.
--   2. PROVENANCE IS POLYMORPHIC, SO IT CANNOT BE AN FK. Macro's granted_from_project_id
--      is a real FK with ON DELETE CASCADE because they only inherit from one container
--      kind. MLE inherits from orgs today and will inherit from deals and channels
--      later, so the column pair is (type, id) and Postgres cannot cascade it for us.
--      We therefore write the cascade OURSELVES as delete triggers below — the same
--      reasoning as 0016's DELETE arm. Without them the FK-less design silently leaks,
--      which is precisely the failure mode decision 2 exists to prevent.
--   3. access_level / entity_type / subject_type are CHECK-constrained text, not
--      Postgres ENUMs — same reasoning as 0015: ALTER TYPE ... ADD VALUE cannot run in
--      a transaction block, a CHECK edit can.
--   4. Nothing is granted to `dashboard_ro` (0011). The read-model role sees views only.
--
-- Additive DDL only. No existing row is read or written by this migration. No money,
-- signed, quoted or paid field is touched.

begin;

-- ---------------------------------------------------------------------------
-- entity_access — one row = one grant
-- ---------------------------------------------------------------------------
create table if not exists entity_access (
  id                        bigserial primary key,

  -- WHAT is being granted. Same closed entity set as 0015's spine, and same
  -- deliberate absence of an FK: one table serves every entity kind, and the
  -- existing paired-nullable-FK tables are not retrofitted.
  entity_type               text not null check (entity_type in (
                              'person','org','deal','activity','task','document','invoice'
                            )),
  entity_id                 text not null check (length(trim(entity_id)) > 0),

  -- WHO it is granted to. Text ids because MLE has no users table yet (Q6/Q64) and
  -- today's owner fields are free text; when real identities land, these become the
  -- profile id without a shape change.
  subject_type              text not null check (subject_type in ('user','team','role')),
  subject_id                text not null check (length(trim(subject_id)) > 0),

  -- HOW MUCH. Ordered ladder; the ordering is expressed once, in code, by
  -- accessLevelAtLeast() in lib/entityAccess.ts and by the SQL helper below.
  access_level              text not null check (access_level in ('view','comment','edit','owner')),

  -- WHY it exists. NULL = a direct grant somebody made by hand. Set = inherited from a
  -- container, and revoked automatically when that container goes away.
  granted_from_entity_type  text check (granted_from_entity_type in (
                              'person','org','deal','activity','task','document','invoice'
                            )),
  granted_from_entity_id    text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Provenance is a pair or it is nothing. A half-set pair would be a grant whose
  -- reason is unrevocable — it would survive the cascade and leak access forever,
  -- which is the exact bug decision 2 exists to prevent.
  constraint entity_access_granted_from_pair check (
    (granted_from_entity_type is null and granted_from_entity_id is null)
    or (granted_from_entity_type is not null
        and granted_from_entity_id is not null
        and length(trim(granted_from_entity_id)) > 0)
  )
);

-- The NULL-duplication hole, closed. Two partial indexes, not one constraint.
create unique index if not exists entity_access_unique_inherited
  on entity_access (entity_type, entity_id, subject_type, subject_id,
                    granted_from_entity_type, granted_from_entity_id)
  where granted_from_entity_id is not null;

create unique index if not exists entity_access_unique_direct
  on entity_access (entity_type, entity_id, subject_type, subject_id)
  where granted_from_entity_id is null;

-- The read a policy actually performs: "what may this subject reach?" Subject-first,
-- because the policy expands the caller into their sources and semi-joins this table —
-- it never scans by entity. (Teardown §4.4: they moved AWAY from a materialized CTE so
-- the planner can pick a direction per arm; a subject-leading index is what lets it.)
create index if not exists entity_access_by_subject
  on entity_access (subject_type, subject_id, entity_type);

-- The inverse read, for the "who has access to this record?" panel and for the audit
-- question "why can they see it?".
create index if not exists entity_access_by_entity
  on entity_access (entity_type, entity_id);

-- The cascade's own lookup. Without it every org delete sequential-scans the grants.
create index if not exists entity_access_by_grantor
  on entity_access (granted_from_entity_type, granted_from_entity_id)
  where granted_from_entity_id is not null;

comment on table entity_access is
  'Q66 grant edge. INERT as of 0017 — no policy or route reads it yet. See lib/entityAccess.ts.';
comment on column entity_access.granted_from_entity_type is
  'Provenance: NULL = direct grant, set = inherited and revoked by the 0017 delete triggers.';

-- ---------------------------------------------------------------------------
-- access_level_rank — the ladder, expressed once in SQL
-- ---------------------------------------------------------------------------
-- A policy has to ask "does this subject have AT LEAST edit?", and text comparison
-- would answer alphabetically ('comment' < 'edit' < 'owner' < 'view' — with 'view',
-- the weakest level, sorting HIGHEST). That silent wrong answer is why the ladder is a
-- function and never an inline comparison. Mirrors ACCESS_LEVELS in lib/entityAccess.ts,
-- and the test suite parses this migration to prove the two orders agree.
create or replace function access_level_rank(level text)
returns integer
language sql
immutable
as $$
  select case level
    when 'view'    then 1
    when 'comment' then 2
    when 'edit'    then 3
    when 'owner'   then 4
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- The cascade we have to write ourselves (divergence 2)
-- ---------------------------------------------------------------------------
-- Two arms, both mandatory:
--   (a) the entity itself is deleted -> its grants are meaningless, drop them. Without
--       this, an id reused later inherits a dead record's ACL.
--   (b) a CONTAINER is deleted -> drop exactly the grants that named it as their reason.
--       Direct grants (provenance NULL) are untouched, which is the entire point of
--       recording provenance.
-- One function serves every table; TG_ARGV[0] carries the entity kind, so no two
-- tables can drift apart in their revocation logic (0016's pattern).
create or replace function revoke_entity_access_on_delete()
returns trigger
language plpgsql
as $$
declare
  ent_type text := TG_ARGV[0];
begin
  delete from entity_access
    where (entity_type = ent_type and entity_id = OLD.id)
       or (granted_from_entity_type = ent_type and granted_from_entity_id = OLD.id);
  return OLD;
end;
$$;

drop trigger if exists revoke_entity_access_people on people;
create trigger revoke_entity_access_people
  after delete on people
  for each row execute function revoke_entity_access_on_delete('person');

drop trigger if exists revoke_entity_access_orgs on orgs;
create trigger revoke_entity_access_orgs
  after delete on orgs
  for each row execute function revoke_entity_access_on_delete('org');

drop trigger if exists revoke_entity_access_deals on deals;
create trigger revoke_entity_access_deals
  after delete on deals
  for each row execute function revoke_entity_access_on_delete('deal');

-- ---------------------------------------------------------------------------
-- RLS, same posture as 0006 / 0015 — mandatory, not optional
-- ---------------------------------------------------------------------------
-- The anon key ships in the client bundle (dev_chat uses it), so a new public table
-- without RLS is anon-readable AND anon-WRITABLE through PostgREST the moment it
-- exists. On an ACL table that is worse than anywhere else: anon-writable grants means
-- anyone can grant themselves owner. Enabling with no policies changes nothing for the
-- app (service-role bypasses RLS) and shuts the anon path.
alter table entity_access enable row level security;

commit;

-- ---------------------------------------------------------------------------
-- Reconcile / audit queries (run by hand; both must return zero rows)
-- ---------------------------------------------------------------------------
-- 1. Inherited grants whose container no longer exists = a cascade that did not fire.
--    (Only the kinds with triggers are checked; add an arm when a kind gains one.)
-- select ea.* from entity_access ea
--   where ea.granted_from_entity_type = 'org'
--     and not exists (select 1 from orgs o where o.id = ea.granted_from_entity_id);
--
-- 2. Grants pointing at a person/org/deal that no longer exists.
-- select ea.* from entity_access ea
--   where ea.entity_type = 'person'
--     and not exists (select 1 from people p where p.id = ea.entity_id);
