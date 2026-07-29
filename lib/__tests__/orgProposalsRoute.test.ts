// Q69 inc.9 — the real POST handler over a fake store, proving the ONE case
// inc.8's unique index created and no code path could yet speak about: two
// reviewers (or one double-click) accepting the same queued proposal. The
// second INSERT is refused by `orgs_domain_unique`, and the reviewer must read
// the same "already exists" refusal they'd have read a second earlier — not a
// 500 that leaves them unsure whether the company got made.
// callRecordingRoute precedent: no network, no env, no Postgres.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NetworkData, Person } from "../types";

const h = vi.hoisted(() => ({
  thrown: null as unknown,
  written: [] as Person[],
}));

const NETWORK: NetworkData = {
  people: [],
  edges: [],
  verticals: [{ id: "title", name: "Title", color: "#111" }],
  projects: [],
};

vi.mock("../storage", () => ({
  getStore: () => ({
    getNetwork: async () => NETWORK,
    upsertPerson: async (p: Person) => {
      if (h.thrown) throw h.thrown;
      h.written.push(p);
    },
  }),
}));

import { POST } from "../../app/api/admin/org-proposals/route";

const post = (body: unknown) =>
  POST({ json: async () => body } as Parameters<typeof POST>[0]);

const proposal = { domain: "roofco.com", name: "Roof Co", verticalId: "title" };

beforeEach(() => {
  h.thrown = null;
  h.written = [];
});

describe("POST /api/admin/org-proposals — the write race", () => {
  it("creates the company when the write succeeds", async () => {
    const res = await post(proposal);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(h.written).toHaveLength(1);
    expect(h.written[0].id).toBe("C-2001");
  });

  // The whole point of inc.8's index: the loser of the race reads a refusal.
  it("turns the unique-index violation into the same 409, naming the domain", async () => {
    h.thrown = new Error(
      'supabase upsertPerson failed: duplicate key value violates unique constraint "orgs_domain_unique"'
    );
    const res = await post(proposal);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, refused: "domain-already-known" });
    expect(body.detail).toContain("roofco.com");
  });

  // A different write failure is a real failure. Swallowing it as "already
  // exists" would report a company that was never created.
  it("rethrows any other write failure rather than reporting a conflict", async () => {
    h.thrown = new Error("supabase upsertPerson failed: connection reset");
    await expect(post(proposal)).rejects.toThrow(/connection reset/);
  });

  // Pre-flight refusals still come from the pure planner, unchanged.
  it("still refuses a generic domain before it ever reaches the store", async () => {
    const res = await post({ ...proposal, domain: "gmail.com" });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ refused: "generic-domain" });
    expect(h.written).toHaveLength(0);
  });

  it("asks for a vertical with 422, not 409 — the reviewer still owes a fact", async () => {
    const res = await post({ ...proposal, verticalId: "" });
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ refused: "vertical-required" });
    expect(h.written).toHaveLength(0);
  });
});
