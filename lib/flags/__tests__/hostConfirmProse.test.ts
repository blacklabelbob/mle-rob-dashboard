import { describe, expect, it } from "vitest";
import { retargetConfirmProse } from "../hostConfirmProse";
import { hostConfirmControls } from "../hostConfirmView";
import { CONFIRM_INSTRUCTION } from "@/lib/meetings/hostProposal";

/**
 * Q84 inc.76 — the row's prose stops instructing a hand-edit on exactly the pairs that have a
 * control, and on no others.
 */

// The shape `buildCrmGapFinding` actually emits, kept verbatim so a change to that format fails
// here rather than silently disabling the swap on prod.
const DETAIL =
  "2 FIELD(S) TO FILL IN THE CRM:\n" +
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

  it("does not let a bullet's host reach an instruction outside its own continuation", () => {
    const stray =
      "• cgroofing.net — put it in the right org's Domain field. Heard on: 2026-07-29 CG call\n" +
      "\n" +
      `something else entirely [C-2010] — ${CONFIRM_INSTRUCTION}`;
    expect(retargetConfirmProse(stray, hostConfirmControls(PAYLOAD, "C-2010"))).toBe(stray);
  });
});
