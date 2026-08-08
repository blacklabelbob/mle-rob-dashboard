import { describe, it, expect } from "vitest";
import {
  deepDiveDecision,
  deepDiveWorklist,
  isReferralTarget,
  backgroundChars,
  type DeepDiveOrg,
} from "../deepDiveDue";

/**
 * The gate string is the one the 2026-08-05 Q87 run actually wrote onto C-2020…C-2023, copied
 * here verbatim so a test cannot pass against a phrasing prod does not use.
 */
const REAL_GATE =
  "REFERRAL TARGET — NOT MET, NOT CONTACTED, NOT OWNED BY OMEGA. Named by Scott Dascani (P-1023) during the 7/28 Omega meeting; gated on Omega going well.";

const target = (over: Partial<DeepDiveOrg> = {}): DeepDiveOrg => ({
  id: "C-2021",
  name: "Monarch National Insurance Company",
  nodeType: "lead",
  relationship: REAL_GATE,
  description: "x".repeat(1051),
  notes: "y".repeat(265),
  keyDates: {},
  ...over,
});

describe("isReferralTarget", () => {
  it("reads the gate the record actually carries", () => {
    expect(isReferralTarget(target())).toBe(true);
  });

  it("does NOT treat a plain unlit lead as a referral target", () => {
    // lead/unlit is also what cold outbound looks like; only the written gate counts.
    expect(isReferralTarget(target({ relationship: "cold outbound, found on the county list" }))).toBe(false);
  });

  it("drops a target the moment it has been met", () => {
    expect(isReferralTarget(target({ keyDates: { met: "2026-07-31" } }))).toBe(false);
  });

  it("drops a target that became a client", () => {
    expect(isReferralTarget(target({ nodeType: "client" }))).toBe(false);
  });
});

describe("deepDiveDecision", () => {
  it("THE FINDING: background with no recorded run is due-unattributed, never covered", () => {
    const d = deepDiveDecision(target());
    expect(d.verdict).toBe("due-unattributed");
    expect(d.backgroundChars).toBe(1051 + 265);
    expect(d.because).toContain("no recorded deep-dive run");
  });

  it("an empty target is due-no-background — a different job from a merge", () => {
    const d = deepDiveDecision(target({ description: "", notes: null }));
    expect(d.verdict).toBe("due-no-background");
    expect(d.backgroundChars).toBe(0);
  });

  it("a recorded run with no as-of day is unknown-freshness, never a cheerful covered", () => {
    const d = deepDiveDecision(target(), {
      runs: [{ orgId: "C-2021", ranAt: "2026-08-01", producedBy: "lead-enricher" }],
    });
    expect(d.verdict).toBe("unknown-freshness");
    expect(d.lastRun?.producedBy).toBe("lead-enricher");
  });

  it("a fresh run is covered; the same run past the window is due-stale", () => {
    const runs = [{ orgId: "C-2021", ranAt: "2026-05-01", producedBy: "lead-enricher" }];
    expect(deepDiveDecision(target(), { runs, asOf: "2026-08-08", freshDays: 180 }).verdict).toBe("covered");
    expect(deepDiveDecision(target(), { runs, asOf: "2026-08-08", freshDays: 30 }).verdict).toBe("due-stale");
  });

  it("a run with no producer is not a run", () => {
    const d = deepDiveDecision(target(), {
      runs: [{ orgId: "C-2021", ranAt: "2026-08-01", producedBy: "" }],
      asOf: "2026-08-08",
    });
    expect(d.verdict).toBe("due-unattributed");
  });

  it("a run recorded against a DIFFERENT org never credits this one", () => {
    const d = deepDiveDecision(target(), {
      runs: [{ orgId: "C-2099", ranAt: "2026-08-07", producedBy: "lead-enricher" }],
      asOf: "2026-08-08",
    });
    expect(d.verdict).toBe("due-unattributed");
  });

  it("the newest run wins when several are recorded", () => {
    const d = deepDiveDecision(target(), {
      runs: [
        { orgId: "C-2021", ranAt: "2026-01-02", producedBy: "old" },
        { orgId: "C-2021", ranAt: "2026-08-05", producedBy: "lead-enricher" },
      ],
      asOf: "2026-08-08",
      freshDays: 30,
    });
    expect(d.verdict).toBe("covered");
    expect(d.lastRun?.ranAt).toBe("2026-08-05");
  });
});

describe("deepDiveWorklist", () => {
  it("counts every verdict and orders the due list emptiest-first", () => {
    const w = deepDiveWorklist([
      target({ id: "C-2020", name: "Hale", description: "x".repeat(1288) }),
      target({ id: "C-2024", name: "Empty", description: "", notes: "" }),
      target({ id: "C-2005", name: "Martin Fierro", relationship: "the family's Naples restaurant" }),
    ]);
    expect(w.counts["due-unattributed"]).toBe(1);
    expect(w.counts["due-no-background"]).toBe(1);
    expect(w.counts["not-a-target"]).toBe(1);
    expect(w.due.map((d) => d.orgId)).toEqual(["C-2024", "C-2020"]);
  });

  it("backgroundChars ignores non-strings rather than throwing on a null column", () => {
    expect(backgroundChars({ id: "C-1", name: "n", description: null, notes: undefined })).toBe(0);
  });
});
