// PRD Task 1.7: "Who do I touch today" rules — pure per CR-3. The RULES ARE
// THIS CODE (docs/plans/TODAY-RULES-SPEC.md narrates; it never re-states
// thresholds). Nothing here reads the clock: callers pass `today` (Rob's ET
// calendar day via todayInET) and `now` for the 24h meeting window. demo-*
// rows never surface (Q4 precedent). Consumer: Task 2.6 /api/tasks/today
// (rep-facing worklist). Distinct from the Task 3.4 overdue WATCHER: that
// flags Rob's ledger (due < today only); this builds a rep's daily list and
// also surfaces due-TODAY — same tables, different audiences, both on
// purpose (see MC.3 reconciliation note in the spec).

import type { Activity, Deal, Task } from "../types";

export type TodayTrigger =
  | "next_step_overdue"
  | "next_step_due_today"
  | "meeting_unlogged"
  | "stage_aging";

export type TodayItem = {
  trigger: TodayTrigger;
  taskId?: string;
  activityId?: string;
  dealId?: string;
  personId?: string;
  orgId?: string;
  reason: string; // deterministic — two runs on the same input match exactly
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const isDemo = (id: string | undefined) => !!id && id.startsWith("demo-");

// Stage-aging thresholds (PRD Task 1.7 verbatim): days sitting in stage
// before the deal demands a touch. Until Task 4.7's audit trail lands,
// "entered stage" is proxied by deal.updatedAt — documented limitation.
export const STAGE_AGING_DAYS: Partial<Record<Deal["stage"], number>> = {
  contacted: 3,
  meeting_booked: 7,
  quote_sent: 5,
  negotiating: 7,
};

// Q45 / MASTER-VIEW-2.0-DESIGN §7b — `meeting_booked` ages on TWO tiers,
// because days-in-stage alone false-positives on a meeting legitimately
// booked a week out. PRIMARY: a meeting activity is linked → the clock is
// the meeting's own datetime + this grace (booked, then ghosted). FALLBACK:
// no datetime attached → plain STAGE_AGING_DAYS.meeting_booked days in
// stage. A future-dated meeting yields a negative age, so it never fires.
export const MEETING_BOOKED_GRACE_DAYS = 2;

// Meeting held but nothing logged after it within this window → trigger.
export const MEETING_LOG_WINDOW_MS = 24 * 60 * 60 * 1000;

function daysBetween(isoEarlier: string, todayISO: string): number {
  const a = new Date(`${isoEarlier.slice(0, 10)}T12:00:00Z`).getTime();
  const b = new Date(`${todayISO}T12:00:00Z`).getTime();
  return Math.round((b - a) / DAY_MS);
}

// Rule 1+2 — next-step due/overdue: open task with a due date ≤ today.
export function nextStepItems(tasks: Task[], today: string): TodayItem[] {
  if (!ISO_DATE.test(today)) {
    throw new Error(`nextStepItems: invalid today "${today}"`);
  }
  const items: TodayItem[] = [];
  for (const t of tasks) {
    if (t.status !== "open" || !t.dueDate) continue;
    if (isDemo(t.id) || isDemo(t.dealId) || isDemo(t.personId)) continue;
    const due = t.dueDate.slice(0, 10);
    if (!ISO_DATE.test(due) || due > today) continue;
    const overdue = due < today;
    items.push({
      trigger: overdue ? "next_step_overdue" : "next_step_due_today",
      taskId: t.id,
      dealId: t.dealId,
      personId: t.personId,
      reason: overdue
        ? `"${t.title}" was due ${due} — ${daysBetween(due, today)}d overdue`
        : `"${t.title}" is due today (${due})`,
    });
  }
  return items;
}

// Rule 3 — meeting-no-log >24h: a meeting happened, the window passed, and
// nothing was logged on the same anchor (activity after it, or any task
// created after it) — the rep owes the CRM a next step.
export function meetingUnloggedItems(
  activities: Activity[],
  tasks: Task[],
  now: Date
): TodayItem[] {
  const items: TodayItem[] = [];
  for (const m of activities) {
    if (m.type !== "meeting") continue;
    if (isDemo(m.id) || isDemo(m.dealId) || isDemo(m.personId)) continue;
    const held = new Date(m.occurredAt).getTime();
    if (!Number.isFinite(held) || now.getTime() - held < MEETING_LOG_WINDOW_MS)
      continue;
    const sameAnchor = (a: { dealId?: string; personId?: string; orgId?: string }) =>
      (!!m.dealId && a.dealId === m.dealId) ||
      (!!m.personId && a.personId === m.personId) ||
      (!!m.orgId && a.orgId === m.orgId);
    const logged =
      activities.some(
        (a) =>
          a.id !== m.id &&
          sameAnchor(a) &&
          new Date(a.occurredAt).getTime() > held
      ) ||
      tasks.some(
        (t) => sameAnchor(t) && new Date(t.createdAt).getTime() > held
      );
    if (logged) continue;
    items.push({
      trigger: "meeting_unlogged",
      activityId: m.id,
      dealId: m.dealId,
      personId: m.personId,
      orgId: m.orgId,
      reason: `Meeting on ${m.occurredAt.slice(0, 10)} has no log or next step >24h later`,
    });
  }
  return items;
}

// Latest meeting activity anchored to this deal — the booked-meeting datetime
// the primary tier clocks from. Anchor match mirrors meetingUnloggedItems.
function latestMeetingFor(deal: Deal, activities: Activity[]): Activity | undefined {
  let latest: Activity | undefined;
  for (const a of activities) {
    if (a.type !== "meeting" || isDemo(a.id)) continue;
    const anchored =
      a.dealId === deal.id ||
      (!!deal.personId && a.personId === deal.personId) ||
      (!!deal.orgId && a.orgId === deal.orgId);
    if (!anchored) continue;
    if (!latest || a.occurredAt > latest.occurredAt) latest = a;
  }
  return latest;
}

// Rule 4 — stage aging: deal sat in a thresholded stage too long. `activities`
// is optional: supplied, `meeting_booked` uses the primary (meeting-datetime)
// tier; omitted, every stage ages on days-in-stage alone.
export function stageAgingItems(
  deals: Deal[],
  today: string,
  activities: Activity[] = []
): TodayItem[] {
  if (!ISO_DATE.test(today)) {
    throw new Error(`stageAgingItems: invalid today "${today}"`);
  }
  const items: TodayItem[] = [];
  for (const d of deals) {
    if (isDemo(d.id) || isDemo(d.personId) || isDemo(d.orgId)) continue;
    const threshold = STAGE_AGING_DAYS[d.stage];
    if (!threshold) continue;

    const booked =
      d.stage === "meeting_booked" ? latestMeetingFor(d, activities) : undefined;
    const days = booked
      ? daysBetween(booked.occurredAt.slice(0, 10), today)
      : daysBetween(d.updatedAt.slice(0, 10), today);
    const limit = booked ? MEETING_BOOKED_GRACE_DAYS : threshold;
    if (days < limit) continue;

    items.push({
      trigger: "stage_aging",
      dealId: d.id,
      personId: d.personId,
      orgId: d.orgId,
      reason: booked
        ? `"${d.name}" meeting was ${booked.occurredAt.slice(0, 10)} (${days}d ago) and it's still in meeting_booked — held? log it or rebook`
        : `"${d.name}" has sat in ${d.stage} ${days}d (limit ${limit}d)`,
    });
  }
  return items;
}

// Composite worklist, deterministically ordered: overdue → due today →
// unlogged meetings → aging deals; stable by anchor id within each band.
export function whoDoITouchToday(
  input: {
    tasks: Task[];
    deals: Deal[];
    activities: Activity[];
  },
  today: string,
  now: Date
): TodayItem[] {
  const rank: Record<TodayTrigger, number> = {
    next_step_overdue: 0,
    next_step_due_today: 1,
    meeting_unlogged: 2,
    stage_aging: 3,
  };
  return [
    ...nextStepItems(input.tasks, today),
    ...meetingUnloggedItems(input.activities, input.tasks, now),
    ...stageAgingItems(input.deals, today, input.activities),
  ].sort(
    (a, b) =>
      rank[a.trigger] - rank[b.trigger] ||
      (a.taskId ?? a.activityId ?? a.dealId ?? "").localeCompare(
        b.taskId ?? b.activityId ?? b.dealId ?? ""
      )
  );
}
