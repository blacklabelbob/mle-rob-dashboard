import { describe, it, expect } from "vitest";
import { parseLedger, recordRun, serializeLedger, type LedgerFile } from "../deepDiveLedger";
import { deepDiveDecision, type DeepDiveOrg } from "../deepDiveDue";

/**
 * The gate string C-2020…C-2023 actually carry in prod (copied from the inc.2 suite, which copied
 * it from the 2026-08-05 run). A ledger test that proved things about a phrasing prod does not
 * use would prove nothing about prod.
 */
const REAL_GATE =
  "REFERRAL TARGET — NOT MET, NOT CONTACTED, NOT OWNED BY OMEGA. Named by Scott Dascani (P-1023) during the 7/28 Omega meeting; gated on Omega going well.";

const monarch = (): DeepDiveOrg => ({
  id: "C-2021",
  name: "Monarch National Insurance Company",
  nodeType: "lead",
  relationship: REAL_GATE,
  description: "x".repeat(1051),
  notes: "y".repeat(265),
  keyDates: {},
});

describe("parseLedger — refuses out loud instead of dropping quietly", () => {
  it("reads a well-formed file", () => {
    const { runs, rejected } = parseLedger({
      version: 1,
      runs: [{ orgId: "C-2021", ranAt: "2026-08-08", producedBy: "lead-enricher" }],
    });
    expect(rejected).toEqual([]);
    expect(runs).toEqual([{ orgId: "C-2021", ranAt: "2026-08-08", producedBy: "lead-enricher" }]);
  });

  it("accepts a bare array too — the file is allowed to be just its rows", () => {
    const { runs } = parseLedger([{ orgId: "C-2020", ranAt: "2026-08-08", producedBy: "lead-enricher" }]);
    expect(runs).toHaveLength(1);
  });

  it("rejects a run with no producer, and SAYS which row and why", () => {
    const { runs, rejected } = parseLedger({ version: 1, runs: [{ orgId: "C-2021", ranAt: "2026-08-08" }] });
    expect(runs).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].index).toBe(0);
    expect(rejected[0].reason).toMatch(/producedBy/);
  });

  it("rejects a timestamp masquerading as a day rather than half-reading it", () => {
    const { runs, rejected } = parseLedger([
      { orgId: "C-2022", ranAt: "2026-08-08T14:03:00Z", producedBy: "lead-enricher" },
    ]);
    expect(runs).toEqual([]);
    expect(rejected[0].reason).toMatch(/ISO day/);
  });

  it("keeps the good rows AND the bad ones from the same file", () => {
    const { runs, rejected } = parseLedger([
      { orgId: "C-2021", ranAt: "2026-08-08", producedBy: "lead-enricher" },
      { orgId: "", ranAt: "2026-08-08", producedBy: "lead-enricher" },
    ]);
    expect(runs).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/orgId/);
  });

  it("a garbage file is a named rejection, not a thrown driver", () => {
    const { runs, rejected } = parseLedger("not a ledger");
    expect(runs).toEqual([]);
    expect(rejected[0].reason).toMatch(/neither an array/);
  });
});

describe("recordRun — append-only", () => {
  it("appends a first run", () => {
    const r = recordRun(null, { orgId: "C-2021", ranAt: "2026-08-08", producedBy: "lead-enricher" });
    expect(r.outcome).toBe("appended");
    expect(r.ledger.runs).toHaveLength(1);
  });

  it("is a no-op on a byte-identical re-run — a driver twice in one day does not stack", () => {
    const first = recordRun(null, { orgId: "C-2021", ranAt: "2026-08-08", producedBy: "lead-enricher" });
    const second = recordRun(first.ledger, { orgId: "C-2021", ranAt: "2026-08-08", producedBy: "lead-enricher" });
    expect(second.outcome).toBe("duplicate");
    expect(second.ledger.runs).toHaveLength(1);
  });

  it("DOES append a different producer on the same day — two passes happened", () => {
    const first = recordRun(null, { orgId: "C-2021", ranAt: "2026-08-08", producedBy: "lead-enricher" });
    const second = recordRun(first.ledger, { orgId: "C-2021", ranAt: "2026-08-08", producedBy: "company-catcher" });
    expect(second.outcome).toBe("appended");
    expect(second.ledger.runs).toHaveLength(2);
  });

  it("never edits or drops history — an older run survives a newer one", () => {
    const first = recordRun(null, { orgId: "C-2021", ranAt: "2026-05-01", producedBy: "lead-enricher" });
    const second = recordRun(first.ledger, { orgId: "C-2021", ranAt: "2026-08-08", producedBy: "lead-enricher" });
    expect(second.ledger.runs).toHaveLength(2);
  });

  it("refuses to write a run the file's own reader would later reject", () => {
    expect(() => recordRun(null, { orgId: "C-2021", ranAt: "2026-08-08", producedBy: "  " })).toThrow(/producedBy/);
  });

  it("carries forward bad rows already in the file instead of laundering them", () => {
    const dirty = { version: 1, runs: [{ orgId: "C-2021", ranAt: "yesterday", producedBy: "x" }] } as unknown as LedgerFile;
    const r = recordRun(dirty, { orgId: "C-2020", ranAt: "2026-08-08", producedBy: "lead-enricher" });
    expect(r.rejected).toHaveLength(1);
    expect(r.ledger.runs).toHaveLength(1);
  });
});

describe("the ledger is the ONLY thing that can move inc.2's verdict", () => {
  it("an unattributed target becomes covered once — and only once — a run is on file", () => {
    const before = deepDiveDecision(monarch(), { asOf: "2026-08-08" });
    expect(before.verdict).toBe("due-unattributed");

    const { ledger } = recordRun(null, { orgId: "C-2021", ranAt: "2026-08-08", producedBy: "lead-enricher" });
    const after = deepDiveDecision(monarch(), {
      runs: parseLedger(ledger).runs,
      asOf: "2026-08-08",
      freshDays: 90,
    });
    expect(after.verdict).toBe("covered");
    expect(after.lastRun?.producedBy).toBe("lead-enricher");
  });

  it("a REJECTED row cannot buy `covered` — the whole point of refusing out loud", () => {
    const dirty = [{ orgId: "C-2021", ranAt: "2026-08-08" }]; // no producedBy
    const decision = deepDiveDecision(monarch(), { runs: parseLedger(dirty).runs, asOf: "2026-08-08" });
    expect(decision.verdict).toBe("due-unattributed");
  });

  it("a run recorded against another org does not cover this one", () => {
    const { ledger } = recordRun(null, { orgId: "C-2023", ranAt: "2026-08-08", producedBy: "lead-enricher" });
    const decision = deepDiveDecision(monarch(), { runs: parseLedger(ledger).runs, asOf: "2026-08-08" });
    expect(decision.verdict).toBe("due-unattributed");
  });
});

describe("serializeLedger", () => {
  it("sorts stably so a diff shows the new run, not a reshuffle", () => {
    const a = recordRun(null, { orgId: "C-2023", ranAt: "2026-08-08", producedBy: "lead-enricher" });
    const b = recordRun(a.ledger, { orgId: "C-2020", ranAt: "2026-05-01", producedBy: "lead-enricher" });
    const out = serializeLedger(b.ledger);
    expect(out.indexOf("C-2020")).toBeLessThan(out.indexOf("C-2023"));
    expect(out.endsWith("\n")).toBe(true);
  });
});
