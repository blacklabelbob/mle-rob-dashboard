import { describe, expect, it } from "vitest";
import {
  buildBookerAccountStates,
  COLD_CALL_DAYS,
  filterBySignal,
  stateForAccount,
  type AccountSignalInput,
} from "@/lib/booker/accountSignals";

const TODAY = "2026-07-30";

function account(over: Partial<AccountSignalInput> = {}): AccountSignalInput {
  return {
    accountId: "acct-1",
    name: "Acme Roofing",
    phase: 0,
    lastCallISO: TODAY,
    nextAppointmentISO: "2026-08-05",
    ...over,
  };
}

describe("stateForAccount", () => {
  it("flags nothing when the account is worked: appointment booked, called today", () => {
    const s = stateForAccount(account(), TODAY);
    expect(s.signals).toEqual([]);
    expect(s.emphasis).toBe("normal");
    expect(s.headline).toBe("on track");
  });

  it("flags no_upcoming_appointment when nothing is on the calendar", () => {
    const s = stateForAccount(account({ nextAppointmentISO: null }), TODAY);
    expect(s.signals).toEqual(["no_upcoming_appointment"]);
    expect(s.emphasis).toBe("needs_action");
    expect(s.headline).toBe("no appointment booked");
  });

  it("treats a malformed appointment date as nothing booked, never as booked", () => {
    const s = stateForAccount(account({ nextAppointmentISO: "next tuesday" }), TODAY);
    expect(s.signals).toContain("no_upcoming_appointment");
    expect(s.nextAppointmentISO).toBeNull();
  });

  it("goes cold at exactly 14 days, not 13", () => {
    const thirteen = stateForAccount(account({ lastCallISO: "2026-07-17" }), TODAY);
    expect(thirteen.daysSinceLastCall).toBe(13);
    expect(thirteen.signals).not.toContain("cold_call");

    const fourteen = stateForAccount(account({ lastCallISO: "2026-07-16" }), TODAY);
    expect(fourteen.daysSinceLastCall).toBe(COLD_CALL_DAYS);
    expect(fourteen.signals).toContain("cold_call");
    expect(fourteen.headline).toBe("no call in 14 days");
  });

  it("says 'never called' rather than inventing a day count", () => {
    const s = stateForAccount(account({ lastCallISO: null }), TODAY);
    expect(s.daysSinceLastCall).toBeNull();
    expect(s.signals).toContain("cold_call");
    expect(s.headline).toContain("never called");
  });

  it("Phase 1+ is de-emphasised and suppresses the two action signals", () => {
    const s = stateForAccount(
      account({ phase: 2, lastCallISO: null, nextAppointmentISO: null }),
      TODAY
    );
    expect(s.signals).toEqual(["phase_1_plus"]);
    expect(s.emphasis).toBe("de_emphasised");
    expect(s.headline).toBe("Phase 1+ — already a customer");
  });

  it("an unreadable phase is reported unknown, not assumed to be 0", () => {
    const s = stateForAccount(account({ phase: null, nextAppointmentISO: null }), TODAY);
    expect(s.phaseKnown).toBe(false);
    expect(s.signals).toContain("no_upcoming_appointment");
  });

  it("carries both action signals at once when both are true", () => {
    const s = stateForAccount(
      account({ lastCallISO: "2026-06-01", nextAppointmentISO: null }),
      TODAY
    );
    expect(s.signals).toEqual(["no_upcoming_appointment", "cold_call"]);
    expect(s.headline).toBe("no appointment booked · no call in 59 days");
  });
});

describe("buildBookerAccountStates", () => {
  const inputs: AccountSignalInput[] = [
    account({ accountId: "a", name: "Alpha", phase: 1 }),
    account({ accountId: "b", name: "Bravo", lastCallISO: "2026-07-01" }),
    account({ accountId: "c", name: "Charlie" }),
    account({ accountId: "d", name: "Delta", lastCallISO: null, nextAppointmentISO: null }),
    account({ accountId: "e", name: "Echo", phase: null }),
  ];

  it("returns every account — bookers see all accounts, nothing is hidden", () => {
    const { accounts } = buildBookerAccountStates(inputs, TODAY);
    expect(accounts).toHaveLength(inputs.length);
    expect(new Set(accounts.map((a) => a.accountId))).toEqual(
      new Set(["a", "b", "c", "d", "e"])
    );
  });

  it("orders needs-action first, coldest first, with Phase 1+ last", () => {
    const { accounts } = buildBookerAccountStates(inputs, TODAY);
    expect(accounts.map((a) => a.accountId)).toEqual(["d", "b", "c", "e", "a"]);
  });

  it("counts each signal and the unreadable phases", () => {
    const { counts, phaseUnknownCount } = buildBookerAccountStates(inputs, TODAY);
    expect(counts.phase_1_plus).toBe(1);
    expect(counts.no_upcoming_appointment).toBe(1);
    expect(counts.cold_call).toBe(2);
    expect(phaseUnknownCount).toBe(1);
  });

  it("is pure — the same inputs and day give the same answer, and inputs are untouched", () => {
    const frozen = JSON.stringify(inputs);
    const first = buildBookerAccountStates(inputs, TODAY);
    const second = buildBookerAccountStates(inputs, TODAY);
    expect(first).toEqual(second);
    expect(JSON.stringify(inputs)).toBe(frozen);
  });

  it("filters by each signal without mutating the list", () => {
    const { accounts } = buildBookerAccountStates(inputs, TODAY);
    expect(filterBySignal(accounts, "cold_call").map((a) => a.accountId)).toEqual(["d", "b"]);
    expect(filterBySignal(accounts, "phase_1_plus").map((a) => a.accountId)).toEqual(["a"]);
    expect(accounts).toHaveLength(inputs.length);
  });
});
