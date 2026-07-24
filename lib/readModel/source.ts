// PRD Task MC.12 (base 9.2): the READ SEAM between the rm_* views and the
// panel shaping layer (lib/readModel/panels.ts). Everything a panel is allowed
// to touch passes through here, and the whitelist below is what makes MC.8's
// "panels read views ONLY, never base tables" enforceable in code instead of
// in a comment: `assertReadable` throws on `deals`, `people`, `tasks` — the
// exact names a future panel would reach for when a view is missing a column.
//
// The dashboard's DB identity is `dashboard_ro` (SELECT on the four rm_* views,
// no base-table grant of any kind — contract.ts DASHBOARD_RO_ROLE). That role
// is NOLOGIN by design in 0011, so the HTTP path still authenticates with the
// service key; this module is the code-side equivalent of the grant, and the
// column list it sends is generated from the contract, so a query can never ask
// for a column the contract does not promise.
//
// Pure per CR-3 apart from the injected reader: no clock (todayISO is passed
// in), no network of its own, no Next imports. The Supabase call lives behind
// the `ViewReader` function type so the shaping path is testable with rows
// captured verbatim from prod.

import {
  READ_MODELS,
  getReadModel,
  isCreatable,
  type ReadModelId,
} from "./contract";
import { buildKpiSummaryPanel, type KpiSummaryPanel } from "./kpiSummary";
import {
  buildActionItemsPanel,
  buildEsignPanel,
  buildPipelinePanel,
  buildUnavailablePanel,
  type ActionItemsPanel,
  type EsignPanel,
  type PanelHeader,
  type PipelinePanel,
  type RmActionItemRow,
  type RmEsignRow,
  type RmPipelineRow,
} from "./panels";

/** The only relations a panel may read. Derived from the contract, so a new
 *  read model is readable the moment it is creatable — and nothing else ever
 *  is. */
export const READABLE_VIEWS: readonly ReadModelId[] = READ_MODELS.filter(
  isCreatable
).map((m) => m.id);

/** Gate every read. Named tables and blocked read models both fail here. */
export function assertReadable(name: string): ReadModelId {
  const hit = READABLE_VIEWS.find((v) => v === name);
  if (!hit) {
    throw new Error(
      `read model seam: "${name}" is not a readable view — panels read ${READABLE_VIEWS.join(
        ", "
      )} and never base tables (MC.8 dashboard_ro posture)`
    );
  }
  return hit;
}

/** Exactly the columns the contract promises, in contract order. Generated
 *  rather than hand-listed so a query and the doc cannot drift. */
export function columnList(id: ReadModelId): string {
  const model = getReadModel(id);
  if (model.columns.length === 0) {
    throw new Error(`${id} has no columns — it is ${model.coverage}`);
  }
  return model.columns.map((c) => c.name).join(",");
}

export type ViewReadResult = {
  rows: readonly Record<string, unknown>[];
  error: string | null;
};

/** Injected data access: (view, columns) -> rows. The route supplies the
 *  Supabase-backed one; tests supply prod row fixtures. */
export type ViewReader = (
  view: ReadModelId,
  columns: string
) => Promise<ViewReadResult>;

export type PanelsPayload = {
  todayISO: string;
  pipeline: PipelinePanel | null;
  actionItems: ActionItemsPanel | null;
  esign: EsignPanel | null;
  /** Summary of the panels above plus the KPIs that aren't computable yet.
   *  Derived, never separately read — it can't disagree with the panels. */
  kpiSummary: KpiSummaryPanel;
  /** Real panels for the read models with no backing store — named, not
   *  dropped (MC.8 honest-coverage rule). */
  unavailable: PanelHeader[];
  /** A view that failed to read is reported as a failure, never as "empty" —
   *  an empty panel is a claim about the data, and we would not have one. */
  errors: { id: ReadModelId; message: string }[];
};

const BLOCKED_PANELS: readonly ReadModelId[] = READ_MODELS.filter(
  (m) => !isCreatable(m)
).map((m) => m.id);

/** Shape one view's rows, or record why we have none. */
async function read<T>(
  reader: ViewReader,
  id: ReadModelId,
  errors: { id: ReadModelId; message: string }[]
): Promise<readonly T[] | null> {
  const res = await reader(id, columnList(assertReadable(id)));
  if (res.error) {
    errors.push({ id, message: res.error });
    return null;
  }
  return res.rows as readonly T[];
}

/** The whole MC.12 read: three live views + the blocked models' honest
 *  headers. `todayISO` is Rob's ET day, computed by the caller (todayInET). */
export async function fetchPanels(
  reader: ViewReader,
  todayISO: string
): Promise<PanelsPayload> {
  const errors: { id: ReadModelId; message: string }[] = [];
  const [pipelineRows, actionRows, esignRows] = await Promise.all([
    read<RmPipelineRow>(reader, "rm_pipeline", errors),
    read<RmActionItemRow>(reader, "rm_action_items", errors),
    read<RmEsignRow>(reader, "rm_esign_status", errors),
  ]);

  const pipeline = pipelineRows ? buildPipelinePanel(pipelineRows) : null;
  const actionItems = actionRows ? buildActionItemsPanel(actionRows, todayISO) : null;
  const esign = esignRows ? buildEsignPanel(esignRows) : null;
  const unavailable = BLOCKED_PANELS.map(buildUnavailablePanel);

  return {
    todayISO,
    pipeline,
    actionItems,
    esign,
    kpiSummary: buildKpiSummaryPanel({ pipeline, actionItems, esign, unavailable, todayISO }),
    unavailable,
    errors,
  };
}

/** True when every view we tried to read failed — the difference between a
 *  degraded dashboard and a dead one. */
export function allReadsFailed(payload: PanelsPayload): boolean {
  return (
    payload.errors.length > 0 &&
    payload.pipeline === null &&
    payload.actionItems === null &&
    payload.esign === null
  );
}
