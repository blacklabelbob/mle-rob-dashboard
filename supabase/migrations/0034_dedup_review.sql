-- APPLY-STATUS: PENDING (owner: rob)
--
-- Q84 inc.50 — the table four modules read has no migration, and its status
-- vocabulary lives only in comments.
--
-- WHAT WAS OBSERVED: `dedup_review` exists on prod and is read or written by
-- `lib/dedup/detector.ts`, `lib/dedup/merge.ts`, `lib/dedup/queueView.ts`,
-- `lib/integrity/backup.ts` and `app/api/admin/dedup/route.ts` — and
-- `grep -r dedup_review supabase/migrations` returns ZERO hits. It was created by
-- hand. So the three statuses the inc.47/48/49 ladders branch on (`open`,
-- `dismissed`, `resolved`) are pinned nowhere: a fresh environment gets no table
-- at all, and prod accepts any string in `status` that a future caller invents.
--
-- MEASURED, NOT ASSUMED. Every column, type, default, NOT NULL and the primary
-- key below were read off prod's PostgREST schema on 2026-07-31 (read-only), not
-- reconstructed from the code that writes them:
--   pair_key text PRIMARY KEY · a_id/b_id/kind/confidence text NOT NULL ·
--   signals/evidence text[] NOT NULL · status text NOT NULL default 'open' ·
--   first_seen_at/last_seen_at timestamptz NOT NULL default now() ·
--   resolved_at timestamptz NULL · resolution_note text NULL
-- There is no `id` and no `created_at`; the pair key IS the identity, which is
-- what lets the detector's `upsert(..., { onConflict: "pair_key" })` be idempotent.
--
-- THIS IS WRITTEN TO BE A NO-OP AGAINST PROD. `create table if not exists` skips
-- the whole shape; the only statements that can touch the live table are the three
-- guarded constraint adds, and they are guarded by name so a re-run is silent.
-- Applying it is Rob's `supabase db push` — nothing here has been applied.
--
-- Safe to apply today for a second reason worth stating rather than assuming:
-- `dedup_review` holds **0 rows** on prod (read-only count, 2026-07-31), so the
-- CHECKs validate against an empty table and cannot fail on legacy data.

begin;

create table if not exists dedup_review (
  pair_key        text primary key,
  a_id            text        not null,
  b_id            text        not null,
  kind            text        not null,
  signals         text[]      not null,
  confidence      text        not null,
  evidence        text[]      not null,
  status          text        not null default 'open',
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  resolved_at     timestamptz,
  resolution_note text
);

-- The three vocabularies, in Postgres instead of in prose (CR-3).
--
-- WHY CHECK AND NOT AN ENUM: `queueView.partitionDedupQueue` deliberately files an
-- UNRECOGNISED status into the `open` bucket so a schema change fills the queue
-- loudly instead of shrinking it silently. That behaviour only has a job if an
-- unknown value can physically arrive — an enum makes the case unreachable and the
-- test that covers it theatre. A CHECK stops the writers we control while leaving
-- the read side honest about the ones we do not.
--
-- Added by name through DO blocks because `add constraint` has no `if not exists`:
-- prod's table was hand-made and may already carry a constraint of this name.
do $$ begin
  alter table dedup_review add constraint dedup_review_status_check
    check (status in ('open', 'dismissed', 'resolved'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table dedup_review add constraint dedup_review_kind_check
    check (kind in ('person', 'org'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table dedup_review add constraint dedup_review_confidence_check
    check (confidence in ('high', 'review'));
exception when duplicate_object then null;
end $$;

comment on table dedup_review is
  'One row per suspected duplicate pair (Q84 inc.50 pinned the shape; table predates it). Identity is pair_key, so the detector re-upserts the same row instead of stacking copies. status: open = still to dispose · dismissed = a reviewer said not-a-duplicate · resolved = a machine closed it (merge.ts wrote "merged: …", or the detector observed the signals disappear). Who closed a row is read by lib/dedup/resolutionNote.dedupClosedBy — never by parsing the note alone.';

comment on column dedup_review.status is
  'open | dismissed | resolved. Constrained here so the three ladders in lib/dedup (dedupClosedBy, dedupReopenable, reopenRefusal) branch on a vocabulary the database enforces rather than one the code hopes for.';

commit;
