import { describe, expect, it } from "vitest";
import { MARKETING_KPIS } from "@/lib/kpis/marketingKpis";
import { buildKpiSummaryPanel, type KpiTile } from "@/lib/readModel/kpiSummary";
import {
  buildActionItemsPanel,
  buildEsignPanel,
  buildPipelinePanel,
  buildUnavailablePanel,
  type RmActionItemRow,
  type RmEsignRow,
  type RmPipelineRow,
} from "@/lib/readModel/panels";

// PRD Task MC.12 — the KPI Summary panel. These tests exist to stop the one
// failure mode that matters here: a KPI printing a number it does not have.
// Every not-computable state must carry a null value AND a reason, and a
// failed read must never come out looking like a legitimate zero.

const TODAY = "2026-07-24";

const PIPELINE_ROWS: RmPipelineRow[] = [
  {
    deal_id: "d1",
    deal_name: "Title Base — Phase 1",
    stage: "paid",
    value: 2000,
    owner: "rob",
    counterparty_name: "The Title Base",
    stage_entered_at: "2026-07-23T00:00:00Z",
  },
  {
    deal_id: "d2",
    deal_name: "PropLogix expansion",
    stage: "negotiating",
    value: 17000,
    owner: "rob",
    counterparty_name: "PropLogix",
    stage_entered_at: "2026-07-10T00:00:00Z",
  },
  {
    deal_id: "d3",
    deal_name: "Comped pilot",
    stage: "delivering",
    value: 0,
    owner: "will",
    counterparty_name: "Pilot Co",
    stage_entered_at: "2026-07-01T00:00:00Z",
  },
  {
    deal_id: "d4",
    deal_name: "Unpriced idea",
    stage: "contacted",
    value: null,
    owner: null,
    counterparty_name: "Someone",
    stage_entered_at: null,
  },
];

const ACTION_ROWS: RmActionItemRow[] = [
  {
    task_id: "t1",
    title: "Send the Phase 1 agreement",
    status: "open",
    due_date: "2026-07-20",
    assigned_to: "rob",
    deal_id: "d1",
    person_id: null,
  },
  {
    task_id: "t2",
    title: "Return the signed W-9",
    status: "open",
    due_date: null,
    assigned_to: "Trent Brands",
    deal_id: "d1",
    person_id: null,
  },
];

const ESIGN_ROWS: RmEsignRow[] = [
  {
    document_id: "doc1",
    title: "Phase 1 agreement",
    phase: "phase-1",
    document_status: "sent",
    request_status: "pending",
    signer_name: "Trent Brands",
    sent_at: "2026-07-23T00:00:00Z",
    viewed_at: null,
    signed_at: null,
    expires_at: null,
    countersigned_at: null,
  },
];

const UNAVAILABLE = [
  buildUnavailablePanel("rm_invoices_ar"),
  buildUnavailablePanel("rm_delivery_phases"),
];

function summary(
  overrides: Partial<Parameters<typeof buildKpiSummaryPanel>[0]> = {}
) {
  return buildKpiSummaryPanel({
    pipeline: buildPipelinePanel(PIPELINE_ROWS),
    actionItems: buildActionItemsPanel(ACTION_ROWS, TODAY),
    esign: buildEsignPanel(ESIGN_ROWS),
    unavailable: UNAVAILABLE,
    todayISO: TODAY,
    ...overrides,
  });
}

const tile = (tiles: readonly KpiTile[], id: string): KpiTile => {
  const hit = tiles.find((t) => t.id === id);
  if (!hit) throw new Error(`no tile ${id}`);
  return hit;
};

describe("KPI summary panel", () => {
  it("computes the pipeline KPIs off the same totals the pipeline panel shows", () => {
    const panel = summary();
    expect(panel.status).toBe("live");
    expect(tile(panel.tiles, "open_pipeline_value").value).toBe(17000);
    expect(tile(panel.tiles, "won_value").value).toBe(2000);
    expect(tile(panel.tiles, "open_deals").value).toBe(3);
  });

  it("names the deals its dollar figures exclude, rather than absorbing them", () => {
    const note = tile(summary().tiles, "open_pipeline_value").note;
    expect(note).toContain("no value set");
    expect(note).toContain("COMPED");
  });

  it("counts overdue work without treating undated items as on time", () => {
    const panel = summary();
    expect(tile(panel.tiles, "overdue_action_items").value).toBe(1);
    expect(tile(panel.tiles, "due_today_action_items").value).toBe(0);
    expect(tile(panel.tiles, "overdue_action_items").note).toContain("not counted as on time");
  });

  it("reports a failed read as not computable, with a null value", () => {
    const panel = summary({ actionItems: null });
    const t = tile(panel.tiles, "overdue_action_items");
    expect(t.status).toBe("not_computable");
    expect(t.value).toBeNull();
    expect(t.note).toContain("failed read, not a zero");
  });

  it("separates an empty-but-live source from a failed one", () => {
    const panel = summary({ esign: buildEsignPanel([]) });
    const t = tile(panel.tiles, "agreements_out");
    expect(t.status).toBe("no_data");
    expect(t.value).toBeNull();
    expect(t.note).not.toContain("failed read");
  });

  it("blocks the sales KPIs that need MC.1 instead of approximating them", () => {
    const t = tile(summary().tiles, "weighted_pipeline_value");
    expect(t.status).toBe("not_computable");
    expect(t.value).toBeNull();
    expect(t.unblockedBy).toContain("MC.1");
  });

  it("carries AR through as blocked, quoting the read model's own unblocker", () => {
    const t = tile(summary().tiles, "ar_outstanding");
    expect(t.status).toBe("not_computable");
    expect(t.unblockedBy).toBe(
      UNAVAILABLE.find((h) => h.id === "rm_invoices_ar")!.unblockedBy
    );
  });

  it("carries every MC.2 marketing KPI onto the panel, none of them faked", () => {
    const panel = summary();
    for (const kpi of MARKETING_KPIS) {
      const t = tile(panel.tiles, `marketing_${kpi.id}`);
      expect(t.status).toBe("not_computable");
      expect(t.value).toBeNull();
      expect(t.unblockedBy).not.toBeNull();
    }
  });

  it("never emits a value on a tile that isn't computed — the whole contract", () => {
    const panel = summary({ pipeline: null, actionItems: null, esign: buildEsignPanel([]) });
    for (const t of panel.tiles) {
      if (t.status !== "computed") expect(t.value).toBeNull();
      expect(t.note.length).toBeGreaterThan(0);
    }
    // Nothing computable at all → the panel says so as a whole, not "live".
    expect(panel.counts.computed).toBe(0);
    expect(panel.status).toBe("empty");
  });
});
