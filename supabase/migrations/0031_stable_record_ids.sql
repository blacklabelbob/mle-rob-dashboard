-- Q70 inc.1 (2026-07-28): people and orgs get a real identity. Rob's call.
--
-- THE DEFECT. `people.id` and `orgs.id` are the row's own NAME, slugified:
--     'caleb-green'  'alex-greenwood'  'chris-acheson'
-- 21 of 41 people are keyed by the string a human typed into the name field, and
-- 18 foreign-key columns across 8 migrations chain off those keys — including
-- `referred_by_id`, which carries the entire attribution lineage.
--
-- WHY THIS IS NOT COSMETIC, in the codebase's own words (lib/comms/emailPeople.ts):
--     "two strangers at the same company on one thread both slugify to the same
--      base id ... the second person becomes `dana-reyes-2`"
-- The collision is already here and already being papered over with a counter.
-- `dana-reyes-2` is not a person's identity, it is the order two emails happened to
-- arrive in. Rename anyone and the key either lies or the FKs break.
--
-- WHY NOW AND NOT LATER: the daily ingest agent resolves "Mike" in a transcript to a
-- row. Entity resolution keyed on the very string it is trying to disambiguate is a
-- machine for silently merging two people. Building the agent first means building it
-- twice. There are zero duplicate names today across 41 rows — this is the cheapest
-- this will ever be.
--
-- THE SHAPE, and why it is this and not a uuid column:
--   * the PK stays `text`. Changing 18 FK columns to bigint/uuid is a far larger blast
--     radius for no gain — the defect is the VALUE, not the type.
--   * ids become record numbers — 'P-1001' for a person, 'C-2001' for an org. Rob asked
--     for numbers he can say out loud ("pull up P-1043"); a uuid is unreadable and a
--     bare integer collides across the two tables when they meet in `edges`.
--   * the old slug is KEPT, permanently, in `legacy_slug`. Every /people/caleb-green URL,
--     bookmark and external link still resolves. Nothing 404s on cutover.
--   * FKs are recreated with ON UPDATE CASCADE first, so the renumber is one UPDATE and
--     Postgres moves every child row itself — no hand-written repointing to get wrong.
--
-- IDEMPOTENT: guarded so a re-run is a no-op. Rows already carrying a record number are
-- left alone; only name-keyed rows are renumbered.

begin;

-- 1. The permanent home for the old key. Backfilled before anything moves, so the
--    mapping from old URL to new row exists for every row that ever had a slug.
alter table people add column if not exists legacy_slug text;
alter table orgs   add column if not exists legacy_slug text;

update people set legacy_slug = id where legacy_slug is null;
update orgs   set legacy_slug = id where legacy_slug is null;

create unique index if not exists people_legacy_slug_key on people (legacy_slug);
create unique index if not exists orgs_legacy_slug_key   on orgs   (legacy_slug);

-- 2. Record-number sources. Separate sequences so a person and an org can never be
--    handed the same number, which matters where both land in `edges`.
create sequence if not exists people_record_no_seq start with 1001;
create sequence if not exists orgs_record_no_seq   start with 2001;

-- 3. Every FK pointing at people(id) or orgs(id) is rebuilt with ON UPDATE CASCADE.
--    Read out of the catalog rather than listed by hand: the 18 constraints were created
--    across 8 migrations, several by `alter table ... add column ... references`, so their
--    auto-generated names are not reliably guessable. Delete rules are preserved exactly.
--    Schema is taken from the catalog, not hardcoded to 'public', for two reasons: the
--    migration then rehearses correctly in an isolated scratch schema (which is how this
--    was verified before it was allowed near live data), and it cannot silently rewrite a
--    same-named table in some other schema.
do $$
declare
  r record;
  cols text;
  refcols text;
begin
  for r in
    select c.conname, c.confdeltype,
           src.relname  as src_table,
           srcns.nspname as src_schema,
           tgt.relname  as tgt_table,
           tgtns.nspname as tgt_schema,
           c.conkey, c.confkey, c.conrelid, c.confrelid
      from pg_constraint c
      join pg_class src on src.oid = c.conrelid
      join pg_class tgt on tgt.oid = c.confrelid
      join pg_namespace srcns on srcns.oid = src.relnamespace
      join pg_namespace tgtns on tgtns.oid = tgt.relnamespace
     where c.contype = 'f'
       and tgtns.nspname = current_schema()
       and tgt.relname in ('people','orgs')
       and c.confupdtype <> 'c'          -- already cascading? leave it alone
       and c.conrelid <> c.confrelid     -- SELF-references are handled in step 4, not here
  loop
    select string_agg(quote_ident(a.attname), ', ' order by k.ord)
      into cols
      from unnest(r.conkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = r.conrelid and a.attnum = k.attnum;

    select string_agg(quote_ident(a.attname), ', ' order by k.ord)
      into refcols
      from unnest(r.confkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = r.confrelid and a.attnum = k.attnum;

    execute format('alter table %I.%I drop constraint %I', r.src_schema, r.src_table, r.conname);
    execute format(
      'alter table %I.%I add constraint %I foreign key (%s) references %I.%I (%s) on update cascade on delete %s',
      r.src_schema, r.src_table, r.conname, cols, r.tgt_schema, r.tgt_table, refcols,
      case r.confdeltype
        when 'c' then 'cascade'
        when 'n' then 'set null'
        when 'd' then 'set default'
        when 'r' then 'restrict'
        else 'no action'
      end
    );
  end loop;
end $$;

-- 4. The renumber. Cross-table children ride the cascades from step 3; SELF-references
--    (people.referred_by_id -> people.id, orgs.referred_by_org_id -> orgs.id) are remapped
--    EXPLICITLY, in the same statement that moves the id.
--
--    WHY NOT CASCADE FOR THESE — the bug this cost a live apply to find (Q70 inc.5):
--    ON UPDATE CASCADE cannot propagate onto a row that the SAME statement is also
--    updating. When one UPDATE renumbers both a referrer and the person they referred,
--    Postgres moves the parent, declines to touch the already-modified child, and the
--    end-of-statement FK check then fails on the child's now-dangling pointer:
--        Key (referred_by_id)=(daniella-roach) is not present in table "people"
--    Whether it fires depends on the order rows are scanned, which is the HEAP order —
--    so step 1's `update ... set legacy_slug = id` (which rewrites every row and thereby
--    reorders the heap) is what turned a passing rehearsal into a failing live apply.
--    A renumber whose correctness depends on physical row order is not a renumber, so the
--    self-references no longer rely on it: the mapping is computed first, then the id and
--    the pointer move together and the FK sees one consistent state at statement end.
create temporary table _people_renumber on commit drop as
  select id as old_id, 'P-' || nextval('people_record_no_seq') as new_id
    from people
   where id !~ '^P-[0-9]+$';

update people p
   set id             = coalesce(self.new_id, p.id),
       referred_by_id = coalesce(ref.new_id, p.referred_by_id)
  from people src
       left join _people_renumber self on self.old_id = src.id
       left join _people_renumber ref  on ref.old_id  = src.referred_by_id
 where src.id = p.id
   and (self.new_id is not null or ref.new_id is not null);

create temporary table _orgs_renumber on commit drop as
  select id as old_id, 'C-' || nextval('orgs_record_no_seq') as new_id
    from orgs
   where id !~ '^C-[0-9]+$';

update orgs o
   set id                 = coalesce(self.new_id, o.id),
       referred_by_org_id = coalesce(ref.new_id, o.referred_by_org_id)
  from orgs src
       left join _orgs_renumber self on self.old_id = src.id
       left join _orgs_renumber ref  on ref.old_id  = src.referred_by_org_id
 where src.id = o.id
   and (self.new_id is not null or ref.new_id is not null);

-- 5. Hold the shape going forward. A future write that tries to store a name-slug as an
--    id fails loudly here rather than quietly reintroducing the defect two months from now.
alter table people drop constraint if exists people_id_is_record_no;
alter table people add  constraint people_id_is_record_no check (id ~ '^P-[0-9]+$');

alter table orgs drop constraint if exists orgs_id_is_record_no;
alter table orgs add  constraint orgs_id_is_record_no check (id ~ '^C-[0-9]+$');

comment on column people.legacy_slug is
  'The pre-0031 name-derived id (e.g. "caleb-green"). Kept permanently so old URLs and '
  'external links resolve. Look-ups accept it; nothing should ever write it as an id again.';
comment on column orgs.legacy_slug is
  'The pre-0031 name-derived id. Kept permanently so old URLs and external links resolve.';

commit;
