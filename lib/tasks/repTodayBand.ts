// Q46 R2 (rep cockpit wiring, research §5) — the pure seam that turns the
// company-wide `whoDoITouchToday` list into ONE REP'S band.
//
// `todayRules` is deliberately audience-free: it answers "what needs a touch
// today" across the whole company, and a `TodayItem` carries no rep. /rep is a
// single rep's screen, so something has to decide whose each item is. That
// decision is the part that can be wrong invisibly — a rep's queue quietly
// holding someone else's work, or quietly dropping their own — so it lives
// here, pure per CR-3 (no clock, no store, no network), and never inside a
// component.
//
// THREE OUTCOMES, NEVER TWO. An item is `mine`, or provably someone else's, or
// **unattributable** — anchored to rows that record no rep at all. Folding the
// third into "not mine" makes a rep's band silently incomplete: the work is
// real, it is nobody's on paper, and a queue that hides it is the reason it
// never gets done. Folding it into `mine` is the opposite lie. It gets its own
// bucket so the surface can show it as what it is.
//
// MATCHING IS EXACT (normalised), NEVER A PREFIX. `app/rep/page.tsx` books its
// queue with `assignedRep.startsWith("Jake")`; the day a "Jakeline Ruiz" is
// hired, every one of her accounts lands in Jake Torres's queue and nothing on
// the screen says so. Normalisation here is whitespace + case only — the two
// ways the same human's name is typed — and is pinned by test against the
// prefix hazard.

import type { Org, Person } from "../types";
import type { TodayItem } from "./todayRules";

export interface RepTodayBand {
  /** Items proven to belong to this rep, in `whoDoITouchToday` order. */
  mine: TodayItem[];
  /** Anchored only to rows that record NO rep — real work, owned by nobody. */
  unattributable: TodayItem[];
  /** Proven to belong to a different rep. A count, never their rows. */
  othersCount: number;
}

/** Whitespace + case only. Two spellings of one name, not two names. */
export function normalizeRep(name: string | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

type Owner = { rep: string } | "unowned";

/**
 * Whose item is this?
 *
 * PERSON FIRST, ORG ONLY AS FALLBACK: a person explicitly assigned to rep B
 * inside an org owned by rep A is rep B's — the narrower assignment is the
 * deliberate one. A person row that exists and records no rep is `unowned`
 * and does NOT fall through to the org, because "assigned to nobody" is a
 * recorded state, not a missing one.
 *
 * A personId with NO matching row is different: that is our data missing, not
 * an answer, so the item's other real anchor (the org) is still consulted.
 */
function ownerOf(
  item: TodayItem,
  people: Map<string, Person>,
  orgs: Map<string, Org>
): Owner {
  if (item.personId) {
    const person = people.get(item.personId);
    if (person) {
      const rep = normalizeRep(person.assignedRep);
      return rep ? { rep } : "unowned";
    }
  }
  if (item.orgId) {
    const org = orgs.get(item.orgId);
    if (org) {
      const rep = normalizeRep(org.assignedRep);
      return rep ? { rep } : "unowned";
    }
  }
  return "unowned";
}

/**
 * Split a `whoDoITouchToday` list into one rep's band.
 *
 * Input order is preserved verbatim — `whoDoITouchToday` already ranks by
 * trigger then anchor id, and re-sorting here would give /rep a different
 * priority order than /api/tasks/today for the same rows.
 *
 * An empty/blank `rep` yields an empty `mine` rather than matching every
 * unassigned row: a missing rep name is not a rep.
 */
export function repTodayBand(
  items: TodayItem[],
  rep: string,
  book: { people?: Person[]; orgs?: Org[] } = {}
): RepTodayBand {
  const me = normalizeRep(rep);
  const people = new Map((book.people ?? []).map((p) => [p.id, p]));
  const orgs = new Map((book.orgs ?? []).map((o) => [o.id, o]));

  const mine: TodayItem[] = [];
  const unattributable: TodayItem[] = [];
  let othersCount = 0;

  for (const item of items) {
    const owner = ownerOf(item, people, orgs);
    if (owner === "unowned") {
      unattributable.push(item);
      continue;
    }
    if (me && owner.rep === me) mine.push(item);
    else othersCount += 1;
  }

  return { mine, unattributable, othersCount };
}
