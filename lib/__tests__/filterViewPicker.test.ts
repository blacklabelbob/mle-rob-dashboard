import { describe, expect, it } from "vitest";
import {
  NO_VIEW_LABEL,
  SHARED_LINK_LABEL,
  UNKNOWN_VIEW_LABEL,
  buildClearViewHref,
  buildViewHref,
  isViewNameFree,
  selectViewPicker,
} from "@/lib/filters/viewPicker";
import { encodeShareLink, type SavedView } from "@/lib/filters/savedViews";
import { readViewSource } from "@/lib/filters/browserView";
import { isFilterInputError } from "@/lib/filters/parse";

// Q67b inc.11 — the picker seam. Every assertion here is a rule that becomes untestable
// the moment it lives inside a React component (this repo has no jsdom).

const OWNER = "rep-rob";

function view(over: Partial<SavedView> = {}): SavedView {
  return {
    id: "v1",
    target: "person",
    name: "Warm roofers",
    filter: { op: "lit", lit: { lit: "person.status", value: "warm" } },
    scope: "personal",
    owner_id: OWNER,
    team_id: null,
    ...over,
  } as SavedView;
}

const SCOPE = { scope: "personal" as const, owner_id: OWNER, team_id: null };

function list(views: SavedView[], broken: { id: unknown; error: string }[] = []) {
  return { views, broken };
}

function sourceFrom(query: string) {
  return readViewSource(new URLSearchParams(query));
}

describe("view hrefs", () => {
  it("selecting a view drops a share token — both doors in one URL is the one combo the route refuses", () => {
    const href = buildViewHref("/people?share=abc&sort=name", "v1");
    const params = new URL(href, "http://x.invalid").searchParams;
    expect(params.get("view")).toBe("v1");
    expect(params.get("share")).toBeNull();
    // Page-level params survive: they describe the page, not the view.
    expect(params.get("sort")).toBe("name");
    // And the result is something the route's own reader accepts.
    expect(sourceFrom(new URL(href, "http://x.invalid").search.slice(1))).toEqual({
      kind: "view",
      id: "v1",
    });
  });

  it("clearing drops BOTH doors and keeps the rest of the page", () => {
    const href = buildClearViewHref("/people?view=v1&tab=all");
    expect(href).toBe("/people?tab=all");
    expect(sourceFrom("tab=all")).toBeNull();
  });

  it("a blank id is refused rather than built into a URL the route 400s on", () => {
    expect(() => buildViewHref("/people", "   ")).toThrow();
    try {
      buildViewHref("/people", "");
    } catch (e) {
      expect(isFilterInputError(e)).toBe(true);
    }
  });
});

describe("selectViewPicker", () => {
  it("no view = the unfiltered ledger, a real state with a real label", () => {
    const m = selectViewPicker({ pageUrl: "/people", source: null, list: list([view()]) });
    expect(m.selection).toBe("none");
    expect(m.label).toBe(NO_VIEW_LABEL);
    expect(m.items).toHaveLength(1);
    expect(m.items[0].selected).toBe(false);
    expect(m.saveable).toBeNull();
  });

  it("a saved view is selected by id and labelled with its own name", () => {
    const m = selectViewPicker({
      pageUrl: "/people?view=v1",
      source: sourceFrom("view=v1"),
      list: list([view(), view({ id: "v2", name: "Cold" })]),
    });
    expect(m.selection).toBe("saved");
    expect(m.label).toBe("Warm roofers");
    expect(m.items.filter((i) => i.selected).map((i) => i.id)).toEqual(["v1"]);
  });

  it("a ?view= the list does not contain is its OWN state — never 'All people'", () => {
    // The lie this pins: the table is filtered (the route 404s and the ledger paints an
    // error), so a picker reading "All people" over it says the CRM is empty when it isn't.
    const m = selectViewPicker({
      pageUrl: "/people?view=gone",
      source: sourceFrom("view=gone"),
      list: list([view()]),
    });
    expect(m.selection).toBe("unknown-view");
    expect(m.label).toBe(UNKNOWN_VIEW_LABEL);
    expect(m.items.some((i) => i.selected)).toBe(false);
  });

  it("a list still in flight does not turn a real ?view= into 'All people' either", () => {
    const m = selectViewPicker({
      pageUrl: "/people?view=v1",
      source: sourceFrom("view=v1"),
      list: null,
    });
    expect(m.selection).toBe("unknown-view");
    expect(m.label).not.toBe(NO_VIEW_LABEL);
    expect(m.items).toEqual([]);
  });

  it("a share link is saveable — it is the one case the browser holds the filter tree", () => {
    const payload = { target: "person" as const, name: "Storm leads", filter: view().filter };
    const token = encodeShareLink(payload);
    const m = selectViewPicker({
      pageUrl: `/people?share=${token}`,
      source: sourceFrom(`share=${encodeURIComponent(token)}`),
      list: list([view()]),
      saveScope: SCOPE,
    });
    expect(m.selection).toBe("shared");
    expect(m.saveable).toEqual(payload);
    expect(m.label).toBe(`${SHARED_LINK_LABEL}: Storm leads`);
    // It is NOT a saved view, so nothing in the list highlights.
    expect(m.items.some((i) => i.selected)).toBe(false);
    expect(m.nameTaken).toBeNull();
  });

  it("a share link whose name is already taken says so BEFORE the click, the way 0019 compares", () => {
    const token = encodeShareLink({
      target: "person",
      name: "  warm ROOFERS  ",
      filter: view().filter,
    });
    const m = selectViewPicker({
      pageUrl: "/people",
      source: sourceFrom(`share=${encodeURIComponent(token)}`),
      list: list([view()]),
      saveScope: SCOPE,
    });
    expect(m.nameTaken?.id).toBe("v1");
  });

  it("with no save scope the duplicate question is left UNJUDGED, not answered 'free'", () => {
    // Owner identity comes off the wire and is never defaulted; guessing 'free' here is
    // the answer that 409s on click.
    const token = encodeShareLink({ target: "person", name: "Warm roofers", filter: view().filter });
    const m = selectViewPicker({
      pageUrl: "/people",
      source: sourceFrom(`share=${encodeURIComponent(token)}`),
      list: list([view()]),
    });
    expect(m.saveable).not.toBeNull();
    expect(m.nameTaken).toBeNull();
  });

  it("an undecodable share token costs the Save button, not the page", () => {
    const m = selectViewPicker({
      pageUrl: "/people",
      source: { kind: "share", token: "!!!not-base64url!!!" },
      list: list([view()]),
    });
    expect(m.selection).toBe("shared");
    expect(m.label).toBe(SHARED_LINK_LABEL);
    expect(m.saveable).toBeNull();
    expect(m.items).toHaveLength(1);
  });

  it("broken rows are counted, never silently dropped", () => {
    const m = selectViewPicker({
      pageUrl: "/people",
      source: null,
      list: list([view()], [{ id: "v9", error: "unknown literal" }]),
    });
    expect(m.brokenCount).toBe(1);
    expect(m.items).toHaveLength(1);
  });

  it("clearHref is offered from every state, including a share link", () => {
    const m = selectViewPicker({
      pageUrl: "/people?share=abc&tab=all",
      source: { kind: "share", token: "abc" },
      list: null,
    });
    expect(m.clearHref).toBe("/people?tab=all");
  });

  it("a page URL that cannot be parsed is our own caller's bug and throws", () => {
    expect(() => selectViewPicker({ pageUrl: "http://", source: null, list: null })).toThrow();
  });
});

describe("isViewNameFree", () => {
  it("judges the name the way the unique indexes do", () => {
    expect(isViewNameFree([view()], "  WARM roofers ", SCOPE)).toBe(false);
    expect(isViewNameFree([view()], "Warm roofers 2", SCOPE)).toBe(true);
  });

  it("a blank name is never free — a blank is what 0019's CHECK rejects", () => {
    expect(isViewNameFree([view()], "   ", SCOPE)).toBe(false);
  });

  it("the same name in a different scope is genuinely free (per-owner vs per-team indexes)", () => {
    expect(
      isViewNameFree([view()], "Warm roofers", { scope: "team", owner_id: OWNER, team_id: "t1" }),
    ).toBe(true);
  });
});
