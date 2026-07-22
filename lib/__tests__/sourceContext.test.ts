// PRD Task 1.15 DoD: "Field spec with worked examples for ≥3 source types."
// The spec IS lib/leads/sourceContext.ts (CR-3); these tests pin (a) every
// worked example valid — 4 source types, exceeding the ≥3 bar — and (b) the
// per-type required fields actually reject when absent.
import { describe, expect, it } from "vitest";
import {
  INTAKE_SOURCE_TYPES,
  WORKED_EXAMPLES,
  describeIntakeSource,
  parseIntakeSourceContext,
} from "../leads/sourceContext";

describe("Task 1.15 source-context intake spec", () => {
  it("every worked example parses valid (DoD: worked examples for ≥3 source types)", () => {
    expect(INTAKE_SOURCE_TYPES.length).toBeGreaterThanOrEqual(3);
    for (const type of INTAKE_SOURCE_TYPES) {
      const result = parseIntakeSourceContext(WORKED_EXAMPLES[type]);
      expect(result.ok, `worked example for ${type} must be valid`).toBe(true);
    }
  });

  it("rejects non-object payloads", () => {
    for (const bad of [null, undefined, "email_reply", 42, ["source_type"]]) {
      const r = parseIntakeSourceContext(bad);
      expect(r.ok).toBe(false);
    }
  });

  it("rejects unknown/missing source_type with the full allowed list", () => {
    const r = parseIntakeSourceContext({ source_type: "carrier_pigeon" });
    expect(r).toEqual({
      ok: false,
      errors: [`source_type must be one of: ${INTAKE_SOURCE_TYPES.join(", ")}`],
    });
    expect(parseIntakeSourceContext({}).ok).toBe(false);
  });

  it("email_reply requires replied-to subject AND reply text (reports both at once)", () => {
    const r = parseIntakeSourceContext({ source_type: "email_reply" });
    expect(r).toEqual({
      ok: false,
      errors: [
        "replied_to_subject: non-empty string required",
        "reply_text: non-empty string required",
      ],
    });
    // Whitespace-only is absence, not an answer.
    const ws = parseIntakeSourceContext({
      source_type: "email_reply",
      replied_to_subject: "Re: your missed calls",
      reply_text: "   ",
    });
    expect(ws.ok).toBe(false);
  });

  it("web_form requires form name + non-empty Q&A pairs, flags each bad pair by index", () => {
    expect(
      parseIntakeSourceContext({ source_type: "web_form", form_name: "Demo", answers: [] }),
    ).toEqual({
      ok: false,
      errors: ["answers: non-empty array of {question, answer} required"],
    });
    const r = parseIntakeSourceContext({
      source_type: "web_form",
      form_name: "Demo",
      answers: [
        { question: "Company?", answer: "Peak Ridge Roofing" },
        { question: "Visitors?", answer: "" },
        "not-a-pair",
      ],
    });
    expect(r).toEqual({
      ok: false,
      errors: [
        "answers[1]: {question, answer} both non-empty strings required",
        "answers[2]: {question, answer} both non-empty strings required",
      ],
    });
  });

  it("ad_reel requires topic + creative ref; trade_show requires event name + notes", () => {
    expect(parseIntakeSourceContext({ source_type: "ad_reel", topic: "Leaky bucket" })).toEqual({
      ok: false,
      errors: ["creative_ref: non-empty string required"],
    });
    expect(parseIntakeSourceContext({ source_type: "trade_show", event_name: "FRSA Expo" })).toEqual({
      ok: false,
      errors: ["notes: non-empty string required"],
    });
  });

  it("permits additive extra keys (MC.4 attribution / Task 1.11 product detail ride along)", () => {
    const r = parseIntakeSourceContext({
      ...WORKED_EXAMPLES.ad_reel,
      attribution: { channel: "Lead Magnet", utm_campaign: "leakybucket-q3" },
      product: "aiva",
    });
    expect(r.ok).toBe(true);
  });

  it("describeIntakeSource renders a deterministic one-liner per type", () => {
    expect(describeIntakeSource(WORKED_EXAMPLES.email_reply)).toBe(
      'Replied to "Your missed-call number for June — 27 calls went nowhere"',
    );
    expect(describeIntakeSource(WORKED_EXAMPLES.web_form)).toBe(
      "Submitted AIVA demo request (3 answers)",
    );
    expect(describeIntakeSource(WORKED_EXAMPLES.ad_reel)).toBe(
      "Responded to meta creative: 97% of your website visitors leave without calling — here's who they were",
    );
    expect(describeIntakeSource(WORKED_EXAMPLES.trade_show)).toBe(
      "Met at Florida Roofing & Sheet Metal Expo 2026",
    );
  });
});
