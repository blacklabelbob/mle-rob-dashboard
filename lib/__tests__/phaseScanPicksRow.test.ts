import { describe, expect, it } from "vitest";
import { scanPicksFromRows, type ScanPickRow } from "@/lib/phases/scanPicksRow";
import { aimForNext } from "@/lib/phases/aimForNext";

const row = (over: Partial<ScanPickRow> = {}): ScanPickRow => ({
  customer_id: "cust-1",
  pick_id: "missed-call-recovery",
  label: "Missed-call text-back",
  why: null,
  rank: 0,
  recorded_by: "rob",
  recorded_at: "2026-07-28T10:00:00.000Z",
  withdrawn_at: null,
  source: "growth-scan",
  ...over,
});

describe("scanPicksFromRows", () => {
  it("returns an empty shortlist for no rows — the honest SCAN_NO_PICKS state", () => {
    for (const rows of [undefined, null, []]) {
      const out = scanPicksFromRows(rows);
      expect(out.picks).toEqual([]);
      expect(out.withdrawn).toBe(0);
      expect(out.skipped).toEqual([]);
    }
  });

  it("orders by rank — the cut decides what a paying customer is pitched", () => {
    const out = scanPicksFromRows([
      row({ pick_id: "c", label: "C", rank: 3 }),
      row({ pick_id: "a", label: "A", rank: 1 }),
      row({ pick_id: "b", label: "B", rank: 2 }),
    ]);
    expect(out.picks.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks rank ties by recorded_at then pick_id, so the order is total", () => {
    const out = scanPicksFromRows([
      row({ pick_id: "z", label: "Z", rank: 0, recorded_at: "2026-07-28T12:00:00.000Z" }),
      row({ pick_id: "b", label: "B", rank: 0, recorded_at: "2026-07-28T09:00:00.000Z" }),
      row({ pick_id: "a", label: "A", rank: 0, recorded_at: "2026-07-28T09:00:00.000Z" }),
    ]);
    expect(out.picks.map((p) => p.id)).toEqual(["a", "b", "z"]);
  });

  it("sorts a missing rank as 0, not last", () => {
    const out = scanPicksFromRows([
      row({ pick_id: "ranked", label: "Ranked", rank: 5 }),
      row({ pick_id: "unranked", label: "Unranked", rank: null }),
    ]);
    expect(out.picks.map((p) => p.id)).toEqual(["unranked", "ranked"]);
  });

  it("excludes withdrawn picks and counts them — retired, not broken", () => {
    const out = scanPicksFromRows([
      row({ pick_id: "live", label: "Live one" }),
      row({ pick_id: "taken-back", label: "", withdrawn_at: "2026-07-27T00:00:00.000Z" }),
    ]);
    expect(out.picks.map((p) => p.id)).toEqual(["live"]);
    expect(out.withdrawn).toBe(1);
    expect(out.skipped).toEqual([]);
  });

  it("reports unusable rows instead of shortening the shortlist silently", () => {
    const out = scanPicksFromRows([
      row({ pick_id: "  ", label: "No id" }),
      row({ pick_id: "no-label", label: "   " }),
      row({ pick_id: "ok", label: "Fine" }),
    ]);
    expect(out.picks.map((p) => p.id)).toEqual(["ok"]);
    expect(out.skipped).toEqual([
      { pickId: "", reason: "no_pick_id" },
      { pickId: "no-label", reason: "no_label" },
    ]);
  });

  it("keeps the first of two rows sharing a pick_id and reports the second", () => {
    const out = scanPicksFromRows([
      row({ pick_id: "dupe", label: "First" }),
      row({ pick_id: "dupe", label: "Second" }),
    ]);
    expect(out.picks).toEqual([{ id: "dupe", label: "First" }]);
    expect(out.skipped).toEqual([{ pickId: "dupe", reason: "duplicate_pick_id" }]);
  });

  it("omits `why` entirely when blank rather than rendering an empty reason", () => {
    const out = scanPicksFromRows([
      row({ pick_id: "a", label: "A", why: "   " }),
      row({ pick_id: "b", label: "B", why: " Their intake is manual today. ", rank: 1 }),
    ]);
    expect(out.picks[0]).toEqual({ id: "a", label: "A" });
    expect("why" in out.picks[0]).toBe(false);
    expect(out.picks[1].why).toBe("Their intake is manual today.");
  });

  it("feeds the panel: stored rows move a customer from SCAN_NO_PICKS to READY", () => {
    const input = {
      phase1LiveCount: 3,
      phase1TotalCount: 4,
      growthScanLiveAt: "2026-07-20T00:00:00.000Z",
      phase2Attribution: "none" as const,
      slotCount: 2,
      asOf: "2026-07-28T00:00:00.000Z",
    };
    expect(aimForNext(input).state).toBe("SCAN_NO_PICKS");

    const { picks } = scanPicksFromRows([
      row({ pick_id: "a", label: "A", rank: 0 }),
      row({ pick_id: "b", label: "B", rank: 1 }),
      row({ pick_id: "c", label: "C", rank: 2 }),
    ]);
    const aim = aimForNext({ ...input, recommendations: picks });
    expect(aim.state).toBe("READY");
    expect(aim.picks.map((p) => p.id)).toEqual(["a", "b"]);
    // The third is named out loud, never silently dropped.
    expect(aim.overflowNote).toContain("1 more");
  });
});
