import { describe, expect, it } from "vitest";
import { GROUP_CAP, groupIntelItems } from "../grouping";
import type { IntelItem } from "../meetingIntel";

// Q89 inc.23 — critic-rob punch #7 (the 22-row uncapped Overview wall).
//
// The load-bearing assertion in this file is NOT "the cap works". It is that the cap
// hides rows without losing them: `hidden` holds the overflow and `total` reports the
// real count. A cap that dropped rows would put back, in the UI, the exact defect Q89
// exists to remove — a meeting's contents invisible on the page.

const item = (text: string, context?: string, rank?: number): IntelItem => ({
  kind: "action-items",
  text,
  rank,
  // `context` lives on provenance, never in `text` — the inc.4 rule. A fixture that
  // prefixed the company onto the text would test a shape the product forbids.
  provenance: { meetingId: "A-MTG-1", sourceRef: "block-1", excerpt: text, context },
});

describe("groupIntelItems", () => {
  it("groups by company and keeps source order inside each group", () => {
    const groups = groupIntelItems([
      item("a1", "Omega Title"),
      item("b1", "Gulf Coast"),
      item("a2", "Omega Title"),
    ]);
    expect(groups.map((g) => g.context)).toEqual(["Omega Title", "Gulf Coast"]);
    expect(groups[0].shown.map((i) => i.text)).toEqual(["a1", "a2"]);
    expect(groups[1].total).toBe(1);
  });

  it("caps what is open but never what exists — the overflow is returned, not dropped", () => {
    const many = Array.from({ length: 22 }, (_, i) => item(`row-${i}`, "Omega Title"));
    const [g] = groupIntelItems(many);
    expect(g.shown).toHaveLength(GROUP_CAP);
    expect(g.hidden).toHaveLength(22 - GROUP_CAP);
    expect(g.total).toBe(22);
    // Nothing vanished between input and output.
    expect([...g.shown, ...g.hidden].map((i) => i.text)).toEqual(many.map((i) => i.text));
  });

  it("puts the company holding the best rank first when the block is fully ranked", () => {
    const groups = groupIntelItems([
      item("later", "Gulf Coast", 3),
      item("first", "Omega Title", 1),
      item("second", "Gulf Coast", 2),
    ]);
    expect(groups.map((g) => g.context)).toEqual(["Omega Title", "Gulf Coast"]);
  });

  it("does not invent an order from a partial ranking — one missing rank means source order", () => {
    const groups = groupIntelItems([
      item("unranked", "Gulf Coast"),
      item("ranked", "Omega Title", 1),
    ]);
    expect(groups.map((g) => g.context)).toEqual(["Gulf Coast", "Omega Title"]);
  });

  it("treats an absent or blank context as one unlabelled group, never a group named ''", () => {
    const groups = groupIntelItems([item("x"), item("y", "   ")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].context).toBeNull();
    expect(groups[0].total).toBe(2);
  });

  it("returns nothing for no items", () => {
    expect(groupIntelItems([])).toEqual([]);
  });

  it("never collapses a group to zero visible rows on a nonsense cap", () => {
    const [g] = groupIntelItems([item("a", "Omega Title"), item("b", "Omega Title")], 0);
    expect(g.shown).toHaveLength(1);
    expect(g.hidden).toHaveLength(1);
  });
});
