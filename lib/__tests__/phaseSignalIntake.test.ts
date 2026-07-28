// Q40 leg (4) — the phase signal decision seam.
// Contract under test: docs/plans/PHASE-SIGNAL-WEBHOOK-CONTRACT.md v1.

import { describe, it, expect } from "vitest";
import {
  decideSignal,
  SIGNAL_CONTRACT_VERSION,
  type SignalContext,
} from "../phases/signalIntake";
import { REFUND_TRIGGER_SLUG, componentDefsFor } from "../phases/components";

const KNOWN: SignalContext = { customerKnown: true };

function payload(over: Record<string, unknown> = {}) {
  return {
    version: 1,
    eventId: "evt_1",
    customerId: "miga-food-manufacturing",
    phase: 1,
    componentId: REFUND_TRIGGER_SLUG,
    status: "live",
    occurredAt: "2026-07-22T18:04:11Z",
    ...over,
  };
}

describe("decideSignal — payload validation (route answers 400, sender must fix)", () => {
  it("refuses a non-object body", () => {
    for (const body of [null, undefined, "{}", 7, [1, 2]]) {
      const d = decideSignal(body, KNOWN);
      expect(d.outcome).toBe("malformed");
    }
  });

  it("refuses an unknown contract version before reading anything else", () => {
    const d = decideSignal(payload({ version: 2 }), KNOWN);
    expect(d).toMatchObject({ outcome: "malformed", field: "version" });
  });

  it("refuses a v1 payload missing any required field, naming the field", () => {
    const required = ["eventId", "customerId", "componentId", "phase", "status", "occurredAt"];
    for (const field of required) {
      const body = payload();
      delete (body as Record<string, unknown>)[field];
      expect(decideSignal(body, KNOWN)).toMatchObject({ outcome: "malformed", field });
    }
  });

  it("refuses blank strings, not just absent keys", () => {
    expect(decideSignal(payload({ eventId: "   " }), KNOWN)).toMatchObject({
      outcome: "malformed",
      field: "eventId",
    });
  });

  it("refuses a phase outside 1|2|3 and a status outside the three", () => {
    expect(decideSignal(payload({ phase: 4 }), KNOWN)).toMatchObject({ field: "phase" });
    expect(decideSignal(payload({ phase: "1" }), KNOWN)).toMatchObject({ field: "phase" });
    expect(decideSignal(payload({ status: "done" }), KNOWN)).toMatchObject({ field: "status" });
  });

  it("refuses an occurredAt that does not parse — it drives the refund clock", () => {
    // Invalid Date compares false in BOTH directions, so an unparseable value
    // would make a stale event look fresh and a fresh one look stale.
    for (const bad of ["2026-13-45", "yesterday", ""]) {
      expect(decideSignal(payload({ occurredAt: bad }), KNOWN)).toMatchObject({
        outcome: "malformed",
        field: "occurredAt",
      });
    }
  });
});

describe("decideSignal — well-formed but not applied (route answers 200, never a retry loop)", () => {
  it("acks a replayed eventId without re-applying", () => {
    const d = decideSignal(payload(), {
      customerKnown: true,
      stored: { seenEventIds: ["evt_1"] },
    });
    expect(d).toMatchObject({ outcome: "not_applied", reason: "duplicate" });
  });

  it("checks the replay BEFORE the customer, so a settled event cannot change answer", () => {
    // Same event, customer since unresolvable: still 'duplicate', not
    // 'unknown_customer' — an applied event stays applied.
    const d = decideSignal(payload(), {
      customerKnown: false,
      stored: { seenEventIds: ["evt_1"] },
    });
    expect(d).toMatchObject({ outcome: "not_applied", reason: "duplicate" });
  });

  it("reports an unmatchable customer rather than throwing", () => {
    expect(decideSignal(payload(), { customerKnown: false })).toMatchObject({
      outcome: "not_applied",
      reason: "unknown_customer",
    });
  });

  it("reports an unknown slug as unmatchable, not malformed", () => {
    const d = decideSignal(payload({ componentId: "quantum-blockchain" }), KNOWN);
    expect(d).toMatchObject({ outcome: "not_applied", reason: "unknown_component" });
  });

  it("names the phase disagreement when we know the slug under a different phase", () => {
    const p2 = componentDefsFor(2)[0];
    const d = decideSignal(payload({ phase: 1, componentId: p2.slug }), KNOWN);
    expect(d).toMatchObject({ outcome: "not_applied", reason: "phase_mismatch" });
    if (d.outcome === "not_applied") expect(d.detail).toContain("phase 2");
  });
});

describe("decideSignal — out-of-order delivery is a comparison, never arrival order", () => {
  it("ignores a signal older than the one already applied", () => {
    const d = decideSignal(payload({ status: "reverted", occurredAt: "2026-07-20T00:00:00Z" }), {
      customerKnown: true,
      stored: { liveAt: "2026-07-22T18:04:11Z", lastSignalAt: "2026-07-22T18:04:11Z" },
    });
    // A revert emitted BEFORE the live we hold must not dark a correct light.
    expect(d).toMatchObject({ outcome: "not_applied", reason: "stale" });
  });

  it("refuses to order two signals sharing one instant instead of guessing", () => {
    const d = decideSignal(payload({ eventId: "evt_2", status: "reverted" }), {
      customerKnown: true,
      stored: { liveAt: "2026-07-22T18:04:11Z", lastSignalAt: "2026-07-22T18:04:11Z" },
    });
    expect(d).toMatchObject({ outcome: "not_applied", reason: "ambiguous_timestamp" });
  });

  it("applies a strictly newer signal", () => {
    const d = decideSignal(payload({ eventId: "evt_2", status: "reverted", occurredAt: "2026-07-25T09:00:00Z" }), {
      customerKnown: true,
      stored: { liveAt: "2026-07-22T18:04:11Z", lastSignalAt: "2026-07-22T18:04:11Z" },
    });
    expect(d.outcome).toBe("applied");
  });
});

describe("decideSignal — what a signal does to the light", () => {
  it("lights a component from occurredAt, never receipt time", () => {
    const d = decideSignal(payload(), KNOWN);
    expect(d).toMatchObject({
      outcome: "applied",
      liveAt: "2026-07-22T18:04:11Z",
      occurredAt: "2026-07-22T18:04:11Z",
    });
  });

  it("does not re-apply a live signal for an already-lit component", () => {
    const d = decideSignal(payload({ eventId: "evt_2", occurredAt: "2026-07-25T09:00:00Z" }), {
      customerKnown: true,
      stored: { liveAt: "2026-07-22T18:04:11Z", everLiveAt: "2026-07-22T18:04:11Z" },
    });
    expect(d).toMatchObject({ outcome: "not_applied", reason: "already_live" });
  });

  it("in_progress never un-lights a live component", () => {
    const d = decideSignal(payload({ eventId: "evt_2", status: "in_progress", occurredAt: "2026-07-25T09:00:00Z" }), {
      customerKnown: true,
      stored: { liveAt: "2026-07-22T18:04:11Z", everLiveAt: "2026-07-22T18:04:11Z" },
    });
    expect(d).toMatchObject({ outcome: "not_applied", reason: "already_live" });
  });

  it("in_progress on an unlit component applies but lights nothing", () => {
    const d = decideSignal(payload({ status: "in_progress" }), KNOWN);
    expect(d).toMatchObject({ outcome: "applied", liveAt: null, startsRefundWindow: false });
  });

  it("a revert clears the light AND raises attention — a light going dark is never silent", () => {
    const d = decideSignal(payload({ eventId: "evt_2", status: "reverted", occurredAt: "2026-07-25T09:00:00Z" }), {
      customerKnown: true,
      stored: { liveAt: "2026-07-22T18:04:11Z", everLiveAt: "2026-07-22T18:04:11Z" },
    });
    expect(d).toMatchObject({ outcome: "applied", liveAt: null });
    if (d.outcome === "applied") expect(d.attention).toBeTruthy();
  });
});

describe("decideSignal — the refund clock is the part that must not be wrong", () => {
  it("starts the window on the first live of the phase-1 trigger component", () => {
    const d = decideSignal(payload(), KNOWN);
    expect(d).toMatchObject({ outcome: "applied", startsRefundWindow: true });
  });

  it("starts it for no other component", () => {
    const other = componentDefsFor(1).find((c) => c.slug !== REFUND_TRIGGER_SLUG);
    expect(other).toBeTruthy();
    const d = decideSignal(payload({ componentId: other!.slug }), KNOWN);
    expect(d).toMatchObject({ outcome: "applied", startsRefundWindow: false });
  });

  it("a revert does NOT retract a refund window the customer already earned", () => {
    const d = decideSignal(payload({ eventId: "evt_2", status: "reverted", occurredAt: "2026-07-25T09:00:00Z" }), {
      customerKnown: true,
      stored: { liveAt: "2026-07-22T18:04:11Z", everLiveAt: "2026-07-22T18:04:11Z" },
    });
    // The promise was made the day the site went live. Only a human retracts it.
    expect(d).toMatchObject({ outcome: "applied", startsRefundWindow: false });
  });

  it("a RE-LIGHT after a revert does not hand the customer a brand-new 30 days", () => {
    // The defect this field exists to prevent: keying on `liveAt` being absent
    // would restart the clock off a partner's deploy hiccup, changing a
    // customer's refund rights with nobody deciding and nobody seeing.
    const d = decideSignal(payload({ eventId: "evt_3", occurredAt: "2026-07-26T12:00:00Z" }), {
      customerKnown: true,
      stored: { liveAt: null, everLiveAt: "2026-07-22T18:04:11Z", lastSignalAt: "2026-07-25T09:00:00Z" },
    });
    expect(d).toMatchObject({ outcome: "applied", liveAt: "2026-07-26T12:00:00Z", startsRefundWindow: false });
  });

  it("is pure — the same payload and context decide identically every time", () => {
    const ctx = { customerKnown: true, stored: { liveAt: null, everLiveAt: null } };
    expect(decideSignal(payload(), ctx)).toEqual(decideSignal(payload(), ctx));
  });
});

describe("decideSignal — audit fields", () => {
  it("defaults source rather than inventing an empty attribution", () => {
    const d = decideSignal(payload(), KNOWN);
    if (d.outcome === "applied") expect(d.source).toBe("partner-tools");
  });

  it("carries the sender's own source when given", () => {
    const d = decideSignal(payload({ source: "mle-partner-tools" }), KNOWN);
    if (d.outcome === "applied") expect(d.source).toBe("mle-partner-tools");
  });

  it("speaks exactly contract v1", () => {
    expect(SIGNAL_CONTRACT_VERSION).toBe(1);
  });
});
