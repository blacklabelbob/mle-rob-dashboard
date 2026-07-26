-- Q65 final DoD (2026-07-25): migrate ONE existing enum-ish field onto the 0015 spine
-- as proof that the spine holds a real production field.
--
-- THE FIELD: `status` (lit / warm / unlit) on both `people` and `orgs`. Picked because it
-- is the most enum-ish column in the schema, it exists on two different entity kinds
-- (so it also proves the polymorphic key), and it touches NO money, signed, quoted or
-- paid field — those are never altered without a Rob instruction.
--
-- THE ONE RULE THIS MIGRATION OBEYS: the COLUMN STAYS THE SOURCE OF TRUTH.
-- A one-time copy into entity_properties would be a second, silently-drifting home for a
-- field the whole dashboard renders — i.e. a fabricated value the day after it is
-- written. So the spine copy is DERIVED and kept exact by triggers:
--
--   people.status / orgs.status  --(after insert/update/delete)-->  entity_properties
--
-- Nothing reads the spine copy yet; it exists so Q67's filter AST and any future custom
-- field can address a system field through exactly the same door as a user-made one. If
-- the trigger were ever dropped, the copy goes stale — hence the reconcile query at the
-- bottom of this file, which must return zero rows.
--
-- Additive: no existing column is changed, no row is deleted.

begin;

-- ---------------------------------------------------------------------------
-- The system definition + its options (deterministic UUIDs, §9.1 A3)
-- ---------------------------------------------------------------------------
-- Ids mirror lib/entityProperties.ts: systemPropertyId(1) / systemOptionId(1..3).
-- specific_entity_type is NULL on purpose — the field is legal on person AND org.
insert into property_definitions (id, display_name, data_type, specific_entity_type, is_multi_select, is_system)
values ('00000001-0000-0000-0000-000000000001', 'Network Status', 'SELECT_STRING', null, false, true)
on conflict (id) do update
  set display_name    = excluded.display_name,
      data_type       = excluded.data_type,
      is_multi_select = excluded.is_multi_select,
      is_system       = excluded.is_system,
      updated_at      = now();

insert into property_options (id, property_definition_id, display_order, string_value)
values
  ('00000002-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000001', 1, 'lit'),
  ('00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', 2, 'warm'),
  ('00000002-0000-0000-0000-000000000003', '00000001-0000-0000-0000-000000000001', 3, 'unlit')
on conflict (id) do update
  set display_order = excluded.display_order,
      string_value  = excluded.string_value;

-- ---------------------------------------------------------------------------
-- The projection trigger
-- ---------------------------------------------------------------------------
-- One function serves both tables: TG_ARGV[0] carries the entity_type, so people and
-- orgs cannot drift apart in their sync logic. Values are written in the tagged-union
-- shape 0015's CHECK demands; the string comes straight from a CHECK-constrained column,
-- so it is always one of the three options.
create or replace function sync_status_to_property_spine()
returns trigger
language plpgsql
as $$
declare
  ent_type text := TG_ARGV[0];
begin
  if TG_OP = 'DELETE' then
    delete from entity_properties
     where property_definition_id = '00000001-0000-0000-0000-000000000001'
       and entity_type = ent_type
       and entity_id = OLD.id;
    return OLD;
  end if;

  insert into entity_properties (property_definition_id, entity_type, entity_id, values)
  values ('00000001-0000-0000-0000-000000000001', ent_type, NEW.id,
          jsonb_build_object('kind', 'SELECT_STRING', 'items', jsonb_build_array(NEW.status)))
  on conflict (property_definition_id, entity_type, entity_id) do update
    set values = excluded.values,
        updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists people_status_to_property_spine on people;
create trigger people_status_to_property_spine
  after insert or update of status or delete on people
  for each row execute function sync_status_to_property_spine('person');

drop trigger if exists orgs_status_to_property_spine on orgs;
create trigger orgs_status_to_property_spine
  after insert or update of status or delete on orgs
  for each row execute function sync_status_to_property_spine('org');

-- ---------------------------------------------------------------------------
-- Backfill what already exists (the triggers only see writes from now on)
-- ---------------------------------------------------------------------------
insert into entity_properties (property_definition_id, entity_type, entity_id, values)
select '00000001-0000-0000-0000-000000000001', 'person', p.id,
       jsonb_build_object('kind', 'SELECT_STRING', 'items', jsonb_build_array(p.status))
  from people p
on conflict (property_definition_id, entity_type, entity_id) do update
  set values = excluded.values, updated_at = now();

insert into entity_properties (property_definition_id, entity_type, entity_id, values)
select '00000001-0000-0000-0000-000000000001', 'org', o.id,
       jsonb_build_object('kind', 'SELECT_STRING', 'items', jsonb_build_array(o.status))
  from orgs o
on conflict (property_definition_id, entity_type, entity_id) do update
  set values = excluded.values, updated_at = now();

commit;

-- ---------------------------------------------------------------------------
-- RECONCILE (run by hand any time the spine copy is doubted) — must return 0 rows.
-- ---------------------------------------------------------------------------
-- select 'person' as kind, p.id, p.status, ep.values
--   from people p
--   left join entity_properties ep
--     on ep.property_definition_id = '00000001-0000-0000-0000-000000000001'
--    and ep.entity_type = 'person' and ep.entity_id = p.id
--  where ep.id is null or ep.values -> 'items' ->> 0 is distinct from p.status
-- union all
-- select 'org', o.id, o.status, ep.values
--   from orgs o
--   left join entity_properties ep
--     on ep.property_definition_id = '00000001-0000-0000-0000-000000000001'
--    and ep.entity_type = 'org' and ep.entity_id = o.id
--  where ep.id is null or ep.values -> 'items' ->> 0 is distinct from o.status;
