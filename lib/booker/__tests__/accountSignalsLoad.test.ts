import { describe, expect, it } from "vitest";
import {
  bookerAccountInputs,
  bookerAccountStatesFrom,
  dayOf,
  phaseNumberFor,
} from "@/lib/booker/accountSignalsLoad";
import type { Activity, Person } from "@/lib/types";

const TODAY = "2026-07-30";

function person(over: Partial<Person> = {}): Person {
  return {
    id: "p1",
    name: "Acme Roofing",
    verticalId: "roofing",
    status: "warm",
    signed: false,
    keyDates: {},
    phaseOne: "not-started",
    ...over,
  };
}

function activity(over: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    type: "call",
    source: "manual",
    sourceContext: {},
    bookProtected: false,
    occurredAt: "2026-07-29T14:00:00Z",
    createdAt: "2026-07-29T14:00:00Z",
    ...over,
  };
}

describe("phaseNumberFor", () => {
  it("reads a not-started, unsigned record as 0 — not a customer yet", () => {
    expect(phaseNumberFor(person())).toBe(0);
  });

  it("reads paid as Phase 1 even when the status dropdown was never touched", () => {
    expect(phaseNumberFor(person({ keyDates: { paid: "2026-07-23" } }))).toBe(1);
  });

  it("reads signed as Phase 1", () => {
    expect(phaseNumberFor(person({ signed: true }))).toBe(1);
    expect(phaseNumberFor(person({ keyDates: { signed: "2026-07-01" } }))).toBe(1);
  });

  it("reads in-progress delivery as Phase 1", () => {
    expect(phaseNumberFor(person({ phaseOne: "in-progress" }))).toBe(1);
  });

  it("reads complete as beyond Phase 1", () => {
    expect(phaseNumberFor(person({ phaseOne: "complete" }))).toBe(2);
    expect(phaseNumberFor(person({ keyDates: { phaseOneComplete: "2026-06-01" } }))).toBe(2);
  });

  it("reports an unreadable phase as unknown, never as 0", () => {
    expect(phaseNumberFor(person({ phaseOne: "bogus" as Person["phaseOne"] }))).toBeNull();
  });
});

describe("dayOf", () => {
  it("takes the date off a timestamp", () => {
    expect(dayOf("2026-07-30T15:04:05Z")).toBe("2026-07-30");
  });

  it("refuses anything that is not a parseable stamp", () => {
    expect(dayOf(null)).toBeNull();
    expect(dayOf("next tuesday")).toBeNull();
    expect(dayOf("2026-7-3")).toBeNull();
  });
});

describe("bookerAccountInputs", () => {
  it("excludes MLE's own staff from the account list and COUNTS them", () => {
    const { inputs, read } = bookerAccountInputs(
      [person(), person({ id: "rob", name: "Rob", nodeType: "mle-admin" })],
      [],
      TODAY
    );
    expect(inputs.map((i) => i.accountId)).toEqual(["p1"]);
    expect(read.internalExcluded).toBe(1);
  });

  it("takes the LATEST call and the EARLIEST future meeting", () => {
    const { inputs } = bookerAccountInputs(
      [person()],
      [
        activity({ id: "c1", personId: "p1", occurredAt: "2026-07-01T10:00:00Z" }),
        activity({ id: "c2", personId: "p1", occurredAt: "2026-07-20T10:00:00Z" }),
        activity({ id: "m1", personId: "p1", type: "meeting", occurredAt: "2026-08-20T10:00:00Z" }),
        activity({ id: "m2", personId: "p1", type: "meeting", occurredAt: "2026-08-05T10:00:00Z" }),
      ],
      TODAY
    );
    expect(inputs[0].lastCallISO).toBe("2026-07-20");
    expect(inputs[0].nextAppointmentISO).toBe("2026-08-05");
  });

  it("does not count a PAST meeting as an upcoming appointment", () => {
    const { inputs, read } = bookerAccountInputs(
      [person()],
      [activity({ personId: "p1", type: "meeting", occurredAt: "2026-07-02T10:00:00Z" })],
      TODAY
    );
    expect(inputs[0].nextAppointmentISO).toBeNull();
    expect(read.appointmentEvidence).toBe("none_in_system");
  });

  it("never borrows another account's activity", () => {
    const { inputs } = bookerAccountInputs(
      [person(), person({ id: "p2", name: "Beta Roofing" })],
      [activity({ personId: "p2", occurredAt: "2026-07-29T10:00:00Z" })],
      TODAY
    );
    expect(inputs.find((i) => i.accountId === "p1")?.lastCallISO).toBeNull();
    expect(inputs.find((i) => i.accountId === "p2")?.lastCallISO).toBe("2026-07-29");
  });

  it("credits an org-anchored activity to the people in that org AND to the org row itself", () => {
    const { inputs } = bookerAccountInputs(
      [person({ id: "p1", orgId: "org-1" }), person({ id: "org-1", name: "Acme Inc", entityKind: "company" })],
      [activity({ orgId: "org-1", occurredAt: "2026-07-28T10:00:00Z" })],
      TODAY
    );
    expect(inputs.find((i) => i.accountId === "p1")?.lastCallISO).toBe("2026-07-28");
    expect(inputs.find((i) => i.accountId === "org-1")?.lastCallISO).toBe("2026-07-28");
  });

  it("says the calendar is missing rather than implying every account is unbooked", () => {
    const { read } = bookerAccountInputs([person(), person({ id: "p2" })], [], TODAY);
    expect(read.appointmentEvidence).toBe("none_in_system");
    expect(read.callEvidence).toBe("none_in_system");
  });

  it("reports evidence as present the moment one real row exists", () => {
    const { read } = bookerAccountInputs(
      [person()],
      [
        activity({ personId: "p1" }),
        activity({ id: "m1", personId: "p1", type: "meeting", occurredAt: "2026-09-01T10:00:00Z" }),
      ],
      TODAY
    );
    expect(read.callEvidence).toBe("present");
    expect(read.appointmentEvidence).toBe("present");
  });

  it("ignores emails and notes — neither is a call or an appointment", () => {
    const { inputs, read } = bookerAccountInputs(
      [person()],
      [
        activity({ id: "e1", personId: "p1", type: "email" }),
        activity({ id: "n1", personId: "p1", type: "note" }),
      ],
      TODAY
    );
    expect(inputs[0].lastCallISO).toBeNull();
    expect(read.callEvidence).toBe("none_in_system");
  });
});

describe("bookerAccountStatesFrom", () => {
  it("puts a cold, unbooked prospect above a paying client and hides neither", () => {
    const result = bookerAccountStatesFrom(
      [
        person({ id: "client", name: "Paid Client", keyDates: { paid: "2026-07-01" } }),
        person({ id: "cold", name: "Cold Prospect" }),
      ],
      [],
      TODAY
    );
    expect(result.states.accounts.map((a) => a.accountId)).toEqual(["cold", "client"]);
    expect(result.states.accounts[0].signals).toEqual(["no_upcoming_appointment", "cold_call"]);
    expect(result.states.accounts[1].signals).toEqual(["phase_1_plus"]);
    expect(result.states.counts.phase_1_plus).toBe(1);
  });

  it("keeps a called-yesterday, booked account off the needs-action pile", () => {
    const result = bookerAccountStatesFrom(
      [person()],
      [
        activity({ personId: "p1", occurredAt: "2026-07-29T10:00:00Z" }),
        activity({ id: "m1", personId: "p1", type: "meeting", occurredAt: "2026-08-04T10:00:00Z" }),
      ],
      TODAY
    );
    expect(result.states.accounts[0].emphasis).toBe("normal");
    expect(result.states.accounts[0].headline).toBe("on track");
  });
});
