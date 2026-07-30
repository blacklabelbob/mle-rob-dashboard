import { describe, it, expect } from "vitest";
import { DEAL_STAGES, parseDealStagePatch } from "../crm";
import { DEAL_STAGES as FILTER_DEAL_STAGES } from "../filters/ast";
import { STAGE_LABELS } from "../labels";
import { STAGE_LADDER } from "../scoring/deal";
import { __testing as companyDealsTesting } from "../companyDeals";
import { REP_PIPELINE_STAGES } from "../deals/repPipelineBoard";
import type { DealStage } from "../types";

// Q45 inc.2 — the stage ladder is written down in SIX places (the `DealStage`
// union, `crm.DEAL_STAGES`, `filters/ast.DEAL_STAGES`, `labels.STAGE_LABELS`,
// `scoring.STAGE_LADDER`, `companyDeals.STAGE_ORDER`) plus the 0005 CHECK
// constraint, which `crm.test.ts` already pins. Two of those six are plain
// arrays: TypeScript enforces nothing about their MEMBERSHIP, so a stage can
// exist everywhere else and be silently absent from them.
//
// That is not hypothetical harm. An absent stage in `filters/ast` is a filter
// the UI offers and the parser rejects; an absent stage in `STAGE_ORDER` used
// to sort to the TOP of Rob's company lead view (indexOf = -1), so the deal
// that fell through the ladder displayed as the most advanced one on the
// record. These tests make the two hand-maintained lists provably complete,
// which is what keeps the new `stageRank` fallback unreachable.
//
// Rob asked for `meeting_booked` between `contacted` and `meeting_held`
// (2026-07-22). That ordering is the DoD, so it is asserted in every ordering
// the app actually sorts by — not just the one that was easiest to change.

const CONTACTED: DealStage = "contacted";
const BOOKED: DealStage = "meeting_booked";
const HELD: DealStage = "meeting_held";

describe("deal stage ladder coherence", () => {
  it("the filter parser knows exactly the stages the CRM does, in the same order", () => {
    expect([...FILTER_DEAL_STAGES]).toEqual([...DEAL_STAGES]);
  });

  it("every stage has a label, and no label is blank", () => {
    for (const stage of DEAL_STAGES) {
      expect(STAGE_LABELS[stage], stage).toBeTruthy();
      expect(STAGE_LABELS[stage].trim(), stage).not.toBe("");
    }
  });

  it("every stage has a scoring rung", () => {
    for (const stage of DEAL_STAGES) {
      expect(typeof STAGE_LADDER[stage], stage).toBe("number");
    }
  });

  it("STAGE_ORDER lists every stage exactly once — no stage can reach the -1 fallback", () => {
    const order = companyDealsTesting.STAGE_ORDER;
    expect([...order].sort()).toEqual([...DEAL_STAGES].sort());
    expect(new Set(order).size).toBe(order.length);
    for (const stage of DEAL_STAGES) {
      expect(companyDealsTesting.stageRank(stage), stage).toBeLessThan(order.length);
    }
  });

  it("an unknown stage sorts LAST, never as the most advanced deal", () => {
    const rank = companyDealsTesting.stageRank("not_a_stage" as DealStage);
    expect(rank).toBe(companyDealsTesting.STAGE_ORDER.length);
    expect(rank).toBeGreaterThan(companyDealsTesting.stageRank("paid"));
    expect(rank).toBeGreaterThan(companyDealsTesting.stageRank("lost"));
  });

  it("meeting_booked sits between contacted and meeting_held in the canonical list", () => {
    const at = (s: DealStage) => DEAL_STAGES.indexOf(s);
    expect(at(CONTACTED)).toBeLessThan(at(BOOKED));
    expect(at(BOOKED)).toBeLessThan(at(HELD));
  });

  it("meeting_booked sits between contacted and meeting_held in the scoring ladder", () => {
    expect(STAGE_LADDER[CONTACTED]).toBeLessThan(STAGE_LADDER[BOOKED]);
    expect(STAGE_LADDER[BOOKED]).toBeLessThan(STAGE_LADDER[HELD]);
  });

  it("meeting_booked sits between contacted and meeting_held on the company lead view", () => {
    // STAGE_ORDER is most-advanced-first, so the ranks run the other way.
    const rank = companyDealsTesting.stageRank;
    expect(rank(HELD)).toBeLessThan(rank(BOOKED));
    expect(rank(BOOKED)).toBeLessThan(rank(CONTACTED));
  });

  // Q46 R3 inc.4 — the rep board's move control writes through
  // `/api/admin/deals`, and its option list IS `REP_PIPELINE_STAGES` (the
  // board's own columns). That makes the ladder a SEVENTH hand-maintained
  // list, and the only one a rep can click. The two ways it goes wrong are
  // both silent on the screen where the money moves:
  //
  //  - a rep-board stage the PATCH parser refuses is a column a rep can
  //    select and never leave — the card snaps back with a 400 nobody
  //    caused; and
  //  - a rep-board stage missing from `STAGE_ORDER` would sort to the TOP of
  //    the company lead view for the same deal the board shows mid-ladder,
  //    the exact -1 defect above, one screen over.
  //
  // The rep board is deliberately a SUBSET (won/lost/stalled are counted off
  // the ladder, never shown), so this asserts containment, not equality —
  // an equality test would fail the moment the subset is doing its job.
  it("every stage the rep board offers is one the stage-write route accepts", () => {
    for (const stage of REP_PIPELINE_STAGES) {
      const parsed = parseDealStagePatch({ id: "d1", stage });
      expect(parsed.ok, `${stage} is offered on the rep board but refused by the route`).toBe(
        true
      );
    }
  });

  it("every rep-board stage is a known stage with a label and a rank — no card can reach a fallback", () => {
    expect(new Set(REP_PIPELINE_STAGES).size).toBe(REP_PIPELINE_STAGES.length);
    for (const stage of REP_PIPELINE_STAGES) {
      expect((DEAL_STAGES as readonly string[]).includes(stage), stage).toBe(true);
      expect(STAGE_LABELS[stage], stage).toBeTruthy();
      expect(companyDealsTesting.stageRank(stage), stage).toBeLessThan(
        companyDealsTesting.STAGE_ORDER.length
      );
    }
  });

  it("the rep board is a subset of the ladder, and a non-empty one", () => {
    // Non-vacuity: an empty list would pass both tests above while offering a
    // rep no way to move anything at all.
    expect(REP_PIPELINE_STAGES.length).toBeGreaterThan(1);
    expect(REP_PIPELINE_STAGES.length).toBeLessThanOrEqual(DEAL_STAGES.length);
  });
});
