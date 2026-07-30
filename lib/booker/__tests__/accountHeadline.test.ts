import { describe, expect, it } from "vitest";
import { stateForAccount } from "../accountSignals";
import { displayHeadline } from "../accountHeadline";

const TODAY = "2026-07-30";

function state(overrides: Partial<Parameters<typeof stateForAccount>[0]> = {}) {
  return stateForAccount(
    {
      accountId: "a1",
      name: "Acme",
      phase: 0,
      lastCallISO: null,
      nextAppointmentISO: null,
      ...overrides,
    },
    TODAY
  );
}

const PRESENT = { appointment: true, call: true };
const ABSENT = { appointment: false, call: false };

describe("displayHeadline", () => {
  it("states the finding when both sources exist", () => {
    const s = state({ lastCallISO: "2026-07-01" });
    expect(displayHeadline(s, PRESENT)).toBe("no appointment booked · no call in 29 days");
  });

  it("never claims 'never called' when NO call is logged anywhere in the system", () => {
    const s = state();
    expect(s.headline).toContain("never called"); // the rule's own finding
    expect(displayHeadline(s, ABSENT)).toBe("appointments not tracked yet · no call log in this CRM");
  });

  it("keeps the call finding when calls exist but this account has none", () => {
    const s = state();
    expect(displayHeadline(s, { appointment: true, call: true })).toBe(
      "no appointment booked · never called"
    );
  });

  it("describes each missing source independently", () => {
    const s = state({ lastCallISO: "2026-07-01" });
    expect(displayHeadline(s, { appointment: false, call: true })).toBe(
      "appointments not tracked yet · no call in 29 days"
    );
    expect(displayHeadline(s, { appointment: true, call: false })).toBe(
      "no appointment booked · no call log in this CRM"
    );
  });

  it("passes Phase 1+ through untouched — the phase is on the record, not inferred", () => {
    const s = state({ phase: 1 });
    expect(displayHeadline(s, ABSENT)).toBe("Phase 1+ — already a customer");
  });

  it("passes 'on track' through — no signal, nothing to qualify", () => {
    const s = state({ lastCallISO: TODAY, nextAppointmentISO: "2026-08-05" });
    expect(s.signals).toHaveLength(0);
    expect(displayHeadline(s, PRESENT)).toBe("on track");
  });
});
