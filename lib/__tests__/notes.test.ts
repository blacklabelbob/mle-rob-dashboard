import { describe, expect, it } from "vitest";
import { composeNotes, isEnrichmentMarker, splitNotes } from "@/lib/notes";

// Fixtures mirror real prod shapes observed 2026-07-23 (rob-acheson,
// michael-jaenvega, gary-waskivich, david-cates, trent-brands, daniella-roach).

describe("splitNotes", () => {
  it("no markers → all human, no enrichment (trent shape)", () => {
    const raw =
      "PAID 2026-07-23: sent $2,000 check for Phase 1 (Rob dev-chat #44). Promoted vertical-anchor/warm -> client/lit.";
    expect(splitNotes(raw)).toEqual({ human: raw, enrichment: [] });
  });

  it("empty / null / whitespace → empty split", () => {
    expect(splitNotes(null)).toEqual({ human: "", enrichment: [] });
    expect(splitNotes(undefined)).toEqual({ human: "", enrichment: [] });
    expect(splitNotes("   \n ")).toEqual({ human: "", enrichment: [] });
  });

  it("human line + single ENRICHED paragraph, single-newline separated (rob-acheson shape)", () => {
    const { human, enrichment } = splitNotes(
      "Center of The Network.\nENRICHED 2026-07-22: email/website from Rob's own identity."
    );
    expect(human).toBe("Center of The Network.");
    expect(enrichment).toEqual(["ENRICHED 2026-07-22: email/website from Rob's own identity."]);
  });

  it("Sources:-first record → human empty, all enrichment (michael shape)", () => {
    const { human, enrichment } = splitNotes("Sources: Sunbiz P17000087470 (MFS Naples pres).");
    expect(human).toBe("");
    expect(enrichment).toHaveLength(1);
  });

  it("multiple ENRICHED paragraphs split into separate blocks in stored order (gary shape)", () => {
    const { human, enrichment } = splitNotes(
      "ENRICHED 2026-07-18: LinkedIn confirmed live.\nENRICHED 2026-07-18: De Cecco USA HQ details."
    );
    expect(human).toBe("");
    expect(enrichment).toEqual([
      "ENRICHED 2026-07-18: LinkedIn confirmed live.",
      "ENRICHED 2026-07-18: De Cecco USA HQ details.",
    ]);
  });

  it("'Enrichment hunt' marker counts (david-cates shape)", () => {
    const { human, enrichment } = splitNotes(
      "Enrichment hunt 2026-07-22: no public web footprint found."
    );
    expect(human).toBe("");
    expect(enrichment).toHaveLength(1);
  });

  it("non-marker continuation lines stay attached to their block (ALIAS addendum, daniella shape)", () => {
    const { human, enrichment } = splitNotes(
      "Rob 2026-07-17: Daniella and Gary are CO-owners of Miga.\nSources: Sunbiz P21000103391.\nALIAS (Rob-confirmed 2026-07-22): also appears as Daniella Jaenvega."
    );
    expect(human).toBe("Rob 2026-07-17: Daniella and Gary are CO-owners of Miga.");
    expect(enrichment).toEqual([
      "Sources: Sunbiz P21000103391.\nALIAS (Rob-confirmed 2026-07-22): also appears as Daniella Jaenvega.",
    ]);
  });

  it("multi-line human notes above the first marker survive intact", () => {
    const { human } = splitNotes(
      "Line one.\n\nLine two after a gap.\nENRICHED 2026-07-17: stuff."
    );
    expect(human).toBe("Line one.\n\nLine two after a gap.");
  });
});

describe("composeNotes (the save path — must never lose enrichment)", () => {
  it("human edit + enrichment recompose blank-line separated", () => {
    expect(composeNotes("New human note.", ["ENRICHED 2026-07-22: x."])).toBe(
      "New human note.\n\nENRICHED 2026-07-22: x."
    );
  });

  it("clearing the human note keeps every enrichment block", () => {
    const out = composeNotes("", ["ENRICHED a: one.", "Sources: two."]);
    expect(out).toBe("ENRICHED a: one.\n\nSources: two.");
  });

  it("no enrichment → just the human note", () => {
    expect(composeNotes("Only words.", [])).toBe("Only words.");
  });

  it("split → compose → split is content-stable on every real shape", () => {
    const shapes = [
      "Center of The Network.\nENRICHED 2026-07-22: identity note.",
      "Sources: Sunbiz P17000087470.",
      "ENRICHED a: one.\nENRICHED b: two.",
      "Human only, no machines here.",
      "Rob note.\nSources: X.\nALIAS: Y.",
    ];
    for (const raw of shapes) {
      const first = splitNotes(raw);
      const second = splitNotes(composeNotes(first.human, first.enrichment));
      expect(second).toEqual(first);
    }
  });
});

describe("isEnrichmentMarker", () => {
  it("matches the explicit marker list only", () => {
    expect(isEnrichmentMarker("ENRICHED 2026-07-17: x")).toBe(true);
    expect(isEnrichmentMarker("Enrichment hunt 2026-07-22: x")).toBe(true);
    expect(isEnrichmentMarker("Sources: Sunbiz")).toBe(true);
    expect(isEnrichmentMarker("  ENRICHED with leading space")).toBe(true);
    expect(isEnrichmentMarker("Rob 2026-07-17: human words")).toBe(false);
    expect(isEnrichmentMarker("PAID 2026-07-23: check")).toBe(false);
    expect(isEnrichmentMarker("Enriches the story")).toBe(false);
    expect(isEnrichmentMarker("sourcess: typo")).toBe(false);
  });
});
