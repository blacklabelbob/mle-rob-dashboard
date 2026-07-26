"use client";

/**
 * Q67b — the one hook a table calls. Deliberately thin, like `useViewPage`: it reads the
 * address bar, hands the source to the fetch hook, and folds the result through the pure
 * `selectTableRows`. No rule about what to render lives here.
 *
 * Why it reads the URL rather than taking a prop: the address bar IS the state. A rep
 * bookmarks `/people?view=…`, a colleague opens `/people?share=…`, and both must land on
 * the same rows without the page knowing anything about views. That also means Back and
 * Forward work for free — `useSearchParams` re-renders on navigation, the source key
 * changes, and `useViewPage` refetches.
 */

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { Person } from "@/lib/types";
import { readViewSource } from "./browserView";
import type { ViewSource } from "./page";
import { selectTableRows, type TableRowsView } from "./tableRows";
import { useViewPage, type UseViewPageOptions } from "./useViewPage";

export type UseTableRowsResult = TableRowsView & {
  loadMore: () => void;
  reload: () => void;
  /** The source in the URL, or `null` for the plain ledger — the Copy button needs it. */
  source: ViewSource | null;
};

export function useTableRows(fallback: readonly Person[], opts: UseViewPageOptions = {}): UseTableRowsResult {
  const params = useSearchParams();
  // `toString()` is the value key: a new ReadonlyURLSearchParams object on every render
  // would otherwise rebuild the source and, through it, retrigger the fetch effect.
  const search = params.toString();

  // A link carrying both doors (or an empty one) throws here and becomes a message, never
  // a request — the route would answer 400 and the rep did nothing wrong but click.
  const { source, urlError } = useMemo(() => {
    try {
      return { source: readViewSource(new URLSearchParams(search)), urlError: null as string | null };
    } catch (e) {
      return { source: null, urlError: e instanceof Error ? e.message : String(e) };
    }
  }, [search]);

  const state = useViewPage(source, opts);
  const view = selectTableRows(fallback, state, urlError);

  return { ...view, loadMore: state.loadMore, reload: state.reload, source };
}
