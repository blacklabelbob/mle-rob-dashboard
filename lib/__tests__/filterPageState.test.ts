import { describe, expect, it } from "vitest";
import {
  applyError,
  applyPage,
  beginLoadMore,
  beginRequest,
  initialViewPageState,
  isBusy,
  pendingCursor,
  type ViewPageState,
} from "@/lib/filters/pageState";
import type { ViewPage } from "@/lib/filters/pageClient";
import type { MappedRow } from "@/lib/filters/rows";

const row = (id: string, name = id): MappedRow => ({ id, name }) as unknown as MappedRow;

function page(rows: MappedRow[], nextCursor: string | null, name = "Warm people"): ViewPage {
  return { target: "person", name, rows, nextCursor };
}

/** State with one page of a person view on screen, cursor `c1` outstanding. */
function ready(): ViewPageState {
  const s = beginRequest(initialViewPageState, { kind: "view", id: "v1" });
  return applyPage(s, s.requestId, page([row("a"), row("b")], "c1"), null);
}

describe("beginRequest", () => {
  it("advances the generation and drops the previous view's rows", () => {
    const s = ready();
    const next = beginRequest(s, { kind: "view", id: "v2" });
    expect(next.requestId).toBe(s.requestId + 1);
    expect(next.page).toBeNull();
    expect(next.status).toBe("loading");
    expect(next.error).toBeNull();
  });

  it("advances even when the source is unchanged, so it doubles as reload", () => {
    const s = ready();
    const same = beginRequest(s, s.source);
    expect(same.requestId).toBe(s.requestId + 1);
  });

  it("a null source is idle, not loading — the unfiltered list is a real state", () => {
    const next = beginRequest(ready(), null);
    expect(next.status).toBe("idle");
    expect(next.source).toBeNull();
    expect(next.page).toBeNull();
  });
});

describe("stale responses", () => {
  it("a superseded view's page is dropped, not rendered under the new view", () => {
    const first = beginRequest(initialViewPageState, { kind: "view", id: "v1" });
    const switched = beginRequest(first, { kind: "view", id: "v2" });
    const late = applyPage(switched, first.requestId, page([row("old")], null), null);
    expect(late).toBe(switched); // same object — nothing to re-render
    expect(late.page).toBeNull();
    expect(late.status).toBe("loading");
  });

  it("a superseded view's error is not surfaced either", () => {
    const first = beginRequest(initialViewPageState, { kind: "view", id: "v1" });
    const switched = beginRequest(first, { kind: "view", id: "v2" });
    expect(applyError(switched, first.requestId, "aborted")).toBe(switched);
    expect(switched.error).toBeNull();
  });
});

describe("beginLoadMore", () => {
  it("is a no-op at the last page", () => {
    const s = ready();
    const last = applyPage(beginLoadMore(s), beginLoadMore(s).requestId, page([row("c")], null), "c1");
    expect(last.page?.nextCursor).toBeNull();
    expect(beginLoadMore(last)).toBe(last);
  });

  it("is a no-op while a request is already in flight — one cursor, one request", () => {
    const s = beginLoadMore(ready());
    expect(s.status).toBe("loadingMore");
    expect(beginLoadMore(s)).toBe(s);
  });

  it("is a no-op before the first page arrives", () => {
    const loading = beginRequest(initialViewPageState, { kind: "view", id: "v1" });
    expect(beginLoadMore(loading)).toBe(loading);
  });

  it("advances the generation and exposes the cursor it will send", () => {
    const s = beginLoadMore(ready());
    expect(s.requestId).toBe(ready().requestId + 1);
    expect(pendingCursor(s)).toBe("c1");
    expect(isBusy(s)).toBe(true);
  });

  it("pendingCursor is null for a first page, so applyPage starts rather than appends", () => {
    expect(pendingCursor(beginRequest(initialViewPageState, { kind: "view", id: "v1" }))).toBeNull();
  });
});

describe("applyPage", () => {
  it("appends the second page and carries the new cursor", () => {
    const more = beginLoadMore(ready());
    const next = applyPage(more, more.requestId, page([row("c")], "c2"), "c1");
    expect(next.status).toBe("ready");
    expect(next.page?.rows.map((r) => (r as { id: string }).id)).toEqual(["a", "b", "c"]);
    expect(next.page?.nextCursor).toBe("c2");
  });

  it("surfaces appendPage's refusals as state, never as a thrown render", () => {
    const more = beginLoadMore(ready());
    // The server handed back the cursor it was given: "load more" would loop forever.
    const next = applyPage(more, more.requestId, page([row("c")], "c1"), "c1");
    expect(next.status).toBe("error");
    expect(next.error).toMatch(/did not advance/);
    expect(next.page?.rows).toHaveLength(2); // what was on screen is still on screen
  });

  it("a target change is an error, not silently mixed row shapes", () => {
    const more = beginLoadMore(ready());
    const deals = { target: "deal" as const, name: "Warm people", rows: [row("d")], nextCursor: null };
    const next = applyPage(more, more.requestId, deals, "c1");
    expect(next.status).toBe("error");
    expect(next.error).toMatch(/target changed/);
  });

  it("a cursored page with no first page to extend is an error, not a fresh list", () => {
    const orphan: ViewPageState = { ...ready(), page: null };
    const next = applyPage(orphan, orphan.requestId, page([row("c")], null), "c1");
    expect(next.status).toBe("error");
    expect(next.error).toMatch(/no first page/);
  });
});

describe("applyError", () => {
  it("keeps the rows already on screen and leaves the cursor retryable", () => {
    const more = beginLoadMore(ready());
    const next = applyError(more, more.requestId, "view request failed (502)");
    expect(next.status).toBe("error");
    expect(next.error).toBe("view request failed (502)");
    expect(next.page?.rows).toHaveLength(2);
    expect(next.page?.nextCursor).toBe("c1");
  });

  it("a failed first page has nothing to keep", () => {
    const s = beginRequest(initialViewPageState, { kind: "view", id: "v1" });
    const next = applyError(s, s.requestId, "view request failed (400)");
    expect(next.page).toBeNull();
    expect(isBusy(next)).toBe(false);
  });
});
