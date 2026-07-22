import { describe, expect, it } from "vitest";
import {
  lastTouchDate,
  repMoney,
  sourceContext,
  stageRank,
  toRepAccountListItem,
  touchReason,
  type TimelineEntry,
} from "../repSource";
import type { Person } from "../types";

// Critic Rob gate 2026-07-22 punch #6: stageRank/touchReason/sourceContext/
// lastTouchDate had zero unit tests while every sibling lib module does —
// ranking logic in code but unproven (scoring-pattern rule: ladders live in
// unit-tested modules).

const person = (over: Partial<Person>): Person => ({
  id: "x", name: "X", verticalId: "v", status: "unlit", signed: false,
  keyDates: {}, phaseOne: "not-started", ...over,
});

describe("touchReason", () => {
  it("paid is the apex — beats quote-out, warm, and signed (punch #2)", () => {
    const paidButUnsigned = touchReason(
      person({ quotedAmount: 12000, signed: false, status: "warm", keyDates: { paid: "2026-07-10" } })
    );
    expect(paidButUnsigned.label).toBe("client — paid");
    const paidAndSigned = touchReason(
      person({ quotedAmount: 12000, signed: true, keyDates: { signed: "2026-07-02", paid: "2026-07-10" } })
    );
    expect(paidAndSigned.label).toBe("client — paid");
  });

  it("quote out and unsigned — follow up", () => {
    expect(touchReason(person({ quotedAmount: 9500, signed: false })).label).toBe("quote out — follow up");
  });

  it("warm with no quote yet", () => {
    expect(touchReason(person({ status: "warm" })).label).toBe("warm — keep momentum");
  });

  it("signed but not paid — signed, not collected", () => {
    expect(touchReason(person({ signed: true, keyDates: { signed: "2026-07-02" } })).label).toBe("signed — client");
  });

  it("brand new — first touch", () => {
    expect(touchReason(person({})).label).toBe("new — first touch");
  });
});

describe("stageRank", () => {
  it("quote-out unsigned ranks highest (0)", () => {
    expect(stageRank(person({ quotedAmount: 9500, signed: false }))).toBe(0);
  });
  it("warm ranks 1", () => {
    expect(stageRank(person({ status: "warm" }))).toBe(1);
  });
  it("brand new ranks 2", () => {
    expect(stageRank(person({}))).toBe(2);
  });
  it("signed and paid both rank 3 (lowest urgency — already closed)", () => {
    expect(stageRank(person({ signed: true, keyDates: { signed: "2026-07-02" } }))).toBe(3);
    expect(stageRank(person({ signed: true, keyDates: { signed: "2026-07-02", paid: "2026-07-10" } }))).toBe(3);
  });
});

describe("sourceContext", () => {
  it("parses SOURCE: <source>. <detail>", () => {
    const ctx = sourceContext(
      person({ description: "SOURCE: Referral — Polk crew chief. His foreman worked a storm job." })
    );
    expect(ctx.source).toBe("Referral — Polk crew chief");
    expect(ctx.detail).toBe("His foreman worked a storm job.");
  });

  it("falls back to relationship when description has no SOURCE block", () => {
    const ctx = sourceContext(person({ description: "just some notes", relationship: "his rep" }));
    expect(ctx.source).toBe("his rep");
    expect(ctx.detail).toBe("just some notes");
  });

  it("falls back to 'unknown' with no description or relationship", () => {
    expect(sourceContext(person({})).source).toBe("unknown");
  });
});

describe("repMoney — rep-surface money truth (punch #1)", () => {
  it("shows sub-$100k exact, never money()'s whole-k rounding", () => {
    expect(repMoney(9500)).toBe("$9,500");
    expect(repMoney(27500)).toBe("$27,500"); // the exact Marcus($18,000) + Sandra($9,500) pipeline
  });
  it("still exact into six figures", () => {
    expect(repMoney(150000)).toBe("$150,000");
  });
  it("defers to money()'s M formatting at 7 figures", () => {
    expect(repMoney(1_200_000)).toBe("$1.2M");
  });
});

describe("lastTouchDate — max(keyDates, demo timeline) (punch #8)", () => {
  it("real record: keyDates only, no demo entries passed", () => {
    expect(lastTouchDate({ signed: "2026-07-02", paid: "2026-07-10" })).toBe("2026-07-10");
  });
  it("null when nothing is set", () => {
    expect(lastTouchDate({})).toBeNull();
  });
  it("DEMO record: a later demo-timeline entry beats keyDates (the Rita case — 7/11 kickoff call beats 7/10 paid)", () => {
    const demoEntries: TimelineEntry[] = [
      { type: "signed", summary: "Signed", when: "2026-07-02" },
      { type: "payment", summary: "Paid", when: "2026-07-10" },
      { type: "call", summary: "Kickoff call", when: "2026-07-11" },
    ];
    expect(lastTouchDate({ signed: "2026-07-02", paid: "2026-07-10" }, demoEntries)).toBe("2026-07-11");
  });
  it("keyDates can beat an earlier demo timeline", () => {
    expect(lastTouchDate({ paid: "2026-07-20" }, [{ type: "note", summary: "n", when: "2026-07-05" }])).toBe(
      "2026-07-20"
    );
  });
});

describe("toRepAccountListItem — the DTO never carries admin fields", () => {
  it("excludes notes/description/estimate/assignedRep while keeping what the list renders", () => {
    const p = person({
      quotedAmount: 9500,
      relationship: "call Thu",
      description: "SOURCE: Website intake form. Filled 9:40pm Sunday.",
      notes: "FABRICATED DEMO RECORD — internal only",
      estimate: { estRevenue: 50000, estNewNodes: 1, probability: 0.4, reasoning: "x", source: "heuristic", estimatedAt: "2026-07-01" },
    });
    const dto = toRepAccountListItem(p);
    expect(dto).not.toHaveProperty("notes");
    expect(dto).not.toHaveProperty("estimate");
    expect(dto).not.toHaveProperty("description");
    expect(dto.source).toBe("Website intake form");
    expect(dto.sourceDetail).toBe("Filled 9:40pm Sunday.");
    expect(dto.relationship).toBe("call Thu");
    expect(dto.quotedAmount).toBe(9500);
  });
});
