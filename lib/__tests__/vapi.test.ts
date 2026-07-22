import { describe, expect, it } from "vitest";
import type { NetworkData, Person } from "../types";
import {
  assistantRequestResponse,
  callerContext,
  callerNumberFrom,
  lookupCaller,
  normalizePhone,
  toolCallResults,
  vapiConfigured,
  verifyVapiSecret,
} from "../vapi";

const person = (over: Partial<Person>): Person => ({
  id: "p1",
  name: "Jonathan Polk",
  verticalId: "v1",
  status: "warm",
  signed: false,
  keyDates: {},
  phaseOne: "not-started",
  ...over,
});

const data: NetworkData = {
  people: [
    person({
      id: "polk",
      name: "Jonathan Polk",
      business: "PropLogix",
      role: "Owner",
      phone: "+1 (239) 555-0142",
      referredById: "caleb",
      relationship: "his rep",
      assignedRep: "Will",
    }),
    person({ id: "caleb", name: "Caleb Gray", phone: "941-555-2200" }),
    person({ id: "nophone", name: "No Phone" }),
  ],
  edges: [],
  verticals: [{ id: "v1", name: "Title", color: "#fff" }],
  projects: [],
};

describe("vapiConfigured", () => {
  it("false with empty env — the zero-breakage gate", () => {
    expect(vapiConfigured({})).toBe(false);
  });
  it("true with a webhook secret", () => {
    expect(vapiConfigured({ webhookSecret: "s" })).toBe(true);
  });
});

describe("verifyVapiSecret", () => {
  it("accepts the exact secret only", () => {
    expect(verifyVapiSecret("topsecret", "topsecret")).toBe(true);
    expect(verifyVapiSecret("topsecret", "topsecreT")).toBe(false);
    expect(verifyVapiSecret("topsecret", "")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("matches across formatting and country code", () => {
    expect(normalizePhone("+1 (239) 555-0142")).toBe("2395550142");
    expect(normalizePhone("239.555.0142")).toBe("2395550142");
    expect(normalizePhone("12395550142")).toBe("2395550142");
  });
});

describe("lookupCaller", () => {
  it("finds the person with vertical + referrer resolved", () => {
    const match = lookupCaller(data, "2395550142");
    expect(match?.person.id).toBe("polk");
    expect(match?.verticalName).toBe("Title");
    expect(match?.referrerName).toBe("Caleb Gray");
  });
  it("null for unknown numbers and empty input", () => {
    expect(lookupCaller(data, "+1 (999) 999-9999")).toBeNull();
    expect(lookupCaller(data, "")).toBeNull();
  });
});

describe("callerContext", () => {
  it("known caller: full screen-pop payload", () => {
    const ctx = callerContext(lookupCaller(data, "2395550142"), "2395550142");
    expect(ctx).toMatchObject({
      callerKnown: "true",
      callerName: "Jonathan Polk",
      callerBusiness: "PropLogix",
      callerStatus: "warm",
      callerVertical: "Title",
      referredBy: "Caleb Gray (his rep)",
      assignedRep: "Will",
      recordUrl: "/people/polk",
    });
  });
  it("unknown caller: honest unknown, no fabricated fields", () => {
    const ctx = callerContext(null, "5550000000");
    expect(ctx.callerKnown).toBe("false");
    expect(ctx.callerName).toBe("unknown caller");
    expect(ctx.callerBusiness).toBeUndefined();
  });
});

describe("assistantRequestResponse", () => {
  it("no assistant provisioned → Vapi error channel, never a guessed config", () => {
    expect(
      assistantRequestResponse({ webhookSecret: "s" }, data, "2395550142")
    ).toEqual({ error: "No receptionist assistant configured" });
  });
  it("assistant + caller context as variableValues", () => {
    const res = assistantRequestResponse(
      { webhookSecret: "s", assistantId: "asst_1" },
      data,
      "2395550142"
    ) as { assistantId: string; assistantOverrides: { variableValues: Record<string, string> } };
    expect(res.assistantId).toBe("asst_1");
    expect(res.assistantOverrides.variableValues.callerName).toBe("Jonathan Polk");
  });
});

describe("toolCallResults", () => {
  it("answers crm_caller_lookup with JSON context (string args)", () => {
    const { results } = toolCallResults(
      [
        {
          id: "tc1",
          function: {
            name: "crm_caller_lookup",
            arguments: '{"phoneNumber":"2395550142"}',
          },
        },
      ],
      data,
      ""
    );
    expect(results).toHaveLength(1);
    expect(JSON.parse(results[0].result).callerName).toBe("Jonathan Polk");
  });
  it("object args + fallback to the live caller's number", () => {
    const { results } = toolCallResults(
      [{ id: "tc2", function: { name: "crm_caller_lookup", arguments: {} } }],
      data,
      "941-555-2200"
    );
    expect(JSON.parse(results[0].result).callerName).toBe("Caleb Gray");
  });
  it("ignores unrelated tools", () => {
    const { results } = toolCallResults(
      [{ id: "tc3", function: { name: "other_tool" } }],
      data,
      ""
    );
    expect(results).toHaveLength(0);
  });
});

describe("callerNumberFrom", () => {
  it("reads message.call.customer.number and message.customer.number", () => {
    expect(
      callerNumberFrom({ call: { customer: { number: "+1234" } } })
    ).toBe("+1234");
    expect(callerNumberFrom({ customer: { number: "+5678" } })).toBe("+5678");
    expect(callerNumberFrom({})).toBe("");
  });
});
