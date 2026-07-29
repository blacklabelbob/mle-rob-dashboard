import { describe, it, expect } from "vitest";
import { DEAL_STAGES } from "../crm";
import { DEAL_STAGES as FILTER_DEAL_STAGES } from "../filters/ast";
import { STAGE_LABELS } from "../labels";
import { STAGE_LADDER } from "../scoring/deal";
import { __testing as companyDealsTesting } from "../companyDeals";
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
});
