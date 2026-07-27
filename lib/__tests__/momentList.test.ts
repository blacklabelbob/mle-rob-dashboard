import { describe, expect, it } from "vitest";
import { momentRows } from "@/lib/calls/momentList";
import type { PanelMoment } from "@/lib/calls/searchPanel";

// BUILD-QUEUE Q68 (b) inc.27 — the jump list.
//
// The two failures pinned hardest here are the silent ones: a "…" that ends up inside
// verbatim customer speech, and two rows that collide on one React key so a list of moments
// renders short.

function moment(over: Partial<PanelMoment> = {}): PanelMoment {
  return {
    turnKey: 4,
    idx: 9,
    time: "0:07",
    label: "Rep",
    snippet: "we can do fifteen hundred",
    snippetStart: 12,
    snippetEnd: 37,
    truncatedStart: false,
    truncatedEnd: false,
    ...over,
  };
}

describe("momentRows", () => {
  it("has no rows for no moments", () => {
    expect(momentRows([])).toEqual([]);
  });

  it("keeps the matcher's order", () => {
    const rows = momentRows([moment({ idx: 2 }), moment({ idx: 9 }), moment({ idx: 5 })]);
    expect(rows.map((r) => r.idx)).toEqual([2, 9, 5]);
  });

  it("carries the turn to scroll to and the segment to seek — separately", () => {
    const [row] = momentRows([moment({ turnKey: 41, idx: 3 })]);
    expect(row.turnKey).toBe(41);
    expect(row.idx).toBe(3);
  });

  // Rule 1 — the ellipsis is an adornment, never a character in the words.
  it("never puts an ellipsis in the snippet", () => {
    const [row] = momentRows([
      moment({ snippet: "fifteen hundred", truncatedStart: true, truncatedEnd: true }),
    ]);
    expect(row.snippet).toBe("fifteen hundred");
    expect(row.snippet).not.toContain("…");
    expect(row.snippet).not.toContain("...");
    expect(row.leadEllipsis).toBe(true);
    expect(row.trailEllipsis).toBe(true);
  });

  it("leaves the snippet byte-identical to the one it was given", () => {
    const snippet = "  spaces, “curly quotes” and a trailing gap  ";
    const [row] = momentRows([moment({ snippet })]);
    expect(row.snippet).toBe(snippet);
  });

  it("marks an uncut window as uncut", () => {
    const [row] = momentRows([moment()]);
    expect(row.leadEllipsis).toBe(false);
    expect(row.trailEllipsis).toBe(false);
  });

  // Rule 2 — an unknown time is not 0:00.
  it("carries a null time through and keeps it out of the label", () => {
    const [row] = momentRows([moment({ time: null, label: "Customer" })]);
    expect(row.time).toBeNull();
    expect(row.jumpLabel).toBe("Jump to Customer");
    expect(row.jumpLabel).not.toContain("0:00");
  });

  // Rule 4 — the label names the destination.
  it("names time and speaker when both are known", () => {
    const [row] = momentRows([moment({ time: "1:04", label: "Customer" })]);
    expect(row.jumpLabel).toBe("Jump to Customer at 1:04");
  });

  // Rule 3 — the collision that renders five moments as three.
  it("keys two identical hits in the same segment apart", () => {
    const rows = momentRows([moment(), moment(), moment()]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(3);
  });

  it("keys every row uniquely across a mixed list", () => {
    const rows = momentRows([
      moment({ turnKey: 1, idx: 1, snippetStart: 0 }),
      moment({ turnKey: 1, idx: 1, snippetStart: 0 }),
      moment({ turnKey: 1, idx: 2, snippetStart: 0 }),
      moment({ turnKey: 2, idx: 1, snippetStart: 0 }),
      moment({ turnKey: 1, idx: 1, snippetStart: 40 }),
    ]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("produces one row per moment and drops none", () => {
    const rows = momentRows([moment(), moment({ time: null }), moment({ truncatedEnd: true })]);
    expect(rows).toHaveLength(3);
  });
});
