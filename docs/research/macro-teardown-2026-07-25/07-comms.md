# 07 — The Communications Engine
### Macro (macro.com, AGPLv3) teardown → blueprint for adding real comms to the MLE CRM
**Analyst:** Head of Engineering · **Date:** 2026-07-25 · **Target:** `…/scratchpad/macro` · **Consumer:** `/Users/robertacheson/Projects/MyLocalEverything/MLE ROB Dashboard`

All Macro paths below are relative to
`/private/tmp/claude-501/-Users-robertacheson-Projects-MyLocalEverything/1eb0b710-ce17-40e9-ac89-e0bbf3de6054/scratchpad/macro/`.
All MLE paths are relative to `/Users/robertacheson/Projects/MyLocalEverything/MLE ROB Dashboard/`.

---

## 0. Headline findings (read this if you read nothing else)

| # | Finding | Evidence |
|---|---|---|
| 1 | **Macro syncs Gmail and ONLY Gmail.** No Outlook, no Microsoft Graph, no IMAP. The provider enum has exactly one variant. | `crates/macro_db_client/migrations/20251030154634_email_db_schema.sql:5` — `CREATE TYPE email_user_provider_enum AS ENUM ('GMAIL');` |
| 2 | Incremental sync is **Gmail push (Pub/Sub `users.watch`) → historyId diff → fan-out to SQS**. No polling of message lists. | `crates/gmail_client/src/watch.rs`, `services/email_service/src/api/gmail/webhook.rs`, `services/email_service/src/pubsub/inbox_sync/operations/gmail_message.rs` |
| 3 | **Every email row is partitioned by `link_id`** — one connected mailbox = one link. This is *exactly* the identity-isolation primitive Rob's two-address rule needs. | `…20251030154634_email_db_schema.sql:157-167`, unique `(fusionauth_user_id, email_address, provider)` at line 455 |
| 4 | **CRM auto-association is domain-based, and RECEIVING mail never creates a company.** Only sending to a domain promotes it. | `crates/crm/src/outbound/companies_repo.rs:334-340` |
| 5 | **Macro is not a cold-outreach system.** Bounce/complaint suppression (`email_suppression_handler`) guards only Macro's own transactional SES mail (magic links, welcome emails) — it is never consulted before a user's Gmail send. | `crates/macro_db_client/src/blocked_email.rs` callers are only `services/authentication_service/src/api/login/passwordless.rs:74` and `…/mobile_welcome_email/mod.rs:103` |
| 6 | The AI teammate pattern is fully productionised and small: **@mention → post a "thinking" placeholder → run agent loop → EDIT that same message with the answer.** ~330 lines. | `crates/channel_bots/src/domain/service.rs:253-320` |
| 7 | **`SendEmail` is registered as a *user tool*, not an agent tool** — the model proposes, a human clicks. Every other tool auto-executes. | `crates/email/src/inbound/toolset/mod.rs:155` (`add_user_tool::<SendEmail>`), semantics in `crates/ai_toolset/src/toolset/tool_object/user_tool.rs` |
| 8 | MLE already has ~40% of Phase A shipped: `activities`, `tasks`, and a hardened n8n Gmail capture with an identity gate. What's missing is **bodies, threads, and participants**. | `supabase/migrations/0005_crm_core.sql`, `lib/n8nEmail.ts` |

---

# PART I — MACRO TEARDOWN

## 1. Email ingestion

### 1.1 Providers

One. Gmail / Google Workspace, via the Gmail REST API v1.

```sql
-- crates/macro_db_client/migrations/20251030154634_email_db_schema.sql:5
CREATE TYPE email_user_provider_enum AS ENUM ('GMAIL');
```

Re-asserted in Rust in `services/email_refresh_handler/src/handler.rs:13-17`:

```rust
#[derive(Type, Debug, Clone, Copy)]
#[sqlx(type_name = "email_user_provider_enum", rename_all = "UPPERCASE")]
pub enum DbUserProvider { Gmail }
```

The client crate is `crates/gmail_client/` (2,007 LOC total) with one module per Gmail API surface: `messages.rs`, `threads.rs`, `labels.rs`, `history.rs`, `watch.rs`, `attachments.rs`, `contacts.rs`, `filters.rs`, `profile.rs`, `auth.rs`.

**Read for MLE:** a company that raised real money and has been at this for years chose to support exactly one provider rather than build an abstraction. Do not build a provider abstraction. Rob's reps are on Google.

### 1.2 The "link" — the mailbox connection primitive

```sql
-- …20251030154634_email_db_schema.sql:157-167
CREATE TABLE public.email_links (
    id                 uuid                            NOT NULL,
    macro_id           text                            NOT NULL,   -- app user
    fusionauth_user_id text                            NOT NULL,   -- IdP subject
    email_address      character varying(320)          NOT NULL,
    provider           public.email_user_provider_enum NOT NULL,
    is_sync_active     boolean DEFAULT true            NOT NULL,
    created_at         timestamptz DEFAULT now()       NOT NULL,
    updated_at         timestamptz DEFAULT now()       NOT NULL
);
-- line 455
ALTER TABLE ONLY public.email_links
    ADD CONSTRAINT email_uq_links_user_email_provider
    UNIQUE (fusionauth_user_id, email_address, provider);
```

Every downstream table carries `link_id`: `email_messages.link_id`, `email_threads.link_id`, `email_contacts.link_id`, `email_labels.link_id`, `email_gmail_histories.link_id`, `email_sync_tokens.link_id`, `email_user_history.link_id`, `email_backfill_jobs.link_id`, `crm_contact_sources.link_id`.

Uniqueness is *per link*, not global:

```sql
-- lines 666, 673
CREATE UNIQUE INDEX uq_messages_link_id_provider_id
  ON public.email_messages (link_id, provider_id) WHERE provider_id IS NOT NULL;
CREATE UNIQUE INDEX uq_threads_link_id_provider_id
  ON public.email_threads  (link_id, provider_id) WHERE provider_id IS NOT NULL;
```

**This is the single most important structural idea in the whole subsystem for Rob.** The same physical Gmail message appearing in two connected mailboxes produces two independent rows under two link_ids. There is no join path between them. Applied to Rob's constraint (`~/.claude/rules/email-identity.md`): `rob@aivoicetech.io` is one link, `rob@boostuppayments.com` would be a different link, and no query in the system can accidentally merge them because every index, every FK, every read is link-scoped. Identity isolation becomes a schema property rather than a code discipline.

The `is_sync_active` flag is checked at the top of every sync operation — `services/email_service/src/pubsub/inbox_sync/process.rs:80-82`:

```rust
// if sync is disabled we shouldn't update the user's inbox
if !link.is_sync_active { return Ok(()); }
```

### 1.3 OAuth

Token custody is **not** in the email service. `services/email_service/src/pubsub/inbox_sync/process.rs:128-147` delegates:

```rust
pub async fn fetch_pubsub_gmail_token(ctx: &PubSubContext, link: &Link)
    -> Result<String, ProcessingError> {
    let gmail_access_token = crate::util::gmail::auth::fetch_token_or_mark_reauth(
        link, &ctx.db, &ctx.redis_client, &ctx.auth_service_client, &ctx.sqs_client,
    ).await…
}
```

- Refresh tokens live behind `auth_service_client` (FusionAuth, `crates/fusionauth/`), never in the email tables.
- Access tokens are cached in Redis (`services/email_service/src/util/redis/access_token.rs`).
- On refresh failure the function name says it all: **`fetch_token_or_mark_reauth`** — it flips a health flag on the link rather than failing silently. Migration `20260615180337_add_email_links_reauth_health.sql` added the columns; `services/email_refresh_handler` probes links on a schedule to catch dead grants *before* the user notices.

Google's Pub/Sub push is authenticated with a signed JWT verified against Google's JWKS, with automatic key-rotation retry — `crates/gmail_client/src/auth.rs:59-110` and `services/email_service/src/api/gmail/webhook.rs:106-160`.

### 1.4 Incremental sync — the loop

Cursor table:

```sql
-- …20251030154634_email_db_schema.sql:127-133
CREATE TABLE public.email_gmail_histories (
    link_id    uuid        NOT NULL,
    history_id text        NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);
```

**The flow, end to end:**

1. **Register the watch.** `crates/gmail_client/src/watch.rs:8-70` POSTs `/users/me/watch` with a Pub/Sub topic. Two typed failure modes worth stealing: a `400` containing `"push notification client allowed"` maps to `GmailError::Conflict` (a stale watch exists — stop it and retry), and `403` maps to `Forbidden` (token minted without the Gmail scope). Initial `history_id` is persisted at `services/email_service/src/api/email/init.rs:854`.

2. **Google pushes.** `services/email_service/src/api/gmail/webhook.rs:19-72`. The handler validates the JWT, resolves `email_address → link`, and immediately enqueues to SQS, returning `202`. **It does zero work inline.** This is the right shape: the webhook is a doorbell, not a worker.

3. **Diff the history.** `services/email_service/src/pubsub/inbox_sync/operations/gmail_message.rs`:
   - Line 55: `if db_history_u64 >= payload.history_id { return Ok(()); }` — monotonic guard, drops duplicate/out-of-order pushes.
   - Lines 71-78: sync labels *first* (a message can arrive referencing a label you've never seen).
   - Line 97: `get_history(&token, &db_history_id)` — `crates/gmail_client/src/history.rs` paginates `/users/me/history` at 500/page until `nextPageToken` is exhausted.
   - Lines 113-124: **persist the new history_id BEFORE processing the changes.** The comment is explicit — this prevents duplicate processing when a second push lands mid-flight. It trades at-least-once for at-most-once on the cursor and relies on idempotent upserts downstream.
   - Lines 148-184: fan the diff out into one SQS message per change — `UpsertMessage`, `DeleteMessage`, `UpdateLabels`.

4. **Process each change.** `services/email_service/src/pubsub/inbox_sync/process.rs:84-109` dispatches to `upsert_message.rs` (747 LOC — the real work), `delete_message.rs`, `update_labels.rs`.

**Error taxonomy** (`process.rs:37-56`) — every failure is classified `Retryable` (leave the SQS message, let visibility timeout re-deliver) or `NonRetryable` (delete it). Malformed JSON is deleted immediately. This is a small idea that saves an enormous amount of operational pain.

**Rate limiting** (`process.rs:149-201`) is genuinely clever and worth copying verbatim in concept:

> Two-tier queues. The primary worker, when rate-limited, *moves the message to a retry queue* and reports non-retryable — so the primary queue keeps flowing. The retry worker, when rate-limited, reports retryable and backs off. This prevents head-of-line blocking on one hot mailbox.

Counters live in Redis per `(link_id, GmailApiOperation, is_backfill)` — `services/email_service/src/util/redis/rate_limit.rs`.

### 1.5 Watch renewal + link reaping

Gmail `watch` registrations expire in 7 days. `services/email_refresh_handler/` is an **EventBridge-triggered Lambda that runs hourly** and shards work by hash bucket (`handler.rs:94-120`):

```sql
SELECT id FROM email_links
WHERE is_sync_active = TRUE AND provider = $1
  AND (abs(hashtext(id::text)) % 24) = $2   -- $2 = current hour
```

Each link is therefore refreshed once per 24h, with load spread evenly across the day instead of a thundering herd at midnight. A second query (`handler.rs:38-90`) uses `hours-since-epoch % interval_hours` for health probes, deliberately bucketed on epoch-hours rather than hour-of-day so intervals > 24h stay reachable.

Once daily at 05:00 UTC in production only (`handler.rs:30-33`) it reaps links: **unused** (created > N days ago, zero rows in `email_user_history` — i.e. the user never opened a thread) and **inactive** (last thread view > M days ago). Storage discipline as a scheduled job.

### 1.6 Threading

Two mechanisms, used for different directions.

**Inbound:** trust Gmail. `email_messages.provider_thread_id` and `email_threads.provider_id` hold Gmail's `threadId`; the unique index `uq_threads_link_id_provider_id` makes thread upsert idempotent.

**Outbound:** synthesise RFC 5322 headers. `services/email_service/src/util/gmail/send.rs:9-56`:

```rust
pub async fn generate_email_threading_headers(
    db: &PgPool, replying_to_db_id: Option<Uuid>, link_id: Uuid,
) -> (Option<String>, Option<Vec<String>>) {
    // fetch parent's Message-ID + References,
    // strip < >, split whitespace,
    // push the parent's Message-ID onto the end of References
}
```

Returns `(In-Reply-To, References)`. `email_messages.replying_to_id` is the internal self-FK; `email_messages.global_id` stores the RFC Message-ID; `headers_jsonb` retains the raw header bag.

Thread-level denormalisation on `email_threads` (lines 270-282) is what makes the inbox list fast without a join:
`inbox_visible`, `is_read`, `latest_inbound_message_ts`, `latest_outbound_message_ts`, `latest_non_spam_message_ts`. Later migrations add `project_id`, `is_signal`, `has_calendar_attachment` — each with a matching partial index (`20260319232323`, `20260708215614`, `20260706155906`). **Every saved view gets a denormalised boolean + a partial index rather than a filtered scan.**

### 1.7 Backfill (initial historical sync)

Three tables form a resumable job ledger (`…email_db_schema.sql:46-103`):

- `email_backfill_jobs` — status enum `Init|InProgress|Complete|Cancelled|Failed`, plus 9 counter columns (threads/messages × retrieved/processed/succeeded/skipped/failed).
- `email_backfill_threads` — per-thread status + `retry_count` + `error_message`.
- `email_backfill_messages` — per-message status + `retry_count` + `error_message`.

Drivers: `services/email_service/src/pubsub/backfill/` — `init.rs` → `list_threads.rs` (357 LOC, paginated) → `backfill_thread.rs` → `backfill_message.rs`, with `increment_counters.rs` (387 LOC) and `error_handlers.rs` (253 LOC). A partial unique index (`20260615224322_add_active_backfill_job_unique_index.sql`) prevents two concurrent jobs on one link.

**Retries are per-row, not per-job.** A backfill that fails 40 messages out of 20,000 completes and leaves 40 rows marked `Failed` with their error text. That is the correct design for anything touching a third-party API at volume.

### 1.8 Auto-association to CRM entities — the crown jewel

**Schema** (`crates/macro_db_client/migrations/20260512120000_crm_tables.up.sql` + follow-ons):

```sql
CREATE TABLE crm_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES team(id) ON DELETE CASCADE,
    email_sync BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    -- + first_interaction / last_interaction (20260526175147), hidden (20260521203029)
);

CREATE TABLE crm_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES team(id) ON DELETE CASCADE,  -- denormalised, 20260514130000
    domain TEXT NOT NULL,
    UNIQUE (company_id, domain)
);
CREATE UNIQUE INDEX crm_domains_team_id_lower_domain_unique
    ON crm_domains (team_id, LOWER(domain));

CREATE TABLE crm_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    UNIQUE (company_id, email)
    -- + name, first_interaction, last_interaction, hidden
);

CREATE TABLE crm_contact_sources (          -- which mailbox saw this contact
    contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
    link_id    UUID NOT NULL REFERENCES email_links(id)  ON DELETE CASCADE,
    UNIQUE (contact_id, link_id)
);
```

Note the migration comment on `crm_domains.team_id` — it exists purely so `UNIQUE(team_id, LOWER(domain))` can be enforced directly, because without it two concurrent transactions both SELECT-nothing and both INSERT, leaving duplicate companies. **The denormalisation is a race fix, not a perf fix.**

**The matching algorithm** — `crates/crm/src/outbound/companies_repo.rs:287+`, `populate_contact(team_id, link_id, domain, email, name, first_at, last_at, is_sent)`:

1. Lowercase domain and email (line 298-299).
2. Advisory-lock on `(team, lower(domain))` (line 310) — the unique index only catches the race *after* an orphan company row is inserted.
3. Bail if the team hasn't enabled CRM (line 312).
4. Find company by `(team_id, lower(domain))`.
5. **Line 334-340 — the rule that makes this system good:**
   ```rust
   None if !is_sent => {
       // Received-direction never creates a company row.
       return Ok(());
   }
   ```
   Inbound mail from an unknown domain does **not** create a company. Only *sending* to a domain promotes it. Newsletters, cold inbound, vendor notifications — none of them pollute the CRM. The user's own outbound is the relationship signal.
6. Upsert the contact (lines 387-411) with three merge rules: `name = COALESCE(existing, new)` (first non-null wins), `last_interaction = GREATEST(…)` always, `first_interaction = LEAST(…)` **only when `is_sent`** — so a backfill of old mail correctly widens the window backwards.
7. Record `crm_contact_sources (contact_id, link_id)`.

**The noise filter** — `crates/crm/src/domain/generic_email_domains.rs` (682 LOC, ~490 domains) in six categories:

`CONSUMER_EMAIL_DOMAINS` (gmail.com, yahoo.com…) · `DISPOSABLE_EMAIL_DOMAINS` · `ALIAS_FORWARDER_DOMAINS` (privacy relays) · `SAAS_VENDOR_DOMAINS` (github.com, stripe.com) · `CONSUMER_BRAND_DOMAINS` (amazon.com, marriott.com) · `BULK_SENDER_DOMAINS` · plus RFC-reserved TLD suffixes (`.test`, `.local`, `.internal`, `.invalid`).

The module doc states the design intent precisely:

> "We do NOT block law firms, banks, funds, or corporates that show up as real correspondents — only tools, consumer brands, and bulk senders."

This composes with a **second, orthogonal filter**: `email_utils::is_generic_email` checks the *local part* for role accounts (`noreply@`, `support@`, `info@`). Domain filter + local-part filter together. `support@gmail.com` is caught by the local-part rule; `jane@gmail.com` by the domain rule.

**Company display names** come from `crm_domain_directory` (`20260521120000`) — a global, non-team-scoped domain→name/description/icon cache, later enriched with Apollo fields (`20260529164720`). Note `ALTER TABLE crm_companies DROP COLUMN name;` in that same migration: they deleted the per-team name and resolve it from the directory instead.

**Discussion on records:** `crm_thread` / `crm_comment` (`20260527194808_create_crm_comments.sql`) with `CHECK (num_nonnulls(company_id, contact_id) = 1)` — a comment thread hangs off exactly one CRM entity. The migration comment says the frontend deliberately reuses the document comment renderer.

---

## 2. Sending

### 2.1 Two completely separate outbound paths

| | User mail | Macro's own mail |
|---|---|---|
| Transport | **Gmail API** `users.messages.send` | **AWS SES** |
| From | the user's own address | `@macro.com` |
| Suppression checked? | **No** | Yes (`BlockedEmail`) |
| Code | `services/email_service/src/util/gmail/send.rs`, `crates/gmail_client/src/messages.rs` | `crates/ses_client/`, `crates/invite_email/`, `crates/loops_client/` |

Sending user mail through the user's own Gmail means deliverability is Google's problem, not Macro's. **There is no SPF/DKIM/DMARC configuration, no dedicated IP, no domain warming, and no List-Unsubscribe handling anywhere in the codebase for user mail.** There is also no open/click tracking pixel — I searched for it; it does not exist.

### 2.2 Draft → sent

Drafts are rows in `email_messages` with `is_draft = true` (line 215). Attachments split three ways:
- `email_attachments` — provider-hosted (Gmail) attachments on received mail.
- Draft attachments in S3, fetched at send time — `send.rs:63-104`.
- **Forwarded** attachments, fetched from *Gmail* at send time rather than copied to S3 — `send.rs:107-140` (`20260212192413_email_attachments_fwd.sql`). Smart: forwarding a 40 MB deck costs zero storage.

`email_formatting` handles reply/forward quoting; `services/email_service/src/util/process_pre_insert/clean_message/` strips trailing `<br>` runs and cleans subject/snippet on the way in.

### 2.3 Scheduled send

```sql
-- …20251030154634_email_db_schema.sql:231-239
CREATE TABLE public.email_scheduled_messages (
    link_id    uuid        NOT NULL,
    message_id uuid        NOT NULL,
    send_time  timestamptz NOT NULL,
    sent       boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);
-- 20260119190319_email_scheduled_processing.sql adds a `processing` flag
```

**Trigger:** EventBridge → Lambda (`services/email_scheduled_handler/src/main.rs`). The poll (`handler.rs:53-72`):

```sql
SELECT esm.link_id, esm.message_id
FROM email_scheduled_messages esm
JOIN email_messages em ON em.id = esm.message_id
WHERE esm.send_time < now()
  AND esm.sent = FALSE
  AND em.is_draft = TRUE
```

**Cancellation is free and requires no code:** the join on `em.is_draft = TRUE` means promoting or deleting the draft silently de-schedules it. No tombstone, no cancel path, no race.

**Idempotency is four-layered** — `services/email_service/src/pubsub/scheduled/process.rs:73-114`:
1. `get_and_start_processing_scheduled_message` atomically claims the row (sets `processing`).
2. `if scheduled_message.sent` → skip.
3. `if scheduled_message.processing` → skip.
4. `if send_time > now()` → skip (guards a mis-timed enqueue).
   …and `clear_scheduled_message_processing` runs in the outer function (`process.rs:36-49`) on **both** success and failure paths, so a crash can't wedge the row.

Send → then a DB transaction converts the draft into a sent message (`process_sent_message`). Send-before-commit: a crash between them re-sends. They chose duplicate-send over lost-send. For calendar-ish mail that's right; for cold outreach it is arguably wrong.

### 2.4 Suppression and bounces

`services/email_suppression_handler/` is an **SNS-triggered Lambda** (`main.rs:35-38`, `LambdaEvent<SnsEvent>`) consuming SES bounce/complaint notifications.

`handler.rs:57-96` — bounces:
- `Permanent` → `bulk_upsert_block_email` (hard suppression).
- `Transient` → logged only, sub-typed (`MailboxFull`, `MessageTooLarge`, `ContentRejected`, `AttachmentRejected`, `General`). **Never suppressed.**
- `Undetermined` → logged only.

`handler.rs:98-150` — complaints:
- `complaintSubType` present (= SES already suppressed at account level) → suppress.
- Feedback type `Abuse | AuthFailure | Fraud | Virus | Other` → suppress.
- `NotSpam` → explicitly ignored (it's a *correction*, not a complaint).

The model file (`model.rs`, 159 lines) is a faithful, heavily-commented transcription of the SES notification contract. **Worth copying wholesale as a spec** if Rob ever puts SES behind cold outreach.

Storage: `"BlockedEmail" (email TEXT PRIMARY KEY)`, lowercased on both write and read — `crates/macro_db_client/src/blocked_email.rs`.

**Enforcement — the honest finding.** `get_blocked_emails` has exactly two production callers:
- `services/authentication_service/src/api/login/passwordless.rs:74`
- `services/authentication_service/src/api/mobile_welcome_email/mod.rs:103`

Both are Macro's own transactional mail. **The suppression list is never consulted on the user's Gmail send path.** Macro's bounce handling is table-stakes SES hygiene for a product's own notifications, not an outreach deliverability system. Do not mistake it for one.

Other deliverability primitives present: `crates/email_validator/`, `crates/generic_email_domains/`, `crates/rate_limit/`, `crates/user_quota/`, and `notification_email_unsubscribe` + `notification_email_unsubscribe_code` (a UUID code for one-click unsubscribe links) in the notification schema.

---

## 3. Chat / channels

Full DDL — `crates/macro_db_client/migrations/20251104101012_comms_db_schema.sql`:

```sql
CREATE TYPE comms_channel_type AS ENUM ('public','organization','private','direct_message');
-- 'team' added 20260324133321; 'organization' removed 20260601000000
CREATE TYPE comms_participant_role AS ENUM ('owner','admin','member');

CREATE TABLE public.comms_channels (
    id           uuid PRIMARY KEY,
    name         varchar(255),
    channel_type comms_channel_type NOT NULL,
    org_id       bigint,
    team_id      uuid REFERENCES team(id) ON DELETE CASCADE,   -- 20260324141059
    owner_id     text NOT NULL,
    created_at   timestamptz DEFAULT now() NOT NULL,
    updated_at   timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT valid_channel_name CHECK (
        (channel_type = 'direct_message' AND name IS NULL)
     OR (channel_type IN ('public','organization','team') AND name IS NOT NULL)
     OR (channel_type = 'private'))
    -- + join_code (20260714162749), auto_join_team (20260721174603)
);

CREATE TABLE public.comms_channel_participants (
    channel_id uuid NOT NULL REFERENCES comms_channels(id) ON DELETE CASCADE,
    user_id    text NOT NULL,
    role       comms_participant_role NOT NULL,
    joined_at  timestamptz DEFAULT now() NOT NULL,
    left_at    timestamptz,
    PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX idx_comms_cp_active_by_channel_user
  ON comms_channel_participants (channel_id, user_id) WHERE left_at IS NULL;

CREATE TABLE public.comms_messages (
    id         uuid PRIMARY KEY,
    channel_id uuid NOT NULL REFERENCES comms_channels(id) ON DELETE CASCADE,
    thread_id  uuid REFERENCES comms_messages(id) ON DELETE CASCADE,  -- self-FK
    sender_id  text NOT NULL,
    content    text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    edited_at  timestamp,
    deleted_at timestamp,
    triggered_by_user_id text   -- 20260629171949
);

CREATE TABLE public.comms_reactions (
    message_id uuid NOT NULL REFERENCES comms_messages(id) ON DELETE CASCADE,
    emoji      varchar(32) NOT NULL,
    user_id    text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (message_id, emoji, user_id)
);

CREATE TABLE public.comms_activity (          -- READ STATE
    id            uuid PRIMARY KEY,
    user_id       text NOT NULL,
    channel_id    uuid NOT NULL,
    viewed_at     timestamp,
    interacted_at timestamp,
    created_at    timestamp DEFAULT now() NOT NULL,
    updated_at    timestamp DEFAULT now() NOT NULL,
    CONSTRAINT comms_unique_user_channel UNIQUE (user_id, channel_id)
);

CREATE TABLE public.comms_attachments (       -- POLYMORPHIC ENTITY ATTACH
    id          uuid PRIMARY KEY,
    message_id  uuid NOT NULL REFERENCES comms_messages(id) ON DELETE CASCADE,
    channel_id  uuid NOT NULL REFERENCES comms_channels(id) ON DELETE CASCADE,
    entity_type varchar(32) NOT NULL,
    entity_id   varchar      NOT NULL,
    created_at  timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX idx_comms_attachments_entity_created
  ON comms_attachments (entity_type, entity_id, created_at DESC)
  INCLUDE (channel_id, message_id);

CREATE TABLE public.comms_entity_mentions (   -- GENERIC EDGE TABLE
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type        varchar(32) NOT NULL,   -- what was mentioned
    entity_id          varchar     NOT NULL,
    source_entity_type varchar(32) NOT NULL,   -- where it was mentioned
    source_entity_id   varchar     NOT NULL,
    user_id            varchar,
    created_at         timestamptz DEFAULT now() NOT NULL
);
```

**Observations:**

- **DM = a channel with `channel_type='direct_message'` and `name IS NULL`**, enforced by CHECK. Membership is the identity; there is no canonical member-set hash and no separate DM table. Group DMs fall out for free.
- **Threading is Slack-style**: `thread_id` is a nullable self-FK to the parent message. `NULL` = top-level. There is no separate `threads` table and no `reply_count` column (`20260212120001_idx_comms_messages_thread_active_created.sql` supplies the index instead).
- **Reactions** dedup via the composite PK `(message_id, emoji, user_id)`. One row, no counters — counts are aggregated (`CountedReaction` in `crates/channels/src/domain/models.rs`).
- **Read state is one row per (user, channel)** with `viewed_at` — not per-message receipts. Unread is `count(messages where created_at > viewed_at)`. Cheap, and the only thing 99% of products need.
- **Entity linking has two mechanisms.** `comms_attachments` is a *hard* attach — "this message carries this document." `comms_entity_mentions` is a *soft* graph edge — `(source_entity_type, source_entity_id) → (entity_type, entity_id)` with indexes in **both** directions (`idx_comms_entity_mentions_source` and `idx_comms_entity_mentions_entity_type_id`). The reverse index is what powers "show me every message that mentioned this deal." **This is the single table Rob needs to link comms to CRM records**, and it works for any entity type without schema changes.
- Soft delete everywhere (`deleted_at`), with partial indexes `WHERE deleted_at IS NULL` on every hot path.
- Realtime: `services/websocket-service` + `crates/broadcast` + `crates/soup_realtime`. `crates/channels/src/domain/side_effects.rs` computes a `ChannelRealtimeEffect::{Message,Attachments,Reaction}` carrying an explicit `recipients: Vec<MacroUserIdStr>` — **the domain layer computes the recipient set; the transport just delivers.** A `nonce` is echoed back so the sending client can reconcile its optimistic write.

---

## 4. Tasks

**There is no `tasks` table.** A task is a `Document` with `document_sub_type.sub_type = 'task'`. History confirms the choice was deliberate: `20251204165917_create_document_task_table.sql` created one, and `20251208183501_remove_document_task_table.sql` removed it four days later.

What exists instead:

```sql
-- 20260520130000_create_team_task.sql — human-readable numbering only
CREATE TABLE team_task_counter (
    team_id UUID PRIMARY KEY REFERENCES team(id) ON DELETE CASCADE,
    last_task_num INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT team_task_counter_positive CHECK (last_task_num >= 0)
);
CREATE TABLE team_task (
    team_id     UUID    NOT NULL REFERENCES team(id) ON DELETE CASCADE,
    document_id TEXT    NOT NULL REFERENCES "Document"(id) ON DELETE CASCADE,
    task_num    INTEGER NOT NULL,
    PRIMARY KEY (team_id, task_num),
    CONSTRAINT team_task_document_unique UNIQUE (document_id)
);
```

Status, assignee, and due date are **entity properties** (`crates/properties/`, `crates/system_properties/`, `models_properties`), not columns. Consequence: adding a custom task field is a row insert, not a migration.

**Message → task.** No dedicated code path. The generic mechanism is `comms_attachments` — create the task document, then attach it to the message (`entity_type='document'`, `entity_id=<task doc id>`). The message and the task are linked, bidirectionally indexed.

**Agent closes a task** via the properties toolset — `crates/properties/src/inbound/toolset/mod.rs:103-116`:
`GetEntityProperties` · **`SetEntityProperty`** · `BulkSetEntityPropertyOptions` · `ListTags` · `CreateTag` · `EditTag` · `DeleteTag`.

The CRM toolset docstring makes the division explicit (`crates/crm/src/inbound/toolset/mod.rs:4-6`):

> "Property writes (stage moves, revenue, owner, custom properties) go through the properties toolset's `SetEntityProperty` with `entity_type = company`."

**One write tool for all state changes, on all entity types.** An agent closing a task and an agent advancing a deal stage call the same tool. Permission checks live in `entity_access` behind it.

**Duplicate detection** (`20260528120000_task_duplicate_detection.sql`) is a nice bonus: pgvector `vector(1536)` embeddings per task with an IVFFlat index, plus a `task_duplicate_match` table carrying `vector_score`, `rerank_score`, `judge_model`, `judge_reason` and a `CHECK (task_id < duplicate_task_id)` to canonicalise the pair. Retrieve → rerank → LLM-judge, persisted with the judge's reasoning. `crates/task_dedup/`.

---

## 5. Notifications

**Schema** — `20260126170641_create_notification_tables.sql`:

```sql
CREATE TABLE notification (                   -- the EVENT, once
  id UUID PRIMARY KEY,                        -- UUIDv7
  notification_event_type VARCHAR(255) NOT NULL,
  event_item_id   TEXT NOT NULL,              -- polymorphic subject
  event_item_type TEXT NOT NULL,
  service_sender  TEXT NOT NULL,
  sender_id       TEXT,
  metadata        JSONB,
  apns_collapse_key TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_notification (              -- the FAN-OUT, one per recipient
  user_id         TEXT NOT NULL,
  notification_id UUID NOT NULL REFERENCES notification(id) ON DELETE CASCADE,
  sent    BOOLEAN NOT NULL DEFAULT FALSE,
  seen_at TIMESTAMP,
  done    BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP,
  is_important_v0 BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, notification_id)
);

-- opt-outs, four independent axes
CREATE TABLE notification_email_unsubscribe          (email TEXT PRIMARY KEY);
CREATE TABLE user_mute_notification                  (user_id TEXT PRIMARY KEY);
CREATE TABLE user_notification_item_unsubscribe      (user_id TEXT, item_id TEXT, item_type TEXT, PRIMARY KEY (user_id, item_id));
CREATE TABLE user_notification_type_preference       (user_id TEXT, notification_event_type VARCHAR(255), PRIMARY KEY (user_id, notification_event_type));  -- 20260325181013

-- debounce ledgers
CREATE TABLE notification_email_sent          (user_id TEXT PRIMARY KEY, sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE channel_notification_email_sent  (channel_id UUID, user_id TEXT, PRIMARY KEY (channel_id, user_id));

CREATE TABLE notification_user_device_registration (
  id UUID PRIMARY KEY, user_id TEXT NOT NULL,
  device_token TEXT NOT NULL,
  device_endpoint TEXT UNIQUE NOT NULL,       -- SNS platform endpoint
  device_type notification_device_type_option NOT NULL,  -- 'ios'|'android'
  last_used_at TIMESTAMP
);
```

Plus `notification_message_receipt` (`20260213120000`) mapping push-provider message ids back to `(user_id, notification_id)` with a `failed` flag — closed-loop delivery tracking.

**Event/junction split is the fan-out pattern**: one `notification` row, N `user_notification` rows. Per-recipient state (seen/done/deleted) lives on the junction. This is what Rob should copy if he ever needs multi-rep notifications.

**The delivery decision is an explicit state machine** — `crates/notification/src/domain/models/email_notification_digest.rs:347-392`, `StateMachineDriverA::ingest`:

1. `block_list.notification_is_allowed` → mute / unsubscribe / type-preference checks.
2. `check_user_existence`.
3. `push_notifications_enabled` → if yes, `Indeterminate` — **defer the email decision until we know whether the push actually landed** (the receipt table feeds this back).
4. If push is disabled, `check_last_online_time` against `online_duration_threshold`, defaulted to **60 minutes** (line 328: `Duration::from_mins(60)`).
5. Recently online → `DontSend`. Otherwise → `BatchWasQueued`.

The types are encoded as typestates (`PushNotificationsEnabled`, `BatchSend<T>`), so an illegal transition is a compile error. That's more machinery than Rob needs, but **the policy itself is exactly right and worth copying literally: don't email someone who was in the app 20 minutes ago.**

Channels: in-app (the `user_notification` row itself), realtime via websocket, mobile push via SNS→APNs/FCM, and batched email digest. `crates/loops_client/` handles marketing/lifecycle email separately.

---

## 6. Bots — the AI teammate pattern

### 6.1 Identity

`crates/bot_id/` (371 LOC) defines a first-class principal type. Storage form is `bot|<uuid>`, parsed with a `nom` grammar; users are `macro|<email>`. Both flow through the same `sender_id text` column.

```rust
// crates/bot_id/src/lib.rs:55-62
pub const MACRO_AI_BOT_ID: BotId =
    BotId::new_from_uuid(Uuid::from_u128(0x0000_0000_0000_0000_0000_0000_0000_a1a1));
pub const MACRO_AI_HANDLE: &str = "macro";
pub const MACRO_AI_NAME:   &str = "Macro";
```

A hardcoded UUID for the system bot: no DB row required, no bootstrap ordering problem.

```sql
-- 20260527160000_channel_bots.sql
CREATE TABLE public.bots (
    id uuid PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('owned','system')),
    owner_user_id text,
    team_id uuid REFERENCES team(id) ON DELETE CASCADE,
    name text NOT NULL, handle text NOT NULL,
    description text, avatar_url text, created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT bots_kind_owner_check CHECK (
        (kind='owned' AND ((owner_user_id IS NOT NULL)::int + (team_id IS NOT NULL)::int = 1))
     OR (kind='system' AND owner_user_id IS NULL AND team_id IS NULL))
);
CREATE TABLE public.bot_tokens (
    id uuid PRIMARY KEY,
    bot_id uuid NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    token_hash bytea NOT NULL,        -- hashed, never plaintext
    token_prefix text NOT NULL,       -- for lookup + UI display
    label text, last_used_at timestamptz,
    expires_at timestamptz, revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
```

`token_hash` + `token_prefix` is the GitHub-PAT pattern: index the prefix, compare the hash, show the prefix in the UI.

### 6.2 Participation

Bots join channels through the ordinary `comms_channel_participants` table using the `bot|<uuid>` principal. **No separate bot-membership table.** Same for posting: `comms_messages.sender_id` holds the bot principal.

### 6.3 Trigger detection

`crates/channels/src/domain/side_effects.rs:47-83`:

```rust
pub const BOT_MENTION_ENTITY_TYPE: &str = "bot";

fn bot_mention_ids(mentions: &[SimpleMention]) -> Vec<BotId> {
    mentions.iter().filter_map(|m| match m.entity_type.as_str() {
        BOT_MENTION_ENTITY_TYPE => mention_bot_id(&m.entity_id),
        // Macro AI is surfaced through the *user*-mention UI
        "user" => mention_bot_id(&m.entity_id).filter(|id| *id == bot_id::MACRO_AI_BOT_ID),
        _ => None,
    }).filter(|id| seen.insert(*id)).collect()
}
```

Mentions only. Bots never see traffic they weren't addressed in. Bare UUIDs are rejected — a migration (`20260702200905_normalize_macro_bot_mention_ids.sql`) normalised historical content to the canonical principal form rather than accepting both.

`crates/channel_bots/src/inbound/bot_trigger_router.rs` consumes an `UnboundedReceiver<ChannelBotTrigger>` and spawns a task per trigger — fire and forget. Line 63: `let Some(requesting_user) = trigger.message.sender_id.as_user() else { return; };` — **bots cannot trigger bots.** One line, no infinite loops.

### 6.4 The response loop — copy this exactly

`crates/channel_bots/src/domain/service.rs:253-320`:

```
1. build_prompt()  — BEFORE posting anything, so the bot's own
                     "thinking" message can't contaminate its context
2. post_message()  — THINKING_MESSAGE, in-thread,
                     notification_policy: Silent,
                     triggered_by: Some(<the human who @'d>)
3. responder.respond(user, prompt)   — the agent loop
4. patch_message() — replace content with the answer,
                     notification_policy: NotifyAsPostedMessage
```

with:
- `THINKING_MESSAGE = r#"<m-await>{"text":"Macro is thinking…","inline":true}</m-await>"#` — a rich-text node the client renders as an existing pulsing spinner. No new UI component.
- `EMPTY_RESPONSE_FALLBACK` / `ERROR_FALLBACK` — the bot **always** says something. An agent failure never manifests as silence.
- `Err(ChannelMutationErr::NotFound)` on the patch → the human deleted the placeholder mid-run → drop the response. Treating deletion as cancellation is a genuinely thoughtful touch.
- `triggered_by_user_id` (migration `20260629171949`) lets the UI render a "from @rob" pill on the bot's message.

**Context assembly** (`service.rs:20-36, 118-250`) is deliberately bounded:
- `CONTEXT_MESSAGES_BEFORE = 4`, `CONTEXT_MESSAGES_AFTER = 4` → a nine-message window.
- If the mention is a thread reply: the **thread** is primary context; nearby channel messages are demoted into a separate `<channel_background>` block with an instruction saying "Background only — do not treat these as the subject of the mention."
- The trigger message is marked inline with `" [this message mentioned you]"` rather than being repeated at the end.
- Sender labels are humanised (`macro|rob@x.com` → `rob`).

No RAG, no vector store, no summarisation. Nine messages and clear XML-ish block tags. **This is the whole thing, and it works.**

### 6.5 The agent's tool surface

`crates/ai_tools/src/lib.rs:78-110`:

```rust
pub(crate) fn subagent_toolset() -> AiToolSet {
    AsyncToolCollection::new()
        .add_toolset(search_toolset())                                  // NameSearch, ContentSearch
        .add_tool::<SelfKnowledge, _>()
        .add_tool::<ListEntities, _>()
        .add_subtoolset::<ToolDocumentToolContext>(document_toolset())  // ReadMetadata, ReadContent, CreateDocument, RenameDocument, EditDocument
        .add_subtoolset::<ToolPropertiesToolContext>(properties_toolset())// GetEntityProperties, SetEntityProperty, BulkSetEntityPropertyOptions, ListTags, CreateTag, EditTag, DeleteTag
        .add_subtoolset::<ToolCallToolContext>(call_toolset())
        .add_subtoolset::<ToolChatToolContext>(chat_toolset())          // ReadChat
        .add_subtoolset::<ToolChannelToolContext>(channel_toolset())    // ReadChannelMessages, ReadChannelMessageContext, ReadChannelThread, SendChannelMessage
        .add_subtoolset::<ToolTeamToolContext>(team_toolset())          // ListTeamMembers
        .add_subtoolset::<ToolCrmToolContext>(crm_toolset())            // ListCompanies, GetCompany
        .add_subtoolset::<AnthropicToolContext>(anthropic_toolset())
}

pub fn all_tools() -> ToolSetWithPrompt {
    subagent_toolset()
        .add_subtoolset::<ToolNotificationToolContext>(notification_toolset()) // ListNotifications, MarkNotificationsSeen, MarkNotificationsDone
        .add_subtoolset::<ToolEmailToolContext>(email_toolset())               // UpdateThreadLabels, GetThread, ListLabels, ListInboxes, + SendEmail
        .add_subtoolset::<ToolImportToolContext>(import_toolset())
        .add_tool::<Subagent, _>()
        .add_tool::<SearchTools, _>()
        .add_tool::<LoadTools, _>()
        .add_tool::<DisplayResults, _>()
}
```

Three safety boundaries, all structural:

1. **`subagent_toolset()` excludes email and `Subagent`** — the comment says "subagents cannot create subagents."
2. **`mcp_tools()` excludes `SendEmail`** (`lib.rs:123-134`, `crates/email/src/inbound/toolset/mod.rs:158-170`) — external MCP clients read mail, never send it.
3. **`SendEmail` is `add_user_tool`, not `add_tool`.** From `crates/ai_toolset/src/toolset/tool_object/user_tool.rs:1-5, 46-54`:

   > "A user tool is a tool that's executed by a user instead of an agent loop… Calling a user tool doesn't do anything" — it returns `UserToolResponse::PendingUserExecution`. The user then POSTs to `/tools/call/{tool_id}` to actually run it. The response enum is `PendingUserExecution | Rejected | UserAction(T)`.

   **The model drafts. A human clicks. This is a type-level guarantee, not a UI convention.** Given Rob does cold outreach, this is the most important single line in the entire codebase for him.

`SearchTools` / `LoadTools` implement progressive tool disclosure — the agent searches a catalogue and loads schemas on demand instead of receiving 30 tool definitions up front. `crates/agent/src/agent_loop.rs:161-203` adds tools to a live loop.

---

## 7. Unfurl and attachments

**Unfurl** — `crates/unfurl/` + `services/unfurl_service/` (~2,800 LOC).

- **Stateless. There is no cache table.** I checked every migration; nothing references unfurl. Fetch on demand.
- SSRF defence is the bulk of the code: `crates/unfurl/src/outbound/http_safety.rs` (284 LOC) + `services/unfurl_service/src/http_safety/mod.rs` (218 LOC). Typed errors: `InvalidScheme` (http/https only), `MissingHost`, `DnsLookupFailed`, **`PrivateIp`** (resolve first, then check the resolved IP — the correct order), `UpstreamTimeout`, `UpstreamConnect`, `UpstreamRedirect` (redirect-chain cap). Tests cover IPv6 loopback, unspecified, unique-local, link-local, and IPv4-mapped-v6 loopback — the classic bypass set.
- `crates/unfurl/src/domain/url_parsers.rs` special-cases known hosts (Notion, etc.) to derive a title from the URL slug without fetching.
- `services/unfurl_service/src/api/proxy/mod.rs` proxies preview images so the client never hits third-party hosts directly.

**Attachments** — three separate systems, deliberately:

| Domain | Table | Storage |
|---|---|---|
| Email received | `email_attachments (message_id, provider_attachment_id, filename, mime_type, size_bytes, content_id)` | stays in Gmail; `email_sfs_mappings` maps to Macro's static file service |
| Email draft/forward | draft rows → S3; forwarded rows → fetched from Gmail at send time | `crates/s3_client/`, `20260212192413_email_attachments_fwd.sql` |
| Chat | `comms_attachments (message_id, channel_id, entity_type, entity_id)` | **not a blob — a reference to a Macro entity** |

`crates/attachment/` is the shared abstraction; `crates/document_storage_service_client/` + `services/static_file_service/` + `services/document_upload_finalizer_handler/` handle upload finalisation (presigned S3 → finaliser Lambda → row). `services/dataloss_prevention_handler/` scans uploads.

The chat design is the interesting one: **chat attachments are entity references, not files.** Sharing a document in a channel doesn't copy bytes; it creates an edge. Permissions stay with the document.

---

# PART II — THE MLE CRM TODAY

Repo: `/Users/robertacheson/Projects/MyLocalEverything/MLE ROB Dashboard` (canonical per `~/.claude/projects/…/memory/mle-dashboard-canonical-repo.md`). Next.js 15 App Router · TypeScript · Supabase Postgres · Vercel · Vitest.

### What already exists

**`supabase/migrations/0005_crm_core.sql`** — `deals`, `activities`, `tasks`:

```sql
create table activities (
  id text primary key,
  person_id text references people(id) on delete cascade,
  org_id    text references orgs(id)   on delete cascade,
  deal_id   text references deals(id)  on delete cascade,
  created_by text,
  type   text not null check (type in ('call','email','meeting','note','status_change')),
  source text not null default 'manual' check (source in ('manual','n8n','api','aidre','dialer')),
  source_context jsonb not null default '{}'::jsonb,
  summary text, action_items jsonb, buying_signals jsonb,
  recording_url text, transcript_url text,
  book_protected boolean not null default false,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  check (num_nonnulls(person_id, org_id) <= 1),
  check (num_nonnulls(person_id, org_id, deal_id) >= 1)
);

create table tasks (
  id text primary key,
  activity_id text references activities(id) on delete set null,  -- ← task born from a comm
  deal_id     text references deals(id)      on delete set null,
  person_id   text references people(id)     on delete cascade,
  assigned_to text,
  title text not null, detail text,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  due_date date, book_protected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

This is already good. The `activities`/`tasks` shape matches Macro's intent, and `tasks.activity_id` is *better* than Macro's generic attachment — it's an explicit, indexed "this task came from this conversation."

**`lib/n8nEmail.ts` + `app/api/webhooks/n8n-email/route.ts`** — LIVE in prod since 2026-07-22 (PRD Task 3.2). n8n polls `rob@aivoicetech.io` every minute, POSTs to the webhook with `x-n8n-secret`, and:
- `identityGate()` hard-rejects any message with a `boostuppayments.com` party — **judging headers, never the mailbox**, because of the 2026-07-08 forwarding incident.
- `matchContact()` matches the counterpart address (excluding Rob's own) against `people.email`, exact match only.
- `activityIdFor(messageId) = "n8n-email-<gmailMessageId>"` → deterministic id → idempotent upsert.
- Writes one `activities` row with `source='n8n'`, `source_context.channel='email'`.

**`app/api/dev-chat/route.ts`** — Rob↔Max channel backed by a Supabase `dev_chat (id, author, body, created_at)` table, polled by `?after=<id>`. Gated on `NEXT_PUBLIC_DEV_CHAT=1`. Per memory `dev-chat-is-robs-channel.md`, this is Rob's input channel and not a status feed.

**Also present:** `lib/tasks/{todayRules,needsActionRules,needsActionEval}.ts`, `app/api/tasks/today`, `app/api/cron/{overdue,esign-nudges,dedup,integrity,recycle,backup}`, `app/api/webhooks/{aidre-call,vapi,twilio-recording,n8n-error}`, `lib/twilio.ts`, `lib/esign/`.

### The five real gaps

1. **No message bodies.** `activities.summary` is `"<subject> — <snippet>"`. You cannot read the email in the CRM, cannot reply with quoting, cannot let an AI summarise it.
2. **No threads.** `threadId` is buried in `source_context` JSONB, unindexed. Ten replies = ten unrelated timeline rows.
3. **No participants.** No cc/bcc, no multi-party. Match is single-address exact.
4. **No domain→org matching.** `matchContact` requires an exact `people.email` hit. A new person at a known roofing company doesn't associate.
5. **No send path.** Everything is read-only capture. PRD Task 4.6b ("send-as-rep") is Phase-4 gated; PRD Task 1.5 (email-sync build cost, DIY vs Nylas/Unipile/EmailEngine) is still **open** — this document largely answers it.

---

# PART III — THE PHASED BLUEPRINT

## Guiding decisions

**D1 — Gmail only.** Macro, with real funding and years of runway, supports one provider. Rob's reps are on Google. Build for Gmail; revisit only when a paying customer is on Outlook.

**D2 — n8n owns the transport; Postgres owns the model.** Rob already has n8n cloud, and Task 3.2 proved the seam works in production. n8n does Gmail OAuth, polling/watch, and payload shaping. The CRM does storage, threading, matching, and UI. **Do not port Macro's SQS/Lambda/Redis/Pub-Sub topology.** That machinery exists because Macro serves thousands of mailboxes with API quota pressure. Rob has ≤5.

**D3 — `mailbox_links` from day one.** Even though only one mailbox connects today, introduce the link table in Phase A. It converts Rob's two-identity rule from a code check into a schema invariant, and it is nearly free now and expensive later.

**D4 — Received never creates an org.** Steal `companies_repo.rs:334-340` exactly.

**D5 — AI drafts, humans send.** Steal `add_user_tool::<SendEmail>`. Given cold outreach and the `ai-voice-legality` posture (surface compliance, never auto-limit), an agent must never autonomously put mail on the wire.

---

## PHASE A — Log and thread existing comms onto records

**Goal:** open a person or org and read the actual conversation — full bodies, correctly threaded, with everyone who was on it.
**Effort:** 4–6 dev-days. **Risk:** LOW.

### A.1 DDL

```sql
-- supabase/migrations/0015_comms_lake.sql
begin;

-- ── The identity boundary (Macro's email_links). ────────────────────────
-- Every comms row hangs off exactly one connected mailbox. Two of Rob's
-- addresses = two rows with no join path between them. Isolation becomes a
-- schema property, not a code convention.
-- Borrows: crates/macro_db_client/migrations/20251030154634_email_db_schema.sql:157
create table if not exists mailbox_links (
  id            text primary key,
  owner_ref     text not null,                     -- free text until Phase-4 profiles
  email_address text not null,
  provider      text not null default 'gmail' check (provider in ('gmail')),
  sync_active   boolean not null default true,
  -- Macro reauth-health pattern (20260615180337): surface dead grants early.
  last_sync_at    timestamptz,
  last_error      text,
  needs_reauth    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_ref, lower(email_address), provider)
);

-- ── Threads ────────────────────────────────────────────────────────────
-- Denormalised timestamps so the list view never joins (Macro email_threads).
create table if not exists comm_threads (
  id              text primary key,
  link_id         text not null references mailbox_links(id) on delete cascade,
  provider_thread_id text,                          -- Gmail threadId
  subject         text,
  person_id       text references people(id) on delete set null,
  org_id          text references orgs(id)   on delete set null,
  deal_id         text references deals(id)  on delete set null,
  message_count   integer not null default 0,
  latest_inbound_at  timestamptz,
  latest_outbound_at timestamptz,
  is_read         boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Per-link uniqueness, never global (Macro uq_threads_link_id_provider_id).
create unique index if not exists comm_threads_link_provider_uq
  on comm_threads (link_id, provider_thread_id) where provider_thread_id is not null;
create index if not exists comm_threads_person_idx on comm_threads (person_id, latest_inbound_at desc);
create index if not exists comm_threads_org_idx    on comm_threads (org_id,    latest_inbound_at desc);
create index if not exists comm_threads_deal_idx   on comm_threads (deal_id,   latest_inbound_at desc);

-- ── Messages ───────────────────────────────────────────────────────────
create table if not exists comm_messages (
  id            text primary key,
  link_id       text not null references mailbox_links(id) on delete cascade,
  thread_id     text not null references comm_threads(id)  on delete cascade,
  provider_message_id text,                         -- Gmail message id
  rfc_message_id      text,                         -- RFC5322 Message-ID (Macro global_id)
  in_reply_to         text,
  replying_to_id      text references comm_messages(id) on delete set null,
  channel     text not null default 'email' check (channel in ('email','sms','call','note')),
  direction   text not null check (direction in ('inbound','outbound')),
  from_address text not null,
  from_name    text,
  subject     text,
  snippet     text,
  body_text   text,
  body_html   text,                                 -- SANITIZED ONLY
  headers     jsonb not null default '{}'::jsonb,
  has_attachments boolean not null default false,
  sent_at     timestamptz not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists comm_messages_link_provider_uq
  on comm_messages (link_id, provider_message_id) where provider_message_id is not null;
create index if not exists comm_messages_thread_idx on comm_messages (thread_id, sent_at);

-- ── Participants (Macro email_message_recipients) ──────────────────────
create table if not exists comm_participants (
  message_id text not null references comm_messages(id) on delete cascade,
  address    text not null,
  name       text,
  role       text not null check (role in ('from','to','cc','bcc')),
  person_id  text references people(id) on delete set null,
  primary key (message_id, address, role)
);
create index if not exists comm_participants_address_idx on comm_participants (lower(address));
create index if not exists comm_participants_person_idx  on comm_participants (person_id);

-- ── Domain directory (Macro crm_domains + crm_domain_directory) ────────
-- This is what turns "someone new at a known roofer" into an org match.
create table if not exists org_domains (
  id         text primary key,
  org_id     text not null references orgs(id) on delete cascade,
  domain     text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists org_domains_lower_domain_uq on org_domains (lower(domain));
create index if not exists org_domains_org_idx on org_domains (org_id);

-- ── Generic-domain blocklist, in DATA not code, so Rob can edit it ─────
create table if not exists generic_email_domains (
  domain   text primary key,
  category text not null check (category in
    ('consumer','disposable','alias_forwarder','saas_vendor','consumer_brand','bulk_sender'))
);

-- ── The soft edge: link any comm to any CRM object. ────────────────────
-- Macro comms_entity_mentions. Indexed BOTH directions — the reverse index is
-- what answers "show me every message that touched this deal".
create table if not exists comm_entity_links (
  id           text primary key,
  source_type  text not null check (source_type in ('message','thread')),
  source_id    text not null,
  entity_type  text not null check (entity_type in ('person','org','deal','task')),
  entity_id    text not null,
  linked_by    text,
  created_at   timestamptz not null default now(),
  unique (source_type, source_id, entity_type, entity_id)
);
create index if not exists comm_entity_links_entity_idx on comm_entity_links (entity_type, entity_id, created_at desc);
create index if not exists comm_entity_links_source_idx on comm_entity_links (source_type, source_id);

-- Bridge the new lake to the existing timeline without touching 0005.
alter table activities add column if not exists thread_id  text references comm_threads(id)  on delete set null;
alter table activities add column if not exists message_id text references comm_messages(id) on delete set null;
create index if not exists activities_thread_idx on activities (thread_id);

alter table mailbox_links         enable row level security;
alter table comm_threads          enable row level security;
alter table comm_messages         enable row level security;
alter table comm_participants     enable row level security;
alter table org_domains           enable row level security;
alter table generic_email_domains enable row level security;
alter table comm_entity_links     enable row level security;

commit;
```

### A.2 Ingest — extend, don't replace

`lib/n8nEmail.ts` keeps its identity gate verbatim (it is the best code in the repo for this). Add `lib/comms/ingest.ts`:

```
1. identityGate(payload)                       — UNCHANGED, still headers-not-mailbox
2. resolve link_id from the capture identity   — NEW, and the whole point
3. upsert comm_threads on (link_id, provider_thread_id)
4. upsert comm_messages on (link_id, provider_message_id)
5. insert comm_participants for from/to/cc
6. resolveAnchor()                             — NEW, see A.3
7. upsert the existing activities row, now carrying thread_id + message_id
```

n8n change: the Gmail node must return `payload`/`textPlain`/`textHtml` and the `To`/`Cc`/`Message-ID`/`In-Reply-To`/`References` headers. That is a node-config change, not new code.

**Sanitise HTML server-side before storing** (Macro does this at `services/email_service/src/util/sanitizer.rs`). Store the sanitised form in `body_html` and never the raw. Use `isomorphic-dompurify`.

### A.3 Matching ladder — port `populate_contact`

Borrowed from `crates/crm/src/outbound/companies_repo.rs:287-420` + `crates/crm/src/domain/generic_email_domains.rs`:

```
For each counterpart address (all parties minus the capture identity):

  1. Exact person match on lower(people.email)               → anchor person  [exists today]
  2. Exact participant match on comm_participants.person_id  → anchor person
  3. Domain match on lower(org_domains.domain)               → anchor org, and
                                                               propose a new person
  4. Domain is in generic_email_domains                      → do not associate
  5. Local part is a role account (noreply|no-reply|support|
     info|billing|notifications|donotreply|admin|hello)      → do not associate
  6. Unknown domain AND direction = 'outbound'               → propose a NEW org
                                                               (needs-action queue)
  7. Unknown domain AND direction = 'inbound'                → LOG ONLY, create nothing
```

Rule 7 is Macro's `None if !is_sent => return Ok(())`. It is the difference between a CRM and an inbox dump. Rules 4+5 compose orthogonally, exactly as Macro notes.

Rule 6 should feed Rob's existing **needs-action** queue (`lib/tasks/needsActionRules.ts`) rather than auto-creating, at least until the matcher is trusted. Seed `generic_email_domains` from Macro's list — it is a 490-row `INSERT`, and AGPLv3 makes reuse legal but it is a *data* list, so retype/regenerate rather than copy-paste the file, and keep no upstream attribution per Rob's rules of engagement.

### A.4 UI

- Person/org/deal detail: a **Conversation** tab reading `comm_threads` by anchor, rendering `comm_messages` collapsed-by-thread with participant chips.
- Reuse `components/ActivityTimeline.tsx`; when `activities.thread_id` is set, render an expandable thread instead of a one-line summary.
- Per memory `rob-ux-bar-apple-not-msdos.md`: inline click-to-edit + autosave on the anchor field. No edit modes, no Save button.

### A.5 Do this in n8n, not in code

| Task | Where |
|---|---|
| Gmail OAuth, token refresh, watch renewal | **n8n** — worth days of Macro's `email_refresh_handler` + `fusionauth` + Redis |
| Polling / trigger | **n8n** (already live, workflow `JnIJiCbOqSaK8uN2`) |
| Header/body extraction and field mapping | **n8n** |
| Retry/backoff on transport | **n8n** |
| Threading, matching, dedup, storage, UI | **code** — this is the product |

### A.6 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Identity crossover (the 7/8 incident) | **CRITICAL** | `identityGate` stays first; add a DB-level `CHECK` that no `comm_participants.address` ends in `@boostuppayments.com`, so it fails at the storage layer too. Belt and braces. |
| Stored HTML → XSS | HIGH | Sanitise server-side on write; render in a sandboxed iframe or with a strict allowlist. Macro stores `body_html_sanitized` — the column name is the reminder. |
| Bad domain match pollutes CRM | MEDIUM | Rules 4/5/7 + needs-action queue instead of auto-create |
| n8n Gmail quota at 1/min poll | LOW | Per-mailbox; move to Gmail push only if quota bites |
| Storing full bodies of client mail | MEDIUM | It's Rob's own mail today. Before Phase 4 multi-rep, decide retention + a `book_protected` equivalent. |

---

## PHASE B — Send from the CRM

**Goal:** reply to a thread, schedule a send, and never mail someone who bounced or opted out.
**Effort:** 5–8 dev-days. **Risk:** MEDIUM.

### B.1 DDL

```sql
-- supabase/migrations/0016_comms_outbound.sql
begin;

-- Drafts and scheduled sends. Macro keeps these as is_draft rows on the
-- message table plus a scheduling side-table; splitting them keeps the
-- inbound lake append-only and the send queue easy to reason about.
create table if not exists comm_drafts (
  id          text primary key,
  link_id     text not null references mailbox_links(id) on delete cascade,
  thread_id   text references comm_threads(id) on delete set null,
  replying_to_id text references comm_messages(id) on delete set null,
  deal_id     text references deals(id)   on delete set null,
  person_id   text references people(id)  on delete set null,
  to_addresses   text[] not null default '{}',
  cc_addresses   text[] not null default '{}',
  bcc_addresses  text[] not null default '{}',
  subject     text,
  body_text   text,
  body_html   text,
  -- Macro's In-Reply-To / References synthesis, computed at draft time
  -- (services/email_service/src/util/gmail/send.rs:9-56)
  in_reply_to text,
  references_header text[],
  created_by  text,
  -- AI-authored drafts start here and CANNOT leave without a human.
  -- Macro: add_user_tool::<SendEmail> (crates/email/src/inbound/toolset/mod.rs:155)
  authored_by text not null default 'human' check (authored_by in ('human','agent')),
  approved_by text,
  approved_at timestamptz,
  send_at     timestamptz,
  status      text not null default 'draft' check (status in
                ('draft','scheduled','sending','sent','failed','cancelled')),
  -- Macro's four-layer idempotency (pubsub/scheduled/process.rs:73-114)
  processing_started_at timestamptz,
  sent_message_id text references comm_messages(id) on delete set null,
  attempt_count integer not null default 0,
  last_error  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An agent draft is unsendable until a human signs it.
  constraint agent_draft_needs_approval check (
    authored_by = 'human' or status = 'draft' or approved_by is not null)
);
create index if not exists comm_drafts_due_idx
  on comm_drafts (send_at) where status = 'scheduled';

-- Suppression. Macro's "BlockedEmail" is one column; Rob does cold outreach,
-- so carry the reason and the source — you need them for a deliverability
-- post-mortem and for an audit trail.
-- Borrows: services/email_suppression_handler/src/handler.rs
create table if not exists email_suppressions (
  address     text primary key,                     -- store lowercased
  reason      text not null check (reason in
                ('hard_bounce','complaint','unsubscribe','manual','role_account','invalid')),
  detail      text,
  source      text,                                 -- 'ses'|'gmail'|'n8n'|'manual'|'reply-parse'
  suppressed_at timestamptz not null default now()
);

-- Soft/transient bounces are recorded but NEVER suppress on first sight —
-- Macro logs Transient and moves on (handler.rs:75-90). Escalate on repetition.
create table if not exists email_delivery_events (
  id        text primary key,
  address   text not null,
  draft_id  text references comm_drafts(id) on delete set null,
  event     text not null check (event in
              ('sent','delivered','soft_bounce','hard_bounce','complaint','unsubscribe','reply')),
  subtype   text,       -- SES BounceSubType / ComplaintFeedbackType
  raw       jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists email_delivery_events_address_idx on email_delivery_events (lower(address), occurred_at desc);

alter table comm_drafts           enable row level security;
alter table email_suppressions    enable row level security;
alter table email_delivery_events enable row level security;

commit;
```

### B.2 Send path

```
POST /api/comms/send        (immediate)   → status='sending'
POST /api/comms/schedule    (send_at set) → status='scheduled'

GET  /api/cron/comms-send   (Vercel cron, every minute)
  ── the Macro email_scheduled_handler, in ~40 lines ──
  SELECT * FROM comm_drafts
   WHERE status = 'scheduled'
     AND send_at < now()
     AND processing_started_at IS NULL
   FOR UPDATE SKIP LOCKED
   LIMIT 25;
  → claim (set processing_started_at, status='sending')
  → per draft:
      1. suppression check  (see B.3)
      2. POST to the n8n send workflow (Gmail send-as, the rep's own address)
      3. on success: insert comm_messages(direction='outbound'),
                     status='sent', sent_message_id set
      4. on failure: attempt_count++, last_error, back to 'scheduled'
                     unless attempt_count >= 3 → 'failed'
```

**Cancellation:** Macro gets it free via `JOIN email_messages ON is_draft = TRUE`. Reproduce by making the claim query require `status='scheduled'` — setting `status='cancelled'` de-schedules atomically with no race.

**Stuck-row reaper:** `UPDATE comm_drafts SET status='scheduled', processing_started_at=NULL WHERE status='sending' AND processing_started_at < now() - interval '15 minutes'`. Macro achieves this with a `finally`-style `clear_scheduled_message_processing` on both paths (`process.rs:36-49`); serverless needs the reaper because the function can vanish mid-flight.

**Vercel cron granularity is 1/minute on Pro.** For a 5-seat CRM that is fine. Do not build a queue.

### B.3 Suppression enforcement — where Macro leaves a gap

Macro never checks suppression on the user send path. **Rob must.** Because he does cold outreach, this is the highest-leverage divergence in the whole blueprint. One function, called in exactly one place, before every send:

```ts
// lib/comms/suppression.ts — CR-3: the guarantee lives in code, not prose.
export type SendVerdict = { ok: true } | { ok: false; blocked: string[]; reasons: string[] };

export async function checkSendAllowed(addresses: string[]): Promise<SendVerdict>
// blocks if ANY recipient is:
//   1. in email_suppressions
//   2. a role account          (email_utils::is_generic_email — local-part rule)
//   3. syntactically invalid   (crates/email_validator)
//   4. ≥3 soft bounces in email_delivery_events in the last 30 days
```

Unit-test it. Make the send route unable to compile a path around it. This is the CR-3 pattern Rob's rules demand: guaranteed steps in code, never prose.

### B.4 Deliverability

Send **as the rep, through their own Gmail**, exactly as Macro does. This inherits Google's reputation and sidesteps SPF/DKIM/DMARC/warmup entirely. Note that `aivoicetech.io` SPF is already correct per `~/.claude/rules/email-identity.md` (fixed 2026-07-08).

Then add the three things Macro does not have, because Rob sends cold:

1. **`List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`** headers on every cold send, pointing at a CRM endpoint that writes `email_suppressions(reason='unsubscribe')`. Gmail/Yahoo bulk-sender rules effectively require this.
2. **A per-link daily send cap** (start at 50/day/mailbox). Gmail Workspace's own limit is 2,000/day but reputation dies far below that. Macro's `crates/rate_limit/` + `crates/user_quota/` are the shape.
3. **Reply-based bounce parsing.** Gmail sends bounces as messages from `mailer-daemon@googlemail.com`. The Phase-A ingest already sees them — parse the DSN status code and write `email_delivery_events` / `email_suppressions`. **This gives Rob bounce handling without SES at all.** Macro's `services/email_suppression_handler/src/model.rs` is a ready-made taxonomy for the status codes; port the enum, drop the SNS plumbing.

**Do not build open/click tracking pixels.** Macro doesn't. Pixels hurt deliverability, Apple MPP has made open rates meaningless since 2021, and they add a hosting dependency. Track *replies* — you have them in the lake already.

### B.5 What to do in n8n

| Task | Where |
|---|---|
| Gmail `send-as` API call | **n8n** — one node |
| OAuth for the send scope | **n8n** |
| Draft storage, scheduling, claim/retry | **code** |
| Suppression, quota, unsubscribe | **code** — never delegate a compliance gate to a workflow tool |
| Bounce-message parsing | **code** (fed by the Phase-A n8n capture) |

### B.6 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Sending from the wrong identity | **CRITICAL** | `send_as` derives from `mailbox_links.email_address` via `link_id` only — never from a request field. Reject any request carrying a `from`. Same anti-smuggling posture as the existing `parseDealStagePatch` gate in `lib/crm.ts`. |
| Double send after a crash | HIGH | Claim-then-send with `processing_started_at` + the 15-min reaper; store `sent_message_id` and make the insert conditional on it being NULL |
| Gmail reputation damage | HIGH | Daily cap, suppression gate, List-Unsubscribe, reply-rate monitoring |
| Cron drift (Vercel is best-effort) | LOW | `send_at` is "not before", never "exactly at". Say so in the UI. |
| Legal — outbound to consumers | MEDIUM | Per `~/.claude/rules/ai-voice-legality.md` and memory `legal-intel-informs-never-restricts.md`: **surface** CAN-SPAM/state findings in the UI; never auto-restrict. Go/no-go is Rob's call. |

---

## PHASE C — The AI teammate

**Goal:** `@max` inside a deal record. It reads the thread, drafts the reply, opens tasks, updates the stage — and never sends mail on its own.
**Effort:** 6–10 dev-days. **Risk:** MEDIUM (LOW if `SendEmail` stays a user tool).

### C.1 DDL

```sql
-- supabase/migrations/0017_crm_channels_bots.sql
begin;

-- Channels. Macro's comms_channels, minus org/team plumbing Rob doesn't need,
-- plus a nullable entity anchor so a channel can BE a deal room.
create table if not exists channels (
  id           text primary key,
  channel_type text not null check (channel_type in ('record','direct','group')),
  name         text,
  -- A 'record' channel is anchored to exactly one CRM object.
  entity_type  text check (entity_type in ('person','org','deal')),
  entity_id    text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Macro's valid_channel_name CHECK, adapted.
  check ((channel_type = 'record' and entity_type is not null and entity_id is not null and name is null)
      or (channel_type = 'direct' and entity_type is null and name is null)
      or (channel_type = 'group'  and entity_type is null and name is not null))
);
create unique index if not exists channels_entity_uq
  on channels (entity_type, entity_id) where channel_type = 'record';

create table if not exists channel_participants (
  channel_id text not null references channels(id) on delete cascade,
  -- Principal form, Macro-style: 'user|<ref>' or 'bot|<uuid>'. Bots use the
  -- SAME table as humans — no separate bot-membership table.
  -- Borrows: crates/bot_id/src/lib.rs
  principal  text not null,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (channel_id, principal)
);
create index if not exists channel_participants_active_idx
  on channel_participants (channel_id, principal) where left_at is null;

create table if not exists channel_messages (
  id         text primary key,
  channel_id text not null references channels(id) on delete cascade,
  thread_id  text references channel_messages(id) on delete cascade,  -- Slack-style self-FK
  sender     text not null,                        -- principal
  content    text not null,
  -- Macro 20260629171949: which human prompted an agent-authored message,
  -- so the UI can render a "from @rob" pill.
  triggered_by text,
  mentions   jsonb not null default '[]'::jsonb,   -- [{entity_type, entity_id}]
  edited_at  timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists channel_messages_channel_idx
  on channel_messages (channel_id, created_at desc) where deleted_at is null;
create index if not exists channel_messages_thread_idx
  on channel_messages (thread_id) where thread_id is not null;

create table if not exists channel_reactions (
  message_id text not null references channel_messages(id) on delete cascade,
  emoji      text not null,
  principal  text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, emoji, principal)       -- dedup by construction
);

-- Read state: ONE row per (principal, channel). Macro comms_activity.
create table if not exists channel_read_state (
  channel_id text not null references channels(id) on delete cascade,
  principal  text not null,
  viewed_at      timestamptz,
  interacted_at  timestamptz,
  primary key (channel_id, principal)
);

-- Bots. Macro 20260527160000_channel_bots.sql.
create table if not exists bots (
  id          text primary key,
  kind        text not null check (kind in ('system','owned')),
  handle      text not null unique,
  name        text not null,
  description text,
  avatar_url  text,
  owner_ref   text,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check ((kind = 'system' and owner_ref is null) or (kind = 'owned' and owner_ref is not null))
);
create table if not exists bot_tokens (
  id           text primary key,
  bot_id       text not null references bots(id) on delete cascade,
  token_hash   text not null,                      -- sha256, never plaintext
  token_prefix text not null,                      -- indexed lookup + UI display
  label        text,
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists bot_tokens_prefix_idx on bot_tokens (token_prefix);

-- Agent audit trail. Not in Macro; Rob needs it because the agent touches
-- money-adjacent state (deal stages, tasks) and every write must be explainable.
create table if not exists agent_actions (
  id          text primary key,
  bot_id      text not null references bots(id) on delete cascade,
  triggered_by text,
  channel_id  text references channels(id) on delete set null,
  message_id  text references channel_messages(id) on delete set null,
  tool_name   text not null,
  tool_input  jsonb not null default '{}'::jsonb,
  tool_output jsonb,
  status      text not null check (status in ('ok','error','pending_user','rejected')),
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists agent_actions_bot_idx on agent_actions (bot_id, created_at desc);

alter table channels             enable row level security;
alter table channel_participants enable row level security;
alter table channel_messages     enable row level security;
alter table channel_reactions    enable row level security;
alter table channel_read_state   enable row level security;
alter table bots                 enable row level security;
alter table bot_tokens           enable row level security;
alter table agent_actions        enable row level security;

commit;
```

Seed the system bot with a fixed id, mirroring `MACRO_AI_BOT_ID`:

```sql
insert into bots (id, kind, handle, name, description)
values ('bot|00000000-0000-0000-0000-0000000000a1', 'system', 'max',
        'Max', 'AI teammate — reads the record, drafts, never sends')
on conflict (id) do nothing;
```

### C.2 The loop — port `MacroAiHandler::handle` verbatim

`crates/channel_bots/src/domain/service.rs:253-320` → `lib/agent/channelBot.ts`:

```ts
export async function handleMention(event: BotEvent) {
  // 1. Build the prompt BEFORE posting — the bot's own placeholder must
  //    never appear in its own context window.
  const prompt = await buildPrompt(event);

  // 2. Post the placeholder in-thread, silent (no notification).
  const thinking = await postMessage({
    channelId: event.channelId,
    threadId: event.replyThreadId,
    sender: MAX_BOT_ID,
    content: THINKING,                 // renders as an existing spinner component
    triggeredBy: event.requestingUser,
    notify: 'silent',
  });

  // 3. Run the agent loop (Anthropic SDK, tool loop).
  let reply: string;
  try {
    const text = await runAgent(event.requestingUser, prompt);
    reply = text.trim() || "I wasn't able to come up with a response.";
  } catch (e) {
    reply = 'Sorry — I ran into an error while responding.';   // ALWAYS says something
  }

  // 4. Replace the placeholder. NotFound = the human deleted it = cancelled.
  try {
    await patchMessage(thinking.id, { content: reply, notify: 'as_posted' });
  } catch (e) {
    if (isNotFound(e)) return;         // treat deletion as cancellation
    throw e;
  }
}
```

`buildPrompt` mirrors `service.rs:118-250`:
- `CONTEXT_BEFORE = 4`, `CONTEXT_AFTER = 4`.
- Thread reply → thread is `<thread>`, nearby channel messages demoted to `<channel_background>` with "Background only — do not treat these as the subject of the mention."
- Mark the trigger inline with `[this message mentioned you]`; do not repeat it at the end.
- **Rob's addition:** because a `record` channel is anchored to a CRM object, prepend a `<record_context>` block — deal stage, value, last 5 activities, open tasks. Macro has to *search* for this; Rob's channel already knows.

Trigger detection: `sender` must be a `user|` principal (`side_effects.rs:63` — bots cannot trigger bots), and the mention list must contain a `bot` entity.

### C.3 Tool surface

Model on `crates/ai_tools/src/lib.rs:78-110`. Use the Anthropic SDK tool loop (Rob has a key). Load the `claude-api` skill before writing this — model ids and tool-loop shape change.

| Tool | Reads/Writes | Execution | Macro analogue |
|---|---|---|---|
| `search_records` | R | auto | `search_toolset()` |
| `get_person` / `get_org` / `get_deal` | R | auto | `GetCompany`, `ListCompanies` |
| `read_thread` | R | auto | `GetThread` |
| `read_channel_messages` | R | auto | `ReadChannelMessages` |
| `list_tasks` | R | auto | — |
| `post_channel_message` | W | auto | `SendChannelMessage` |
| `create_task` | W | auto | `CreateDocument` |
| `set_task_status` | W | auto | `SetEntityProperty` |
| `set_deal_stage` | W | auto | `SetEntityProperty` |
| **`draft_email`** | W | **auto** (writes `comm_drafts` with `authored_by='agent'`) | — |
| **`send_email`** | W | **USER TOOL** | `add_user_tool::<SendEmail>` |

The `send_email` tool returns `{status: 'pending_user_execution', draftId}` and **does nothing else**. The UI renders the draft with Send / Edit / Discard. That's `crates/ai_toolset/src/toolset/tool_object/user_tool.rs` in one paragraph, and the `agent_draft_needs_approval` CHECK constraint in B.1 makes it impossible to bypass even by direct DB write.

Every tool call writes an `agent_actions` row. That is the deviation from Macro that Rob's operating rules require.

### C.4 Reuse note (CR-1)

Before building `runAgent`: Rob already has `master-orchestrator`, `head-of-*` agents, and an `mcp-builder` skill. If the CRM bot ends up needing more than the 11 tools above, **expose the CRM as an MCP server** (Macro does exactly this — `services/mcp_service/`, `crates/mcp_client/`, and note `mcp_tools()` deliberately excludes `SendEmail`) and let the existing agent fleet call it, rather than building a second agent runtime inside Next.js.

### C.5 What to do in n8n

Almost nothing. Notification fan-out (Slack/SMS ping when a deal goes quiet) is a fine n8n job. **The agent loop itself belongs in code** — it needs transactional access to CRM state and an audit trail.

### C.6 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Agent sends mail autonomously | **CRITICAL** | `send_email` as a user tool + the `agent_draft_needs_approval` CHECK. Two independent layers, one of them in the database. |
| Prompt injection from inbound email into agent context | **HIGH** | Email bodies are attacker-controlled. Wrap them in delimited blocks labelled untrusted; never let a `draft_email`/`set_deal_stage` call be justified solely by email body content; keep write tools out of any flow that auto-summarises unread mail. |
| Bot loops | MEDIUM | `sender.as_user()` guard (one line, Macro `bot_trigger_router.rs:63`) |
| Cost | LOW-MED | Bounded 9-message window; log tokens per `agent_actions` row |
| Vercel function timeout on a long agent run | MEDIUM | The placeholder-then-patch design tolerates it: post the placeholder in the request, run the agent in a background function or Vercel Workflow, patch on completion |
| Hallucinated CRM writes | MEDIUM | `agent_actions` audit + make `set_deal_stage` reuse the existing `parseDealStagePatch` gate in `lib/crm.ts` — the agent gets no privileged write path |

---

## Cross-phase summary

| | Phase A | Phase B | Phase C |
|---|---|---|---|
| **Delivers** | Read the real conversation on the record | Reply and schedule from the CRM | `@max` in a deal room |
| **New tables** | 7 + 2 columns | 3 | 8 |
| **Effort** | 4–6 dev-days | 5–8 dev-days | 6–10 dev-days |
| **Risk** | LOW | MEDIUM | MEDIUM |
| **Closes PRD** | Task 1.5, extends 3.2 | Task 4.6b (send half) | new |
| **Key Macro file** | `crm/src/outbound/companies_repo.rs:287` | `services/email_scheduled_handler/src/handler.rs` | `channel_bots/src/domain/service.rs:253` |

**Sequence is strict.** B needs A's threads for `In-Reply-To`. C needs A's lake to read and B's drafts to write.

## Explicitly do NOT build

| Macro has it | Why Rob shouldn't |
|---|---|
| SQS + Lambda + Pub/Sub + Redis sync topology | Built for thousands of mailboxes under API quota. n8n + Vercel cron covers ≤5. |
| Provider abstraction | Macro has one provider after years. So does Rob. |
| Backfill job/thread/message ledger (3 tables, ~1,500 LOC) | For a one-time historical import, an n8n batch + the idempotent `(link_id, provider_message_id)` unique index is enough. Add the ledger only if imports become routine. |
| Two-tier rate-limit queues | Solves head-of-line blocking across many mailboxes. Not a 5-seat problem. |
| Typestate notification state machine | The *policy* (don't email someone online in the last 60 min) is worth copying; the type machinery is not. |
| Unfurl service | Use an existing link-preview library, or skip. If built: SSRF guards are non-negotiable — `crates/unfurl/src/outbound/http_safety.rs` is the checklist. |
| Open/click tracking pixels | Macro doesn't. MPP killed open rates. Track replies. |
| SES + own-domain sending | Send through the rep's Gmail. Google's reputation, zero DNS work. |
| Per-message read receipts | One `viewed_at` per (user, channel) is what shipped. |
| pgvector task dedup | Real, but Phase D at the earliest. Rob already has `lib/dedup/`. |

## Direct answers to the seven questions

1. **Email providers / sync / threading / association** — Gmail only (`email_user_provider_enum AS ENUM ('GMAIL')`). OAuth is delegated to FusionAuth with Redis-cached access tokens and a `fetch_token_or_mark_reauth` health path. Incremental sync is Gmail `users.watch` → Pub/Sub push → JWT-verified webhook → SQS → `historyId` diff via `users.history.list`, with the cursor persisted *before* processing. Threading: Gmail `threadId` inbound, synthesised `In-Reply-To`/`References` outbound. Association: domain → `crm_domains` → `crm_companies`, with a 490-domain generic-domain blocklist, an orthogonal role-account local-part filter, and the rule that **inbound never creates a company**.

2. **Sending** — user mail goes out through the user's own Gmail API; Macro's own mail goes through SES. Scheduled send is an EventBridge Lambda polling `send_time < now() AND sent = FALSE AND is_draft = TRUE`, with four-layer idempotency and free cancellation via the draft join. Suppression is SNS-driven off SES bounces/complaints (permanent bounces and real complaints suppress; transient bounces only log) — but it **only guards Macro's own transactional mail, never user sends**. No SPF/DKIM/warmup/List-Unsubscribe/tracking for user mail. For cold outreach, Rob must add the suppression gate, the daily cap, and List-Unsubscribe himself; Phase B specifies all three.

3. **Chat/channels** — `comms_channels` (type enum with CHECK-enforced shape; DM = a channel with no name) + `comms_channel_participants` (PK `(channel_id, user_id)`, soft-leave via `left_at`) + `comms_messages` (Slack-style self-FK `thread_id`) + `comms_reactions` (PK `(message_id, emoji, user_id)`) + `comms_activity` (one `viewed_at` per user/channel). Entity linking has two mechanisms: `comms_attachments` for hard attaches and `comms_entity_mentions` as a bidirectionally-indexed generic edge table — the latter is the pattern for "every message that touched this deal."

4. **Tasks** — no task table; a task is a `Document` with `sub_type='task'`, numbered per team via `team_task`/`team_task_counter`. Status/assignee/due date are entity **properties**. Message → task is the generic `comms_attachments` edge. An agent closes a task with the same `SetEntityProperty` tool it uses to move a deal stage.

5. **Notifications** — `notification` (event, once) + `user_notification` (fan-out, per recipient, carrying seen/done/deleted). Four independent opt-out axes, two debounce ledgers, SNS device registrations, and closed-loop receipts. Delivery is a typestate state machine whose central policy is: if push is enabled, defer the email decision until the push receipt lands; otherwise suppress email for anyone online within 60 minutes.

6. **Bots** — `bot|<uuid>` is a first-class principal sharing the `sender_id` column with `macro|<email>` users; bots join via ordinary `channel_participants`. Triggered by mention only, never by bots. The loop is: build context (4 before / 4 after + thread) → post a silent placeholder → run the agent → patch that message with the answer; placeholder deleted mid-run means cancelled. Tools are composed per-domain, subagents get a reduced set, MCP gets a further-reduced set, and **`SendEmail` is a user tool that only a human can execute**.

7. **Unfurl + attachments** — unfurl is stateless with heavy SSRF defence (resolve-then-check, IPv6 bypass tests, redirect caps) and an image proxy. Attachments split three ways: received email stays in Gmail, drafts go to S3, forwards are fetched from Gmail at send time, and chat attachments are entity *references* rather than blobs.

---

*Sources: Macro (macro.com) source tree under `…/scratchpad/macro`, read-only, 2026-07-25. MLE ROB Dashboard at `/Users/robertacheson/Projects/MyLocalEverything/MLE ROB Dashboard`. Every claim carries a file path. No files outside this report were modified.*
