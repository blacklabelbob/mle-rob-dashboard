/**
 * Q67b — the render seam: given the server-rendered list and the state of a saved view,
 * what does the people table put on screen RIGHT NOW?
 *
 * Pure and stateless per CR-3 — no React, no fetch, no clock — because every wrong answer
 * here is a wrong answer a rep would believe. The three lies this file exists to refuse:
 *
 * 1. **The unfiltered list under a view's name.** `/people` renders every human server-side.
 *    If a view is in the URL and its first page has not landed, showing those rows means a
 *    "Signed roofers" header sitting above people who signed nothing. Rows the filter
 *    excludes are worse than no rows, so a loading view renders EMPTY, not the fallback.
 * 2. **A failure that looks like an empty segment.** If the view 400s or the link is
 *    malformed, the honest screen is empty rows plus the reason — never the full ledger
 *    silently restored, which reads as "your filter matched everything".
 * 3. **A deals view in the people table.** `deal`/`activity` rows have no `name`, no
 *    `status`, no `keyDates`: React renders them as a wall of blanks with no error. A view
 *    whose target this table cannot draw is refused BY NAME, with where to open it.
 *
 * The fallback list is used for exactly one state — no view at all — which is also the
 * state `/people` is in every time it loads today. Nothing regresses for a rep who never
 * touches a view.
 */

import type { Person } from "@/lib/types";
import type { FilterTarget } from "./ast";
import type { ViewPageState } from "./pageState";

/**
 * The two targets this table can draw. Both map to `Person` (`org` through `toOrgPerson`,
 * which is what puts the "biz" badge on a company) — see `rows.ts`.
 */
export const PERSON_SHAPED_TARGETS: readonly FilterTarget[] = ["person", "org"] as const;

export function isPersonShapedTarget(target: FilterTarget): boolean {
  return PERSON_SHAPED_TARGETS.includes(target);
}

/** Where a target that this table cannot draw should be opened instead. */
const TARGET_HOME: Record<string, string> = {
  deal: "the Deals page",
  activity: "the Activity page",
};

export type TableRowsView = {
  /** What to render. Empty is a real answer — see the header comment. */
  rows: Person[];
  /** The saved view's name, or `null` when no view is in play (the plain ledger). */
  viewName: string | null;
  /** True while the first page of a view is in flight — the table shows a loading state. */
  loading: boolean;
  /** True while a LATER page is in flight — rows stay on screen, the button spins. */
  loadingMore: boolean;
  /** Why the table is empty, in a rep's words. `null` when nothing went wrong. */
  error: string | null;
  /** A `Load more` button is only honest when the server said there IS more. */
  canLoadMore: boolean;
  /** True when a view is driving the rows (or trying to) — the banner shows. */
  filtered: boolean;
};

/**
 * Fold the fallback list, the fetch state and any URL error into one render decision.
 *
 * `urlError` comes from `readViewSource` throwing on a malformed address bar. It is passed
 * in rather than read here so this stays pure and so the caller keeps the one `try` — a
 * link with both `?view=` and `?share=` never becomes a request, so no fetch state exists
 * to describe it.
 */
export function selectTableRows(
  fallback: readonly Person[],
  state: ViewPageState,
  urlError: string | null = null,
): TableRowsView {
  const base: TableRowsView = {
    rows: [],
    viewName: null,
    loading: false,
    loadingMore: false,
    error: null,
    canLoadMore: false,
    filtered: true,
  };

  // A URL we refused to parse outranks whatever the hook's state says: no request was ever
  // issued for it, so the state still describes the PREVIOUS view. Showing that view's rows
  // under a broken link is the same lie as #1, one step removed.
  if (urlError !== null) return { ...base, error: urlError };

  if (state.source === null) {
    // The only path that trusts the server-rendered list: no view asked for, none loading.
    return { ...base, rows: [...fallback], filtered: false };
  }

  if (state.status === "error") {
    return { ...base, error: state.error ?? "this view could not be loaded" };
  }

  const page = state.page;
  if (page === null) {
    // `loading` with nothing yet — and `idle` with a source, which the hook only occupies
    // for the tick between mount and its effect. Both render the same empty, honest table.
    return { ...base, loading: true };
  }

  if (!isPersonShapedTarget(page.target)) {
    const home = TARGET_HOME[page.target] ?? "another page";
    return {
      ...base,
      viewName: page.name || null,
      error: `this view lists ${page.target} records — open it on ${home}`,
    };
  }

  return {
    rows: page.rows as Person[],
    viewName: page.name || null,
    loading: false,
    loadingMore: state.status === "loadingMore",
    error: null,
    // `nextCursor` is `null` on the last page (never `undefined` — `pageClient` normalises
    // it), and offering "Load more" during a request in flight is how a double-fetch of the
    // same cursor starts. `beginLoadMore` refuses it too; not drawing it is the kinder half.
    canLoadMore: page.nextCursor !== null && state.status !== "loadingMore" && state.status !== "loading",
    filtered: true,
  };
}
