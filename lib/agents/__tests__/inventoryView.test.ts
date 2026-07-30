import { describe, expect, it } from "vitest";
import type { AssetRecord, AuditFinding } from "../inventory";
import { cleanCount, rankAssets, shortenPath } from "../inventoryView";

// Q79 half (c). The ordering IS the feature: if a clean file can outrank a flagged
// one, the page is a directory instead of an alarm, and Rob is back to reading 132
// markdown files to find the agent that says he works somewhere he left.

function asset(over: Partial<AssetRecord> = {}): AssetRecord {
  return {
    kind: "agent",
    slug: "a",
    name: "a",
    purpose: null,
    model: null,
    tools: null,
    path: "/root/agents/a.md",
    lastModified: "2026-07-29T00:00:00.000Z",
    hasFrontmatter: true,
    ...over,
  };
}

function finding(over: Partial<AuditFinding> = {}): AuditFinding {
  return {
    slug: "a",
    kind: "agent",
    path: "/root/agents/a.md",
    severity: "medium",
    code: "stg_reference",
    detail: "d",
    evidence: "e",
    ...over,
  };
}

describe("rankAssets", () => {
  it("puts a single high above a file carrying many mediums", () => {
    const rows = rankAssets(
      [asset({ slug: "many", name: "many" }), asset({ slug: "one", name: "one" })],
      [
        finding({ slug: "many" }),
        finding({ slug: "many" }),
        finding({ slug: "many" }),
        finding({ slug: "one", severity: "high", code: "stale_role_claim" }),
      ],
    );
    expect(rows.map((r) => r.asset.slug)).toEqual(["one", "many"]);
  });

  it("puts every flagged file above every clean one", () => {
    const rows = rankAssets(
      [asset({ slug: "zzz", name: "zzz" }), asset({ slug: "aaa", name: "aaa" })],
      [finding({ slug: "zzz" })],
    );
    expect(rows[0].asset.slug).toBe("zzz");
    expect(rows[1].worst).toBeNull();
  });

  it("matches findings on kind AND slug, never slug alone", () => {
    const rows = rankAssets(
      [asset({ slug: "dup" }), asset({ kind: "skill", slug: "dup", name: "dup-skill" })],
      [finding({ slug: "dup", kind: "skill", severity: "high" })],
    );
    const skill = rows.find((r) => r.asset.kind === "skill");
    const agent = rows.find((r) => r.asset.kind === "agent");
    expect(skill?.high).toBe(1);
    expect(agent?.high).toBe(0);
    expect(agent?.worst).toBeNull();
  });

  it("orders a row's own findings high-first", () => {
    const [row] = rankAssets(
      [asset()],
      [finding({ severity: "medium" }), finding({ severity: "high", code: "x" })],
    );
    expect(row.findings.map((f) => f.severity)).toEqual(["high", "medium"]);
    expect(row.high).toBe(1);
    expect(row.medium).toBe(1);
    expect(row.worst).toBe("high");
  });

  it("is deterministic for equally-clean files (agents before skills, then name)", () => {
    const rows = rankAssets(
      [
        asset({ kind: "skill", slug: "b", name: "b" }),
        asset({ slug: "z", name: "z" }),
        asset({ slug: "m", name: "m" }),
      ],
      [],
    );
    expect(rows.map((r) => r.asset.name)).toEqual(["m", "z", "b"]);
  });

  it("counts clean files separately from flagged ones", () => {
    const rows = rankAssets(
      [asset({ slug: "a" }), asset({ slug: "b", name: "b" }), asset({ slug: "c", name: "c" })],
      [finding({ slug: "a", severity: "high" })],
    );
    expect(cleanCount(rows)).toBe(2);
  });
});

describe("shortenPath", () => {
  it("collapses the scan root so no home directory reaches the screen", () => {
    expect(shortenPath("/Users/someone/.claude/agents/a.md", "/Users/someone/.claude")).toBe(
      "~/.claude/agents/a.md",
    );
  });

  it("leaves a path outside the scan root alone rather than guessing", () => {
    expect(shortenPath("/elsewhere/a.md", "/Users/someone/.claude")).toBe("/elsewhere/a.md");
  });
});
