import { describe, expect, it } from "vitest";
import { REP_PIPELINE_STAGES, repPipelineBoard } from "../repPipelineBoard";
import { STAGE_AGING_DAYS, stageAgeOf, stageAgingItems } from "@/lib/tasks/todayRules";
import type { Activity, Deal, DealStage, Org, Person } from "@/lib/types";

const TODAY = "2026-07-28";
const REP = "Jake Torres (DEMO)";

function deal(id: string, over: Partial<Deal> = {}): Deal {
  return {
    id,
    name: `Deal ${id}`,
    stage: "quote_sent",
    referralSourced: false,
    keyDates: {},
    bookProtected: false,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-27T00:00:00Z",
    ...over,
  } as Deal;
}

function person(id: string, assignedRep?: string): Person {
  return { id, name: id, keyDates: {}, assignedRep } as unknown as Person;
}

function org(id: string, assignedRep?: string): Org {
  return { id, name: id, assignedRep } as unknown as Org;
}

const col = (b: ReturnType<typeof repPipelineBoard>, stage: DealStage) =>
  b.columns.find((c) => c.stage === stage)!;

describe("repPipelineBoard — ownership", () => {
  it("keeps the rep's deals and only COUNTS another rep's", () => {
    const board = repPipelineBoard(
      [deal("d1", { personId: "p1" }), deal("d2", { personId: "p2" })],
      REP,
      TODAY,
      { people: [person("p1", REP), person("p2", "Dana Reyes")] }
    );
    expect(col(board, "quote_sent").cards.map((c) => c.deal.id)).toEqual(["d1"]);
    expect(board.othersCount).toBe(1);
  });

  it("keeps unowned deals, flagged — not folded into mine, not dropped", () => {
    const board = repPipelineBoard([deal("d1", { personId: "p1" })], REP, TODAY, {
      people: [person("p1")],
    });
    const card = col(board, "quote_sent").cards[0];
    expect(card.mine).toBe(false);
    expect(board.unattributableCount).toBe(1);
    expect(board.othersCount).toBe(0);
  });

  it("matches the rep exactly — a 'Jakeline Ruiz' never lands on Jake's board", () => {
    const board = repPipelineBoard([deal("d1", { personId: "p1" })], "Jake Torres", TODAY, {
      people: [person("p1", "Jakeline Ruiz")],
    });
    expect(col(board, "quote_sent").cards).toEqual([]);
    expect(board.othersCount).toBe(1);
  });

  it("a blank rep name matches nothing rather than every unassigned row", () => {
    const board = repPipelineBoard([deal("d1", { personId: "p1" })], "  ", TODAY, {
      people: [person("p1", "Dana Reyes")],
    });
    expect(col(board, "quote_sent").cards).toEqual([]);
    expect(board.othersCount).toBe(1);
  });
});

describe("repPipelineBoard — tint", () => {
  it("over/within come from the SAME comparison stage_aging fires on", () => {
    const limit = STAGE_AGING_DAYS.quote_sent!;
    const at = deal("at", { personId: "p1", updatedAt: "2026-07-23T00:00:00Z" }); // 5d
    const under = deal("under", { personId: "p1", updatedAt: "2026-07-26T00:00:00Z" }); // 2d
    expect(stageAgeOf(at, TODAY)!.days).toBe(limit);

    const board = repPipelineBoard([at, under], REP, TODAY, { people: [person("p1", REP)] });
    const tints = Object.fromEntries(
      col(board, "quote_sent").cards.map((c) => [c.deal.id, c.tint])
    );
    expect(tints).toEqual({ at: "over", under: "within" });
    expect(col(board, "quote_sent").overCount).toBe(1);

    // and the engine agrees on the same row, by construction
    expect(stageAgingItems([at], TODAY).map((i) => i.dealId)).toEqual(["at"]);
    expect(stageAgingItems([under], TODAY)).toEqual([]);
  });

  it("a stage with no threshold is `untimed`, never `within` — an absent rule is not an all-clear", () => {
    const d = deal("d1", { personId: "p1", stage: "meeting_held" });
    expect(STAGE_AGING_DAYS.meeting_held).toBeUndefined();
    const board = repPipelineBoard([d], REP, TODAY, { people: [person("p1", REP)] });
    const card = col(board, "meeting_held").cards[0];
    expect(card.tint).toBe("untimed");
    expect(card.age).toBeUndefined();
    expect(col(board, "meeting_held").overCount).toBe(0);
  });

  it("meeting_booked tints off the meeting datetime when one is linked", () => {
    const d = deal("d1", {
      personId: "p1",
      stage: "meeting_booked",
      updatedAt: "2026-07-27T00:00:00Z", // 1d in stage — would be `within` alone
    });
    const meeting = {
      id: "a1",
      type: "meeting",
      dealId: "d1",
      occurredAt: "2026-07-24T15:00:00Z", // 4d ago, grace is 2
    } as unknown as Activity;
    const board = repPipelineBoard([d], REP, TODAY, {
      people: [person("p1", REP)],
      activities: [meeting],
    });
    const card = col(board, "meeting_booked").cards[0];
    expect(card.tint).toBe("over");
    expect(card.age).toMatchObject({ basis: "meeting", meetingOn: "2026-07-24", days: 4 });
  });
});

describe("repPipelineBoard — what the tint does NOT promise", () => {
  it("a demo deal can tint `over` while the Today band will never list it — and says so", () => {
    const d = deal("demo-d1", { personId: "p1", updatedAt: "2026-07-01T00:00:00Z" });
    const board = repPipelineBoard([d], REP, TODAY, { people: [person("p1", REP)] });
    const card = col(board, "quote_sent").cards[0];
    expect(card.tint).toBe("over");
    expect(card.surfacedInToday).toBe(false);
    // the divergence is real, not hypothetical:
    expect(stageAgingItems([d], TODAY)).toEqual([]);
  });

  it("a non-demo aging deal is marked as reaching the engine", () => {
    const d = deal("d1", { personId: "p1", updatedAt: "2026-07-01T00:00:00Z" });
    const board = repPipelineBoard([d], REP, TODAY, { people: [person("p1", REP)] });
    expect(col(board, "quote_sent").cards[0].surfacedInToday).toBe(true);
    expect(stageAgingItems([d], TODAY).map((i) => i.dealId)).toEqual(["d1"]);
  });
});

describe("repPipelineBoard — columns", () => {
  it("closed/outcome stages are counted off-board, never silently dropped", () => {
    const board = repPipelineBoard(
      [
        deal("d1", { personId: "p1", stage: "paid" }),
        deal("d2", { personId: "p1", stage: "lost" }),
        deal("d3", { personId: "p1", stage: "quote_sent" }),
      ],
      REP,
      TODAY,
      { people: [person("p1", REP)] }
    );
    expect(board.offBoardCount).toBe(2);
    expect(board.columns.flatMap((c) => c.cards).map((c) => c.deal.id)).toEqual(["d3"]);
  });

  it("column totals report how many values are unknown, so a sum is never read as complete", () => {
    const board = repPipelineBoard(
      [
        deal("d1", { personId: "p1", value: 2000 }),
        deal("d2", { personId: "p1" }),
      ],
      REP,
      TODAY,
      { people: [person("p1", REP)] }
    );
    expect(col(board, "quote_sent").value).toBe(2000);
    expect(col(board, "quote_sent").valueUnknownCount).toBe(1);
  });

  it("orders oldest-in-stage first, untimed last, then by id — deterministic", () => {
    const board = repPipelineBoard(
      [
        deal("b", { personId: "p1", stage: "contacted", updatedAt: "2026-07-26T00:00:00Z" }),
        deal("a", { personId: "p1", stage: "contacted", updatedAt: "2026-07-10T00:00:00Z" }),
      ],
      REP,
      TODAY,
      { people: [person("p1", REP)] }
    );
    expect(col(board, "contacted").cards.map((c) => c.deal.id)).toEqual(["a", "b"]);
  });

  it("every column exists even when empty, in ladder order", () => {
    const board = repPipelineBoard([], REP, TODAY);
    expect(board.columns.map((c) => c.stage)).toEqual([...REP_PIPELINE_STAGES]);
  });

  it("person assignment wins over the org's, and an unowned person does not fall through", () => {
    const board = repPipelineBoard(
      [
        deal("d1", { personId: "p1", orgId: "o1" }), // person says Dana
        deal("d2", { personId: "p2", orgId: "o1" }), // person exists, no rep → unowned
        deal("d3", { orgId: "o1" }), // org only → Jake
      ],
      REP,
      TODAY,
      { people: [person("p1", "Dana Reyes"), person("p2")], orgs: [org("o1", REP)] }
    );
    const ids = col(board, "quote_sent").cards.map((c) => c.deal.id);
    expect(ids.sort()).toEqual(["d2", "d3"]);
    expect(board.othersCount).toBe(1);
    expect(board.unattributableCount).toBe(1);
  });
});
