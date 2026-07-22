// PRD Task 1.8: Referral-Chase Queue — pure per CR-3. The RULES ARE THIS
// CODE (docs/plans/REFERRAL-CHASE-SPEC.md narrates; it never re-states
// thresholds). A "promised intro" is an activity whose sourceContext carries
// `promised_intro: { expected_by: "YYYY-MM-DD", of?: string }`, anchored to
// the promiser (personId or orgId — the door-opener). The promise is CHASED
// when expected_by has PASSED (< today; due-today is not yet a broken
// promise, mirroring the Task 3.4 watcher convention) and no referred lead
// has been logged since. It CLEARS when a lead with referredById === the
// promiser is logged at/after the promise was made — Person.referredById is
// the existing door-opener pointer, so no new schema. Nothing here reads the
// clock: callers pass `today` (Rob's ET day via todayInET). demo-* rows
// never surface (Q4 precedent).

import type { Activity } from "../types";

// Minimal lead shape: Person rows don't expose created_at in lib/types, so
// callers pass it explicitly (supabase `created_at`; a lead with no
// loggedAt is conservatively treated as PRE-existing — it cannot clear a
// promise, because we can't prove it came after it).
export type ReferredLead = {
  id: string;
  referredById?: string;
  loggedAt?: string; // ISO timestamp the lead entered the CRM
};

export type ChaseItem = {
  promiseActivityId: string;
  personId?: string; // promiser (person)
  orgId?: string; // promiser (org)
  dealId?: string;
  expectedBy: string; // YYYY-MM-DD
  daysOverdue: number;
  reason: string; // deterministic — two runs on the same input match exactly
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const isDemo = (id: string | undefined) => !!id && id.startsWith("demo-");

function daysBetween(isoEarlier: string, todayISO: string): number {
  const a = new Date(`${isoEarlier}T12:00:00Z`).getTime();
  const b = new Date(`${todayISO}T12:00:00Z`).getTime();
  return Math.round((b - a) / DAY_MS);
}

type PromisedIntro = { expected_by: string; of?: string };

// Narrow sourceContext.promised_intro without trusting the payload shape.
export function promisedIntroOf(a: Activity): PromisedIntro | null {
  const raw = a.sourceContext?.["promised_intro"];
  if (!raw || typeof raw !== "object") return null;
  const expectedBy = (raw as Record<string, unknown>)["expected_by"];
  if (typeof expectedBy !== "string" || !ISO_DATE.test(expectedBy)) return null;
  const of = (raw as Record<string, unknown>)["of"];
  return { expected_by: expectedBy, of: typeof of === "string" ? of : undefined };
}

// The queue: every past-due promise with no referred lead logged since,
// ordered most-overdue first (stable by activity id within a day).
export function referralChaseItems(
  activities: Activity[],
  leads: ReferredLead[],
  today: string
): ChaseItem[] {
  if (!ISO_DATE.test(today)) {
    throw new Error(`referralChaseItems: invalid today "${today}"`);
  }
  const items: ChaseItem[] = [];
  for (const a of activities) {
    if (isDemo(a.id) || isDemo(a.personId) || isDemo(a.orgId) || isDemo(a.dealId))
      continue;
    const promise = promisedIntroOf(a);
    if (!promise) continue;
    if (promise.expected_by >= today) continue; // not yet passed
    const promiser = a.personId ?? a.orgId;
    if (!promiser) continue; // a promise with no promiser can't be chased
    const madeAt = new Date(a.occurredAt).getTime();
    const delivered = leads.some(
      (l) =>
        !isDemo(l.id) &&
        l.referredById === promiser &&
        !!l.loggedAt &&
        Number.isFinite(madeAt) &&
        new Date(l.loggedAt).getTime() >= madeAt
    );
    if (delivered) continue;
    const days = daysBetween(promise.expected_by, today);
    items.push({
      promiseActivityId: a.id,
      personId: a.personId,
      orgId: a.orgId,
      dealId: a.dealId,
      expectedBy: promise.expected_by,
      daysOverdue: days,
      reason: `Promised intro${promise.of ? ` (${promise.of})` : ""} expected by ${promise.expected_by} — ${days}d past, no referred lead logged`,
    });
  }
  return items.sort(
    (x, y) =>
      x.expectedBy.localeCompare(y.expectedBy) ||
      x.promiseActivityId.localeCompare(y.promiseActivityId)
  );
}
