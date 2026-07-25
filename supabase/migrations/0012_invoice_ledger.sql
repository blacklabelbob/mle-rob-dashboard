-- Task MC.9 (invoicing leg, half 2) — the DESTINATION the CSV-diff sync writes to.
--
-- GATE G3 (MC.7, 2026-07-23) established that `invoices/invoice-ledger.csv` in
-- the contracts repo is the ONLY live invoicing store: Supabase has no invoice
-- or AR table at all. That CSV lives in a repo that is NOT deployed with the
-- dashboard, so the AR panel can never read it directly — every row reaches
-- prod through a sync run. This migration creates what that run writes into.
--
-- WHAT THIS IS NOT. It is not a source of truth. Rob's ledger is. Every column
-- here is a MIRROR of a ledger cell, and the house hard limit applies: this
-- table never originates a money value, it only carries what the CSV said.
-- That is why there is no `balance`, no `amount_paid`, no computed remainder —
-- `lib/readModel/invoiceLedger.ts` deliberately refuses to do arithmetic on a
-- split-payment plan written in prose, and a column here would invite exactly
-- the fabricated number that refusal exists to prevent.
--
-- SHAPE IS PINNED BY CODE. `lib/readModel/ledgerSync.ts` defines
-- `SyncedInvoiceRow` (= InvoiceLedgerRow + provenance + withdrawnAt) and
-- `lib/__tests__/invoiceLedgerSql.test.ts` parses THIS file and asserts every
-- field of that type has a column to land in. A new ledger field therefore
-- cannot be added in TypeScript and silently dropped on the way to Postgres.
--
-- PROVENANCE IS NOT NULLABLE (except the commit). An untagged row looks current
-- forever, which is the worst failure mode a money panel has. `source_sha256`
-- and `synced_at` are required; `source_commit` may be null because a read from
-- a dirty working tree is still a real read and is recorded honestly as such.
--
-- NOTHING IS EVER DELETED. An invoice that leaves the CSV gets `withdrawn_at`
-- set and keeps its row — a file that lost a line and a file that never had it
-- are indistinguishable from the sync's point of view, so a human decides.
--
-- NO `rm_invoices_ar` VIEW YET, ON PURPOSE. The contract
-- (`lib/readModel/contract.ts`) still marks that read model `blocked_no_source`
-- and the panel still renders `unavailable` — test-pinned. Creating an empty
-- view now would let the panel claim `live` while holding zero synced rows,
-- which is precisely the fake feature the pinning exists to stop. The view +
-- contract flip ride the increment where the runner actually lands rows.
--
-- Additive only: two new tables. Zero existing rows touched.

begin;

-- ---------------------------------------------------------------------------
-- invoice_ledger — one row per invoice number, mirrored from the CSV
-- ---------------------------------------------------------------------------
create table if not exists invoice_ledger (
  -- The ledger's own key. Rows that cannot be keyed are held back by the sync
  -- as conflicts and never reach this table under a guessed id.
  invoice_number        text primary key,

  -- Ledger cells, verbatim. `amount` is nullable because an unreadable amount
  -- is excluded from every total and counted, never coerced to 0.
  issue_date            text        not null,
  client_slug           text        not null,
  client_legal_name     text        not null,
  owner                 text,
  amount                numeric(14,2),
  currency              text        not null,

  -- The status cell exactly as a human wrote it, plus only what can be read
  -- out of it EXPLICITLY. `payment_state` is 'unknown' when the text does not
  -- state a state — never defaulted to paid or outstanding.
  status_text           text        not null,
  payment_state         text        not null
                          check (payment_state in ('paid','outstanding','unknown')),
  -- Explicit ISO due date only. NULL is its own aging bucket in the panel
  -- ("no due date"), not a synonym for "not yet due".
  due_date              date,
  -- Instalment language carried verbatim. Never parsed into amounts.
  payment_plan_note     text,
  pdf                   text,

  -- Provenance: which bytes, which commit, which run.
  source_sha256         text        not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_commit         text        check (source_commit ~ '^[0-9a-f]{7,40}$'),
  synced_at             timestamptz not null,

  -- Set when the invoice stopped appearing in the CSV. A mark, not a delete.
  withdrawn_at          timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Worst-first aging reads by due date over live (non-withdrawn) invoices.
create index if not exists invoice_ledger_open_due_idx
  on invoice_ledger (due_date)
  where withdrawn_at is null and payment_state <> 'paid';

create index if not exists invoice_ledger_client_idx on invoice_ledger (client_slug);

-- ---------------------------------------------------------------------------
-- invoice_ledger_sync_runs — the audit trail of the sync itself
-- ---------------------------------------------------------------------------
-- Without this, "the panel shows no overdue invoices" and "the sync has not run
-- since Tuesday" are indistinguishable on screen. A run is logged whether it
-- wrote or REFUSED, and the refusal reason is stored as the sentence a reader
-- gets shown.
create table if not exists invoice_ledger_sync_runs (
  id                    uuid primary key default gen_random_uuid(),
  source_repo           text        not null,
  source_path           text        not null,
  content_sha256        text        not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  source_commit         text        check (source_commit ~ '^[0-9a-f]{7,40}$'),
  synced_at             timestamptz not null,
  row_count             integer     not null check (row_count >= 0),

  -- NULL = the plan was applied. A sentence = it was not, and why.
  refusal_reason        text,
  -- Plan summary as computed by planLedgerSync(); mirrored, not recomputed here.
  added                 integer     not null default 0 check (added >= 0),
  changed               integer     not null default 0 check (changed >= 0),
  withdrawn             integer     not null default 0 check (withdrawn >= 0),
  unchanged             integer     not null default 0 check (unchanged >= 0),
  material              integer     not null default 0 check (material >= 0),
  conflicts             integer     not null default 0 check (conflicts >= 0),
  requires_review       boolean     not null default false,
  -- Conflict detail, so a held-back duplicate is reviewable without re-running.
  conflict_detail       jsonb       not null default '[]'::jsonb,

  created_at            timestamptz not null default now()
);

create index if not exists invoice_ledger_sync_runs_recent_idx
  on invoice_ledger_sync_runs (synced_at desc);

-- RLS on both, matching 0006's posture: the service role (used by the sync and
-- by the panel's read path) bypasses RLS; no anon/authenticated policy is
-- granted, so nothing is publicly readable. Money data gets no exceptions.
alter table invoice_ledger          enable row level security;
alter table invoice_ledger_sync_runs enable row level security;

commit;
