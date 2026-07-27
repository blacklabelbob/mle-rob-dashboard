// PRD Task MC.12: the ops-panel shaping layer. Fixtures are the REAL prod
// shapes read out of the rm_* views on 2026-07-24 (8 pipeline rows incl. two
// COMPED $0 and two unvalued, 2 Rob-assigned tasks) so a test passing here
// means the panel handles the data that actually exists, not an invented one.

import { describe, expect, it } from "vitest";
import { DEAL_STAGES } from "../crm";
import { REQUEST_STATUSES } from "../esign/status";
import {
  buildActionItemsPanel,
  buildEsignPanel,
  buildPipelinePanel,
  buildUnavailablePanel,
  classifyAssignee,
  ESIGN_STATUS_ORDER,
  NO_REQUEST,
  panelHeader,
  type RmActionItemRow,
  type RmEsignRow,
  type RmPipelineRow,
} from "../readModel/panels";

function pipelineRow(over: Partial<RmPipelineRow> = {}): RmPipelineRow {
  return {
    deal_id: "deal-x",
    deal_name: "Deal X",
    stage: "quote_sent",
    value: 5000,
    owner: null,
    counterparty_name: "Someone",
    stage_entered_at: "2026-07-20T00:00:00Z",
    ...over,
  };
}

// Verbatim prod shape (rm_pipeline, 2026-07-24).
const PROD_PIPELINE: RmPipelineRow[] = [
  pipelineRow({ deal_id: "d1", stage: "invoiced", value: 10000, counterparty_name: "Caleb Green" }),
  pipelineRow({ deal_id: "d2", stage: "meeting_held", value: null, counterparty_name: "Gary Waskovich" }),
  pipelineRow({ deal_id: "d3", stage: "quote_sent", value: 0, counterparty_name: "Jonathan Polk" }),
  pipelineRow({ deal_id: "d4", stage: "paid", value: 2000, counterparty_name: "Trent Brands" }),
  pipelineRow({ deal_id: "d5", stage: "paid", value: 19000, counterparty_name: "Gulf Coast RE Group" }),
  pipelineRow({ deal_id: "d6", stage: "signed", value: 0, counterparty_name: "Naples Spine & Joint" }),
  pipelineRow({ deal_id: "d7", stage: "quote_sent", value: 7000, counterparty_name: "On Time Moving" }),
  pipelineRow({ deal_id: "d8", stage: "negotiating", value: null, counterparty_name: "Gulf Coast RE Group" }),
];

describe("panelHeader", () => {
  it("marks a blocked read model unavailable and names what unblocks it", () => {
    // AR held this role until 2026-07-25; delivery phases carries it now.
    const h = panelHeader("rm_delivery_phases", 0);
    expect(h.status).toBe("unavailable");
    expect(h.unblockedBy).toMatch(/Q40/);
    expect(h.note).toMatch(/No phase\/component store exists/);
  });

  it("says empty, not unavailable, for AR now that it has a real table", () => {
    // The distinction is the whole honest-coverage posture: "we can't build
    // this" and "we built it and Rob has no invoices" are different sentences.
    const h = panelHeader("rm_invoices_ar", 0);
    expect(h.status).toBe("empty");
    expect(h.unblockedBy).toBeNull();
    const live = panelHeader("rm_invoices_ar", 2);
    expect(live.status).toBe("live");
  });

  it("marks a live-but-rowless model empty WITH its reason, not live", () => {
    const h = panelHeader("rm_esign_status", 0);
    expect(h.status).toBe("empty");
    expect(h.note).toMatch(/ZERO documents/);
  });

  it("is live only when rows came back", () => {
    expect(panelHeader("rm_pipeline", 3).status).toBe("live");
    expect(panelHeader("rm_pipeline", 3).note).toBeNull();
  });
});

describe("buildPipelinePanel", () => {
  it("counts every canonical stage, in ladder order, even at zero", () => {
    const panel = buildPipelinePanel(PROD_PIPELINE);
    expect(panel.stages.map((s) => s.stage)).toEqual([...DEAL_STAGES]);
    expect(panel.totals.deals).toBe(8);
  });

  it("treats $0 as COMPED and null as unvalued — neither adds to a dollar total", () => {
    const panel = buildPipelinePanel(PROD_PIPELINE);
    expect(panel.totals.comped).toBe(2); // Jonathan Polk, Naples Spine
    expect(panel.totals.unvalued).toBe(2); // Gary Waskovich, Gulf Coast negotiating
    const quoteSent = panel.stages.find((s) => s.stage === "quote_sent")!;
    expect(quoteSent.count).toBe(2);
    expect(quoteSent.comped).toBe(1);
    expect(quoteSent.valueTotal).toBe(7000); // the COMPED deal contributes nothing
  });

  it("splits open pipeline from closed-won money", () => {
    const panel = buildPipelinePanel(PROD_PIPELINE);
    expect(panel.totals.wonValue).toBe(21000); // both paid deals
    expect(panel.totals.openValue).toBe(17000); // invoiced 10k + quote_sent 7k
    expect(panel.totals.openDeals).toBe(6);
  });

  it("keeps stalled deals OPEN — stuck is not closed", () => {
    const panel = buildPipelinePanel([pipelineRow({ stage: "stalled", value: 4000 })]);
    expect(panel.totals.openValue).toBe(4000);
    expect(panel.stages.find((s) => s.stage === "stalled")!.closed).toBe(false);
    expect(panel.stages.find((s) => s.stage === "lost")!.closed).toBe(true);
  });

  it("surfaces an off-ladder stage instead of silently dropping it", () => {
    const panel = buildPipelinePanel([pipelineRow({ stage: "sold_maybe" })]);
    expect(panel.unknownStages).toEqual(["sold_maybe"]);
    expect(panel.totals.deals).toBe(0);
  });

  it("reports empty with the contract's reason when the view has no rows", () => {
    expect(buildPipelinePanel([]).status).toBe("empty");
  });
});

describe("buildActionItemsPanel", () => {
  const rows: RmActionItemRow[] = [
    {
      task_id: "task-gulf-coast-equity-signoff",
      title: "Gulf Coast 30% equity — draft agreement + get it SIGNED",
      status: "open",
      due_date: "2026-07-29",
      assigned_to: "Rob",
      deal_id: "deal-gulf-coast-equity-phase4",
      person_id: null,
    },
    {
      task_id: "task-homeclonevault-equity-signoff",
      title: "HomeCloneVault 35/65 equity split — get the LOI SIGNED",
      status: "open",
      due_date: "2026-07-31",
      assigned_to: "Rob",
      deal_id: null,
      person_id: null,
    },
  ];

  it("puts roster names on our side, case- and whitespace-insensitively", () => {
    expect(classifyAssignee("Rob")).toBe("ours");
    expect(classifyAssignee("  will ")).toBe("ours");
    expect(classifyAssignee(null)).toBe("unassigned");
    expect(classifyAssignee("")).toBe("unassigned");
    expect(classifyAssignee("Trent Brands")).toBe("external");
  });

  it("buckets the real prod tasks as ours and upcoming", () => {
    const panel = buildActionItemsPanel(rows, "2026-07-24");
    const ours = panel.buckets.find((b) => b.side === "ours")!;
    expect(ours.count).toBe(2);
    expect(ours.upcoming).toBe(2);
    expect(panel.totals.overdue).toBe(0);
    expect(panel.status).toBe("live");
  });

  it("counts overdue, due-today and undated separately", () => {
    const panel = buildActionItemsPanel(
      [
        { ...rows[0], task_id: "t-late", due_date: "2026-07-20" },
        { ...rows[0], task_id: "t-today", due_date: "2026-07-24" },
        { ...rows[0], task_id: "t-none", due_date: null },
      ],
      "2026-07-24"
    );
    const ours = panel.buckets.find((b) => b.side === "ours")!;
    expect([ours.overdue, ours.dueToday, ours.undated]).toEqual([1, 1, 1]);
    expect(ours.items[0].taskId).toBe("t-late"); // most overdue first
    expect(ours.items[0].daysOverdue).toBe(4);
    expect(ours.items.at(-1)!.taskId).toBe("t-none"); // undated last, never "on time"
  });

  it("excludes done and cancelled work", () => {
    const panel = buildActionItemsPanel(
      [
        { ...rows[0], task_id: "t-done", status: "done" },
        { ...rows[0], task_id: "t-cancelled", status: "cancelled" },
      ],
      "2026-07-24"
    );
    expect(panel.totals.open).toBe(0);
    expect(panel.status).toBe("empty");
  });

  it("prints non-roster assignees rather than assuming they are the customer", () => {
    const panel = buildActionItemsPanel(
      [{ ...rows[0], task_id: "t-ext", assigned_to: "rob " }, { ...rows[0], task_id: "t-c", assigned_to: "Trent" }],
      "2026-07-24"
    );
    // "rob " trims to a roster match; "Trent" does not and is named.
    expect(panel.buckets.find((b) => b.side === "ours")!.count).toBe(1);
    expect(panel.externalAssignees).toEqual(["Trent"]);
  });
});

describe("buildEsignPanel", () => {
  function esignRow(over: Partial<RmEsignRow> = {}): RmEsignRow {
    return {
      document_id: "doc-1",
      title: "Phase 1 Agreement",
      phase: "phase_1",
      document_status: "sent",
      request_status: "pending",
      signer_name: "Someone",
      sent_at: "2026-07-24T00:00:00Z",
      viewed_at: null,
      signed_at: null,
      expires_at: null,
      countersigned_at: null,
      ...over,
    };
  }

  it("orders buckets by the shared REQUEST_STATUSES ladder", () => {
    expect(ESIGN_STATUS_ORDER).toEqual([NO_REQUEST, ...REQUEST_STATUSES]);
  });

  it("counts the ladder and the no-request state separately", () => {
    const panel = buildEsignPanel([
      esignRow({ document_id: "d1", request_status: null, document_status: "draft" }),
      esignRow({ document_id: "d2", request_status: "pending" }),
      esignRow({ document_id: "d3", request_status: "viewed", viewed_at: "2026-07-24T01:00:00Z" }),
    ]);
    expect(panel.byStatus).toEqual([
      { status: NO_REQUEST, count: 1 },
      { status: "pending", count: 1 },
      { status: "viewed", count: 1 },
    ]);
    expect(panel.outstanding).toBe(2);
  });

  it("derives awaiting-countersignature from the row, not a sixth status", () => {
    const panel = buildEsignPanel([
      esignRow({ document_id: "d1", request_status: "signed", signed_at: "2026-07-24T02:00:00Z" }),
      esignRow({
        document_id: "d2",
        request_status: "signed",
        signed_at: "2026-07-24T02:00:00Z",
        countersigned_at: "2026-07-24T03:00:00Z",
      }),
    ]);
    expect(panel.awaitingCountersignature).toBe(1);
  });

  it("is empty (with the zero-rows reason) on today's prod, not broken", () => {
    const panel = buildEsignPanel([]);
    expect(panel.status).toBe("empty");
    expect(panel.byStatus).toEqual([]);
    expect(panel.note).toMatch(/populate on first send/);
  });
});

describe("buildUnavailablePanel", () => {
  it("returns a real panel for the remaining blocked read model", () => {
    expect(buildUnavailablePanel("rm_delivery_phases").status).toBe("unavailable");
    expect(buildUnavailablePanel("rm_delivery_phases").unblockedBy).toMatch(/Q40/);
  });

  it("refuses to placeholder a read model that is actually buildable", () => {
    expect(() => buildUnavailablePanel("rm_pipeline")).toThrow(/not blocked/);
    // AR is the live case of this: once it got a table, an "unavailable"
    // placeholder for it became a lie in the other direction.
    expect(() => buildUnavailablePanel("rm_invoices_ar")).toThrow(/not blocked/);
  });
});
