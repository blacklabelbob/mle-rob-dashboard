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

function payload(overrides: Partial<PanelsPayload> = {}): PanelsPayload {
  return {
    todayISO: TODAY,
    pipeline: buildPipelinePanel(PIPELINE_ROWS),
    actionItems: buildActionItemsPanel(ACTION_ROWS, TODAY),
    esign: buildEsignPanel(ESIGN_ROWS),
    unavailable: [
      buildUnavailablePanel("rm_invoices_ar"),
      buildUnavailablePanel("rm_delivery_phases"),
    ],
    errors: [],
    ...overrides,
  };
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

  it("renders an empty-but-correct view as empty on purpose, with its reason", () => {
    const html = render(payload({ esign: buildEsignPanel([]) }));
    expect(html).toContain("Nothing in here yet");
  });
});
