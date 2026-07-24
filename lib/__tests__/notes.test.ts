import { describe, expect, it } from "vitest";
import {
  appendMachineNote,
  applyHumanNotesEdit,
  composeNotes,
  isEnrichmentMarker,
  lintNotes,
  splitNotes,
} from "@/lib/notes";

// Fixtures mirror real prod shapes observed 2026-07-23 (rob-acheson,
// michael-jaenvega, gary-waskivich, david-cates, trent-brands, daniella-roach).
// Correction 2026-07-23 (critic-rob Q43 punch #2): the fixture below labelled
// "daniella shape" was a LINE-NORMALIZED version of her row, not what prod
// actually stored — her real row had `Sources:` mid-line, which the splitter
// (line-anchored by design) does not split. Fixture renamed to what it really
// is; the true prod one-liner is pinned separately under "known limitation",
// and lintNotes() now catches that shape in code.

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

  it("non-marker continuation lines stay attached to their block (ALIAS addendum, line-normalized shape)", () => {
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

  // KNOWN LIMITATION, pinned deliberately: markers are line-anchored (see
  // lib/notes.ts:22-25) so a mid-line `Sources:` does NOT split. This was
  // daniella-roach's ACTUAL stored shape until it was line-normalized in the
  // data on 2026-07-23. The fix is the data + lintNotes(), never a fuzzier
  // splitter — this test fails loudly if someone "helpfully" makes it fuzzy.
  it("mid-line markers do NOT split — by design; lint catches the shape instead", () => {
    const realDaniellaBefore =
      "Rob 2026-07-17: Daniella and Gary are CO-owners of Miga (resolves the earlier ownership conflict). Sources: Sunbiz P21000103391 (Miga officer/agent); LinkedIn /in/daniella-roach-b1a0297.\nALIAS (Rob-confirmed 2026-07-22): also appears as Daniella Jaenvega.";
    const { human, enrichment } = splitNotes(realDaniellaBefore);
    expect(human).toContain("Sources: Sunbiz"); // the wall — unsplit
    expect(enrichment).toEqual([]);
    expect(lintNotes(realDaniellaBefore)).toEqual([
      { code: "mid-line-marker", line: 0, detail: "Sources:" },
    ]);
  });
});

describe("lintNotes", () => {
  it("clean note (line-normalized daniella, as stored after the 7/23 fix) → no issues", () => {
    expect(
      lintNotes(
        "Rob 2026-07-17: Daniella and Gary are CO-owners of Miga.\nSources: Sunbiz P21000103391.\nALIAS (Rob-confirmed 2026-07-22): also Daniella Jaenvega."
      )
    ).toEqual([]);
  });

  it("only lints the HUMAN part — markers inside enrichment blocks are correct there", () => {
    expect(
      lintNotes("Human line.\nENRICHED 2026-07-18: found via LinkedIn. Sources: Sunbiz P1.")
    ).toEqual([]);
  });

  it("flags a stray leading separator (miga shape)", () => {
    const issues = lintNotes("| Rob 2026-07-17: co-owned with Gary.");
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("leading-separator");
  });

  it("empty / null → no issues", () => {
    expect(lintNotes(null)).toEqual([]);
    expect(lintNotes("  ")).toEqual([]);
  });

  // Q43 punch #4: the recycle cron and the CSV importer used to jam their tags
  // onto the end of Rob's line. Both write their own block now — the lint is
  // the net that catches any writer (or hand-edit) that regresses.
  it("flags a mid-line [recycle_candidate] / [import:] tag", () => {
    const recycle = lintNotes("cold expo lead [recycle_candidate 2026-07-22]");
    expect(recycle).toHaveLength(1);
    expect(recycle[0].code).toBe("mid-line-marker");

    const imported = lintNotes("met at expo [import: roofing-list-2026-07]");
    expect(imported).toHaveLength(1);
    expect(imported[0].code).toBe("mid-line-marker");
  });
});

describe("appendMachineNote (Q43 punch #4 — the one machine write path)", () => {
  it("always opens its own block, and the marker files it as enrichment", () => {
    const out = appendMachineNote("Rob: met at expo.", "[import: list-a]");
    expect(out).toBe("Rob: met at expo.\n\n[import: list-a]");
    expect(splitNotes(out).human).toBe("Rob: met at expo.");
    expect(splitNotes(out).enrichment).toEqual(["[import: list-a]"]);
    expect(lintNotes(out)).toEqual([]);
  });

  it("empty stored notes → the block alone; empty block → notes untouched", () => {
    expect(appendMachineNote(null, "[recycle_candidate 2026-07-22]")).toBe(
      "[recycle_candidate 2026-07-22]"
    );
    expect(appendMachineNote("Rob: keep.", "   ")).toBe("Rob: keep.");
  });

  it("stacks after existing enrichment without disturbing the human part", () => {
    const stored = "Rob: owns Miga.\n\nENRICHED 2026-07-17: Sunbiz officer record.";
    const out = appendMachineNote(stored, "[recycle_candidate 2026-07-22]");
    expect(splitNotes(out).human).toBe("Rob: owns Miga.");
    expect(splitNotes(out).enrichment).toEqual([
      "ENRICHED 2026-07-17: Sunbiz officer record.",
      "[recycle_candidate 2026-07-22]",
    ]);
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

describe("applyHumanNotesEdit (Q43 punch #3 — server-side recompose)", () => {
  // The exact loss the critic named: Rob opens a record, an overnight agent
  // appends a NEW enrichment block server-side, then Rob saves his notes.
  // Recomposing against the stored row keeps the new block; recomposing against
  // what was on screen (the old client behavior) would have dropped it.
  const atLoad = "Rob 2026-07-17: owns Miga.\n\nENRICHED 2026-07-17: Sunbiz officer record.";
  const storedAtSave = `${atLoad}\n\nENRICHED 2026-07-23: LinkedIn title confirmed.`;

  it("keeps enrichment appended after the editor loaded", () => {
    const out = applyHumanNotesEdit(storedAtSave, "Rob 2026-07-17: owns Miga. Called him 7/23.");
    expect(out).toContain("ENRICHED 2026-07-23: LinkedIn title confirmed.");
    expect(out).toContain("ENRICHED 2026-07-17: Sunbiz officer record.");
    expect(splitNotes(out).human).toBe("Rob 2026-07-17: owns Miga. Called him 7/23.");
    expect(splitNotes(out).enrichment).toHaveLength(2);
  });

  it("clearing the human notes never touches enrichment", () => {
    const out = applyHumanNotesEdit(storedAtSave, "");
    expect(splitNotes(out).human).toBe("");
    expect(splitNotes(out).enrichment).toEqual(splitNotes(storedAtSave).enrichment);
  });

  it("is a no-op round trip when the human part is unchanged", () => {
    expect(applyHumanNotesEdit(storedAtSave, splitNotes(storedAtSave).human)).toBe(
      composeNotes(splitNotes(storedAtSave).human, splitNotes(storedAtSave).enrichment)
    );
  });

  it("handles an empty/absent stored row", () => {
    expect(applyHumanNotesEdit(null, "first note")).toBe("first note");
    expect(applyHumanNotesEdit("", "")).toBe("");
  });
});
