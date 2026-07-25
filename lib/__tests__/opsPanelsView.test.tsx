import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PanelsView from "@/components/ops/PanelsView";
import {
  buildActionItemsPanel,
  buildEsignPanel,
  buildPipelinePanel,
  buildUnavailablePanel,
  type RmActionItemRow,
  type RmEsignRow,
  type RmPipelineRow,
} from "@/lib/readModel/panels";
import {
  buildInvoicesArPanel,
  type InvoiceLedgerRow,
} from "@/lib/readModel/invoiceLedger";
import { buildKpiSummaryPanel } from "@/lib/readModel/kpiSummary";
import type { PanelsPayload } from "@/lib/readModel/source";

// PRD Task MC.12 — the per-screen smoke test. Renders the real panel view off
// the real shaping layer (prod row shapes) and asserts what a reader would
// actually SEE, especially the honest states: COMPED is never a dollar sign,
// an unvalued deal is never counted as zero, a blocked panel names its
// unblocker, and a view that failed to read never renders as "empty".

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

// Rob's two real invoices, exactly as the MC.9 sync mirrored them into
// `invoice_ledger` — the panel is smoke-tested against the real shapes, not
// invented ones.
// Verified field-by-field against `rm_invoices_ar` on prod (2026-07-25), not
// typed from memory: they are two DIFFERENT clients, and 100123 has no owner
// on the ledger at all — an earlier draft of this fixture made both of them
// Gulf Coast and gave both an owner, which would have let the nullable-owner
// path go untested while the comment claimed real-world fidelity.
const AR_ROWS: InvoiceLedgerRow[] = [
  {
    invoiceNumber: "MLE-2026-100122",
    issueDate: "2026-06-26",
    clientSlug: "cg_roofing",
    clientLegalName: "CG Roofing and Waterproofing LLC and Red Rock Roofing LLC",
    owner: "Caleb",
    amount: 10000,
    currency: "USD",
    statusText:
      "issued — split-payment plan approved 2026-07-16 (2 x $5,000, first due by 2026-07-24; Mgmt Change Approval on file)",
    paymentState: "outstanding",
    dueDate: "2026-07-24",
    paymentPlanNote:
      "issued — split-payment plan approved 2026-07-16 (2 x $5,000, first due by 2026-07-24; Mgmt Change Approval on file)",
    pdf: "invoices/Phase 1 Invoice - CG Roofing & Red Rock Roofing - MLE-2026-100122.pdf",
  },
  {
    invoiceNumber: "MLE-2026-100123",
    issueDate: "2026-07-16",
    clientSlug: "gulf_coast",
    clientLegalName: "Gulf Coast RE Group",
    owner: null,
    amount: 19000,
    currency: "USD",
    statusText: "paid",
    paymentState: "paid",
    dueDate: null,
    paymentPlanNote: null,
    pdf: "invoices/paid/Phase 1 Invoice - Gulf Coast RE Group - MLE-2026-100123 (PAID).pdf",
  },
];

function payload(overrides: Partial<PanelsPayload> = {}): PanelsPayload {
  const base = {
    todayISO: TODAY,
    pipeline: buildPipelinePanel(PIPELINE_ROWS),
    actionItems: buildActionItemsPanel(ACTION_ROWS, TODAY),
    esign: buildEsignPanel(ESIGN_ROWS),
    invoicesAr: buildInvoicesArPanel(AR_ROWS, TODAY),
    unavailable: [buildUnavailablePanel("rm_delivery_phases")],
    errors: [],
    ...overrides,
  };
  // The summary is derived from the same panels the screen renders, exactly as
  // fetchPanels does it — so the test can't drift from the real payload shape.
  return { ...base, kpiSummary: buildKpiSummaryPanel({ ...base, todayISO: TODAY }) };
}

const render = (p: PanelsPayload) => renderToStaticMarkup(<PanelsView payload={p} />);

describe("ops panels view", () => {
  it("renders the pipeline screen with money, COMPED and unvalued kept apart", () => {
    const html = render(payload());
    expect(html).toContain("Pipeline");
    expect(html).toContain("$17,000"); // still in play
    expect(html).toContain("$2,000"); // won
    expect(html).toContain("COMPED");
    expect(html).toContain("no value");
    // A comped deal must never be shown as a dollar amount of zero.
    expect(html).not.toContain("$0");
  });

  it("renders action items split ours vs theirs, undated said out loud", () => {
    const html = render(payload());
    expect(html).toContain("Ours");
    expect(html).toContain("Theirs");
    expect(html).toContain("Send the Phase 1 agreement");
    expect(html).toContain("overdue");
    expect(html).toContain("no due date");
    // A non-roster assignee is printed, never silently absorbed into ours.
    expect(html).toContain("Trent Brands");
  });

  it("renders the e-sign screen off the shared status ladder", () => {
    const html = render(payload());
    expect(html).toContain("Onboarding / e-sign");
    expect(html).toContain("outstanding");
    expect(html).toContain("Awaiting our countersign");
  });

  it("names what unblocks a panel with no backing store", () => {
    const html = render(payload());
    expect(html).toContain("Can&#x27;t be built yet");
    expect(html).toContain("Unblocked by");
  });

  it("says a failed read failed instead of rendering it as empty", () => {
    const html = render(
      payload({
        pipeline: null,
        errors: [{ id: "rm_pipeline", message: "permission denied for view rm_pipeline" }],
      })
    );
    expect(html).toContain("permission denied for view rm_pipeline");
    expect(html).toContain("no number to show");
    expect(html).not.toContain("Nothing in here yet");
  });

  it("renders the KPI summary with computable numbers separated from the rest", () => {
    const html = render(payload());
    expect(html).toContain("KPI summary");
    expect(html).toContain("computable today");
    expect(html).toContain("Not computable today");
    // A KPI that isn't computable says what it's waiting on, and shows no digit.
    expect(html).toContain("Weighted pipeline");
    expect(html).toContain("no number yet");
    expect(html).toContain("Task MC.1");
  });

  it("shows a failed-read KPI as no number, never as a zero", () => {
    const html = render(
      payload({
        actionItems: null,
        errors: [{ id: "rm_action_items", message: "permission denied for view rm_action_items" }],
      })
    );
    expect(html).toContain("failed read, not a zero");
    // The tile for the view that failed shows words, never a digit — checked on
    // that cell alone, because a live panel's real 0 is a legitimate number.
    const cell = html
      .split('<div class="rounded-lg')
      .find((c) => c.includes("Overdue action items"));
    expect(cell).toBeDefined();
    expect(cell).toContain("no number yet");
    expect(cell).not.toMatch(/>\s*\d/);
  });

  it("renders an empty-but-correct view as empty on purpose, with its reason", () => {
    const html = render(payload({ esign: buildEsignPanel([]) }));
    expect(html).toContain("Nothing in here yet");
  });

  it("renders AR off Rob's real invoices, outstanding and paid kept apart", () => {
    const html = render(payload());
    expect(html).toContain("Invoicing / AR");
    // $10,000 is outstanding and $19,000 is paid — the panel must never add
    // them into one $29,000 number.
    expect(html).toContain("$10,000");
    expect(html).toContain("$19,000");
    expect(html).not.toContain("$29,000");
    // 100122 came due 2026-07-24 and TODAY is 2026-07-24: due today, NOT overdue.
    expect(html).toContain("Due today");
  });

  it("never prints an outstanding total for an AR mirror that holds nothing", () => {
    const html = render(payload({ invoicesAr: buildInvoicesArPanel([], TODAY) }));
    // Scoped to the AR card alone: e-sign legitimately renders "1 outstanding",
    // and a whole-page assertion would fail on that instead of on this panel.
    const card = html.split("<section").find((s) => s.includes("Invoicing / AR"));
    expect(card).toBeDefined();
    // The empty mirror totals to 0. Printing "$0.00 outstanding" would read as
    // "Rob is fully paid" — the panel must stay silent on the number instead.
    expect(card).not.toContain("outstanding");
    expect(card).not.toMatch(/\$\d/);
    expect(card).toContain("Nothing in here yet");
  });

  it("says an AR read failed instead of showing a paid-off $0", () => {
    const html = render(
      payload({
        invoicesAr: null,
        errors: [{ id: "rm_invoices_ar", message: "permission denied for view rm_invoices_ar" }],
      })
    );
    expect(html).toContain("permission denied for view rm_invoices_ar");
    const card = html.split("<section").find((s) => s.includes("Invoicing / AR"));
    expect(card).not.toMatch(/\$\d/);
  });
});
