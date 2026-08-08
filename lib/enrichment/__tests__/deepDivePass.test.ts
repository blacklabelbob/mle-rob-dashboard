/**
 * Q87 inc.5 — the pass that fires, and the row it must refuse to write.
 *
 * The assertions that matter are the refusals. A pass that appends a ledger row per org iterated
 * would move all four referral targets to `covered` on its first tick having researched nothing —
 * the unfalsifiable claim inc.2 measured, rebuilt automatically. Every test below that says
 * "not-recorded" is that failure being held shut.
 */

import { describe, expect, it, vi } from "vitest";
import {
  deepDivePassLog,
  runDeepDivePass,
  runFromFinding,
  type DeepDiveFinding,
  type DeepDivePassDeps,
} from "../deepDivePass";
import type { DeepDiveOrg } from "../deepDiveDue";
import type { LedgerFile } from "../deepDiveLedger";

const target = (id: string, name: string, background = ""): DeepDiveOrg => ({
  id,
  name,
  nodeType: "lead",
  relationship: "REFERRAL TARGET — NOT met, NOT contacted, gated on Omega going well",
  description: background,
});

const goodFinding: DeepDiveFinding = {
  producedBy: "lead-enricher",
  ranAt: "2026-08-08",
  summary: "Monarch National writes homeowners through independent agents.",
  sources: ["https://monarchnational.com/about"],
};

function deps(over: Partial<DeepDivePassDeps> & { orgs?: DeepDiveOrg[]; ledger?: unknown } = {}) {
  const saved: LedgerFile[] = [];
  const d: DeepDivePassDeps = {
    listOrgs: async () => over.orgs ?? [target("C-2021", "Monarch National")],
    loadLedger: async () => over.ledger ?? null,
    dive: over.dive ?? (async () => goodFinding),
    saveLedger: over.saveLedger ?? (async (l) => void saved.push(l)),
  };
  return { d, saved };
}

describe("runFromFinding — a row is earned, never granted", () => {
  it("refuses a dive that names no producer, and says why in the pass's own words", () => {
    const r = runFromFinding("C-2021", { ...goodFinding, producedBy: "" });
    expect(r).toMatchObject({
      refused: "the dive named no producer — a pass may not sign research on a researcher's behalf",
    });
  });

  it("refuses an empty dive — nothing learned does not cover a company", () => {
    const r = runFromFinding("C-2021", { ...goodFinding, summary: "   " });
    expect(r).toMatchObject({ refused: "lead-enricher produced no findings — an empty dive does not cover a company" });
  });

  it("refuses findings with no source URL (external-facts rule)", () => {
    const r = runFromFinding("C-2021", { ...goodFinding, sources: [] });
    expect("refused" in r && r.refused).toContain("no source URL");
  });

  it("refuses an undated run rather than dating it here", () => {
    const r = runFromFinding("C-2021", { ...goodFinding, ranAt: "" });
    expect("refused" in r && r.refused).toContain("no run date");
  });

  it("refuses a researcher that returned nothing at all", () => {
    expect(runFromFinding("C-2021", null)).toMatchObject({ refused: expect.stringContaining("nothing at all") });
  });

  it("accepts a sourced, dated, attributed finding — and carries the researcher's own producer", () => {
    expect(runFromFinding("C-2021", goodFinding)).toEqual({
      orgId: "C-2021",
      ranAt: "2026-08-08",
      producedBy: "lead-enricher",
    });
  });
});

describe("runDeepDivePass", () => {
  it("short-circuits before ANY read when config is missing", async () => {
    const listOrgs = vi.fn();
    const loadLedger = vi.fn();
    const { d } = deps();
    const result = await runDeepDivePass({ ...d, listOrgs, loadLedger }, {
      missingConfig: ["ANTHROPIC_API_KEY"],
      execute: true,
    });
    expect(result).toEqual({ kind: "not-configured", missing: ["ANTHROPIC_API_KEY"] });
    expect(listOrgs).not.toHaveBeenCalled();
    expect(loadLedger).not.toHaveBeenCalled();
  });

  it("execute:false plans and never calls the researcher", async () => {
    const dive = vi.fn();
    const { d } = deps({ dive });
    const result = await runDeepDivePass({ ...d, dive }, { missingConfig: [], execute: false });
    expect(result.kind).toBe("planned");
    if (result.kind !== "planned") throw new Error("unreachable");
    expect(result.plan.due.map((x) => x.orgId)).toEqual(["C-2021"]);
    expect(dive).not.toHaveBeenCalled();
  });

  it("records a good dive, threads it into the ledger, and saves ONCE", async () => {
    const { d, saved } = deps();
    const result = await runDeepDivePass(d, { missingConfig: [], execute: true });
    if (result.kind !== "executed") throw new Error("expected executed");
    expect(result.recorded).toBe(1);
    expect(result.refused).toBe(0);
    expect(saved).toHaveLength(1);
    expect(saved[0].runs).toEqual([{ orgId: "C-2021", ranAt: "2026-08-08", producedBy: "lead-enricher" }]);
  });

  it("THE JOIN: a recorded run is what moves an org off due — the next pass sees it covered", async () => {
    const { d, saved } = deps({ orgs: [target("C-2021", "Monarch National", "x".repeat(1316))] });
    const first = await runDeepDivePass(d, { missingConfig: [], execute: true });
    if (first.kind !== "executed") throw new Error("expected executed");
    expect(first.plan.due[0].verdict).toBe("due-unattributed");

    const dive = vi.fn();
    const second = await runDeepDivePass(
      { ...deps({ orgs: [target("C-2021", "Monarch National", "x".repeat(1316))], ledger: saved[0], dive }).d, dive },
      { missingConfig: [], execute: true, freshness: { asOf: "2026-08-20", freshDays: 90 } },
    );
    if (second.kind !== "planned") throw new Error("a covered org leaves nothing due, so the pass plans and stops");
    expect(second.plan.counts.covered).toBe(1);
    expect(second.plan.due).toHaveLength(0);
    expect(dive).not.toHaveBeenCalled();
  });

  it("a refused dive leaves the org due AND writes nothing — no save at all", async () => {
    const saveLedger = vi.fn();
    const { d } = deps({ dive: async () => ({ ...goodFinding, sources: [] }), saveLedger });
    const result = await runDeepDivePass(d, { missingConfig: [], execute: true });
    if (result.kind !== "executed") throw new Error("expected executed");
    expect(result.recorded).toBe(0);
    expect(result.refused).toBe(1);
    expect(saveLedger).not.toHaveBeenCalled();
    expect(result.ledger).toBeUndefined();
  });

  it("one researcher blowing up does not silence the others, and does not record for it", async () => {
    const orgs = [target("C-2021", "Monarch"), target("C-2022", "Viceroy", "x".repeat(50))];
    const { d, saved } = deps({
      orgs,
      dive: async (decision) => {
        if (decision.orgId === "C-2021") throw new Error("firecrawl 502");
        return goodFinding;
      },
    });
    const result = await runDeepDivePass(d, { missingConfig: [], execute: true });
    if (result.kind !== "executed") throw new Error("expected executed");
    expect(result.outcomes).toEqual([
      { orgId: "C-2021", kind: "not-recorded", reason: "the dive failed: firecrawl 502" },
      expect.objectContaining({ orgId: "C-2022", kind: "recorded" }),
    ]);
    expect(saved[0].runs.map((r) => (r as { orgId: string }).orgId)).toEqual(["C-2022"]);
  });

  it("two orgs covered in ONE tick both land — the ledger is threaded, not re-read", async () => {
    const orgs = [target("C-2021", "Monarch"), target("C-2022", "Viceroy", "x".repeat(50))];
    const { d, saved } = deps({
      orgs,
      dive: async (decision) => ({ ...goodFinding, producedBy: `enricher:${decision.orgId}` }),
    });
    const result = await runDeepDivePass(d, { missingConfig: [], execute: true });
    if (result.kind !== "executed") throw new Error("expected executed");
    expect(result.recorded).toBe(2);
    expect(saved).toHaveLength(1);
    expect(saved[0].runs).toHaveLength(2);
  });

  it("limit caps the tick and REPORTS what it deferred rather than dropping it", async () => {
    const orgs = [target("C-2021", "Monarch"), target("C-2022", "Viceroy", "x".repeat(50))];
    const { d } = deps({ orgs });
    const result = await runDeepDivePass(d, { missingConfig: [], execute: true, limit: 1 });
    if (result.kind !== "executed") throw new Error("expected executed");
    expect(result.plan.due.map((x) => x.orgId)).toEqual(["C-2021"]);
    expect(result.plan.deferred.map((x) => x.orgId)).toEqual(["C-2022"]);
  });

  it("a company that is not a referral target is never dived — the rule is not re-decided here", async () => {
    const dive = vi.fn();
    const { d } = deps({ orgs: [{ id: "C-2001", name: "Gulf Coast", nodeType: "client" }], dive });
    const result = await runDeepDivePass({ ...d, dive }, { missingConfig: [], execute: true });
    expect(result.kind).toBe("planned");
    expect(dive).not.toHaveBeenCalled();
  });

  it("ledger rows the ledger itself refuses are carried into the result, never dropped", async () => {
    const { d } = deps({ ledger: { version: 1, runs: [{ orgId: "C-2021", ranAt: "2026-08-08" }] } });
    const result = await runDeepDivePass(d, { missingConfig: [], execute: false });
    if (result.kind !== "planned") throw new Error("expected planned");
    expect(result.plan.rejectedLedgerRows).toHaveLength(1);
    expect(result.plan.rejectedLedgerRows[0].reason).toContain("producedBy");
  });

  it("the log carries counts and reasons, never the researched prose", async () => {
    const { d } = deps({ dive: async () => ({ ...goodFinding, sources: [] }) });
    const result = await runDeepDivePass(d, { missingConfig: [], execute: true });
    const log = deepDivePassLog(result);
    expect(log).toMatchObject({ pass: "deep-dive", state: "executed", recorded: 0, refused: 1 });
    expect(JSON.stringify(log)).not.toContain(goodFinding.summary);
  });
});
