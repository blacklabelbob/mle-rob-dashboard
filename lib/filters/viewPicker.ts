/**
 * Q67b — what the view picker shows: which saved views a rep can pick, which one is on
 * screen right now, where each choice points, and whether the current page is something
 * they can SAVE.
 *
 * Pure and framework-free per CR-3 (this repo has no jsdom and no @testing-library/react,
 * so a rule written inside a component is a rule no test here can reach). The component
 * lands next and is deliberately thin: render this model, call `viewsClient` on click.
 *
 * The one idea in this file: **the picker never claims a state it cannot back up.** Three
 * things it would be easy to get wrong, each of which lies to a rep looking at real
 * customer rows:
 *
 *  1. A `?view=<id>` that is not in the list — deleted, or a colleague's — must NOT fall
 *     back to showing "All people" as the selection. The table IS filtered (the route
 *     answers 404 and `tableRows` paints the error), so a picker reading "All people" over
 *     an empty ledger says the CRM is empty when it is not.
 *  2. A `?share=` link is NOT a saved view and must not highlight one — even when a view
 *     with the same name exists, because a colleague may have edited the tree since.
 *  3. Saving is offered ONLY when the browser actually holds a filter tree. A page opened
 *     as `?view=` never sees one (the row lives in `saved_views`; only the route reads it),
 *     so a Save button there could not build a request — and a button that cannot work is
 *     worse than no button.
 */

import { FilterParseError } from "./parse";
import type { ViewSource } from "./page";
import {
  decodeShareLink,
  normalizeViewName,
  type SavedView,
  type SavedViewPayload,
} from "./savedViews";
import { SHARE_PARAM, VIEW_PARAM } from "./browserView";
import { findViewByName, type SavedViewList } from "./viewsClient";

/** One selectable row in the picker. `href` is the page URL that switches to it. */
export type ViewPickerItem = {
  id: string;
  name: string;
  target: SavedView["target"];
  scope: SavedView["scope"];
  href: string;
  selected: boolean;
};

/**
 * What the control reads.
 *
 * `unknown-view` is its own state rather than a flavour of `none` for reason (1) above:
 * the two look identical in a naive model and mean opposite things on screen.
 */
export type ViewPickerSelection = "none" | "saved" | "unknown-view" | "shared";

export type ViewPickerModel = {
  items: ViewPickerItem[];
  selection: ViewPickerSelection;
  /** The label the closed control shows. Never a guess — see `selection`. */
  label: string;
  /** Where "All people" points: the same page with both doors removed. */
  clearHref: string;
  /**
   * The payload a Save button would POST, or `null` when this page holds no filter tree.
   * Non-null only for a share link that decodes — the one case the browser has the tree.
   */
  saveable: SavedViewPayload | null;
  /**
   * A view that already owns `saveable`'s name, matched the way 0019's partial unique
   * indexes compare (`lower(btrim(name))`). Present means Save WILL 409, so the component
   * can say so before the click instead of surfacing a raw conflict after it.
   */
  nameTaken: SavedView | null;
  /** Rows the list door could not validate. Surfaced, never silently dropped. */
  brokenCount: number;
};

/** The label for a share link. Deliberately not a view name — it is not a saved view. */
export const SHARED_LINK_LABEL = "Shared link";
/** The label for the unfiltered ledger. */
export const NO_VIEW_LABEL = "All people";
/** The label for a `?view=` id the list does not contain. */
export const UNKNOWN_VIEW_LABEL = "View not found";

function fail(msg: string): never {
  throw new FilterParseError(msg);
}

function editPageUrl(pageUrl: string, edit: (params: URLSearchParams) => void): string {
  // Same relative-base handling as `withShareToken`: a caller may hand us `/people` (a
  // test, or the server) or a full URL (whatever `window.location.href` gives).
  const relative = !/^[a-z][a-z0-9+.-]*:/i.test(pageUrl);
  let url: URL;
  try {
    url = new URL(pageUrl, relative ? "http://placeholder.invalid" : undefined);
  } catch {
    fail("the picker needs a page URL to hang its links off");
  }
  edit(url.searchParams);
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}

/**
 * The page URL that selects a saved view.
 *
 * `?share=` is dropped for the reason `buildShareUrl` drops `?view=`: both doors in one
 * URL is the single combination the route refuses, so leaving the old token behind would
 * turn every pick made from a shared link into a 400.
 *
 * Every other parameter survives — they describe the PAGE (sort, tab), not the view.
 */
export function buildViewHref(pageUrl: string, viewId: string): string {
  if (typeof viewId !== "string" || viewId.trim() === "") fail("a view link needs an id");
  return editPageUrl(pageUrl, (params) => {
    params.delete(SHARE_PARAM);
    params.set(VIEW_PARAM, viewId.trim());
  });
}

/** The page URL that clears the view: the unfiltered ledger, both doors removed. */
export function buildClearViewHref(pageUrl: string): string {
  return editPageUrl(pageUrl, (params) => {
    params.delete(SHARE_PARAM);
    params.delete(VIEW_PARAM);
  });
}

/**
 * Who a Save would file the view under. Optional, and its absence is meaningful: owner
 * identity comes off the wire and is never defaulted (Q64/Q6 own users), so with no scope
 * the picker CANNOT answer "is this name taken" — the indexes are per-owner for personal
 * views and per-team for team ones, and the same name legitimately exists in both. It
 * reports `null` rather than guessing `free`, which is the answer that 409s on click.
 */
export type ViewSaveScope = {
  scope: SavedView["scope"];
  owner_id: string;
  team_id?: string | null;
};

export type ViewPickerInput = {
  /** The address bar, as the component sees it. */
  pageUrl: string;
  /** What `readViewSource` made of it — `null` is the unfiltered ledger, a real state. */
  source: ViewSource | null;
  /** What the list door returned, or `null` while it is still in flight / failed. */
  list: SavedViewList | null;
  /** The rep a Save would file under. Omitted → `nameTaken` stays `null`, unjudged. */
  saveScope?: ViewSaveScope | null;
};

/**
 * Build the picker's model.
 *
 * Never throws on the LIST (a broken row is already counted by `fetchSavedViews`) and
 * never throws on a bad SHARE token: an undecodable token costs the Save button, which is
 * visibly absent, while the rows on screen are the route's business and it has already
 * answered 400 for the same token if it was truly malformed. It does throw on a page URL
 * it cannot parse, because that is our own caller passing nonsense.
 */
export function selectViewPicker(input: ViewPickerInput): ViewPickerModel {
  const { pageUrl, source, list, saveScope } = input;
  const views = list?.views ?? [];
  const brokenCount = list?.broken.length ?? 0;
  const clearHref = buildClearViewHref(pageUrl);

  const selectedId = source?.kind === "view" ? source.id : null;
  const items: ViewPickerItem[] = views.map((v) => ({
    id: v.id,
    name: v.name,
    target: v.target,
    scope: v.scope,
    href: buildViewHref(pageUrl, v.id),
    selected: v.id === selectedId,
  }));

  if (source === null) {
    return {
      items,
      selection: "none",
      label: NO_VIEW_LABEL,
      clearHref,
      saveable: null,
      nameTaken: null,
      brokenCount,
    };
  }

  if (source.kind === "view") {
    const hit = views.find((v) => v.id === source.id) ?? null;
    // While the list is still loading there is nothing to contradict the URL yet, so the
    // honest label is the id's own state — NOT "All people", and not a name we don't have.
    const selection: ViewPickerSelection = hit ? "saved" : "unknown-view";
    return {
      items,
      selection,
      label: hit ? hit.name : UNKNOWN_VIEW_LABEL,
      clearHref,
      saveable: null,
      nameTaken: null,
      brokenCount,
    };
  }

  // A share link: the one case the browser holds the tree, so the one case Save can work.
  let payload: SavedViewPayload | null = null;
  try {
    payload = decodeShareLink(source.token);
  } catch {
    payload = null;
  }
  return {
    items,
    selection: "shared",
    label: payload ? `${SHARED_LINK_LABEL}: ${payload.name}` : SHARED_LINK_LABEL,
    clearHref,
    saveable: payload,
    nameTaken: payload && saveScope ? findViewByName(views, payload.name, saveScope) : null,
    brokenCount,
  };
}

/**
 * Is this name free to save under, judged the way the database will judge it?
 *
 * Exported so the component can re-check as a rep types a new name in the Save box —
 * `normalizeViewName` is what 0019's two partial unique indexes compare, so answering it
 * any other way (raw equality, case-sensitive) tells a rep a name is free and then 409s.
 */
export function isViewNameFree(
  views: readonly SavedView[],
  name: string,
  scope: ViewSaveScope,
): boolean {
  if (typeof name !== "string" || normalizeViewName(name) === "") return false;
  return findViewByName(views, name, scope) === null;
}
