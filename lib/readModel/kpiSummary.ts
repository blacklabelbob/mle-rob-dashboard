// PRD Task MC.12 (base 9.1) — the KPI Summary panel, the fifth ops panel.
// Pure per CR-3: it does no reading of its own, it summarises the panels the
// read seam already shaped (lib/readModel/panels.ts off the rm_* views), and
// it takes `todayISO` from the caller like every other module on this path.
//
// The whole point of this panel is that it is honest about its own coverage.
// A KPI here is in exactly one of three states:
//
//   computed        — every input came from a live read model, number is real
//   no_data         — the source view is live and correct but holds nothing yet
//   not_computable  — the input does not exist in this repo today, and the
//                     tile says what would make it exist
//
// A KPI whose source view FAILED to read is `not_computable`, never a zero:
// "0 overdue items" and "we couldn't read the tasks view" are different
// claims, and only one of them is a KPI.
//
// MC.2's marketing KPIs are consumed from their own definitions rather than
// restated here (one formula, one home). MC.1's sales KPIs are not defined
// yet, so the two this panel would otherwise show are named as blocked
// instead of approximated.

import { MARKETING_KPIS } from "../kpis/marketingKpis";
import type {
  ActionItemsPanel,
  EsignPanel,
  PanelHeader,
  PanelStatus,
  PipelinePanel,
} from "./panels";

export type KpiStatus = "computed" | "no_data" | "not_computable";

export type KpiFormat = "currency" | "count";

export type KpiTile = {
  id: string;
  label: string;
  /** Null unless status is "computed". A blank tile is never a zero. */
  value: number | null;
  format: KpiFormat;
  status: KpiStatus;
  /** Where a computed number came from, or why there isn't one. */
  note: string;
  /** The PRD/queue item that would make an uncomputable KPI computable. */
  unblockedBy: string | null;
};

export type KpiSummaryPanel = {
  id: "kpi_summary";
  label: string;
  /** Mirrors the panel vocabulary: "live" once anything at all is computed. */
  status: PanelStatus;
  todayISO: string;
  tiles: KpiTile[];
  counts: { computed: number; noData: number; notComputable: number };
};

/** The read model behind a tile is missing/failed rather than merely empty. */
function unreadable(id: string, label: string, format: KpiFormat, view: string): KpiTile {
  return {
    id,
    label,
    value: null,
    format,
    status: "not_computable",
    note: `Couldn't read ${view} just now, so there is no number to show — this is a failed read, not a zero.`,
    unblockedBy: null,
  };
}

function computed(
  id: string,
  label: string,
  value: number,
  format: KpiFormat,
  note: string
): KpiTile {
  return { id, label, value, format, status: "computed", note, unblockedBy: null };
}

/** Source view is live and correct, but genuinely holds nothing yet. */
function noData(id: string, label: string, format: KpiFormat, note: string): KpiTile {
  return { id, label, value: null, format, status: "no_data", note, unblockedBy: null };
}

function blocked(
  id: string,
  label: string,
  format: KpiFormat,
  note: string,
  unblockedBy: string
): KpiTile {
  return { id, label, value: null, format, status: "not_computable", note, unblockedBy };
}

function pipelineTiles(panel: PipelinePanel | null): KpiTile[] {
  if (!panel) {
    return [
      unreadable("open_pipeline_value", "Still in play", "currency", "the pipeline view"),
      unreadable("open_deals", "Open deals", "count", "the pipeline view"),
      unreadable("won_value", "Won (paid)", "currency", "the pipeline view"),
    ];
  }
  if (panel.status !== "live") {
    const why = panel.note ?? "no deals in the pipeline view yet.";
    return [
      noData("open_pipeline_value", "Still in play", "currency", why),
      noData("open_deals", "Open deals", "count", why),
      noData("won_value", "Won (paid)", "currency", why),
    ];
  }
  // Rob's 7/23 COMPED ruling carries into the KPI: dollars are dollars, and a
  // deal with no value set is named as excluded rather than counted as zero.
  const excluded: string[] = [];
  if (panel.totals.unvalued > 0) excluded.push(`${panel.totals.unvalued} with no value set`);
  if (panel.totals.comped > 0) excluded.push(`${panel.totals.comped} COMPED`);
  const caveat = excluded.length > 0 ? ` Excludes ${excluded.join(" and ")}.` : "";
  return [
    computed(
      "open_pipeline_value",
      "Still in play",
      panel.totals.openValue,
      "currency",
      `Dollars on deals still in play (won and lost stages removed; stalled deals stay in).${caveat}`
    ),
    computed(
      "open_deals",
      "Open deals",
      panel.totals.openDeals,
      "count",
      `Deals in a stage that is still in play, of ${panel.totals.deals} total.`
    ),
    computed(
      "won_value",
      "Won (paid)",
      panel.totals.wonValue,
      "currency",
      `Dollars on deals that reached paid.${caveat}`
    ),
  ];
}

function actionItemTiles(panel: ActionItemsPanel | null): KpiTile[] {
  if (!panel) {
    return [
      unreadable("overdue_action_items", "Overdue action items", "count", "the action-items view"),
      unreadable("due_today_action_items", "Due today", "count", "the action-items view"),
    ];
  }
  if (panel.status !== "live") {
    const why = panel.note ?? "no open action items in the view yet.";
    return [
      noData("overdue_action_items", "Overdue action items", "count", why),
      noData("due_today_action_items", "Due today", "count", why),
    ];
  }
  return [
    computed(
      "overdue_action_items",
      "Overdue action items",
      panel.totals.overdue,
      "count",
      `Open items past their due date, of ${panel.totals.open} open. Undated items are not counted as on time.`
    ),
    computed(
      "due_today_action_items",
      "Due today",
      panel.totals.dueToday,
      "count",
      "Open items due on today's Eastern date."
    ),
  ];
}

function esignTiles(panel: EsignPanel | null): KpiTile[] {
  if (!panel) {
    return [
      unreadable("agreements_out", "Out for signature", "count", "the e-sign view"),
      unreadable("awaiting_countersign", "Awaiting our countersign", "count", "the e-sign view"),
    ];
  }
  if (panel.status !== "live") {
    const why = panel.note ?? "no documents in the e-sign store yet.";
    return [
      noData("agreements_out", "Out for signature", "count", why),
      noData("awaiting_countersign", "Awaiting our countersign", "count", why),
    ];
  }
  return [
    computed(
      "agreements_out",
      "Out for signature",
      panel.outstanding,
      "count",
      "Signature requests sent or viewed, still unsigned."
    ),
    computed(
      "awaiting_countersign",
      "Awaiting our countersign",
      panel.awaitingCountersignature,
      "count",
      "Signed by the counterparty, still waiting on us."
    ),
  ];
}

/** MC.1's seven sales KPIs are not defined yet, and two of them would sit on
 *  this panel. They are named as blocked rather than approximated — a weighted
 *  pipeline number needs Rob's stage→probability map, and inventing one would
 *  put a fabricated dollar figure on a dashboard he quotes from. */
function salesKpiTiles(): KpiTile[] {
  return [
    blocked(
      "weighted_pipeline_value",
      "Weighted pipeline",
      "currency",
      "Needs the stage→probability map, which MC.1 owes and Rob has to approve. Guessing weights would put an invented dollar figure on the dashboard.",
      "Task MC.1 (define the 7 sales KPIs; stage→probability map approved by Rob)"
    ),
    blocked(
      "avg_sales_cycle",
      "Average sales cycle",
      "count",
      "Needs per-deal stage history (first touch → close), not just the current stage the pipeline view exposes.",
      "Task MC.1 + a stage-history source"
    ),
  ];
}

/** Revenue and AR have no backing store at all — the invoicing ledger is a CSV
 *  in the contracts repo (MC.7 GATE G3), so this is blocked, not empty. */
function invoicingTiles(unavailable: readonly PanelHeader[]): KpiTile[] {
  const ar = unavailable.find((h) => h.id === "rm_invoices_ar");
  if (!ar) return [];
  return [
    blocked(
      "ar_outstanding",
      "Outstanding AR",
      "currency",
      ar.note ?? "no invoicing store exists in this repo yet.",
      ar.unblockedBy ?? "MC.9 invoicing leg"
    ),
  ];
}

/** MC.2's marketing KPIs, consumed from their own definitions. None claims to
 *  be computable today; if one ever does, it says it needs wiring here rather
 *  than silently vanishing from the panel. */
function marketingKpiTiles(): KpiTile[] {
  return MARKETING_KPIS.map((kpi) =>
    blocked(
      `marketing_${kpi.id}`,
      kpi.label,
      "count",
      kpi.coverage === "computable_today"
        ? `${kpi.coverageNote} Its inputs are live, but nothing wires them into this panel yet.`
        : kpi.coverageNote,
      kpi.coverage === "blocked_on_ingestion"
        ? "Task MC.9 (booking/source ingestion)"
        : kpi.coverage === "manual_input_needed"
          ? "a human entering the missing input (no system emits it)"
          : "Task MC.12 (wire the live inputs into this panel)"
    )
  );
}

export function buildKpiSummaryPanel(input: {
  pipeline: PipelinePanel | null;
  actionItems: ActionItemsPanel | null;
  esign: EsignPanel | null;
  unavailable: readonly PanelHeader[];
  todayISO: string;
}): KpiSummaryPanel {
  const tiles = [
    ...pipelineTiles(input.pipeline),
    ...actionItemTiles(input.actionItems),
    ...esignTiles(input.esign),
    ...salesKpiTiles(),
    ...invoicingTiles(input.unavailable),
    ...marketingKpiTiles(),
  ];
  const counts = {
    computed: tiles.filter((t) => t.status === "computed").length,
    noData: tiles.filter((t) => t.status === "no_data").length,
    notComputable: tiles.filter((t) => t.status === "not_computable").length,
  };
  return {
    id: "kpi_summary",
    label: "KPI summary",
    // "live" means at least one KPI is a real number. If none is, the panel
    // says so as a whole rather than presenting a grid of blanks as a summary.
    status: counts.computed > 0 ? "live" : "empty",
    todayISO: input.todayISO,
    tiles,
    counts,
  };
}
