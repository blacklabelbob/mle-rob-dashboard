import { describe, expect, it } from "vitest";
import { buildHostConfirmPayload } from "../hostConfirm";
import { hostConfirmControls, hostConfirmKey } from "../hostConfirmView";

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

// Q84 inc.75 — the done state. The write goes to the ORG; the payload on the flag row is
// re-minted by the next `check:archive` run, so for up to 30 minutes the row still carries an
// action that has already been honoured. Without this the identical button sits there after a
// successful click and the second one answers 409 — a refusal that reads as a contradiction.
describe("hostConfirmControls — an action whose write already landed", () => {
  it("says nothing new when the caller passes no observations (inc.73 behaviour, byte for byte)", () => {
    expect(hostConfirmControls(LIVE, "C-2017")).toEqual(hostConfirmControls(LIVE, "C-2017", []));
    expect(hostConfirmControls(LIVE, "C-2017").every((c) => !c.done)).toBe(true);
  });

  it("turns the written action into a statement — no href, never the offer wording", () => {
    const done = hostConfirmControls(LIVE, "C-2017", [hostConfirmKey("cgroofing.net", "C-2017")]).find(
      (c) => c.orgId === "C-2017",
    )!;
    expect(done.done).toBe(true);
    expect(done.here).toBe(true);
    expect(done.href).toBeNull();
    expect(done.label).toBe("Domain set to cgroofing.net");
    expect(done.label).not.toContain("Set Domain to");
    // The two things a reader would otherwise have to guess.
    expect(done.tooltip).toContain("stays open");
    expect(done.tooltip).toContain("archive check");
  });

  it("leaves the OTHER action on the same row untouched — one click confirms one host", () => {
    const other = hostConfirmControls(LIVE, "C-2017", [hostConfirmKey("cgroofing.net", "C-2017")]).find(
      (c) => c.orgId === "C-2018",
    )!;
    expect(other.done).toBe(false);
    expect(other.href).toBe("/companies/C-2018");
  });

  it("never marks a LINK done — a link wrote nothing, whatever the caller claims", () => {
    const both = [hostConfirmKey("cgroofing.net", "C-2017"), hostConfirmKey("gulfregroup.com", "C-2018")];
    for (const c of hostConfirmControls(LIVE, "C-2017", both)) {
      expect(c.done).toBe(c.here);
    }
    expect(hostConfirmControls(LIVE, null, both).every((c) => !c.done)).toBe(true);
  });

  it("does not match on the host alone — the same host written for a DIFFERENT org is not this action", () => {
    const controls = hostConfirmControls(LIVE, "C-2017", [hostConfirmKey("cgroofing.net", "C-9999")]);
    expect(controls.every((c) => !c.done)).toBe(true);
  });

  it("keys are one spelling, and a pair that was never written is never done", () => {
    expect(hostConfirmKey("cgroofing.net", "C-2017")).toBe("C-2017 cgroofing.net");
    expect(
      hostConfirmControls(LIVE, "C-2017", ["C-2017", "cgroofing.net", "cgroofing.net C-2017"]).every((c) => !c.done),
    ).toBe(true);
  });
});
