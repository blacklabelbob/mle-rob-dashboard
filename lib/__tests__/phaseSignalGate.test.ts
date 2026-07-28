import { describe, it, expect } from "vitest";
import {
  PHASE_SIGNAL_HEADER,
  phaseSignalConfigured,
  phaseSignalEnv,
  resolveSignalCustomer,
  signalHttp,
  signalStorageFailure,
  verifyPhaseSignalSecret,
} from "../phases/signalGate";
import { decideSignal } from "../phases/signalIntake";
import type { Person } from "../types";

function person(over: Partial<Person>): Person {
  return {
    id: "x",
    name: "X",
    verticalId: "v1",
    status: "unlit",
    signed: false,
    keyDates: {},
    phaseOne: "not-started",
    ...over,
  } as Person;
}

const ACME = person({ id: "acme-holdings", name: "Acme Holdings", entityKind: "company" });
const HUMAN = person({ id: "trent-brands", name: "Trent Brands", entityKind: "person" });
const DATA = { people: [ACME, HUMAN] };

describe("phase signal gate — configuration", () => {
  it("is inert until the secret is set, so it can ship before the partner exists", () => {
    expect(phaseSignalConfigured(phaseSignalEnv({} as NodeJS.ProcessEnv))).toBe(false);
    expect(
      phaseSignalConfigured(
        phaseSignalEnv({ PHASE_SIGNAL_WEBHOOK_SECRET: "s3cret" } as unknown as NodeJS.ProcessEnv),
      ),
    ).toBe(true);
  });

  it("speaks the header the contract published", () => {
    expect(PHASE_SIGNAL_HEADER).toBe("x-phase-signal-secret");
  });

  it("rejects a wrong or empty secret", () => {
    expect(verifyPhaseSignalSecret("s3cret", "s3cret")).toBe(true);
    expect(verifyPhaseSignalSecret("s3cret", "s3cre7")).toBe(false);
    expect(verifyPhaseSignalSecret("s3cret", "")).toBe(false);
  });
});

describe("phase signal gate — customer resolution", () => {
  it("resolves a company id and carries its name for the audit line", () => {
    expect(resolveSignalCustomer(DATA, "acme-holdings")).toEqual({
      known: true,
      name: "Acme Holdings",
    });
  });

  it("REFUSES a person id — a phase light must never hang off a human record", () => {
    expect(resolveSignalCustomer(DATA, "trent-brands").known).toBe(false);
  });

  it("never near-matches: an unmapped id is unknown, not the closest company", () => {
    expect(resolveSignalCustomer(DATA, "acme").known).toBe(false);
    expect(resolveSignalCustomer(DATA, "Acme Holdings").known).toBe(false);
    expect(resolveSignalCustomer(DATA, "  ").known).toBe(false);
  });

  it("tolerates surrounding whitespace on an otherwise exact id", () => {
    expect(resolveSignalCustomer(DATA, " acme-holdings ").known).toBe(true);
  });
});

const APPLIES = {
  version: 1,
  eventId: "evt_1",
  customerId: "acme-holdings",
  phase: 1,
  componentId: "website-aeo-seo",
  status: "live",
  occurredAt: "2026-07-28T10:00:00Z",
  source: "mle-partner-tools",
};

describe("phase signal gate — HTTP mapping (the retry contract)", () => {
  it("400s a malformed payload and NAMES the field", () => {
    const r = signalHttp(decideSignal({ ...APPLIES, phase: 9 }, { customerKnown: true }));
    expect(r.status).toBe(400);
    expect(r.body.field).toBe("phase");
    expect(r.body.applied).toBe(false);
  });

  it("200s every not_applied reason — a retry cannot fix any of them", () => {
    const unknownCustomer = signalHttp(decideSignal(APPLIES, { customerKnown: false }));
    expect(unknownCustomer.status).toBe(200);
    expect(unknownCustomer.body).toMatchObject({ ok: true, applied: false, reason: "unknown_customer" });

    const unknownSlug = signalHttp(
      decideSignal({ ...APPLIES, componentId: "no-such-thing" }, { customerKnown: true }),
    );
    expect(unknownSlug.status).toBe(200);
    expect(unknownSlug.body.reason).toBe("unknown_component");

    const duplicate = signalHttp(
      decideSignal(APPLIES, { customerKnown: true, stored: { seenEventIds: ["evt_1"] } }),
    );
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.reason).toBe("duplicate");
  });

  it("echoes the applied state back, including the refund-window flag", () => {
    const r = signalHttp(decideSignal(APPLIES, { customerKnown: true }));
    expect(r.status).toBe(200);
    expect(r.body.applied).toBe(true);
    expect(r.body.componentState).toMatchObject({
      customerId: "acme-holdings",
      phase: 1,
      componentId: "website-aeo-seo",
      status: "live",
      liveAt: "2026-07-28T10:00:00Z",
      startsRefundWindow: true,
    });
  });

  it("carries a revert's attention line — a light going dark is never silent", () => {
    const r = signalHttp(
      decideSignal(
        { ...APPLIES, eventId: "evt_2", status: "reverted", occurredAt: "2026-07-28T12:00:00Z" },
        { customerKnown: true, stored: { liveAt: "2026-07-28T10:00:00Z" } },
      ),
    );
    expect(r.status).toBe(200);
    expect(String((r.body.componentState as Record<string, unknown>).attention)).toContain("reverted");
    expect((r.body.componentState as Record<string, unknown>).liveAt).toBeNull();
  });

  it("omits `attention` when there is nothing to raise", () => {
    const r = signalHttp(decideSignal(APPLIES, { customerKnown: true }));
    expect(Object.keys(r.body.componentState as object)).not.toContain("attention");
  });
});

describe("phase signal gate — storage failure is the one status we WANT retried", () => {
  it("500s, so the partner re-POSTs a light that did not land", () => {
    for (const stage of ["read", "write"] as const) {
      const r = signalStorageFailure(stage, "connection reset");
      expect(r.status).toBe(500);
      expect(r.body.applied).toBe(false);
      expect(String(r.body.error)).toContain(stage);
      expect(r.body.detail).toBe("connection reset");
    }
  });
});
