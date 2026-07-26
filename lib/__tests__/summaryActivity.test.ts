import { describe, expect, it } from "vitest";
import {
  applyCallSummary,
  callSummaryPatch,
  patchFromParse,
} from "@/lib/calls/summaryActivity";
import type { CallSummary } from "@/lib/calls/callSummary";
import { fromActivity } from "@/lib/crm";
import type { Activity } from "@/lib/types";

// BUILD-QUEUE Q68 (c) inc.11 — the summary lands on the row a rep reads. What is tested
// here is the SHAPE of that write: what it sets, what it must never touch, and which
// absences would collapse two states a reader needs to tell apart.

const ACTIVITY: Activity = {
  id: "dialer-RE123",
  personId: "p-1",
  type: "call",
  source: "dialer",
  sourceContext: {
    callSid: "CA1",
    recordingSid: "RE123",
    direction: "outbound",
    matchedOn: "to",
    durationSec: 412,
  },
  recordingUrl: "https://api.twilio.com/RE123",
  bookProtected: false,
  occurredAt: "2026-07-26T18:00:00.000Z",
  createdAt: "2026-07-26T18:00:05.000Z",
};

const SUMMARY: CallSummary = {
  summary: "  Walked the owner through the estimate; he wants it Monday.  ",
  actionItems: ["Send the agreement Monday"],
  buyingSignals: [{ label: "timeline stated", quote: "send it Monday" }],
  truncated: false,
};

describe("callSummaryPatch", () => {
  it("sets the three 0005 columns and trims the summary", () => {
    const patch = callSummaryPatch(ACTIVITY, SUMMARY)!;
    expect(patch.summary).toBe("Walked the owner through the estimate; he wants it Monday.");
    expect(patch.actionItems).toEqual(["Send the agreement Monday"]);
    expect(patch.buyingSignals).toEqual([{ label: "timeline stated", quote: "send it Monday" }]);
  });

  it("writes EMPTY arrays explicitly — an absent column already means 'never summarised'", () => {
    const patch = callSummaryPatch(ACTIVITY, {
      ...SUMMARY,
      actionItems: [],
      buyingSignals: [],
    })!;
    expect(patch.actionItems).toEqual([]);
    expect(patch.buyingSignals).toEqual([]);
    // The distinction is only real once it survives the row mapper, which turns
    // `undefined` into SQL null. [] must NOT become null.
    const row = fromActivity(applyCallSummary(ACTIVITY, patch));
    expect(row.action_items).toEqual([]);
    expect(row.buying_signals).toEqual([]);
    expect(fromActivity(ACTIVITY).action_items).toBeNull();
  });

  it("discloses truncation in sourceContext, never inside the summary text", () => {
    const patch = callSummaryPatch(ACTIVITY, { ...SUMMARY, truncated: true })!;
    expect(patch.sourceContext.summaryTruncated).toBe(true);
    expect(patch.summary).not.toMatch(/truncat|elided|partial/i);
  });

  it("writes summaryTruncated: false explicitly rather than omitting it", () => {
    const patch = callSummaryPatch(ACTIVITY, SUMMARY)!;
    expect(patch.sourceContext).toHaveProperty("summaryTruncated", false);
  });

  it("MERGES sourceContext — the match provenance is the only record of whose call this is", () => {
    const patch = callSummaryPatch(ACTIVITY, SUMMARY)!;
    expect(patch.sourceContext).toMatchObject({
      callSid: "CA1",
      recordingSid: "RE123",
      direction: "outbound",
      matchedOn: "to",
      durationSec: 412,
    });
  });

  it("tolerates an activity with no sourceContext", () => {
    const patch = callSummaryPatch({ sourceContext: undefined as never }, SUMMARY)!;
    expect(patch.sourceContext).toEqual({ summaryTruncated: false });
  });

  it("refuses a blank summary — a row that reads as summarised and says nothing", () => {
    expect(callSummaryPatch(ACTIVITY, { ...SUMMARY, summary: "   " })).toBeNull();
    expect(callSummaryPatch(ACTIVITY, { ...SUMMARY, summary: "" })).toBeNull();
  });

  it("copies the arrays so a later mutation cannot reach the stored patch", () => {
    const items = ["Send the agreement Monday"];
    const signals = [{ label: "timeline stated", quote: "send it Monday" }];
    const patch = callSummaryPatch(ACTIVITY, {
      ...SUMMARY,
      actionItems: items,
      buyingSignals: signals,
    })!;
    items.push("injected");
    signals[0].label = "rewritten";
    expect(patch.actionItems).toEqual(["Send the agreement Monday"]);
    expect(patch.buyingSignals).toEqual([{ label: "timeline stated", quote: "send it Monday" }]);
  });

  it("is deterministic", () => {
    expect(callSummaryPatch(ACTIVITY, SUMMARY)).toEqual(callSummaryPatch(ACTIVITY, SUMMARY));
  });
});

describe("patchFromParse", () => {
  it("passes an accepted parse through", () => {
    const patch = patchFromParse(ACTIVITY, { kind: "ok", value: SUMMARY });
    expect(patch?.summary).toContain("estimate");
  });

  it("a rejected parse yields NO patch — there is no partial summary", () => {
    expect(patchFromParse(ACTIVITY, { kind: "rejected", reason: "refusal" })).toBeNull();
  });
});

describe("applyCallSummary", () => {
  it("leaves identity, anchor, protection and timing fields untouched", () => {
    const patch = callSummaryPatch(ACTIVITY, SUMMARY)!;
    const next = applyCallSummary(ACTIVITY, patch);
    expect(next.id).toBe(ACTIVITY.id);
    expect(next.personId).toBe(ACTIVITY.personId);
    expect(next.orgId).toBeUndefined();
    expect(next.dealId).toBeUndefined();
    expect(next.type).toBe("call");
    expect(next.source).toBe("dialer");
    expect(next.recordingUrl).toBe(ACTIVITY.recordingUrl);
    expect(next.bookProtected).toBe(false);
    expect(next.occurredAt).toBe(ACTIVITY.occurredAt);
    expect(next.createdAt).toBe(ACTIVITY.createdAt);
  });

  it("does not mutate the activity it was handed", () => {
    const patch = callSummaryPatch(ACTIVITY, SUMMARY)!;
    applyCallSummary(ACTIVITY, patch);
    expect(ACTIVITY.summary).toBeUndefined();
    expect(ACTIVITY.sourceContext).not.toHaveProperty("summaryTruncated");
  });

  it("a book-protected activity keeps its protection flag", () => {
    const protectedActivity = { ...ACTIVITY, bookProtected: true };
    const patch = callSummaryPatch(protectedActivity, SUMMARY)!;
    expect(applyCallSummary(protectedActivity, patch).bookProtected).toBe(true);
  });

  it("the resulting row carries the summary through the mapper", () => {
    const patch = callSummaryPatch(ACTIVITY, { ...SUMMARY, truncated: true })!;
    const row = fromActivity(applyCallSummary(ACTIVITY, patch));
    expect(row.summary).toContain("estimate");
    expect(row.action_items).toEqual(["Send the agreement Monday"]);
    expect(row.buying_signals).toEqual([
      { label: "timeline stated", quote: "send it Monday" },
    ]);
    expect(row.source_context).toMatchObject({ recordingSid: "RE123", summaryTruncated: true });
  });
});
