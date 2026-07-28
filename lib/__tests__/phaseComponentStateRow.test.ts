import { describe, expect, it } from "vitest";
import {
  rowPatch,
  storedFromRow,
  SEEN_EVENT_CAP,
  type PhaseComponentRow,
} from "@/lib/phases/componentStateRow";
import { decideSignal, type SignalApplied } from "@/lib/phases/signalIntake";
import { REFUND_TRIGGER_SLUG } from "@/lib/phases/components";

const row = (over: Partial<PhaseComponentRow> = {}): PhaseComponentRow => ({
  customer_id: "cust-1",
  phase: 1,
  component_id: REFUND_TRIGGER_SLUG,
  live_at: null,
  ever_live_at: null,
  last_signal_at: null,
  seen_event_ids: [],
  source: null,
  ...over,
});

/** Decisions come from the real decider, never hand-built: a hand-built one can
 *  hold a combination the decider never emits, and then this file tests fiction. */
const decide = (payload: Record<string, unknown>, current: PhaseComponentRow | null) => {
  const d = decideSignal(
    { version: 1, customerId: "cust-1", phase: 1, componentId: REFUND_TRIGGER_SLUG, ...payload },
    { customerKnown: true, stored: storedFromRow(current) },
  );
  expect(d.outcome).toBe("applied");
  return d as SignalApplied;
};

describe("storedFromRow", () => {
  it("maps an absent row to an empty state, not a throw", () => {
    expect(storedFromRow(null)).toEqual({
      liveAt: null,
      everLiveAt: null,
      lastSignalAt: null,
      seenEventIds: [],
    });
  });

  it("treats blank strings as absent so a whitespace live_at never reads as lit", () => {
    expect(storedFromRow(row({ live_at: "   " })).liveAt).toBeNull();
  });
});

describe("rowPatch — ever_live_at is write-once (the refund clock's origin)", () => {
  it("sets it on the first lighting", () => {
    const d = decide({ eventId: "e1", status: "live", occurredAt: "2026-07-01T10:00:00Z" }, null);
    expect(d.startsRefundWindow).toBe(true);
    const p = rowPatch(d, null);
    expect(p.live_at).toBe("2026-07-01T10:00:00Z");
    expect(p.ever_live_at).toBe("2026-07-01T10:00:00Z");
  });

  it("does NOT move it on a re-light after a revert — the window keeps its original start", () => {
    const reverted = row({
      live_at: null,
      ever_live_at: "2026-07-01T10:00:00Z",
      last_signal_at: "2026-07-02T10:00:00Z",
      seen_event_ids: ["e1", "e2"],
    });
    const d = decide({ eventId: "e3", status: "live", occurredAt: "2026-07-05T09:00:00Z" }, reverted);
    // The decider must also refuse to restart the window...
    expect(d.startsRefundWindow).toBe(false);
    const p = rowPatch(d, reverted);
    // ...and the row must agree with it. A later origin shortens a customer's rights.
    expect(p.ever_live_at).toBe("2026-07-01T10:00:00Z");
    expect(p.live_at).toBe("2026-07-05T09:00:00Z");
  });

  it("is not created by an in_progress or a revert — neither is a lighting", () => {
    const inProg = decide({ eventId: "e1", status: "in_progress", occurredAt: "2026-07-01T08:00:00Z" }, null);
    expect(rowPatch(inProg, null).ever_live_at).toBeNull();

    const rev = decide({ eventId: "e2", status: "reverted", occurredAt: "2026-07-01T09:00:00Z" }, null);
    expect(rowPatch(rev, null).ever_live_at).toBeNull();
  });
});

describe("rowPatch — a revert actually clears the light", () => {
  it("writes live_at null rather than leaving the stale value", () => {
    const lit = row({
      live_at: "2026-07-01T10:00:00Z",
      ever_live_at: "2026-07-01T10:00:00Z",
      last_signal_at: "2026-07-01T10:00:00Z",
      seen_event_ids: ["e1"],
    });
    const d = decide({ eventId: "e2", status: "reverted", occurredAt: "2026-07-03T10:00:00Z" }, lit);
    const p = rowPatch(d, lit);
    expect(p.live_at).toBeNull();
    expect(d.attention).toBeTruthy(); // a light going dark is never silent
  });
});

describe("rowPatch — idempotency memory", () => {
  it("appends the eventId so the very next replay is refused as duplicate", () => {
    const d = decide({ eventId: "e1", status: "live", occurredAt: "2026-07-01T10:00:00Z" }, null);
    const written = row(rowPatch(d, null));
    expect(written.seen_event_ids).toContain("e1");

    const replay = decideSignal(
      {
        version: 1,
        eventId: "e1",
        customerId: "cust-1",
        phase: 1,
        componentId: REFUND_TRIGGER_SLUG,
        status: "live",
        occurredAt: "2026-07-01T10:00:00Z",
      },
      { customerKnown: true, stored: storedFromRow(written) },
    );
    expect(replay).toMatchObject({ outcome: "not_applied", reason: "duplicate" });
  });

  it("caps the list from the FRONT, keeping the recent ids", () => {
    const many = Array.from({ length: SEEN_EVENT_CAP }, (_, i) => `old-${i}`);
    const current = row({ seen_event_ids: many, last_signal_at: "2026-07-01T00:00:00Z" });
    const d = decide({ eventId: "new-1", status: "live", occurredAt: "2026-07-02T00:00:00Z" }, current);
    const p = rowPatch(d, current);
    expect(p.seen_event_ids).toHaveLength(SEEN_EVENT_CAP);
    expect(p.seen_event_ids.at(-1)).toBe("new-1");
    expect(p.seen_event_ids).not.toContain("old-0");
  });

  it("an id dropped by the cap is still refused — the ordering check is the backstop", () => {
    // `old-0` has fallen off the list, so membership can no longer refuse it.
    const many = Array.from({ length: SEEN_EVENT_CAP }, (_, i) => `old-${i}`).slice(1);
    const current = row({
      seen_event_ids: [...many, "new-1"],
      last_signal_at: "2026-07-02T00:00:00Z",
      live_at: null,
    });
    const ancientReplay = decideSignal(
      {
        version: 1,
        eventId: "old-0",
        customerId: "cust-1",
        phase: 1,
        componentId: REFUND_TRIGGER_SLUG,
        status: "live",
        occurredAt: "2026-06-01T00:00:00Z", // its ORIGINAL instant, necessarily older
      },
      { customerKnown: true, stored: storedFromRow(current) },
    );
    expect(ancientReplay).toMatchObject({ outcome: "not_applied", reason: "stale" });
  });

  it("does not double-append an id already present", () => {
    const current = row({ seen_event_ids: ["e1"], last_signal_at: "2026-07-01T00:00:00Z" });
    const d = decide({ eventId: "e9", status: "live", occurredAt: "2026-07-02T00:00:00Z" }, current);
    const forced: SignalApplied = { ...d, eventId: "e1" };
    expect(rowPatch(forced, current).seen_event_ids).toEqual(["e1"]);
  });
});

describe("rowPatch — the ordering baseline is the sender's instant", () => {
  it("writes occurredAt into last_signal_at, never a receipt time", () => {
    const d = decide({ eventId: "e1", status: "live", occurredAt: "2026-07-01T10:00:00Z" }, null);
    const p = rowPatch(d, null);
    expect(p.last_signal_at).toBe("2026-07-01T10:00:00Z");
    expect(p.customer_id).toBe("cust-1");
    expect(p.component_id).toBe(REFUND_TRIGGER_SLUG);
    expect(p.phase).toBe(1);
    expect(p.source).toBe("partner-tools");
  });
});
