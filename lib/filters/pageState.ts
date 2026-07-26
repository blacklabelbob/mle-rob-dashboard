/**
 * Q67b — the state seam: what a table holds while a rep pages through a saved view.
 *
 * `pageClient.ts` owns "did this page arrive intact". This file owns the question one
 * layer up: **given what is already on screen, is this response still wanted?** That is
 * the part a React hook usually swallows, and it is where the expensive bugs live —
 * a rep switches views, the old view's page 1 resolves a beat later, and the new view
 * shows the old view's rows under the new view's name with nothing reporting an error.
 *
 * It lives here and not in the hook for the same reason `pageClient.ts` does: this repo
 * has no jsdom and no @testing-library/react (checked, not assumed), so a rule written
 * inside a hook is a rule no test here can reach. `useViewPage.ts` is the thin wrapper —
 * state, effect, render — and every decision below is asserted in plain node.
 *
 * Pure per CR-3: no clock, no fetch, no React. A reducer plus two guards.
 */

import type { ViewSource } from "./page";
import {
  appendPage,
  startAccumulator,
  type ViewPage,
  type ViewPageAccumulator,
} from "./pageClient";

export type ViewPageStatus = "idle" | "loading" | "loadingMore" | "ready" | "error";

export type ViewPageState = {
  /** Which view the rows on screen belong to. `null` = the unfiltered list, a real state. */
  source: ViewSource | null;
  /**
   * Monotonic request generation. A response carries the id it was issued under, and any
   * id that is not the current one is DROPPED — see `applyPage`. `AbortController` is the
   * polite half of cancellation and is best-effort: a fetch that has already resolved
   * still delivers its body, and `setState` from that continuation is exactly how the old
   * view's rows land under the new view's header. The counter is the half that cannot lose.
   */
  requestId: number;
  status: ViewPageStatus;
  /** Rows + cursor, or `null` before the first page of a view arrives. */
  page: ViewPageAccumulator | null;
  error: string | null;
};

export const initialViewPageState: ViewPageState = {
  source: null,
  requestId: 0,
  status: "idle",
  page: null,
  error: null,
};

/** True when a request is in flight for the current generation. */
export function isBusy(state: ViewPageState): boolean {
  return state.status === "loading" || state.status === "loadingMore";
}

/**
 * The rep asked for a different view (or cleared it).
 *
 * Rows are dropped, not kept: carrying them across would render people rows under a deals
 * view's name — every cell `undefined`, nothing to see but blanks. `appendPage` refuses a
 * target change, but that guard only fires if the two collide; here they must not meet.
 *
 * The generation always advances, even when the source is unchanged, so this doubles as
 * "reload this view" and so an in-flight response from before the change is stale by
 * construction rather than by timing.
 */
export function beginRequest(state: ViewPageState, source: ViewSource | null): ViewPageState {
  return {
    source,
    requestId: state.requestId + 1,
    status: source === null ? "idle" : "loading",
    page: null,
    error: null,
  };
}

/**
 * "Load more" — legal only when a page is on screen, nothing is in flight, and the server
 * handed back a cursor.
 *
 * Returns the SAME object when it is not legal, so the caller can fire it freely (a
 * double-clicked button, a scroll handler at the bottom of the list) and the hook can
 * skip the fetch by identity. Refusing here rather than at the network is the point: two
 * requests on one cursor return the same rows twice, `appendPage` dedupes them, and the
 * list then looks correct while the tab does double the work — a bug with no symptom.
 */
export function beginLoadMore(state: ViewPageState): ViewPageState {
  if (state.status !== "ready") return state;
  if (state.page === null || state.page.nextCursor === null) return state;
  return { ...state, requestId: state.requestId + 1, status: "loadingMore", error: null };
}

/** The cursor a `loadingMore` request was issued with — `null` for a view's first page. */
export function pendingCursor(state: ViewPageState): string | null {
  return state.status === "loadingMore" && state.page ? state.page.nextCursor : null;
}

/**
 * A page came back. `requestId` is the generation it was issued under.
 *
 * `usedCursor` is passed in rather than read back off the state so `appendPage`'s
 * "cursor did not advance" check compares against the cursor this request actually sent.
 */
export function applyPage(
  state: ViewPageState,
  requestId: number,
  page: ViewPage,
  usedCursor: string | null,
): ViewPageState {
  if (requestId !== state.requestId) return state; // stale — a superseded view's response
  if (usedCursor === null) {
    return { ...state, status: "ready", page: startAccumulator(page), error: null };
  }
  if (state.page === null) {
    // A cursor with nothing to append to: the first page was dropped or never applied.
    return { ...state, status: "error", error: "view page arrived with no first page to extend" };
  }
  try {
    return { ...state, status: "ready", page: appendPage(state.page, page, usedCursor), error: null };
  } catch (e) {
    return { ...state, status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * A request failed.
 *
 * Rows already on screen SURVIVE: a rep is mid-call with a list open, "load more" hits a
 * transient 502, and blanking the ledger loses the thing they were reading. The error sits
 * beside the rows; the cursor is still there, so retrying is one more click. A failed
 * FIRST page has nothing to keep, and `page` is already `null` from `beginRequest`.
 */
export function applyError(state: ViewPageState, requestId: number, message: string): ViewPageState {
  if (requestId !== state.requestId) return state; // stale — do not surface a cancelled view's error
  return { ...state, status: "error", error: message };
}
