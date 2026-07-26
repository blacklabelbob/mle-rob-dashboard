-- Q63 (2026-07-25): mount the Phase 2 ROI Estimator on the company record.
-- Rob, this session: "yes definitely mounted inside the dashboard."
--
-- The estimator was a standalone page (docs/plans/PHASE2-ROI-ESTIMATOR.html) whose inputs
-- died with the tab. Mounted on a record, the inputs have to survive the rep closing the
-- browser — otherwise it fails the standing UX bar (Rob 2026-07-17: click-to-edit,
-- autosaves, never a Save button) by silently forgetting what he typed.
--
-- Shape: ONE jsonb column holding {estInvestment, daysElapsed, region, guaranteeDays,
-- overrides} — see Phase2Estimate in lib/roi/automations.ts. The automation CATALOGUE is
-- code, not data, so only the operator's deltas are stored. That keeps a BLS rate refresh
-- a code change rather than a backfill across every row.
--
-- Both tables get it: post-0003 the 16 business rows live in `orgs` while people live in
-- `people`, and /companies/[id] can resolve to either anchor. A column on only one of them
-- would make persistence work on some company records and silently not on others.
--
-- Additive DDL only — no existing row is touched, and a NULL reads as "never estimated".

begin;

alter table people add column if not exists phase2_estimate jsonb;
alter table orgs   add column if not exists phase2_estimate jsonb;

comment on column people.phase2_estimate is
  'Phase 2 ROI estimator inputs (Phase2Estimate in lib/roi/automations.ts). NULL = never estimated. Operator deltas only; the automation catalogue lives in code.';
comment on column orgs.phase2_estimate is
  'Phase 2 ROI estimator inputs (Phase2Estimate in lib/roi/automations.ts). NULL = never estimated. Operator deltas only; the automation catalogue lives in code.';

commit;
