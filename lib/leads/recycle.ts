// PRD Task 5.4: Dead-lead recycling — pure per CR-3. The RULES ARE THIS
// CODE. A contact is a RECYCLE CANDIDATE when its last touch is >=180 days
// ago. "Touch" = the newest of: any activity anchored to the person (or to
// their org via orgId), any keyDates milestone, or the row's created_at
// (passed by the caller — Person in lib/types has no created_at, same
// convention as chaseQueue's ReferredLead). A contact with NO provable
// touch date is conservatively NEVER flagged — we can't prove staleness
// without a date (honest-over-convenient, chaseQueue precedent).
//
// Never candidates: demo-* rows (Q4 precedent), signed people and lit
// status (clients / actively referring — not dead leads), and contacts
// already carrying the [recycle_candidate ...] notes tag (idempotency for
// the cron that applies tags). Nothing here reads the clock: callers pass
// `today` (Rob's ET day via todayInET). Tag writes are inc.2 (cron); the
// weekly-digest surfacing in the DoD rides base-PRD digest infra (MC.15 /
// M4.3) which does not exist yet — this module is its single rule source.

import type { Activity, Person } from "../types";

// >=180: "no activity in 180 days" — a touch exactly 180 days ago means
// 180 full days of silence, which qualifies.
export const RECYCLE_STALE_DAYS = 180;

// Person rows don't expose created_at in lib/types — callers pass it
// (supabase `created_at`). Optional: absence just removes one anchor.
export type RecyclablePerson = Person & { createdAt?: string };

export type RecycleCandidate = {
  personId: string;
  lastTouch: string; // YYYY-MM-DD of the newest provable touch
  daysStale: number;
  reason: string; // deterministic — two runs on the same input match exactly
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const TAG_PREFIX = "[recycle_candidate";

const isDemo = (id: string | undefined) => !!id && id.startsWith("demo-");

// Normalize any ISO date/timestamp to its YYYY-MM-DD day; null if unusable.
function dayOf(iso: string | undefined): string | null {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  if (!ISO_DATE.test(day)) return null;
  return Number.isFinite(new Date(`${day}T12:00:00Z`).getTime()) ? day : null;
}

function daysBetween(isoEarlier: string, todayISO: string): number {
  const a = new Date(`${isoEarlier}T12:00:00Z`).getTime();
  const b = new Date(`${todayISO}T12:00:00Z`).getTime();
  return Math.round((b - a) / DAY_MS);
}

export const hasRecycleTag = (notes: string | undefined): boolean =>
  !!notes && notes.includes(TAG_PREFIX);

// The exact notes write the tagging cron (inc.2) applies — kept here so the
// tag format has one source. Appends `[recycle_candidate YYYY-MM-DD]`.
export function withRecycleTag(notes: string | undefined, today: string): string {
  const tag = `${TAG_PREFIX} ${today}]`;
  return notes && notes.trim().length > 0 ? `${notes} ${tag}` : tag;
}

// Newest provable touch day for a person, or null when nothing is provable.
export function lastTouchDay(
  person: RecyclablePerson,
  activities: Activity[]
): string | null {
  let newest: string | null = null;
  const consider = (iso: string | undefined) => {
    const day = dayOf(iso);
    if (day && (!newest || day > newest)) newest = day;
  };
  for (const a of activities) {
    const anchored =
      a.personId === person.id || (!!person.orgId && a.orgId === person.orgId);
    if (!anchored) continue;
    consider(a.occurredAt);
    consider(a.createdAt);
  }
  for (const d of Object.values(person.keyDates ?? {})) consider(d);
  consider(person.createdAt);
  return newest;
}

// Every dead lead worth recycling, most-stale first (stable by id).
export function findRecycleCandidates(
  people: RecyclablePerson[],
  activities: Activity[],
  today: string
): RecycleCandidate[] {
  if (!ISO_DATE.test(today)) {
    throw new Error(`findRecycleCandidates: invalid today "${today}"`);
  }
  const out: RecycleCandidate[] = [];
  for (const p of people) {
    if (isDemo(p.id)) continue;
    if (p.signed || p.status === "lit") continue; // client / active, not dead
    if (hasRecycleTag(p.notes)) continue; // already tagged — never re-flag
    const touch = lastTouchDay(p, activities);
    if (!touch) continue; // no provable date → never flagged
    const days = daysBetween(touch, today);
    if (days < RECYCLE_STALE_DAYS) continue;
    out.push({
      personId: p.id,
      lastTouch: touch,
      daysStale: days,
      reason: `No activity since ${touch} — ${days}d stale (>=${RECYCLE_STALE_DAYS}d) → recycle_candidate`,
    });
  }
  return out.sort(
    (x, y) =>
      x.lastTouch.localeCompare(y.lastTouch) ||
      x.personId.localeCompare(y.personId)
  );
}
