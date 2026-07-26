-- Q65 (2026-07-25): `entity_properties` — custom fields as DATA, not migrations.
-- Design ported (not code-copied) from the 2026-07-25 Macro teardown, 02-crm.md §9.1 A2/A3/A5.
-- Macro is AGPL-3.0; every line below is retyped against the documented SHAPE, and the
-- enforcement decisions differ from theirs where MLE is better off (see the two notes).
--
-- WHY THIS EXISTS: MLE has zero custom fields today. Field sets are hard-coded in
-- lib/types.ts and whitelisted in lib/adminEdit.ts::FIELD_MAP, and 0005's own header
-- admits the 12 deal stages are not Rob-approved yet. Under that model every "can we
-- also track X?" is a migration + a deploy. After this, it is a row insert.
--
-- THREE TABLES:
--   property_definitions — what a field IS (name, data type, which entity kind it may
--                          attach to, whether it is multi-select, whether it is a system
--                          field nobody may rename or delete)
--   property_options     — the allowed choices for SELECT_STRING / TAG definitions
--   entity_properties    — the VALUE, attached polymorphically to any entity
--
-- POLYMORPHIC, DELIBERATELY NO FK (§9.1 A1's "additive spine, not a rewrite"): the value
-- row is keyed by (entity_type, entity_id) so one table serves people, orgs, deals,
-- activities, tasks, documents and invoices. The existing paired-nullable-FK tables
-- (activities, documents, signature_requests) are NOT retrofitted — their
-- num_nonnulls(...) <= 1 constraints are correct and battle-tested. This is new
-- cross-cutting surface only.
--
-- TAGGED-UNION `values` JSONB, structurally enforced: a property value is
--   {"kind": "<data_type>", "items": [ ...typed literals... ]}
-- and check_values_structure below rejects anything else AT THE DATABASE. That is the
-- difference between "JSONB" and "JSONB you can trust" — without the CHECK this is a
-- junk drawer, and a money-adjacent CRM cannot have a junk drawer. Always an array, even
-- for single-select, so flipping is_multi_select is a definition edit and never a
-- rewrite of every stored row.
--
-- WHERE WE DIVERGE FROM MACRO, ON PURPOSE:
--   1. data_type / entity_type are CHECK-constrained text, not Postgres ENUMs. Macro
--      needed four `ALTER TYPE ... ADD VALUE` migrations (TAG, COMPANY, TASK,
--      CALL_RECORD) to grow theirs, and ALTER TYPE cannot run inside a transaction
--      block. A CHECK is edited in a normal transactional migration. Same closed set,
--      same rejection of a typo'd value, cheaper to extend.
--   2. Nothing here is granted to `dashboard_ro`. The read-model role (0011) sees views
--      only; a custom field must be exposed through a view deliberately, never by
--      existing.
--
-- Additive DDL only. No existing row is read or written by this migration.

begin;

-- ---------------------------------------------------------------------------
-- property_definitions — what a field IS
-- ---------------------------------------------------------------------------
create table if not exists property_definitions (
  id                   uuid primary key,
  display_name         text not null check (length(trim(display_name)) > 0),
  data_type            text not null check (data_type in (
                         'TEXT','NUMBER','DATE','BOOLEAN','SELECT_STRING','TAG','ENTITY'
                       )),
  -- null = attaches to any entity kind; set = this definition is only legal on that kind
  specific_entity_type text check (specific_entity_type in (
                         'person','org','deal','activity','task','document','invoice'
                       )),
  is_multi_select      boolean not null default false,
  -- system fields are seeded with deterministic UUIDs (§9.1 A3) so seed SQL and
  -- lib/entityProperties.ts agree on an id without a lookup table. They may not be
  -- deleted or renamed by the app.
  is_system            boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- An ENTITY-typed property is a typed, named link (§9.1 A5) — "this task belongs to
-- Acme". It therefore has to say WHICH kind of thing it points at, or the link is
-- untyped and we have re-invented source_context's ad-hoc seam.
alter table property_definitions drop constraint if exists property_definitions_entity_target;
alter table property_definitions add constraint property_definitions_entity_target
  check (data_type <> 'ENTITY' or specific_entity_type is not null);

comment on table property_definitions is
  'Q65: custom-field definitions. A new field is a row here, not a migration. See lib/entityProperties.ts.';
comment on column property_definitions.specific_entity_type is
  'null = legal on any entity kind. Required when data_type = ENTITY (the link target kind).';

-- ---------------------------------------------------------------------------
-- property_options — allowed choices for SELECT_STRING / TAG
-- ---------------------------------------------------------------------------
create table if not exists property_options (
  id                     uuid primary key,
  property_definition_id uuid not null references property_definitions(id) on delete cascade,
  display_order          integer not null default 0,
  string_value           text not null check (length(trim(string_value)) > 0)
);

-- Two options with the same label on one definition is a data bug that reads as a UI
-- glitch (duplicate rows in a dropdown), so it is refused rather than deduped later.
create unique index if not exists property_options_unique_value
  on property_options (property_definition_id, string_value);
create index if not exists property_options_by_definition
  on property_options (property_definition_id, display_order);

-- ---------------------------------------------------------------------------
-- entity_properties — the value, attached to anything
-- ---------------------------------------------------------------------------
create table if not exists entity_properties (
  id                     uuid primary key default gen_random_uuid(),
  property_definition_id uuid not null references property_definitions(id) on delete cascade,
  entity_type            text not null check (entity_type in (
                           'person','org','deal','activity','task','document','invoice'
                         )),
  entity_id              text not null check (length(trim(entity_id)) > 0),
  values                 jsonb not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- One row per (definition, entity). Multi-select lives INSIDE `values.items`, never as
-- sibling rows — otherwise "clear this field" becomes a multi-row delete that can half-fail.
create unique index if not exists entity_properties_one_per_entity
  on entity_properties (property_definition_id, entity_type, entity_id);

-- The lookup the UI actually does: "every custom field on this record".
create index if not exists entity_properties_by_entity
  on entity_properties (entity_type, entity_id);

-- jsonb_path_ops: smaller and faster than the default opclass for the only query shape
-- we intend to support — containment ("which people are tagged storm-damage?"). It does
-- not support key-existence operators, which is the right trade: containment is what a
-- filter compiles to (Q67/B3), and an unindexed key-existence scan is a bug we want to
-- notice rather than serve slowly.
create index if not exists entity_properties_values_gin
  on entity_properties using gin (values jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- check_values_structure — the CHECK that makes the JSONB trustworthy
-- ---------------------------------------------------------------------------
-- Enforced here and not only in TS because the service-role key reaches this table from
-- scripts, n8n and future RPCs. A rule that only exists in one client is not a rule.
alter table entity_properties drop constraint if exists check_values_structure;
alter table entity_properties add constraint check_values_structure check (
  jsonb_typeof(values) = 'object'
  and values ? 'kind'
  and values ? 'items'
  and jsonb_typeof(values -> 'items') = 'array'
  and (values ->> 'kind') in (
    'TEXT','NUMBER','DATE','BOOLEAN','SELECT_STRING','TAG','ENTITY'
  )
  and (
    -- every item must be the literal type its `kind` promises
    case values ->> 'kind'
      when 'TEXT'          then not exists (select 1 from jsonb_array_elements(values -> 'items') e
                                            where jsonb_typeof(e.value) <> 'string')
      when 'SELECT_STRING' then not exists (select 1 from jsonb_array_elements(values -> 'items') e
                                            where jsonb_typeof(e.value) <> 'string')
      when 'TAG'           then not exists (select 1 from jsonb_array_elements(values -> 'items') e
                                            where jsonb_typeof(e.value) <> 'string')
      when 'DATE'          then not exists (select 1 from jsonb_array_elements(values -> 'items') e
                                            where jsonb_typeof(e.value) <> 'string')
      when 'NUMBER'        then not exists (select 1 from jsonb_array_elements(values -> 'items') e
                                            where jsonb_typeof(e.value) <> 'number')
      when 'BOOLEAN'       then not exists (select 1 from jsonb_array_elements(values -> 'items') e
                                            where jsonb_typeof(e.value) <> 'boolean')
      -- an ENTITY item is {"entity_type": "...", "entity_id": "..."} — a typed link,
      -- so a dangling half-reference cannot be stored
      when 'ENTITY'        then not exists (select 1 from jsonb_array_elements(values -> 'items') e
                                            where jsonb_typeof(e.value) <> 'object'
                                               or not (e.value ? 'entity_type')
                                               or not (e.value ? 'entity_id')
                                               or jsonb_typeof(e.value -> 'entity_type') <> 'string'
                                               or jsonb_typeof(e.value -> 'entity_id') <> 'string')
      else false
    end
  )
);

comment on column entity_properties.values is
  'Tagged union {kind, items[]} — see PropertyValue in lib/entityProperties.ts. Always an array, even single-select.';

commit;
