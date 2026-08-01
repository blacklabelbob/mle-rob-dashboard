// Q84 inc.74 — the writer's guard, pinned in both directions: a pre-0035 database is
// recognised and degraded to yesterday's write; anything else stays an error.
import { describe, expect, it } from "vitest";
import { isMissingColumn, payloadNote } from "../payloadColumn";
import { canonicalHostConfirmPayload } from "../hostConfirm";
import { planFlagWrite } from "../supersede";

// The literal answers prod gives. PGRST204 is the write path (schema cache), 42703 the read.
const WRITE_ERR = {
  code: "PGRST204",
  message: "Could not find the 'payload' column of 'flags' in the schema cache",
};
const READ_ERR = { code: "42703", message: 'column flags.payload does not exist' };

describe("isMissingColumn", () => {
  it("recognises the write-path and read-path answers for the guarded column", () => {
    expect(isMissingColumn(WRITE_ERR, "payload")).toBe(true);
    expect(isMissingColumn(READ_ERR, "payload")).toBe(true);
  });

  it("does not swallow an error about a DIFFERENT unknown column", () => {
    // The whole reason the message is checked as well as the code: a typo'd future field
    // graded as "pre-0035" would be dropped silently, forever.
    expect(isMissingColumn({ code: "PGRST204", message: "Could not find the 'paylod' column" }, "payload")).toBe(false);
  });

  it("does not swallow a real failure that merely mentions the word", () => {
    expect(isMissingColumn({ code: "23505", message: "duplicate key value violates payload index" }, "payload")).toBe(false);
    expect(isMissingColumn({ code: "PGRST301", message: "JWT expired" }, "payload")).toBe(false);
  });

  it("no error is not a missing column", () => {
    expect(isMissingColumn(null, "payload")).toBe(false);
    expect(isMissingColumn(undefined, "payload")).toBe(false);
    expect(isMissingColumn({}, "payload")).toBe(false);
  });
});

describe("payloadNote", () => {
  it("says nothing when the caller sent no actions", () => {
    expect(payloadNote(false, true)).toBeNull();
    expect(payloadNote(false, false)).toBeNull();
  });

  it("tells the caller when its actions did NOT land", () => {
    expect(payloadNote(true, false)).toMatch(/NOT stored/);
    expect(payloadNote(true, false)).toMatch(/0035 pending/);
    expect(payloadNote(true, true)).toMatch(/stored/);
  });
});

describe("the day 0035 lands, the button appears with nothing else changed", () => {
  const PROSE = { title: "40 archived meetings never reached the CRM", detail: "…same sentence…", severity: "high" };
  const ACTIONS = canonicalHostConfirmPayload({
    kind: "host-confirm",
    actions: [{ kind: "host-confirm", host: "cgroofing.net", orgId: "C-2017" }],
  });

  it("pre-0035: identical prose is still unchanged, so the 30-minute timer never re-dates Rob's row", () => {
    // No `payloadJson` on either side — the column was not read and cannot be written.
    const plan = planFlagWrite("meeting-archive/crm-gap", [{ id: 133, status: "open", ...PROSE }], PROSE);
    expect(plan.action).toBe("unchanged");
  });

  it("post-0035, first run: same prose, actions now writable → the row is UPDATED", () => {
    const plan = planFlagWrite(
      "meeting-archive/crm-gap",
      [{ id: 133, status: "open", ...PROSE, payloadJson: null }],
      { ...PROSE, payloadJson: ACTIONS },
    );
    expect(plan).toMatchObject({ action: "update", id: 133 });
  });

  it("post-0035, every run after: same prose, same actions → unchanged again", () => {
    const plan = planFlagWrite(
      "meeting-archive/crm-gap",
      [{ id: 133, status: "open", ...PROSE, payloadJson: ACTIONS }],
      { ...PROSE, payloadJson: ACTIONS },
    );
    expect(plan.action).toBe("unchanged");
  });

  it("a stored payload the codec now refuses compares equal to none — it renders no button either way", () => {
    const junk = canonicalHostConfirmPayload({ kind: "host-confirm", actions: [{ kind: "host-confirm", host: "", orgId: "nope" }] });
    expect(junk).toBeNull();
    const plan = planFlagWrite(
      "meeting-archive/crm-gap",
      [{ id: 133, status: "open", ...PROSE, payloadJson: junk }],
      { ...PROSE, payloadJson: null },
    );
    expect(plan.action).toBe("unchanged");
  });

  it("action order is not news — the codec sorts, so two orderings compare equal", () => {
    const pair = [
      { kind: "host-confirm", host: "gulfregroup.com", orgId: "C-2018" },
      { kind: "host-confirm", host: "cgroofing.net", orgId: "C-2017" },
    ];
    const a = canonicalHostConfirmPayload({ kind: "host-confirm", actions: pair });
    const b = canonicalHostConfirmPayload({ kind: "host-confirm", actions: [...pair].reverse() });
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });
});
