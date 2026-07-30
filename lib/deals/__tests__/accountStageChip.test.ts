import { describe, expect, it } from "vitest";
import { accountStageChip, isRepMovableStage } from "../accountStageChip";
import { REP_PIPELINE_STAGES } from "../repPipelineBoard";
import { DEAL_STAGES } from "@/lib/crm";
import type { Deal, DealStage, Person } from "@/lib/types";

function deal(id: string, over: Partial<Deal> = {}): Deal {
  return {
    id,
    name: `Deal ${id}`,
    stage: "quote_sent",
    referralSourced: false,
    keyDates: {},
  } as Deal;
}

function withOverrides(id: string, over: Partial<Deal>): Deal {
  return { ...deal(id), ...over } as Deal;
}

function person(id: string, orgId?: string): Pick<Person, "id" | "orgId"> {
  return { id, orgId } as Pick<Person, "id" | "orgId">;
}

describe("accountStageChip", () => {
  it("returns no-deal when nothing is anchored to the person — never a derived stage", () => {
    const chip = accountStageChip(person("p1"), [
      withOverrides("d1", { personId: "p2" }),
    ]);
    expect(chip.kind).toBe("no-deal");
  });

  it("claims only the personId anchor and merely COUNTS the org's other deals", () => {
    const chip = accountStageChip(person("p1", "org-a"), [
      withOverrides("d1", { personId: "p1", orgId: "org-a" }),
      withOverrides("d2", { personId: "p2", orgId: "org-a" }),
      withOverrides("d3", { personId: "p3", orgId: "org-b" }),
    ]);
    expect(chip.kind).toBe("one");
    if (chip.kind !== "one") throw new Error("unreachable");
    expect(chip.deal.id).toBe("d1");
    // d2 shares the org but not the person: named, not adopted.
    expect(chip.orgOnlyCount).toBe(1);
  });

  it("an org-anchored deal alone is NOT promoted into a chip", () => {
    const chip = accountStageChip(person("p1", "org-a"), [
      withOverrides("d1", { orgId: "org-a" }),
    ]);
    expect(chip.kind).toBe("no-deal");
    if (chip.kind !== "no-deal") throw new Error("unreachable");
    expect(chip.orgOnlyCount).toBe(1);
  });

  it("two deals resolve to ambiguous with BOTH carried — never a silent first-match", () => {
    const chip = accountStageChip(person("p1"), [
      withOverrides("d1", { personId: "p1" }),
      withOverrides("d2", { personId: "p1", stage: "negotiating" }),
    ]);
    expect(chip.kind).toBe("ambiguous");
    if (chip.kind !== "ambiguous") throw new Error("unreachable");
    expect(chip.deals.map((d) => d.id)).toEqual(["d1", "d2"]);
  });

  it("offers exactly the rep board's open ladder for a movable stage", () => {
    const chip = accountStageChip(person("p1"), [
      withOverrides("d1", { personId: "p1", stage: "contacted" }),
    ]);
    if (chip.kind !== "one") throw new Error("expected one");
    expect(chip.movable).toBe(true);
    expect(chip.ladder).toEqual(REP_PIPELINE_STAGES);
    expect(chip.frozenReason).toBeUndefined();
  });

  // The money rule, asserted per stage rather than on one example: a closed or
  // outcome stage must be frozen here AND must offer no ladder at all, so a
  // client cannot render a select from an empty-but-truthy list.
  const FROZEN: DealStage[] = [
    "paid",
    "invoiced",
    "delivering",
    "stalled",
    "lost",
  ];
  it.each(FROZEN)("freezes %s and offers no stage to write", (stage) => {
    const chip = accountStageChip(person("p1"), [
      withOverrides("d1", { personId: "p1", stage }),
    ]);
    if (chip.kind !== "one") throw new Error("expected one");
    expect(chip.movable).toBe(false);
    expect(chip.ladder).toEqual([]);
    expect(chip.frozenReason).toBeTruthy();
  });

  // Non-vacuity: FROZEN and the ladder must together account for every stage
  // the CRM defines. A stage added tomorrow lands in neither list today, so
  // this fails rather than quietly defaulting to movable or to frozen.
  it("every DealStage is either on the rep ladder or explicitly frozen", () => {
    const covered = new Set<string>([...REP_PIPELINE_STAGES, ...FROZEN]);
    expect(DEAL_STAGES.filter((s) => !covered.has(s))).toEqual([]);
    expect(FROZEN.filter((s) => isRepMovableStage(s))).toEqual([]);
  });
});
