import { describe, it, expect } from "vitest";
import {
  dismissedNote,
  mergedNote,
  autoResolvedNote,
  dedupClosedBy,
  dedupReopenable,
} from "@/lib/dedup/resolutionNote";

// Q84 inc.47 — the three dedup_review close-note grammars, in one module.

describe("the writers (byte-identical to the literals they replaced)", () => {
  // These three pins are the whole safety argument for this increment: the
  // strings are unchanged, so every already-closed row still reads the same and
  // no deploy is required. Change one and this file says so out loud.
  it("dismiss writes what DedupQueue's JSX literal wrote", () => {
    expect(dismissedNote()).toBe("reviewed: not a duplicate");
  });

  it("merge writes what merge.ts's template wrote", () => {
    expect(mergedNote("P-1042", "P-1018")).toBe("merged: P-1042 → P-1018");
  });

  it("auto-resolve writes what detector.ts's literal wrote", () => {
    expect(autoResolvedNote()).toBe("auto: signals no longer present in source records");
  });

  it("merge names duplicate → survivor in that order, not the reverse", () => {
    // The arrow is a direction, and reading it backwards names the row that was
    // DELETED as the one that survived — the single worst thing this note can say.
    expect(mergedNote("dup", "surv")).toBe("merged: dup → surv");
    expect(mergedNote("dup", "surv")).not.toBe("merged: surv → dup");
  });
});

describe("dedupClosedBy — who closed this pair", () => {
  it("an open pair is not closed by anyone", () => {
    expect(dedupClosedBy("open", null)).toBeNull();
    expect(dedupClosedBy("open", "leftover text")).toBeNull();
  });

  it("reads the reviewer off the status, not off the note", () => {
    expect(dedupClosedBy("dismissed", dismissedNote())).toBe("reviewer");
    // A dismissal whose note was edited, blanked, or never written is STILL Rob's.
    // Status is the column the database enforces; the note is prose.
    expect(dedupClosedBy("dismissed", null)).toBe("reviewer");
    expect(dedupClosedBy("dismissed", "anything at all")).toBe("reviewer");
  });

  it("splits the two machine closes by their own writers' wording", () => {
    expect(dedupClosedBy("resolved", mergedNote("P-2", "P-1"))).toBe("merge");
    expect(dedupClosedBy("resolved", autoResolvedNote())).toBe("detector");
  });

  it("defaults an unrecognised `resolved` note to the unattended path", () => {
    // Not "merge": guessing merge would tell a reader the duplicate row is gone
    // when it may still be there. Detector is the claim that costs nothing if wrong.
    expect(dedupClosedBy("resolved", "hand-edited in the SQL console")).toBe("detector");
    expect(dedupClosedBy("resolved", null)).toBe("detector");
    expect(dedupClosedBy("resolved", "   ")).toBe("detector");
  });

  it("treats an unknown or missing status as not closed", () => {
    expect(dedupClosedBy(undefined, "merged: a → b")).toBeNull();
    expect(dedupClosedBy(null, null)).toBeNull();
    expect(dedupClosedBy("archived", "merged: a → b")).toBeNull();
  });

  it("does not mistake a note that merely mentions a merge for a merge close", () => {
    // Anchored at the start, inc.10's rule: a loose search would reclassify a
    // reviewer's sentence about a merge as the merge itself.
    expect(dedupClosedBy("resolved", "not merged: these are brothers")).toBe("detector");
  });
});

describe("dedupReopenable — which closes a reviewer may undo", () => {
  it("offers reopen only on the detector's unattended close", () => {
    expect(dedupReopenable("resolved", autoResolvedNote())).toBe(true);
  });

  it("never offers to reopen Rob's own dismissal", () => {
    expect(dedupReopenable("dismissed", dismissedNote())).toBe(false);
  });

  it("never offers to reopen a merge — the duplicate row is already deleted", () => {
    expect(dedupReopenable("resolved", mergedNote("P-2", "P-1"))).toBe(false);
  });

  it("offers nothing on a pair that is still open", () => {
    expect(dedupReopenable("open", null)).toBe(false);
  });
});
