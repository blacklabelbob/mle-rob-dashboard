/**
 * Q67b — the browser side of the WRITE door: list the views a rep can see, save a new
 * one, delete one of their own.
 *
 * `/api/views` has existed since the write door shipped, and nothing in the app has ever
 * called it — which is why the DoD sentence "a rep saves a view in the UI" is still open
 * while (a), (b) and (c) are all built. This is the half of that picker which is not
 * React, split out for the same reason `pageClient.ts` was: this repo has no jsdom and no
 * testing-library, so a rule left inside a component is a rule no test can reach.
 *
 * Framework-free by construction — `fetch` arrives as an argument, there is no `window`,
 * no `next/navigation`, no module-scope client — so every rule below is asserted in node.
 *
 * The one idea in this file: **the picker is a list of doors, and a door that is drawn
 * must open.** A view offered in a sidebar that then 400s, or a name accepted here that
 * Postgres rejects, is worse than one that was never offered: the rep already believes it.
 */

import { FilterParseError, isFilterInputError } from "./parse";
import {
  normalizeViewName,
  parseSavedViewInsert,
  parseSavedViewRow,
  type SavedView,
  type SavedViewInsert,
} from "./savedViews";

/** Where the list/create/delete door lives. Named once, like `VIEW_PAGE_ENDPOINT`. */
export const VIEWS_ENDPOINT = "/api/views";

/**
 * The subset of `fetch` this module needs — so a test passes a function, not a polyfill.
 *
 * Wider than `pageClient`'s: the read path only ever GETs, and this one has to state a
 * method and a body. Declared rather than reusing `RequestInit` so nothing here depends
 * on DOM lib types; the real `fetch` satisfies it.
 */
export type ViewsFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

function fail(msg: string): never {
  throw new FilterParseError(msg);
}

/**
 * A request that reached `/api/views` and came back wrong: status plus what the route
 * said. Separate from `FilterParseError` (thrown before any network happens) so the UI
 * can tell "this name is not allowed" from "the server refused to store it".
 */
export class ViewsRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ViewsRequestError";
    this.status = status;
  }
}

export function isViewsRequestError(e: unknown): e is ViewsRequestError {
  return e instanceof ViewsRequestError;
}

/**
 * The one status a save form must handle differently: 0019's partial unique indexes say
 * this rep already has a view by this name. Everything else is "it didn't save".
 */
export function isDuplicateNameError(e: unknown): boolean {
  return isViewsRequestError(e) && e.status === 409;
}

/** Who is asking. `team` is null for a rep with no team — the route treats it as absent. */
export type ViewListScopeInput = { owner: string; team?: string | null };

function requireOwner(owner: unknown): string {
  if (typeof owner !== "string" || owner.trim() === "") fail("views request needs an owner");
  return owner.trim();
}

/**
 * `GET /api/views?owner=…&team=…`.
 *
 * Built through `URLSearchParams` for the reason `buildPageRequestUrl` gives: these ids
 * are opaque strings, and one containing `&` or `+` concatenated by hand arrives at the
 * server as a different id — which silently lists the WRONG rep's views rather than
 * failing. A blank team is dropped rather than sent empty: `?team=` is a value the route
 * would have to reject, from a UI that meant "no team".
 */
export function buildViewListUrl(scope: ViewListScopeInput): string {
  const params = new URLSearchParams({ owner: requireOwner(scope.owner) });
  const team = scope.team == null ? "" : String(scope.team).trim();
  if (team !== "") params.set("team", team);
  return `${VIEWS_ENDPOINT}?${params.toString()}`;
}

/**
 * `DELETE /api/views?id=…&owner=…`.
 *
 * The owner is required here and not optional-with-a-default for the same reason the
 * route matches on both columns: service_role bypasses RLS, so "delete by id" would let
 * any caller remove any rep's view.
 */
export function buildViewDeleteUrl(id: unknown, owner: unknown): string {
  const viewId = typeof id === "string" ? id.trim() : "";
  if (viewId === "") fail("delete needs a view id");
  const params = new URLSearchParams({ id: viewId, owner: requireOwner(owner) });
  return `${VIEWS_ENDPOINT}?${params.toString()}`;
}

/** One row the route could not parse, kept so a rep hears about it instead of losing it. */
export type BrokenSavedView = { id: unknown; error: string };

export type SavedViewList = { views: SavedView[]; broken: BrokenSavedView[] };

async function errorMessage(res: { status: number; json: () => Promise<unknown> }): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
      return (body as { error: string }).error;
    }
  } catch {
    // A proxy's HTML 502 is real and is not JSON. Surfacing "Unexpected token <" would
    // describe our parser and none of what went wrong; the status always shows.
  }
  return `views request failed (${res.status})`;
}

async function readJsonObject(
  res: { status: number; json: () => Promise<unknown> },
  what: string,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ViewsRequestError(res.status, `${what} response was not JSON`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ViewsRequestError(res.status, `${what} response was not an object`);
  }
  return body as Record<string, unknown>;
}

/**
 * The views this rep can open: their own personal ones plus their team's.
 *
 * **A single unparseable row must not blank the picker.** The route already separates
 * `views` from `broken` for that reason; this re-validates every row it is handed rather
 * than trusting the split, because the response is as untrusted as any other wire input
 * (a cached older deploy, a middleware that reshapes bodies). A row that fails here joins
 * `broken` — the rep keeps the views that work and we still hear about the one that does
 * not. An absent `views` key, though, is a broken contract and throws: rendering "you
 * have no saved views" to a rep who has ten is a lie the UI cannot detect.
 */
export async function fetchSavedViews(
  scope: ViewListScopeInput,
  opts: { fetchImpl: ViewsFetch; signal?: AbortSignal },
): Promise<SavedViewList> {
  const url = buildViewListUrl(scope);
  const res = await opts.fetchImpl(url, opts.signal ? { signal: opts.signal } : undefined);
  if (!res.ok) throw new ViewsRequestError(res.status, await errorMessage(res));

  const body = await readJsonObject(res, "views list");
  if (!Array.isArray(body.views)) throw new ViewsRequestError(res.status, "views list has no views");

  const views: SavedView[] = [];
  const broken: BrokenSavedView[] = [];
  for (const row of body.views) {
    try {
      views.push(parseSavedViewRow(row));
    } catch (e) {
      if (!isFilterInputError(e)) throw e;
      broken.push({ id: (row as { id?: unknown })?.id, error: e.message });
    }
  }
  // The route reports its own unparseable rows the same way; both lists are the rep's.
  for (const b of Array.isArray(body.broken) ? body.broken : []) {
    const rec = (b ?? {}) as { id?: unknown; error?: unknown };
    broken.push({ id: rec.id, error: typeof rec.error === "string" ? rec.error : "unreadable view" });
  }
  return { views, broken };
}

/**
 * Save a view.
 *
 * Validated through `parseSavedViewInsert` — the SAME function the route uses — *before*
 * a connection opens, so an illegal view throws `FilterParseError` locally instead of
 * spending a round trip to be told what the client already knew. One validator, not two:
 * a write-side rule the read path does not share is how "the view I saved won't open"
 * gets written.
 *
 * The response is re-read through `parseSavedViewRow` for the same reason the route reads
 * its own insert back: if what came home does not parse, the picker learns now rather
 * than the next time somebody clicks it.
 */
export async function createSavedView(
  input: SavedViewInsert | unknown,
  opts: { fetchImpl: ViewsFetch; signal?: AbortSignal },
): Promise<SavedView> {
  const insert = parseSavedViewInsert(input);
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(insert),
    ...(opts.signal ? { signal: opts.signal } : {}),
  };

  const res = await opts.fetchImpl(VIEWS_ENDPOINT, init);
  if (!res.ok) throw new ViewsRequestError(res.status, await errorMessage(res));

  const body = await readJsonObject(res, "view create");
  try {
    return parseSavedViewRow(body.view);
  } catch (e) {
    if (!isFilterInputError(e)) throw e;
    throw new ViewsRequestError(res.status, `saved view came back unreadable: ${e.message}`);
  }
}

/**
 * Delete one of this rep's own views. Resolves to the id that was removed.
 *
 * A 404 is left as an error rather than smoothed into success: the route answers 404 both
 * for "gone" and for "someone else's", and treating that as done would quietly remove a
 * colleague's view from this rep's sidebar while it still exists for them.
 */
export async function deleteSavedView(
  id: string,
  owner: string,
  opts: { fetchImpl: ViewsFetch; signal?: AbortSignal },
): Promise<string> {
  const url = buildViewDeleteUrl(id, owner);
  const init = { method: "DELETE", ...(opts.signal ? { signal: opts.signal } : {}) };
  const res = await opts.fetchImpl(url, init);
  if (!res.ok) throw new ViewsRequestError(res.status, await errorMessage(res));
  return id.trim();
}

/**
 * Does this rep already have a view by this name, in this scope? Pure — the save form's
 * local answer to the 409 it would otherwise have to provoke.
 *
 * Compared through `normalizeViewName`, which is `lower(btrim(name))` — exactly what
 * 0019's two partial unique indexes compare — so the duplicate the form warns about is
 * the duplicate Postgres would reject. A looser check here (raw equality) would let
 * "Warm " through to a 409; a stricter one would refuse a name the database accepts.
 *
 * Scope is part of the question, not a filter applied by the caller: the indexes are
 * per-owner for personal views and per-team for team ones, so the same name legitimately
 * exists twice — once in a rep's own list, once in the team's.
 */
export function findViewByName(
  views: readonly SavedView[],
  name: string,
  scope: { scope: SavedView["scope"]; owner_id: string; team_id?: string | null },
): SavedView | null {
  const wanted = normalizeViewName(name);
  if (wanted === "") return null;
  const team = scope.team_id == null ? null : scope.team_id;
  for (const view of views) {
    if (normalizeViewName(view.name) !== wanted) continue;
    if (view.scope !== scope.scope) continue;
    if (view.scope === "team" ? view.team_id === team : view.owner_id === scope.owner_id) return view;
  }
  return null;
}

/** Re-exported so a caller catches both families without importing two modules. */
export { FilterParseError };
