/**
 * Q87 inc.6 — the dossier adapter, and the one dossier that must not cover four companies.
 *
 * All four referral targets share an owner (Steven A. Hale II — Q87, 2026-08-05), so one Hale
 * write-up genuinely reads as background on all of them. The subject check below is the only
 * thing standing between that and a worklist cleared to `covered` off a single piece of research.
 */

import { describe, expect, it, vi } from "vitest";
import { dossierToFinding, makeDossierDive } from "../deepDiveDossier";
import { runDeepDivePass, runFromFinding, type DeepDivePassDeps } from "../deepDivePass";
import type { DeepDiveDecision, DeepDiveOrg } from "../deepDiveDue";
import type { LedgerFile } from "../deepDiveLedger";

const dossier = (over: Record<string, unknown> = {}) => ({
  orgId: "C-2021",
  producedBy: "lead-enricher",
  ranAt: "2026-08-08",
  summary: "Monarch National writes homeowners insurance through independent agents.",
  sources: ["https://monarchnational.com/about"],
  ...over,
});

const target = (id: string, name: string, background = ""): DeepDiveOrg => ({
  id,
  name,
  nodeType: "lead",
  relationship: "REFERRAL TARGET — NOT met, NOT contacted, gated on Omega going well",
  description: background,
});

const decision = (orgId: string): DeepDiveDecision => ({
  orgId,
  name: orgId,
  verdict: "due-unattributed",
  because: "background present, no recorded run",
  backgroundChars: 1316,
});

const refusal = (v: unknown): string => (v as { refused: string }).refused;

describe("dossierToFinding — the subject check", () => {
  it("refuses a dossier about a DIFFERENT company, naming both ids", () => {
    const read = dossierToFinding("C-2021", dossier({ orgId: "C-2020" }));
    expect(refusal(read)).toContain("C-2021");
    expect(refusal(read)).toContain("C-2020");
    expect(refusal(read)).toContain("shared ownership is not shared research");
  });

  it("refuses a dossier that names no subject rather than assuming the org asked about", () => {
    const read = dossierToFinding("C-2021", dossier({ orgId: "" }));
    expect(refusal(read)).toContain("names no subject");
  });

  it("accepts a dossier whose subject matches", () => {
    const read = dossierToFinding("C-2021", dossier());
    expect("refused" in read).toBe(false);
  });
});

describe("dossierToFinding — a source is a URL", () => {
  it("drops an attribution with its reason and keeps the URL", () => {
    const read = dossierToFinding(
      "C-2021",
      dossier({ sources: ["Scott said on the 7/28 call", "https://monarchnational.com/about"] }),
    );
    if ("refused" in read) throw new Error(read.refused);
    expect(read.finding.sources).toEqual(["https://monarchnational.com/about"]);
    expect(read.droppedSources).toHaveLength(1);
    expect(read.droppedSources[0].reason).toContain("not a URL");
  });

  it("drops a non-web scheme — a local path is not something a reader can open", () => {
    const read = dossierToFinding("C-2021", dossier({ sources: ["file:///tmp/notes.txt"] }));
    if ("refused" in read) throw new Error(read.refused);
    expect(read.finding.sources).toEqual([]);
    expect(read.droppedSources[0].reason).toContain("not a web source");
  });

  it("leaves an all-attribution dossier with zero sources, so the PASS refuses it", () => {
    const read = dossierToFinding("C-2021", dossier({ sources: ["Scott said", "per the 7/28 call"] }));
    if ("refused" in read) throw new Error(read.refused);
    const run = runFromFinding("C-2021", read.finding);
    expect(refusal(run)).toContain("no source URL");
  });
});

describe("dossierToFinding — a plan is not a dive, and a missing dossier is not an empty one", () => {
  it.each(["planned", "in-progress", "blocked"])("refuses status %s as unfinished", (status) => {
    expect(refusal(dossierToFinding("C-2021", dossier({ status })))).toContain("not complete");
  });

  it("treats an absent status as complete rather than inventing a blocker", () => {
    expect("refused" in dossierToFinding("C-2021", dossier())).toBe(false);
    expect("refused" in dossierToFinding("C-2021", dossier({ status: "complete" }))).toBe(false);
  });

  it("says a missing dossier was never researched, not that it found nothing", () => {
    const read = dossierToFinding("C-2021", null);
    expect(refusal(read)).toContain("nothing has researched it yet");
    expect(refusal(read)).not.toContain("no findings");
  });

  it("refuses a dossier that is not an object", () => {
    expect(refusal(dossierToFinding("C-2021", ["a", "b"]))).toContain("not an object");
  });
});

describe("dossierToFinding — fills nothing in", () => {
  it("passes a producerless dossier through so the PASS refuses it by its own rule 1", () => {
    const read = dossierToFinding("C-2021", dossier({ producedBy: "" }));
    if ("refused" in read) throw new Error(read.refused);
    expect(read.finding.producedBy).toBeUndefined();
    expect(refusal(runFromFinding("C-2021", read.finding))).toContain("named no producer");
  });

  it("never substitutes its own date or summary", () => {
    const read = dossierToFinding("C-2021", dossier({ ranAt: "", summary: "" }));
    if ("refused" in read) throw new Error(read.refused);
    expect(read.finding.ranAt).toBeUndefined();
    expect(read.finding.summary).toBeUndefined();
  });
});

describe("makeDossierDive — wired into the pass", () => {
  function deps(load: (d: DeepDiveDecision) => Promise<unknown>): DeepDivePassDeps & { saved: LedgerFile[] } {
    const saved: LedgerFile[] = [];
    return {
      saved,
      listOrgs: async () => [target("C-2021", "Monarch National", "x".repeat(1316))],
      loadLedger: async () => null,
      dive: makeDossierDive(load),
      saveLedger: async (l) => void saved.push(l),
    };
  }

  it("records a matching dossier and covers the org", async () => {
    const d = deps(async () => dossier());
    const result = await runDeepDivePass(d, { missingConfig: [], execute: true });
    if (result.kind !== "executed") throw new Error(result.kind);
    expect(result.recorded).toBe(1);
    expect(d.saved).toHaveLength(1);
    expect(result.outcomes[0]).toMatchObject({
      kind: "recorded",
      run: { orgId: "C-2021", producedBy: "lead-enricher", ranAt: "2026-08-08" },
    });
  });

  it("leaves the org due — and the ledger untouched — when the dossier is about someone else", async () => {
    const d = deps(async () => dossier({ orgId: "C-2020" }));
    const result = await runDeepDivePass(d, { missingConfig: [], execute: true });
    if (result.kind !== "executed") throw new Error(result.kind);
    expect(result.recorded).toBe(0);
    expect(d.saved).toHaveLength(0);
    expect(result.outcomes[0]).toMatchObject({ kind: "not-recorded" });
    expect((result.outcomes[0] as { reason: string }).reason).toContain("is about C-2020");
  });

  it("hands dropped sources to the caller on a successful read", async () => {
    const onRead = vi.fn();
    const dive = makeDossierDive(
      async () => dossier({ sources: ["Scott said", "https://monarchnational.com/about"] }),
      onRead,
    );
    await dive(decision("C-2021"));
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onRead.mock.calls[0][1].droppedSources).toHaveLength(1);
  });

  it("does not call onRead for a refused dossier", async () => {
    const onRead = vi.fn();
    const dive = makeDossierDive(async () => dossier({ orgId: "C-2020" }), onRead);
    await expect(dive(decision("C-2021"))).rejects.toThrow("is about C-2020");
    expect(onRead).not.toHaveBeenCalled();
  });
});
