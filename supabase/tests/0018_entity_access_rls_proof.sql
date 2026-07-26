-- Q66 inc.2 — the live proof for 0018's RLS policies.
--
-- WHY THIS FILE EXISTS SEPARATELY FROM THE VITEST SUITE: the DoD clause is "a non-owner
-- read returns zero rows", and that is a fact about a running Postgres with RLS on. No
-- unit test can assert it — vitest has no database, and a mocked one would be asserting
-- our own mock rather than Postgres's row-security machinery. The static half (policy
-- shape, ladder parity, fail-closed guards) IS in vitest, at
-- lib/__tests__/entityAccessPolicies.test.ts. This file is the other half, checked in so
-- the proof is repeatable by paste rather than remembered from a transcript.
--
-- SAFETY — every property that makes this safe to run against prod:
--   * the whole thing is one transaction that ends in ROLLBACK. Nothing is committed.
--   * the only row it writes is a person it invents ('probe-q66-0018') and a grant on
--     that invented person. No real record is written, and nothing is deleted.
--   * it never touches a money, signed, quoted or paid field.
--   * service_role bypasses RLS, so steps 1-6 deliberately switch role first; step 7
--     switches back to prove the dashboard's own path is unaffected.
--
-- HOW TO READ IT: every step's expected value is in its own label. Step 7 expects the
-- real people count PLUS ONE, because the probe's person is still visible inside the
-- open transaction.
--
-- Last run: 2026-07-25 against prod (fjebwaxgoxixwxmxmfxr) — 0 / 1 / 0 / 0 / 0 / 0 / 23
-- with 22 real people. Rolled back; 22 people, 0 probe rows, 0 grants afterwards.

begin;

create temp table q66_probe(step text, cnt bigint) on commit drop;

insert into people (id, name, vertical_id, status)
  select 'probe-q66-0018', 'Probe Q66 0018', v.id, 'unlit' from verticals v limit 1;

insert into entity_access (entity_type, entity_id, subject_type, subject_id, access_level)
  values ('person', 'probe-q66-0018', 'user', 'owner-sub', 'view');

do $$
declare n bigint;
begin
  -- 1. THE DoD ITSELF: a non-owner read returns zero rows.
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"stranger-sub"}', true);
  select count(*) into n from people where id = 'probe-q66-0018';
  perform set_config('role','none', true);
  insert into q66_probe values ('1_stranger_expect_0', n);

  -- 2. the grantee DOES see it. Without this arm, step 1 proves nothing: a policy that
  --    denies everybody would also return zero.
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"owner-sub"}', true);
  select count(*) into n from people where id = 'probe-q66-0018';
  perform set_config('role','none', true);
  insert into q66_probe values ('2_grantee_expect_1', n);

  -- 3. no JWT at all = closed. This is the shape of today's real anon caller.
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from people where id = 'probe-q66-0018';
  perform set_config('role','none', true);
  insert into q66_probe values ('3_no_jwt_expect_0', n);

  -- 4. the anon key's blast radius across the WHOLE table, not just the probe row.
  --    The anon key ships in the client bundle, so this is the number that matters.
  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from people;
  perform set_config('role','none', true);
  insert into q66_probe values ('4_anon_all_people_expect_0', n);

  -- 5. THE LADDER BUG, LIVE: a VIEW grant must not satisfy an OWNER requirement.
  --    'view' >= 'owner' is TRUE in text collation; if the predicate ever stopped
  --    ranking, this step is what turns that into a visible failure.
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"owner-sub"}', true);
  select count(*) into n
    from (select has_entity_access('person','probe-q66-0018','owner') as ok) x
   where x.ok;
  perform set_config('role','none', true);
  insert into q66_probe values ('5_view_grant_meets_owner_expect_0', n);

  -- 6. an unrecognised required level denies instead of opening. A future policy typo
  --    ('read' for 'view') must lock down, not expose the table.
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"owner-sub"}', true);
  select count(*) into n
    from (select has_entity_access('person','probe-q66-0018','read') as ok) x
   where x.ok;
  perform set_config('role','none', true);
  insert into q66_probe values ('6_typo_level_expect_0', n);

  -- 7. service_role — every dashboard route — is untouched by all of the above.
  select count(*) into n from people;
  insert into q66_probe values ('7_service_role_all_people_expect_real_plus_1', n);
end $$;

select * from q66_probe order by step;

rollback;

-- Post-rollback assertion (run separately; all four must hold):
-- select (select count(*) from people where id like 'probe-q66%') as probe_people,   -- 0
--        (select count(*) from entity_access) as grants,                             -- 0
--        (select count(*) from entity_properties
--          where entity_id like 'probe-q66%') as probe_property_rows,                -- 0
--        (select count(*) from pg_policies where schemaname='public'
--          and policyname like '%_select_granted') as policies;                      -- 3
