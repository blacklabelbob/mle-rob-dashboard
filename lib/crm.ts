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
    equity: r.equity ?? undefined, // Q41 inc.2 (0024) — paired with fromDeal below
    // Q40 inc.10 (0026). Narrowed, not cast: a column that somehow holds a 4 (or a
    // deployment predating 0026, where the key is simply absent) reads as "not
    // stated" rather than becoming a phase the blueprint cannot render.
    phase: r.phase === 1 || r.phase === 2 || r.phase === 3 ? r.phase : undefined,
    bookProtected: r.book_protected,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function fromDeal(d: Deal) {
  return {
    // Q40 inc.10: emitted ONLY when a phase was actually recorded. 0026 is committed
    // and not yet applied, so an unconditional `phase: null` would add an unknown
    // column to EVERY deal upsert and break saving a deal on a database that has not
    // taken the migration — a schema-pending field must not be able to break writes
    // that never mention it. When a human DOES set a phase against an un-migrated
    // database the write fails loudly, which is the correct outcome: the alternative
    // is dropping the rep's statement on the floor and showing them a saved deal.
    ...(d.phase === undefined ? {} : { phase: d.phase }),
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
    equity: d.equity ?? null,
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

// Q40 inc.11 — the phase setter's gate. Same shape as the stage gate and for
// the same reason: the phase a human states is the input to the Phase 2 ROI
// target, so the payload that carries it may carry NOTHING else. A request
// that smuggles `value` alongside a phase is refused whole, not stripped.
//
// `phase: null` is a first-class value, not a missing one: a rep who set the
// wrong phase must be able to take it back to "unstated". Absent key ≠ null —
// omitting `phase` is a malformed request, clearing it is a deliberate one.
export type DealPhasePatch =
  | { ok: true; id: string; phase: 1 | 2 | 3 | null }
  | { ok: false; error: string };

export function parseDealPhasePatch(body: unknown): DealPhasePatch {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "need { id, phase }" };
  }
  const extras = Object.keys(body).filter((k) => k !== "id" && k !== "phase");
  if (extras.length) {
    return { ok: false, error: `phase-only route — refused fields: ${extras.join(", ")}` };
  }
  const obj = body as { id?: unknown; phase?: unknown };
  if (typeof obj.id !== "string" || !obj.id) return { ok: false, error: "need { id, phase }" };
  if (!("phase" in obj)) return { ok: false, error: "need { id, phase }" };
  if (obj.phase === null) return { ok: true, id: obj.id, phase: null };
  // Strings are refused rather than coerced: "2" arriving from a <select> that
  // forgot Number() must fail loudly here, not become a phase nobody typed.
  if (obj.phase !== 1 && obj.phase !== 2 && obj.phase !== 3) {
    return { ok: false, error: "phase must be 1, 2, 3, or null" };
  }
  return { ok: true, id: obj.id, phase: obj.phase };
}

// The phase is a claim about a paying agreement, so a change to it leaves the
// same kind of trace a stage change does — built HERE from the before/after
// the route read out of the database, never from client input. Clearing reads
// as "unstated" in the summary because "→ null" tells a human nothing.
export function buildPhaseChangeActivity(args: {
  dealId: string;
  from: 1 | 2 | 3 | null;
  to: 1 | 2 | 3 | null;
  at: string; // ISO timestamp passed in by the caller — no clock reads here
}): Record<string, unknown> | null {
  const { dealId, from, to, at } = args;
  if (from === to) return null; // no change → no audit row
  const label = (p: 1 | 2 | 3 | null) => (p === null ? "unstated" : `Phase ${p}`);
  return {
    id: `phase-${dealId}-${at}`,
    deal_id: dealId,
    type: "status_change",
    source: "manual",
    source_context: { field: "phase", from, to },
    summary: `Phase: ${label(from)} → ${label(to)}`,
    occurred_at: at,
  };
}

// Task 4.7 audit trail: every real stage change writes exactly one
// status_change activity. The row is built HERE from the before/after the
// route itself read out of the database — never from client input (the
// client only ever supplies { id, stage }). Deterministic id per
// (deal, instant) doubles as the idempotency key for the upsert.
export function buildStageChangeActivity(args: {
  dealId: string;
  from: DealStage;
  to: DealStage;
  at: string; // ISO timestamp passed in by the caller — no clock reads here
}): Record<string, unknown> | null {
  const { dealId, from, to, at } = args;
  if (from === to) return null; // no change → no audit row
  return {
    id: `stage-${dealId}-${at}`,
    deal_id: dealId,
    type: "status_change",
    source: "manual",
    source_context: { from, to },
    summary: `Stage: ${from} → ${to}`,
    occurred_at: at,
  };
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
