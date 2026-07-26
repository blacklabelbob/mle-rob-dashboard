import { describe, expect, it } from "vitest";
import {
  SHARE_PARAM,
  VIEW_PAGE_ENDPOINT,
  VIEW_PARAM,
  buildPageRequestUrl,
  buildShareUrl,
  readViewSource,
  withShareToken,
} from "@/lib/filters/browserView";
import { MAX_PAGE_LIMIT, parsePageCursor, parsePageLimit, resolveViewSource } from "@/lib/filters/page";
import { decodeShareLink, encodeShareLink } from "@/lib/filters/savedViews";
import type { SavedViewPayload } from "@/lib/filters/savedViews";

// Q67b — the browser URL seam. Every assertion here is "the client cannot build a request
// the route would reject", checked against the route's OWN parsers rather than a second
// description of them.

const qs = (s: string) => new URLSearchParams(s);

const WARM: SavedViewPayload = {
  target: "person",
  name: "Warm people",
  filter: { op: "lit", lit: { lit: "person.status", value: "warm" } },
};

/** The query half of a built URL, read back the way the route reads it. */
const query = (url: string) => new URLSearchParams(url.slice(url.indexOf("?") + 1));

describe("readViewSource", () => {
  it("reads either door", () => {
    expect(readViewSource(qs(`${VIEW_PARAM}=abc`))).toEqual({ kind: "view", id: "abc" });
    expect(readViewSource(qs(`${SHARE_PARAM}=eyJh`))).toEqual({ kind: "share", token: "eyJh" });
  });

  it("returns null for no view — the unfiltered list is a real state, not an error", () => {
    expect(readViewSource(qs(""))).toBeNull();
    expect(readViewSource(qs("sort=name&tab=all"))).toBeNull();
  });

  it("refuses both, exactly like the route", () => {
    expect(() => readViewSource(qs(`${VIEW_PARAM}=abc&${SHARE_PARAM}=eyJh`))).toThrow(/not both/);
  });

  it("refuses a present-but-empty parameter rather than treating it as absent", () => {
    expect(() => readViewSource(qs(`${VIEW_PARAM}=`))).toThrow(/empty/);
    expect(() => readViewSource(qs(`${SHARE_PARAM}=`))).toThrow(/empty/);
  });
});

describe("buildPageRequestUrl", () => {
  it("builds a request the route's own parsers accept", () => {
    const url = buildPageRequestUrl({ kind: "view", id: "v1" }, { limit: 25 });
    expect(url.startsWith(`${VIEW_PAGE_ENDPOINT}?`)).toBe(true);
    const params = query(url);
    expect(resolveViewSource(params)).toEqual({ kind: "view", id: "v1" });
    expect(parsePageLimit(params.get("limit"))).toBe(25);
  });

  // The defect this pins: a cursor is `<created_at>|<id>`, and a non-UTC instant carries a
  // literal `+`. Concatenated by hand that `+` arrives decoded as a SPACE and the route's
  // ISO check 400s a cursor it had just issued.
  it("encodes the cursor so a `+offset` survives the round trip", () => {
    const cursor = "2026-07-26T04:15:00.123+02:00|person-7";
    const url = buildPageRequestUrl({ kind: "view", id: "v1" }, { after: cursor });
    expect(url).toContain("%2B02%3A00");
    expect(url).not.toContain("+02:00");
    expect(parsePageCursor(query(url).get("after"))).toEqual({
      createdAt: "2026-07-26T04:15:00.123+02:00",
      id: "person-7",
    });
  });

  it("drops a null cursor — the last page must not read as a lost cursor", () => {
    expect(query(buildPageRequestUrl({ kind: "view", id: "v1" }, { after: null })).has("after")).toBe(false);
    expect(query(buildPageRequestUrl({ kind: "view", id: "v1" }, { after: "" })).has("after")).toBe(false);
  });

  it("only ever emits demo=include, and only when asked", () => {
    expect(query(buildPageRequestUrl({ kind: "view", id: "v1" })).has("demo")).toBe(false);
    expect(query(buildPageRequestUrl({ kind: "view", id: "v1" }, { includeDemo: true })).get("demo")).toBe(
      "include",
    );
  });

  it("refuses a limit the route would refuse, at build time", () => {
    for (const bad of [0, -1, MAX_PAGE_LIMIT + 1, 1.5, NaN]) {
      expect(() => buildPageRequestUrl({ kind: "view", id: "v1" }, { limit: bad })).toThrow(/limit/);
    }
    expect(query(buildPageRequestUrl({ kind: "view", id: "v1" }, { limit: MAX_PAGE_LIMIT })).get("limit")).toBe(
      String(MAX_PAGE_LIMIT),
    );
  });

  it("escapes a share token into the query rather than trusting it", () => {
    const token = buildShareUrl("/people", WARM).split(`${SHARE_PARAM}=`)[1];
    const params = query(buildPageRequestUrl({ kind: "share", token }));
    expect(resolveViewSource(params)).toEqual({ kind: "share", token });
  });
});

describe("buildShareUrl", () => {
  it("round-trips the view through the codec the route uses", () => {
    const url = buildShareUrl("https://mle.example.com/people", WARM);
    const token = new URL(url).searchParams.get(SHARE_PARAM);
    expect(decodeShareLink(token)).toEqual(WARM);
  });

  // A URL carrying both doors is the one combination the route refuses outright — a Copy
  // button that produced one would hand a colleague a guaranteed 400.
  it("drops ?view= instead of carrying both doors", () => {
    const url = buildShareUrl(`https://mle.example.com/people?${VIEW_PARAM}=v1&sort=name`, WARM);
    const params = new URL(url).searchParams;
    expect(params.has(VIEW_PARAM)).toBe(false);
    expect(params.get("sort")).toBe("name");
    expect(() => readViewSource(params)).not.toThrow();
    expect(readViewSource(params)?.kind).toBe("share");
  });

  it("replaces an older share token rather than appending a second one", () => {
    const first = buildShareUrl("/people", WARM);
    const second = buildShareUrl(first, { ...WARM, name: "Warm people (v2)" });
    const params = query(second);
    expect(params.getAll(SHARE_PARAM)).toHaveLength(1);
    expect(decodeShareLink(params.get(SHARE_PARAM)).name).toBe("Warm people (v2)");
  });

  it("keeps a relative page URL relative", () => {
    expect(buildShareUrl("/people", WARM).startsWith(`/people?${SHARE_PARAM}=`)).toBe(true);
  });

  it("survives a name that btoa alone would throw on", () => {
    const accented: SavedViewPayload = { ...WARM, name: "Clientes — señales" };
    const token = query(buildShareUrl("/people", accented)).get(SHARE_PARAM);
    expect(decodeShareLink(token).name).toBe("Clientes — señales");
  });
});

// Q67b inc.8 — the same link, built from the token the SERVER minted. A page opened as
// `?view=<id>` never sees the filter tree, so this is the only way the Copy button can
// exist for a saved view without the browser becoming a second encoder.
describe("withShareToken", () => {
  it("is exactly what buildShareUrl produces for the same view", () => {
    const token = encodeShareLink(WARM);
    expect(withShareToken("/people?sort=name", token)).toBe(buildShareUrl("/people?sort=name", WARM));
  });

  it("drops ?view= for the same reason — both doors is the one combination the route refuses", () => {
    const params = query(withShareToken(`/people?${VIEW_PARAM}=v1`, encodeShareLink(WARM)));
    expect(params.has(VIEW_PARAM)).toBe(false);
    expect(readViewSource(params)?.kind).toBe("share");
  });

  it("refuses an empty token instead of copying a link to nothing", () => {
    expect(() => withShareToken("/people", "")).toThrow(/token/);
  });
});
