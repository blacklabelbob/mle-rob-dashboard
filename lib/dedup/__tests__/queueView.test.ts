import { describe, expect, it } from "vitest";
import { partitionDedupQueue, detectorCloseSummary } from "@/lib/dedup/queueView";
import {
  autoResolvedNote,
  dedupReopenable,
  dismissedNote,
  mergedNote,
  reopenRefusal,
} from "@/lib/dedup/resolutionNote";

// Q84 inc.49 — the queue's two lists.
//
// The claim worth pinning is not "the function buckets rows" but that the
// buckets and the ENDPOINT agree: every row the UI offers a reopen on must be a
// row `reopenNoRefusal` lets through, and vice versa. Two ladders drifting apart
// is the defect inc.47 and inc.48 were each spent closing.

const OPEN = { pair_key: "p:open", status: "open", resolution_note: null };
const DISMISSED = { pair_key: "p:dismissed", status: "dismissed", resolution_note: dismissedNote() };
const MERGED = { pair_key: "p:merged", status: "resolved", resolution_note: mergedNote("b", "a") };
const AUTO = { pair_key: "p:auto", status: "resolved", resolution_note: autoResolvedNote() };

describe("partitionDedupQueue", () => {
  it("puts an open pair in the review list and offers no reopen", () => {
    const view = partitionDedupQueue([OPEN]);
    expect(view.open.map((r) => r.pair_key)).toEqual(["p:open"]);
    expect(view.reopenable).toEqual([]);
  });

  it("offers reopen ONLY on the detector's own close", () => {
    const view = partitionDedupQueue([OPEN, DISMISSED, MERGED, AUTO]);
    expect(view.reopenable.map((r) => r.pair_key)).toEqual(["p:auto"]);
  });

  it("draws Rob's dismissal and a completed merge in NEITHER list", () => {
    const view = partitionDedupQueue([DISMISSED, MERGED]);
    expect(view.open).toEqual([]);
    expect(view.reopenable).toEqual([]);
  });

  it("shows a row it cannot classify rather than hiding it", () => {
    const view = partitionDedupQueue([{ status: "archived", resolution_note: null }]);
    expect(view.open).toHaveLength(1);
    expect(view.reopenable).toEqual([]);
  });

  it("survives a missing payload and a row with no status field", () => {
    expect(partitionDedupQueue(null)).toEqual({ open: [], reopenable: [] });
    expect(partitionDedupQueue(undefined)).toEqual({ open: [], reopenable: [] });
    expect(partitionDedupQueue([{}]).open).toHaveLength(1);
  });

  it("preserves the order the API sorted the rows into", () => {
    const rows = [
      { pair_key: "a", status: "open", resolution_note: null },
      { pair_key: "b", status: "open", resolution_note: null },
      { pair_key: "c", status: "open", resolution_note: null },
    ];
    expect(partitionDedupQueue(rows).open.map((r) => r.pair_key)).toEqual(["a", "b", "c"]);
  });

  // The whole reason the bucket is derived from `dedupClosedBy` instead of its
  // own status compare: the button drawn and the write accepted are one rule.
  it("agrees with the UI predicate AND with what the endpoint will accept", () => {
    for (const row of [OPEN, DISMISSED, MERGED, AUTO]) {
      const drawn = partitionDedupQueue([row]).reopenable.length === 1;
      expect(drawn).toBe(dedupReopenable(row.status, row.resolution_note));
      if (drawn) expect(reopenRefusal(row.status, row.resolution_note)).toBeNull();
    }
  });
});

describe("detectorCloseSummary", () => {
  it("claims only what the detector observed — never that the pair was fixed", () => {
    const line = detectorCloseSummary();
    expect(line).toMatch(/signals/i);
    expect(line).not.toMatch(/fixed|resolved|not a duplicate|merged/i);
  });
});
