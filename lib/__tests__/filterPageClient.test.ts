import { describe, expect, it } from "vitest";
import {
  appendPage,
  fetchViewPage,
  isViewPageRequestError,
  startAccumulator,
  type FetchLike,
  type ViewPage,
} from "@/lib/filters/pageClient";
import { isFilterInputError } from "@/lib/filters/parse";
import type { MappedRow } from "@/lib/filters/rows";

// Q67b inc.5 — the fetch seam. Every assertion here is a rule the table cannot express
// once it is a React hook (no jsdom in this repo), which is why the rules live outside it.

const SOURCE = { kind: "view", id: "v1" } as const;

function res(status: number, body: unknown, opts: { badJson?: boolean } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (opts.badJson) throw new SyntaxError("Unexpected token <");
      return body;
    },
  };
}

function stub(...responses: ReturnType<typeof res>[]): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];
  let i = 0;
  return {
    urls,
    fetchImpl: async (url) => {
      urls.push(url);
      return responses[Math.min(i++, responses.length - 1)];
    },
  };
}

const person = (id: string): MappedRow => ({ id, name: id } as unknown as MappedRow);

const page = (over: Partial<ViewPage> = {}): ViewPage => ({
  target: "person",
  name: "Warm",
  rows: [person("a")],
  nextCursor: null,
  ...over,
});

describe("fetchViewPage", () => {
  it("asks the route for the view and returns the checked page", async () => {
    const { fetchImpl, urls } = stub(
      res(200, { target: "person", name: "Warm", rows: [person("a")], nextCursor: "c1", limit: 50 }),
    );
    const got = await fetchViewPage(SOURCE, { fetchImpl });
    expect(urls).toEqual(["/api/views/page?view=v1"]);
    expect(got.target).toBe("person");
    expect(got.name).toBe("Warm");
    expect(got.nextCursor).toBe("c1");
    expect(got.rows).toHaveLength(1);
  });

  it("passes the cursor and the demo opt-in through the URL builder", async () => {
    const { fetchImpl, urls } = stub(res(200, { target: "person", rows: [], nextCursor: null }));
    // A real cursor: `|` and a non-UTC `+`, the pair that breaks hand-concatenation.
    await fetchViewPage(SOURCE, {
      fetchImpl,
      after: "2026-07-26T10:00:00+02:00|p_7",
      limit: 25,
      includeDemo: true,
    });
    expect(urls[0]).toContain("%2B02%3A00");
    expect(urls[0]).toContain("limit=25");
    expect(urls[0]).toContain("demo=include");
  });

  it("refuses an illegal request before it opens a connection", async () => {
    const { fetchImpl, urls } = stub(res(200, {}));
    await expect(fetchViewPage(SOURCE, { fetchImpl, limit: 0 })).rejects.toSatisfy(isFilterInputError);
    expect(urls).toEqual([]);
  });

  it("surfaces the route's own message and status on a refusal", async () => {
    const { fetchImpl } = stub(res(400, { error: "demo must be omitted or 'include'" }));
    await expect(fetchViewPage(SOURCE, { fetchImpl })).rejects.toMatchObject({
      status: 400,
      message: "demo must be omitted or 'include'",
    });
  });

  it("does not let a non-JSON error body become a parser message", async () => {
    // A proxy's HTML 502 — real, and 'Unexpected token <' describes none of it.
    const { fetchImpl } = stub(res(502, null, { badJson: true }));
    const err = await fetchViewPage(SOURCE, { fetchImpl }).catch((e) => e);
    expect(isViewPageRequestError(err)).toBe(true);
    expect(err.message).toBe("view request failed (502)");
    expect(err.status).toBe(502);
  });

  it("treats a MISSING nextCursor as a broken contract, not as the last page", async () => {
    // The defect this pins: `undefined` is falsy, so a dropped key would silently truncate
    // a rep's list at one page with nothing on screen saying so.
    const { fetchImpl } = stub(res(200, { target: "person", rows: [person("a")] }));
    await expect(fetchViewPage(SOURCE, { fetchImpl })).rejects.toThrow(/no nextCursor/);
  });

  it("accepts a present null cursor as the last page", async () => {
    const { fetchImpl } = stub(res(200, { target: "person", rows: [], nextCursor: null }));
    await expect(fetchViewPage(SOURCE, { fetchImpl })).resolves.toMatchObject({ nextCursor: null });
  });

  it("rejects an empty-string cursor rather than looping on it", async () => {
    const { fetchImpl } = stub(res(200, { target: "person", rows: [], nextCursor: "" }));
    await expect(fetchViewPage(SOURCE, { fetchImpl })).rejects.toThrow(/non-empty string or null/);
  });

  it("rejects a body with no rows or no target", async () => {
    await expect(
      fetchViewPage(SOURCE, { fetchImpl: stub(res(200, { target: "person", nextCursor: null })).fetchImpl }),
    ).rejects.toThrow(/no rows/);
    await expect(
      fetchViewPage(SOURCE, { fetchImpl: stub(res(200, { rows: [], nextCursor: null })).fetchImpl }),
    ).rejects.toThrow(/no target/);
  });

  it("rejects a top-level array — a body shape no consumer could read", async () => {
    const { fetchImpl } = stub(res(200, [person("a")]));
    await expect(fetchViewPage(SOURCE, { fetchImpl })).rejects.toThrow(/not an object/);
  });
});

describe("appendPage", () => {
  const first = startAccumulator(page({ rows: [person("a"), person("b")], nextCursor: "c1" }));

  it("appends the next page and carries its cursor forward", () => {
    const got = appendPage(first, page({ rows: [person("c")], nextCursor: "c2" }), "c1");
    expect(got.rows.map((r) => (r as { id: string }).id)).toEqual(["a", "b", "c"]);
    expect(got.nextCursor).toBe("c2");
    expect(got.name).toBe("Warm");
  });

  it("drops a row already on screen instead of handing React a duplicate key", () => {
    // Real: this table saves on blur, so an edit between pages can re-cross the boundary.
    const got = appendPage(first, page({ rows: [person("b"), person("c")], nextCursor: null }), "c1");
    expect(got.rows.map((r) => (r as { id: string }).id)).toEqual(["a", "b", "c"]);
  });

  it("keeps the copy already rendered, not the newer one", () => {
    const edited = { id: "b", name: "renamed" } as unknown as MappedRow;
    const got = appendPage(first, page({ rows: [edited], nextCursor: null }), "c1");
    expect((got.rows[1] as { name: string }).name).toBe("b");
    expect(got.rows).toHaveLength(2);
  });

  it("keeps a row whose id it cannot read rather than disappearing it", () => {
    const nameless = { name: "no id" } as unknown as MappedRow;
    const got = appendPage(first, page({ rows: [nameless], nextCursor: null }), "c1");
    expect(got.rows).toHaveLength(3);
  });

  it("refuses rows of a different target", () => {
    expect(() => appendPage(first, page({ target: "deal", rows: [person("c")] }), "c1")).toThrow(
      /target changed from person to deal/,
    );
  });

  it("refuses a cursor that did not advance — 'load more' would never end", () => {
    expect(() => appendPage(first, page({ rows: [person("c")], nextCursor: "c1" }), "c1")).toThrow(
      /did not advance/,
    );
  });

  it("allows the last page to repeat nothing — null is not the used cursor", () => {
    expect(() => appendPage(first, page({ rows: [], nextCursor: null }), "c1")).not.toThrow();
  });
});
