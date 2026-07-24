// PRD Task MC.12 (base 9.1): the ops panels — Pipeline, Onboarding/E-sign,
// Action Items (ours/theirs), Invoicing/AR, KPI Summary. This module is the
// SHAPING layer and nothing else: rows in (exactly the columns MC.8's
// contract promises), panel view-models out. Pure per CR-3 — no clock, no
// network, no Next imports; `todayISO` is passed in (Rob's ET day, computed
// by the caller with todayInET, same anchor as overdue.ts).
//
// Honest coverage carries through from the contract: a read model whose
// source data does not exist gets an `unavailable` panel that names what
// unblocks it, and a live-but-empty view gets `empty` with its reason — never
// a zero-filled panel that reads like a working feature.

import { DEAL_STAGES } from "../crm";
import { REQUEST_STATUSES } from "../esign/status";
import type { DealStage } from "../types";
import { getReadModel, type ReadModelId } from "./contract";

export type PanelStatus =
  /** View exists and returned rows. */
  | "live"
  /** View exists and is correct, but there is nothing in it yet. */
  | "empty"
  /** No backing store — the panel cannot be built at all today. */
  | "unavailable";

export type PanelHeader = {
  id: ReadModelId;
  label: string;
  status: PanelStatus;
  /** Why it is empty/unavailable, verbatim from the contract. Null when live. */
  note: string | null;
  /** Queue/PRD item that unblocks it, when blocked. */
  unblockedBy: string | null;
};

/** Header for a read model that has no rows to shape — the honest states. */
export function panelHeader(id: ReadModelId, rowCount: number): PanelHeader {
  const model = getReadModel(id);
  if (model.coverage === "blocked_no_source") {
    return {
      id,
      label: model.label,
      status: "unavailable",
      note: model.coverageNote,
      unblockedBy: model.unblockedBy,
    };
  }
  if (rowCount === 0) {
    return {
      id,
      label: model.label,
      status: "empty",
      note: model.coverageNote,
      unblockedBy: model.unblockedBy,
    };
  }
  return { id, label: model.label, status: "live", note: null, unblockedBy: null };
}

// ── Pipeline ────────────────────────────────────────────────────────────────

export type RmPipelineRow = {
  deal_id: string;
  deal_name: string;
  stage: string;
  value: number | null;
  owner: string | null;
  counterparty_name: string | null;
  stage_entered_at: string | null;
};

/** Stages that are no longer in play — excluded from the open-pipeline total
 *  so a won deal can't inflate "money still on the table". `stalled` stays
 *  OPEN on purpose: a stalled deal is un-stuck, not gone (todayRules chases it). */
export const CLOSED_STAGES: readonly DealStage[] = ["paid", "lost"];

export type StageBucket = {
  stage: DealStage;
  count: number;
  /** Sum of real dollar values only. COMPED ($0) and unvalued (null) excluded. */
  valueTotal: number;
  /** Rob's 7/23 ruling: a $0 deal is COMPED, and renders as COMPED, not $0. */
  comped: number;
  /** No value recorded — counted, never silently treated as zero. */
  unvalued: number;
  closed: boolean;
};

export type PipelinePanel = PanelHeader & {
  stages: StageBucket[];
  totals: {
    deals: number;
    openDeals: number;
    /** Dollars in stages still in play. */
    openValue: number;
    /** Dollars already closed-won (paid). */
    wonValue: number;
    comped: number;
    unvalued: number;
  };
  /** Stages the view returned that are not on the canonical ladder. Should be
   *  empty (0005 has a check constraint) — surfaced, not swallowed, if not. */
  unknownStages: string[];
};

export function buildPipelinePanel(rows: readonly RmPipelineRow[]): PipelinePanel {
  const buckets = new Map<DealStage, StageBucket>();
  for (const stage of DEAL_STAGES) {
    buckets.set(stage, {
      stage,
      count: 0,
      valueTotal: 0,
      comped: 0,
      unvalued: 0,
      closed: CLOSED_STAGES.includes(stage),
    });
  }
  const unknownStages: string[] = [];

  for (const row of rows) {
    const bucket = buckets.get(row.stage as DealStage);
    if (!bucket) {
      if (!unknownStages.includes(row.stage)) unknownStages.push(row.stage);
      continue;
    }
    bucket.count += 1;
    if (row.value === null || row.value === undefined) bucket.unvalued += 1;
    else if (row.value === 0) bucket.comped += 1;
    else bucket.valueTotal += row.value;
  }

  const stages = [...buckets.values()];
  const counted = stages.reduce((n, b) => n + b.count, 0);
  return {
    ...panelHeader("rm_pipeline", counted),
    stages,
    totals: {
      deals: counted,
      openDeals: stages.filter((b) => !b.closed).reduce((n, b) => n + b.count, 0),
      openValue: stages.filter((b) => !b.closed).reduce((n, b) => n + b.valueTotal, 0),
      wonValue: stages.filter((b) => b.stage === "paid").reduce((n, b) => n + b.valueTotal, 0),
      comped: stages.reduce((n, b) => n + b.comped, 0),
      unvalued: stages.reduce((n, b) => n + b.unvalued, 0),
    },
    unknownStages,
  };
}

// ── Action items (ours / theirs) ────────────────────────────────────────────

export type RmActionItemRow = {
  task_id: string;
  title: string;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  deal_id: string | null;
  person_id: string | null;
};

/** `tasks.assigned_to` is free text until Phase-4 profiles (D-002), so
 *  ours-vs-theirs is a ROSTER match, not a foreign key. Everyone on this list
 *  is us; a name that is not on it is not silently assumed to be a customer —
 *  it lands in `external` and the panel prints the name so a typo'd "rob "
 *  shows up as what it is instead of quietly leaving our column. */
export const INTERNAL_ASSIGNEES: readonly string[] = ["rob", "will", "max"];

export type ActionItemSide = "ours" | "external" | "unassigned";

export type ActionItem = {
  taskId: string;
  title: string;
  dueDate: string | null;
  assignedTo: string | null;
  side: ActionItemSide;
  /** Null when the task has no due date — undated is not "on time". */
  daysOverdue: number | null;
};

export type ActionItemBucket = {
  side: ActionItemSide;
  count: number;
  overdue: number;
  dueToday: number;
  upcoming: number;
  undated: number;
  items: ActionItem[];
};

export type ActionItemsPanel = PanelHeader & {
  buckets: ActionItemBucket[];
  totals: { open: number; overdue: number; dueToday: number };
  /** Distinct non-roster assignee strings, so Rob can eyeball a bad value. */
  externalAssignees: string[];
};

export function classifyAssignee(assignedTo: string | null): ActionItemSide {
  const name = (assignedTo ?? "").trim().toLowerCase();
  if (!name) return "unassigned";
  return INTERNAL_ASSIGNEES.includes(name) ? "ours" : "external";
}

function daysBetweenISO(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T12:00:00Z`).getTime();
  const b = new Date(`${toISO}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function buildActionItemsPanel(
  rows: readonly RmActionItemRow[],
  todayISO: string
): ActionItemsPanel {
  const order: ActionItemSide[] = ["ours", "external", "unassigned"];
  const buckets = new Map<ActionItemSide, ActionItemBucket>(
    order.map((side) => [
      side,
      { side, count: 0, overdue: 0, dueToday: 0, upcoming: 0, undated: 0, items: [] },
    ])
  );
  const externalAssignees: string[] = [];

  // Only OPEN work is an action item — done/cancelled rows are history.
  const open = rows.filter((r) => r.status === "open");

  for (const row of open) {
    const side = classifyAssignee(row.assigned_to);
    const bucket = buckets.get(side)!;
    const daysOverdue = row.due_date ? daysBetweenISO(row.due_date, todayISO) : null;
    bucket.count += 1;
    if (daysOverdue === null) bucket.undated += 1;
    else if (daysOverdue > 0) bucket.overdue += 1;
    else if (daysOverdue === 0) bucket.dueToday += 1;
    else bucket.upcoming += 1;
    bucket.items.push({
      taskId: row.task_id,
      title: row.title,
      dueDate: row.due_date,
      assignedTo: row.assigned_to,
      side,
      daysOverdue,
    });
    if (side === "external") {
      const raw = (row.assigned_to ?? "").trim();
      if (raw && !externalAssignees.includes(raw)) externalAssignees.push(raw);
    }
  }

  // Most-overdue first, then soonest due, then undated last.
  for (const bucket of buckets.values()) {
    bucket.items.sort((a, b) => {
      if (a.daysOverdue === null) return b.daysOverdue === null ? 0 : 1;
      if (b.daysOverdue === null) return -1;
      return b.daysOverdue - a.daysOverdue;
    });
  }

  const all = [...buckets.values()];
  return {
    ...panelHeader("rm_action_items", open.length),
    buckets: all,
    totals: {
      open: all.reduce((n, b) => n + b.count, 0),
      overdue: all.reduce((n, b) => n + b.overdue, 0),
      dueToday: all.reduce((n, b) => n + b.dueToday, 0),
    },
    externalAssignees,
  };
}

// ── Onboarding / e-sign ─────────────────────────────────────────────────────

export type RmEsignRow = {
  document_id: string;
  title: string;
  phase: string | null;
  document_status: string;
  request_status: string | null;
  signer_name: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  countersigned_at: string | null;
};

export type EsignPanel = PanelHeader & {
  /** Counts by request status, in ladder order (lib/esign/status.ts).
   *  A document with no request yet counts as `no_request` — an unsent
   *  agreement is a real state, not a pending one. */
  byStatus: { status: string; count: number }[];
  /** Signed by the counterparty, still waiting on OUR countersignature —
   *  derived from countersigned_at, never a sixth status (0010 decision). */
  awaitingCountersignature: number;
  outstanding: number;
  rows: RmEsignRow[];
};

/** Document rows the panel received with no signature request attached. */
export const NO_REQUEST = "no_request";

/** The ladder as the panel orders it. REQUEST_STATUSES is the one definition
 *  (lib/esign/status.ts, pinned against 0008's check constraint) — this array
 *  only adds the no-request bucket in front of it. */
export const ESIGN_STATUS_ORDER: readonly string[] = [NO_REQUEST, ...REQUEST_STATUSES];

export function buildEsignPanel(rows: readonly RmEsignRow[]): EsignPanel {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const status = row.request_status ?? NO_REQUEST;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const known = ESIGN_STATUS_ORDER.filter((s) => counts.has(s)).map((status) => ({
    status,
    count: counts.get(status)!,
  }));
  const extra = [...counts.keys()]
    .filter((s) => !ESIGN_STATUS_ORDER.includes(s))
    .sort()
    .map((status) => ({ status, count: counts.get(status)! }));

  return {
    ...panelHeader("rm_esign_status", rows.length),
    byStatus: [...known, ...extra],
    awaitingCountersignature: rows.filter(
      (r) => r.signed_at !== null && r.countersigned_at === null
    ).length,
    outstanding: rows.filter(
      (r) => r.request_status === "pending" || r.request_status === "viewed"
    ).length,
    rows: [...rows],
  };
}

// ── Blocked panels ──────────────────────────────────────────────────────────

/** Invoices/AR and Delivery Phases have no backing store (MC.7 GATE G3 and
 *  Q40 respectively). They get a real panel that says so — dropping them from
 *  the dashboard would hide the gap instead of naming it. */
export function buildUnavailablePanel(id: ReadModelId): PanelHeader {
  const header = panelHeader(id, 0);
  if (header.status !== "unavailable") {
    throw new Error(`${id} is not blocked — build its real panel, not a placeholder`);
  }
  return header;
}
