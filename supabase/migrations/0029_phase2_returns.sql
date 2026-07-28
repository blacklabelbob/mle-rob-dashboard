-- Q63 leg (5) inc.2 (2026-07-28): where a customer's MEASURED Phase 2 returns live.
--
-- WHAT THIS IS: one row per measurement of a customer's Phase 2 outcome — hours
-- saved, the wage those hours are valued at, and revenue since Phase 2 started.
-- `lib/phases/blueprint.ts:136` says the gap in its own comment ("There is no
-- store for these yet"), which is why every customer on prod reads *"Hours saved
-- and revenue since Phase 2 started have not been measured yet"*. Not because
-- nobody measured — because there was nowhere to put it. `phase2Guarantee` and
-- `computePhase2Roi` are already built and tested; this table is the origin their
-- edge is drawn from.
--
-- THIS IS THE TABLE BEHIND A MONEY GUARANTEE ROB PUT HIS NAME TO. The number a row
-- here produces tells a paying customer whether the 3-month ROI guarantee is in
-- surplus or shortfall — i.e. whether Rob owes them. Every column below exists
-- because its absence would let that number be printed over something nobody
-- actually measured.
--
-- IDENTITY IS (customer_id, measured_at), AND IT IS UNIQUE. A measurement is
-- re-submitted whenever a correction lands (a payroll figure gets restated, a
-- rep fat-fingers a wage). Without a conflict target the correction APPENDS, and
-- the freshest-wins read then has two rows claiming the same instant with
-- different numbers — a customer's guarantee status flipping between page loads
-- with no edit in between. Named so a writer can upsert against it.
--
-- `measured_at` IS A COLUMN, NOT `created_at`. The instant a measurement DESCRIBES
-- and the instant it was TYPED IN are different facts, and only the first can make
-- a stale reading visible as stale. March's figure entered in July must sort as
-- March; using the insert time would render it as today's, forever.
--
-- `revenue_basis` IS NOT NULLABLE AND IS NOT DEFAULTED. Rob's Open Question A
-- (top-line vs attributable revenue) is still open. A default would answer it for
-- him silently, in a column, under a number he shows customers. Requiring it means
-- every stored row says WHICH question it answers, so his eventual ruling becomes a
-- filter over honest rows rather than a re-measurement of ambiguous ones — the
-- whole reason this leg could be built while that question is open. The CHECK is
-- the schema-level half of `REVENUE_BASES`: an unrecognised basis is refused by
-- the database too, not only by the write door.
--
-- HOURS AND RATE ARE STORED SEPARATELY, NEVER PRE-MULTIPLIED (CR-3). A stored
-- labour-value column would be a second copy of Rob's formula, and the copy is the
-- one that goes stale.
--
-- NO NUMERIC CHECKS BEYOND NON-NULL, AND THAT IS DELIBERATE. `planPhase2ReturnsWrite`
-- allows NEGATIVE revenue (a refund month is real money) and refuses negative hours
-- and wages — the SAME predicate `phase2Guarantee.usableReturns` applies on the way
-- out. Restating those bounds here would create a second authority that can drift
-- from the tested one; the door decides, the table stores.
--
-- `measured_by` / `source` ANSWER "WHO MEASURED THIS". A figure driving a money
-- guarantee that cannot say who produced it cannot be defended when the customer
-- asks. `superseded_at` retires a bad reading without deleting it — records are not
-- deleted here, and a retracted measurement stays readable as one that was taken.
--
-- RLS ON, ZERO POLICIES — service role only, same as 0025/0027. Prod is
-- unauthenticated by Rob's 7/21 call; under the anon key every read comes back
-- empty, which renders as "not measured yet" — the honest state, and the one
-- `phase2Guarantee` already handles as AWAITING_DATA.

create table if not exists public.phase2_returns (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  labor_hours_saved double precision not null,
  labor_cost_per_hour double precision not null,
  revenue_since_phase2_start double precision not null,
  revenue_basis text not null check (revenue_basis in ('top_line', 'attributed')),
  measured_at timestamptz not null,
  measured_by text not null,
  source text,
  note text,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists phase2_returns_identity
  on public.phase2_returns (customer_id, measured_at);

-- The blueprint reads one customer's measurements at a time, freshest first.
create index if not exists phase2_returns_customer
  on public.phase2_returns (customer_id, measured_at desc);

alter table public.phase2_returns enable row level security;
