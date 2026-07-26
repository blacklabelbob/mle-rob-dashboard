import { describe, expect, it } from "vitest";
import { isPersonShapedTarget, selectTableRows } from "@/lib/filters/tableRows";
import {
  applyError,
  applyPage,
  beginLoadMore,
  beginRequest,
  initialViewPageState,
  type ViewPageState,
} from "@/lib/filters/pageState";
import type { ViewPage } from "@/lib/filters/pageClient";
import type { MappedRow } from "@/lib/filters/rows";
import type { Person } from "@/lib/types";

const person = (id: string, name = id): Person => ({ id, name }) as unknown as Person;
const row = (id: string): MappedRow => ({ id, name: id }) as unknown as MappedRow;

function page(
  rows: MappedRow[],
  nextCursor: string | null,
  name = "Warm people",
  target: ViewPage["target"] = "person",
  shareToken: string | null = "tok-1",
): ViewPage {
  return { target, name, rows, nextCursor, shareToken };
}

/** One page of a person view on screen, cursor `c1` outstanding. */
function ready(p: ViewPage = page([row("a"), row("b")], "c1")): ViewPageState {
  const s = beginRequest(initialViewPageState, { kind: "view", id: "v1" });
  return applyPage(s, s.requestId, p, null);
}

const FALLBACK = [person("srv-1"), person("srv-2")];

describe("selectTableRows — no view", () => {
  it("renders the server-rendered ledger untouched", () => {
    const v = selectTableRows(FALLBACK, initialViewPageState);
    expect(v.rows.map((r) => r.id)).toEqual(["srv-1", "srv-2"]);
    expect(v.viewName).toBeNull();
    expect(v.filtered).toBe(false);
    expect(v.error).toBeNull();
    expect(v.canLoadMore).toBe(false);
  });

  it("copies the fallback rather than handing back the caller's array", () => {
    const v = selectTableRows(FALLBACK, initialViewPageState);
    expect(v.rows).not.toBe(FALLBACK);
    expect(v.rows).toEqual(FALLBACK);
  });
});

describe("selectTableRows — a view is loading", () => {
  it("renders EMPTY, never the unfiltered list under the view's name", () => {
    const s = beginRequest(initialViewPageState, { kind: "view", id: "v1" });
    const v = selectTableRows(FALLBACK, s);
    expect(v.rows).toEqual([]);
    expect(v.loading).toBe(true);
    expect(v.filtered).toBe(true);
    expect(v.error).toBeNull();
  });
});

describe("selectTableRows — a view is on screen", () => {
  it("renders the view's rows and its name", () => {
    const v = selectTableRows(FALLBACK, ready());
    expect(v.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(v.viewName).toBe("Warm people");
    expect(v.filtered).toBe(true);
    expect(v.loading).toBe(false);
  });

  it("offers Load more only while the server still has a cursor", () => {
    expect(selectTableRows(FALLBACK, ready()).canLoadMore).toBe(true);
    const last = ready(page([row("a")], null));
    expect(selectTableRows(FALLBACK, last).canLoadMore).toBe(false);
  });

  it("withdraws Load more while a page is in flight, and keeps the rows visible", () => {
    const more = beginLoadMore(ready());
    const v = selectTableRows(FALLBACK, more);
    expect(v.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(v.loadingMore).toBe(true);
    expect(v.canLoadMore).toBe(false);
    expect(v.loading).toBe(false);
  });

  it("draws an org view — companies are Person-shaped by design", () => {
    const v = selectTableRows(FALLBACK, ready(page([row("o1")], null, "Roofing cos", "org")));
    expect(v.rows.map((r) => r.id)).toEqual(["o1"]);
    expect(v.error).toBeNull();
  });
});

describe("selectTableRows — refusals", () => {
  it("refuses a deals view by name instead of rendering blank rows", () => {
    const v = selectTableRows(FALLBACK, ready(page([row("d1")], null, "Open deals", "deal")));
    expect(v.rows).toEqual([]);
    expect(v.viewName).toBe("Open deals");
    expect(v.error).toContain("deal");
    expect(v.error).toContain("Deals page");
  });

  it("surfaces the route's own error, not the full ledger", () => {
    const s = ready();
    const errored = applyError(s, s.requestId, "filter refers to unknown field person.vibe");
    const v = selectTableRows(FALLBACK, errored);
    expect(v.rows).toEqual([]);
    expect(v.error).toBe("filter refers to unknown field person.vibe");
  });

  it("lets a malformed URL outrank the previous view's rows", () => {
    const v = selectTableRows(FALLBACK, ready(), "pass ?view= or ?share=, not both");
    expect(v.rows).toEqual([]);
    expect(v.viewName).toBeNull();
    expect(v.error).toBe("pass ?view= or ?share=, not both");
  });

  it("never falls back to the unfiltered ledger on any failure path", () => {
    const s = ready();
    for (const v of [
      selectTableRows(FALLBACK, applyError(s, s.requestId, "boom")),
      selectTableRows(FALLBACK, ready(page([row("d1")], null, "Open deals", "deal"))),
      selectTableRows(FALLBACK, s, "bad link"),
    ]) {
      expect(v.rows).toEqual([]);
    }
  });
});

describe("isPersonShapedTarget", () => {
  it("accepts what this table can draw and rejects what it cannot", () => {
    expect(isPersonShapedTarget("person")).toBe(true);
    expect(isPersonShapedTarget("org")).toBe(true);
    expect(isPersonShapedTarget("deal")).toBe(false);
    expect(isPersonShapedTarget("activity")).toBe(false);
  });
});

describe("selectTableRows — the share token (DoD (c): the Copy affordance)", () => {
  it("hands back the token the ROUTE minted for the rows on screen", () => {
    const v = selectTableRows(FALLBACK, ready());
    expect(v.shareToken).toBe("tok-1");
  });

  it("survives loadingMore — the link a rep can see must not vanish mid-scroll", () => {
    expect(selectTableRows(FALLBACK, beginLoadMore(ready())).shareToken).toBe("tok-1");
  });

  it("is null in every state where copying would hand over the WRONG view", () => {
    const s = ready();
    const loading = beginRequest(initialViewPageState, { kind: "view", id: "v2" });
    const cases: Array<[string, ReturnType<typeof selectTableRows>]> = [
      ["no view at all", selectTableRows(FALLBACK, initialViewPageState)],
      ["first page in flight", selectTableRows(FALLBACK, loading)],
      ["the view failed", selectTableRows(FALLBACK, applyError(s, s.requestId, "boom"))],
      ["a malformed link", selectTableRows(FALLBACK, s, "pass ?view= or ?share=, not both")],
      [
        "a target this table cannot draw",
        selectTableRows(FALLBACK, ready(page([row("d1")], null, "Open deals", "deal"))),
      ],
    ];
    for (const [what, v] of cases) expect(v.shareToken, what).toBeNull();
  });

  it("is null when the route withheld a token but the rows are fine", () => {
    // `pageClient` drops a token whose target disagrees; the rows still render, only the
    // button is absent — a cosmetic loss, never a refused page.
    const v = selectTableRows(FALLBACK, ready(page([row("a")], null, "Warm people", "person", null)));
    expect(v.rows.map((r) => r.id)).toEqual(["a"]);
    expect(v.shareToken).toBeNull();
    expect(v.error).toBeNull();
  });
});
