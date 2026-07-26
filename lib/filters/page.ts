/**
 * Q67 inc.6 — the request half of the paginated route: which view is being asked for,
 * how big a page, where the last page stopped, and where the next one starts.
 *
 * Pure and stateless per CR-3: no network, no Date.now(). The route does I/O; every
 * decision it makes is a function in here, so the cursor contract is unit-testable
 * without a database.
 *
 * The one idea in this file: **the cursor is derived from the rows, never from the
 * request.** A client that could hand back an arbitrary `(created_at, id)` pair is a
 * client that can make the keyset skip rows; a client that hands back the pair it was
 * given cannot. So `nextCursor` is computed from the page that was just served, and the
 * only thing parsed off the wire is the opaque string this file emitted.
 *
 * Limits mirror `0020_filter_page_rpc.sql` exactly (1..200). Two ceilings that disagree
 * mean a request the route accepts and the database then rejects with a 22023 — a 500
 * where a 400 belonged.
 */

import { FilterParseError } from "./parse";

/** Page size when the caller does not ask. */
export const DEFAULT_PAGE_LIMIT = 50;

/** Mirrors 0020's `p_limit must be between 1 and 200`. */
export const MAX_PAGE_LIMIT = 200;

/** The keyset position: 0020 orders by `(created_at desc, id desc)`, so both travel. */
export type PageCursor = { createdAt: string; id: string };

/** Which door the request came through — a stored row, or a stranger's link. */
export type ViewSource =
  | { kind: "view"; id: string }
  | { kind: "share"; token: string };

function fail(msg: string): never {
  throw new FilterParseError(msg);
}

/**
 * Exactly one of `?view=` / `?share=`.
 *
 * Both at once is refused rather than ranked: a precedence rule here is invisible at the
 * call site, and "the link I pasted showed my own saved view instead" is a bug nobody
 * reports usefully.
 */
export function resolveViewSource(params: URLSearchParams): ViewSource {
  const view = params.get("view");
  const share = params.get("share");
  if (view !== null && share !== null) fail("pass ?view= or ?share=, not both");
  if (view !== null) {
    const id = view.trim();
    if (id === "") fail("?view= is empty");
    return { kind: "view", id };
  }
  if (share !== null) {
    // Not trimmed: base64url has no legal whitespace, and decodeShareLink owns the
    // alphabet check. Trimming here would quietly accept a token the codec rejects.
    if (share === "") fail("?share= is empty");
    return { kind: "share", token: share };
  }
  fail("need ?view=<id> or ?share=<token>");
}

/** `?limit=` → an int in 1..200. Absent is the default; malformed is a 400, never a clamp. */
export function parsePageLimit(raw: string | null): number {
  if (raw === null || raw.trim() === "") return DEFAULT_PAGE_LIMIT;
  // Clamping a bad limit is how "?limit=1000 only returned 200 and I didn't notice I was
  // missing rows" happens. Loud beats helpful.
  if (!/^\d+$/.test(raw.trim())) fail(`limit must be a positive integer, got ${JSON.stringify(raw)}`);
  const n = Number(raw.trim());
  if (n < 1 || n > MAX_PAGE_LIMIT) fail(`limit must be between 1 and ${MAX_PAGE_LIMIT}`);
  return n;
}

// Both renderings of the same instant: `to_jsonb()` emits `+00:00`, while Postgres' own
// text output of a timestamptz is a bare `+00`. Accepting only the first would make a
// hand-pasted or log-copied cursor 400 for no reason the caller can see.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$/;

/** `<iso>|<id>` — readable in a log, and no scheme to version. */
export function encodePageCursor(cursor: PageCursor): string {
  return `${cursor.createdAt}|${cursor.id}`;
}

/**
 * Parse `?after=`. Absent → null (first page). Malformed → 400.
 *
 * Split on the FIRST separator only: an ISO instant never contains `|`, so everything
 * after it is the id verbatim, whatever an id happens to contain.
 */
export function parsePageCursor(raw: string | null): PageCursor | null {
  if (raw === null || raw.trim() === "") return null;
  const text = raw.trim();
  const cut = text.indexOf("|");
  // Half a cursor is refused here for the same reason 0020 refuses it: `(created_at, id)
  // < (ts, NULL)` is NULL for every row, so the page comes back empty instead of wrong —
  // the worst failure mode, because it looks like "no more results".
  if (cut < 1 || cut === text.length - 1) fail("cursor must be <created_at>|<id>");
  const createdAt = text.slice(0, cut);
  const id = text.slice(cut + 1);
  if (!ISO_INSTANT.test(createdAt)) fail("cursor timestamp is not an ISO instant");
  return { createdAt, id };
}

/**
 * The cursor for the NEXT page, read out of the page just served.
 *
 * `null` when the page came back short: 0020 asks for `limit` rows, so fewer than `limit`
 * means the scan reached the end. A cursor here would cost every client one extra
 * round-trip to discover the list was over.
 */
export function nextPageCursor(rows: readonly unknown[], limit: number): string | null {
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1];
  if (typeof last !== "object" || last === null || Array.isArray(last)) {
    fail("page row is not an object");
  }
  const row = last as Record<string, unknown>;
  // These two columns are what 0020 sorts by. If either is missing the keyset is broken,
  // and serving a cursor built from `undefined` would silently restart the walk at page 1.
  if (typeof row.created_at !== "string" || row.created_at === "") {
    fail("page row has no created_at — cannot build a cursor");
  }
  if (typeof row.id !== "string" || row.id === "") {
    fail("page row has no id — cannot build a cursor");
  }
  return encodePageCursor({ createdAt: row.created_at, id: row.id });
}
