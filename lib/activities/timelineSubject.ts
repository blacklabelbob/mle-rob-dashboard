/**
 * Q89 inc.17 — who a timeline is FOR, and where a row can be pointed at.
 *
 * Two jobs, both of which were previously assumed rather than stated:
 *
 * 1. AN ACTIVITY BELONGS TO A PERSON *OR* AN ORG, AND THE FEED HAS TO SAY WHICH.
 *    Counted on prod, not assumed: all 4 meeting rows are filed against an org
 *    (`org_id` set, `person_id` null; 7 of the 13 activity rows overall are org-filed),
 *    and the company page asked the feed for `?person=C-2018`. That returns zero rows, and the
 *    timeline renders "Nothing logged yet" — a company with two filed meetings telling
 *    Rob nothing ever happened. A feed that answers the wrong question confidently is worse
 *    than one that errors, so the subject is now part of the request, not an assumption
 *    baked into a parameter name.
 *
 * 2. A ROW NEEDS A NAME BEFORE ANYTHING CAN LINK TO IT. inc.16 refused to stamp
 *    `provenance.url = /companies/C-2018#A-MTG-…` because that fragment had no target:
 *    the rows were keyed on array index and carried no id. `activityAnchorId` is the
 *    target's name, and it REFUSES ids that cannot be a safe DOM fragment rather than
 *    mangling them into one — a silently-rewritten anchor is a link that lands at the
 *    top of the page, which is the same class of defect as a link to a lie.
 *
 * Pure per CR-3: no clock, no network, no Supabase, no filesystem.
 */

export type TimelineSubject = { kind: "person" | "org"; id: string };

/**
 * The query string the activity feed is asked with. The subject kind is carried
 * explicitly so a caller cannot get the right answer for the wrong reason.
 */
export function activityFeedQuery(subject: TimelineSubject): string {
  return `${subject.kind}=${encodeURIComponent(subject.id)}`;
}

/** The column an activity row is filed under for this subject. */
export function activitySubjectColumn(kind: TimelineSubject["kind"]): "person_id" | "org_id" {
  return kind === "person" ? "person_id" : "org_id";
}

// Deliberately strict: exactly the shape our own ids take (P-1022, C-2018,
// A-MTG-2026-07-28-OMEGA, n8n-email-19fce65a18364b9c). Anything else — a space, a slash,
// a '#' — is refused rather than escaped, because the caller must be able to tell the
// difference between "this row can be linked to" and "this row got a link that goes
// somewhere else".
const SAFE_ANCHOR = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * The DOM id for an activity row, or null when the activity's id cannot safely be one.
 * Null means "do not stamp an anchor and do not publish a url to it" — never "make one up".
 */
export function activityAnchorId(activityId: string | undefined | null): string | null {
  if (typeof activityId !== "string") return null;
  const trimmed = activityId.trim();
  if (trimmed === "" || !SAFE_ANCHOR.test(trimmed)) return null;
  return trimmed;
}
