import { describe, expect, it } from "vitest";
import {
  callEvidence,
  callEvidenceLog,
  evidenceCountsFromActivities,
} from "@/lib/calls/callEvidence";
import type { Activity } from "@/lib/types";

const call = (id: string, over: Partial<Activity> = {}): Activity => ({
  id,
  personId: "p1",
  type: "call",
  source: "dialer",
  sourceContext: { recordingSid: id },
  bookProtected: false,
  occurredAt: "2026-07-28T10:00:00.000Z",
  createdAt: "2026-07-28T10:00:00.000Z",
  ...over,
});

const counts = (filed: number, transcribed: number, summarised: number) => ({
  filed,
  transcribed,
  summarised,
});

describe("callEvidence — has a real call ever run", () => {
  it("reports the FURTHEST call, never the average", () => {
    // One summarised call proves the chain end to end. A ratio would call a working chain
    // broken because most of its history predates the key that fixed it.
    expect(callEvidence(counts(50, 3, 1)).reach).toBe("summary");
    expect(callEvidence(counts(50, 3, 1)).proven).toBe(true);
  });

  it("climbs one rung at a time and stops where the evidence stops", () => {
    expect(callEvidence(counts(0, 0, 0)).reach).toBe("none");
    expect(callEvidence(counts(4, 0, 0)).reach).toBe("timeline");
    expect(callEvidence(counts(4, 2, 0)).reach).toBe("words");
    expect(callEvidence(counts(4, 2, 2)).reach).toBe("summary");
  });

  it("proves NOTHING short of the DoD's shape — filed and transcribed are not proof", () => {
    expect(callEvidence(counts(9, 9, 0)).proven).toBe(false);
    expect(callEvidence(counts(9, 0, 0)).proven).toBe(false);
    expect(callEvidence(counts(0, 0, 0)).proven).toBe(false);
  });

  it("never diagnoses an empty system — zero filed says nothing about why", () => {
    // A 503ing webhook and a dashboard nobody has dialled produce the same zero. Only the
    // env report can tell them apart, and guessing here sends an operator hunting a key
    // that is already set.
    const e = callEvidence(counts(0, 0, 0));
    expect(e.headline).toContain("says nothing about why");
    expect(e.contradictions).toEqual([]);
  });

  it("refuses proof when the counts contradict themselves", () => {
    // A summary with no words behind it is the fabricated-summary shape the feature
    // exists to refuse. Counts cannot say WHICH one it is, so the claim is withheld
    // entirely rather than granted to the ones that might be real.
    const e = callEvidence(counts(3, 1, 2));
    expect(e.proven).toBe(false);
    expect(e.contradictions).toHaveLength(1);
    expect(e.contradictions[0]).toContain("no words behind it");
  });

  it("reports contradictions instead of clamping them to a legal number", () => {
    const e = callEvidence(counts(1, 4, 4));
    expect(e.counts).toEqual(counts(1, 4, 4));
    expect(e.contradictions[0]).toContain("not on the timeline");
  });

  it("treats a negative or fractional count as a broken read, not a small number", () => {
    // Left to flow through, `filed: -1` compares as "fewer than transcribed" and produces
    // a contradiction sentence about the wrong pair.
    const e = callEvidence(counts(-1, 0, 0));
    expect(e.contradictions[0]).toContain("filed is not a count");
    expect(callEvidence(counts(2.5, 0, 0)).contradictions).toHaveLength(1);
  });

  it("still reaches `summary` under contradiction — reach and proof are different claims", () => {
    // Reach describes what the rows say; proof is what we are willing to assert from them.
    const e = callEvidence(counts(3, 1, 2));
    expect(e.reach).toBe("summary");
    expect(e.proven).toBe(false);
  });
});

describe("evidenceCountsFromActivities", () => {
  it("counts dialer CALLS only — other sources and types are not this feature's evidence", () => {
    const activities = [
      call("dialer-A"),
      call("email-1", { source: "gmail", type: "email" }),
      call("note-1", { source: "manual", type: "note" }),
      call("vapi-1", { source: "vapi" }),
    ];
    expect(evidenceCountsFromActivities(activities, new Set()).filed).toBe(1);
  });

  it("takes transcripts from the 0021 id set, never from `transcriptUrl`", () => {
    // `transcriptUrl` is the legacy field; a call transcribed into 0021 carries none, so
    // trusting it reports every real transcript as missing.
    const activities = [call("dialer-A"), call("dialer-B")];
    expect(
      evidenceCountsFromActivities(activities, new Set(["dialer-A"])).transcribed,
    ).toBe(1);
    expect(evidenceCountsFromActivities(activities, new Set()).transcribed).toBe(0);
  });

  it("does not count a summary of whitespace as a summary", () => {
    // The shape a half-written patch leaves behind. An empty-string guard alone lets a
    // single space tick the DoD.
    const activities = [
      call("dialer-A", { summary: "   " }),
      call("dialer-B", { summary: "" }),
      call("dialer-C", { summary: "Talked pricing; wants a quote Friday." }),
    ];
    expect(evidenceCountsFromActivities(activities, new Set()).summarised).toBe(1);
  });

  it("ignores transcripts belonging to activities that are not filed calls", () => {
    const activities = [call("email-1", { source: "gmail", type: "email" })];
    const c = evidenceCountsFromActivities(activities, new Set(["email-1"]));
    expect(c).toEqual(counts(0, 0, 0));
  });
});

describe("callEvidenceLog", () => {
  it("carries counts and states only — no prose can reach a log line", () => {
    const activities = [
      call("dialer-A", { summary: "Customer said their roof leaks over the garage." }),
    ];
    const log = callEvidenceLog(
      callEvidence(evidenceCountsFromActivities(activities, new Set(["dialer-A"]))),
    );
    expect(JSON.stringify(log)).not.toContain("roof");
    expect(log).toEqual({
      evt: "calls.evidence",
      reach: "summary",
      proven: true,
      filed: 1,
      transcribed: 1,
      summarised: 1,
      contradictions: 0,
    });
  });
});
