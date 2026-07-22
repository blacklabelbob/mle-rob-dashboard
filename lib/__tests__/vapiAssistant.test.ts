import { describe, expect, it } from "vitest";
import {
  ASSISTANT_NAME,
  DEFAULT_SERVER_URL,
  TOOL_NAME,
  assistantPayload,
} from "../../scripts/provision-vapi-assistant.mjs";
import { callerContext, toolCallResults } from "../vapi";
import type { NetworkData, Person } from "../types";

const person: Person = {
  id: "p1",
  name: "Jonathan Polk",
  status: "active",
  phone: "+1 (239) 555-0142",
  business: "PropLogix",
  verticalId: "v1",
} as Person;

const data = {
  people: [person],
  verticals: [{ id: "v1", name: "Real Estate" }],
  projects: [],
  edges: [],
} as unknown as NetworkData;

describe("provision-vapi-assistant payload", () => {
  const payload = assistantPayload({ webhookSecret: "s3cret" });

  it("registers exactly the tool the webhook handler answers", () => {
    const tools = payload.model.tools;
    expect(tools).toHaveLength(1);
    expect(tools[0].function.name).toBe(TOOL_NAME);
    // Round-trip: a call to the provisioned tool name gets a real result.
    const { results } = toolCallResults(
      [{ id: "tc1", function: { name: tools[0].function.name, arguments: { phoneNumber: "2395550142" } } }],
      data,
      ""
    );
    expect(results).toHaveLength(1);
    expect(JSON.parse(results[0].result).callerName).toBe("Jonathan Polk");
  });

  it("only uses prompt variables that callerContext actually emits", () => {
    const known = new Set(
      Object.keys(
        callerContext(
          {
            person: {
              ...person,
              role: "r",
              relationship: "rel",
              assignedRep: "rep",
              referredById: "p1",
            } as Person,
            verticalName: "v",
            referrerName: "n",
          },
          "2395550142"
        )
      )
    );
    const prompt = payload.model.messages.map((m) => m.content).join("\n");
    const used = [...prompt.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const v of used) expect(known).toContain(v);
  });

  it("wires the shared secret and our webhook URL into server config", () => {
    expect(payload.server).toEqual({ url: DEFAULT_SERVER_URL, secret: "s3cret" });
    expect(payload.serverMessages).toContain("tool-calls");
    expect(payload.serverMessages).toContain("end-of-call-report");
    expect(payload.name).toBe(ASSISTANT_NAME);
  });

  it("omits the secret field entirely when none is provided", () => {
    expect(assistantPayload({}).server).toEqual({ url: DEFAULT_SERVER_URL });
  });
});
