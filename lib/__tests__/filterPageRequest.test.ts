import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  encodePageCursor,
  nextPageCursor,
  parsePageCursor,
  parsePageLimit,
  resolveViewSource,
} from "@/lib/filters/page";

// Q67 inc.6 — the request contract of /api/views/page. Pure, so the cursor rules are
// pinned without a database.

const qs = (s: string) => new URLSearchParams(s);

describe("resolveViewSource", () => {
  it("reads ?view= and ?share=", () => {
    expect(resolveViewSource(qs("view=abc"))).toEqual({ kind: "view", id: "abc" });
    expect(resolveViewSource(qs("share=eyJh"))).toEqual({ kind: "share", token: "eyJh" });
  });

  it("refuses both rather than ranking them", () => {
    expect(() => resolveViewSource(qs("view=abc&share=eyJh"))).toThrow(/not both/);
  });

  it("refuses neither, and refuses empty", () => {
    expect(() => resolveViewSource(qs(""))).toThrow(/need \?view=/);
    expect(() => resolveViewSource(qs("view="))).toThrow(/empty/);
    expect(() => resolveViewSource(qs("share="))).toThrow(/empty/);
  });

  it("does not trim a share token — base64url has no legal whitespace", () => {
    expect(resolveViewSource(qs("share=%20eyJh"))).toEqual({ kind: "share", token: " eyJh" });
  });
});

describe("parsePageLimit", () => {
  it("defaults when absent", () => {
    expect(parsePageLimit(null)).toBe(DEFAULT_PAGE_LIMIT);
    expect(parsePageLimit("")).toBe(DEFAULT_PAGE_LIMIT);
  });

  it("accepts 1..200 — the same window 0020 enforces", () => {
    expect(parsePageLimit("1")).toBe(1);
    expect(parsePageLimit("200")).toBe(MAX_PAGE_LIMIT);
  });

  it("rejects out of range instead of clamping", () => {
    expect(() => parsePageLimit("0")).toThrow(/between 1 and 200/);
    expect(() => parsePageLimit("201")).toThrow(/between 1 and 200/);
  });

  it("rejects non-integers", () => {
    for (const bad of ["-1", "1.5", "5e1", "abc", "10; drop"]) {
      expect(() => parsePageLimit(bad)).toThrow(/positive integer/);
    }
  });
});

describe("page cursor", () => {
  const cursor = { createdAt: "2026-07-26T01:02:03.456Z", id: "p-123" };

  it("round-trips", () => {
    expect(parsePageCursor(encodePageCursor(cursor))).toEqual(cursor);
  });

  it("is null when absent — first page", () => {
    expect(parsePageCursor(null)).toBeNull();
    expect(parsePageCursor("  ")).toBeNull();
  });

  it("splits on the FIRST separator, so an id may contain one", () => {
    expect(parsePageCursor("2026-07-26T01:02:03Z|a|b")).toEqual({
      createdAt: "2026-07-26T01:02:03Z",
      id: "a|b",
    });
  });

  it("refuses half a cursor — 0020 refuses it too, and NULL yields an empty page", () => {
    expect(() => parsePageCursor("2026-07-26T01:02:03Z")).toThrow(/created_at>\|<id/);
    expect(() => parsePageCursor("2026-07-26T01:02:03Z|")).toThrow(/created_at>\|<id/);
    expect(() => parsePageCursor("|p-1")).toThrow(/created_at>\|<id/);
  });

  it("refuses a timestamp that is not an ISO instant", () => {
    expect(() => parsePageCursor("yesterday|p-1")).toThrow(/ISO instant/);
    expect(() => parsePageCursor("2026-07-26|p-1")).toThrow(/ISO instant/);
  });

  it("accepts an offset instant, which is how Postgres renders timestamptz", () => {
    expect(parsePageCursor("2026-07-26 01:02:03.456+00|p-1")?.id).toBe("p-1");
  });
});

describe("nextPageCursor", () => {
  const row = (id: string) => ({ id, created_at: "2026-07-26T01:02:03Z", name: "x" });

  it("is null on a short page — the scan reached the end", () => {
    expect(nextPageCursor([row("a"), row("b")], 50)).toBeNull();
    expect(nextPageCursor([], 50)).toBeNull();
  });

  it("is built from the LAST row of a full page", () => {
    expect(nextPageCursor([row("a"), row("b")], 2)).toBe("2026-07-26T01:02:03Z|b");
  });

  it("throws rather than emit a cursor with undefined halves", () => {
    expect(() => nextPageCursor([{ id: "a" }], 1)).toThrow(/no created_at/);
    expect(() => nextPageCursor([{ created_at: "2026-07-26T01:02:03Z" }], 1)).toThrow(/no id/);
    expect(() => nextPageCursor(["nope"], 1)).toThrow(/not an object/);
  });

  it("feeds itself: the cursor it emits is one parsePageCursor accepts", () => {
    const emitted = nextPageCursor([row("z")], 1);
    expect(parsePageCursor(emitted)).toEqual({ createdAt: "2026-07-26T01:02:03Z", id: "z" });
  });
});
