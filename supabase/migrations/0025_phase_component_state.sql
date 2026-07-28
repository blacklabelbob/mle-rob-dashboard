-- Q40 leg (4) inc.2 (2026-07-28): where a customer's Phase component lights live.
--
-- WHAT THIS IS: one row per (customer, phase, component). `lib/phases/blueprint.ts`
-- reads component lights from stored state only and says so on the page today —
-- "no signal source exists, an unlit board is the truth". This table is that store.
--
-- IDENTITY IS THE TRIPLE, AND IT IS UNIQUE. The partner's tools re-POST; without a
-- conflict target every retry appends a second light for the same component and the
-- Blueprint has to guess which one is current. `(customer_id, phase, component_id)`
-- is named so the writer can upsert against it. Phase is part of the key because a
-- slug filed under the wrong phase is a real disagreement the decider surfaces
-- (`phase_mismatch`) rather than silently merging.
--
-- TWO TIMESTAMPS, ON PURPOSE (this is the money column pair):
--   * `live_at`      — is the light on RIGHT NOW. A revert clears it.
--   * `ever_live_at` — the FIRST time it was ever lit, never cleared, never moved.
-- The refund clock keys on `ever_live_at`. If it keyed on `live_at` being absent, a
-- partner's revert-then-redeploy would hand the customer a brand-new 30 days that
-- nobody decided and nobody would ever see on a screen.
--
-- `seen_event_ids` is the idempotency memory: eventIds already applied for this
-- component. Capped in code (SEEN_EVENT_CAP), with the ordering check in
-- lib/phases/signalIntake.ts as the backstop for anything older than the cap.
--
-- RLS ON, ZERO POLICIES — service role only. This table drives what a customer is
-- shown about their own build and when their refund window started; prod is
-- currently unauthenticated by Rob's 7/21 call, so the anon key must reach nothing
-- here. Under anon every write affects zero rows and every read is empty, which is
-- indistinguishable from "no signals yet" — the writer uses the service key or
-- refuses to build a client at all (the transcriptDb rule, held a second time).

create table if not exists public.phase_component_state (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  phase smallint not null check (phase in (1, 2, 3)),
  component_id text not null,
  live_at timestamptz,
  ever_live_at timestamptz,
  last_signal_at timestamptz,
  seen_event_ids text[] not null default '{}',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists phase_component_state_identity
  on public.phase_component_state (customer_id, phase, component_id);

-- The Blueprint reads every component for one customer at a time.
create index if not exists phase_component_state_customer
  on public.phase_component_state (customer_id);

alter table public.phase_component_state enable row level security;
