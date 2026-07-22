// Task 1.11 DoD: payload schema handed to Engineering for Task 5.1 — proven
// here by pinning both product examples valid and every envelope rule firing.
import { describe, expect, it } from "vitest";
import {
  INTAKE_PRODUCTS,
  INTAKE_STAGE,
  INTAKE_WORKED_EXAMPLES,
  parseLeadIntake,
} from "../leads/intakePayload";

const valid = () => JSON.parse(JSON.stringify(INTAKE_WORKED_EXAMPLES.aidre));

describe("parseLeadIntake (Task 1.11 envelope)", () => {
  it("pins both product worked examples valid forever", () => {
    for (const product of INTAKE_PRODUCTS) {
      const res = parseLeadIntake(INTAKE_WORKED_EXAMPLES[product]);
      expect(res.ok, `${product} example should validate`).toBe(true);
      if (res.ok) expect(res.payload.product).toBe(product);
    }
  });

  it("rejects non-object payloads", () => {
    for (const bad of [null, "x", 7, [1]]) {
      const res = parseLeadIntake(bad);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.errors).toEqual(["payload must be an object"]);
    }
  });

  it("rejects unknown/missing product", () => {
    const p = valid();
    p.product = "leaky-bucket"; // the bundle offer is NOT an intake product
    const res = parseLeadIntake(p);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toContain("product must be one of");
  });

  it("rejects a client-supplied stage (server pins new_lead)", () => {
    const p = valid();
    p.stage = "signed";
    const res = parseLeadIntake(p);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.startsWith("stage:"))).toBe(true);
      expect(INTAKE_STAGE).toBe("new_lead");
    }
  });

  it("requires contact.name and at least one reach channel", () => {
    const p = valid();
    p.contact = { role: "Owner" };
    const res = parseLeadIntake(p);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors).toContain("contact.name: non-empty string required");
      expect(res.errors).toContain("contact: at least one of email/phone required");
    }
  });

  it("phone alone satisfies the reach-channel rule", () => {
    const p = valid();
    p.contact = { name: "Dale Hutchins", phone: "+18135550142" };
    expect(parseLeadIntake(p).ok).toBe(true);
  });

  it("requires source_context and prefixes its sub-errors", () => {
    const missing = valid();
    delete missing.source_context;
    const res1 = parseLeadIntake(missing);
    expect(res1.ok).toBe(false);
    if (!res1.ok) expect(res1.errors.some((e) => e.startsWith("source_context: required"))).toBe(true);

    const badCtx = valid();
    badCtx.source_context = { source_type: "email_reply" }; // missing subject + text
    const res2 = parseLeadIntake(badCtx);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.errors).toContain("source_context.replied_to_subject: non-empty string required");
      expect(res2.errors).toContain("source_context.reply_text: non-empty string required");
    }
  });

  it("rejects malformed demo dates, accepts omitted demo", () => {
    const bad = valid();
    bad.demo = { requested_at: "next tuesday" };
    const res = parseLeadIntake(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors).toContain("demo.requested_at: ISO-8601 date string required");

    const none = valid();
    delete none.demo;
    expect(parseLeadIntake(none).ok).toBe(true);
  });

  it("rejects empty-string optional fields but allows their absence", () => {
    const p = valid();
    p.vertical = "   ";
    const res = parseLeadIntake(p);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors).toContain("vertical: non-empty string when present");

    const q = valid();
    delete q.company;
    delete q.vertical;
    expect(parseLeadIntake(q).ok).toBe(true);
  });

  it("allows unknown extra keys (additive evolution — MC.4 attribution etc.)", () => {
    const p = valid();
    p.attribution = { channel: "cold_email" };
    expect(parseLeadIntake(p).ok).toBe(true);
  });

  it("reports every problem at once (fix-it contract, Tasks 1.9/1.15 parity)", () => {
    const res = parseLeadIntake({ stage: "paid", contact: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.length).toBeGreaterThanOrEqual(4);
  });
});
