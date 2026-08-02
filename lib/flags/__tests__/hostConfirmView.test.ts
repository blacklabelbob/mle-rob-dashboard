import { describe, expect, it } from "vitest";
import { buildHostConfirmPayload } from "../hostConfirm";
import { hostConfirmControls, hostConfirmKey } from "../hostConfirmView";
import { ARCHIVE_CHECK_CEILING_MINUTES, WITHIN_ARCHIVE_CHECK } from "@/lib/meetings/archiveCadence";

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

// Q84 inc.79 — the control that produced the write now says WHEN it goes away. The paragraph
// above it has carried the ceiling since inc.78; the button did not, so one reader got a dated
// promise and an open-ended one about the same thirty minutes.
describe("hostConfirmControls — the done control says when the wait ends", () => {
  const doneControl = () =>
    hostConfirmControls(LIVE, "C-2017", [hostConfirmKey("cgroofing.net", "C-2017")]).find(
      (c) => c.orgId === "C-2017",
    )!;

  it("names the ceiling on the done tooltip, in the ONE spelling the heading uses", () => {
    expect(doneControl().tooltip).toContain(WITHIN_ARCHIVE_CHECK);
    expect(WITHIN_ARCHIVE_CHECK).toBe(`within ${ARCHIVE_CHECK_CEILING_MINUTES} minutes`);
  });

  it("is a CEILING, never a countdown and never a clock time", () => {
    const tooltip = doneControl().tooltip;
    // The leading space is what makes this mean something: "within 30 minutes" contains
    // "in 30 minutes", so the bare substring can never fail.
    expect(tooltip).not.toContain(" in 30 minutes");
    expect(tooltip).not.toMatch(/\d{1,2}:\d{2}/);
    expect(tooltip).toContain("The next archive check drops this control");
  });

  it("says it ONLY where a write landed — an offer and a link promise nothing about the wait", () => {
    const fresh = hostConfirmControls(LIVE, "C-2017");
    for (const c of fresh) expect(c.tooltip).not.toContain(WITHIN_ARCHIVE_CHECK);
    const link = hostConfirmControls(LIVE, "C-2017", [hostConfirmKey("cgroofing.net", "C-2017")]).find(
      (c) => c.orgId === "C-2018",
    )!;
    expect(link.tooltip).not.toContain(WITHIN_ARCHIVE_CHECK);
  });
});

// Q84 inc.102 — the reader's own scope gate. inc.101 put the rule on `POST /api/admin/flags`;
// a row written before that rule, or by any other writer of the column, reaches the reader
// having never passed it. These pin that the SECOND door closes the same way the first does.
describe("hostConfirmControls — an action the row cannot reach", () => {
  // #133's real prose: both ids are printed in the detail, which is why it renders on both.
  const NAMES_BOTH =
    "• cgroofing.net → likely CG Roofing Group [C-2017]\n" +
    "• gulfregroup.com → likely Gulf Coast RE Group [C-2018]";
  const STRAY = buildHostConfirmPayload([
    { host: "cgroofing.net", orgId: "C-2017" },
    { host: "elsewhere.com", orgId: "C-9999" },
  ]);

  it("changes NOTHING for a caller that does not hand in the row — inc.73 exactly", () => {
    expect(hostConfirmControls(STRAY, "C-2017")).toEqual(hostConfirmControls(STRAY, "C-2017", []));
    expect(hostConfirmControls(STRAY, "C-2017").map((c) => c.orgId)).toEqual(["cgroofing.net", "elsewhere.com"].map(
      (h) => (h === "cgroofing.net" ? "C-2017" : "C-9999"),
    ));
  });

  it("drops it once the row IS handed in, and keeps the one the row names", () => {
    const controls = hostConfirmControls(STRAY, "C-2017", [], { title: "Hosts to place", detail: NAMES_BOTH });
    expect(controls.map((c) => c.orgId)).toEqual(["C-2017"]);
    expect(controls[0].here).toBe(true);
  });

  it("reaches the org the row is FILED on even when the prose never names it", () => {
    const controls = hostConfirmControls(STRAY, "C-9999", [], {
      title: "Hosts to place",
      detail: NAMES_BOTH,
      entityId: "C-9999",
    });
    expect(controls.map((c) => c.orgId).sort()).toEqual(["C-2017", "C-9999"]);
    expect(controls.find((c) => c.orgId === "C-9999")!.here).toBe(true);
  });

  it("costs Rob no affordance on any page the row actually reaches", () => {
    // The failure direction, pinned where it can be pinned: on a page this row DOES reach,
    // the out-of-scope action was already a link (inc.73), so dropping it removes nothing
    // clickable. `null` is the Overview digest, which has no org page to be on at all.
    for (const pageId of ["C-2017", "C-2018", "P-1010", null]) {
      const before = hostConfirmControls(STRAY, pageId);
      const after = hostConfirmControls(STRAY, pageId, [], { title: "Hosts to place", detail: NAMES_BOTH });
      const gone = before.filter((b) => !after.some((a) => a.orgId === b.orgId));
      expect(gone.map((c) => c.orgId)).toEqual(["C-9999"]);
      for (const c of gone) expect(c.here).toBe(false);
      // Nothing SURVIVING changed shape: the gate subtracts, it never re-words.
      for (const a of after) expect(before.find((b) => b.orgId === a.orgId)).toEqual(a);
    }
  });

  it("is NOT merely tidying a dead link — ungated, the stray action offers a live WRITE", () => {
    // inc.101 reasoned that an out-of-scope action "can never be `here`, the button is
    // unreachable by construction". That holds for the ROUTE, where the construction is
    // inc.26's — a row reaches a page only by naming it or being filed on it. It does NOT
    // hold for this module, which is handed a `pageId` and compares it, and cannot know the
    // caller obeyed inc.26. Hand it the page the stray action names and the ungated reader
    // renders a real Set-Domain button: a write to C-9999 from a finding that says nothing
    // about C-9999. So the reader-side gate removes a WRITE, not a broken link.
    const ungated = hostConfirmControls(STRAY, "C-9999").find((c) => c.orgId === "C-9999")!;
    expect(ungated.here).toBe(true);
    expect(ungated.href).toBeNull();
    expect(ungated.label).toBe("Set Domain to elsewhere.com");
    expect(
      hostConfirmControls(STRAY, "C-9999", [], { title: "Hosts to place", detail: NAMES_BOTH }).map((c) => c.orgId),
    ).toEqual(["C-2017"]);
  });

  it("keeps the real producer's row whole — the prose prints the ids the actions carry", () => {
    expect(hostConfirmControls(LIVE, "C-2017", [], { title: "Hosts to place", detail: NAMES_BOTH })).toEqual(
      hostConfirmControls(LIVE, "C-2017"),
    );
  });
});
