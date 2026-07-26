/**
 * Q67b — the fetch seam: one call to `/api/views/page`, and how two pages become one list.
 *
 * DoD (b) is "`PeopleTable.tsx` reads `/api/views/page` with the cursor it is handed". The
 * *reading* is React; the *rules* are not, and they live here because this repo has no
 * jsdom and no testing-library — logic left inside a hook is logic no test can reach. The
 * hook that lands next increment is deliberately a thin wrapper: state, effect, render.
 *
 * Framework-free by construction: `fetch` arrives as an argument (there is no `window`,
 * no `next/navigation`, no module-scope client), so every rule below is asserted in node.
 *
 * The one idea in this file: **a page that does not arrive intact must fail loudly.** A
 * saved view is a rep's answer to "who do I call today"; a list that quietly stops early,
 * or quietly repeats a row, is worse than an error, because nothing on screen says so.
 */

import { FilterParseError } from "./parse";
import type { ViewSource } from "./page";
import type { MappedRow } from "./rows";
import type { FilterTarget } from "./ast";
import { buildPageRequestUrl, type PageRequestOptions } from "./browserView";

/** One response from `/api/views/page`, after it has been checked. */
export type ViewPage = {
  target: FilterTarget;
  name: string;
  rows: MappedRow[];
  /** `null` means last page. Never `undefined` — see `readNextCursor`. */
  nextCursor: string | null;
};

/**
 * A request that reached the server and came back wrong: HTTP status plus whatever the
 * route said. Separate from `FilterParseError` (which the URL builder throws before any
 * network happens) so the UI can tell "your link is malformed" from "the server refused".
 */
export class ViewPageRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ViewPageRequestError";
    this.status = status;
  }
}

export function isViewPageRequestError(e: unknown): e is ViewPageRequestError {
  return e instanceof ViewPageRequestError;
}

/** The subset of `fetch` this module needs — so a test passes a function, not a polyfill. */
export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/**
 * Pull an error message out of a failed response.
 *
 * The route answers `{error}` on every path it controls, but a 502 from the edge, a
 * proxy's HTML error page or a truncated body are all real and none of them are JSON.
 * Letting `res.json()` reject here would surface "Unexpected token <" to a rep — a
 * message about our parser, describing none of what went wrong. The status always shows.
 */
async function errorMessage(res: { status: number; json: () => Promise<unknown> }): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
      return (body as { error: string }).error;
    }
  } catch {
    // fall through to the status-only message
  }
  return `view request failed (${res.status})`;
}

/**
 * `nextCursor` is read as a KEY, not as a value.
 *
 * The route documents "present and null means last page". If a future response drops the
 * key — a rename, a middleware that reshapes bodies, a cached older deploy — then reading
 * it as a value gives `undefined`, which is falsy, which reads as "last page": the rep's
 * list silently ends at 50 rows and every count downstream is wrong with no error
 * anywhere. Absent is therefore a broken contract and throws.
 */
function readNextCursor(body: Record<string, unknown>): string | null {
  if (!("nextCursor" in body)) throw new ViewPageRequestError(500, "view page response has no nextCursor");
  const next = body.nextCursor;
  if (next === null) return null;
  if (typeof next !== "string" || next === "") {
    throw new ViewPageRequestError(500, "view page nextCursor must be a non-empty string or null");
  }
  return next;
}

/**
 * Fetch one page of a saved view.
 *
 * The URL is built by `buildPageRequestUrl`, so an illegal request (both doors, a limit
 * out of range) throws `FilterParseError` *before* a connection is opened — the client
 * never spends a round trip to be told what it already knew.
 */
export async function fetchViewPage(
  source: ViewSource,
  opts: PageRequestOptions & { fetchImpl: FetchLike; signal?: AbortSignal },
): Promise<ViewPage> {
  const { fetchImpl, signal, ...request } = opts;
  const url = buildPageRequestUrl(source, request);

  const res = await fetchImpl(url, signal ? { signal } : undefined);
  if (!res.ok) throw new ViewPageRequestError(res.status, await errorMessage(res));

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ViewPageRequestError(res.status, "view page response was not JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ViewPageRequestError(res.status, "view page response was not an object");
  }
  const obj = body as Record<string, unknown>;

  if (!Array.isArray(obj.rows)) throw new ViewPageRequestError(res.status, "view page response has no rows");
  if (typeof obj.target !== "string") {
    throw new ViewPageRequestError(res.status, "view page response has no target");
  }

  return {
    target: obj.target as FilterTarget,
    name: typeof obj.name === "string" ? obj.name : "",
    rows: obj.rows as MappedRow[],
    nextCursor: readNextCursor(obj),
  };
}

/** What the table holds while a rep pages through a view. */
export type ViewPageAccumulator = {
  target: FilterTarget;
  name: string;
  rows: MappedRow[];
  nextCursor: string | null;
};

function rowId(row: MappedRow): string | null {
  const id = (row as { id?: unknown }).id;
  return typeof id === "string" && id !== "" ? id : null;
}

/** The first page: the accumulator starts as exactly what arrived. */
export function startAccumulator(page: ViewPage): ViewPageAccumulator {
  return { target: page.target, name: page.name, rows: page.rows, nextCursor: page.nextCursor };
}

/**
 * Append the next page to what is already on screen. Pure — no state, no clock.
 *
 * Three things it refuses, each of which is a real failure mode of keyset pagination:
 *
 * 1. **A different target.** A rep switching from a people view to a deals view mid-flight
 *    would otherwise land deal rows in a people table: every cell renders `undefined` and
 *    nothing reports an error. The hook is responsible for cancelling, but "the row shapes
 *    silently mixed" must not be survivable if it fails to.
 * 2. **Rows already on screen.** Keyset pages are stable *unless a row changes* — and this
 *    table saves on blur, so an edit between page 1 and page 2 can shift a row across the
 *    boundary and return it twice. React answers a duplicate key with a thrown error and a
 *    blank ledger; dropping the repeat keeps the first copy (the one the rep is looking at).
 * 3. **A cursor that did not advance.** If the server hands back the cursor it was given,
 *    "load more" is an infinite loop that grows the DOM until the tab dies. Stopping with
 *    an error names the bug instead of hanging the browser.
 */
export function appendPage(prev: ViewPageAccumulator, page: ViewPage, usedCursor: string): ViewPageAccumulator {
  if (page.target !== prev.target) {
    throw new ViewPageRequestError(500, `view page target changed from ${prev.target} to ${page.target}`);
  }
  if (page.nextCursor !== null && page.nextCursor === usedCursor) {
    throw new ViewPageRequestError(500, "view page cursor did not advance");
  }

  const seen = new Set<string>();
  for (const row of prev.rows) {
    const id = rowId(row);
    if (id) seen.add(id);
  }
  // A row with no usable id is kept rather than dropped: `mapPageRows` already refuses to
  // mint a row it could not map, so an id we cannot read here is our bug to see on screen,
  // not a row to disappear.
  const fresh = page.rows.filter((row) => {
    const id = rowId(row);
    return id === null || !seen.has(id);
  });

  return {
    target: prev.target,
    name: prev.name,
    rows: prev.rows.concat(fresh),
    nextCursor: page.nextCursor,
  };
}

/** Re-exported so a caller can catch both families without importing two modules. */
export { FilterParseError };
