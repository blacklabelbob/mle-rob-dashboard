/**
 * Q67b — the browser half of the saved-view URL: which view a page is showing, what
 * request that turns into, and what string a rep copies when they hit "Share".
 *
 * Pure and stateless per CR-3: no network, no clock, no `window`. Every URL the table
 * will fetch and every link it will offer is built by a function in here, so the wire
 * format is unit-testable without a browser and without a database.
 *
 * The one idea in this file: **the client may only build requests the route accepts.**
 * `/api/views/page` refuses `?view=` and `?share=` together, refuses a limit outside
 * 1..200, and refuses any `?demo=` value but `include`. Those rules are re-stated here as
 * *construction* rules rather than re-validated as parse rules — a UI that can express an
 * illegal request is a UI that ships a 400 to a rep who did nothing wrong.
 *
 * The page URL and the API URL deliberately share the same two parameter names, so the
 * address bar a rep bookmarks and the fetch the table issues describe the same view.
 */

import { FilterParseError } from "./parse";
import { MAX_PAGE_LIMIT, type ViewSource } from "./page";
import { encodeShareLink, type SavedViewPayload } from "./savedViews";

/** The two doors, named once. Both the address bar and the API use these spellings. */
export const VIEW_PARAM = "view";
export const SHARE_PARAM = "share";

/** Where the table fetches its rows. */
export const VIEW_PAGE_ENDPOINT = "/api/views/page";

function fail(msg: string): never {
  throw new FilterParseError(msg);
}

/**
 * Read the view out of a page's own query string.
 *
 * `null` means "no view" — the unfiltered default list, which is a legitimate state for
 * `/people` and is why this cannot reuse the route's `resolveViewSource` (that one is
 * right to demand a source, because an API call with neither parameter is a client bug).
 * Both parameters at once still throws, matching the route rather than picking a winner:
 * if the two disagreed, the address bar and the rows on screen would too.
 */
export function readViewSource(params: URLSearchParams): ViewSource | null {
  const view = params.get(VIEW_PARAM);
  const share = params.get(SHARE_PARAM);
  if (view !== null && share !== null) fail(`pass ?${VIEW_PARAM}= or ?${SHARE_PARAM}=, not both`);
  if (view !== null) {
    const id = view.trim();
    if (id === "") fail(`?${VIEW_PARAM}= is empty`);
    return { kind: "view", id };
  }
  if (share !== null) {
    // Not trimmed, for the reason `page.ts` gives: base64url has no legal whitespace, and
    // the codec owns the alphabet check. Trimming here accepts tokens the codec rejects.
    if (share === "") fail(`?${SHARE_PARAM}= is empty`);
    return { kind: "share", token: share };
  }
  return null;
}

export type PageRequestOptions = {
  /** Page size. Omitted means the route's default; out of 1..200 throws here, not there. */
  limit?: number;
  /** The opaque `<created_at>|<id>` string the LAST response handed back. */
  after?: string | null;
  /** Opt back into the fabricated "(DEMO)" rows — the Rep Cockpit's escape hatch. */
  includeDemo?: boolean;
};

/**
 * Build the `/api/views/page` request for a view.
 *
 * Built through `URLSearchParams`, never string concatenation. The cursor is the reason
 * that matters and not just style: it is `<created_at>|<id>`, so it carries `|` and — on
 * a non-UTC instant — a literal `+`. Concatenated by hand, that `+` arrives at the server
 * decoded as a SPACE, the ISO check fails, and a perfectly good cursor 400s with nothing
 * in the URL that looks wrong.
 *
 * The source is a discriminated union rather than two optional strings, so "both doors at
 * once" is unrepresentable here instead of being caught downstream.
 */
export function buildPageRequestUrl(source: ViewSource, opts: PageRequestOptions = {}): string {
  const params = new URLSearchParams();
  if (source.kind === "view") params.set(VIEW_PARAM, source.id);
  else params.set(SHARE_PARAM, source.token);

  if (opts.limit !== undefined) {
    // Mirrors 0020 and `parsePageLimit`. A third ceiling that disagrees with those two is
    // a request the client builds, the route accepts, and Postgres then rejects.
    if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > MAX_PAGE_LIMIT) {
      fail(`limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`);
    }
    params.set("limit", String(opts.limit));
  }

  // `null` is what the route returns on the LAST page, so it means "no next page" and is
  // silently dropped; passing it back as an empty `?after=` would be indistinguishable
  // from a client that lost the cursor.
  if (opts.after != null && opts.after !== "") params.set("after", opts.after);

  if (opts.includeDemo) params.set("demo", "include");

  return `${VIEW_PAGE_ENDPOINT}?${params.toString()}`;
}

/**
 * The link a rep copies: the page they are on, carrying the view itself.
 *
 * A share link is a bearer of a QUERY, never of DATA (0019) — the colleague who opens it
 * still reads through whatever policy guards the rows. So this needs no token column, no
 * revocation story, and no round-trip to create.
 *
 * `?view=` is DROPPED, not kept alongside: copying while looking at a saved view would
 * otherwise produce a URL carrying both doors — exactly the combination `readViewSource`
 * and the route both refuse. The recipient would get a 400 from a button that said Copy.
 * Every other query parameter on the page (sort, tab, filters someone adds later) is
 * preserved, because they describe the page and not the view.
 */
export function buildShareUrl(pageUrl: string, view: SavedViewPayload): string {
  const token = encodeShareLink(view);
  // Relative bases are accepted so a caller can pass `/people` in a test or on the server;
  // the placeholder origin is stripped again below when the input had none.
  const relative = !/^[a-z][a-z0-9+.-]*:/i.test(pageUrl);
  let url: URL;
  try {
    url = new URL(pageUrl, relative ? "http://placeholder.invalid" : undefined);
  } catch {
    fail("share link needs a page URL to hang off");
  }
  url.searchParams.delete(VIEW_PARAM);
  url.searchParams.set(SHARE_PARAM, token);
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}
