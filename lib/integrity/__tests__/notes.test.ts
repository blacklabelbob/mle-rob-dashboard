import { describe, expect, it } from "vitest";
import {
  findNoteShapeIssues,
  noteShapeFlagDetail,
  noteShapeFlagTitle,
} from "@/lib/integrity/notes";

// Q43 punch #2: lintNotes gets a real consumer. Fixtures are the two shapes
// that actually shipped bad on prod (miga-food's leading `| `, daniella's
// mid-line `Sources:`), so this suite proves the watchdog would have caught
// both before a human noticed.

const MIGA_BEFORE = "| Rob 2026-07-17: ownership resolved — co-owned with Gary.";
const DANIELLA_BEFORE =
  "Rob 2026-07-17: confirmed ALIAS of Daniella Roach. Sources: Sunbiz P1, LinkedIn.";

describe("findNoteShapeIssues", () => {
  it("flags the leading separator miga-food shipped with", () => {
    const found = findNoteShapeIssues([
      { id: "miga-food", name: "Miga Food Manufacturing", notes: MIGA_BEFORE },
    ]);
    expect(found).toEqual([
      {
        entityId: "miga-food",
        entityName: "Miga Food Manufacturing",
        code: "leading-separator",
        // lintNotes caps the excerpt at 40 chars — flag copy stays one line.
        detail: "| Rob 2026-07-17: ownership resolved — c",
      },
    ]);
  });

  it("flags the mid-line marker daniella's row shipped with", () => {
    const found = findNoteShapeIssues([
      { id: "daniella-roach", name: "Daniella Roach", notes: DANIELLA_BEFORE },
    ]);
    expect(found.map((f) => f.code)).toEqual(["mid-line-marker"]);
    expect(found[0].detail).toBe("Sources:");
  });

  it("stays silent on well-formed notes (marker on its own line)", () => {
    expect(
      findNoteShapeIssues([
        {
          id: "gary",
          name: "Gary",
          notes: "Met at the Tampa show.\nENRICHED 2026-07-18: phone via Sunbiz.\nSources: Sunbiz P1.",
        },
        { id: "empty", name: "Nobody", notes: null },
        { id: "blank", name: "Blank", notes: "   " },
      ])
    ).toEqual([]);
  });

  it("leaves Rob's own bullet lists alone (gulf-coast's real note)", () => {
    expect(
      findNoteShapeIssues([
        {
          id: "golf-coast-real-estate-group",
          name: "Gulf Coast RE Group",
          notes: "Phase 4 will include the full platform.\n- Replace Boomtown\n- Sell to brokerages",
        },
      ])
    ).toEqual([]);
  });

  it("reports one finding per (record, code), not per offending line", () => {
    const found = findNoteShapeIssues([
      {
        id: "noisy",
        name: "Noisy Record",
        notes: "Line one. Sources: a.\nLine two. Sources: b.\nLine three. Sources: c.",
      },
    ]);
    expect(found).toHaveLength(1);
  });

  it("falls back to the id when a record has no name", () => {
    const found = findNoteShapeIssues([{ id: "orphan-row", name: "  ", notes: MIGA_BEFORE }]);
    expect(found[0].entityName).toBe("orphan-row");
  });
});

describe("flag copy", () => {
  const midLine = findNoteShapeIssues([
    { id: "daniella-roach", name: "Daniella Roach", notes: DANIELLA_BEFORE },
  ])[0];
  const leading = findNoteShapeIssues([
    { id: "miga-food", name: "Miga Food Manufacturing", notes: MIGA_BEFORE },
  ])[0];

  it("uses a stable title per code — the cron's idempotency key", () => {
    expect(noteShapeFlagTitle(midLine)).toBe("Notes: enrichment marker buried mid-line");
    expect(noteShapeFlagTitle(leading)).toBe("Notes: stray leading separator");
    // Same code, different record → same title (dedupe is (entity_id, title)).
    expect(noteShapeFlagTitle({ ...midLine, entityId: "someone-else" })).toBe(
      noteShapeFlagTitle(midLine)
    );
  });

  it("quotes the offending excerpt so the flag is actionable", () => {
    expect(noteShapeFlagDetail(midLine)).toContain('"Sources:"');
    expect(noteShapeFlagDetail(leading)).toContain("Strip the leading punctuation.");
  });
});
