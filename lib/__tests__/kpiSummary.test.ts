import { describe, expect, it } from "vitest";
import { MARKETING_KPIS } from "@/lib/kpis/marketingKpis";
import {
  buildInvoicesArPanel,
  type InvoiceLedgerRow,
} from "@/lib/readModel/invoiceLedger";
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

// AR left this list on 2026-07-25 (MC.9's sync + view 0013); delivery phases
// is the one read model still without a backing store.
const UNAVAILABLE = [buildUnavailablePanel("rm_delivery_phases")];

// Rob's two real invoices as the sync mirrored them into `invoice_ledger`:
// $10,000 outstanding due 7/24 and $19,000 paid.
const AR_ROWS: InvoiceLedgerRow[] = [
  {
    invoiceNumber: "MLE-2026-100122",
    issueDate: "2026-06-24",
    clientSlug: "gulf-coast",
    clientLegalName: "Gulf Coast RE Group",
    owner: "Rob",
    amount: 10000,
    currency: "USD",
    statusText: "outstanding — 2 x $5,000",
    paymentState: "outstanding",
    dueDate: "2026-07-24",
    paymentPlanNote: "2 x $5,000",
    pdf: null,
  },
  {
    invoiceNumber: "MLE-2026-100123",
    issueDate: "2026-07-01",
    clientSlug: "gulf-coast",
    clientLegalName: "Gulf Coast RE Group",
    owner: "Rob",
    amount: 19000,
    currency: "USD",
    statusText: "paid",
    paymentState: "paid",
    dueDate: null,
    paymentPlanNote: null,
    pdf: null,
  },
];

function summary(
  overrides: Partial<Parameters<typeof buildKpiSummaryPanel>[0]> = {}
) {
  return buildKpiSummaryPanel({
    pipeline: buildPipelinePanel(PIPELINE_ROWS),
    actionItems: buildActionItemsPanel(ACTION_ROWS, TODAY),
    esign: buildEsignPanel(ESIGN_ROWS),
    invoicesAr: buildInvoicesArPanel(AR_ROWS, TODAY),
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

  it("computes AR off the synced ledger, counting unknowns as outstanding", () => {
    const t = tile(summary().tiles, "ar_outstanding");
    expect(t.status).toBe("computed");
    expect(t.value).toBe(10000); // the paid $19,000 is not outstanding
    expect(t.unblockedBy).toBeNull();
  });

  it("never turns a failed AR read into $0 outstanding", () => {
    // The failure mode this guards is specific and expensive: a read that
    // errored rendering as "nothing owed" is Rob not chasing money he is owed.
    const t = tile(summary({ invoicesAr: null }).tiles, "ar_outstanding");
    expect(t.status).toBe("not_computable");
    expect(t.value).toBeNull();
  });

  it("says AR is empty rather than $0 when the ledger mirror holds nothing", () => {
    const t = tile(summary({ invoicesAr: buildInvoicesArPanel([], TODAY) }).tiles, "ar_outstanding");
    expect(t.status).toBe("no_data");
    expect(t.value).toBeNull();
  });

  it("names the carve-outs baked into the AR total instead of hiding them", () => {
    const withHoles = buildInvoicesArPanel(
      [
        { ...AR_ROWS[0], amount: null },
        { ...AR_ROWS[1], invoiceNumber: "MLE-2026-100124", paymentState: "unknown", amount: 500 },
      ],
      TODAY
    );
    const t = tile(summary({ invoicesAr: withHoles }).tiles, "ar_outstanding");
    expect(t.value).toBe(500);
    expect(t.note).toMatch(/unreadable amount/);
    expect(t.note).toMatch(/no explicit payment state/);
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
    // Every readable panel absent — `invoicesAr: null` included, since AR
    // became a real read in MC.12 and a forgotten override here would let the
    // panel call itself live off one surviving tile.
    const panel = summary({
      pipeline: null,
      actionItems: null,
      esign: buildEsignPanel([]),
      invoicesAr: null,
    });
    for (const t of panel.tiles) {
      if (t.status !== "computed") expect(t.value).toBeNull();
      expect(t.note.length).toBeGreaterThan(0);
    }
    // Nothing computable at all → the panel says so as a whole, not "live".
    expect(panel.counts.computed).toBe(0);
    expect(panel.status).toBe("empty");
  });
});
