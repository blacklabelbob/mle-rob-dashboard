import type {
  Activity,
  ActivitySource,
  ActivityType,
  Deal,
  DealStage,
  RoutingLane,
  Task,
  TaskStatus,
} from "@/lib/types";

// Pure row↔type mappers for the 0005_crm_core tables (Task 2.2/2.3 seam).
// Same idiom as supabaseStore's toPerson/fromPerson: DB null → undefined on
// read, undefined → null on write; jsonb defaults stay {} not undefined.
// The column sets emitted by the from* mappers are gate-tested against the
// 0005 DDL in lib/__tests__/crm.test.ts — schema drift fails the suite.

export function toDeal(r: any): Deal {
  return {
    id: r.id,
    personId: r.person_id ?? undefined,
    orgId: r.org_id ?? undefined,
    verticalId: r.vertical_id ?? undefined,
    ownerId: r.owner_id ?? undefined,
    name: r.name,
    stage: r.stage,
    value: r.value === null || r.value === undefined ? undefined : Number(r.value),
    routingLane: r.routing_lane ?? undefined,
    referralSourced: r.referral_sourced,
    keyDates: r.key_dates ?? {},
    estimate: r.estimate ?? undefined,
    bookProtected: r.book_protected,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function fromDeal(d: Deal) {
  return {
    id: d.id,
    person_id: d.personId ?? null,
    org_id: d.orgId ?? null,
    vertical_id: d.verticalId ?? null,
    owner_id: d.ownerId ?? null,
    name: d.name,
    stage: d.stage,
    value: d.value ?? null,
    routing_lane: d.routingLane ?? null,
    referral_sourced: d.referralSourced,
    key_dates: d.keyDates ?? {},
    estimate: d.estimate ?? null,
    book_protected: d.bookProtected,
    notes: d.notes ?? null,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

export function toActivity(r: any): Activity {
  return {
    id: r.id,
    personId: r.person_id ?? undefined,
    orgId: r.org_id ?? undefined,
    dealId: r.deal_id ?? undefined,
    createdBy: r.created_by ?? undefined,
    type: r.type,
    source: r.source,
    sourceContext: r.source_context ?? {},
    summary: r.summary ?? undefined,
    actionItems: r.action_items ?? undefined,
    buyingSignals: r.buying_signals ?? undefined,
    recordingUrl: r.recording_url ?? undefined,
    transcriptUrl: r.transcript_url ?? undefined,
    bookProtected: r.book_protected,
    occurredAt: r.occurred_at,
    createdAt: r.created_at,
  };
}

export function fromActivity(a: Activity) {
  return {
    id: a.id,
    person_id: a.personId ?? null,
    org_id: a.orgId ?? null,
    deal_id: a.dealId ?? null,
    created_by: a.createdBy ?? null,
    type: a.type,
    source: a.source,
    source_context: a.sourceContext ?? {},
    summary: a.summary ?? null,
    action_items: a.actionItems ?? null,
    buying_signals: a.buyingSignals ?? null,
    recording_url: a.recordingUrl ?? null,
    transcript_url: a.transcriptUrl ?? null,
    book_protected: a.bookProtected,
    occurred_at: a.occurredAt,
    created_at: a.createdAt,
  };
}

export function toTask(r: any): Task {
  return {
    id: r.id,
    activityId: r.activity_id ?? undefined,
    dealId: r.deal_id ?? undefined,
    personId: r.person_id ?? undefined,
    assignedTo: r.assigned_to ?? undefined,
    title: r.title,
    detail: r.detail ?? undefined,
    status: r.status,
    dueDate: r.due_date ?? undefined,
    bookProtected: r.book_protected,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function fromTask(t: Task) {
  return {
    id: t.id,
    activity_id: t.activityId ?? null,
    deal_id: t.dealId ?? null,
    person_id: t.personId ?? null,
    assigned_to: t.assignedTo ?? null,
    title: t.title,
    detail: t.detail ?? null,
    status: t.status,
    due_date: t.dueDate ?? null,
    book_protected: t.bookProtected,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}
// Union values duplicated here as runtime arrays so the gate test can compare
// them against the 0005 check constraints (types are erased at runtime).
export const DEAL_STAGES = [
  "new_lead",
  "contacted",
  "meeting_booked",
  "meeting_held",
  "quote_sent",
  "negotiating",
  "signed",
  "invoiced",
  "paid",
  "delivering",
  "stalled",
  "lost",
] as const satisfies readonly DealStage[];
export const ROUTING_LANES = [
  "auto_close",
  "rep",
  "bounty_hunter",
  "booker",
] as const satisfies readonly RoutingLane[];
export const ACTIVITY_TYPES = [
  "call",
  "email",
  "meeting",
  "note",
  "status_change",
] as const satisfies readonly ActivityType[];
export const ACTIVITY_SOURCES = [
  "manual",
  "n8n",
  "api",
  "aidre",
  "dialer",
] as const satisfies readonly ActivitySource[];
export const TASK_STATUSES = ["open", "done", "cancelled"] as const satisfies readonly TaskStatus[];

// Stage-only patch gate for the /deals drag board. Refusing value/keyDates
// (and everything else) lives HERE as code, not in route prose: any key
// beyond {id, stage} rejects the whole request — a payload that smuggles
// value alongside a stage change never reaches the database.
export type DealStagePatch =
  | { ok: true; id: string; stage: DealStage }
  | { ok: false; error: string };

export function parseDealStagePatch(body: unknown): DealStagePatch {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "need { id, stage }" };
  }
  const extras = Object.keys(body).filter((k) => k !== "id" && k !== "stage");
  if (extras.length) {
    return { ok: false, error: `stage-only route — refused fields: ${extras.join(", ")}` };
  }
  const { id, stage } = body as { id?: unknown; stage?: unknown };
  if (typeof id !== "string" || !id) return { ok: false, error: "need { id, stage }" };
  if (typeof stage !== "string" || !(DEAL_STAGES as readonly string[]).includes(stage)) {
    return { ok: false, error: `stage must be one of: ${DEAL_STAGES.join(", ")}` };
  }
  return { ok: true, id, stage: stage as DealStage };
}

// Compile-time exhaustiveness: if a union gains a member the arrays lack,
// these lines stop compiling (the arrays' DDL match is tested at runtime).
type AssertSame<A, B extends A> = B extends A ? (A extends B ? true : never) : never;
const _stages: AssertSame<DealStage, (typeof DEAL_STAGES)[number]> = true;
const _lanes: AssertSame<RoutingLane, (typeof ROUTING_LANES)[number]> = true;
const _types: AssertSame<ActivityType, (typeof ACTIVITY_TYPES)[number]> = true;
const _sources: AssertSame<ActivitySource, (typeof ACTIVITY_SOURCES)[number]> = true;
const _statuses: AssertSame<TaskStatus, (typeof TASK_STATUSES)[number]> = true;
void _stages, _lanes, _types, _sources, _statuses;
