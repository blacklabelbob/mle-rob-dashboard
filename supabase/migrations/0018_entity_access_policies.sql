-- Q66 inc.2 (2026-07-25): the ENFORCEMENT half — RLS policies that read 0017's grant
-- edge. This is the divergence 0017's header promised: Macro checks access in
-- application code copy-pasted across 10+ query files behind a 30-second stale cache;
-- we put the same check in RLS, where a forgotten call site fails CLOSED.
--
-- ============================================================================
-- WHY THIS CANNOT LOCK ROB OUT — read before assuming it is dangerous
-- ============================================================================
-- people / deals (0001) and orgs (0006) ALREADY have RLS enabled with ZERO policies.
-- Under Postgres, RLS-on + no-policy = "deny everything" for every non-bypassing role.
-- So the anon/authenticated path already returns zero rows today. A permissive SELECT
-- policy can only ever WIDEN that: from "nothing, always" to "exactly the rows this
-- caller was granted". There are zero grants on prod, so the observable behaviour after
-- this migration is byte-identical to before it — the difference is that a grant now
-- MEANS something, which is what Phase 4 / ACCESS (Q64, Q6) needs.
--
-- The dashboard itself is unaffected for a second, independent reason: every server
-- route uses the service role, which bypasses RLS entirely. Prod's open-read posture is
-- Rob's 7/21 call and this migration does not touch it. Closing that is Q64, and Q64 is
-- HIS decision, not this file's.
--
-- ============================================================================
-- SCOPE — what this increment does and does not do
-- ============================================================================
--   * DOES: subject expansion from the JWT, a SECURITY DEFINER access predicate, and
--     SELECT policies on people / orgs / deals + a self-service policy on entity_access.
--   * DOES NOT: write any grant, create any user, change any route, or alter the
--     service-role path. Still zero grants on prod after this runs.
--   * WRITE policies (insert/update/delete) are deliberately NOT created here. Writes
--     stay service-role-only, exactly as today; adding write policies before real
--     identities exist (Q6) would be inventing an authorship model Rob has not decided.
--     RLS-on + no write policy = writes denied for non-bypassing roles, which is the
--     posture we already have.
--
-- Additive DDL only. No existing row is read or written. No money, signed, quoted or
-- paid field is touched. STORAGE_SOURCE untouched.

begin;

-- ---------------------------------------------------------------------------
-- current_access_subjects — the caller, expanded into grantable subjects
-- ---------------------------------------------------------------------------
-- The SQL mirror of expandSubjects() in lib/entityAccess.ts. Macro's good idea, taken:
-- membership is read at QUERY time, so joining a team widens what you can see with no
-- permission backfill.
--
-- Deliberately reads `request.jwt.claims` rather than auth.uid(): auth.uid() is a thin
-- wrapper over the same claim, and going direct means this function has no dependency
-- on the auth schema and can be exercised in a plain transaction by setting the GUC —
-- which is exactly how the "non-owner read returns zero rows" proof is run.
--
-- FAILS CLOSED BY CONSTRUCTION: no JWT -> current_setting(..., true) returns NULL ->
-- nullif/cast yields NULL -> every arm's WHERE is unsatisfied -> zero subjects -> the
-- predicate below can only be false. Supabase Auth is not live yet (Q6), so TODAY this
-- returns zero rows for every caller, and that is the correct answer.
create or replace function current_access_subjects()
returns table (subject_type text, subject_id text)
language sql
stable
as $$
  with claims as (
    select nullif(current_setting('request.jwt.claims', true), '')::jsonb as c
  ),
  meta as (
    select c, coalesce(c -> 'app_metadata', '{}'::jsonb) as m from claims
  )
  -- the user themself
  select 'user'::text, btrim(m.c ->> 'sub')
    from meta m
   where btrim(coalesce(m.c ->> 'sub', '')) <> ''

  union all

  -- teams, from app_metadata.mle_teams. jsonb_typeof guard first: a caller who sets
  -- mle_teams to a string or an object must yield NO teams, not an error that takes
  -- the whole query down (an erroring predicate on a SELECT policy is a denial of
  -- service against every row).
  select 'team'::text, btrim(t)
    from meta m
    cross join lateral jsonb_array_elements_text(m.m -> 'mle_teams') as t
   where jsonb_typeof(m.m -> 'mle_teams') = 'array'
     and btrim(t) <> ''

  union all

  -- roles, same shape and same guard
  select 'role'::text, btrim(r)
    from meta m
    cross join lateral jsonb_array_elements_text(m.m -> 'mle_roles') as r
   where jsonb_typeof(m.m -> 'mle_roles') = 'array'
     and btrim(r) <> '';
$$;

comment on function current_access_subjects() is
  'Q66 inc.2. Caller -> grantable subjects, from request.jwt.claims. Mirrors expandSubjects() in lib/entityAccess.ts. No JWT = zero subjects = no access.';

-- ---------------------------------------------------------------------------
-- has_entity_access — the predicate every policy calls
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER on purpose: the policies below live on people/orgs/deals, and the
-- check has to read `entity_access`, which is itself RLS-protected. Without DEFINER the
-- predicate would recurse into that table's own policy and evaluate to false for
-- everyone — a permission system that silently denies everything. search_path is pinned
-- to public so a caller cannot shadow `entity_access` with a temp table of their own
-- grants; that is the standard DEFINER escalation and it is closed here, not later.
--
-- THE BUG THIS PINS (0017's header, restated because it lives HERE now): the required
-- level is ranked, never string-compared. `'view' >= 'owner'` is TRUE in text collation,
-- so a raw `>=` would grant a viewer everything. And an UNRECOGNISED required level
-- ranks 0; without the `> 0` guard, `rank(held) >= 0` is true for every row, so a typo
-- in a future policy ('read' instead of 'view') would open the table completely. The
-- guard turns that typo into a denial instead of a breach.
create or replace function has_entity_access(
  p_entity_type text,
  p_entity_id text,
  p_required_level text default 'view'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select access_level_rank(p_required_level) > 0
     and exists (
       select 1
         from entity_access ea
         join current_access_subjects() s
           on s.subject_type = ea.subject_type
          and s.subject_id = ea.subject_id
        where ea.entity_type = p_entity_type
          and ea.entity_id = p_entity_id
          and access_level_rank(ea.access_level)
              >= access_level_rank(p_required_level)
     );
$$;

comment on function has_entity_access(text, text, text) is
  'Q66 inc.2. The RLS predicate. SECURITY DEFINER so it can read the RLS-protected grant table; unknown required level ranks 0 and denies.';

-- Callable by the roles that are actually subject to RLS. Service role never needs it
-- (it bypasses RLS), and dashboard_ro (0011) sees views only.
grant execute on function current_access_subjects() to anon, authenticated;
grant execute on function has_entity_access(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The policies
-- ---------------------------------------------------------------------------
-- SELECT only, one per entity kind, all named *_select_granted so a future audit can
-- find them by pattern. `for select` + `using` — no `with check`, because no write
-- policy is being created (see SCOPE).
drop policy if exists people_select_granted on people;
create policy people_select_granted on people
  for select
  using (has_entity_access('person', id, 'view'));

drop policy if exists orgs_select_granted on orgs;
create policy orgs_select_granted on orgs
  for select
  using (has_entity_access('org', id, 'view'));

drop policy if exists deals_select_granted on deals;
create policy deals_select_granted on deals
  for select
  using (has_entity_access('deal', id, 'view'));

-- The ACL's own read policy. Two arms, and the second one is the point: you can see a
-- grant if it is ADDRESSED to you (so a rep can answer "why can I see this?"), or if
-- you hold OWNER on the entity it concerns (so an owner can audit who else has access).
-- Note this policy is NOT what has_entity_access() sees — that function is DEFINER and
-- bypasses this deliberately. This governs a client reading the table directly.
drop policy if exists entity_access_select_own on entity_access;
create policy entity_access_select_own on entity_access
  for select
  using (
    exists (
      select 1 from current_access_subjects() s
       where s.subject_type = entity_access.subject_type
         and s.subject_id = entity_access.subject_id
    )
    or has_entity_access(entity_access.entity_type, entity_access.entity_id, 'owner')
  );

comment on table entity_access is
  'Q66 grant edge. ENFORCING as of 0018 — people/orgs/deals SELECT policies read it. Zero grants on prod. See lib/entityAccess.ts.';

commit;

-- ---------------------------------------------------------------------------
-- The DoD proof, run by hand in an ABORTED transaction (never committed)
-- ---------------------------------------------------------------------------
-- "a non-owner read returns zero rows". Run as `authenticated`, because service_role
-- bypasses RLS and would prove nothing.
--
-- begin;
--   insert into people (id, name, status) values ('probe-q66', 'Probe Q66', 'unlit');
--   insert into entity_access (entity_type, entity_id, subject_type, subject_id, access_level)
--     values ('person', 'probe-q66', 'user', 'owner-sub', 'view');
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"stranger-sub"}';
--   select count(*) from people where id = 'probe-q66';   -- expect 0  <- the DoD
--   set local request.jwt.claims = '{"sub":"owner-sub"}';
--   select count(*) from people where id = 'probe-q66';   -- expect 1
--   set local request.jwt.claims = '';
--   select count(*) from people where id = 'probe-q66';   -- expect 0  (no JWT = closed)
-- rollback;
