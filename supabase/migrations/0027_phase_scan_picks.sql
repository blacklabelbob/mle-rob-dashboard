-- Q40 leg (6) inc.16 (2026-07-28): where a customer's automation shortlist lives.
--
-- WHAT THIS IS: one row per (customer, automation) that a human picked out of THAT
-- customer's AI Growth Scan. `lib/phases/aimForNext.ts` today answers SCAN_NO_PICKS
-- for every company on prod — "your automation shortlist hasn't been picked yet —
-- it's chosen from the scan, not from a template" — because no store existed to
-- pick INTO. This table is that store, and it is the only thing that can move a
-- company to READY.
--
-- THIS IS A SALES SURFACE POINTED AT A PAYING CUSTOMER. Every column below exists
-- because its absence would let the panel say something nobody decided.
--
-- IDENTITY IS (customer_id, pick_id), AND IT IS UNIQUE. The picks come out of a
-- scan that gets re-run and re-imported; without a conflict target, a second import
-- appends the same automation again and the customer is shown their own shortlist
-- with duplicates in it — while the extras silently push real picks past the slot
-- count. Named so a writer can upsert against it.
--
-- `rank` IS THE SHORTLIST ORDER AND IT IS LOAD-BEARING. The panel shows only
-- `slotCount` picks and names the overflow out loud. Which picks land inside that
-- cut therefore depends entirely on order — leaving it to Postgres row order means
-- what a customer is pitched can change between two page loads with no edit in
-- between. Ordering is (rank, recorded_at, pick_id) so it is total, not merely
-- mostly-defined.
--
-- `withdrawn_at`, NOT A DELETE. Taking a recommendation back is an event with a
-- date, and the house rule is that records are not deleted. A withdrawn pick stops
-- being shown and stays readable as something that was once recommended to this
-- customer.
--
-- `recorded_by` / `source` ANSWER "WHO PICKED THIS". The panel's own copy claims a
-- human chose these from the scan. A row that cannot say who recorded it cannot
-- back that claim, so the attribution is stored beside the pick rather than
-- assumed by whatever renders it.
--
-- RLS ON, ZERO POLICIES — service role only, same as 0025. Prod is unauthenticated
-- by Rob's 7/21 call; under the anon key every read here is empty, which is exactly
-- "no picks yet" — the honest state, and the one the panel already handles.

create table if not exists public.phase_scan_picks (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  pick_id text not null,
  label text not null,
  why text,
  rank integer not null default 0,
  recorded_by text,
  recorded_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists phase_scan_picks_identity
  on public.phase_scan_picks (customer_id, pick_id);

-- The panel reads one customer's whole shortlist at a time, in order.
create index if not exists phase_scan_picks_customer
  on public.phase_scan_picks (customer_id, rank);

alter table public.phase_scan_picks enable row level security;
