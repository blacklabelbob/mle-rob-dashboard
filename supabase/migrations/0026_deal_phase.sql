-- Q40 inc.10 — the agreement's ASSOCIATED PHASE becomes a column.
--
-- WHY: inc.9 landed `attributePhaseMoney`, which makes a recorded phase beat
-- inference. But nothing could record one — the Phase 2 investment (and therefore
-- the 3-month ROI guarantee's target) had no home, so the blueprint could only ever
-- attribute money to Phase 1 by inferring a sole candidate. This is that home.
--
-- ADDITIVE ONLY, AND DELIBERATELY NOT BACKFILLED. A backfill would write a phase
-- onto every existing agreement from the same inference the code already runs, and
-- inference-written-to-a-column stops looking like inference: `attributePhaseMoney`
-- treats a recorded phase as a rep's statement and will not second-guess it. The
-- column stays null until a human says otherwise; null means "nobody has said",
-- which is NOT the same as Phase 1 (pinned, Q40 leg 5).
--
-- Smallint, not text: the three phases are a closed set in the product (§3.1), and
-- the check below is the database's copy of the same rule `PhaseNo` enforces in
-- TypeScript — a hand-written row or a future writer cannot store a phase 4 that
-- the blueprint would then have to render as nothing.

alter table if exists deals add column if not exists phase smallint;

do $$
begin
  if to_regclass('deals') is not null then
    alter table deals drop constraint if exists deals_phase_range;
    alter table deals add constraint deals_phase_range
      check (phase is null or phase in (1, 2, 3));
  end if;
end $$;

comment on column deals.phase is
  'Q40 leg (5): the phase this agreement is FOR, as recorded by a human. NULL = not stated (never "phase 1").';
