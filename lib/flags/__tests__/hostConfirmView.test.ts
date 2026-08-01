import { describe, expect, it } from "vitest";
import { buildHostConfirmPayload } from "../hostConfirm";
import { hostConfirmControls } from "../hostConfirmView";

// The live row this exists for: prod flag #133, filed against NO record, rendered on both
// /companies/C-2017 and /companies/C-2018, carrying one action for each.
const LIVE = buildHostConfirmPayload([
  { host: "cgroofing.net", orgId: "C-2017" },
  { host: "gulfregroup.com", orgId: "C-2018" },
]);

describe("hostConfirmControls", () => {
  it("renders nothing for the NULL payload every prod row carries today (0035 pending)", () => {
    expect(hostConfirmControls(null, "C-2017")).toEqual([]);
    expect(hostConfirmControls(undefined, "C-2017")).toEqual([]);
  });

  it("renders nothing for a payload the codec refuses, rather than a half-filled control", () => {
    expect(hostConfirmControls({ kind: "host-confirm", actions: [{ kind: "host-confirm", host: "x", orgId: "nope" }] }, "C-2017")).toEqual([]);
    expect(hostConfirmControls({ kind: "something-else", actions: [] }, "C-2017")).toEqual([]);
  });

  it("writes ONLY on the action's own org page — the other action is a link, never a button", () => {
    const controls = hostConfirmControls(LIVE, "C-2017");
    expect(controls).toHaveLength(2);
    const mine = controls.find((c) => c.orgId === "C-2017")!;
    const theirs = controls.find((c) => c.orgId === "C-2018")!;
    expect(mine.here).toBe(true);
    expect(mine.href).toBeNull();
    expect(mine.label).toContain("cgroofing.net");
    expect(theirs.here).toBe(false);
    expect(theirs.href).toBe("/companies/C-2018");
  });

  it("flips with the page — the same row on C-2018 makes the OTHER action the writable one", () => {
    const controls = hostConfirmControls(LIVE, "C-2018");
    expect(controls.find((c) => c.orgId === "C-2018")!.here).toBe(true);
    expect(controls.find((c) => c.orgId === "C-2017")!.here).toBe(false);
  });

  it("offers no write at all on the Overview digest, where there is no org page to be on", () => {
    const controls = hostConfirmControls(LIVE, null);
    expect(controls).toHaveLength(2);
    expect(controls.every((c) => !c.here)).toBe(true);
    expect(controls.every((c) => c.href !== null)).toBe(true);
  });

  it("does not treat a PERSON's page as the org's page", () => {
    expect(hostConfirmControls(LIVE, "P-1010").every((c) => !c.here)).toBe(true);
  });

  it("every non-here control links to the org it names, and no here control links anywhere", () => {
    for (const pageId of [null, "C-2017", "C-2018", "C-9999"]) {
      for (const c of hostConfirmControls(LIVE, pageId)) {
        expect(c.here ? c.href === null : c.href === `/companies/${c.orgId}`).toBe(true);
      }
    }
  });
});
