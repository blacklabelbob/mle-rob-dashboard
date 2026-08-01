import { describe, expect, it } from "vitest";
import { retargetConfirmProse } from "../hostConfirmProse";
import { hostConfirmControls } from "../hostConfirmView";
import { CONFIRM_INSTRUCTION } from "@/lib/meetings/hostProposal";
import { ARCHIVE_CHECK_CEILING_MINUTES, WITHIN_ARCHIVE_CHECK } from "@/lib/meetings/archiveCadence";

/**
 * Q84 inc.76 — the row's prose stops instructing a hand-edit on exactly the pairs that have a
 * control, and on no others.
 */

// The shape `buildCrmGapFinding` actually emits, kept verbatim so a change to that format fails
// here rather than silently disabling the swap on prod. Q84 inc.78 — the heading now carries its
// REAL second clause; until this line was corrected the comment above it was false, and every
// heading assertion here ran against a heading with nothing after the insertion point.
const DETAIL =
  "2 FIELD(S) TO FILL IN THE CRM, and then 3 row(s) answer themselves unattended, permanently:\n" +
  "• cgroofing.net — put it in the right org's Domain field (a company can use more than one). Heard on: 2026-07-29 CG call\n" +
  `    → likely CG Roofing Group [C-2010] — the host is a near-miss of a host it already carries; the Domain field is empty. ${CONFIRM_INSTRUCTION}; a look-alike host is never assumed to be the same company\n` +
  "• gulfregroup.com — put it in the right org's Domain field (a company can use more than one). Heard on: 2026-07-28 Gulf call\n" +
  `    → likely Gulf Coast RE Group [C-2011] — the host is a near-miss of a host it already carries; the Domain field is empty. ${CONFIRM_INSTRUCTION}; a look-alike host is never assumed to be the same company`;

const PAYLOAD = {
  kind: "host-confirm",
  actions: [
    { kind: "host-confirm", host: "cgroofing.net", orgId: "C-2010" },
    { kind: "host-confirm", host: "gulfregroup.com", orgId: "C-2011" },
  ],
};

describe("retargetConfirmProse", () => {
  it("returns the detail byte-for-byte when there are no controls", () => {
    expect(retargetConfirmProse(DETAIL, [])).toBe(DETAIL);
    // The pre-0035 ledger: payload is NULL, so `hostConfirmControls` yields nothing.
    expect(retargetConfirmProse(DETAIL, hostConfirmControls(null, "C-2010"))).toBe(DETAIL);
  });

  it("re-aims ONLY the pair whose control is on this page, and leaves the other line alone", () => {
    const out = retargetConfirmProse(DETAIL, hostConfirmControls(PAYLOAD, "C-2010"));
    const [cg, gulf] = out.split("\n").filter((l) => l.trimStart().startsWith("→"));
    expect(cg).toContain("Confirm it with the control on this row");
    expect(cg).not.toContain(CONFIRM_INSTRUCTION);
    // C-2011's action exists on this row too, but its field is on another page — it may never
    // claim a button here.
    expect(gulf).toContain("Confirm it on C-2011's own page");
    expect(gulf).not.toContain("control on this row");
  });

  it("keeps the caveat that follows the instruction", () => {
    const out = retargetConfirmProse(DETAIL, hostConfirmControls(PAYLOAD, "C-2010"));
    expect(out).toContain("; a look-alike host is never assumed to be the same company");
  });

  it("says the write is done once the caller has seen it succeed", () => {
    const controls = hostConfirmControls(PAYLOAD, "C-2010", ["C-2010 cgroofing.net"]);
    const out = retargetConfirmProse(DETAIL, controls);
    expect(out).toContain("Done — this company's Domain is cgroofing.net");
    // Never both: an instruction under a statement is the "did it work?" ambiguity inc.75 killed.
    expect(out).not.toContain("Confirm it with the control on this row");
  });

  it("never rewrites a line whose host/org pair has no control (the pair, not the sentence)", () => {
    // Same host, a DIFFERENT org on the arrow line: the control writes C-2010, this line is
    // about C-2099, so the sentence stands.
    const mismatched = DETAIL.replace("[C-2010]", "[C-2099]");
    const out = retargetConfirmProse(mismatched, hostConfirmControls(PAYLOAD, "C-2010"));
    expect(out.split("\n")[2]).toContain(CONFIRM_INSTRUCTION);
  });

  // Q84 inc.77 — the heading counts fields the check found empty; what it costs to fill each one
  // is only knowable at read time, and only from the controls actually in hand.
  describe("the block heading", () => {
    it("grades the count by what the reader can do, without rewriting the count itself", () => {
      const out = retargetConfirmProse(DETAIL, hostConfirmControls(PAYLOAD, "C-2010"));
      expect(out.split("\n")[0]).toBe(
        "2 FIELD(S) TO FILL IN THE CRM (1 one click away right here · 1 one click away on the company's own page)," +
          " and then 3 row(s) answer themselves unattended, permanently:",
      );
    });

    it("says which are already set once the caller has seen the write land", () => {
      const controls = hostConfirmControls(PAYLOAD, "C-2010", ["C-2010 cgroofing.net"]);
      expect(retargetConfirmProse(DETAIL, controls).split("\n")[0]).toContain("1 already set from this page");
    });

    // Q84 inc.78 — the clause promises a close that only the 30-minute check performs.
    describe("the unattended-close clause", () => {
      it("says when the close lands, once a write has actually landed", () => {
        const controls = hostConfirmControls(PAYLOAD, "C-2010", ["C-2010 cgroofing.net"]);
        expect(retargetConfirmProse(DETAIL, controls).split("\n")[0]).toBe(
          "2 FIELD(S) TO FILL IN THE CRM (1 already set from this page · 1 one click away on the company's own page)," +
            " and then 3 row(s) answer themselves unattended, permanently" +
            " — the 1 already set on the next archive check, within 30 minutes:",
        );
      });

      it("never weakens the promise it qualifies", () => {
        const controls = hostConfirmControls(PAYLOAD, "C-2010", ["C-2010 cgroofing.net"]);
        const head = retargetConfirmProse(DETAIL, controls).split("\n")[0];
        expect(head).toContain("unattended, permanently");
        // A ceiling, never a countdown — this module has no clock. The leading space is the
        // whole assertion: "within 30 minutes" contains "in 30 minutes" as a substring, so a
        // bare `not.toContain` here can never fail and would be a test that only looks strict.
        expect(head).toContain("within 30 minutes");
        expect(head).not.toContain(" in 30 minutes");
      });

      // Q84 inc.79 — the control two lines below this heading promises the same wait. The
      // literals above pin what the reader sees; this pins that BOTH readers get it from one
      // place, so the day the plist's interval changes there is a single number to move.
      it("spells the wait the same way the control's own tooltip does", () => {
        const written = ["C-2010 cgroofing.net"];
        const head = retargetConfirmProse(DETAIL, hostConfirmControls(PAYLOAD, "C-2010", written)).split("\n")[0];
        const tooltip = hostConfirmControls(PAYLOAD, "C-2010", written).find((c) => c.done)!.tooltip;
        expect(head).toContain(WITHIN_ARCHIVE_CHECK);
        expect(tooltip).toContain(WITHIN_ARCHIVE_CHECK);
        expect(WITHIN_ARCHIVE_CHECK).toBe(`within ${ARCHIVE_CHECK_CEILING_MINUTES} minutes`);
      });

      it("stays silent while nothing has been written from this page", () => {
        const head = retargetConfirmProse(DETAIL, hostConfirmControls(PAYLOAD, "C-2010")).split("\n")[0];
        expect(head).toContain("unattended, permanently:");
        expect(head).not.toContain("archive check");
      });

      it("never fires on a line the heading half declined to grade", () => {
        // The payload claims more hosts than the heading counts: both halves stand down.
        const detail = DETAIL.replace("2 FIELD(S)", "1 FIELD(S)");
        const controls = hostConfirmControls(PAYLOAD, "C-2010", ["C-2010 cgroofing.net"]);
        expect(retargetConfirmProse(detail, controls).split("\n")[0]).toBe(
          "1 FIELD(S) TO FILL IN THE CRM, and then 3 row(s) answer themselves unattended, permanently:",
        );
      });

      it("leaves prose that merely quotes the clause alone", () => {
        const detail = `those row(s) answer themselves unattended, permanently is the promise\n${DETAIL}`;
        const controls = hostConfirmControls(PAYLOAD, "C-2010", ["C-2010 cgroofing.net"]);
        expect(retargetConfirmProse(detail, controls).split("\n")[0]).toBe(
          "those row(s) answer themselves unattended, permanently is the promise",
        );
      });
    });

    it("counts the fields no control was minted for as still typed by hand", () => {
      // Three empty fields found, one proposal confident enough to mint an action.
      const detail = DETAIL.replace("2 FIELD(S)", "3 FIELD(S)");
      const one = { kind: "host-confirm", actions: [PAYLOAD.actions[0]] };
      expect(retargetConfirmProse(detail, hostConfirmControls(one, "C-2010")).split("\n")[0]).toBe(
        "3 FIELD(S) TO FILL IN THE CRM (1 one click away right here · 2 still typed by hand)" +
          ", and then 3 row(s) answer themselves unattended, permanently:",
      );
    });

    it("leaves the heading alone when the payload claims more hosts than the heading counts", () => {
      const detail = DETAIL.replace("2 FIELD(S)", "1 FIELD(S)");
      expect(retargetConfirmProse(detail, hostConfirmControls(PAYLOAD, "C-2010")).split("\n")[0]).toBe(
        "1 FIELD(S) TO FILL IN THE CRM, and then 3 row(s) answer themselves unattended, permanently:",
      );
    });

    it("never touches a line that only mentions the heading without a count in front of it", () => {
      const detail = `FIELD(S) TO FILL IN THE CRM is what that block is called\n${DETAIL}`;
      expect(retargetConfirmProse(detail, hostConfirmControls(PAYLOAD, "C-2010")).split("\n")[0]).toBe(
        "FIELD(S) TO FILL IN THE CRM is what that block is called",
      );
    });
  });

  /**
   * Q84 inc.80 — the OVERVIEW DIGEST, whose tooltip IS this detail ("hover for detail") and
   * which was rendering it raw while the full row rendered it graded. The digest is not any
   * org's page, so it passes `null` — every action is a link, and the sentence must say whose
   * page the control is on rather than pointing at a control that is not on this surface.
   */
  describe("the Overview digest (no page)", () => {
    it("re-aims EVERY pair at the company's own page — never at a control on this row", () => {
      const out = retargetConfirmProse(DETAIL, hostConfirmControls(PAYLOAD, null));
      const [cg, gulf] = out.split("\n").filter((l) => l.trimStart().startsWith("→"));
      expect(cg).toContain("Confirm it on C-2010's own page");
      expect(gulf).toContain("Confirm it on C-2011's own page");
      expect(out).not.toContain(CONFIRM_INSTRUCTION);
      // There is no control on the digest, so nothing here may claim one.
      expect(out).not.toContain("control on this row");
    });

    it("grades the heading as clicks on the company's page, never as clicks right here", () => {
      expect(retargetConfirmProse(DETAIL, hostConfirmControls(PAYLOAD, null)).split("\n")[0]).toBe(
        "2 FIELD(S) TO FILL IN THE CRM (2 one click away on the company's own page)," +
          " and then 3 row(s) answer themselves unattended, permanently:",
      );
    });

    it("cannot be told a write landed — the digest writes nothing", () => {
      // Even handed the key of a write that DID land elsewhere, a page-less control is a link:
      // a done state here would be a claim about a surface this one cannot see.
      const controls = hostConfirmControls(PAYLOAD, null, ["C-2010 cgroofing.net"]);
      const out = retargetConfirmProse(DETAIL, controls);
      expect(out).not.toContain("Done — this company's Domain is");
      expect(out.split("\n")[0]).not.toContain("already set from this page");
      expect(out.split("\n")[0]).not.toContain("archive check");
    });

    it("is byte-for-byte the stored detail on a pre-0035 row", () => {
      // Every prod row today: payload NULL, so the tooltip reads exactly as it does now.
      expect(retargetConfirmProse(DETAIL, hostConfirmControls(null, null))).toBe(DETAIL);
    });
  });

  it("does not let a bullet's host reach an instruction outside its own continuation", () => {
    const stray =
      "• cgroofing.net — put it in the right org's Domain field. Heard on: 2026-07-29 CG call\n" +
      "\n" +
      `something else entirely [C-2010] — ${CONFIRM_INSTRUCTION}`;
    expect(retargetConfirmProse(stray, hostConfirmControls(PAYLOAD, "C-2010"))).toBe(stray);
  });
});
