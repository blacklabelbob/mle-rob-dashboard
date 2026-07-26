# Macro (macro.com) — Architecture Deep Dive
**Analyst:** Head of Engineering · **Date:** 2026-07-25
**Target:** `/private/tmp/.../scratchpad/macro` (full clone, AGPLv3, a16z-backed, $30M raised)
**Audience:** Rob Acheson — assessing what to learn, what to lift, and whether to merge wholesale into
`/Users/robertacheson/Projects/MyLocalEverything/MLE ROB Dashboard` (Next 16 + React 19 + Supabase + Vercel).

> Every claim below cites a file path that was actually opened and read. Where a number is derived from a
> command, the command is shown.

---

## 0. The 60-second verdict

Macro is a **~1.09 million line, dual-language (Rust + TypeScript), 39-Pulumi-stack, multi-cloud
(AWS + Cloudflare + Fly) product** built by a team of at least 11 actively-committing engineers.
It is a genuinely excellent piece of engineering with three or four ideas worth stealing outright.

**Merging it wholesale into MLE is not viable** — not because the code is bad, but because:
1. The frontend is **SolidJS**, not React (`package.json` patchedDependencies list `solid-gesture`,
   `@thisbeyond/solid-dnd`, `@tanstack/solid-query`, `@kobalte/core`). Zero component reuse with MLE.
2. The backend is **560k LOC of Rust** against a stack MLE does not have (Kafka, OpenSearch, DynamoDB,
   FusionAuth, LiveKit, Durable Objects).
3. It is **AGPLv3** (`LICENSE.txt` line 1), which is a business-model decision, not a technical one.

**But the schema-level ideas port at near-zero cost**, because Macro's core is plain Postgres and every
extension it uses is available on Supabase. That's where the value is for Rob.

---

## 1. Scale — the honest numbers

| Metric | Value | How measured |
|---|---|---|
| Rust LOC | **560,025** | `find crates services tooling -name '*.rs' \| xargs cat \| wc -l` |
| TypeScript/TSX LOC | **526,990** | `find apps packages infra tooling -name '*.ts' -o -name '*.tsx' \| xargs cat \| wc -l` |
| Total | **~1,087,000 LOC** | sum |
| Rust source files | 3,132 | `find crates services -name '*.rs' \| wc -l` |
| Crates | **164** dirs (91 workspace members) | `ls -1 crates \| wc -l`; `Cargo.toml` members list |
| Services | **42** | `ls -1 services` |
| Pulumi stacks | **39** | `ls -1 infra/stacks` |
| Postgres migrations | **243** | `ls crates/macro_db_client/migrations \| wc -l` |
| Total .sql files | 451 | `find . -name '*.sql'` (excludes `.sqlx`) |
| Cargo dependency graph | **1,277 packages** | `grep -c '^\[\[package\]\]' Cargo.lock` |
| Bun lockfile | 429 KB | `bun.lock` |
| CI workflows | **32** | `ls -1 .github/workflows` |
| Internal build tooling | **15,033 LOC** | `find tooling/xtask -name '*.rs' \| xargs cat \| wc -l` |
| Local dev containers | **~25** | `docker/docker-compose.yml` (19 app) + `docker-compose-databases.yml` + FusionAuth + LocalStack |
| Distinct env vars | **≥114** | `env_vars!` struct declarations across `crates/` + `services/` |
| Engineers committing | **11 in 31 hours** | `git log --format="%an" \| sort -u` over the 50-commit public window |

**On that last row.** The public clone has squashed history — 50 commits spanning 2026-07-23 12:50 to
2026-07-24 19:59 (`git log --reverse`). In that ~31-hour window, **11 distinct authors** committed
(Sean Aye, Will Hutchinson, Peter Chinman, Evan Hutnik, teo, gbirman, Eric Hayes, dev-rb, juliawest,
Wolf Mermelstein, Jacob Beckerman). Eleven engineers landing 50 PRs in a day and a half implies a
roster substantially larger than eleven. **This is the throughput of a well-funded ~20-person eng org.**
Hold that number — it anchors section 9.

### 1a. The crate count is misleading

| Crate size | Count |
|---|---|
| < 300 LOC | **57** (35%) |
| 300–2,000 LOC | 64 |
| > 2,000 LOC | 43 |

Over a third of the 164 crates are under 300 lines (`macro_cors`, `macro_uuid`, `non_empty`, `cowlike`,
`ensure_exists`, `maybe_send`). **This is Rust compile-unit management, not architecture.** Splitting
crates parallelizes `cargo build` and shrinks incremental rebuild scope. In TypeScript this buys you
nothing and costs you import churn. Do not read "164 crates" as "164 meaningful modules."

Largest crates by LOC (`for d in crates/*/; do ... done | sort -rn`):

```
27396 crates/channels/      20188 crates/soup/        16593 crates/teams/
25911 crates/email/         17444 crates/notification/ 15818 crates/properties/
24667 crates/macro_db_client/ 16922 crates/documents/  15478 crates/entity_access/
                              16899 crates/crm/        14901 crates/github/
```

Largest services: `email_service` (24,549), `document_storage_service` (11,505),
`authentication_service` (11,498), `ai-editing-worker` (11,188 — TS), `lexical-service` (10,169 — TS),
`sync-service` (9,502).

---

## 2. Build system — four tools, cleanly layered

Macro composes **Cargo + Bun + Nix + just**, and each has exactly one job. This is the cleanest part
of the repo and the layering itself is a lesson.

| Tool | Role | Evidence |
|---|---|---|
| **Cargo** | Rust workspace, 91 members, centralized `[workspace.dependencies]` | `Cargo.toml` lines 4–92, 94–280 |
| **Bun 1.3.5** | JS workspace (6 members), package manager | `package.json` `packageManager`, `workspaces` lines 63–70 |
| **Nix flake** | Hermetic toolchain + reproducible builds via `crane` + `fenix` | `flake.nix`; `nix/{cloud-storage,js-app,tauri-desktop,systems}.nix` |
| **just** | Task runner / human entrypoint, imports 4 sub-modules | `justfile` line 119–122 |
| **xtask** | Rust-native scripting replacing bash | `tooling/xtask/` (15k LOC, 10 sub-crates) |
| **Doppler** | Secret management — the only source of env | `justfile` lines 22–34 |
| **Pulumi (TypeScript)** | Infrastructure as code, 39 stacks | `infra/stacks/`, `package.json` trustedDependencies `@pulumi/*` |

### The genuinely clever bit: CI is generated, not written

Every file in `.github/workflows/` opens with:

```yaml
# DO NOT EDIT — regenerate with `cargo x workflows` (from the repository root).
# Source: tooling/xtask/crates/xtask_workflows/src/workflows/preview_fly.rs
```
— `.github/workflows/preview-fly.yml` lines 1–2

All 32 workflows are emitted from typed Rust in
`tooling/xtask/crates/xtask_workflows/src/workflows/` (one `.rs` per workflow, plus shared
`steps.rs`, `runners.rs`, `vars.rs`). Shared steps are functions; runner labels are constants; a
`check_generated.yml` workflow fails CI if the YAML drifts from the generator.

**This is YAML-as-a-compile-target.** It eliminates the single most common source of CI rot —
copy-pasted YAML that diverges across 32 files. See §7 item 4.

### `.sqlx/` — 1,436 entries

`ls .sqlx | wc -l` → 1,436. This is sqlx's **offline query cache**: every `sqlx::query!()` macro in the
codebase has its SQL validated against a live Postgres at `just prepare_db` time, and the resulting
type metadata is committed as JSON. Builds then run with `SQLX_OFFLINE=true` and get **compile-time
verified SQL** without a database connection.

The implication is significant: **~1,436 distinct SQL queries are statically type-checked against the
real schema at compile time.** A column rename breaks the build, not production. `clippy.toml` enforces
it by banning the dynamic forms:

```toml
disallowed-methods = [
    { path = "sqlx::query",        replacement = "sqlx::query!" },
    { path = "sqlx::query_as",     replacement = "sqlx::query_as!" },
    { path = "sqlx::query_scalar", replacement = "sqlx::query_scalar!" },
    { path = "std::env::var", reason = "use macro_env_var so APP_SECRETS_JSON is honored" },
]
```
— `clippy.toml`

TypeScript has no true equivalent, but this is the ceiling Rob's stack should aim at. Supabase's
generated types + a codegen'd query layer (Kysely/Drizzle) is the closest practical analogue.

---

## 3. Monorepo topology

```
macro/
├── apps/
│   ├── web/          SolidJS + Vite + Tauri desktop  (the entire client)
│   └── docs/         product documentation site
├── crates/       164 Rust libraries  ── 560k LOC
├── services/      42 deployables (Rust binaries, Lambdas, + 4 TypeScript/Bun services)
├── packages/       3 shared TS: collaboration, lexical-core, loro-mirror (CRDT)
├── infra/         39 Pulumi stacks (TypeScript) + reusable packages/{lambda,service,vpc,...}
├── docker/        24 Dockerfiles + 4 compose files
├── nix/           4 flake modules (cloud-storage, js-app, tauri-desktop, systems)
├── tooling/       xtask (15k LOC), seed_cli, native_app_server, notification_sandbox, just/, scripts/
├── rules/         4 ast-grep structural lint rules
└── docs/          STYLE_GUIDE.md, RUNNING_LOCALLY.md, CLOUD_STORAGE.md
```

### The frontend is SolidJS — this is the single biggest surprise

`package.json` `patchedDependencies` (lines 36–44) and `apps/web/package.json` dependencies confirm:
`@tanstack/solid-query`, `@kobalte/core` (Solid headless UI), `@thisbeyond/solid-dnd`, `solid-gesture`,
`@solid-primitives/*` (10+ packages), `@corvu/dialog`, `@corvu/drawer`. Build is **Vite**, not Next.
Desktop is **Tauri** (`apps/web/tauri/`). Editor is **Lexical 0.45** pinned across 20 packages, plus
**CodeMirror 6** for code blocks.

`apps/web/src/features/` has **41 feature folders**, and the naming reveals the product's core
abstraction — everything is a *block*:

```
block-automation  block-call     block-canvas  block-channel  block-chat   block-code
block-company     block-contact  block-email   block-image    block-md     block-pdf
block-pr          block-project  block-unknown block-video
```
— `ls -1 apps/web/src/features`

Plus `next-soup`, `entity`, `property`, `favorites`, `sharing`, `inbox`, `dynamic-ui`.

**For Rob: there is zero frontend reuse available here.** Solid's reactivity model (signals, no VDOM,
no re-render) is fundamentally different from React 19. Components cannot be copy-pasted. Nothing in
`apps/web/` is liftable into MLE.

### License caveat worth flagging

Root `LICENSE.txt` is **AGPLv3** (line 1) and README line 97 says "fully open source — not open core."
But `apps/web/LICENSE` is a **single line**:

```
Copyright 2023 CoParse, Inc. All rights reserved.
```
— `apps/web/LICENSE` (the whole file; `wc -l` → 1)

CoParse is Macro's former corporate name. This is almost certainly a stale pre-open-sourcing leftover,
but the public repo's squashed history (`git log -- apps/web/LICENSE` → one squashed commit) makes it
impossible to confirm from the clone. **A conflicting "All rights reserved" notice sits inside the
frontend directory of an AGPL repo.** Anyone planning to reuse `apps/web/` should get that in writing.
This does not affect the Rust backend or the schema ideas, which are unambiguously AGPLv3.

**The AGPL point that actually matters for Rob:** AGPLv3 §13 ("Remote Network Interaction",
`LICENSE.txt` line 540) requires that if you modify the software and let users interact with it *over a
network*, you must offer those users the complete corresponding source of the whole combined work.
Merging Macro code into MLE and selling MLE as a hosted CRM to roofing contractors would trigger this.
Macro sells commercial relicensing (`README.md` line 99, `licensing@macro.com`) precisely because they
know this. **Copying schema designs and architectural ideas is not copying code and does not trigger
AGPL** — that is the safe lane, and it is where all the value is anyway.

---

## 4. Data layer

### 4.1 One Postgres to rule them all (after a consolidation)

Despite `CLAUDE.md` lines 42–47 describing "MacroDB / ContactsDB / CommsDB / EmailDB", the schema has been
**consolidated into a single Postgres database**. Evidence: `crates/macro_db_client/migrations/` holds
**243 migrations** and is the *only* directory with real Postgres migrations
(`find . -type d -name migrations` → all others hold 1–2 files of test-only schema). Two migrations are
literally the consolidation:

- `20251104101012_comms_db_schema.sql` — header: `-- schema definition of comms when we migrated it from its own database to macrodb`
- `20251030154634_email_db_schema.sql` — the 17-table email subsystem, same story

The `comms_db_client` / `email_db_client` / `notification_db_client` crates are now **query layers against
the same database**, not separate datastores. `CLAUDE.md` is stale on this point. *(A useful reminder that
even a well-run repo's own AI-guidance file drifts from reality.)*

### 4.2 The schema is Prisma-legacy underneath

`crates/macro_db_client/migrations/0001_baseline.sql` (1,506 lines, ~90 tables) carries the header:

> `-- the baseline migration from when we migrated to using sqlx from prisma for macrodb.`

Consequence: the schema is **half quoted-PascalCase/camelCase** (`"Document"."deletedAt"`,
`"SharePermission"."isPublic"`, `"UserHistory"."itemId"`) and **half snake_case** (`entity_access`,
`team_user`, `comms_channel_participants`, `frecency_aggregates`). `CLAUDE.md` lines 54–57 warns
contributors to alias on read: `SELECT "userId" as "user_id" FROM "UserInsights"`.

**Lesson for Rob, not a thing to copy:** Macro is paying a permanent tax for an ORM migration. MLE's
`supabase/migrations/` are consistently snake_case today — keep it that way; the cost of mixed casing is
paid on every single query for the life of the product.

### 4.3 There is NO generic entity table

This surprised me and it's the most important schema finding. Macro has **per-type tables**
(`"Document"`, `"Project"`, `"Chat"`, `comms_messages`, `email_threads`, `call_records`, `crm_companies`…).
The polymorphism lives entirely in **three generic side tables** keyed by an untyped
`(entity_type TEXT, entity_id)` pair:

| Table | Purpose | Migration |
|---|---|---|
| `entity_access` | the ACL grant edge | `20260331152752_add_entity_access_table.sql` |
| `entity_properties` | custom fields (EAV) | `20251030100000_init_properties_schema.sql` |
| `comms_entity_mentions` | the @link edge | `20251104101012_comms_db_schema.sql` lines 77–90 |

**This is the architectural insight worth internalizing.** You do not need a "everything is a block" table
to get block-like behavior. You keep normal, well-typed, well-indexed per-type tables — and you bolt on
three generic *edge* tables for the cross-cutting concerns (who can see it, what fields it has, what it
links to). You get polymorphism where you want it and referential integrity where you need it.

The cost, honestly stated: those three tables have **almost no foreign keys** (only
`entity_access.granted_from_project_id` has one). Orphan cleanup is manual application work — which is
exactly what the newest migration, `20260723160259_crm_cleanup_tables.sql`
(`crm_cleanup_candidates`, `crm_cleanup_jobs`), exists to do.

### 4.4 `entity_access` — the single best thing in this repo

Full DDL, `crates/macro_db_client/migrations/20260331152752_add_entity_access_table.sql`:

```sql
CREATE TYPE entity_access_source_type AS ENUM ('channel', 'team', 'user');

CREATE TABLE entity_access (
    id                      BIGSERIAL PRIMARY KEY,
    entity_id               UUID NOT NULL,
    entity_type             TEXT NOT NULL,
    source_id               TEXT NOT NULL,
    source_type             entity_access_source_type NOT NULL,
    access_level            "AccessLevel" NOT NULL,          -- view|comment|edit|owner
    granted_from_project_id TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "entity_access" ADD CONSTRAINT "entity_access_granted_from_project_id_fkey"
    FOREIGN KEY ("granted_from_project_id") REFERENCES "Project" ("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "entity_access_unique_with_project"
    ON entity_access (entity_id, entity_type, source_id, source_type, granted_from_project_id)
    WHERE granted_from_project_id IS NOT NULL;
CREATE UNIQUE INDEX "entity_access_unique_without_project"
    ON entity_access (entity_id, entity_type, source_id, source_type)
    WHERE granted_from_project_id IS NULL;
```

Nine columns. That's the whole permission system for a product with ten entity types, three principal
kinds, and inherited sharing.

**Three design decisions to steal verbatim:**

1. **The subject is polymorphic, not the object only.** `source_type ∈ {user, team, channel}` means one
   table expresses "Rob can edit this", "the Sales team can view this", and "everyone in #roofing-leads
   can comment on this" — with no extra tables and no `UNION` at write time.

2. **`granted_from_project_id` is a provenance column, and it solves revocation.** The hardest problem in
   inherited permissions is un-sharing: when a container is deleted or a user leaves, which grants go
   away? Macro answers it by *recording why each grant exists*. The FK's `ON DELETE CASCADE` then makes
   project deletion revoke exactly the derived grants and leave direct grants untouched. **Most
   hand-rolled permission systems get this wrong and leak access forever.**

3. **The two partial unique indexes.** Postgres treats `NULL` as distinct in unique indexes, so a single
   unique constraint over five columns would allow unlimited duplicate direct grants. Splitting into
   `WHERE ... IS NOT NULL` / `WHERE ... IS NULL` closes that hole. This is a subtle bug most people ship.

**How the query works** — the "channel-based permissions" magic from the README is one CTE
(`crates/soup/src/outbound/pg_soup_repo/expanded/dynamic.rs` lines 37–46):

```sql
WITH user_source_ids AS (
    SELECT cp.channel_id::text AS source_id FROM comms_channel_participants cp
        WHERE cp.user_id = $1 AND cp.left_at IS NULL
    UNION ALL
    SELECT t.team_id::text FROM team_user t WHERE t.user_id = $1
    UNION ALL
    SELECT $1
)
```

Expand the user into their set of "sources", then semi-join `entity_access`. Joining a channel adds a row
to `comms_channel_participants`, which *instantly* widens what the user can see — no permission backfill
job, no ACL rewrite. Leaving sets `left_at` and it *instantly* narrows. That is the entire feature.

**Production performance note worth reading** (`dynamic.rs` lines 952–960) — they moved *away* from a
materialized CTE:

> `The materialized form pinned the worst plan — the whole corpus was computed and probed against the item
> table on every page.` …expressed instead as `a flattenable semi-join so the planner can pick a direction
> per arm: hash the user's accessible set when the arm is broad, or probe entity_access per candidate row
> … when the arm's own filters are selective.`

This is real, hard-won query tuning. If Rob builds this, expect to hit the same wall.

**Portability: this is pure Postgres. It runs on Supabase unchanged.** And it is *better* on Supabase,
because `user_source_ids` becomes a `SECURITY DEFINER` function referenced from an RLS policy — moving
enforcement into the database instead of trusting every call site. Macro cannot do that (see 4.7).

### 4.5 Custom properties (EAV) — directly liftable for a CRM

`crates/macro_db_client/migrations/20251030100000_init_properties_schema.sql`. Three tables:
`property_definitions` (the field), `property_options` (select choices), `entity_properties` (the value).
The value column is a **JSONB tagged union with a CHECK constraint and a GIN index**:

```sql
CREATE TABLE entity_properties (
    id                     UUID PRIMARY KEY,
    entity_id              TEXT NOT NULL,
    entity_type            property_entity_type NOT NULL,
    property_definition_id UUID NOT NULL REFERENCES property_definitions(id) ON DELETE CASCADE,
    values                 JSONB,
    -- {"type":"String","value":"text"} | {"type":"SelectOption","value":["uuid1","uuid2"]}
    CONSTRAINT check_values_structure CHECK (
        values IS NULL
        OR (values->>'type' IN ('Boolean','Number','String','Date')
            AND jsonb_typeof(values->'value') != 'array')
        OR (values->>'type' IN ('SelectOption','EntityReference','Link')
            AND jsonb_typeof(values->'value') = 'array')
    ),
    CONSTRAINT unique_entity_properties_assignment UNIQUE (entity_id, entity_type, property_definition_id)
);
CREATE INDEX idx_entity_properties_values_gin ON entity_properties USING gin(values jsonb_path_ops);
```

The migration even documents the query patterns inline (lines 170–177):
`WHERE values @> '{"type":"Boolean","value":true}'`, `WHERE values->'value' @> '["uuid"]'::jsonb`, etc.

**Why this is good and not the usual EAV disaster:** the classic EAV table has
`value_text / value_number / value_date / value_bool` nullable columns and no way to constrain them. Here,
a single JSONB column carries its own type tag, a CHECK enforces the array/scalar invariant per type, the
`is_multi_select` flag lives on the *definition* (not encoded in the JSON shape), and one GIN index serves
every query pattern.

**For MLE specifically:** Rob's PRD needs custom properties on people/orgs/deals per vertical. This is the
design. It is ~60 lines of SQL, uses nothing Supabase lacks, and would slot into
`supabase/migrations/` as-is. **Highest-value, lowest-effort lift in this entire report.**

### 4.6 The dedup pipeline — a direct upgrade path for `lib/dedup/`

`crates/macro_db_client/migrations/20260528120000_task_duplicate_detection.sql` + `crates/task_dedup/`
(7,346 LOC):

```sql
CREATE TABLE task_duplicate_embedding (
    document_id TEXT PRIMARY KEY REFERENCES "Document"(id) ON DELETE CASCADE,
    model TEXT NOT NULL, content TEXT NOT NULL,
    embedding vector(1536) NOT NULL, ...
);
CREATE INDEX task_duplicate_embedding_vector_idx ON task_duplicate_embedding
    USING ivfflat (embedding vector_cosine_ops)
    -- IVFFlat lists should track roughly rows / 1000. lists = 100 is sized
    -- for about 100k task_duplicate_embedding rows; tune as volume grows.
    WITH (lists = 100);

CREATE TABLE task_duplicate_match (
    id UUID PRIMARY KEY,
    task_id           TEXT NOT NULL REFERENCES "Document"(id) ON DELETE CASCADE,
    duplicate_task_id TEXT NOT NULL REFERENCES "Document"(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active',
    vector_score  DOUBLE PRECISION NOT NULL,
    rerank_score  DOUBLE PRECISION NOT NULL,
    judge_model TEXT, judge_reason TEXT,
    dismissed_by TEXT, dismissed_at TIMESTAMPTZ, ...
    CONSTRAINT task_duplicate_match_order  CHECK (task_id < duplicate_task_id),
    CONSTRAINT task_duplicate_match_status CHECK (status IN ('active','dismissed'))
);
```

The pipeline the columns encode: **embed → pgvector ANN recall → Cohere rerank → LLM judge → persist with
both scores + the judge's reason + dismissal state.** Adapters confirm it:
`crates/task_dedup/src/outbound/{cohere.rs, judge.rs, postgres.rs}`.

Four things worth stealing:

1. `CHECK (task_id < duplicate_task_id)` — canonical pair ordering, so (A,B) and (B,A) can never both
   exist. One line; eliminates an entire class of duplicate-of-duplicate bugs.
2. **Persist `vector_score` AND `rerank_score` AND `judge_reason`.** You can tune thresholds after the
   fact and explain every decision to a user. This is exactly Rob's `scoring-pattern.md` rule 4
   ("never emit a bare number") applied to dedup.
3. **`dismissed_by` / `dismissed_at`** — dismissal is durable state, so the system never re-suggests a
   pair a human already rejected.
4. **There is an offline eval harness**: `crates/task_dedup/src/eval/{mod.rs,corpus.rs}` plus binaries
   `pull_task_corpus.rs` and `expand_eval_corpus.rs`. They built a labeled corpus and measure the model
   against it. This is the difference between "we have an AI feature" and "we can tell you its recall."

MLE has `lib/dedup/` doing deterministic matching today. Adding the vector-recall stage is
`CREATE EXTENSION vector` (Supabase supports it) plus one table.

### 4.7 No row-level security — and Rob should NOT copy that

```
grep -rni "CREATE POLICY|ROW LEVEL SECURITY" --include="*.sql" .   →  0 matches
```

Zero RLS across all 451 SQL files. Every service connects as one privileged role and enforces
authorization in Rust. That is a defensible choice for Macro — they have a type-level receipt system
(§5) that makes call sites hard to get wrong, and a service mesh where the DB is never client-reachable.

**It is the wrong choice for MLE**, and it's worth being blunt about why. Supabase's entire security model
assumes RLS; MLE currently runs *every* query with `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS, and
`supabase/migrations/0006_rls_enable.sql` enables RLS with **zero policies** purely as an anon-lockout. So
MLE today has Macro's posture (app-layer-only authz) **without** Macro's compensating control (the
type-level receipt). That is the weakest link in MLE's architecture, and the PRD knows it — Task 4.6 is
blocked on open question Q2.

**The recommendation writes itself:** take Macro's `entity_access` *table design*, and implement the check
as a Supabase RLS policy rather than as application code. You get Macro's model with a strictly stronger
guarantee, and you unblock the multi-tenant story that Q2 is stuck on.

One more caution — Macro's own access-level reader fails soft
(`crates/chat/src/outbound/postgres/queries/get_access_level.rs`): an unparseable `access_level` returns
`AccessLevel::View` rather than denying. Don't copy that. Default deny.

### 4.8 The full storage topology

| Store | Technology | What lives there |
|---|---|---|
| Primary OLTP | **Postgres 16** (`pgvector/pgvector:pg16`) | everything durable: users, docs, projects, messages, email, CRM, ACLs, properties |
| Migrations | **sqlx** `sqlx::migrate!` — 243 files, Prisma baseline | `crates/macro_db_migrator/src/lib.rs` |
| Compile-time SQL | **`.sqlx/`** — 1,434 cached query descriptors | `SQLX_OFFLINE=true` in CI |
| Full-text search | **OpenSearch 2.x**, 6 alias-backed indices | documents, chats, channels, emails, projects, call_records |
| Fuzzy/name search | **pg_trgm + btree_gin** | CRM companies, names, subjects (`crates/name_search`) |
| Vector search | **pgvector** `vector(1536)` ivfflat | task dedup |
| Ephemeral KV | **DynamoDB** single-table PK/SK | WebSocket connections, bulk-upload jobs, static-file metadata |
| Cache/rate-limit/presence | **Redis** (`redis-stack`) | auth throttles, last-online, streams |
| Async work | **SQS** ~18 queues (one FIFO) + Lambda + EventBridge | text extraction, indexing, email, notifications, webhooks |
| Event bus | **Kafka** (`rdkafka`), 10 `macro.*` topics | domain events, realtime feed |
| Blobs | **S3** + **Cloudflare R2** | documents, static files, CRDT snapshots |
| Edge CRDT | **Cloudflare D1 (SQLite) + Durable Objects** | `services/sync-service` |

Postgres extensions in use — **all five are available on Supabase**: `pg_trgm`, `btree_gin`, `vector`,
`pgcrypto`, `pg_stat_statements`. No `ltree` (hierarchy is adjacency-list + recursive CTE).

**Nine distinct datastores.** Note how few of them are load-bearing for the *ideas*: the good parts
(`entity_access`, `entity_properties`, `comms_entity_mentions`, dedup, frecency) are **all plain
Postgres**. OpenSearch/Kafka/DynamoDB/Redis are scale plumbing, not design.

---

## 5. The crate layer — the load-bearing abstractions

Every non-trivial crate follows the same **hexagonal (ports & adapters)** layout, feature-gated so a
consumer pulls only what it needs:

```
crates/<name>/src/
  domain/{models,ports,service}.rs   ← pure logic + trait definitions
  inbound/{axum_router,kafka_consumer,toolset}.rs
  outbound/{pg_*_repo,sqs,http_clients}.rs
```
Verified in `crates/soup/`, `crates/soup_realtime/`, `crates/memory/`, `crates/frecency/`,
`crates/task_dedup/`, `crates/foreign_entity/`, `crates/crm/`. Cargo features are named
`ports` / `inbound` / `outbound` / `mock`, so `Cargo.toml` entries read
`default-features = false, features = ["ports"]` — a service depending on a domain's *interface* never
compiles its Postgres adapter.

**This pattern is 100% portable to TypeScript** and is arguably the single best structural idea to adopt,
because MLE already half-does it: `lib/` holds pure logic, `app/` holds glue, `lib/storage/` is an adapter
with two implementations and a shared contract test
(`lib/storage/__tests__/adapter.contract.test.ts`). Macro's version is the same instinct, applied
consistently across 44 domains and enforced by the compiler.

### 5.1 `soup` — the crown jewel (20,188 LOC)

Undocumented in the README and the most interesting thing in the repo. `crates/soup/src/lib.rs`:

> `Soup is an amalgamated service which allows callers to query for data by filters and receive many
> entities of different types`

One query returns emails + docs + tasks + messages + calls + CRM companies, **jointly filtered, jointly
sorted, cursor-paginated, frecency-ranked, and permission-scoped**. This is what makes Macro's "one
inbox" and "unified feed" possible.

The execution strategy (`crates/soup/src/outbound/pg_soup_repo/expanded/dynamic.rs`, 1,938 LOC) is a
**two-phase query** worth learning cold:

- **Phase 1 — "top clauses":** per entity type, a lightweight `SELECT` of *only* `item_type, id, sort_ts`
  (plus whatever joins the filter requires). All arms `UNION ALL`, then sort + limit.
- **Phase 2 — "detail clauses":** join back from the `TopItems` result to fetch full columns for the
  ~50 rows that survived.

Cited: `DOCUMENT_TOP_WHERE_CLAUSE` / `GROUPED_DOCUMENT_TOP_CLAUSE` / `DOCUMENT_DETAIL_CLAUSE` statics in
the same file. **You never hydrate a row you're going to discard.** That single idea is worth the read,
and it applies verbatim to any Postgres feed query in MLE.

Sorting is pluggable (`SimpleSortMethod`: `viewed_updated | viewed_at | created_at | updated_at`,
implemented as a `CASE $2` so one prepared statement covers all four) and can instead be frecency-ranked.
`crates/soup_realtime/` pushes live updates over **Kafka → `broadcast` → WebSocket**.

### 5.2 The fifteen most important crates & services

Portability verdict is about the **concept**, not the Rust code — no Rust is being ported to MLE.

| # | Crate / Service | LOC | What it actually does | Portability to TS/Supabase |
|---|---|---|---|---|
| 1 | `crates/entity_access` | 15,478 | Authorization spine. Resolves "does P have ≥L on E" for 10 entity kinds, mints a `EntityAccessReceipt<T>` type-level *proof* that the check ran; downstream mutations require the receipt as a parameter. Cached 30s. | **Port-with-effort.** Table + CTE port free; the compile-time receipt does not. Re-express as **RLS + branded TS types**. Weeks at full parity, days for the 80% that matters. |
| 2 | `crates/soup` | 20,188 | Heterogeneous multi-entity feed: filter + sort + group + cursor-paginate + permission-scope across all types. Two-phase top/detail SQL. | **Port-with-effort.** The *pattern* is free and high-value. Full grouping/frecency/AST parity is weeks. Steal the two-phase query today. |
| 3 | `entity_properties` + `crates/properties` | 15,818 | Notion-style custom fields: definitions / options / JSONB tagged-union values + CHECK + GIN. | **Portable.** ~60 lines of SQL, runs on Supabase unchanged. **Do this first.** |
| 4 | `crates/entity_mutation` | 264 | Seven capability traits (rename/move/trash/restore/delete/duplicate/share), each declaring its own required access level as an associated type, so one router serves N entity kinds. Errors are opaque `Sentinel` codes; detail goes to traces only. | **Portable.** Pure interface design. ~0.5 day in TS. **Copy wholesale.** |
| 5 | `crates/filter_ast` | 142 | Generic boolean expression tree (`And/Or/Not/Literal`) with 1-char serde keys, plus stack-safe catamorphisms via the `recursion` crate. Substrate of every filterable surface. | **Portable.** A TS discriminated union serializes identically. 1–2 days. **Cap depth/node count on ingress** — Macro relies on stack-safe folds; you'd need an explicit-stack walk. |
| 6 | `crates/frecency` | 4,442 | frequency×recency ranking. `0.7·log2(events+2) + 0.3·Σ(e^(−0.1·hours)·weight)`, 10-event window, weights Open=2.0/Ping=0/Close=−1. Append-only events → periodic aggregate → score-as-cursor pagination. | **Portable** (scoring) / **Port-with-effort** (AST-filtered variant). Math is 20 lines. Aggregation = `pg_cron`, replacing the whole Rust worker. 2 days. |
| 7 | `crates/task_dedup` + pgvector tables | 7,346 | embed → pgvector ANN → Cohere rerank → LLM judge → persisted match with both scores, reason, and dismissal. Has an offline eval corpus. | **Portable.** Direct upgrade to MLE's `lib/dedup/`. ~1 week. |
| 8 | `crates/ai_projections` | 3,549 | Materialized cache for LLM output. SHA-256 of (prompt‖model‖schema) is the cache key; worker writes scoped to that hash so stale generations can't clobber; `Cold→Loading→Ready`, plus `Refreshing` so stale results stay visible. Claim table for distributed locking. | **Portable.** ~1 week. Supabase makes it *simpler*: `FOR UPDATE SKIP LOCKED` beats the claim table, and Realtime on row-change replaces the whole push notifier. |
| 9 | `crates/foreign_entity` | 3,347 | External-system ID mapping: `(source, foreign_id) → internal UUID` + JSONB metadata + a polymorphic `(stored_for_id, stored_for_auth_entity)` owner pair. | **Portable.** One table + RLS. ~1 day. Steal the polymorphic owner pair instead of nullable `user_id`/`team_id`. |
| 10 | `comms_entity_mentions` | — | The @link edge: `(source_type, source_id) → (entity_type, entity_id)`, indexed both directions. Mentioning in a public doc *inserts an `entity_access` row* (`crates/macro_db_client/src/share_on_mention/mod.rs`). | **Portable.** One table, three indexes. This is the "bidirectional @linking" feature in its entirety. |
| 11 | `crates/complete_graph` | 1,494 | GraphQL composition root stitching 4 adapter crates into one schema; DataLoaders for cross-domain edges; **viewer-rooted** query shape (everything hangs off `user`). Ten generic params, all with `NoOp` variants → schema export with no DB. | **Port-with-effort / mostly skip.** Composition is standard in Pothos. Keep the viewer-rooted shape (free win) and the `NoOp` idea; skip the 10 generics (they compensate for Rust lacking runtime DI). |
| 12 | `services/connection_gateway` + `crates/broadcast` | 3,085 + 313 | WebSocket fan-out. Connections tracked in DynamoDB; in-process keyed pub/sub that **drops slow consumers** (`try_send`, never `send`) rather than back-pressuring publishers. | **Not-worth-it.** Use Supabase Realtime — it does fan-out, cross-instance routing, and authz for free. Keep only the principle: drop slow subscribers, explicitly and with logging. |
| 13 | `services/search_processing_service` + OpenSearch | 5,387 | S3→EventBridge→Lambda→SQS→indexer. 6 alias-backed indices for zero-downtime reindex. Reads from a read-replica pool for backfills. | **Not-worth-it at MLE's scale.** MLE's Postgres tsvector+GIN already returns in 57ms. Revisit past ~10M rows. Do steal the **alias-per-index** trick if you ever run a search engine. |
| 14 | `crates/client/cache-core` | 8,087 | A **normalized GraphQL cache engine written in Rust and compiled to WASM**, running in the browser over IndexedDB/SQLite (`cache-idb`, `cache-sqlite`, `cache-wasm`). Apollo's normalized cache, rewritten. | **Not-worth-it.** Genuinely impressive; utterly disproportionate. TanStack Query + `@normy/query-core` (which Macro *also* ships) gets 90% for 0.1% of the effort. |
| 15 | `services/sync-service` | 9,502 | Rust→WASM **Cloudflare Worker** for CRDT document sync: Durable Objects for session state, D1 for peer mapping, R2 for snapshots, Loro CRDT, Bebop binary wire format. | **Rust-locked / not-worth-it.** Real-time collaborative editing is a multi-quarter specialty. If MLE ever needs it: Yjs + `y-supabase`, or buy Liveblocks. |

**Two security traps flagged by the crate analysis** — read these before porting anything:

- `crates/item_filters/src/ast.rs` lines 100–145: `EmailFilterAst` carries a `CrmScope` **authorization
  tag inside the client-supplied filter AST**, with a hand-written `Deserialize` that rejects empty
  vectors because "an empty scope tag would desynchronize downstream auth/widening behavior from AST
  intent." **If you port the filter AST as "just a query DSL," you will reproduce this as a security
  hole.** Keep authorization out of client-supplied ASTs entirely.
- The dual permission model: `entity_access` (2026-03) coexists with the Prisma-era
  `SharePermission`/`DocumentPermission`/`UserItemAccess` tables, and **both are still queried**. Macro is
  mid-migration. Port the new model only; don't replicate the legacy path.

---

## 6. Service architecture & deployment topology

### 6.1 What actually runs, and how

The 42 entries in `services/` are **not 42 of the same thing**. Breakdown by runtime, derived from
`grep -rlE "lambda_runtime|lambda_http" --include=Cargo.toml` (20 hits), `grep -rlE "^axum"` (15 hits),
`package.json` presence (5), and one directory with neither:

| Runtime type | Count | Examples |
|---|---|---|
| **AWS Lambda** (Rust, `provided.al2023`) | **20** | `docx_unzip_handler`, `email_suppression_handler`, `search_upload_handler`, `image_optimizer`, `document_text_extractor`, all `*_trigger`/`*_handler` |
| **Long-running HTTP** (Rust + axum on ECS Fargate) | **14** | `document_storage_service`, `document_cognition_service`, `email_service`, `authentication_service`, `notification_service`, `connection_gateway` |
| **Cloudflare Workers** | **4** | `sync-service` (Rust→WASM), `lexical-service`, `ai-editing-worker`, `analytics-proxy` (all TS) |
| **One-shot ECS batch task** | 1 | `sha_cleanup_worker` — no listener; runs `process()` and exits |
| **Python LiveKit Cloud agent** | 1 | `services/transcription` — no Cargo.toml, no package.json; `livekit-agents`, `resemblyzer` |
| **Library only** (no binary) | 1 | `mcp_auth_proxy` |
| **Dead placeholder** | 1 | `websocket-service` — 24 lines of Bun that replies `"ping"` |

Several Rust services are *hybrids*: `document_storage_service` is an HTTP+GraphQL server **and** a Kafka
consumer **and** a webhook worker (`main.rs` lines 715, 736, 864). `notification_service` runs an axum
server plus **four** background workers, one of which is a Postgres `LISTEN` loop
(`services/notification_service/src/main.rs` lines 121, 168–174, 245, 315).

### 6.2 Deployment: Pulumi on AWS, plus three other clouds

`infra/README.md` is unambiguous:

> "Infrastructure is written with pulumi with typescript and bun… We use AWS for all infrastructure…
> All of our infra is on `us-east-1`… From `stacks/my-service/` run `pulumi up --stack [dev | prod]`…
> We use datadog for logging."

**Not** SST, **not** CDK, **not** Terraform. Provisioned resource census
(`grep -rhoE "new aws\.[a-zA-Z]+\.[a-zA-Z]+" stacks packages | sort | uniq -c`):

```
86 aws.cloudwatch.MetricAlarm    20 aws.sqs.Queue           4 aws.rds.Instance
70 aws.iam.Policy                18 aws.lambda.Permission   4 aws.dynamodb.Table
57 SecurityGroupIngressRule      16 appautoscaling.Target   4 cloudfront.Distribution
45 aws.appautoscaling.Policy     15 cloudwatch.EventRule    3 aws.ecs.Cluster
44 aws.iam.Role                   6 aws.lambda.Function
 1 aws.opensearch.Domain   1 aws.msk.Cluster   1 aws.memorydb.Cluster   1 aws.elasticache.Cluster
```

**86 CloudWatch alarms and 70 IAM policies.** That ratio — more alarm definitions than Lambda functions
by 14× — is what production-grade actually looks like, and it is a large part of what one person cannot
maintain.

Every Fargate task ships **two sidecars** (Datadog agent + FireLens log router) alongside the service
container (`infra/packages/service/src/service.ts`), with `deploymentCircuitBreaker: {enable: true,
rollback: true}`. Autoscaling is `minCapacity: 6, maxCapacity: 15` in prod
(`packages/service/src/service_autoscaling.ts` lines 29–35), target-tracking on
`ALBRequestCountPerTarget` at 1000. **One dedicated ALB per service.**

Production database (`infra/stacks/macrodb/Pulumi.prod.yaml`):
```yaml
macrodb:engine_version: 14.17
macrodb:instance_size: db.t4g.xlarge
macrodb:allocated_storage: 2000          # GB, gp3, 12000 IOPS, 500 MB/s
macrodb:read_replica_instance_size: db.t4g.xlarge
macrodb:backup_retention_days: 6
```

Plus one OpenSearch domain (`OpenSearch_3.5`, prod: 3× `r7g.large.search` + 3 dedicated masters, 400 GB
gp3), one MSK Kafka cluster (3× `kafka.m7g.large`, `3.9.x.kraft`), MemoryDB **and** ElastiCache, 4
CloudFront distributions, and Lambda@Edge.

**Multi-cloud, for real.** AWS (39 Pulumi stacks × 2 environments ≈ 78 stack instances) **+** Cloudflare
(4 Workers, Durable Objects, D1, R2, KV) **+** LiveKit Cloud (transcription agent, deployed via
`lk agent deploy`) **+** Fly.io (preview environments) **+** Datadog **+** Doppler **+** FusionAuth.
Total distinct deployable units: **~45**.

### 6.3 The preview-environment design is genuinely great

`infra/preview/README.md`:

> "Label a PR `preview` and CI deploys the **entire stack** — every service, Postgres, OpenSearch,
> FusionAuth, LocalStack, the frontend — as one Fly app at `https://macro-pr-<N>.fly.dev`. The app
> suspends when idle (≈zero cost) and the fly-proxy wakes it on the next request."
>
> "The preview is not a parallel deployment system: it is the local stack running inside one Fly machine."

**That last sentence is the whole idea and it is excellent.** Rather than maintaining a second,
divergent "preview infrastructure" (the usual approach, and the usual source of "works in preview,
breaks in prod"), they run the *identical* `docker compose` topology inside a single 8-CPU/16 GB Fly
microVM. One artifact, two contexts. Preview environments cost approximately nothing because
`auto_stop_machines = "suspend"` and `min_machines_running = 0`.

They also solved cold-boot with a **content-addressed template volume**: forking a warm `tpl<hash>`
volume means *"the first boot pulls only image deltas instead of ~6GB cold (measured: ~11 min of a
~19 min cold boot was image pulls)."* Same trick locally — an **init snapshot** keyed by
(migrations + kickstart + index mappings + image pins + platform) lets `just stack up` skip migration,
FusionAuth provisioning, and index creation entirely.

Caveat straight from their own README: *"URLs are public. Anyone with the link can use the preview (and
read its Mailpit)… Edge auth is a planned hardening step."*

### 6.4 The local dev loop

One command — `just run_local` — but note what it costs:

| Group | Containers |
|---|---|
| Rust services (host-compiled binaries bind-mounted) | 13 |
| Aux Docker services (sync, lexical, ai-editing, websocket, static-file CDN) | 5 |
| Data infra (Postgres, Redis, Kafka, OpenSearch) | 4 |
| FusionAuth (app + its own Postgres) | 2 |
| Injected (LocalStack, Mailpit, Caddy) | 3 |
| **Total** | **≈27 containers** |

Source: `tooling/xtask/crates/xtask_local/src/local/inventory.rs`, `docker/docker-compose.yml`,
`docker/docker-compose-databases.yml`, `tooling/xtask/crates/xtask_local/src/local/gen_compose.rs`.

**RAM:** no compose file sets a memory limit and `doctor-local` doesn't check RAM. The honest evidence
is indirect — OpenSearch is pinned to a 512 MB JVM heap, FusionAuth to 512 MB, and the Fly machine
running this exact topology is provisioned at **16 GB** and described in their own README as *"a
deliberate over-provision."* Realistic floor: **8 GB to Docker; 16 GB to be comfortable.**

Two genuinely good ideas in the loop worth noting:
- **Rust is compiled on the host with `cargo zigbuild` and bind-mounted into a shared runtime image** —
  Docker never compiles Rust in the normal loop. Pressing `r` rebuilds and restarts only the services
  whose binaries changed.
- **Named multi-instance stacks**: `just run_local --instance agent-a` gives each instance its own
  compose project, volumes, networks, and deterministic ports. This exists so **multiple AI agents can
  run isolated full stacks concurrently.** Rob will recognize that problem.

### 6.5 Operational risks visible from the outside

Worth reading not as criticism but as a preview of what running this yourself means:

1. **Prod Postgres is 14.17; dev is 16.8** (`infra/stacks/macrodb/Pulumi.{prod,dev}.yaml`). A v16
   parameter group is staged but unattached. A well-funded team is carrying a two-major-version drift.
2. **Both prod RDS instances are `publiclyAccessible: true`** (primary and read replica,
   `stacks/macrodb/index.ts`).
3. **OpenSearch access policy is `Principal: {AWS: '*'}, Action: 'es:*'`** — VPC-scoped in prod, and
   explicitly public in dev (*"we will have public access for non-prod to make testing simpler"*).
4. **`websocket-service` is dead code** wired into compose and Fly previews with no Pulumi stack.
5. **`sync-service` and `analytics-proxy` have no CI deploy workflow** — manual `wrangler deploy` only,
   unlike their two sibling Workers.
6. **Three services never run locally** — `convert_service`, `mcp_service`, `scheduled_action` are absent
   from `RUST_SERVICES` in `inventory.rs`, so conversion, MCP, and scheduled agents cannot be exercised
   on a dev machine.
7. **Fly previews are publicly reachable with no auth**, Mailpit included.

If a 20-engineer, $30M-funded, SOC 2 Type II certified team carries this much drift, that is the honest
baseline for what solo operation of this system would look like.

---

## 7. Auth model — how permissions actually work

### 7.1 Authentication: fully delegated to self-hosted FusionAuth

`crates/fusionauth` is a hand-rolled REST client (`reqwest` + `serde` only, no DB, no Macro crates)
against a **self-hosted FusionAuth** — `fusionauth/fusionauth-app:1.62.1`, its own Postgres, its own
Pulumi stack (`infra/stacks/fusionauth-instance/`, `infra/stacks/fusion-auth/`).

`services/authentication_service` (11,498 LOC) is a façade over it, with ~40 endpoints across
`/login`, `/oauth`, `/oauth2`, `/jwt`, `/session`, `/user`, `/link`, `/permissions`, `/teams`,
`/internal`, `/webhooks` (`services/authentication_service/src/api/mod.rs` line 77).

**There is no server-side session table.** "Session" = FusionAuth's refresh token + two
environment-prefixed cookies (`crates/macro_auth/src/headers.rs` — `dev-`/`local-` prefixes so
environments can't cross-authenticate on the same browser; a nice small touch).

The identity contract is **bidirectional and FusionAuth-specific**. A FusionAuth server-side JS lambda
calls *back into Macro* to populate the JWT
(`infra/stacks/fusionauth-instance/templates/populate_jwt.js`):

```js
var response = fetch('{{AUTH_SERVICE_URL}}/webhooks/user/jwt', {
  method: 'POST',
  headers: { 'x-internal-auth-key': '{{INTERNAL_SECRET}}' },
  body: JSON.stringify({ email: user.email })
});
jwt.macro_user_id = JSON.parse(response.body).user_id;
```

So FusionAuth is **not swappable without real work** — you'd reimplement this lambda, the multi-tenant
application model, and the whole `identity_provider` link/unlink surface.

**Blunt read for Rob: this is a reason NOT to self-host Macro, and a reason MLE's Supabase Auth plan is
the better choice.** Supabase Auth gives you Google OAuth, JWTs, refresh rotation, and — critically —
JWT claims that RLS policies can read, with zero infrastructure. FusionAuth is a container you own,
patch, back up, and page yourself about.

### 7.2 The JWT: HS256 shared secret — the model's biggest weakness

`crates/macro_auth/src/middleware/decode_jwt.rs` dispatches on `kid`:

```rust
let kid = token.kid.context("expected kid")?;
if kid == "macro" {
    // RS256 macro-api-token, verified against a cached public key
} else {
    // HS256 FusionAuth access token
    let mut validation = Validation::new(Algorithm::HS256);
    decode::<MacroAccessToken>(token, &DecodingKey::from_secret(jwt_secret.as_ref().as_bytes()), &validation)
}
```

**There is no JWKS.** Every service in the fleet holds the HS256 secret (from AWS Secrets Manager,
e.g. `fusionauth-jwt-secret-prod`), which means **every service can forge a token for any user.** With
15 ECS services + 20 Lambdas, that's 35 blast-radius surfaces. Their own Macro-issued API token is
correctly asymmetric (RS256, `crates/macro_auth/src/macro_api_token.rs`) — they know the pattern; the
FusionAuth path just predates it.

Also: tokens are accepted from a **query parameter** (`?macro-api-token=…`,
`crates/decode_jwt/src/lib.rs`). Convenient for `<img src>` and download URLs, but it puts credentials
in access logs and `Referer` headers.

**Supabase's default is RS256 + JWKS** — verifiers are not signers. MLE gets the better model for free.

### 7.3 Authorization: grouped-ACL, checked in SQL, decided in Rust

Not RBAC, not capability-based, not Zanzibar. It is a **denormalized ACL with group subjects**.
Transitivity is handled two ways: **materialized at write time** (project containment, via
`granted_from_project_id`) or **resolved by one-hop fan-out at read time** (channel/team membership).

The check is a three-step split:

1. **Fan the principal out (SQL, memoized 30s)** —
   `crates/entity_access/src/outbound/pg_access_repo/queries/mod.rs`:
   ```rust
   #[cfg_attr(not(test), cached(time = 30, result = true, ...))]
   pub async fn get_user_source_ids(...) -> anyhow::Result<SourceIds> {
       // channels (left_at IS NULL) UNION ALL teams UNION ALL self
   ```
2. **Semi-join the ACL (SQL)** — `source_id = ANY($2)`, UNION'd with the legacy public-share path.
3. **Resolve (Rust)** — `.max()` over the returned `AccessLevel`s, which is a totally ordered enum
   (`View < Comment < Edit < Owner`).

### 7.4 The receipt pattern — best-in-class, and the reason the app-layer model is defensible

`crates/entity_access/src/domain/models.rs`:

```rust
pub struct EntityAccessReceipt<T: RequiredPermission> {
    pub(crate) auth: EntityAccessAuth,
    pub(crate) entity: Entity,
    pub(crate) entity_permission: EntityPermission,
    pub(crate) _marker: PhantomData<T>,
}

pub fn try_new(...) -> Result<EntityAccessReceipt<T>, AccessError> {
    if !entity_permission.satisfies::<T>() { return Err(AccessError::Unauthorized); }
    Ok(EntityAccessReceipt { ... })
}
```

All fields are `pub(crate)`, so a receipt **cannot be constructed outside the crate**. Every mutation
takes one as a parameter. Downgrading re-validates rather than transmuting
(`try_into_requirement::<U>()`). Escape hatches exist and are named to shame:
`dangerously_assert_internal_user`, `dangerously_assert_authenticated_user`, `dangerously_assert_bot`.

**A service method that forgot to check permission simply does not compile.** That is a genuinely
excellent piece of design, and it is what makes "no RLS" a defensible choice *for Macro*. It is also
exactly what MLE does not and cannot have in TypeScript — which is why MLE should use RLS instead.

`crates/entity_mutation` (264 LOC, landed in commit `61fd03e`) extends this: each of seven capability
traits declares its required level as an **associated type**, so the permission matrix becomes greppable:

| Domain | Rename | Move | SharePolicy | Trash | DeletePerm | Duplicate |
|---|---|---|---|---|---|---|
| documents | Edit | Edit | Edit | Owner | — | **View** |
| projects | Edit | Owner | Owner | Owner | Owner | — |
| chat | Owner | Owner | Owner | Owner | Owner | View |
| channels | **AdminRole** | — | — | — | **OwnerRole** | — |

Note "duplicate only needs View" — you may copy anything you can read. That's a *product* decision that
was previously buried in a handler and is now a one-line declaration. Status: contracts landed,
**router not yet wired** (`grep -rln "entity_mutation" services/` → no results). They shipped the
type-level scaffolding ahead of the migration.

### 7.5 Channel inheritance, in full

The README's marquee feature, implemented by two different mechanisms:

**(a) @mention in a channel → grant to the channel.** `crates/channels/src/domain/service.rs` calls
`update_channel_share_permissions_for_referenced_items` from `post_message`, `patch_message`, and
`add_attachments`. The adapter
(`crates/channels/src/outbound/pg_channel_reference_share_permissions.rs`) has a **confused-deputy
guard** — the mentioner must already have access — and hard-caps the grant at `AccessLevel::View`
regardless of the mentioner's own level. Both are correct and worth copying.

**(b) Join a channel → gain access.** *There is no backfill job.* It falls out of step 1 above:
`WHERE cp.user_id = $1 AND cp.left_at IS NULL`. Add a participant row and every historical grant to
that channel is instantly visible. Leaving sets `left_at` and it's instantly gone. **The entire
feature is one column in a `WHERE` clause.** This is the most elegant thing in the codebase.

**(c) Project containment** is the materialized path — sharing a project writes a direct grant plus a
cross-product of `granted_from_project_id`-tagged rows over every descendant, computed by a recursive
CTE (`crates/entity_access_db_utils/src/lib.rs` lines 155–176).

### 7.6 Multi-tenancy: honestly, it's thin

```
grep -rln "ROW LEVEL SECURITY|CREATE POLICY"   →  no results
```

And `organization_id` is **not** the content boundary — documents, chats, projects, email threads and
calls have **no organization column**. Every `organization_id` predicate in the codebase is
administrative (invitations, retention, user counts). There's even a migration walking back org-scoped
channels (`20260601000000_remove_organization_channel_type.sql`). The real boundary is teams and
channels, enforced entirely in application code.

The consequence, stated plainly: **the authorization predicate — that `user_source_ids` CTE — is
copy-pasted into 10+ files** (`macro_db_client/src/item_access/get_accessible_items.rs`,
`document/list_documents_with_access.rs`, `call_record/get.rs`, `share_permission/access_level/chat.rs`,
`call/src/outbound/pg_call_repo.rs`, `soup/src/outbound/pg_soup_repo/{expanded,unexpanded}/*`, …). There
is no single definition of "what this user can see." The `get`-path and the `list`-path can diverge, and
a missed join is a silent cross-tenant read with no database-level backstop.

**This is the single most important lesson in the whole report for Rob**, and it argues the opposite of
what you'd expect from admiring the code: *the receipt pattern protects the mutation paths beautifully
and does nothing for the query paths.* Postgres RLS protects both, because it is impossible to forget.

Other sharp edges worth knowing before copying anything:
- **30-second `cached` TTLs with no invalidation** on `get_user_source_ids`, `get_bot_source_ids`,
  `get_entity_users`, `get_user_accessible_items` → **revocation is eventually consistent, up to ~30s
  stale, per replica.**
- **Fire-and-forget share propagation** — all three call sites log-and-continue on error; the message
  persists but the grant may not.
- `if insert_result == AlreadyExists { return Ok(()); }` returns **with an open transaction, before the
  `entity_access` row is written** — `SharePermission` and `entity_access` can permanently diverge.
- `EntityType::StaticFile => Ok(Some(AccessLevel::View))` unconditionally, self-documented
  `// This is wrong for owners`.
- `EntityType::{Team, User, ChannelMessage} => Ok(None)` — "don't have access checks implemented yet."
- The refresh-token advisory lock is commented out: `"Disabled until we fix FE auth setup."`

---

## 8. What is genuinely impressive vs. what is standard

### Genuinely novel / hard engineering

1. **`soup`** — a unified, filtered, sorted, grouped, cursor-paginated, permission-scoped query engine
   over ~10 heterogeneous entity types, with a two-phase top/detail SQL strategy and hand-tuned planner
   hints. I have not seen this done this well elsewhere. (`crates/soup/`, 20,188 LOC)
2. **`EntityAccessReceipt<T>` typestate authorization** — compile-time proof that a permission check
   ran, with un-forgeable tokens. Genuinely best-in-class. (`crates/entity_access/src/domain/models.rs`)
3. **A normalized GraphQL cache written in Rust, compiled to WASM, running in the browser** over
   IndexedDB/SQLite. 8,087 LOC. Apollo's normalized cache, rewritten. (`crates/client/cache-core/`)
4. **CI generated from typed Rust** — 32 workflows emitted by `cargo x workflows`, with a
   `check_generated` job that fails on drift. (`tooling/xtask/crates/xtask_workflows/`)
5. **Preview = the local stack in one Fly microVM**, with content-addressed template volumes and init
   snapshots. One topology, three contexts (local / preview / CI). (`infra/preview/README.md`)
6. **~1,436 compile-time-verified SQL queries** via sqlx offline cache, with clippy banning the dynamic
   escape hatch. Schema drift is a build failure.
7. **Rust→WASM Cloudflare Worker with Durable Objects for CRDT sync** (`services/sync-service`).
   Impressive; also completely specialist.

### Standard, well-executed, not novel

Hexagonal architecture · SQS/Lambda/EventBridge fan-out · OpenSearch with alias-swap reindexing ·
Kafka for domain events · DynamoDB for connection tracking · Pulumi per-service stacks · Datadog
sidecars · ECS Fargate autoscaling on request count · Redis rate limiting · pgvector dedup ·
frecency ranking (a Mozilla algorithm from 2008) · EAV custom properties · JWT + OAuth via a
third-party IdP.

### Places where a well-funded team still has debt

Prod Postgres 14 vs dev 16 · publicly accessible RDS · `Principal: {AWS:'*'}` on OpenSearch · HS256
shared-secret JWTs · dual permission model mid-migration · the auth predicate copy-pasted 10+ times ·
dead `websocket-service` · two Workers with no CI deploy · three services that can't run locally ·
unauthenticated public preview environments.

**The point of listing these is not to score points.** It's the answer to question 7: this is what a
20-engineer, SOC 2 Type II, $30M-funded team's codebase looks like after a few years. Any estimate of
solo operation has to assume *at least* this much drift, with nobody to catch it.

---

## 9. The five things genuinely worth stealing

Ranked by (value to MLE) ÷ (effort). Every one is plain Postgres or plain design — **no Rust, no AGPL
exposure.**

### 1. The `entity_access` grant table — and implement it as Supabase RLS
**Effort: 2–3 days. Value: unblocks the thing MLE is currently blocked on.**

Nine columns (§4.4) replace the entire four-layer role model in MLE's PRD Task 4.6. Map it directly:

```sql
create type access_source_type as enum ('user','team','vertical','org');
create type access_level       as enum ('view','comment','edit','owner');

create table entity_access (
  id                bigserial primary key,
  entity_id         uuid not null,
  entity_type       text not null,          -- 'person'|'org'|'deal'|'project'|'document'
  source_id         text not null,          -- rep id | team id | vertical id
  source_type       access_source_type not null,
  access_level      access_level not null,
  granted_from_id   uuid,                   -- provenance: which container granted this
  created_at        timestamptz not null default now()
);
create unique index on entity_access (entity_id, entity_type, source_id, source_type)
  where granted_from_id is null;
create unique index on entity_access (entity_id, entity_type, source_id, source_type, granted_from_id)
  where granted_from_id is not null;
```

Then — and this is the part Macro *can't* do — put the fan-out in a `SECURITY DEFINER` function and
reference it from RLS:

```sql
create or replace function auth_source_ids() returns setof text
  language sql stable security definer as $$
    select auth.uid()::text
    union all select team_id::text from team_members where user_id = auth.uid() and left_at is null;
  $$;

create policy deals_read on deals for select using (
  exists (select 1 from entity_access ea
          where ea.entity_type='deal' and ea.entity_id = deals.id
            and ea.source_id in (select auth_source_ids()))
);
```

**Why this specifically:** MLE's open question Q2 ("sales-agent book visibility — drives the entire RLS
design") is blocking Phase 4.6, which gates everything user-facing. This table *is* the answer. An
outside agent's protected book is `source_type='user'`; a house rep's team access is
`source_type='team'`; Rob's super-admin lens is a policy exemption. And `granted_from_id` means when a
rep leaves a team, exactly the derived grants disappear.

Steal the **partial unique indexes** verbatim — they're the non-obvious part.

### 2. The custom-properties schema (`entity_properties`)
**Effort: 1 day. Value: high — MLE needs per-vertical custom fields and has no design yet.**

§4.5 in full. Three tables, a JSONB tagged union, one CHECK constraint, one GIN index. Copy the SQL
almost literally; the only change is your `entity_type` enum. The CHECK constraint enforcing
"scalars aren't arrays, selects always are" is what keeps this from degenerating into the usual EAV
swamp.

### 3. The two-phase feed query
**Effort: applies to code you're already writing. Value: compounding.**

From `crates/soup/src/outbound/pg_soup_repo/expanded/dynamic.rs`: never hydrate a row you'll discard.

- **Phase 1:** `UNION ALL` across sources selecting *only* `(type, id, sort_ts)` + filter joins. Sort, limit.
- **Phase 2:** join back from that ~50-row set to fetch full columns.

MLE's `rm_pipeline` / `rm_action_items` / "who do I touch today" read models will all hit this the
moment there's real data volume. Also steal the `CASE $2 WHEN 'created_at' ... END` sort trick — one
prepared statement covers every sort order.

And read the comment at `dynamic.rs` lines 952–960 before you reach for `MATERIALIZED`: they found it
"pinned the worst plan." Let the planner choose.

### 4. The dedup pipeline: vector recall → rerank → LLM judge → persisted scores
**Effort: ~1 week. Value: direct upgrade to shipped MLE code.**

§4.6. MLE already has `lib/dedup/` with deterministic matching and a `DedupQueue` UI. Add:
`CREATE EXTENSION vector`, a `person_dedup_embedding` table, and a `dedup_match` table carrying
`vector_score`, `rerank_score`, `judge_reason`, `dismissed_by`, `dismissed_at`, plus
`CHECK (a_id < b_id)`.

Two details that matter more than the pipeline: **persist every score and the judge's reasoning** (this
is `scoring-pattern.md` rule 4 — never emit a bare number), and **build the eval corpus**
(`crates/task_dedup/src/eval/`). Rob's own scoring rules demand explainability; Macro shows what that
looks like in a schema.

### 5. Two process artifacts: the numbered style guide, and CI-as-code
**Effort: 1–2 days. Value: high, and directly serves the CARDINAL RULES.**

`docs/STYLE_GUIDE.md` is 224 lines of **stably-numbered, scope-tagged, evidence-linked, enforcement-
annotated rules**: `CS-08 [db] Use sqlx::query! ... (#4156 · enforced: clippy disallowed-methods)`. IDs
are never renumbered or reused. Reviewers cite "see CS-30." And critically, **rules that can be
mechanically enforced are enforced mechanically** — `clippy.toml` bans `std::env::var`, `rules/ast-grep/`
holds four structural lint rules, and `just check` is the single gate.

That is CR-3 ("guaranteed steps live in CODE/HOOKS, never prose") implemented by someone else, and
it's directly transplantable: an `MLE-##` numbered guide + ESLint rules + ast-grep + a single
`npm run check` gate.

The CI generator (`tooling/xtask/crates/xtask_workflows/`) is the same instinct one level up. MLE has
few workflows today, so don't build a generator — but *do* adopt the principle when the count grows
past ~5: shared steps become functions, and a `check_generated` job fails on drift.

---

## 10. The five things NOT worth copying — and why

### 1. The service-per-concern explosion (42 services, 39 Pulumi stacks)
Macro splits along **team boundaries and scaling boundaries**, both of which Rob has exactly one of.
Every split costs a deploy pipeline, an ALB, an IAM role, alarms, a Doppler config, and a network hop.
Their own `email_service` ships 12 binaries and still needed a separate `pubsub_workers` deployment.
**MLE's Next.js route handlers + Vercel functions are the correct architecture for one operator** —
they are one deploy, one log stream, one rollback. Adopt the *module* boundaries (`lib/esign/`,
`lib/dedup/`, `lib/scoring/` — which MLE already has), not the *deployment* boundaries.

### 2. OpenSearch + Kafka + DynamoDB + MemoryDB + ElastiCache
Nine datastores. MLE's Postgres `tsvector` + GIN search returns in **57ms in production** (per the PRD).
OpenSearch earns its keep at Macro's corpus size and not before; the crossover is somewhere north of
10M rows. Kafka is for cross-service event fan-out — with one service you have function calls.
DynamoDB tracks WebSocket connections — Supabase Realtime does that for you. **Every one of these is a
thing that pages you at 3am and costs $200–2,000/month to keep warm.** Supabase's Postgres already has
pgvector, pg_trgm, LISTEN/NOTIFY, and Realtime.

### 3. Self-hosted FusionAuth
A container, its own Postgres, its own Pulumi stack, a custom JS lambda that calls back into your API,
a multi-tenant application model, HS256 secrets in every service, and a `local_auth` cargo feature to
make dev bearable. **Supabase Auth does the same job with zero infrastructure and issues RS256 JWTs
whose claims RLS can read** — which is strictly better, because it makes the database the enforcement
point. MLE's PRD Task 4.6 (Supabase Auth + Google OAuth) is already the right call; nothing here should
change it.

### 4. The Rust→WASM client cache and the CRDT sync service
`crates/client/cache-core` (8,087 LOC) is a normalized GraphQL cache in Rust compiled to WASM.
`services/sync-service` is a Rust→WASM Cloudflare Worker with Durable Objects, D1, R2, KV, Loro CRDT,
and a Bebop binary wire format. Both are excellent. Both are multi-quarter specialist efforts that solve
problems MLE does not have — MLE has **zero real-time features today** and a CRM does not need
collaborative editing. Note Macro *also* ships `@normy/query-core` for normalization; TanStack Query
plus that gets 90% for 0.1% of the cost. If real-time collaboration ever becomes a requirement: buy
Liveblocks or use Yjs.

### 5. The 164-crate split, and app-layer-only authorization
Two separate mistakes to avoid inheriting.

**The crate split** is Rust compile-unit management — 57 crates are under 300 LOC (§1a). In TypeScript
it buys nothing and costs import churn. Judge modules by cohesion, not by count.

**App-layer-only authorization is the one place Macro's design is actively wrong for MLE.** It works for
them because of the receipt typestate — and even so, the fan-out CTE is duplicated across 10+ files with
no single source of truth, and revocation lags up to 30 seconds. TypeScript cannot give you the
compile-time proof, so copying the "no RLS" posture means copying the weakness without the mitigation.
MLE is *currently* in exactly that position (service-role everywhere, RLS enabled with zero policies per
`supabase/migrations/0006_rls_enable.sql`). **Take Macro's table; reject Macro's enforcement point.**

---

## 11. Self-hosting effort — brutally realistic

### 11.1 Just to get it running (not modified, not production)

| Phase | Engineer-weeks | Why |
|---|---|---|
| Replace Doppler with your own secret source | 1–2 | `just run_local` requires access to Macro's `local` Doppler project. The `--no-doppler --env-file` escape hatch means reverse-engineering **≥114 env vars** with no manifest |
| Stand up local stack, get it green | 1–2 | ~27 containers, 16 GB RAM. Nix + `cargo-zigbuild` + Zig + Bun + sqlx-cli + Docker. Three services can't run locally at all |
| Provision AWS via Pulumi | 3–5 | 39 stacks × 2 envs. VPC, RDS+replica, MSK, OpenSearch, MemoryDB, ElastiCache, 4 CloudFront distributions, 70 IAM policies, 86 alarms. Every hardcoded `macro.com` / ACM cert / Doppler project ref must be repointed |
| Cloudflare Workers (4) | 1 | Durable Objects, D1, R2, KV. Two have no CI workflow |
| FusionAuth: tenant, application, kickstart, JWT lambda | 1–2 | Including the webhook callback contract |
| LiveKit Cloud (calls + transcription) | 1 | Or cut the feature |
| DNS, TLS, email deliverability (SES + suppression) | 1–2 | |
| First green end-to-end deploy | 2–3 | The gap between "stacks applied" and "a user can log in and send an email" |
| **Subtotal — a working instance** | **11–18 weeks** | |

### 11.2 Then, to actually operate it

| Item | Ongoing |
|---|---|
| Patching 9 datastores, Rust toolchain, 1,277 crates, 2,085 npm packages | 0.5–1 day/week |
| 86 CloudWatch alarms — triage, tuning, false positives | 0.5 day/week |
| AGPL compliance if you offer it as a service (source offer to every user) | ongoing legal |
| Postgres major upgrades (they're stuck on 14 with 16 staged) | multi-week projects |
| Incident response with no on-call rotation | unbounded |

### 11.3 Infrastructure cost, at *minimum* viable prod

Derived from `infra/stacks/*/Pulumi.prod.yaml` and the sizing table in §6.2. Rough monthly, us-east-1:

| Component | Prod config | ~$/mo |
|---|---|---|
| RDS `db.t4g.xlarge` + replica, 2000 GB gp3 @ 12k IOPS | `macrodb/Pulumi.prod.yaml` | $900–1,400 |
| MSK 3× `kafka.m7g.large` | `stacks/kafka-cluster` | $500–700 |
| OpenSearch 3× `r7g.large` + 3 masters, 400 GB | `stacks/opensearch` | $600–900 |
| ECS Fargate, 15 services, min 6 tasks each | `service_autoscaling.ts` | $1,500–3,000 |
| ~15 ALBs (one per service) | `load_balancer.ts` | $250–400 |
| MemoryDB + ElastiCache | | $150–300 |
| CloudFront ×4, S3, SQS, Lambda, DynamoDB, NAT | | $200–500 |
| Datadog (agent + FireLens on every task) | | $300–800 |
| FusionAuth ECS + its RDS | | $100–200 |
| **Total** | | **≈$4,500–8,200/month** |

Plus Cloudflare Workers, LiveKit Cloud, Doppler, and LLM inference. **Call it $60–100k/year before a
single customer.** Trimming to one replica and small instances gets you to maybe $1,500–2,500/month,
at which point you're running a fragile version of a system designed for redundancy.

### 11.4 One founder + AI agents — the honest answer

**Standing it up: plausible. Operating it: no.**

AI agents are genuinely good at the 11–18 weeks of setup — it's mechanical, well-documented, and
verifiable. Agents are *not* good at: being paged at 3am, deciding whether a Kafka consumer lag alarm
is real, performing a Postgres 14→16 major upgrade on a 2 TB database with a read replica, or noticing
that the OpenSearch access policy has been `Principal: {AWS:'*'}` for eight months.

The decisive number is §1's: **11 engineers committed in 31 hours.** This system's maintenance load was
sized for that team, and *they* are carrying a two-major-version Postgres drift and publicly accessible
RDS instances. One person inherits all of that with none of the redundancy.

**Verdict on "merge Macro wholesale into MLE": no. Not close.** Concretely:

- MLE is **32,757 LOC**; Macro is **~1,087,000**. That is a **33× multiplier**, in languages Rob doesn't
  ship (Rust) and a framework he doesn't use (SolidJS).
- Zero frontend reuse. Solid's signal-based reactivity cannot be copy-pasted into React 19.
- Nine datastores vs. one. Vercel + Supabase vs. AWS + Cloudflare + Fly + LiveKit.
- AGPLv3 §13 would require offering complete corresponding source of the combined work to every hosted
  user — which is incompatible with selling MLE to roofing contractors as a proprietary SaaS. (Macro
  sells commercial relicensing precisely for this reason: `README.md` line 99.)
- Even the *partial* merge — "just take the Rust backend" — means adopting Kafka, OpenSearch,
  DynamoDB, FusionAuth, Pulumi, Doppler, and Nix.

### 11.5 What to actually do — and the sequencing

**Copy schemas and patterns. Do not copy code, services, or infrastructure.** Total: **3–4 weeks** of
work that makes MLE materially better, versus 11–18 weeks that makes it unmaintainable.

| Order | Item | Effort | Unblocks |
|---|---|---|---|
| 1 | `entity_properties` custom-properties schema (§4.5) | 1 day | Per-vertical custom fields |
| 2 | `entity_access` + RLS policies (§4.4, §9.1) | 2–3 days | **PRD Task 4.6 / open question Q2** |
| 3 | Numbered style guide + mechanical enforcement (§9.5) | 1–2 days | CR-3 compliance |
| 4 | Two-phase feed query pattern (§9.3) | applied inline | Read-model performance |
| 5 | Vector dedup + eval corpus (§9.4) | ~1 week | Upgrade to shipped `lib/dedup/` |
| 6 | Capability-contract pattern for entity mutations (§5.2 row 4) | 0.5 day | Uniform rename/move/trash across person/org/deal |
| 7 | Frecency scoring for "who do I touch today" (§5.2 row 6) | 2 days | Rep cockpit ranking |

**Item 2 is the one that matters most.** MLE's PRD says Q2 "drives the entire RLS design" and is
blocking Phase 4.6, which gates every user-facing deploy. Macro shipped the answer: a nine-column grant
table with polymorphic subjects and a provenance column. Rob gets to implement it in the *better*
place — inside Postgres, as RLS — because Supabase is built for exactly that and Macro's Rust service
mesh is not.

That is the real return on reading this codebase: not the million lines, but nine columns and the
judgment about where to enforce them.
