#!/bin/sh
# Rehearsal for 0031_stable_record_ids.sql — Q70 inc.1 (2026-07-28).
#
# 0031 renumbers the primary key of every person and org and rewrites 18 foreign keys.
# That is the single most destructive migration in this repo's history, so it does not go
# near live data until it has been replayed from 0001 on a throwaway database and had its
# claims asserted. This script is that proof, and it is re-runnable.
#
#   ./scripts/rehearse-0031.sh
#
# Needs a local postgres on PGHOST/PGPORT (see PG* below). Never points at Supabase.

set -e
cd "$(dirname "$0")/.."

PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-5433}"
DB="rehearse_0031"
export PGHOST PGPORT
PSQL="psql -v ON_ERROR_STOP=1 -q"

echo "[rehearse] dropping and recreating $DB"
$PSQL -d postgres -c "drop database if exists $DB" >/dev/null
$PSQL -d postgres -c "create database $DB" >/dev/null

echo "[rehearse] shimming the Supabase-only roles the migrations reference"
$PSQL -d "$DB" >/dev/null <<'SQL'
do $$ begin
  create role anon;           exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated;  exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role;   exception when duplicate_object then null; end $$;
do $$ begin
  create role dashboard_ro;   exception when duplicate_object then null; end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$;
SQL

# NOTE (2026-07-28): replaying this chain from empty is what discovered that four
# migrations — events, entity_kind, submissions, edge_kind — existed ONLY in the stale
# Desktop clone and had never been ported here, while the live chain depended on all four.
# They are now 0001a..0001d. Before that, `supabase/migrations/` could not rebuild this
# database from nothing: 0003 referenced a column and 0006 a table that no file created.
echo "[rehearse] replaying every migration in order"
for f in supabase/migrations/*.sql; do
  base="$(basename "$f")"
  printf '  %s' "$base"
  if $PSQL -d "$DB" -f "$f" >/dev/null 2>/tmp/rehearse-err.txt; then
    echo "  ok"
  else
    echo "  FAILED"; sed 's/^/      /' /tmp/rehearse-err.txt; exit 1
  fi
done

echo "[rehearse] seeding rows that carry the OLD name-slug shape, then re-running 0031"
$PSQL -d "$DB" >/dev/null <<'SQL'
-- 0031 already ran above against an empty table, which proves nothing about DATA.
-- Insert the real defect — name-keyed rows plus the FKs that chain off them — with the
-- check constraint lifted, then run the renumber for real.
alter table people drop constraint if exists people_id_is_record_no;
alter table orgs   drop constraint if exists orgs_id_is_record_no;

insert into verticals (id, name, color) values ('roofing','Roofing','#D9820B') on conflict do nothing;

insert into people (id, name, vertical_id, status, legacy_slug) values
  ('caleb-green',   'Caleb Green',   'roofing', 'lit',  'caleb-green'),
  ('dana-reyes',    'Dana Reyes',    'roofing', 'warm', 'dana-reyes'),
  ('dana-reyes-2',  'Dana Reyes',    'roofing', 'warm', 'dana-reyes-2');

insert into orgs (id, name, vertical_id, status, legacy_slug) values
  ('cg-roofing',    'CG Roofing',    'roofing', 'lit',  'cg-roofing');

-- the attribution chain and a membership, i.e. the FKs that must follow the renumber
update people set referred_by_id = 'caleb-green' where id = 'dana-reyes';
insert into org_memberships (person_id, org_id, is_primary) values ('caleb-green','cg-roofing',true);
insert into edges (id, from_id, to_id, kind) values ('e1','caleb-green','dana-reyes','referral')
  on conflict do nothing;
SQL

$PSQL -d "$DB" -f supabase/migrations/0031_stable_record_ids.sql >/dev/null
echo "  renumber applied"

echo "[rehearse] asserting"
$PSQL -d "$DB" <<'SQL'
\set ON_ERROR_STOP on
do $$
declare n int; slug text; ref text; memb text; frm text;
begin
  -- 1. every id is now a record number, and none is a name
  select count(*) into n from people where id !~ '^P-[0-9]+$'; assert n = 0, 'people ids not renumbered';
  select count(*) into n from orgs   where id !~ '^C-[0-9]+$'; assert n = 0, 'org ids not renumbered';

  -- 2. the old slug survived on every row, so old URLs still resolve
  select count(*) into n from people where legacy_slug is null; assert n = 0, 'lost a people legacy_slug';
  select legacy_slug into slug from people where name = 'Caleb Green';
  assert slug = 'caleb-green', 'caleb legacy_slug wrong: ' || coalesce(slug,'<null>');

  -- 3. BOTH Dana Reyes rows survived as distinct people — the collision the old scheme
  --    could only paper over with a "-2" suffix
  select count(*) into n from people where name = 'Dana Reyes'; assert n = 2, 'lost a duplicate-name person';
  select count(distinct id) into n from people where name = 'Dana Reyes'; assert n = 2, 'dana rows collided';

  -- 4. the attribution chain followed the renumber, by cascade, and still points at Caleb
  select referred_by_id into ref from people where name = 'Dana Reyes' and legacy_slug = 'dana-reyes';
  assert ref ~ '^P-[0-9]+$', 'referred_by_id not renumbered: ' || coalesce(ref,'<null>');
  assert ref = (select id from people where legacy_slug = 'caleb-green'), 'attribution chain broke';

  -- 5. membership + edge rows followed too
  select person_id into memb from org_memberships limit 1;
  assert memb = (select id from people where legacy_slug = 'caleb-green'), 'org_membership did not cascade';
  select from_id into frm from edges where id = 'e1';
  assert frm = (select id from people where legacy_slug = 'caleb-green'), 'edge did not cascade';

  raise notice 'ALL ASSERTIONS PASSED';
end $$;
SQL

echo "[rehearse] re-running 0031 to prove it is idempotent"
before=$($PSQL -d "$DB" -tAc "select string_agg(id, ',' order by id) from people")
$PSQL -d "$DB" -f supabase/migrations/0031_stable_record_ids.sql >/dev/null
after=$($PSQL -d "$DB" -tAc "select string_agg(id, ',' order by id) from people")
if [ "$before" = "$after" ]; then
  echo "  idempotent — ids unchanged on second run"
else
  echo "  NOT IDEMPOTENT"; echo "   before: $before"; echo "   after:  $after"; exit 1
fi

echo "[rehearse] PASS"
