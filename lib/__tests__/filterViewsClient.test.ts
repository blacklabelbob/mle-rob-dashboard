import { describe, expect, it } from "vitest";
import {
  VIEWS_ENDPOINT,
  buildViewDeleteUrl,
  buildViewListUrl,
  createSavedView,
  deleteSavedView,
  fetchSavedViews,
  findViewByName,
  isDuplicateNameError,
  isViewsRequestError,
  type ViewsFetch,
} from "@/lib/filters/viewsClient";
import { isFilterInputError } from "@/lib/filters/parse";
import type { SavedView } from "@/lib/filters/savedViews";

// Q67b inc.10 — the picker's write door, browser side. Every assertion here is a rule the
// picker cannot express once it is a React component (no jsdom in this repo).

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

type Call = { url: string; init?: { method?: string; body?: string } };

function stub(...responses: ReturnType<typeof res>[]): { fetchImpl: ViewsFetch; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return responses[Math.min(i++, responses.length - 1)];
    },
  };
}

const FILTER = { op: "lit", lit: { lit: "person.status", value: "warm" } } as const;

const row = (over: Partial<SavedView> = {}) => ({
  id: "v1",
  target: "person",
  name: "Warm",
  filter: FILTER,
  scope: "personal",
  owner_id: "rob",
  team_id: null,
  ...over,
});

const view = (over: Partial<SavedView> = {}) => row(over) as SavedView;

describe("buildViewListUrl / buildViewDeleteUrl", () => {
  it("encodes ids instead of concatenating them", () => {
    // An owner id carrying `&` concatenated by hand lists a DIFFERENT rep's views rather
    // than failing — the worst shape of bug for a picker.
    const url = buildViewListUrl({ owner: "rob&admin=1", team: "mle" });
    expect(url).toBe(`${VIEWS_ENDPOINT}?owner=rob%26admin%3D1&team=mle`);
  });

  it("drops a blank team rather than sending ?team=", () => {
    expect(buildViewListUrl({ owner: "rob" })).toBe(`${VIEWS_ENDPOINT}?owner=rob`);
    expect(buildViewListUrl({ owner: "rob", team: null })).toBe(`${VIEWS_ENDPOINT}?owner=rob`);
    expect(buildViewListUrl({ owner: "rob", team: "  " })).toBe(`${VIEWS_ENDPOINT}?owner=rob`);
  });

  it("refuses a request with no owner, before any network", () => {
    expect(() => buildViewListUrl({ owner: "  " })).toThrow(/needs an owner/);
    // The family matters: a URL the client refused is "your input", not "the server said
    // no" — the UI shows those two differently.
    try {
      buildViewListUrl({ owner: "" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(isFilterInputError(e)).toBe(true);
    }
  });

  it("always carries the owner on delete — id alone would delete anyone's view", () => {
    expect(buildViewDeleteUrl("v1", "rob")).toBe(`${VIEWS_ENDPOINT}?id=v1&owner=rob`);
    expect(() => buildViewDeleteUrl("v1", "")).toThrow(/needs an owner/);
    expect(() => buildViewDeleteUrl("", "rob")).toThrow(/needs a view id/);
  });
});

describe("fetchSavedViews", () => {
  it("returns the views a rep can open", async () => {
    const s = stub(res(200, { views: [row(), row({ id: "v2", name: "Cold" })], broken: [] }));
    const list = await fetchSavedViews({ owner: "rob" }, { fetchImpl: s.fetchImpl });
    expect(list.views.map((v) => v.name)).toEqual(["Warm", "Cold"]);
    expect(list.broken).toEqual([]);
    expect(s.calls[0].url).toBe(`${VIEWS_ENDPOINT}?owner=rob`);
  });

  it("keeps the good views when one row is unreadable", async () => {
    // One bad row must not blank a rep's whole sidebar.
    const s = stub(res(200, { views: [row(), row({ id: "v2", target: "nope" as never })] }));
    const list = await fetchSavedViews({ owner: "rob" }, { fetchImpl: s.fetchImpl });
    expect(list.views.map((v) => v.id)).toEqual(["v1"]);
    expect(list.broken).toHaveLength(1);
    expect(list.broken[0].id).toBe("v2");
  });

  it("carries the route's own broken rows through", async () => {
    const s = stub(res(200, { views: [], broken: [{ id: "v9", error: "unknown scope" }] }));
    const list = await fetchSavedViews({ owner: "rob" }, { fetchImpl: s.fetchImpl });
    expect(list.broken).toEqual([{ id: "v9", error: "unknown scope" }]);
  });

  it("throws when `views` is absent — an empty sidebar would be a lie", async () => {
    const s = stub(res(200, { broken: [] }));
    await expect(fetchSavedViews({ owner: "rob" }, { fetchImpl: s.fetchImpl })).rejects.toThrow(
      /has no views/,
    );
  });

  it("reports the route's message on failure, and the status when the body is not JSON", async () => {
    const bad = stub(res(500, { error: "views api: supabase env not set" }));
    await expect(fetchSavedViews({ owner: "rob" }, { fetchImpl: bad.fetchImpl })).rejects.toThrow(
      /supabase env not set/,
    );

    const html = stub(res(502, null, { badJson: true }));
    await expect(
      fetchSavedViews({ owner: "rob" }, { fetchImpl: html.fetchImpl }),
    ).rejects.toThrow(/views request failed \(502\)/);
  });
});

describe("createSavedView", () => {
  const insert = { target: "person", name: "Warm", filter: FILTER, scope: "personal", owner_id: "rob", team_id: null };

  it("POSTs the validated insert and reads the row back", async () => {
    const s = stub(res(201, { view: row() }));
    const saved = await createSavedView(insert, { fetchImpl: s.fetchImpl });
    expect(saved.id).toBe("v1");
    expect(s.calls[0].url).toBe(VIEWS_ENDPOINT);
    expect(s.calls[0].init?.method).toBe("POST");
    expect(JSON.parse(s.calls[0].init?.body ?? "{}")).toMatchObject({ name: "Warm", owner_id: "rob" });
  });

  it("refuses an illegal view before a connection opens", async () => {
    // A blank name is a guaranteed 400; spending a round trip to be told so is waste, and
    // the local error is the one the form can put next to the field.
    const s = stub(res(201, { view: row() }));
    await expect(
      createSavedView({ ...insert, name: "   " }, { fetchImpl: s.fetchImpl }),
    ).rejects.toThrow(/name is blank/);
    expect(s.calls).toHaveLength(0);

    // A personal view carrying a team_id is the pairing 0019 CHECKs — also refused here.
    await expect(
      createSavedView({ ...insert, team_id: "mle" }, { fetchImpl: s.fetchImpl }),
    ).rejects.toThrow(/personal view carries a team_id/);
    expect(s.calls).toHaveLength(0);
  });

  it("surfaces a duplicate name as its own condition", async () => {
    const s = stub(res(409, { error: 'a view named "Warm" already exists here' }));
    await createSavedView(insert, { fetchImpl: s.fetchImpl }).then(
      () => expect.unreachable("should have rejected"),
      (e) => {
        expect(isDuplicateNameError(e)).toBe(true);
        expect(String(e.message)).toMatch(/already exists/);
      },
    );
  });

  it("treats an unreadable saved row as a failure, not a success", async () => {
    // A 201 whose body does not parse means the picker would render a broken entry.
    const s = stub(res(201, { view: { id: "v1" } }));
    await expect(createSavedView(insert, { fetchImpl: s.fetchImpl })).rejects.toThrow(
      /came back unreadable/,
    );
  });
});

describe("deleteSavedView", () => {
  it("sends DELETE with both id and owner", async () => {
    const s = stub(res(200, { deleted: "v1" }));
    await expect(deleteSavedView("v1", "rob", { fetchImpl: s.fetchImpl })).resolves.toBe("v1");
    expect(s.calls[0].url).toBe(`${VIEWS_ENDPOINT}?id=v1&owner=rob`);
    expect(s.calls[0].init?.method).toBe("DELETE");
  });

  it("does not smooth a 404 into success", async () => {
    // 404 also means "someone else's view": reporting it as deleted would drop a
    // colleague's view out of this rep's sidebar while it still exists for them.
    const s = stub(res(404, { error: "view not found" }));
    await deleteSavedView("v1", "rob", { fetchImpl: s.fetchImpl }).then(
      () => expect.unreachable("should have rejected"),
      (e) => {
        expect(isViewsRequestError(e)).toBe(true);
        expect(e.status).toBe(404);
      },
    );
  });
});

describe("findViewByName", () => {
  const mine = view({ id: "v1", name: "Warm", scope: "personal", owner_id: "rob" });
  const theirs = view({ id: "v2", name: "Warm", scope: "personal", owner_id: "dee" });
  const team = view({ id: "v3", name: "Warm", scope: "team", owner_id: "dee", team_id: "mle" });

  it("matches the way 0019's indexes do — case- and whitespace-insensitive", () => {
    const hit = findViewByName([mine], "  warm ", { scope: "personal", owner_id: "rob" });
    expect(hit?.id).toBe("v1");
  });

  it("does not warn about another rep's personal view of the same name", () => {
    expect(findViewByName([theirs], "Warm", { scope: "personal", owner_id: "rob" })).toBeNull();
  });

  it("keeps personal and team namespaces apart", () => {
    // The same name legitimately exists twice: once in a rep's list, once in the team's.
    expect(findViewByName([team], "Warm", { scope: "personal", owner_id: "rob" })).toBeNull();
    expect(
      findViewByName([team], "Warm", { scope: "team", owner_id: "rob", team_id: "mle" })?.id,
    ).toBe("v3");
    expect(
      findViewByName([team], "Warm", { scope: "team", owner_id: "rob", team_id: "other" }),
    ).toBeNull();
  });

  it("never matches a blank name", () => {
    expect(findViewByName([mine], "   ", { scope: "personal", owner_id: "rob" })).toBeNull();
  });
});
