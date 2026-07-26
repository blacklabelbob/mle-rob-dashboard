# Macro CRM Subsystem — Deep Code Analysis
**Analyst:** Head of Engineering · **Date:** 2026-07-25
**Target:** Macro (macro.com) clone, AGPLv3 — Rust/Axum/sqlx/Postgres backend + TypeScript frontend
**Repo root:** `/private/tmp/claude-501/-Users-robertacheson-Projects-MyLocalEverything/1eb0b710-ce17-40e9-ac89-e0bbf3de6054/scratchpad/macro`
**Comparison target:** MLE ROB Dashboard — Next.js 15 App Router + Supabase + Vercel, at
`/Users/robertacheson/Projects/MyLocalEverything/MLE ROB Dashboard`

> ⚖️ **License note up front.** Macro is **AGPLv3**. Copying Rust source verbatim, or producing a
> derivative work of it, obliges Rob to publish the source of the MLE CRM under AGPLv3 — including
> when it is only offered as a network service (that is the whole point of the "A" in AGPL).
> **Reading the design and reimplementing it in TypeScript is not a derivative work.** Every
> "Port the code" verdict below is therefore actually "port the *schema shape and algorithm*,
> retyped from scratch"; there is no verdict in this report that recommends pasting Macro's Rust.
> SQL DDL in this report is quoted as **evidence of design**, not as a code drop.

---

## 0. Executive orientation — what Macro's "CRM" actually is

Macro is not a CRM company. Macro is a **workspace** (docs, tasks, chat, channels, email, calls)
that grew a CRM as a *view over its email graph*. The consequences are structural and they are the
whole reason the thing feels magic:

1. **There is no "CRM database."** There is a universal entity model
   (`model-entity::Entity { entity_type, entity_id }`, `crates/model-entity/src/lib.rs:34`) that
   every subsystem — access control, custom fields, favorites, frecency, notifications, the unified
   feed — keys off. A CRM company is just `EntityType::CrmCompany` and gets every cross-cutting
   feature for free the day it is added to that enum.
2. **The CRM's own tables are tiny** — five tables, ~10 columns each
   (`crates/macro_db_client/migrations/20260512120000_crm_tables.up.sql`). Everything a normal CRM
   would model as columns (stage, owner, deal value, tags, notes) lives in a *generic* EAV store.
3. **Records are auto-created from email**, not typed in. A company exists because somebody on the
   team sent mail to `@acme.com`. This is the single highest-leverage idea in the codebase.
4. **The activity timeline is not stored.** It is *computed at query time* by re-searching the
   team's mailboxes for the company's domains. There is no `activities` table anywhere in the repo.

If you take exactly four ideas from Macro into the MLE CRM, take those four.

---

## 1. The CRM data model — actual schema

### 1.1 The five core CRM tables

All CRM DDL lives in `crates/macro_db_client/migrations/`. Combined and de-migrated, the live shape is:

`crm_companies` — from `20260512120000_crm_tables.up.sql`, `20260521203029_crm_hidden.up.sql`,
`20260525152844_crm_updated_at.up.sql`, `20260526175147_crm_interaction_timestamps.up.sql`,
`20260721185457_crm_company_name.sql`, `20260722132833_crm_manually_created.sql`:

```sql
CREATE TABLE IF NOT EXISTS crm_companies
(
    id         UUID        PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
    team_id    UUID        NOT NULL REFERENCES team (id) ON DELETE CASCADE,
    email_sync BOOLEAN     NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- later migrations add:
ALTER TABLE crm_companies ADD COLUMN hidden            BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE crm_companies ADD COLUMN updated_at        TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE crm_companies ADD COLUMN first_interaction TIMESTAMPTZ NOT NULL;
ALTER TABLE crm_companies ADD COLUMN last_interaction  TIMESTAMPTZ NOT NULL;
ALTER TABLE crm_companies ADD COLUMN custom_name       TEXT;     -- team-scoped display override
ALTER TABLE crm_companies ADD COLUMN manually_created  BOOLEAN NOT NULL DEFAULT FALSE;
```

Note what is **absent**: no `name` (it was added then *dropped* in
`20260521120000_crm_domain_directory.up.sql` — `ALTER TABLE crm_companies DROP COLUMN IF EXISTS name;`),
no industry, no address, no phone, no owner, no stage, no deal value, no status. All of that is
either in the shared global directory (§1.2) or in the EAV property store (§1.4).

`crm_domains` — a company is *identified by its email domains*, one-to-many:

```sql
CREATE TABLE IF NOT EXISTS crm_domains
(
    id         UUID        PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
    company_id UUID        NOT NULL REFERENCES crm_companies (id) ON DELETE CASCADE,
    domain     TEXT        NOT NULL,
    team_id    UUID        NOT NULL REFERENCES team (id) ON DELETE CASCADE,  -- denormalized
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, domain)
);
CREATE UNIQUE INDEX crm_domains_team_id_lower_domain_unique
    ON crm_domains (team_id, LOWER(domain));
```

The denormalized `team_id` exists purely to make that unique index possible, and the migration
comment (`20260514130000_crm_domains_team_id.up.sql`) explains why — a real production race:

> *"Without this, the upsert path in `crm::outbound::companies_repo::populate_contact` races: two
> concurrent transactions can both SELECT-and-see-nothing for the same (team, domain) and both
> INSERT a new crm_companies row, leaving the team with duplicate companies for the same domain."*

**That is the entire company-dedupe strategy: a partial-unique index on `(team_id, lower(domain))`,
plus an advisory lock.** No fuzzy matching, no ML. Cheap and correct.

`crm_contacts` — a person, keyed by email, always belonging to exactly one company:

```sql
CREATE TABLE IF NOT EXISTS crm_contacts
(
    id         UUID        PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
    company_id UUID        NOT NULL REFERENCES crm_companies (id) ON DELETE CASCADE,
    email      TEXT        NOT NULL,
    name       TEXT,                    -- added 20260520150000
    hidden     BOOLEAN     NOT NULL DEFAULT FALSE,
    first_interaction TIMESTAMPTZ NOT NULL,
    last_interaction  TIMESTAMPTZ NOT NULL,
    manually_created  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, email)
);
```

A contact has **no phone number, no title, no LinkedIn, no mobile, no address**. Macro's contact is
an *email address with a display name*. For a roofing sales team this is a real gap — see §8.

`crm_contact_sources` — provenance: which connected mailbox produced this contact.

```sql
CREATE TABLE IF NOT EXISTS crm_contact_sources
(
    id         UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES crm_contacts (id) ON DELETE CASCADE,
    link_id    UUID NOT NULL REFERENCES email_links (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (contact_id, link_id)
);
```
(`20260514120000_crm_contact_sources.up.sql`.) This is a small but excellent idea: it makes teardown
correct. When a rep disconnects their mailbox, only the contacts *they* sourced get garbage-collected;
contacts that another rep also corresponds with survive. `20260722132833_crm_manually_created.sql`
documents the complement — manually created rows have no source rows by construction and are marked
so the GC does not eat them.

`team_crm_settings` — per-team config, the pipeline governance layer:

```sql
CREATE TABLE IF NOT EXISTS team_crm_settings
(
    team_id     UUID PRIMARY KEY NOT NULL REFERENCES team (id) ON DELETE CASCADE,
    crm_enabled BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 20260717161623_team_crm_settings_config.sql:
ALTER TABLE team_crm_settings
    ADD COLUMN edit_stages_role       team_role NOT NULL DEFAULT 'admin',
    ADD COLUMN move_closed_deals_role team_role NOT NULL DEFAULT 'admin',
    ADD COLUMN delete_records_role    team_role NOT NULL DEFAULT 'admin',
    ADD COLUMN closed_stage_ids       uuid[],
    ADD COLUMN team_views             jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN default_team_view_id   text;

COMMENT ON COLUMN team_crm_settings.closed_stage_ids IS
    'Stage option ids counting as closed deals; NULL = label heuristic on the client';
COMMENT ON COLUMN team_crm_settings.team_views IS
    'Opaque array of team saved views, owned by the frontend';
```

Two things worth stealing verbatim as *ideas*: **role-gated pipeline governance** (only admins can
edit the stage set, only admins can drag a deal back out of Closed) and **`team_views` as an opaque
jsonb blob owned by the frontend** — a deliberate, documented decision to not model saved views in
SQL so the UI can iterate without migrations.

### 1.2 `crm_domain_directory` — the shared, cross-tenant enrichment cache

```sql
CREATE TABLE IF NOT EXISTS crm_domain_directory
(
    id          UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
    domain      TEXT NOT NULL,
    name        TEXT,
    description TEXT,
    icon_url    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crm_domain_directory_domain_key ON crm_domain_directory (LOWER(domain));
```
(`20260521120000_crm_domain_directory.up.sql`), then massively widened by
`20260529164720_crm_domain_directory_apollo_fields.up.sql`:

```sql
ALTER TABLE crm_domain_directory
    ADD COLUMN apollo_organization_id    TEXT,
    ADD COLUMN website_url               TEXT,
    ADD COLUMN linkedin_url              TEXT,
    ADD COLUMN twitter_url               TEXT,
    ADD COLUMN facebook_url              TEXT,
    ADD COLUMN industry                  TEXT,
    ADD COLUMN keywords                  TEXT[],
    ADD COLUMN technologies              TEXT[],
    ADD COLUMN estimated_num_employees   INTEGER,
    ADD COLUMN annual_revenue            BIGINT,
    ADD COLUMN annual_revenue_printed    TEXT,
    ADD COLUMN total_funding             BIGINT,
    ADD COLUMN latest_funding_stage      TEXT,
    ADD COLUMN founded_year              INTEGER,
    ADD COLUMN publicly_traded_symbol    TEXT,
    ADD COLUMN phone                     TEXT,
    ADD COLUMN raw_address               TEXT,
    ADD COLUMN street_address            TEXT,
    ADD COLUMN city                      TEXT,
    ADD COLUMN state                     TEXT,
    ADD COLUMN postal_code               TEXT,
    ADD COLUMN country                   TEXT,
    ADD COLUMN raw                       JSONB,
    ADD COLUMN enriched_at               TIMESTAMPTZ;
```

**This is architecturally the smartest table in the CRM.** It is keyed on `LOWER(domain)` with
*no `team_id`* — it is **global across all tenants**. Enrich `acme.com` once for team A and team B
gets it free. Enrichment spend is O(distinct domains in the product), not O(tenants × domains).

It is also a **negative cache**. From `crates/crm/src/domain/company_metadata_resolver.rs`:

> *"Implementations are expected to be best-effort: a missing page, network timeout, or malformed
> metadata should be surfaced as a `DomainMetadata` with all-NULL fields rather than an error, since
> the caller writes the result into `crm_domain_directory` as a negative cache so the domain isn't
> re-resolved on the next populate."*

And the display name resolution is a COALESCE chain, documented in
`20260721185457_crm_company_name.sql`: `crm_companies.custom_name` (team-scoped user override)
→ `crm_domain_directory.name` (global enrichment) → nothing. Team-typed names deliberately never
pollute the shared directory.

### 1.3 Provider abstraction for enrichment

`crates/crm/src/domain/company_metadata_resolver.rs` defines a one-method port:

```rust
pub trait CompanyMetadataResolver: Clone + Send + Sync + 'static {
    fn resolve(&self, domain: &str) -> impl Future<Output = DomainMetadata> + Send;
}
```

Three implementations ship:
- `crates/crm/src/outbound/apollo_resolver.rs` — Apollo.io
  `GET /api/v1/organizations/enrich?domain=…`, 10s timeout, full payload kept in
  `crm_domain_directory.raw` "so fields we don't model yet aren't lost".
- `crates/crm/src/outbound/unfurl_resolver.rs` — the fallback: just scrape `https://{domain}`
  for OG title/description/favicon.
- `crates/crm/src/outbound/no_op_resolver.rs` — local dev.

Notably: **`if self.api_key.is_empty() { return DomainMetadata::default(); }`** — no key, no call,
no cached 401. Small thing, correct thing.

### 1.4 Custom fields / properties — the EAV engine (`entity_properties`)

This is the piece that makes everything else possible. From
`crates/macro_db_client/migrations/20251030100000_init_properties_schema.sql`:

```sql
CREATE TYPE property_data_type AS ENUM (
    'BOOLEAN', 'DATE', 'NUMBER', 'STRING',
    'SELECT_NUMBER', 'SELECT_STRING',   -- select types (property options)
    'ENTITY',                           -- reference to another entity
    'LINK'                              -- URL
);
-- later: ALTER TYPE property_data_type ADD VALUE 'TAG';  (20260629214704)

CREATE TYPE property_entity_type AS ENUM ('CHANNEL','CHAT','DOCUMENT','PROJECT','THREAD','USER');
-- later: ADD VALUE 'COMPANY'; ADD VALUE 'TASK';   (20251128000000)
--        ADD VALUE 'CALL_RECORD';                 (20260709192942)
```

```sql
CREATE TABLE property_definitions (
    id UUID PRIMARY KEY,
    team_id UUID REFERENCES "team"(id) ON DELETE CASCADE,   -- one of
    user_id TEXT REFERENCES "User"(id) ON DELETE SET NULL,  -- these three
    is_system BOOLEAN NOT NULL DEFAULT FALSE,               -- owns the definition
    display_name TEXT NOT NULL,
    data_type property_data_type NOT NULL,
    is_multi_select BOOLEAN NOT NULL,
    specific_entity_type property_entity_type,  -- NULL = any entity type allowed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 20260622223029_kill_org_properties_add_team.sql:
ALTER TABLE property_definitions ADD CONSTRAINT owned_by_team_or_user_or_system CHECK (
    is_system::int + (team_id IS NOT NULL)::int + (user_id IS NOT NULL)::int = 1
);
```

```sql
CREATE TABLE property_options (
    id UUID PRIMARY KEY,
    property_definition_id UUID NOT NULL REFERENCES property_definitions(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL DEFAULT 0,
    number_value DOUBLE PRECISION,
    string_value TEXT,
    CONSTRAINT check_option_value_set CHECK (
        (number_value IS NOT NULL AND string_value IS NULL) OR
        (number_value IS NULL AND string_value IS NOT NULL)
    )
);
```

```sql
CREATE TABLE entity_properties (
    id UUID PRIMARY KEY,
    entity_id   TEXT NOT NULL,                  -- no FK: entities live in other schemas/services
    entity_type property_entity_type NOT NULL,
    property_definition_id UUID NOT NULL REFERENCES property_definitions(id) ON DELETE CASCADE,
    values JSONB,
    CONSTRAINT check_values_structure CHECK (
        values IS NULL
        OR (values->>'type' IN ('Boolean','Number','String','Date')
            AND jsonb_typeof(values->'value') != 'array')
        OR (values->>'type' IN ('SelectOption','EntityReference','Link')
            AND jsonb_typeof(values->'value') = 'array')
    ),
    CONSTRAINT unique_entity_properties_assignment
        UNIQUE (entity_id, entity_type, property_definition_id)
);
CREATE INDEX idx_entity_properties_entity_id ON entity_properties(entity_id, entity_type);
CREATE INDEX idx_entity_properties_values_gin
    ON entity_properties USING gin(values jsonb_path_ops);
```

The `values` column is a **self-describing tagged union**, documented inline in the migration:

```
{"type": "Boolean",         "value": true}
{"type": "Number",          "value": 42.5}
{"type": "String",          "value": "text"}
{"type": "Date",            "value": "2025-01-01T00:00:00Z"}
{"type": "SelectOption",    "value": ["uuid1","uuid2"]}          -- ALWAYS array
{"type": "EntityReference", "value": [{"entity_type":"user","entity_id":"123"}]}  -- ALWAYS array
{"type": "Link",            "value": ["google.com","reddit.com"]}                 -- ALWAYS array
```

Two design decisions worth copying exactly:
- **Single vs multi-select is a property of the *definition* (`is_multi_select`), not of the JSON
  shape.** Array-always for the three reference-ish types means the read path never branches.
- **The GIN index with `jsonb_path_ops`** plus the documented query recipes in the migration
  comments — `values @> '{"type":"Boolean","value":true}'`, `values->'value' @> '["uuid"]'::jsonb`.

### 1.5 System properties — where the "deal" actually lives

`crates/system_properties/src/domain/model/constants/system_property_key.rs:79-103` declares all
system properties with **deterministic UUIDs** derived from a base constant
(`BASE_UUID: u128 = 0x00000001_0000_0000_0000_000000000000`, plus a hex suffix):

```rust
define_system_properties! {
    // Tasks
    Assignees,         ASSIGNEES_UUID,          0x01, "Assignees";
    Status,            STATUS_UUID,             0x02, "Status";
    Priority,          PRIORITY_UUID,           0x03, "Priority";
    DueDate,           DUE_DATE_UUID,           0x04, "Due Date";
    ParentTask,        PARENT_TASK_UUID,        0x05, "Parent Task";
    Subtasks,          SUBTASKS_UUID,           0x06, "Subtasks";
    DependsOn,         DEPENDS_ON_UUID,         0x07, "Depends On";
    Effort,            EFFORT_UUID,             0x08, "Effort";
    StoryPoints,       STORY_POINTS_UUID,       0x09, "Story Points";
    RelevantDocuments, RELEVANT_DOCUMENTS_UUID, 0x0a, "Relevant Documents";

    // Email attachments
    Source,            SOURCE_UUID,             0x0b, "Source";
    Companies,         COMPANIES_UUID,          0x0c, "Companies";
    Sender,            SENDER_UUID,             0x0d, "Sender";
    Recipients,        RECIPIENTS_UUID,         0x0e, "Recipients";
    Subject,           SUBJECT_UUID,            0x0f, "Subject";

    // CRM companies
    Stage,             STAGE_UUID,              0x10, "Stage";
    CompanyOwner,      COMPANY_OWNER_UUID,      0x11, "Owner";
    Revenue,           REVENUE_UUID,            0x12, "Revenue";
}
```

Deterministic UUIDs mean the seed migration can hardcode them and the Rust code can `const`-match
them without a lookup. `20260707183206_seed_crm_company_system_properties.sql` seeds them:

```sql
INSERT INTO property_definitions (id, team_id, user_id, display_name, data_type,
                                  is_multi_select, specific_entity_type, is_system)
VALUES ('00000001-0000-0000-0000-000000000010', NULL, NULL, 'Stage',   'SELECT_STRING', false, NULL,   true);
VALUES ('00000001-0000-0000-0000-000000000011', NULL, NULL, 'Owner',   'ENTITY',        false, 'USER', true);
VALUES ('00000001-0000-0000-0000-000000000012', NULL, NULL, 'Revenue', 'NUMBER',        false, NULL,   true);

INSERT INTO property_options (id, property_definition_id, display_order, string_value) VALUES
    ('00000001-0000-0000-0010-000000000001', '…010', 0, 'Lead'),
    ('00000001-0000-0000-0010-000000000002', '…010', 1, 'Qualified'),
    ('00000001-0000-0000-0010-000000000003', '…010', 2, 'Demo'),
    ('00000001-0000-0000-0010-000000000004', '…010', 3, 'Trial'),
    ('00000001-0000-0000-0010-000000000005', '…010', 4, 'Negotiation'),
    ('00000001-0000-0000-0010-000000000006', '…010', 5, 'Customer'),
    ('00000001-0000-0000-0010-000000000007', '…010', 6, 'Churned');
```

### 1.6 Entity-relationship summary

```
team ──< crm_companies ──< crm_domains          (UNIQUE team_id, lower(domain))
                       └──< crm_contacts ──< crm_contact_sources >── email_links
                       └──< crm_thread ──< crm_comment            (notes)

crm_domains.domain ─(lower)─> crm_domain_directory   (GLOBAL, cross-tenant, enrichment + neg-cache)

entity_properties (entity_id TEXT, entity_type ENUM) ── polymorphic, no FK ──> ANY entity
    └── property_definitions (system | team | user owned) ──< property_options

favorite            (user_id, entity_type, entity_id)   -- polymorphic
frecency_aggregates (user_id, entity_type, entity_id)   -- polymorphic
entity_access       (entity_id, entity_type, source_id, source_type, access_level) -- polymorphic
```

Note there is **no `crm_deals` table, no `crm_activities` table, no `crm_tasks` table, and no
generic `links`/`relations` table.** Those three absences are the three most important facts in
this report and are dealt with in §2, §5, and §6.

---

## 2. "@link everything / shared memory" — the actual mechanism

Rob is right to be impressed, but the magic is not one feature. It is **four mechanisms stacked**,
and they can be adopted independently. In descending order of value-per-effort:

### Mechanism A — one universal `Entity` type, used by every cross-cutting subsystem

`crates/model-entity/src/lib.rs:34`:

```rust
pub enum EntityType {
    User, Chat, Channel, ChannelMessage, Document, Project, EmailThread,
    Team, Call, ForeignEntity, StaticFile, CrmCompany, CrmContact,
}

pub struct Entity<'a> {
    pub entity_type: EntityType,
    pub entity_id: Cow<'a, str>,
}
```

Every cross-cutting table is keyed on `(entity_type, entity_id)` with **no foreign key**:

| Subsystem | Table | Migration |
|---|---|---|
| Custom fields | `entity_properties(entity_id TEXT, entity_type ENUM, …)` | `20251030100000_init_properties_schema.sql` |
| Favorites | `favorite(user_id, entity_type TEXT, entity_id TEXT, sort_order)` | `20260702014623_create_favorites_table.sql` |
| Frecency | `frecency_aggregates(user_id, entity_type, entity_id, frecency_score)` | `20251029143441_add_frecency_table.sql` |
| Access control | `entity_access(entity_id UUID, entity_type TEXT, source_id, source_type, access_level)` | `20260331152752_add_entity_access_table.sql` |
| External refs | `foreign_entity(foreign_entity_id, foreign_entity_source, stored_for_id, stored_for_auth_entity)` | `20260526175912_create_foreign_entity_table.sql` |
| Import ledger | `import_entity(source, foreign_id, entity_id, entity_type, status)` | `20260720221050_import_entities.sql` |

**The cost of adding CRM to this workspace was one enum variant.** `EntityType::CrmCompany` was
appended, and companies immediately became favoritable, frecency-ranked, property-bearing,
filterable, and feed-visible. The enum even documents which subsystems opt out
(`is_valid_entity_access_entity()` at `crates/model-entity/src/lib.rs:64` returns `false` for
`CrmCompany` / `CrmContact` because "CRM companies/contacts derive access via team membership
joins — they aren't rows in the `entity_access` table").

This is the single idea to steal. In Supabase terms it is: one `entity_type` Postgres enum, and
every cross-cutting table uses `(entity_type, entity_id)` instead of `company_id`/`person_id`.

### Mechanism B — `entity_properties` **is** the polymorphic link table

There is no `links` table because an `ENTITY`-typed property *is* a typed, named link.
`crates/models_properties/src/shared/entity_reference.rs:11`:

```rust
pub struct EntityReference {
    pub entity_id: String,
    pub entity_type: EntityType,      // CallRecord|Channel|Chat|Company|Document|Project|Task|Thread|User
    /// For CHANNEL, CHAT, THREAD entity types - optional specific message ID.
    /// This allows referencing a specific message within a thread/channel/chat.
    pub specific_message_id: Option<Uuid>,
}
```

Stored as `{"type":"EntityReference","value":[{"entity_type":"company","entity_id":"<uuid>"}]}` in
`entity_properties.values`. Because `property_definitions.specific_entity_type` constrains the
*target* type and `entity_properties.entity_type` records the *source* type, one row expresses:

> "**this Task** has a property named **Companies** pointing at **company `<uuid>`**"
> "**this Document** has a property named **Source** pointing at **thread `<uuid>`, message `<uuid>`**"

`specific_message_id` deserves a callout — you can link to *a specific message inside a thread*, not
just the thread. That is the difference between "this doc relates to the Acme thread" and "this doc
came from Bob's 3:42pm reply."

**Concrete proof this is used for auto-linking**, `crates/system_properties/src/domain/service.rs:124-193`:

```rust
/// Collect property rows for a single entity's email attachment properties.
/// Email attachments are always applied to Document entities.
fn collect_email_property_rows(entity_id: &str, properties: EmailAttachmentProperty) -> Vec<PropertyRow> {
    let entity_type = EntityType::Document;

    // Source (single entity reference with optional specific_message_id)
    if let Some(source) = properties.source {
        rows.push(PropertyRow::entity_reference(
            entity_id, entity_type, SystemPropertyKey::Source.uuid(),
            source.entity_type, vec![source.entity_id], source.specific_message_id,
        ));
    }

    // Companies (multi entity reference)
    if let Some(company_ids) = properties.companies {
        rows.push(PropertyRow::entity_reference(
            entity_id, entity_type, SystemPropertyKey::Companies.uuid(),
            EntityType::Company, company_ids, None,
        ));
    }
    // … Sender (user ref), Recipients (multi user ref), Subject (string)
}
```

**When a PDF arrives as an email attachment, Macro saves it as a Document and automatically stamps
it with `Companies → [Acme]`, `Source → thread/message`, `Sender`, `Recipients`, `Subject`.** That
is the "shared memory" moment. Nobody filed anything. The link is a side effect of ingestion.

For a roofing CRM the translation is direct: *when a signed proposal PDF, an AIDRE call recording,
or an inbound lead form arrives, stamp it with the company it belongs to at write time.*

⚠️ **Honest caveat: the *user-facing* half of this is unfinished in Macro.** The data model supports
`ENTITY → COMPANY` references and the ingestion path above writes them, but a user cannot *create* a
company-referencing property from the UI. `apps/web/src/features/property/utils/display.ts:7-24`
literally comments the option out:

```ts
  { value: 'entity:TASK'    as const, label: 'Task' },
  // { value: 'entity:COMPANY' as const, label: 'Company' }, NOT YET IMPLEMENTED
  { value: 'entity:THREAD'  as const, label: 'Email' },
  { value: 'entity'         as const, label: 'Any Entity' },
```

So the mechanism is real and proven in the auto-stamp path, but Macro ships it as **write-side
automation only**. That is a point in favour of copying it: the architecture is validated, and the
UI work Macro skipped is the cheap part.

### Mechanism C — the "soup": one unified feed across every entity type

`crates/models_soup/src/item.rs:22`:

```rust
#[serde(rename_all = "camelCase", tag = "tag", content = "data")]
pub enum SoupItem<T = ()> {
    Document(SoupDocument<T>),
    Chat(SoupChat<T>),
    Project(SoupProject<T>),
    EmailThread(SoupEnrichedEmailThreadPreview<T>),
    Channel(SoupChannel),
    ChannelThread(SoupChannelThread),
    Call(SoupCallRecord<T>),
    CrmCompany(SoupCrmCompany<T>),
    ForeignEntity(SoupForeignEntity),
}
```

Every variant answers `fn entity()`, `fn updated_at()`, `fn cursor_timestamp(sort)`, and
`fn to_entity_reference()`. The SQL is a `UNION ALL` of per-type lightweight `(item_type, id, sort_ts)`
"top" clauses inside a `TopItems` CTE, keyset-paginated on `(sort_ts, id)`, then hydrated
(`crates/soup/src/outbound/pg_soup_repo/expanded/dynamic.rs:1236-1298`):

```rust
builder.push("TopItems AS (");
builder.push("SELECT all_items.item_type, all_items.id, all_items.sort_ts FROM (");
if include_documents { push_union_separator(…); builder.push(document_top_clause(sort_method, …)); … }
if include_chats     { push_union_separator(…); builder.push(chat_top_clause(sort_method)); … }
if include_projects  { push_union_separator(…); builder.push(project_top_clause(sort_method)); … }
if !needs_separator {
    builder.push("SELECT 'document'::text as item_type, NULL::text as id, NULL::timestamptz as sort_ts WHERE false");
}
builder.push(") all_items ");
```

Note the `WHERE false` empty-union fallback — a nice trick to keep the SQL valid when every branch
is pruned. And note the pruning itself: `properties_filter_can_apply_to()` and
`*_filter_is_impossible()` (`dynamic.rs:1144-1158`, `887-922`) statically prove a whole entity type
cannot match and drop its UNION branch entirely. That is real query planning at the AST level.

### Mechanism D — query-time join instead of a stored timeline

**This is the mechanism most likely to be misunderstood, so be precise.** A company's email history
is not stored against the company. When the frontend opens Acme's record it posts to `/soup/ast`
with `ecd: ["acme.com"]` (`crates/soup/src/inbound/axum_router.rs:1113`):

```rust
/// CRM-scoped domain filter (wire key: `ecd`). Parallel to the freeform `ef` AST.
/// Expanded by the router into an any-direction OR sub-tree AND-merged into `ef`,
/// plus a `CrmScope` tag stamped on the resulting EmailFilterAst::crm_scope.
/// Drives the per-team CRM authorization pre-check and candidate-set widening downstream.
#[serde(default, rename = "ecd", skip_serializing_if = "Vec::is_empty")]
pub email_crm_domains: Vec<String>,
```

The server expands that into `Sender(Domain) OR Recipient(Domain) OR Cc(Domain) OR Bcc(Domain)`
(`item_filters::ast::email::expand_crm_scope`, `crates/item_filters/src/ast/email.rs:219-241`) **and**
stamps a `CrmScope` tag. The tag's docstring (`crates/item_filters/src/ast.rs:100-120`) states the
two effects exactly:

> *"Carried alongside the email AST through `EntityFilterAst` and into the email service, where it
> drives: 1. authorization (each domain/address must pass a CRM pre-check), and 2. candidate-set
> widening (the dynamic query expands from the caller's single `link_id` to every team member's
> `link_id`)."*

**Candidate-set widening is the whole "shared memory" trick.** Normally you only search your own
inbox. When the query is CRM-scoped and the domain passes the pre-check, the query widens to
*every team member's connected mailbox*. So a new rep opening Acme sees three years of the previous
rep's correspondence — without any of it being copied, forwarded, or stored twice.

The authorization gate is `CrmScopePrecheck` (`crates/crm/src/domain/model.rs:199`), which returns
per-domain `{exists, company_hidden, email_sync}` and a team-level `crm_enabled` killswitch. You
cannot use `ecd` to fish through your colleagues' mail for a domain that isn't a tracked CRM company.

**Trade-offs, stated honestly:**
- ✅ Zero write amplification, zero backfill, never stale, no dual-write bug class.
- ✅ Retroactive: enable the CRM today, get the full history instantly.
- ❌ Read cost scales with mailbox size and team size; needs excellent indexes.
- ❌ Only works for entity types that carry the identifying key (email address / domain). It does
  **not** work for calls, tasks, or docs — see §6.

### What "shared memory" does **not** cover

Grepping `crates/call/src` and `crates/documents/src` for CRM references yields **nothing** except
one permission helper in a test file
(`crates/documents/src/inbound/axum_router/tests.rs:623`). **Calls, tasks, and documents have no
first-class CRM attachment.** The only path is a manually-set `ENTITY` property, or the automatic
`Companies` stamp on email *attachments*. A phone call in Macro does not appear on a company record.

---

## 3. `filter_ast` — yes, it is the segmentation engine, and it is very good

### 3.1 The core: a generic boolean expression tree, 142 lines

`crates/filter_ast/src/lib.rs:67-95` is the entire public data type:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Expr<B> {
    #[serde(rename = "&")] And(Box<Self>, Box<Self>),
    #[serde(rename = "|")] Or(Box<Self>, Box<Self>),
    #[serde(rename = "!")] Not(Box<Self>),
    #[serde(rename = "l")] Literal(B),
}
```

Generic over the literal type `B`, single-character serde keys (wire size matters when the whole
filter round-trips in a URL/cursor), and it implements `recursion::{Collapsible, Expandable,
MappableFrame}` so folds over the tree are stack-safe rather than naively recursive
(`filter_ast/src/lib.rs:102-142`). It also ships two combinator traits — `TryExpandNode::try_expand`
and `FoldTree::fold_with` — that turn `Vec<T>` into `Expr<T>` folded with `Expr::or` / `Expr::and`,
which is how every typed filter is built.

### 3.2 The per-entity literal types

`crates/item_filters/src/ast.rs:178-219` — one tree per entity type, wire keys abbreviated:

```rust
pub struct EntityFilterAst {
    #[serde(default, rename = "df")]    pub document_filter:       LiteralTree<DocumentLiteral>,
    #[serde(default, rename = "pf")]    pub project_filter:        LiteralTree<ProjectLiteral>,
    #[serde(default, rename = "cf")]    pub chat_filter:           LiteralTree<ChatLiteral>,
    #[serde(default, rename = "ef")]    pub email_filter:          EmailFilterAst,
    #[serde(default, rename = "chanf")] pub channel_filter:        LiteralTree<ChannelLiteral>,
    #[serde(default, rename = "cthf")]  pub channel_thread_filter: LiteralTree<ChannelThreadLiteral>,
    #[serde(default, rename = "callf")] pub call_filter:           LiteralTree<CallLiteral>,
    #[serde(default, rename = "ccf")]   pub crm_company_filter:    LiteralTree<CrmCompanyLiteral>,
    #[serde(default, rename = "fef")]   pub foreign_entity_filter: LiteralTree<ForeignEntityLiteral>,
    #[serde(default, rename = "propf")] pub properties_filter:     LiteralTree<PropertiesLiteral>,
}
pub type LiteralTree<T> = Option<Arc<Expr<T>>>;   // Arc = cheaply cloneable
```

The CRM company literal set is deliberately minimal (`crates/item_filters/src/ast/crm_company.rs:9`):

```rust
pub enum CrmCompanyLiteral {
    #[serde(rename = "id")]     Id(Uuid),
    #[serde(rename = "hidden")] Hidden(bool),
}
```

**All real CRM segmentation happens through `PropertiesLiteral`, not `CrmCompanyLiteral`.** That is
the payoff of putting Stage/Owner/Revenue in the EAV store — every filter written for tasks works
for companies for free. `crates/item_filters/src/ast/properties.rs:136`:

```rust
pub struct PropertiesLiteral {
    #[serde(rename = "pd")] pub property_definition_id: Uuid,
    #[serde(default, rename = "et", skip_serializing_if = "Option::is_none")]
    pub entity_type: Option<PropertyEntityType>,   // None = match across all entity types
    #[serde(rename = "v")]  pub value: PropertyMatchValue,
}

pub enum PropertyMatchValue {
    #[serde(rename = "so")] SelectOption(Uuid),      // `?` jsonb operator on values->'value'
    #[serde(rename = "er")] EntityRef(EntityRefId),  // `@>` jsonb operator on values->'value'
}
```

Which compiles to an EXISTS subquery
(`crates/soup/src/outbound/pg_soup_repo/expanded/dynamic.rs:813-857`, `build_properties_filter`):

```
AND EXISTS (SELECT 1 FROM entity_properties ep_prop
            WHERE ep_prop.entity_id = <entity_id_sql> AND … )
```

### 3.3 Security engineering inside the AST — worth copying wholesale

Because these values are interpolated into dynamically built SQL, the AST types carry the
validation. `crates/item_filters/src/ast/properties.rs`:

```rust
/// The entity type for property lookups in the `entity_properties` table.
/// Using a closed enum prevents SQL injection through the `entity_type` field,
/// which is interpolated into dynamic SQL queries.
pub enum PropertyEntityType { Channel, Chat, Company, Document, Project, Task, Thread, User }

/// A validated entity reference ID that is safe for SQL interpolation.
/// Rejects strings containing single quotes, backslashes, or null bytes.
pub struct EntityRefId(String);
impl EntityRefId {
    pub fn new(s: String) -> Result<Self, EntityRefIdError> {
        if s.contains('\'') || s.contains('\\') || s.contains('\0') { return Err(EntityRefIdError(s)); }
        Ok(Self(s))
    }
}
```

And `CrmScope` has a **hand-written `Deserialize`** that rejects the empty-vector case
(`crates/item_filters/src/ast.rs:122-142`) because "an empty scope tag would desynchronize
downstream auth/widening behavior from AST intent."

### 3.4 Authorization derived from the AST, not from the endpoint

`crates/item_filters/src/ast.rs:269-314` — the filter tree itself is inspected to decide what
permission the request needs:

```rust
/// True when this filter asks the query to expand visibility across the requesting
/// user's team via a CRM-scoped email attribute. Queries carrying it require a team receipt.
pub fn requests_crm_scope(&self) -> bool { self.email_filter.crm_scope.is_some() }

/// True when this filter asks for data only admin/owner team members may see
pub fn requests_crm_admin(&self) -> bool {
    self.crm_company_filter.as_deref().is_some_and(crm_company_requests_admin)
}

fn crm_company_requests_admin(expr: &Expr<CrmCompanyLiteral>) -> bool {
    match expr {
        Expr::Literal(CrmCompanyLiteral::Hidden(true)) => true,
        Expr::Literal(_) => false,
        Expr::And(a, b) | Expr::Or(a, b) => crm_company_requests_admin(a) || crm_company_requests_admin(b),
        Expr::Not(a) => crm_company_requests_admin(a),   // conservative: NOT still counts
    }
}
```

The `Not` arm recursing rather than negating is deliberate and correct — a role gate must be
conservative. This pattern (walk the user's filter, derive the required permission, then check it)
is the right answer to "how do I let users write arbitrary filters without leaking data," and it
transfers directly to Supabase RLS + a server-side filter compiler.

### 3.5 Saved views

**Three tiers, all storing the same opaque config blob.** Whole feature lives in
`apps/web/src/features/companies/crm/saved-views.ts`:

```ts
export type CrmViewConfig = {
  kind: 'crm';
  filters?: unknown;                              // server query filters (soup `Query`)
  clientFilters?: { and?: string[]; or?: string[] };  // client predicate ids
  searchText?: string;
  groupBy?: string | null;                        // e.g. `property:<definition-id>`
  sort?: string[];
  viewMode?: 'list' | 'board';
  stageFilter?: string[];                         // may include NO_STAGE
  ownerFilter?: string[];
  activeTab?: string;
  isDefault?: boolean;                            // personal views only
};
```

1. **Personal** — a generic `/saved_views` REST resource with an arbitrary JSON `config`
   (`storageServiceClient.views.{getSavedViews,createSavedView,patchView,deleteView}`).
2. **Team-shared** — `team_crm_settings.team_views jsonb NOT NULL DEFAULT '[]'` +
   `default_team_view_id text`, commented *"Opaque array of team saved views, owned by the
   frontend"* (`20260717161623_team_crm_settings_config.sql`). ⚠️ Written as a **whole-list
   replace, last-write-wins**; the client mitigates clobbering by serializing mutations on
   `scope: { id: 'crm-team-settings' }` (`crm/team-crm-config.ts:114-118`).
3. **Share link** — the same config base64url-encoded into `?crmView=`
   (`buildCrmViewShareUrl`, decoded at `componentRegistry.tsx:319-330`). Zero storage, and it makes
   a view forwardable in Slack.

UI: `apps/web/src/features/next-soup/soup-view/views/companies/CompanyViewsMenu.tsx` (save, rename,
delete, pin-as-default, copy-link); application `use-apply-crm-view.ts`; default-on-open
`CrmDefaultView.tsx` (personal default beats team default, one-shot).

The lesson: **you do not need to model saved views in your database.** Store the serialized filter
AST as JSON, let the client own the shape, and iterate at UI speed. The three-tier
personal/team/URL split costs almost nothing extra and covers every real sharing need.

### 3.6 The same AST powers the AI agent

`crates/soup/src/inbound/toolset/list_entities.rs` and `crates/crm/src/inbound/toolset/list_companies.rs`
expose the identical filter machinery as LLM tools (`ai_toolset::AsyncTool`, `schemars::JsonSchema`
on the arg structs). One query language, three consumers: the UI, the REST API, and the agent. For
an AI VoiceTech product this is the correct architecture and it costs nothing extra if the filter
layer is designed as data from day one.

---

## 4. `frecency` — how things get surfaced

### 4.1 Storage: event log + materialized aggregate

`crates/macro_db_client/migrations/20251029143441_add_frecency_table.sql`:

```sql
CREATE TABLE frecency_events (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    event_type TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    connection_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    was_processed BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_frecency_events_unprocessed ON frecency_events(was_processed) WHERE was_processed = false;

CREATE TABLE frecency_aggregates (
    id BIGSERIAL PRIMARY KEY,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    user_id TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    frecency_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    first_event TIMESTAMP WITH TIME ZONE NOT NULL,
    recent_events JSONB NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT unique_user_entity UNIQUE (user_id, entity_type, entity_id)
);
CREATE INDEX idx_frecency_aggregates_user_score ON frecency_aggregates(user_id, frecency_score DESC);
```

Write-fast/read-fast split: events append with a partial index on the unprocessed tail; a polling
aggregator (`crates/frecency/src/inbound/polling_aggregator.rs`) drains them into the aggregate.
`recent_events` is a bounded JSONB ring of the last 10 `{timestamp, weight}` pairs, kept **on the
aggregate row** so recomputing the decayed score never re-reads the event log.

### 4.2 The algorithm — `crates/frecency/src/domain/models.rs:184-316`

```rust
impl WeightForAction for FrecencyAction {
    fn get_weight(&self) -> f64 {
        match self {
            FrecencyAction::Open  =>  2.0,
            FrecencyAction::Ping  =>  0.0,
            FrecencyAction::Close => -1.0,
        }
    }
}

const MAX_RECENT_EVENTS: usize = 10;   // ring size
const RECENCY_DECAY_RATE: f64  = 0.1;  // per hour; larger = faster decay
const FREQUENCY_PERCENT: f64   = 0.7;  // recency weight = 1.0 - this
```

```rust
fn calc_frequency(&self) -> f64 {
    // we add 2 to avoid log(0) and log(1)
    (self.data.event_count.to_f64().unwrap_or_default() + 2.0).log2()
}

fn calc_recency(&self, now: DateTime<Utc>) -> f64 {
    self.data.recent_events.iter().fold(0.0, |acc, cur| {
        let delta_hours = now.signed_duration_since(cur.timestamp).num_hours();
        if delta_hours < 0 { return acc; }                       // clock skew guard
        let decay_factor = (-RECENCY_DECAY_RATE * hours).exp();  // e^(-0.1h)
        acc + (decay_factor * cur.weight)
    })
}

fn calc_frecency(&self, now: DateTime<Utc>) -> f64 {
    let recency_percent = 1.0 - FREQUENCY_PERCENT;
    (FREQUENCY_PERCENT * self.calc_frequency()) + (recency_percent * self.calc_recency(now))
}
```

So: **`score = 0.7·log₂(count+2) + 0.3·Σ(weight · e^(−0.1·hours_ago))` over the last 10 events.**
Half-life of the recency term is `ln2/0.1 ≈ 6.9 hours` — tuned for a workday tool, aggressively
short for a sales cycle. Closing something *subtracts* (−1.0), which is a genuinely clever
"I'm done with this, stop showing it to me" signal.

Two engineering details worth copying: `now` is a **parameter**, never `Utc::now()` inside the
calculation (so it is pure and unit-testable — `crates/frecency/src/domain/models/tests.rs`), and
the negative-delta guard means clock skew degrades gracefully instead of producing `e^(+x)` blowups.

### 4.3 Where it surfaces

- **A sort mode of the feed — in the API only.** `SoupQuery::Frecency(FrecencyQueryInner(...))`
  exists alongside `SoupQuery::Simple` (`crates/soup/src/inbound/axum_router.rs`) and the score
  rides on every item as `frecency_score` / `frecencyScore`. ⚠️ **But it is dark in the product.**
  The frontend explicitly excludes it —
  `apps/web/src/features/next-soup/soup-view/soup-view-context.tsx:257-266`:
  ```ts
  type ApiSortMethod = Exclude<NonNullable<SoupParams['sort_method']>, 'frecency'>;
  const VALID_API_SORT_METHODS: ApiSortMethod[] = ['viewed_at','created_at','updated_at','viewed_updated'];
  ```
  Grouped queries silently downgrade `frecency → updated_at`
  (`apps/web/src/lib/queries/soup/items.ts:169-171`) and the GraphQL path hard-rejects it
  (`apps/web/src/lib/queries/soup/graphql-ast.ts:472`: `return unsupported('sort_method frecency')`).
  What actually surfaces in the UI is the simpler `viewed_updated` sort
  (`COALESCE(UserHistory."updatedAt", crm_companies.last_interaction)`) in Quick Access and the
  `@`-mention palette (`apps/web/src/lib/queries/soup/quick-access-crm-companies.ts`). **Macro built
  the whole frecency pipeline and never shipped a UI for it** — take that as a warning about
  sequencing, not as an argument against the algorithm.
- **A *negative* filter** — `exclude_frecency` in
  `crates/soup/src/outbound/pg_soup_repo/expanded/dynamic.rs:1300-1311`:
  ```rust
  builder.push(r#"LEFT JOIN frecency_aggregates fa
                    ON fa.entity_id = all_items.id
                   AND fa.entity_type = all_items.item_type
                   AND fa.user_id = $1
                  WHERE fa.id IS NULL AND ("#);
  ```
  i.e. "show me everything I have **not** touched." For a sales rep that is literally the
  neglected-accounts report, and it comes free.
- **Frecency queries accept the full `EntityFilterAst`** (`FrecencyPageRequest.filters`,
  `crates/frecency/src/domain/models.rs:341-351`) — "most-relevant-to-me *within this segment*".

---

## 5. Pipeline / deal management — the honest answer

**There is no deal object. The company *is* the deal.**

Evidence:
- No `crm_deals`, `crm_opportunities`, `crm_pipelines`, or `crm_stages` table exists anywhere in
  `crates/macro_db_client/migrations/` (243 files; the CRM-touching set is enumerated in §1).
- Pipeline state is three **system properties on the company entity**
  (`crates/system_properties/.../system_property_key.rs:99-102`): `Stage` (SELECT_STRING),
  `CompanyOwner` (ENTITY→USER), `Revenue` (NUMBER).
- `SystemPropertyKey::required_property_ids_for_entity(EntityType::Company)` returns exactly
  `[STAGE_UUID, COMPANY_OWNER_UUID, REVENUE_UUID]` — these three are non-removable on a company.
- The stage vocabulary is seeded once, globally: `Lead → Qualified → Demo → Trial → Negotiation →
  Customer → Churned` (`20260707183206_seed_crm_company_system_properties.sql`).
- The CRM REST router (`crates/crm/src/inbound/axum_router/mod.rs:121-171`) has **twelve** routes and
  **not one of them touches stage, owner, or revenue**:
  ```
  POST   /companies
  PUT    /companies/{id}/email-sync
  PUT    /companies/{id}/hidden
  PUT    /companies/{id}/name
  GET    /companies/{id}
  GET    /companies/{id}/contacts      POST /companies/{id}/contacts
  GET    /contacts/{id}
  PUT    /contacts/{id}/hidden
  PUT    /contacts/{id}/name
  GET/POST   /comments/{entity_type}/{entity_id}
  PATCH/DEL  /comment/{comment_id}
  GET/PUT    /settings
  ```
  Moving a deal is `PUT /properties/entities/company/{id}/{STAGE_UUID}` — the *generic* properties
  endpoint (`crates/properties/src/inbound/axum_router.rs:148-152`).

### What genuinely exists

| Deal capability | Present? | Where |
|---|---|---|
| Stage | ✅ | system property `0x10`, 7 seeded options |
| Deal owner | ✅ | system property `0x11`, ENTITY→USER |
| Deal value | ✅ | system property `0x12`, NUMBER |
| Kanban board | ✅ | `GroupByField::Property { property_definition_id }` — §5.1 |
| Closed-stage semantics | ✅ | `team_crm_settings.closed_stage_ids uuid[]` |
| Role-gated stage editing | ✅ | `edit_stages_role`, `move_closed_deals_role`, `delete_records_role` |
| Per-team custom stage sets | ⚠️ | possible via team-owned property definitions; the *seeded* set is global |
| **Multiple concurrent deals per company** | ❌ | impossible — one `Stage` value per company (`is_multi_select = false`, `UNIQUE(entity_id, entity_type, property_definition_id)`) |
| **Close date / expected close** | ❌ | not modeled |
| **Win/loss reason** | ❌ | not modeled |
| **Stage-transition history / velocity** | ❌ | no audit table; `entity_properties` is last-write-wins |
| **Forecasting / weighted pipeline** | ❌ | absent |
| **Products / line items / quotes** | ❌ | absent |
| **Activities, next steps, tasks-on-deal** | ❌ | absent (tasks exist as Documents; no CRM link) |

### 5.1 How the kanban board actually works

`crates/models_grouping/src/field.rs:9`:

```rust
pub enum GroupByField {
    #[default] Date,        // smart buckets: Today, Yesterday, This Week
    EntityType,
    Project,
    Property {              // ← this is the kanban
        property_definition_id: Uuid,
        #[serde(skip_serializing_if = "Option::is_none")]
        entity_type: Option<String>,
    },
}
impl GroupByField {
    pub fn requires_property_join(&self) -> bool { matches!(self, GroupByField::Property { .. }) }
}
```

Group the soup feed by `Property { property_definition_id: STAGE_UUID }` and you get a board.
`crates/soup/src/domain/models/grouping.rs:36-53` returns per-group metadata with
**per-column pagination cursors**:

```rust
pub struct GroupMeta {
    pub key: String,
    pub label: String,                    // "Not Set" when key.is_empty()
    pub display_order: Option<i32>,       // i32::MAX for the unset bucket → sorts last
    pub total_count: u32,                 // total across ALL pages, not just this one
    pub item_ids: Vec<Uuid>,
    pub next_cursor: Option<String>,      // load more from THIS column only
}
pub struct GroupedResponse {
    pub items: HashMap<Uuid, EnrichedSoupItem>,  // normalized pool
    pub groups: Vec<GroupMeta>,                  // ordering lives in groups[].item_ids
    pub page_cursor: Option<String>,
}
```

`total_count` per group with independent per-column cursors is exactly right for a kanban with
600 leads in "New" — the column header shows the true count, the column lazy-loads. The
normalized `items` pool + `item_ids` ordering is the same shape as a well-designed Redux store.

**Verdict on §5:** Macro's pipeline is a *lightweight account-status tracker*, not deal management.
It is correct for their ICP (a workspace where "the customer" is the unit). For a roofing sales team
where one homeowner can have a roof job, a gutter job, and a storm-damage claim, **company-as-deal
is a modeling error Rob should not copy.** The *grouping/kanban mechanism* is worth copying; the
*single-stage-on-the-company* schema is not.

---

## 6. Activity timeline — how the unified feed on a record is assembled

There is **no `activities` table**. The timeline is assembled at read time, in three layers.

**Layer 1 — the request.** The client posts `/soup/ast`
(`crates/soup/src/inbound/axum_router.rs:620-623`: `GET /soup`, `POST /soup`, `POST /soup/ast`,
plus a grouped variant) carrying an `ApiEntityFilterAst` with `ecd: ["acme.com"]`.

**Layer 2 — expansion + authorization.** The router calls
`item_filters::ast::email::expand_crm_scope(email_crm_domains, email_crm_addresses)`
(`axum_router.rs:1225`), which:
- rejects `ecd` and `eca` both being set (`ExpandErr::CrmDomainsAndAddressesMutuallyExclusive`),
- validates every value is a bare domain (`looks_like_domain`, `crates/item_filters/src/ast/email.rs:24`)
  or a fully-qualified address, lowercasing as it goes,
- folds them into `Sender|Recipient|Cc|Bcc` OR-trees AND-merged into the existing `ef` tree,
- stamps `CrmScope::Domains(vec)` on `EmailFilterAst.crm_scope`.

Then `EntityFilterAst::requests_crm_scope()` forces a team receipt, and `crm_scope_precheck`
(`crates/crm/src/domain/companies_repo.rs:448`, impl at
`crates/crm/src/outbound/companies_repo.rs:1274-1382`) returns `CrmScopePrecheck { crm_enabled,
domains: Vec<CrmDomainStatus>, addresses: Vec<CrmAddressStatus> }`. Each status carries
`{exists, company_hidden, email_sync}`; cross-team contacts report `exists = false` **specifically
so existence does not leak across tenants** (`crates/crm/src/domain/model.rs:236-240`). Failure →
`SoupErr::CrmTeamRequired` → `SoupHandlerErr::CrmScopeForbidden`
(`crates/soup/src/inbound/axum_router.rs:702-723`).

**Layer 3 — the widened UNION query.** With the scope tag present, the email service widens the
candidate mailbox set from the caller's single `link_id` to every team member's `link_id`, and the
soup repo runs the `TopItems` UNION ALL described in §2C, keyset-paginated on `(sort_ts, id)`.
Sort modes are `SimpleSortMethod::{ViewedAt, UpdatedAt, CreatedAt, ViewedUpdated}` with per-variant
timestamp selection in `SoupItem::cursor_timestamp` (`crates/models_soup/src/item.rs:94-160`) — note
email always uses a precomputed `thread.sort_ts` "which is also what the cursor offset logic uses."

**What lands in that timeline:** email threads (via `ecd`), plus any Document / Chat / Project /
Call / ForeignEntity that the *properties* filter matches (via an `EntityRef` to the company).
**What does not:** calls and tasks, unless someone manually attached an ENTITY property. There is no
automatic call→company or task→company linkage anywhere in the codebase.

### ⚠️ And in the shipped UI there is no unified per-record timeline at all

The backend machinery above is real, but the company/contact record does **not** render a merged
feed. `apps/web/src/features/companies/Company/Company.tsx` renders, in order: `CompanyHeader` →
`CompanyDiscussionSection` (comments) → `CompanyEmailsSection`, with right-rail sections Details /
Properties / Contacts / Sharing. Two separate lists, not one timeline.

`apps/web/src/features/activity-timeline/` **is a global `/activity` view only** — grep across
`apps/web/src` shows it is imported nowhere except `componentRegistry.tsx`. Its verb vocabulary
(`timeline-types.ts`) contains no CRM events at all:

```ts
export type EntityEventVerb =
  | 'sent-message' | 'replied-in-thread' | 'sent-email' | 'drafted-email'
  | 'email-activity' | 'created-document' | 'edited-document'
  | 'created-task' | 'edited-task' | 'created-folder'
  | 'agent-chat' | 'attended-call';
```

No `stage-changed`, no `contact-added`, no `property-updated`. And both detail views carry the same
in-code TODO:

```tsx
{/* TODO: add a References section (inbound channel messages + documents)
    once the references backend supports the crm_company entity type. */}
```

**So: MLE's `ActivityTimeline` on `/people/[id]` and `/companies/[id]`, fed by a real `activities`
table with a `status_change` audit trail, is a *more complete* record timeline than what Macro
actually ships.** Macro's advantage is the *ingestion* side (§2D), not the rendering side.

**Notes/comments are a separate, stored thing** — `crm_thread` / `crm_comment`
(`20260527194808_create_crm_comments.sql`), deliberately mirroring the document comment shape:

```sql
CREATE TABLE crm_thread (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid REFERENCES crm_companies(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES crm_contacts(id)  ON DELETE CASCADE,
    owner text NOT NULL REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    resolved boolean NOT NULL DEFAULT false,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT crm_thread_one_parent CHECK (num_nonnulls(company_id, contact_id) = 1)
);
CREATE TABLE crm_comment (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES crm_thread(id) ON DELETE CASCADE,
    owner text NOT NULL REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    sender text, text text NOT NULL, "order" integer, metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
```

The `num_nonnulls(company_id, contact_id) = 1` check constraint is the clean way to do
"exactly one polymorphic parent" when you only have two options — worth copying. The migration
comment says it plainly: *"Mirrors the document Thread/Comment shape closely enough that the
frontend reuses the same assembly/rendering logic."* Reusing the comment renderer across four
entity types is a real cost saving.

---

## 7. Enrichment, dedupe, merge

### 7.1 Enrichment — covered in §1.2/§1.3

Global domain-keyed cache, Apollo primary + unfurl fallback, negative caching, raw payload retained.
`enriched_at` supports re-enrichment policy. **Contact-level (person) enrichment does not exist** —
only company/domain. No email verification, no phone append, no title/seniority.

### 7.2 Dedupe — three layers, all cheap

**(a) Identity dedupe by database constraint.** No fuzzy matching anywhere:
- companies: `UNIQUE INDEX crm_domains_team_id_lower_domain_unique ON crm_domains (team_id, LOWER(domain))`
- contacts: `UNIQUE (company_id, email)`
- sources: `UNIQUE (contact_id, link_id)`

**(b) An advisory lock in front of the upsert.** `crates/crm/src/outbound/companies_repo.rs:287-431`,
`populate_contact`, begins:

```rust
let normalized_domain = domain.to_ascii_lowercase();
let normalized_email  = email.to_ascii_lowercase();
let mut tx = self.pool.begin().await?;
// Serialize on (team, lower(domain)): the unique constraint on crm_domains catches
// the race only after an orphan crm_companies row was already inserted by the loser.
Self::lock_team_domain(&mut tx, team_id, &normalized_domain).await?;
```

**(c) Producer-side dedupe before the queue.** `services/email_service/src/pubsub/util.rs:205-248`,
`enqueue_populate_crm_contacts` — normalize, drop malformed, drop self, collapse duplicates *within
the batch* via a `HashSet`, then one SQS message per distinct contact. "Dedup is by email only, so
the first name / timestamps seen for a given address in this batch win."

**(d) Merge semantics as SQL, not application logic.** The upsert is the merge
(`companies_repo.rs:387-411`):

```sql
INSERT INTO crm_contacts (company_id, email, name, first_interaction, last_interaction, hidden)
VALUES ($1, $2, $3, $4, $5, $7)
ON CONFLICT (company_id, email) DO UPDATE
    SET name = COALESCE(crm_contacts.name, EXCLUDED.name),      -- first non-NULL name wins
        updated_at = now(),
        first_interaction = CASE
            WHEN $6 THEN LEAST(crm_contacts.first_interaction, EXCLUDED.first_interaction)
            ELSE crm_contacts.first_interaction
        END,
        last_interaction = GREATEST(crm_contacts.last_interaction, EXCLUDED.last_interaction)
RETURNING id
```

`COALESCE` for the name, `LEAST`/`GREATEST` for the interaction window, `hidden` left untouched on
conflict so a prior manual hide survives. **Idempotent, order-independent, concurrency-safe, zero
application-side merge code.** This is the single best-engineered function in the CRM.

**(e) Direction gating.** `if existing.is_none() && !is_sent { return Ok(()); }` — *received* mail
never creates a company. You have to have emailed them. That one line is what keeps the CRM from
filling up with inbound spam, and it is worth more than any spam filter.

### 7.3 Junk suppression — `generic_email_domains`

`crates/crm/src/domain/generic_email_domains.rs` is 682 lines holding ~490 curated domains in six
categories, unioned with reserved-TLD suffix rules:

```rust
pub(crate) fn is_generic_email_domain(domain: &str) -> bool {
    let normalized = normalize_domain(domain);   // trim, lowercase, strip leading "www."
    if normalized.is_empty() { return false; }
    if matches_reserved_tld(&normalized) { return true; }
    contains_ci(CONSUMER_EMAIL_DOMAINS,  &normalized)
        || contains_ci(DISPOSABLE_EMAIL_DOMAINS, &normalized)
        || contains_ci(ALIAS_FORWARDER_DOMAINS,  &normalized)
        || contains_ci(SAAS_VENDOR_DOMAINS,      &normalized)
        || contains_ci(CONSUMER_BRAND_DOMAINS,   &normalized)
        || contains_ci(BULK_SENDER_DOMAINS,      &normalized)
}
```

The module docstring is the product spec, and it is sharp:

> *"a flood of automated mail from `github.com`, `stripe.com`, `amazon.com`, or `marriott.com` is
> product/billing/marketing traffic, not a business relationship, and would seed the CRM with rows
> nobody is selling to or buying from. We do NOT block law firms, banks, funds, or corporates that
> show up as real correspondents — only tools, consumer brands, and bulk senders."*

It composes with a separate **local-part** filter (`email_utils::is_generic_email` — `noreply@`,
`support@`, role accounts). Both are needed; neither is sufficient.

⚠️ **For roofing this list needs surgery, not adoption.** Macro blocks `gmail.com`, `yahoo.com`,
`aol.com` — which for a residential roofing contractor are *the customers*. The right adaptation is
to keep the **structure** (six categories, composable, suffix rules), keep DISPOSABLE / ALIAS /
BULK_SENDER wholesale, and **invert the consumer-provider rule**: for a B2C roofer, a Gmail address
is a lead, not noise. The Macro rule "personal domain ⇒ not a company" becomes "personal domain ⇒
person-only record, no company row" — which is a *modeling* decision, not a *drop* decision.

### 7.4 Merge (manual) — does not exist

There is **no user-facing merge**: no "merge these two companies," no "this contact is the same
person," no survivorship rules, no merge audit. Deletion is `hidden = true`
(`20260521203029_crm_hidden.up.sql`) with partial indexes on the visible set:

```sql
CREATE INDEX crm_companies_visible_team_id_idx ON crm_companies (team_id) WHERE hidden = FALSE;
CREATE INDEX crm_contacts_visible_company_id_idx ON crm_contacts (company_id) WHERE hidden = FALSE;
```

Hide is a *cascade*: hiding a company forces `email_sync = false` and cascades `hidden` onto its
contacts (`crates/crm/src/domain/service.rs`, `CrmError::CompanyHidden` guards re-enabling sync on a
hidden company).

### 7.5 Deferred GC — a nice piece of operational engineering

`20260723160259_crm_cleanup_tables.sql` replaces per-delete depopulate messages with a nightly sweep:

```sql
CREATE TABLE crm_cleanup_candidates (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    link_id UUID NOT NULL REFERENCES email_links (id) ON DELETE CASCADE,
    contact_email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_crm_cleanup_candidate ON crm_cleanup_candidates (link_id, contact_email);

CREATE TABLE crm_cleanup_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status crm_cleanup_job_status NOT NULL DEFAULT 'Init',   -- Init|InProgress|Complete|Failed
    total_candidates BIGINT NOT NULL,
    dispatched_count BIGINT NOT NULL DEFAULT 0,
    max_candidate_id BIGINT NOT NULL,   -- MAX(candidates.id) at kickoff; job only processes id <= this
    …
);
CREATE UNIQUE INDEX uq_active_crm_cleanup_job ON crm_cleanup_jobs ((TRUE))
    WHERE status IN ('Init', 'InProgress');
```

Three patterns worth stealing: the unique index collapsing a bulk delete into one pending row, the
`max_candidate_id` high-water mark so the job has a fixed frontier while new work arrives, and
`UNIQUE INDEX ON (…) ((TRUE)) WHERE status IN (…)` as a **singleton-job lock enforced by Postgres**.
That last one is a one-line replacement for a distributed lock and works perfectly on Supabase.

### 7.6 Not the CRM: `crates/contacts`

Worth flagging so nobody chases it. `crates/contacts` and `services/contacts_service` are **not**
CRM contacts — they are an internal user-to-user social graph among *Macro users*
(`20260126191437_contacts_db_schema.sql`):

```sql
CREATE TABLE contacts_connections (
    id SERIAL PRIMARY KEY,
    user1 TEXT NOT NULL, user2 TEXT NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user1, user2),
    CHECK(user1 <= user2 COLLATE "C")     -- canonical ordering: one row per unordered pair
);
```

The `CHECK(user1 <= user2 COLLATE "C")` + `UNIQUE(user1,user2)` pair is the correct way to store an
undirected edge exactly once, and `20260429120000_contacts_no_self_connection.sql` adds the
self-edge guard. **That is directly relevant to Rob's referral-edge model** — see the gap table.
`crates/contacts/src/domain/models/graph.rs` is a small in-memory undirected graph with
pointer-identity vertices used for clique/suggestion computation.


---

## 8. What MLE ROB Dashboard already has

Full inventory established from `/Users/robertacheson/Projects/MyLocalEverything/MLE ROB Dashboard`
(`docs/plans/PRD-mle-crm.md`, `supabase/migrations/0001`–`0013`, `app/`, `lib/`, `components/`).
Stack: **Next.js 16.2.10 App Router + React 19 + TypeScript 5 + Tailwind 4 + Supabase + Vercel**,
Vitest (~784 tests), CR-3 house rule (*rules ship as pure unit-tested TS modules; clocks injected*).

### 8.1 Entities that exist

| Entity | Table | Migration | State |
|---|---|---|---|
| People | `people` | `0001_network.sql` | live, ~22 rows |
| Companies | `orgs` | `0003_orgs_split.sql` | live, ~18 rows (column-mirror of `people`) |
| Membership | `org_memberships` | `0003` | M:N, `is_primary`, `role_at_org` |
| Verticals | `verticals` | `0001` | the clustering dimension |
| **Referral edges** | `edges` | `0001` + `0003` | 47 rows, paired-nullable person/org FK both ends |
| **Deals** | `deals` | `0005_crm_core.sql` | live, 12 DB-checked stages |
| **Activities** | `activities` | `0005` | live — the timeline |
| **Tasks** | `tasks` | `0005` | live |
| Flags | `flags` | `0004` | findings ledger |
| Documents / e-sign | `documents`, `signature_requests`, `signature_events` | `0008`–`0010` | schema live, prod empty |
| Invoices | `invoice_ledger`, `…_sync_runs` | `0012` | 2 real rows |
| Dedupe queue | `dedup_review` | ⚠️ **no migration file** — prod drift | live |
| Read models | `rm_pipeline`, `rm_esign_status`, `rm_action_items`, `rm_nudge_activity`, `rm_invoices_ar` | `0011`, `0013` | live, `dashboard_ro` role |

### 8.2 Where MLE is genuinely **ahead of Macro**

Worth stating plainly before the gap table, because the gap table is one-directional by construction:

1. **Real deal objects.** `deals` is a first-class table with 12 stages, `person_id`/`org_id`/`vertical_id`
   anchors, `value`, `routing_lane`, `referral_sourced`, `book_protected`. Macro has no deal object at all (§5).
2. **Explainable weighted scoring.** `lib/scoring/deal.ts` — weights summing to 1.0
   (stage .30 / freshness .25 / value .20 / referral .15 / coverage .10), `STAGE_LADDER` 0–100,
   A–F grades, and a `breakdown[]` of `{signal, raw, weight, weighted, evidence}` on every score,
   `asOf` injected, 66 tests. Macro has nothing comparable — frecency is *implicit* relevance, not
   an explainable sales score.
3. **E-sign with a DB-enforced audit chain.** `signature_events` has an append-only trigger that
   raises even for the service role; digest re-verification at sign time is a hard stop; countersign
   is an atomic claim on `countersigned_at IS NULL`. Macro has no e-sign.
4. **Referral lineage that refuses to guess.** `lib/lineage.ts` walks `referred_by_id` back to
   `ORIGIN_ID = "rob-acheson"`, `MAX_HOPS = 10`, and **reports `broken` rather than truncating**.
5. **Typed intake source context.** `lib/leads/sourceContext.ts` — four discriminated shapes
   (`email_reply`, `web_form`, `ad_reel`, `trade_show`). This is Rob's stated differentiator and
   Macro has no analogue.
6. **Read-model contract as code with honest coverage.** `lib/readModel/contract.ts` +
   `source.ts::assertReadable()` + `kpiSummary.ts` emitting `computed | no_data | not_computable`
   — a failed read is never rendered as a zero. Macro has no equivalent discipline.
7. **Dedupe that refuses.** `lib/dedup/merge.ts` refuses (409) any merge where the duplicate carries
   `signed` / `quoted_amount` / `estimate`; `executor.ts::countOrphans` verifies 9 FK surfaces and
   returns −1 on failure, never a reassuring 0. Macro has **no user-facing merge at all** (§7.4).
8. **Full-text search that Macro deleted.** MLE has generated `search_tsv` + GIN on `people` and
   `orgs` (`0007`). Macro *removed* its trigram contact indexes in
   `20260415120000_drop_idx_email_contacts_name_trgm.sql`,
   `20260415200000_drop_email_contact_search_index.sql` and fell back to `ILIKE` substring matching
   in `crates/crm/src/domain/search_repo.rs`.
9. **Tasks and invoices as real entities.** Neither exists in Macro's CRM.

MLE's problem is not that it is behind. It is that it has **eight excellent vertical features and
no horizontal spine.** Macro's problem is the reverse. That framing drives the whole gap table.

---

## 9. Feature-by-feature gap table

**Effort key** (TypeScript + Supabase, one competent engineer):
**S** ≤ 1 day · **M** 2–5 days · **L** 1–3 weeks · **XL** > 3 weeks or blocked on a prerequisite.
**Value** = 1–5 for a roofing-vertical B2B sales team (MLE reps selling into contractors).
**AGPL note:** every "Port" verdict below means *port the design, retype the code*. See the banner at top.

### 9.1 The spine — architecture

| # | Macro capability | How Macro implements it (paths) | MLE has it? | Effort | Val | VERDICT |
|---|---|---|---|---|---|---|
| A1 | **Universal `Entity{type,id}` primitive** — one enum every cross-cutting table keys off | `crates/model-entity/src/lib.rs:34-99`; consumed by `entity_properties`, `favorite`, `frecency_aggregates`, `entity_access`, `foreign_entity`, `import_entity` | ❌ No. MLE uses per-table paired-nullable FKs (`num_nonnulls(person_id, org_id) <= 1`) in `0005`, `0008` | **M** | **5** | **Steal the idea.** Add a Postgres `entity_type` enum (`person, org, deal, activity, task, document, invoice`) + `(entity_type, entity_id)` on *new* cross-cutting tables only. **Do NOT retrofit** `activities`/`documents` — their paired-FK constraints are correct and battle-tested. This is additive spine, not a rewrite. |
| A2 | **`entity_properties` EAV custom-field engine** | `migrations/20251030100000_init_properties_schema.sql` (3 tables, tagged-union JSONB, GIN `jsonb_path_ops`); API `crates/properties/src/inbound/axum_router.rs:105-173` (12 routes) | ❌ **Zero custom fields.** Field sets hard-coded in `lib/types.ts`, whitelisted in `lib/adminEdit.ts::FIELD_MAP` | **M** | **4** | **Port the design.** Three tables + the tagged-union `values` JSONB + the GIN index + the `check_values_structure` CHECK, retyped. This is the single unlock for A3, A4, A5, and every future "can we track X?" request without a migration. |
| A3 | **System properties with deterministic UUIDs** | `crates/system_properties/.../system_property_key.rs:79-103` — `BASE_UUID + 0x01…0x12` macro | ❌ n/a | **S** | 3 | **Steal the idea.** Const-derived UUIDs let seed SQL and TS code agree without a lookup table. Ship with A2. |
| A4 | **`TAG` data type + tag sets** | `20260629214704_tag_property_data_type.sql`, `crates/properties/src/inbound/axum_router/tags.rs` | ❌ | **S** | 3 | **Steal.** Free once A2 lands — one enum value + a list endpoint. Roofing reps want `storm-damage`, `commercial`, `hoa`, `insurance-job`. |
| A5 | **Polymorphic link via `ENTITY` property + `specific_message_id`** | `crates/models_properties/src/shared/entity_reference.rs:11-18`; auto-stamped at `crates/system_properties/src/domain/service.rs:124-193` | ⚠️ Partial — `source_context` JSONB is the ad-hoc seam | **M** | **4** | **Port the design.** An `ENTITY`-typed property *is* a typed named link. Gives MLE "this task belongs to Acme", "this recording came from *this message*" with zero new tables after A2. |

### 9.2 Segmentation and views — table stakes, currently zero

| # | Macro capability | How Macro implements it (paths) | MLE has it? | Effort | Val | VERDICT |
|---|---|---|---|---|---|---|
| B1 | **Serializable boolean filter AST** | `crates/filter_ast/src/lib.rs:67-95` — `Expr<B> = And|Or|Not|Literal`, serde keys `&`/`\|`/`!`/`l` | ❌ **Nothing.** Only client-side sort toggles: `components/PeopleTable.tsx:15` (5 keys), `RepAccountsList.tsx:17` (3 keys) | **M** | **5** | **Port the design.** ~150 lines of TS: a discriminated-union `Expr<L>` + a `compile(expr) → { sql, params }` walker. Everything else in this section depends on it. |
| B2 | **Per-entity typed literals** | `crates/item_filters/src/ast/{document,email,chat,project,call,crm_company,properties}.rs`; bundled in `ast.rs:178-219` | ❌ | **M** | **5** | **Port the design.** `PersonLiteral`, `OrgLiteral`, `DealLiteral{Stage,Owner,ValueGte,RoutingLane,ReferralSourced}`, `ActivityLiteral{Type,Source,OccurredAfter}`, `PropertyLiteral`. |
| B3 | **Property filter → EXISTS subquery** | `crates/item_filters/src/ast/properties.rs:136-201`; SQL at `soup/.../expanded/dynamic.rs:813-857` | ❌ | **S** | 4 | **Port** (rides on B1+A2). |
| B4 | **Closed-enum + validated-string SQL-injection defense inside the AST** | `properties.rs:17-34` (`PropertyEntityType` closed enum, comment: *"prevents SQL injection through the entity_type field, which is interpolated into dynamic SQL"*), `properties.rs:78-93` (`EntityRefId` rejects `'`, `\`, `\0`) | n/a (no dynamic SQL yet) | **S** | **5** | **Port the design — mandatory.** The moment MLE builds B1 it starts interpolating user input into SQL. Adopt this discipline *with* the AST, not after. Prefer Supabase RPC + parameter binding; keep the closed enums regardless. |
| B5 | **Authorization derived from the filter tree** | `crates/item_filters/src/ast.rs:269-314` — `requests_crm_scope()`, `requests_crm_admin()`, with `Expr::Not` recursing conservatively | ❌ (no auth at all — see D1) | **M** | 4 | **Steal the idea.** Blocked behind D1. Note the `Not` arm: a role gate must be conservative under negation. |
| B6 | **Saved views, three tiers, one opaque JSONB config** | `CrmViewConfig` at `apps/web/src/features/companies/crm/saved-views.ts`; personal → `/saved_views` REST; team → `team_crm_settings.team_views` (`20260717161623`); share-link → base64url `?crmView=`. UI `CompanyViewsMenu.tsx`, `use-apply-crm-view.ts`, `CrmDefaultView.tsx` | ❌ | **S** | **5** | **Steal — highest value/effort ratio in the report.** One `saved_views` table (`id, user_id, team_id nullable, name, config jsonb, is_default`) covers personal *and* team; the share-link tier is free (base64url the same object). Reps get "My Overdue Quotes", "Storm-damage leads, unlit", forwardable in Slack. Ship the day after B1. ⚠️ Do **not** copy `team_views` as a whole-list-replace JSONB column — Macro has a last-write-wins clobber problem mitigated only by client-side mutation serialization (`team-crm-config.ts:114-118`). Use rows. |
| B7 | **Group-by-property = kanban, with per-column cursors + true totals** | `crates/models_grouping/src/field.rs:9-31` (`GroupByField::Property{property_definition_id}`); `crates/soup/src/domain/models/grouping.rs:36-64` (`GroupMeta{total_count, item_ids, next_cursor}`, `"Not Set"` → `display_order: i32::MAX`) | ⚠️ `components/DealsBoard.tsx` exists but stages are hard-coded and columns load whole | **M** | 4 | **Port the design.** The `GroupedResponse{items: Map, groups: [{item_ids}]}` normalized shape + per-column `next_cursor` + `total_count` is exactly right for a 600-lead "New" column. |
| B8 | **Static branch pruning of impossible query branches** | `soup/.../expanded/dynamic.rs:887-922` (`*_filter_is_impossible`), `:1144-1158`, plus the `WHERE false` empty-union fallback at `:1292-1296` | ❌ | **S** | 2 | **Skip for now.** Correct engineering, but a premature optimization at MLE's ~40-row scale. Revisit past ~50k rows. |

> ⚠️ **The one thing to get right in Wave 1, learned from Macro's mistake.** Macro's
> `CrmCompanyLiteral` supports only `Id` and `Hidden` (`crates/item_filters/src/ast/crm_company.rs:9`)
> — the `ccf` filter target never got property support. The consequence, admitted in
> `apps/web/src/features/next-soup/filters/configs/company.ts`: *"Companies are fetched via the
> dedicated CRM soup request (capped at 500 per team) rather than the dynamic filter AST … so
> stage/owner filters are client-side predicates with a no-op server query."* **Macro's CRM list is
> capped at 500 rows and Stage/Owner filtering runs in the browser over that page.** Retrofitting
> was evidently harder than living with it. When MLE builds B1/B2, make `orgs`, `people`, and
> `deals` **first-class filter targets with full server-side property support on day one.**

### 9.3 Capture and the "shared memory" effect

| # | Macro capability | How Macro implements it (paths) | MLE has it? | Effort | Val | VERDICT |
|---|---|---|---|---|---|---|
| C1 | **Auto-create company + contact from email traffic** | `crates/crm/src/outbound/companies_repo.rs:287-431` `populate_contact`; producer `services/email_service/src/pubsub/util.rs:205-248`; per-message hook `…/inbox_sync/operations/upsert_message.rs:303` | ⚠️ MLE ingests Rob's Gmail into `activities` (`app/api/webhooks/n8n-email/route.ts`, `lib/n8nEmail.ts`) but **never creates a person or org from it** | **M** | **5** | **Port the design — the single highest-value idea in Macro.** MLE already has the pipe. Add the populate step: derive domain → upsert `orgs` on `(lower(domain))` → upsert `people` on `(org_id, lower(email))` → merge interaction window. |
| C2 | **Idempotent merge-as-upsert** | `companies_repo.rs:387-411`: `ON CONFLICT DO UPDATE SET name = COALESCE(existing, EXCLUDED), first_interaction = CASE WHEN $is_sent THEN LEAST(…) END, last_interaction = GREATEST(…)`, `hidden` untouched | ❌ | **S** | **5** | **Port the design.** Order-independent, concurrency-safe, zero app-side merge code. Copy the COALESCE/LEAST/GREATEST pattern exactly. |
| C3 | **`(team_id, lower(domain))` unique index + advisory lock** | `20260514130000_crm_domains_team_id.up.sql` (migration comment documents the real production race); `companies_repo.rs:310` `lock_team_domain` | ⚠️ MLE dedupes *after the fact* via `dedup_review` | **S** | **4** | **Port the design.** Prevention beats a review queue. Keep `dedup_review` for the cases a constraint can't catch (name-only pairs). |
| C4 | **Direction gating: received mail never creates a company** | `companies_repo.rs:334-340` — `None if !is_sent => return Ok(())` | ❌ | **S** | **5** | **Steal — one line, enormous value.** This is what stops the CRM filling with inbound noise. Ships with C1. |
| C5 | **Junk-domain suppression, six curated categories** | `crates/crm/src/domain/generic_email_domains.rs` (682 lines, ~490 domains: CONSUMER / DISPOSABLE / ALIAS_FORWARDER / SAAS_VENDOR / CONSUMER_BRAND / BULK_SENDER + reserved-TLD suffix rules); composes with local-part filter `email_utils::is_generic_email` | ❌ | **S** | **4** | **Steal the structure, rewrite the lists.** ⚠️ Macro blocks `gmail.com`; a roofing contractor's *customers* are on Gmail. Keep DISPOSABLE / ALIAS / BULK_SENDER / SAAS_VENDOR wholesale; change the consumer-provider rule from *drop* to *person-only record, no org row*. |
| C6 | **Contact provenance → correct teardown** | `crm_contact_sources(contact_id, link_id)` (`20260514120000`); `manually_created` flag (`20260722132833`) so hand-made rows survive GC | ❌ | **S** | 3 | **Port the design.** Cheap now, saves a data-loss incident when a rep disconnects a mailbox. |
| C7 | **Deferred GC with a Postgres-enforced singleton job lock** | `20260723160259_crm_cleanup_tables.sql` — `crm_cleanup_candidates` collapsed by `UNIQUE(link_id, contact_email)`; `crm_cleanup_jobs.max_candidate_id` high-water mark; `CREATE UNIQUE INDEX … ON (…) ((TRUE)) WHERE status IN ('Init','InProgress')` | ❌ (MLE crons have no overlap guard) | **S** | 3 | **Steal the `((TRUE)) WHERE status IN (…)` trick.** A one-line distributed lock that works natively on Supabase — directly applicable to MLE's six n8n crons. |
| C8 | **Query-time timeline via team-wide mailbox widening** | wire key `ecd` at `crates/soup/src/inbound/axum_router.rs:1113`; expansion `crates/item_filters/src/ast/email.rs:219-241`; authorization `CrmScopePrecheck` at `crates/crm/src/domain/model.rs:199-247` | ❌ (MLE stores activity rows instead) | **XL** | 2 | **Skip.** Correct for Macro (they *own* the mail store). MLE ingests via n8n into a normalized `activities` table — that is simpler, cheaper, and already works. **Do steal the sub-idea:** a company timeline should also match on *domain*, not only on FK, so mail from a not-yet-linked colleague at Acme still shows up. |
| C9 | **Auto-stamp attachments with their company + source message** | `crates/system_properties/src/domain/service.rs:124-193` — `Source`, `Companies`, `Sender`, `Recipients`, `Subject` written at ingestion | ❌ | **M** | 4 | **Port the design** (needs A2+A5). Roofing translation: a signed proposal, an AIDRE recording, or an inbound photo set arrives already stamped with its company. Nobody files anything. |

### 9.4 Ranking, surfacing, UX signals

| # | Macro capability | How Macro implements it (paths) | MLE has it? | Effort | Val | VERDICT |
|---|---|---|---|---|---|---|
| D1 | **Frecency: event log + materialized aggregate** | `20251029143441_add_frecency_table.sql` (partial index on `was_processed = false`; `recent_events` JSONB ring on the aggregate); `crates/frecency/src/inbound/polling_aggregator.rs` | ❌ | **M** | 3 | **Port the design.** Two tables + a cron. |
| D2 | **The frecency formula** | `crates/frecency/src/domain/models.rs:184-316` — `0.7·log₂(count+2) + 0.3·Σ(w·e^(−0.1·h))`, ring of 10, weights Open +2.0 / Ping 0.0 / Close −1.0, `now` injected, negative-delta guard | ❌ | **S** | 3 | **Port the algorithm, retune the constants.** `RECENCY_DECAY_RATE = 0.1`/hr is a ~7-hour half-life — right for a workday tool, wrong for a 30-day roofing sales cycle. Try ~0.004/hr (≈7-day half-life). Keep `now` as a parameter — that is the CR-3 rule MLE already follows. |
| D3 | **`exclude_frecency` — the neglected-accounts query** | `soup/.../expanded/dynamic.rs:1300-1311`, `LEFT JOIN frecency_aggregates … WHERE fa.id IS NULL` | ❌ | **S** | **4** | **Steal.** "Accounts I haven't touched" is a rep report MLE wants and gets free with D1. Note `lib/tasks/todayRules.ts` already does rule-based staleness — this is the complementary *behavioral* signal. |
| D4 | **Favorites: polymorphic, manually ordered** | `20260702014623_create_favorites_table.sql` — PK `(user_id, entity_type, entity_id)`, `sort_order DOUBLE PRECISION` (fractional reordering), reverse index `(entity_type, entity_id)`; model `crates/favorites/src/domain/models.rs:17-41` | ❌ | **S** | 3 | **Port the design.** Blocked behind D5 (needs a real `user_id`). The `DOUBLE PRECISION sort_order` trick — insert between two items by averaging — is worth copying. |
| D5 | **Real user identity + role gates** | `entity_access` (`20260331152752`), `team_role` enum, `team_crm_settings.{edit_stages_role, move_closed_deals_role, delete_records_role}` (`20260717161623`) | ❌ **None.** `owner_id`/`assigned_to`/`created_by` are free text (`0005` header); `DASHBOARD_PASSWORD` was removed from prod 2026-07-21; RLS is on with **zero policies** everywhere | **XL** | **5** | **Not a Macro-copy decision — it is MLE's #1 blocker.** D4, B5, book protection (`book_protected` columns already placed), and multi-rep anything all sit behind it. Flag it as such; do not let a Macro port distract from it. |
| D6 | **Search: substring + highlight + keyset pagination** | `crates/crm/src/domain/search_repo.rs:8-58` — `<macro_em>` highlight spans, `(updated_at DESC, id DESC)` keyset cursor. They **deleted** their trigram indexes (`20260415120000…`, `20260415200000…`) | ✅ **MLE is ahead** — generated `search_tsv` + GIN (`0007`), `websearch_to_tsquery`, 57ms prod | **S** | 2 | **Skip the search engine. Steal two details:** (a) `<em>` highlight spans in the response, (b) `(sort_key DESC, id DESC)` **keyset** pagination instead of OFFSET. |
| D7 | **Unified cross-entity feed ("soup")** | `crates/models_soup/src/item.rs:22-44` tagged union; `UNION ALL` + `TopItems` CTE at `soup/.../expanded/dynamic.rs:1236-1298` | ❌ | **L** | 3 | **Steal the idea, scope it down.** MLE does not need a 9-type feed. It needs *one* thing: a single company/person record timeline that unions `activities` + `documents` + `tasks` + `invoice_ledger` into one sorted list. That is a view or one `UNION ALL` query, not the Macro machine. |
| D8 | **Soft delete = `hidden` + partial indexes** | `20260521203029_crm_hidden.up.sql` — `CREATE INDEX … ON crm_companies (team_id) WHERE hidden = FALSE`; hide cascades to contacts and forces `email_sync = false` | ❌ MLE hard-deletes (`lib/dedup/merge.ts` deletes the duplicate last) | **S** | 3 | **Steal.** `hidden boolean` + `WHERE hidden = FALSE` partial indexes. Softer than delete, faster than a `deleted_at` scan. Pairs well with MLE's existing merge-refusal discipline. |

### 9.5 Pipeline, notes, enrichment, integration

| # | Macro capability | How Macro implements it (paths) | MLE has it? | Effort | Val | VERDICT |
|---|---|---|---|---|---|---|
| E1 | **Company-as-deal (Stage/Owner/Revenue as properties)** | `system_property_key.rs:99-102`; seeded `20260707183206_seed_crm_company_system_properties.sql` (Lead→Qualified→Demo→Trial→Negotiation→Customer→Churned) | ✅ MLE has a **better** model: a real `deals` table, 12 stages, multiple deals per org | — | — | **Skip — MLE is ahead.** Company-as-deal cannot express two concurrent jobs at one address. Do not regress. |
| E2 | **Role-gated pipeline governance** | `team_crm_settings.{edit_stages_role, move_closed_deals_role, delete_records_role}`, `closed_stage_ids uuid[]` (`20260717161623`) | ❌ | **S** | 3 | **Steal the idea** (blocked on D5). "Only an admin can drag a deal back out of Signed" is exactly right for a commission-bearing pipeline. `closed_stage_ids uuid[]` with the documented *"NULL = label heuristic on the client"* fallback is a nice graceful-degradation pattern. |
| E3 | **Per-team custom stage sets** | team-owned `property_definitions` + `property_options` | ❌ (12 stages hard-coded in the `0005` CHECK; PRD Task 1.6 still **unapproved**) | **M** | 3 | **Steal — and note the timing.** MLE's own migration header admits *"Task 1.6 is NOT yet Rob-approved; widening/renaming is one cheap ALTER."* If stages are still unsettled, A2 turns every future stage change from a migration into a row insert. |
| E4 | **Comment threads on CRM records** | `20260527194808_create_crm_comments.sql` — `crm_thread` + `crm_comment`, `CHECK (num_nonnulls(company_id, contact_id) = 1)`, `resolved boolean`, soft `deleted_at`; comment says it *"mirrors the document Thread/Comment shape … the frontend reuses the same assembly/rendering logic"* | ❌ MLE notes are a **`text` column** on `people`/`orgs`/`deals`, split human-vs-enrichment by marker parsing in `lib/notes.ts` | **M** | 3 | **Steal the idea.** MLE's marker-parsing of a text blob is clever but fragile. Threaded rows with `resolved` give reps "open question on this account" and kill the enrichment-clobbering class of bug at the root. Note MLE's `EnrichmentSection` quarantine already solves the *display* half correctly. |
| E5 | **Global cross-tenant domain enrichment cache** | `crm_domain_directory` keyed on `LOWER(domain)` with **no team_id** (`20260521120000` + `20260529164720`); 25 typed Apollo columns + `raw JSONB` + `enriched_at`; doubles as a **negative cache** | ❌ **No enrichment engine.** Only `scripts/enrichment/` prose dumped into `notes`; Task 5.3 refresh unbuilt | **M** | **4** | **Port the design.** Domain-keyed, tenant-global, negative-caching, `raw` retained *"so fields we don't model yet aren't lost"*, `enriched_at` for a staleness policy. Directly solves MLE's Task 5.3 and the `ENRICHMENT-GAP-AUDIT-2026-07-17` finding. |
| E6 | **Swappable enrichment provider port** | `crates/crm/src/domain/company_metadata_resolver.rs` (one-method trait); impls `apollo_resolver.rs`, `unfurl_resolver.rs`, `no_op_resolver.rs`; `if api_key.is_empty() { return default() }` | ❌ | **S** | 3 | **Port the design.** A one-method TS interface + three impls. The no-key short-circuit and the *"failure returns empty, never Err"* contract are both correct and both worth copying. |
| E7 | **Display-name COALESCE chain** | `crm_companies.custom_name` (team override) → `crm_domain_directory.name` (global) → none; `20260721185457_crm_company_name.sql` explicitly keeps user-typed names out of the shared directory | ⚠️ MLE has one `name` column; enrichment would overwrite it | **S** | 3 | **Steal.** Separating "what the user typed" from "what enrichment found" is the fix for the enrichment-overwrite bug class — the same instinct behind MLE's existing `lib/notes.ts` split, applied to names. |
| E8 | **`foreign_entity` — reference external records without importing** | `20260526175912_create_foreign_entity_table.sql` — `(foreign_entity_id, foreign_entity_source, metadata jsonb, stored_for_id, stored_for_auth_entity)`; models at `crates/foreign_entity/src/domain/models.rs:44-64` | ❌ | **S** | 2 | **Steal the idea, low priority.** Would give MLE a clean home for "this deal is Cal.com booking X / n8n execution Y / Vapi call Z" instead of stuffing ids into `source_context`. |
| E9 | **`import_entity` — staged import ledger with team-wide dedupe** | `20260720221050_import_entities.sql` — `UNIQUE(user_id, source, foreign_id)`, `status` CHECK, partial index `WHERE team_id IS NOT NULL AND status = 'imported'` for *"has anyone on my team already imported this?"* | ⚠️ MLE's `lib/csvImport.ts` planner is arguably better for CSV (per-line errors, intra-file dedupe) but has no persistent ledger | **S** | 2 | **Steal the ledger idea.** MLE's dry-run planner + a persistent `import_entity`-style ledger = re-runnable imports. |
| E10 | **One filter language serving UI + REST + AI agent** | `crates/soup/src/inbound/toolset/list_entities.rs`, `crates/crm/src/inbound/toolset/list_companies.rs` — same `EntityFilterAst`, exposed via `ai_toolset::AsyncTool` + `schemars::JsonSchema` | ❌ (MLE has `/api/webhooks/vapi` `crm_caller_lookup`, a single hard-coded tool) | **M** | **4** | **Steal — strategically important for AI VoiceTech.** Once B1/B2 exist, `zod-to-json-schema` over the same filter type gives the AIDRE/AIVA agent full CRM query power for near-zero marginal cost. **Design B1 with this consumer in mind from day one** — retrofitting it later is where teams lose months. |
| E11 | **Undirected edge stored exactly once** | `20260126191437_contacts_db_schema.sql` — `UNIQUE(user1,user2)` + `CHECK(user1 <= user2 COLLATE "C")`; self-edge guard `20260429120000_contacts_no_self_connection.sql`. (⚠️ this is Macro's *internal user* graph, **not** its CRM) | ⚠️ MLE `edges` is directed (`from_id`→`to_id`, referrer→referred) and correctly so, but has **no self-edge guard**; `lib/dedup/merge.ts` drops self-edges *after the fact* | **S** | 2 | **Steal the self-edge CHECK only.** Add `CHECK (from_id IS DISTINCT FROM to_id AND from_org_id IS DISTINCT FROM to_org_id)` to `edges`. Do not make MLE's referral edges undirected — direction is the whole meaning. |
| E12 | **Feature killswitch per tenant** | `team_crm_settings.crm_enabled BOOLEAN DEFAULT FALSE`, checked inside the write transaction (`companies_repo.rs:312-317`) — populate silently no-ops, manual create returns `CrmDisabledForTeam` | ❌ | **S** | 2 | **Steal the asymmetry.** Background jobs no-op silently; user-initiated actions get a real error. That distinction is the part most people get wrong. |

### 9.6 Things Macro does **not** have that MLE should not go looking for

For completeness, so nobody mines Macro for these: no products/line-items/quotes · no sequences or
cadences · no email templates · no forms · no forecasting · no territories · no stage-transition
history or velocity (`entity_properties` is last-write-wins — **MLE's `status_change` activity audit
in `app/api/admin/deals/route.ts` is strictly better**) · no win/loss reason · no close date · no
call→company linkage · no task→company linkage · no user-facing merge · no person-level enrichment ·
no SMS · no mobile app.

---

## 10. Recommended sequence

Ordered by dependency, not by value — several high-value items are cheap only *after* a cheap
prerequisite lands.

**Wave 1 — the spine (≈1.5 weeks, unblocks everything else)**
1. **B1 + B2 + B4** — filter AST, per-entity literals, injection-safe compiler. Design the AST as
   plain data so E10 (AI agent) is free later.
2. **B6** — saved views as JSONB. One day. Immediately visible to reps.
3. **A2 + A3** — `entity_properties` + deterministic system-property UUIDs.

**Wave 2 — capture (≈1 week, the "wow")**
4. **C1 + C2 + C3 + C4 + C5** — auto-create orgs/people from the Gmail pipe MLE already runs, with
   idempotent upsert-merge, unique-index prevention, sent-only gating, and roofing-tuned junk lists.
   This is the demo moment.
5. **E5 + E6 + E7** — domain-keyed global enrichment cache, provider port, name COALESCE chain.

**Wave 3 — surfacing (≈1 week)**
6. **B7** — group-by-property kanban with per-column cursors and true totals.
7. **D1 + D2 + D3** — frecency with a 7-day half-life, plus the neglected-accounts query.
8. **D7 (scoped)** — one unioned record timeline across activities/documents/tasks/invoices.
9. **D8, C7, E11, E12** — the cheap hardening set: soft-delete partial indexes, singleton cron lock,
   self-edge CHECK, per-tenant killswitch. All S, all one afternoon together.

**Blocking, parallel, and not a Macro question**
10. **D5** — real user identity, roles, and RLS policies. Everything in §9.4 that touches "per user"
    (favorites, frecency, book protection, B5) sits behind it, and the dashboard is currently
    unauthenticated on the public internet (`DASHBOARD_PASSWORD` removed 2026-07-21). This is not a
    port; it is MLE's own critical path and should run alongside Wave 1 rather than after Wave 3.

**Also worth a separate ticket (not from Macro):** `dedup_review` and `dev_chat` exist on prod with
no file in `supabase/migrations/`. A rebuild from the migration directory alone would be missing
both. Back-write them before any of the above adds more schema.

---

## 11. The CRM frontend — what actually ships

**Framework: SolidJS**, not React — `solid-js`, `@solidjs/router`, `@tanstack/solid-query`,
`@kobalte/core`. One app: `apps/web`. (`apps/docs` and `packages/*` contain zero CRM UI.) None of
the *component* code is directly reusable for MLE's React 19 codebase; the **state shapes, the
config types, and the query contracts** are.

### 11.1 Routing — a URL splat, not a route table

`apps/web/src/routes/Root.tsx:310-345` declares flat paths that **all resolve to the same
component**, and `apps/web/src/components/app/split-layout/SplitLayoutRoute.tsx` does the real work:

```tsx
export const LAYOUT_ROUTE: WithRequired<RouteDefinition, 'component'> = {
  path: '/*splits',
  component: LayoutRoute,   // splits into `props.params.splits?.split('/')`
};
```

The URL is a slash-separated list of `type:id` split panes resolved through
`components/app/split-layout/componentRegistry.tsx`. Interesting, but **not something to copy into a
Next.js App Router project** — it fights the framework.

### 11.2 The screens

| Screen | Route / pane | Component |
|---|---|---|
| Customers list (table) | `/companies` | `componentRegistry.tsx:310-337` → `<SoupView viewName="Customers">` |
| Customers board (kanban) | same route, `viewMode() === 'board'` **(the default)** | `features/next-soup/soup-view/views/companies/CompanyKanban.tsx` |
| Company detail | pane `company:<id>` | `features/block-company/definition.ts` → `features/companies/Company/Company.tsx` |
| Contact detail | pane `contact:<id>` | `features/block-contact/definition.ts` → `features/contacts/Contact/Contact.tsx` |
| CRM settings | settings dialog tab | `features/settings/Crm.tsx` — enable/disable only |
| Global activity | `/activity` | `features/activity-timeline/activity-view.tsx` |

Whole CRM is behind feature flag `'enable-crm'`
(`apps/web/src/lib/core/constant/featureFlags.ts:160-170`); the sidebar item is inserted only
`if (ENABLE_CRM())` (`components/app/app-sidebar/sidebar.tsx:937-944`).

**There is no contact list screen.** `lib/constants/list-views.ts:9-22` enumerates every list view
and `contacts` is absent; `soupItemMatchesListView` maps `'companies' → item.tag === 'crmCompany'`
only. Contacts are reachable *only* from a company's Contacts side-panel section or `@`-mention.

### 11.3 The kanban — real, and permission-gated

`features/next-soup/soup-view/views/companies/CompanyKanban.tsx` (457 lines). Its own doc comment:

> *"one column per active deal stage (team-customized set when present, else the seeded system
> stages) plus 'No stage', fed by the same filtered soup entities as the list. Cards drag between
> columns to update the company's Stage property (team admins/owners only, matching CRM edit access;
> moving deals out of a closed stage additionally requires the move-closed-deals permission)."*

The drag handler is a property write, nothing more (`CompanyKanban.tsx:230-249`):

```ts
const moveToStage = (entityId: string, stageKey: string) => {
  setStageOverride(entityId, stageKey);          // local override so search-sourced rows stick
  saveMutation.mutate({
    properties: [{
      entityId,
      entityType: EntityType.COMPANY,
      property: stageProperty(),
      apiValues: { valueType: 'SELECT_STRING', values: stageKey === NO_STAGE_KEY ? null : [stageKey] },
    }],
  });
};
```

Worth noting: `MIN_COLUMN_WIDTH = 224` with snap-fit columns, `canDragFrom(stageKey)` permission
gate, and a `stageOverrides` signal so an optimistic drop survives rows that came from search
(which bypasses the normalized soup cache). MLE's `components/DealsBoard.tsx` already does optimistic
+ snap-back; the permission gate and the override-for-uncached-rows detail are the additions.

### 11.4 The table view — and its ceiling

`features/next-soup/soup-view/views/companies/company-grid-template.ts` hardcodes exactly three
columns:

```ts
export const COMPANY_GRID_COLUMNS = [
  { id: 'stage',   label: 'Stage',   defId: SYSTEM_PROPERTY_IDS.STAGE,         dataType: DataType.SELECT_STRING, … },
  { id: 'owner',   label: 'Owner',   defId: SYSTEM_PROPERTY_IDS.COMPANY_OWNER, dataType: DataType.ENTITY, specificEntityType: EntityType.USER, … },
  { id: 'revenue', label: 'Revenue', defId: SYSTEM_PROPERTY_IDS.REVENUE,       dataType: DataType.NUMBER, … },
] as const;
```

**Custom properties cannot become list columns**, and column visibility is `localStorage`-only
(`features/companies/crm/display-options.ts`, key `macro:pref:crm:display`) — so it is *not* part
of the shareable `CrmViewConfig`. Both are real product gaps; if MLE builds A2, make columns
property-driven from day one.

### 11.5 Filters — the two-layer store, and where Macro compromised

Two orthogonal layers, owned by
`features/next-soup/soup-view/soup-view-context.tsx`:

1. **Server query filters** — a `Query` object in a Solid store
   (`features/next-soup/filters/filter-store/query-store.ts`), compiled to the backend AST.
2. **Client predicates** — named boolean functions
   (`.../predicates-store.ts`) combined as `{ and: [...ids], or: [...ids] }` and run over fetched
   entities.

The `Query` source type (`filters/filter-store/types.ts`) is worth seeing in full shape, because it
is the "user-authorable filter surface" MLE currently has none of:

```ts
export type DateRangeFilter = { gt?: string; gte?: string; lt?: string; lte?: string };
export type PropertyFilter  = { propertyId: string; type: 'select' | 'entity'; value: string };

export type Query = {
  include?: FieldFilters;   // ArrayFieldFilters & ScalarFieldFilters
  exclude?: FieldFilters;
  documentWhere?: DocumentFilterExpression | DocumentFilterExpression[];
  emailView?: EmailView;    // 'inbox' | 'drafts' | 'sent' | 'all'
};

export type DocumentFilterExpression =
  | DocumentFilterClause
  | { op: 'and'; clauses: DocumentFilterExpression[] }
  | { op: 'or';  clauses: DocumentFilterExpression[] }
  | { op: 'not'; clause: DocumentFilterExpression };
```

Compiled to the wire AST by `filters/filter-store/compile.ts`:

```ts
type BackendAst =
  | { '&': [BackendAst, BackendAst] }
  | { '|': [BackendAst, BackendAst] }
  | { '!': BackendAst }
  | { l: unknown };

type QueryTarget = 'df'|'ef'|'chanf'|'cthf'|'cf'|'pf'|'callf'|'fef'|'ccf'|'propf';

// CRM mappings
crmCompanyId:     { target: 'ccf', field: 'id' },
crmCompanyHidden: { target: 'ccf', field: 'hidden' },

const propertyToAst = (p: PropertyFilter): BackendAst =>
  p.type === 'select'
    ? { l: { pd: p.propertyId, v: { so: p.value } } }
    : { l: { pd: p.propertyId, v: { er: p.value } } };
```

`defineQueryFilters()` stuffs `NIL_UUID` into every *unreferenced* target's id field to exclude that
entity type entirely — a neat trick for "one query shape, many views."

**⚠️ The compromise, stated plainly.** Because `CrmCompanyLiteral` only supports `Id` and `Hidden`
(§3.2), Macro **could not** filter companies by Stage or Owner on the server. So they didn't —
`features/next-soup/filters/configs/company.ts`:

```ts
// Companies are fetched via the dedicated CRM soup request (capped at 500
// per team) rather than the dynamic filter AST, which has no property
// support for the `ccf` target — so stage/owner filters are client-side
// predicates with a no-op server query.
export const companyStageFilter = config({
  id: 'company-stage',
  predicate: (e, ctx) => companyStagePredicate(() => ctx.stages, ctx.resolveCompanyStage)(e),
  query: {},
});
```

**Macro's CRM list is capped at 500 companies per team, and Stage/Owner filtering happens in the
browser over that capped page.** That is the single most important cautionary finding in the
frontend. It is the direct consequence of putting CRM entities on a filter target that never got
property support. **When MLE builds B1/B2, make `deals`/`orgs`/`people` first-class filter targets
with full property support server-side from the start** — retrofitting is exactly what Macro
couldn't do.

Filter UI files, for reference: `unified-filter-dropdown.tsx` (1033 lines),
`searchable-multi-select.tsx`, `soup-active-filters-bar.tsx`, `consolidated-filter-chip.tsx`,
`mobile-filter-drawer.tsx`, `tag-filter.tsx`, `sort-dropdown.tsx`, `group-dropdown.tsx`,
`use-filter-refinements.tsx` (967 lines).

Tab presets are just saved configs in code
(`features/next-soup/sidebar/soup-filter-presets.ts:438-464`) — note `groupBy` defaults the
Customers view straight to the Stage kanban, and the `hidden` tab returns `undefined` for
non-admins (defense in depth; the backend 403s anyway).

### 11.6 Properties UI

~60 files under `apps/web/src/features/property/`. Create modal
(`component/modal/CreatePropertyModal.tsx`, 624 lines) → name, data type, multi-select toggle,
inline option-list editor. Attach modal (`SelectPropertyModal.tsx`) filters out the reserved team
`Stage` definition. Per-type editors split inline (`InlineTextEditor`, `InlineNumberEditor`,
`InlineBooleanEditor`, `InlineLinkEditor`) vs popover (`DateEditor`, `SelectEditor`, `EntityEditor`).
Tags get their own subsystem with colors (`features/property/tags/`).

The frontend value union (`features/property/types.ts`) is the clean model to copy into TS:

```ts
export type Property = {
  propertyId: string; propertyDefinitionId: string; displayName: string;
  isMultiSelect: boolean; isSystemProperty?: boolean; isRequired?: boolean;
  options?: PropertyOption[]; owner: PropertyOwner;
  specificEntityType?: EntityType | null;
} & (
  | { valueType: 'STRING';        value: string | null }
  | { valueType: 'NUMBER';        value: number | null }
  | { valueType: 'BOOLEAN';       value: boolean | null }
  | { valueType: 'DATE';          value: Date | null }
  | { valueType: 'SELECT_STRING'; value: string[] | null }
  | { valueType: 'SELECT_NUMBER'; value: string[] | null }
  | { valueType: 'ENTITY';        value: EntityReference[] | null }
  | { valueType: 'LINK';          value: string[] | null }
);
```

**No formula, no rollup, no computed properties** — grepping `formula` across `apps/web/src` returns
one unrelated hit. Don't go looking.

### 11.7 The GraphQL surface is tiny — four operations

Codegen: `apps/web/codegen.ts`, schema `static_assets/schema.graphql`.

| Kind | Name | File |
|---|---|---|
| query | `Soup($input: SoupInput!)` | `graphql/soup.graphql:1` |
| query | `GroupSoup($input: GroupedSoupInput!)` | `graphql/group-soup.graphql:1` |
| query | `GroupSoupMembership($input: GroupedSoupInput!)` | `graphql/group-soup-membership.graphql:1` |
| mutation | `SetEntityProperty($input: SetEntityPropertyInput!)` | `graphql/set-entity-property.graphql:1` |

Everything else — all CRM record CRUD — is plain REST against
`/crm/companies`, `/crm/contacts`, `/crm/comments`, `/crm/settings`
(`lib/service-clients/service-storage/client.ts:2286-2431`), matching the twelve Axum routes in §5.

The property-value fragment is the cleanest expression of the tagged union in the whole codebase
(`soup.graphql:273-306`):

```graphql
value {
  __typename
  ... on GraphqlBooleanPropertyValue         { boolValue: value }
  ... on GraphqlNumberPropertyValue          { numberValue: value }
  ... on GraphqlStringPropertyValue          { stringValue: value }
  ... on GraphqlDatePropertyValue            { dateValue: value }
  ... on GraphqlSelectOptionPropertyValue    { optionIds }
  ... on GraphqlEntityReferencePropertyValue { references { entityId entityType specificMessageId } }
  ... on GraphqlLinkPropertyValue            { urls }
}
```

And the schema confirms the §3.2 limitation from the client side:

```graphql
input GraphqlCrmCompanyLiteral @oneOf { id: ID  hidden: Boolean }
```

⚠️ **Do not copy the transport architecture.** Macro runs REST *and* GraphQL over the same AST
behind a feature flag (`enable-graphql-soup`), plus a WASM normalized cache in a SharedWorker
(`apps/web/src/lib/graphql-cache/`). That is a mid-migration state, not a design. MLE's
`/api/*` route handlers over Supabase are simpler and correct.

### 11.8 Favorites and the command palette

Favorites *are* wired for CRM (`lib/queries/favorites/favorites.ts:42-45` maps both `crm_company`
and `crm_contact`) and appear in three places: the drag-reorderable sidebar section
(`features/favorites/sidebar/favorites-section.tsx`), the star toggle
(`features/favorites/FavoriteIcon.tsx`), the command palette sub-scope
(`features/command/FavoritesCommands.tsx`, keywords `['favorites','favorite','starred','pinned']`),
and as a multi-select-aware row action
(`features/next-soup/actions/make-favorite-action.ts` — unfavorites when all selected are already
favorited). Command *ordering* uses a separate localStorage recency store
(`features/command/recency.ts`, key `command-recency-v1`), unrelated to server frecency.

### 11.9 Frontend gaps found — read these as "don't repeat"

1. CRM list capped at **500 companies/team**, with Stage/Owner filtered client-side over that page.
2. **No contact list view**; contacts are second-class and absent from soup.
3. **No per-record activity timeline** (§6) — two separate sections instead.
4. **`canEditStages` is dead code** (`crm/team-crm-config.ts:201`, zero consumers) — no stage-editor
   UI ships despite the backend governance columns existing.
5. **`entity:COMPANY` property type commented out** as NOT YET IMPLEMENTED.
6. **List columns hardcoded**; column visibility is localStorage-only, not in the shareable view.
7. **`teamViews` is a whole-list replace**, last-write-wins, mitigated only by client-side mutation
   serialization.
8. **Frecency is dark** — fully built, never exposed.

Six of those eight are the same failure: *the backend shipped the capability and the frontend never
caught up.* For MLE the lesson is sequencing — pair every spine item in §10 with the one screen that
makes it visible, or it becomes Macro's `canEditStages`.

---

## 12. Sources

**Macro backend:** `crates/macro_db_client/migrations/` (243 files; CRM-relevant set enumerated in
§1), `crates/crm/`, `crates/properties/`, `crates/system_properties/`, `crates/filter_ast/`,
`crates/item_filters/`, `crates/frecency/`, `crates/favorites/`, `crates/foreign_entity/`,
`crates/entity_access/`, `crates/entity_mutation/`, `crates/model-entity/`,
`crates/models_properties/`, `crates/models_soup/`, `crates/models_grouping/`, `crates/soup/`,
`crates/complete_graph/`, `crates/contacts/`, `services/email_service/src/pubsub/`.

**Macro frontend:** `apps/web/src/features/{companies,contacts,property,next-soup,favorites,command,activity-timeline,settings}/`,
`apps/web/src/lib/{queries,service-clients,constants,core}/`, `static_assets/schema.graphql`.

**MLE:** `docs/plans/PRD-mle-crm.md`, `supabase/migrations/0001`–`0013`, `app/`, `lib/`,
`components/`, `package.json`, `vercel.json`.

**Not examined (out of scope):** Macro's auth/FusionAuth stack, documents/lexical editor,
calls/WebRTC, channels/chat, AI agent internals beyond the CRM toolset, sync-service/CRDT layer.
