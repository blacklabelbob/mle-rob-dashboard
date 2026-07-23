// MC.4 pins — the taxonomy/UTM convention can't drift from what consumers
// classify with (Q52/Q54 gate-test pattern).
import { describe, expect, it } from "vitest";
import {
  classifyLeadSource,
  classifyUtm,
  INTAKE_SOURCE_TYPES,
  INTAKE_TYPE_DEFAULT_SOURCE,
  LEAD_MAGNET_CAMPAIGN_PREFIX,
  LEAD_SOURCE_TAXONOMY,
  LEAD_SOURCES,
  parseLeadSource,
  TAXONOMY_WORKED_EXAMPLES,
  UTM_CONVENTION,
} from "../leads/sourceTaxonomy";

describe("MC.4 lead-source taxonomy", () => {
  it("pins the base-PRD five-value enum exactly (widening is a Rob call)", () => {
    expect([...LEAD_SOURCES]).toEqual([
      "cold_email",
      "referral",
      "lead_magnet",
      "organic",
      "direct_unknown",
    ]);
    // one definition row per enum value, same order
    expect(LEAD_SOURCE_TAXONOMY.map((d) => d.id)).toEqual([...LEAD_SOURCES]);
    for (const def of LEAD_SOURCE_TAXONOMY) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.definition.length).toBeGreaterThan(0);
      expect(def.examples.length).toBeGreaterThan(0);
    }
  });

  it("pins the UTM convention table: all five params, medium carries paid-vs-organic", () => {
    expect(UTM_CONVENTION.map((r) => r.param)).toEqual([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
    ]);
    const medium = UTM_CONVENTION.find((r) => r.param === "utm_medium")!;
    for (const v of ["cpc", "paid_social", "social", "email", "referral", "organic"]) {
      expect(medium.reservedValues).toContain(v);
    }
  });

  it("classifyUtm ladder: rung order is the spec", () => {
    // rung 1 beats rung 3: cold-email campaign that ALSO carries an lm- campaign
    expect(
      classifyUtm({ utm_source: "coldemail", utm_medium: "email", utm_campaign: "lm-x" }),
    ).toBe("cold_email");
    // rung 2 beats rung 3
    expect(classifyUtm({ utm_medium: "referral", utm_campaign: "lm-x" })).toBe("referral");
    // rung 3
    expect(classifyUtm({ utm_campaign: `${LEAD_MAGNET_CAMPAIGN_PREFIX}scorecard` })).toBe(
      "lead_magnet",
    );
    // rung 4: any other UTM value → organic
    expect(classifyUtm({ utm_source: "google" })).toBe("organic");
    // rung 5: nothing → direct_unknown; whitespace-only counts as nothing
    expect(classifyUtm({})).toBe("direct_unknown");
    expect(classifyUtm({ utm_source: "  " })).toBe("direct_unknown");
    // case-insensitive
    expect(classifyUtm({ utm_source: "ColdEmail", utm_medium: "EMAIL" })).toBe("cold_email");
  });

  it("every Task 1.15 intake source type has a default rung (completeness gate)", () => {
    for (const t of INTAKE_SOURCE_TYPES) {
      expect(LEAD_SOURCES).toContain(INTAKE_TYPE_DEFAULT_SOURCE[t]);
    }
  });

  it("classifyLeadSource: UTM evidence beats the intake default; no evidence is honestly unknown", () => {
    // web_form default is lead_magnet, but referral UTM wins
    expect(
      classifyLeadSource({ utm: { utm_medium: "referral" }, intakeType: "web_form" }),
    ).toBe("referral");
    // UTM present but classifying to direct_unknown (empty) falls back to intake default
    expect(classifyLeadSource({ utm: {}, intakeType: "web_form" })).toBe("lead_magnet");
    expect(classifyLeadSource({})).toBe("direct_unknown");
  });

  it("worked examples are pinned to the classifier (drift fails the suite)", () => {
    expect(TAXONOMY_WORKED_EXAMPLES.length).toBeGreaterThanOrEqual(5);
    for (const ex of TAXONOMY_WORKED_EXAMPLES) {
      expect(classifyLeadSource(ex.evidence), ex.scenario).toBe(ex.expected);
    }
    // every taxonomy value appears in at least one worked example
    const covered = new Set(TAXONOMY_WORKED_EXAMPLES.map((e) => e.expected));
    for (const s of LEAD_SOURCES) {
      if (s === "cold_email" || s === "referral" || s === "lead_magnet" || s === "organic" || s === "direct_unknown") {
        expect(covered.has(s), `no worked example classifies to ${s}`).toBe(true);
      }
    }
  });

  it("parseLeadSource normalizes free text; unconfident input returns null, never a guess", () => {
    expect(parseLeadSource("Cold Email")).toBe("cold_email");
    expect(parseLeadSource("Lead-Magnet")).toBe("lead_magnet");
    expect(parseLeadSource("referred")).toBe("referral");
    expect(parseLeadSource("SEO")).toBe("organic");
    expect(parseLeadSource("Direct")).toBe("direct_unknown");
    expect(parseLeadSource("carrier pigeon")).toBeNull();
  });
});
