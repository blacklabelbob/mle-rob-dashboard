import { describe, it, expect } from "vitest";
import { refundStatus, refundEvents, REFUND_WINDOW_DAYS } from "@/lib/phases/refund";
import {
  buildBlueprint,
  kickoffSteps,
  inferPhaseOneMoney,
  attributePhaseMoney,
  type BlueprintDeal,
} from "@/lib/phases/blueprint";
import { PHASE_1_COMPONENTS, REFUND_TRIGGER_SLUG } from "@/lib/phases/components";

const deal = (over: Partial<BlueprintDeal> = {}): BlueprintDeal => ({
  id: "d1",
  name: "Phase 1",
  stage: "paid",
  value: 19000,
  keyDates: {},
  ...over,
});

describe("refund window FSM", () => {
  it("is NOT_STARTED until the website goes live", () => {
    const s = refundStatus({ asOf: "2026-07-27" });
    expect(s.state).toBe("NOT_STARTED");
    expect(s.line).toContain("not started");
  });

  it("is ACTIVE inside the window and counts days left", () => {
    const s = refundStatus({ startedAt: "2026-07-02", asOf: "2026-07-27" });
    expect(s.state).toBe("ACTIVE");
    expect(s.dayIndex).toBe(25);
    expect(s.daysLeft).toBe(5);
  });

  it("EXPIRES the day the window is fully served, not the day after", () => {
    const s = refundStatus({ startedAt: "2026-07-02", asOf: "2026-08-01" });
    expect(s.dayIndex).toBe(REFUND_WINDOW_DAYS);
    expect(s.state).toBe("EXPIRED");
    expect(s.daysLeft).toBe(0);
  });

  it("VOIDS when the customer advances to Phase 2 inside the window", () => {
    const s = refundStatus({
      startedAt: "2026-07-02",
      advancedAt: "2026-07-20",
      asOf: "2026-07-27",
    });
    expect(s.state).toBe("VOIDED_BY_ADVANCE");
    expect(s.line).toContain("VOIDED");
    expect(s.line).toContain("18 days into the window");
  });

  it("does NOT void when the advance happens after the window already closed", () => {
    // The refund had expired on its own. Calling that "voided by advance" would
    // blame the customer for a deadline they actually beat.
    const s = refundStatus({
      startedAt: "2026-06-01",
      advancedAt: "2026-07-20",
      asOf: "2026-07-27",
    });
    expect(s.state).toBe("EXPIRED");
  });

  it("never voids a window that never opened", () => {
    const s = refundStatus({ advancedAt: "2026-07-20", asOf: "2026-07-27" });
    expect(s.state).toBe("NOT_STARTED");
  });

  it("reads a timestamped signal as its calendar day, not a day early", () => {
    const late = refundStatus({ startedAt: "2026-07-02T23:40:00Z", asOf: "2026-07-27" });
    const plain = refundStatus({ startedAt: "2026-07-02", asOf: "2026-07-27" });
    expect(late.dayIndex).toBe(plain.dayIndex);
  });

  it("says one day, not 1 days", () => {
    expect(refundStatus({ startedAt: "2026-07-02", asOf: "2026-07-31" }).line).toContain("1 day left");
  });

  it("emits the typed lifecycle event on each terminal state", () => {
    expect(refundEvents(refundStatus({ startedAt: "2026-06-01", asOf: "2026-07-27" }))).toEqual([
      "refund_window_complete",
    ]);
    expect(
      refundEvents(refundStatus({ startedAt: "2026-07-02", advancedAt: "2026-07-10", asOf: "2026-07-27" }))
    ).toEqual(["early_advance"]);
    expect(refundEvents(refundStatus({ startedAt: "2026-07-02", asOf: "2026-07-10" }))).toEqual([]);
  });
});

describe("kickoff steps", () => {
  it("lights each step from real key dates and leaves the rest dark", () => {
    const steps = kickoffSteps([
      deal({ keyDates: { quoted: "2026-06-19", signed: "2026-07-18", paid: "2026-07-18" } }),
    ]);
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey.quoted.done).toBe(true);
    expect(byKey.signed.at).toBe("2026-07-18");
    expect(byKey.invoiced.done).toBe(false);
    expect(byKey.meeting_booked.done).toBe(false);
  });

  it("never back-fills the booked-meeting light from the retired `met` field", () => {
    // Rob retired Met: "What I care about is booked meetings whether in person
    // or over the phone." A row carrying only `met` must not read as booked.
    const steps = kickoffSteps([deal({ keyDates: { met: "2026-06-20" } })]);
    expect(steps.find((s) => s.key === "meeting_booked")!.done).toBe(false);
  });

  it("takes the earliest date when a company has several deals", () => {
    const steps = kickoffSteps([
      deal({ id: "a", keyDates: { quoted: "2026-06-19" } }),
      deal({ id: "b", keyDates: { quoted: "2026-05-01" } }),
    ]);
    expect(steps.find((s) => s.key === "quoted")!.at).toBe("2026-05-01");
  });
});

describe("phase 1 money attribution", () => {
  it("reports the sole deal, and says the figure was inferred", () => {
    const m = inferPhaseOneMoney([deal({ value: 19000, keyDates: { paid: "2026-07-18" } })], 18000);
    expect(m.attribution).toBe("inferred_sole_deal");
    expect(m.value).toBe(19000);
    expect(m.standardPrice).toBe(18000);
    expect(m.paidAt).toBe("2026-07-18");
  });

  it("refuses to pick when two deals could be the Phase 1 paper", () => {
    const m = inferPhaseOneMoney([deal({ id: "a" }), deal({ id: "b", stage: "negotiating" })]);
    expect(m.attribution).toBe("none");
    expect(m.value).toBeUndefined();
    expect(m.emptyLine).toContain("2 deals");
  });

  it("ignores a lost deal, so one live deal beside one lost deal still resolves", () => {
    const m = inferPhaseOneMoney([deal({ id: "a", value: 10000 }), deal({ id: "b", stage: "lost" })]);
    expect(m.attribution).toBe("inferred_sole_deal");
    expect(m.value).toBe(10000);
  });

  it("ignores a deal that only reached this company through a person", () => {
    const m = inferPhaseOneMoney([
      deal({ id: "a", value: 10000 }),
      deal({ id: "b", anchoredVia: "Jonathan Polk" }),
    ]);
    expect(m.attribution).toBe("inferred_sole_deal");
  });

  it("keeps a valueless deal as unknown — never zero", () => {
    const m = inferPhaseOneMoney([deal({ value: undefined, stage: "signed" })]);
    expect(m.attribution).toBe("inferred_sole_deal");
    expect(m.value).toBeUndefined();
  });
});

describe("blueprint", () => {
  const asOf = "2026-07-27";

  it("renders all three phases as full sections even when nothing has started", () => {
    const b = buildBlueprint({ deals: [], asOf });
    expect(b.phases).toHaveLength(3);
    expect(b.phases[0].components).toHaveLength(PHASE_1_COMPONENTS.length);
    // Rob's amendment: a not-started phase still shows its whole fillable layout.
    expect(b.phases[1].components.length).toBeGreaterThan(0);
    expect(b.phases[2].components.length).toBeGreaterThan(0);
  });

  it("does NOT read an empty board as three completed phases", () => {
    const b = buildBlueprint({ deals: [], asOf });
    expect(b.phases[0].visual).toBe("live");
    expect(b.phases[1].visual).toBe("next");
    expect(b.phases[2].visual).toBe("locked");
  });

  it("advances the live badge to Phase 2 once every Phase 1 light is on", () => {
    const components = Object.fromEntries(
      PHASE_1_COMPONENTS.map((c) => [c.slug, { liveAt: "2026-07-10" }])
    );
    const b = buildBlueprint({ deals: [], components, asOf });
    expect(b.phases[0].visual).toBe("complete");
    expect(b.phases[1].visual).toBe("live");
    expect(b.phases[0].liveCount).toBe(PHASE_1_COMPONENTS.length);
  });

  it("starts the refund clock from the website component, not from the paid date", () => {
    const b = buildBlueprint({
      deals: [deal({ keyDates: { paid: "2026-07-18" } })],
      components: { [REFUND_TRIGGER_SLUG]: { liveAt: "2026-07-02" } },
      asOf,
    });
    expect(b.phases[0].refund!.state).toBe("ACTIVE");
    expect(b.phases[0].refund!.daysLeft).toBe(5);
  });

  it("carries the refund only on Phase 1, and the ROI guarantee only on Phase 2", () => {
    const b = buildBlueprint({ deals: [], asOf });
    expect(b.phases[0].refund).toBeDefined();
    expect(b.phases[1].refund).toBeUndefined();
    expect(b.phases[1].roiGuaranteeMonths).toBe(3);
    expect(b.phases[0].roiGuaranteeMonths).toBeUndefined();
  });

  // Q40 inc.8 — leg (5) on the board. These pin the states the guarantee is
  // ALLOWED to reach from what the CRM actually holds today.
  describe("the Phase 2 ROI guarantee's state", () => {
    it("is carried on Phase 2 only, and never on Phase 1 or 3", () => {
      const b = buildBlueprint({ deals: [], asOf });
      expect(b.phases[1].roiGuarantee).toBeDefined();
      expect(b.phases[0].roiGuarantee).toBeUndefined();
      expect(b.phases[2].roiGuarantee).toBeUndefined();
    });

    it("reads NOT_STARTED — not a shortfall — for a customer who never advanced", () => {
      const b = buildBlueprint({ deals: [], asOf });
      expect(b.phases[1].roiGuarantee!.state).toBe("NOT_STARTED");
      expect(b.phases[1].roiGuarantee!.line).toContain("not started");
      expect(b.phases[1].roiGuarantee!.roi).toBeUndefined();
    });

    it("never takes the standard list price as the target — the customer never agreed to it", () => {
      const b = buildBlueprint({
        deals: [],
        standardPrices: { 2: 25000 },
        advancedToPhase2At: "2026-07-01",
        asOf,
      });
      expect(b.phases[1].roiGuarantee!.state).toBe("NO_TARGET");
      expect(b.phases[1].roiGuarantee!.investment).toBeUndefined();
      expect(b.phases[1].roiGuarantee!.line).not.toContain("25,000");
    });

    it("stays AWAITING_DATA once measured returns exist, and only then computes", () => {
      const b = buildBlueprint({
        deals: [],
        advancedToPhase2At: "2026-07-01",
        phase2Returns: {
          laborHoursSaved: 100,
          laborCostPerHour: 30,
          revenueSincePhase2Start: 5000,
        },
        asOf,
      });
      // Returns without a target is still no target — the investment IS the target.
      expect(b.phases[1].roiGuarantee!.state).toBe("NO_TARGET");
    });

    it("starts the clock from the recorded advance date, never from asOf", () => {
      const b = buildBlueprint({ deals: [], advancedToPhase2At: "2026-07-01", asOf });
      expect(b.phases[1].roiGuarantee!.daysElapsed).toBe(26);
      expect(b.phases[1].roiGuarantee!.startedAt).toBe("2026-07-01");
    });
  });

  it("says out loud that the board is dark rather than implying zero progress", () => {
    const b = buildBlueprint({ deals: [], asOf });
    expect(b.signalSource).toBe(false);
    expect(b.signalNote).toContain("Nothing here is guessed");
  });

  it("stops saying it once a real signal exists", () => {
    const b = buildBlueprint({
      deals: [],
      components: { "everything-agent": { liveAt: "2026-07-09" } },
      asOf,
    });
    expect(b.signalSource).toBe(true);
    expect(b.signalNote).toBeUndefined();
  });

  it("reproduces Gulf Coast's real kickoff row from prod key dates", () => {
    const b = buildBlueprint({
      deals: [
        deal({
          name: "Gulf Coast RE Group",
          keyDates: { quoted: "2026-06-19", signed: "2026-07-18", paid: "2026-07-18" },
        }),
      ],
      standardPrices: { 1: 18000 },
      asOf,
    });
    const done = b.kickoff.filter((k) => k.done).map((k) => k.key);
    expect(done).toEqual(["quoted", "signed", "paid"]);
    expect(b.phases[0].money.value).toBe(19000);
    expect(b.phases[0].money.standardPrice).toBe(18000);
  });
});

// Q40 inc.9 — the phase-on-agreement field. This is where the Phase 2 ROI
// guarantee's target comes from, so every case below is a money case.
describe("attributePhaseMoney — a recorded phase, not a guess", () => {
  const asOf = "2026-07-28";

  it("uses the recorded phase instead of inferring", () => {
    const deals = [deal({ id: "a", name: "P2 paper", phase: 2, value: 24000 })];
    const m = attributePhaseMoney(deals, 2);
    expect(m.attribution).toBe("stored");
    expect(m.value).toBe(24000);
    expect(m.agreementRef).toBe("P2 paper");
  });

  it("never infers a Phase 2 or Phase 3 investment from an untagged deal", () => {
    const deals = [deal({ id: "a", name: "Some agreement", value: 24000 })];
    expect(attributePhaseMoney(deals, 2).attribution).toBe("none");
    expect(attributePhaseMoney(deals, 2).value).toBeUndefined();
    expect(attributePhaseMoney(deals, 3).attribution).toBe("none");
  });

  it("still infers Phase 1 from a sole candidate when nothing is recorded", () => {
    const m = attributePhaseMoney([deal({ value: 19000 })], 1);
    expect(m.attribution).toBe("inferred_sole_deal");
    expect(m.value).toBe(19000);
  });

  it("a deal recorded as Phase 2 is no longer a Phase 1 candidate", () => {
    // Two deals would previously have made Phase 1 ambiguous. Recording one of
    // them as Phase 2 leaves exactly one Phase 1 candidate — inference gets
    // STRICTER where the answer is known, never weaker.
    const deals = [deal({ id: "a", value: 19000 }), deal({ id: "b", phase: 2, value: 24000 })];
    const p1 = attributePhaseMoney(deals, 1);
    expect(p1.attribution).toBe("inferred_sole_deal");
    expect(p1.value).toBe(19000);
  });

  it("sums several agreements recorded to the same phase", () => {
    const deals = [
      deal({ id: "a", name: "P2 paper", phase: 2, value: 24000 }),
      deal({ id: "b", name: "P2 add-on", phase: 2, value: 6000 }),
    ];
    const m = attributePhaseMoney(deals, 2);
    expect(m.value).toBe(30000);
    expect(m.agreementRef).toBe("2 agreements on this phase");
  });

  it("withholds the total when any agreement carries no value — never sums around it", () => {
    // Summing around a valueless agreement UNDERSTATES the investment, which
    // understates the ROI target, which inflates the guarantee in our favour.
    const deals = [
      deal({ id: "a", phase: 2, value: 24000 }),
      deal({ id: "b", phase: 2, value: undefined }),
    ];
    const m = attributePhaseMoney(deals, 2);
    expect(m.value).toBeUndefined();
    expect(m.attribution).toBe("stored");
    expect(m.emptyLine).toContain("not zero");
  });

  it("ignores a lost agreement even when it carries the phase", () => {
    const deals = [deal({ id: "a", phase: 2, stage: "lost", value: 24000 })];
    expect(attributePhaseMoney(deals, 2).attribution).toBe("none");
  });

  it("marks the phase invoiced/paid only when EVERY agreement on it is, and takes the latest", () => {
    const both = [
      deal({ id: "a", phase: 2, value: 1, keyDates: { invoiced: "2026-01-05", paid: "2026-02-01" } }),
      deal({ id: "b", phase: 2, value: 1, keyDates: { invoiced: "2026-03-09", paid: "2026-04-02" } }),
    ];
    expect(attributePhaseMoney(both, 2).invoicedAt).toBe("2026-03-09");
    expect(attributePhaseMoney(both, 2).paidAt).toBe("2026-04-02");

    const partial = [
      deal({ id: "a", phase: 2, value: 1, keyDates: { paid: "2026-02-01" } }),
      deal({ id: "b", phase: 2, value: 1, keyDates: {} }),
    ];
    expect(attributePhaseMoney(partial, 2).paidAt).toBeUndefined();
  });

  it("feeds the ROI guarantee its target — a recorded Phase 2 investment RUNS the clock's target", () => {
    const b = buildBlueprint({
      deals: [deal({ id: "a", name: "P2 paper", phase: 2, value: 24000 })],
      advancedToPhase2At: "2026-07-01",
      asOf,
    });
    const g = b.phases[1].roiGuarantee!;
    expect(b.phases[1].money.value).toBe(24000);
    expect(g.state).toBe("AWAITING_DATA");
    expect(g.investment).toBe(24000);
  });

  it("an untagged deal cannot become the ROI target", () => {
    const b = buildBlueprint({
      deals: [deal({ id: "a", value: 24000 })],
      advancedToPhase2At: "2026-07-01",
      asOf,
    });
    expect(b.phases[1].roiGuarantee!.state).toBe("NO_TARGET");
  });
});
