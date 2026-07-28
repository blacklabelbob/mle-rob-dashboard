import { describe, expect, it } from "vitest";
import { liveMapFromRows, canonicalPhaseOf } from "@/lib/phases/componentLiveMap";
import type { PhaseComponentRow } from "@/lib/phases/componentStateRow";
import { PHASE_1_COMPONENTS, REFUND_TRIGGER_SLUG } from "@/lib/phases/components";
import { buildBlueprint } from "@/lib/phases/blueprint";
import { supabasePhaseComponentDb, type PhaseComponentClient } from "@/lib/phases/componentStateDb";

const row = (over: Partial<PhaseComponentRow> = {}): PhaseComponentRow => ({
  customer_id: "cust-1",
  phase: 1,
  component_id: REFUND_TRIGGER_SLUG,
  live_at: "2026-07-01T00:00:00.000Z",
  ever_live_at: "2026-07-01T00:00:00.000Z",
  last_signal_at: "2026-07-01T00:00:00.000Z",
  seen_event_ids: ["e1"],
  source: "will-tools",
  ...over,
});

describe("canonicalPhaseOf", () => {
  it("places every Phase 1 checklist slug in phase 1", () => {
    for (const def of PHASE_1_COMPONENTS) expect(canonicalPhaseOf(def.slug)).toBe(1);
  });

  it("reads a slot's phase off its prefix, past the default slot count", () => {
    expect(canonicalPhaseOf("p2-auto-1")).toBe(2);
    // The customer with four signed automations: beyond `DEFAULT_SLOT_COUNT`, and
    // still unmistakably a Phase 2 slot.
    expect(canonicalPhaseOf("p2-auto-9")).toBe(2);
    expect(canonicalPhaseOf("p3-auto-2")).toBe(3);
  });

  it("does not invent a phase for a slug the canon does not name", () => {
    expect(canonicalPhaseOf("something-else")).toBeNull();
    expect(canonicalPhaseOf("  ")).toBeNull();
  });
});

describe("liveMapFromRows", () => {
  it("lights a component from its stored row, carrying the source", () => {
    expect(liveMapFromRows([row()])).toEqual({
      [REFUND_TRIGGER_SLUG]: { liveAt: "2026-07-01T00:00:00.000Z", source: "will-tools" },
    });
  });

  it("REFUSES to light a component from a row filed under the wrong phase", () => {
    // The load-bearing case: `website-aeo-seo` starts the 30-day refund clock. A
    // partner row claiming it under phase 2 must not light phase 1's promise.
    const map = liveMapFromRows([row({ phase: 2 })]);
    expect(map[REFUND_TRIGGER_SLUG]).toBeUndefined();

    const bp = buildBlueprint({ deals: [], asOf: "2026-07-10T00:00:00.000Z", components: map });
    const p1 = bp.phases.find((p) => p.phase === 1)!;
    expect(p1.components.find((c) => c.slug === REFUND_TRIGGER_SLUG)!.live).toBe(false);
    expect(p1.refund?.startedAt).toBeUndefined();
    expect(bp.signalSource).toBe(false);
  });

  it("keeps a reverted component as a dark entry that remembers who said so", () => {
    const map = liveMapFromRows([row({ live_at: null })]);
    expect(map[REFUND_TRIGGER_SLUG]).toEqual({ liveAt: undefined, source: "will-tools" });
    expect(buildBlueprint({ deals: [], asOf: "2026-07-10T00:00:00.000Z", components: map }).signalSource).toBe(false);
  });

  it("passes through a slug the canon does not name instead of dropping it", () => {
    const map = liveMapFromRows([row({ phase: 2, component_id: "p2-auto-7" })]);
    expect(map["p2-auto-7"]?.liveAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("resolves a duplicate slug by newest last_signal_at, not row order", () => {
    const older = row({ component_id: "p2-auto-7", phase: 2, live_at: null, last_signal_at: "2026-07-01T00:00:00.000Z" });
    const newer = row({ component_id: "p2-auto-7", phase: 2, live_at: "2026-07-09T00:00:00.000Z", last_signal_at: "2026-07-09T00:00:00.000Z" });
    expect(liveMapFromRows([older, newer])["p2-auto-7"]?.liveAt).toBe("2026-07-09T00:00:00.000Z");
    expect(liveMapFromRows([newer, older])["p2-auto-7"]?.liveAt).toBe("2026-07-09T00:00:00.000Z");
  });

  it("skips a row with no component_id rather than keying the map on an empty string", () => {
    expect(liveMapFromRows([row({ component_id: "  " })])).toEqual({});
  });

  it("feeds the blueprint a board that lights, end to end", () => {
    const bp = buildBlueprint({
      deals: [],
      asOf: "2026-07-10T00:00:00.000Z",
      components: liveMapFromRows([
        row(),
        row({ component_id: "everything-agent", live_at: "2026-07-05T00:00:00.000Z" }),
      ]),
    });
    const p1 = bp.phases.find((p) => p.phase === 1)!;
    expect(p1.liveCount).toBe(2);
    expect(p1.refund?.startedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(bp.signalSource).toBe(true);
  });
});

describe("fetchCustomerRows", () => {
  const clientReturning = (result: { data: unknown; error: { message: string } | null }) => {
    const calls: Array<[string, unknown]> = [];
    const filter = {
      eq(column: string, value: unknown) {
        calls.push([column, value]);
        return filter;
      },
      maybeSingle: async () => result,
      then: (resolve: (r: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    const client = {
      from: () => ({ select: () => filter, upsert: async () => ({ error: null }) }),
    } as unknown as PhaseComponentClient;
    return { client, calls };
  };

  it("filters on the customer and coerces every row", async () => {
    const { client, calls } = clientReturning({
      data: [
        { customer_id: "cust-1", phase: 1, component_id: REFUND_TRIGGER_SLUG, live_at: "2026-07-01T00:00:00.000Z", seen_event_ids: null },
        "not a row",
      ],
      error: null,
    });
    const rows = await supabasePhaseComponentDb(client).fetchCustomerRows("cust-1");
    expect(calls).toEqual([["customer_id", "cust-1"]]);
    expect(rows).toHaveLength(1);
    // A null `seen_event_ids` from a pre-default row must not reach the map as null.
    expect(rows[0].seen_event_ids).toEqual([]);
  });

  it("THROWS on a failed read rather than returning a dark board", async () => {
    const { client } = clientReturning({ data: null, error: { message: "relation does not exist" } });
    await expect(supabasePhaseComponentDb(client).fetchCustomerRows("cust-1")).rejects.toThrow(
      /relation does not exist/,
    );
  });

  it("returns an empty list for a customer with no signals", async () => {
    const { client } = clientReturning({ data: [], error: null });
    expect(await supabasePhaseComponentDb(client).fetchCustomerRows("cust-1")).toEqual([]);
  });
});
