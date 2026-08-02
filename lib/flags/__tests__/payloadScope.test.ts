import { describe, it, expect } from "vitest";
import { payloadScopeNote, scopeHostConfirmPayload } from "../payloadScope";
import { readHostConfirmPayload } from "../hostConfirm";
import { hostConfirmControls } from "../hostConfirmView";
import { flagNamedRecordIds } from "../recordLinks";

// Q84 inc.101 — prod #133's shape, as it is actually written: `proposalText` prints the pick as
// `${org.name} [${org.id}]`, so the two orgs the payload acts on are named by the row's own
// detail. That is why this row already renders on both companies' pages (inc.26).
const DETAIL =
  "2 hosts to place, and then 3 meetings can close:\n" +
  "• cgroofing.net — put it in the right org's Domain field. Heard on: 2026-06-16 Caleb/Rob\n" +
  "    → likely CG Roofing Group [C-2017] — near-miss on a held host; the slot is free\n" +
  "• gulfregroup.com — put it in the right org's Domain field. Heard on: 2026-07-16 Gulf\n" +
  "    → likely Gulf Coast RE Group [C-2018] — near-miss on a held host; the slot is free";
const TITLE = "Meetings archived with no CRM activity";

const payload = (...actions: Array<{ host: string; orgId: string }>) => ({
  kind: "host-confirm",
  actions: actions.map((a) => ({ kind: "host-confirm", ...a })),
});

const BOTH = payload({ host: "cgroofing.net", orgId: "C-2017" }, { host: "gulfregroup.com", orgId: "C-2018" });

describe("scopeHostConfirmPayload", () => {
  it("keeps the real producer's payload byte-for-byte — both orgs are named in its detail", () => {
    // The premise, asserted rather than assumed: the ids really are readable out of the prose.
    expect(flagNamedRecordIds(TITLE, DETAIL)).toEqual(expect.arrayContaining(["C-2017", "C-2018"]));
    const scoped = scopeHostConfirmPayload(TITLE, DETAIL, null, BOTH);
    expect(scoped.dropped).toEqual([]);
    expect(scoped.payload).toEqual(readHostConfirmPayload(BOTH));
  });

  it("drops the action pointing at an org this finding never names", () => {
    const scoped = scopeHostConfirmPayload(
      TITLE,
      DETAIL,
      null,
      payload({ host: "cgroofing.net", orgId: "C-2017" }, { host: "elsewhere.com", orgId: "C-9999" }),
    );
    expect(scoped.dropped).toEqual(["C-9999"]);
    expect(scoped.payload?.actions.map((a) => a.orgId)).toEqual(["C-2017"]);
  });

  it("is per-action, never all-or-nothing (inc.72) — the in-scope siblings survive", () => {
    const scoped = scopeHostConfirmPayload(
      TITLE,
      DETAIL,
      null,
      payload(
        { host: "cgroofing.net", orgId: "C-2017" },
        { host: "elsewhere.com", orgId: "C-9999" },
        { host: "gulfregroup.com", orgId: "C-2018" },
      ),
    );
    expect(scoped.payload?.actions.map((a) => a.orgId)).toEqual(["C-2017", "C-2018"]);
    expect(scoped.dropped).toEqual(["C-9999"]);
  });

  it("counts the record the row is FILED on as reachable, not only the ones it prints", () => {
    // Filed on C-2018 and naming nothing: the record page shows it by `entity_id` alone.
    const scoped = scopeHostConfirmPayload("Domain proposal", "no ids in this prose", "C-2018", payload({ host: "gulfregroup.com", orgId: "C-2018" }));
    expect(scoped.dropped).toEqual([]);
    expect(scoped.payload?.actions).toHaveLength(1);
  });

  it("returns no payload — and no complaint — when the caller sent none", () => {
    expect(scopeHostConfirmPayload(TITLE, DETAIL, null, null)).toEqual({ payload: null, dropped: [] });
    expect(scopeHostConfirmPayload(TITLE, DETAIL, null, { kind: "nope" })).toEqual({ payload: null, dropped: [] });
  });

  it("still refuses what the codec refuses — scope is an EXTRA question, not a replacement", () => {
    // A malformed member voids the whole payload (inc.74), even when its org is in scope.
    const scoped = scopeHostConfirmPayload(TITLE, DETAIL, null, {
      kind: "host-confirm",
      actions: [{ kind: "host-confirm", host: "cgroofing.net", orgId: "C-2017" }, { kind: "host-confirm", host: 7, orgId: "C-2018" }],
    });
    expect(scoped.payload).toBeNull();
    expect(scoped.dropped).toEqual([]);
  });

  it("names the defect it prevents: a dropped action could never have rendered its button", () => {
    // inc.73's rule, run directly. The page that would make C-9999 writable is a page this
    // finding does not appear on, so the surviving control there would be a link and nothing more.
    const ungated = readHostConfirmPayload(payload({ host: "elsewhere.com", orgId: "C-9999" }));
    expect(hostConfirmControls(ungated, "C-2017").every((c) => !c.here)).toBe(true);
    expect(hostConfirmControls(scopeHostConfirmPayload(TITLE, DETAIL, null, payload({ host: "elsewhere.com", orgId: "C-9999" })).payload, "C-2017")).toEqual([]);
  });
});

describe("payloadScopeNote", () => {
  it("says nothing when nothing was dropped", () => {
    expect(payloadScopeNote([])).toBeNull();
  });

  it("names the ids and the fix, not just the no (inc.93)", () => {
    const note = payloadScopeNote(["C-9999"]);
    expect(note).toContain("C-9999");
    expect(note).toContain("[C-9999]");
  });
});
