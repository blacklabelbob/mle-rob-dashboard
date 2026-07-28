import { describe, expect, it } from "vitest";
import { aimForNext, aimForNextFor, AIM_FOR_NEXT_TITLE, type AutomationPick } from "@/lib/phases/aimForNext";
import { refundStatus } from "@/lib/phases/refund";

const ASOF = "2026-07-28";
const PICK = (id: string): AutomationPick => ({ id, label: `Automation ${id}` });

const delivering = {
  phase1LiveCount: 3,
  phase1TotalCount: 7,
  phase2Attribution: "none" as const,
  asOf: ASOF,
};

describe("aimForNext — when the slot is allowed to appear at all", () => {
  it("hides once Phase 2 paper is recorded — the picks are settled, not open", () => {
    const r = aimForNext({
      ...delivering,
      phase2Attribution: "stored",
      growthScanLiveAt: "2026-07-20",
      recommendations: [PICK("a")],
    });
    expect(r.state).toBe("HIDDEN");
    expect(r.visible).toBe(false);
    expect(r.picks).toEqual([]);
  });

  it("hides before any Phase 1 component is live — no upsell ahead of delivery", () => {
    const r = aimForNext({ ...delivering, phase1LiveCount: 0 });
    expect(r.state).toBe("HIDDEN");
    expect(r.visible).toBe(false);
  });

  it("hides on an unscoped board (no components at all), never treats it as delivered", () => {
    const r = aimForNext({ ...delivering, phase1LiveCount: 0, phase1TotalCount: 0 });
    expect(r.state).toBe("HIDDEN");
  });

  it("appears once delivery is under way", () => {
    const r = aimForNext(delivering);
    expect(r.visible).toBe(true);
    expect(r.title).toBe(AIM_FOR_NEXT_TITLE);
  });
});

describe("aimForNext — nothing is recommended that was not picked", () => {
  it("says the scan is what fills it, rather than showing a generic list", () => {
    const r = aimForNext(delivering);
    expect(r.state).toBe("NO_SCAN_YET");
    expect(r.picks).toEqual([]);
    expect(r.line).toMatch(/Growth Scan/i);
  });

  it("distinguishes 'no scan' from 'scan done, nobody has picked yet'", () => {
    const r = aimForNext({ ...delivering, growthScanLiveAt: "2026-07-20" });
    expect(r.state).toBe("SCAN_NO_PICKS");
    expect(r.picks).toEqual([]);
  });

  it("an empty recommendations array is not READY — it is still no picks", () => {
    const r = aimForNext({
      ...delivering,
      growthScanLiveAt: "2026-07-20",
      recommendations: [],
    });
    expect(r.state).toBe("SCAN_NO_PICKS");
  });

  it("shows real picks once they exist", () => {
    const r = aimForNext({
      ...delivering,
      growthScanLiveAt: "2026-07-20",
      recommendations: [PICK("a"), PICK("b")],
    });
    expect(r.state).toBe("READY");
    expect(r.picks.map((p) => p.id)).toEqual(["a", "b"]);
    expect(r.overflowNote).toBeUndefined();
  });
});

describe("aimForNext — no silent caps", () => {
  it("states the overflow when more picks exist than Phase 2 has slots", () => {
    const r = aimForNext({
      ...delivering,
      growthScanLiveAt: "2026-07-20",
      slotCount: 2,
      recommendations: [PICK("a"), PICK("b"), PICK("c"), PICK("d")],
    });
    expect(r.picks.map((p) => p.id)).toEqual(["a", "b"]);
    expect(r.overflowNote).toContain("2 more are not shown");
    expect(r.overflowNote).toContain("4 automations were recommended");
  });
});

describe("aimForNext — the refund window is never hidden behind the upsell", () => {
  it("carries the warning, with the FSM's own day count, while the window is ACTIVE", () => {
    const refund = refundStatus({ startedAt: "2026-07-20", asOf: ASOF });
    expect(refund.state).toBe("ACTIVE");
    const r = aimForNext({
      ...delivering,
      growthScanLiveAt: "2026-07-20",
      recommendations: [PICK("a")],
      refund,
    });
    expect(r.refundWarning).toContain(`${refund.daysLeft} day`);
    expect(r.refundWarning).toMatch(/voids the Phase 1 refund/i);
  });

  it("warns even when there is nothing to recommend yet — the window is the point", () => {
    const refund = refundStatus({ startedAt: "2026-07-27", asOf: ASOF });
    const r = aimForNext({ ...delivering, refund });
    expect(r.state).toBe("NO_SCAN_YET");
    expect(r.refundWarning).toBeDefined();
  });

  it("does not warn once the window has expired — a closed window is not a risk", () => {
    const refund = refundStatus({ startedAt: "2026-05-01", asOf: ASOF });
    expect(refund.state).toBe("EXPIRED");
    const r = aimForNext({ ...delivering, refund });
    expect(r.refundWarning).toBeUndefined();
  });

  it("does not warn when the window never started", () => {
    const r = aimForNext({ ...delivering, refund: refundStatus({ asOf: ASOF }) });
    expect(r.refundWarning).toBeUndefined();
  });

  it("says '1 day' singular on the last day of the window", () => {
    const refund = refundStatus({ startedAt: "2026-06-29", asOf: ASOF });
    const r = aimForNext({ ...delivering, refund });
    if (refund.daysLeft === 1) expect(r.refundWarning).toContain("1 day of");
    expect(r.refundWarning ?? "").not.toContain("1 days");
  });
});

describe("aimForNextFor — what each audience is handed", () => {
  const withWarning = aimForNext({
    ...delivering,
    growthScanLiveAt: "2026-07-20",
    recommendations: [PICK("a"), PICK("b")],
    refund: refundStatus({ startedAt: "2026-07-27", asOf: ASOF }),
  });

  it("gives the master view the object untouched — refund mechanics included", () => {
    expect(withWarning.refundWarning).toBeDefined();
    expect(aimForNextFor(withWarning, "master")).toEqual(withWarning);
  });

  it("strips the refund warning for the rep — the key is absent, not empty", () => {
    const rep = aimForNextFor(withWarning, "rep");
    expect("refundWarning" in rep).toBe(false);
    expect(rep.refundWarning).toBeUndefined();
  });

  it("keeps everything a rep needs to sell — picks, copy, overflow, visibility", () => {
    const rep = aimForNextFor(withWarning, "rep");
    expect(rep.visible).toBe(true);
    expect(rep.title).toBe(AIM_FOR_NEXT_TITLE);
    expect(rep.line).toBe(withWarning.line);
    expect(rep.picks).toEqual(withWarning.picks);
    expect(rep.state).toBe(withWarning.state);
  });

  it("never resurrects a hidden slot for either audience", () => {
    const hidden = aimForNext({ ...delivering, phase2Attribution: "stored" });
    expect(aimForNextFor(hidden, "rep").visible).toBe(false);
    expect(aimForNextFor(hidden, "master").visible).toBe(false);
  });

  it("does not mutate the shared object a rep and the master view both read", () => {
    const before = JSON.stringify(withWarning);
    aimForNextFor(withWarning, "rep");
    expect(JSON.stringify(withWarning)).toBe(before);
  });
});
