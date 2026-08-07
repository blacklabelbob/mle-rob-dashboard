import { describe, it, expect } from "vitest";
import { driftBadge } from "../statusBadge";
import { statusDrift } from "../networkStatus";
import type { StatusDrift } from "../networkStatus";

function drift(record: Parameters<typeof statusDrift>[0], members: Parameters<typeof statusDrift>[1] = []): StatusDrift {
  const d = statusDrift(record, members);
  if (!d) throw new Error("fixture does not drift — the test needs one that does");
  return d;
}

describe("driftBadge — understated speaks, overstated only invites", () => {
  it("names the justified status in the indicative when the record proves it", () => {
    // On Time Moving: stored unlit, carries a $7,000 quote (Rob, dev_chat #60).
    const b = driftBadge(drift({ status: "unlit", quotedAmount: 7000 }));
    expect(b.tone).toBe("correctable");
    expect(b.headline).toBe("Should be warm");
    expect(b.detail).toBe("Stored as unlit — quoted $7,000.");
  });

  it("never calls an overstated record wrong, and says why it might not be", () => {
    // Gulf Coast: stored lit, no column records the referral that justifies it (#62).
    const b = driftBadge(drift({ status: "lit" }));
    expect(b.tone).toBe("review");
    expect(b.headline).toBe("Worth a look");
    expect(b.detail).toContain("Not necessarily wrong");
    expect(b.detail.toLowerCase()).not.toContain("should be");
    expect(b.detail.toLowerCase()).not.toContain("error");
  });

  it("counts the evidence rather than summarising it, singular included", () => {
    expect(driftBadge(drift({ status: "unlit", quotedAmount: 7000 })).evidenceLabel).toBe(
      "1 fact on the record",
    );
    expect(
      driftBadge(drift({ status: "unlit", signed: true, keyDates: { met: "2026-07-28" } }))
        .evidenceLabel,
    ).toBe("2 facts on the record");
    // An overstated record can carry nothing at all — the count must survive that.
    expect(driftBadge(drift({ status: "lit" })).evidenceLabel).toBe("0 facts on the record");
  });

  it("reports the org rung with the member's own date, not a summary", () => {
    // Omega Title: org row unlit, a person there was met (#58).
    const b = driftBadge(
      drift({ status: "unlit" }, [{ status: "warm", keyDates: { met: "2026-07-28" } }]),
    );
    expect(b.headline).toBe("Should be warm");
    // Both `reason` shapes have to read as English. A bare fact ("quoted $7,000") and
    // a clause ("a person here was met …") went through one template, and the first
    // wording only worked for the bare fact — it shipped to prod reading "this record
    // is a person here was met 2026-07-28". Asserted whole, not with toContain.
    expect(b.detail).toBe("Stored as unlit — a person here was met 2026-07-28.");
  });
});
