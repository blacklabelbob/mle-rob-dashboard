"use client";

/**
 * Q67b — the hook. Deliberately thin: state, effect, two callbacks.
 *
 * Every rule about what a page must look like lives in `pageClient.ts`, and every rule
 * about whether a response is still wanted lives in `pageState.ts` — both pure, both
 * tested in node, because this repo has no jsdom and no @testing-library/react. What is
 * left here is the part only React can do: hold the state, fire the effect, cancel on
 * unmount. If a rule ever needs adding, it belongs in one of those two files, not here.
 *
 * One React-specific decision, and it is load-bearing: **a ref is the authoritative state,
 * `useState` only mirrors it for rendering.** A `setState` updater is not guaranteed to
 * run at the call site, so deciding "is this request legal" from inside one — or from the
 * render-time snapshot — reads a state that may already be superseded. Two clicks in one
 * tick would both see `ready`, both mint the same generation, and both fetch the same
 * cursor: the very double-request `beginLoadMore` exists to refuse. The ref is written
 * synchronously before any fetch starts, so that cannot happen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewSource } from "./page";
import { fetchViewPage, type FetchLike } from "./pageClient";
import {
  applyError,
  applyPage,
  beginLoadMore,
  beginRequest,
  initialViewPageState,
  isBusy,
  pendingCursor,
  type ViewPageState,
} from "./pageState";

export type UseViewPageOptions = {
  limit?: number;
  includeDemo?: boolean;
  /** Swappable only so a caller can inject one; the browser's `fetch` is the default. */
  fetchImpl?: FetchLike;
};

export type UseViewPageResult = ViewPageState & {
  /** Safe to call on every click: a request already in flight or a last page is a no-op. */
  loadMore: () => void;
  reload: () => void;
  busy: boolean;
};

export function useViewPage(source: ViewSource | null, opts: UseViewPageOptions = {}): UseViewPageResult {
  const [state, setState] = useState<ViewPageState>(initialViewPageState);
  const stateRef = useRef<ViewPageState>(initialViewPageState);

  // Options are read through a ref so changing `limit` mid-scroll does not retrigger the
  // effect and restart the walk; the next page picks the new value up.
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const sourceRef = useRef(source);
  sourceRef.current = source;

  // The source is an object literal at most call sites, so a value key — not the object —
  // is what keeps the effect from refetching on every render.
  const key = source === null ? "" : `${source.kind}:${source.kind === "view" ? source.id : source.token}`;

  /** Write the ref first (authoritative), then mirror into React. Identity = no re-render. */
  const commit = useCallback((next: ViewPageState) => {
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
  }, []);

  const run = useCallback(
    (issued: ViewPageState, controller: AbortController) => {
      const cursor = pendingCursor(issued);
      const src = issued.source;
      if (src === null) return;
      const doFetch = optsRef.current.fetchImpl ?? (fetch as unknown as FetchLike);
      fetchViewPage(src, {
        limit: optsRef.current.limit,
        includeDemo: optsRef.current.includeDemo,
        after: cursor,
        fetchImpl: doFetch,
        signal: controller.signal,
      })
        .then((p) => commit(applyPage(stateRef.current, issued.requestId, p, cursor)))
        .catch((e: unknown) => {
          // An aborted request is a cancellation, not a failure to report. The generation
          // guard in `applyError` covers the rest: a superseded view's error stays silent.
          if (controller.signal.aborted) return;
          commit(applyError(stateRef.current, issued.requestId, e instanceof Error ? e.message : String(e)));
        });
    },
    [commit],
  );

  const start = useCallback(
    (next: ViewPageState, controller: AbortController) => {
      if (next === stateRef.current) return false; // refused by the reducer — no request
      commit(next);
      run(next, controller);
      return true;
    },
    [commit, run],
  );

  useEffect(() => {
    const controller = new AbortController();
    start(beginRequest(stateRef.current, sourceRef.current), controller);
    return () => controller.abort();
    // `key` is the source by value; `start` is stable.
  }, [key, start]);

  const loadMore = useCallback(() => {
    const controller = new AbortController();
    start(beginLoadMore(stateRef.current), controller);
  }, [start]);

  const reload = useCallback(() => {
    const controller = new AbortController();
    start(beginRequest(stateRef.current, sourceRef.current), controller);
  }, [start]);

  return { ...state, loadMore, reload, busy: isBusy(state) };
}
