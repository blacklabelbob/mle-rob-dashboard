import { describe, expect, it } from "vitest";
import {
  DEEP_DIVE_DOSSIER_DIR,
  DEEP_DIVE_LEDGER_PATH,
  dossierPath,
  isCliRefusal,
  parseDeepDiveArgs,
} from "../deepDiveCli";
import { recordRun, parseLedger } from "../deepDiveLedger";
import { deepDiveDecision, type DeepDiveOrg } from "../deepDiveDue";

const target: DeepDiveOrg = {
  id: "C-2021",
  name: "Monarch National",
  nodeType: "lead",
  relationship: "REFERRAL TARGET — NOT met, NOT contacted, gated on Omega going well",
  description: "x".repeat(1_316),
};

describe("parseDeepDiveArgs", () => {
  it("defaults to listing when given nothing", () => {
    expect(parseDeepDiveArgs([])).toEqual({ mode: "list", freshDays: undefined });
  });

  it("REFUSES --record without --by, in the operator's own terms", () => {
    const out = parseDeepDiveArgs(["--record", "C-2021"]);
    expect(isCliRefusal(out)).toBe(true);
    if (!isCliRefusal(out)) return;
    // The refusal must name the org it declined to write and WHY the producer matters — an
    // operator who reads "invalid input" adds `--by max` and the ledger stops meaning anything.
    expect(out.refusal).toContain("C-2021");
    expect(out.refusal).toContain("producer");
    expect(out.refusal).toContain("covered");
  });

  it("refuses a --record with no org id rather than recording against an empty one", () => {
    const out = parseDeepDiveArgs(["--record", "--by", "lead-enricher"]);
    expect(isCliRefusal(out)).toBe(true);
  });

  it("refuses --by / --on when nothing is being recorded", () => {
    expect(isCliRefusal(parseDeepDiveArgs(["--by", "lead-enricher"]))).toBe(true);
    expect(isCliRefusal(parseDeepDiveArgs(["--on", "2026-08-08"]))).toBe(true);
  });

  it("refuses a timestamp posing as a day, matching the ledger's own rule", () => {
    const out = parseDeepDiveArgs(["--record", "C-2021", "--by", "lead-enricher", "--on", "2026-08-08T12:00:00Z"]);
    expect(isCliRefusal(out)).toBe(true);
  });

  it("refuses unknown flags and bare words instead of ignoring them", () => {
    expect(isCliRefusal(parseDeepDiveArgs(["--recrod", "C-2021"]))).toBe(true);
    expect(isCliRefusal(parseDeepDiveArgs(["C-2021"]))).toBe(true);
  });

  it("refuses a --fresh-days that is not a positive number", () => {
    expect(isCliRefusal(parseDeepDiveArgs(["--fresh-days", "0"]))).toBe(true);
    expect(isCliRefusal(parseDeepDiveArgs(["--fresh-days", "soon"]))).toBe(true);
    expect(parseDeepDiveArgs(["--fresh-days", "30"])).toEqual({ mode: "list", freshDays: 30 });
  });

  it("carries a complete record through verbatim, and leaves the day to the shell when unsaid", () => {
    expect(parseDeepDiveArgs(["--record", "C-2021", "--by", "lead-enricher"])).toEqual({
      mode: "record",
      orgId: "C-2021",
      producedBy: "lead-enricher",
      ranAt: undefined,
      freshDays: undefined,
    });
    expect(parseDeepDiveArgs(["--record", "C-2021", "--by", "lead-enricher", "--on", "2026-08-01"])).toEqual({
      mode: "record",
      orgId: "C-2021",
      producedBy: "lead-enricher",
      ranAt: "2026-08-01",
      freshDays: undefined,
    });
  });
});

describe("the parse → record → verdict join the command actually performs", () => {
  it("a parsed --record moves the org off due-unattributed, and nothing else does", () => {
    expect(deepDiveDecision(target, { runs: [], asOf: "2026-08-08" }).verdict).toBe("due-unattributed");

    const parsed = parseDeepDiveArgs(["--record", "C-2021", "--by", "lead-enricher", "--on", "2026-08-08"]);
    expect(isCliRefusal(parsed)).toBe(false);
    if (isCliRefusal(parsed)) return;

    const written = recordRun(null, { orgId: parsed.orgId!, ranAt: parsed.ranAt!, producedBy: parsed.producedBy! });
    expect(written.outcome).toBe("appended");
    const { runs } = parseLedger(written.ledger);
    expect(deepDiveDecision(target, { runs, asOf: "2026-08-08" }).verdict).toBe("covered");
  });
});

describe("DEEP_DIVE_LEDGER_PATH", () => {
  it("is one shared constant so the script and its readers cannot drift to two files", () => {
    expect(DEEP_DIVE_LEDGER_PATH).toBe("data/enrichment/deep-dive-runs.json");
  });
});

// ---------------------------------------------------------------------------------------------
// Q87 inc.7 — `--pass` and the dossier path. The command line gains a SECOND writer, and the
// loader gains the one decision that can be dangerous: an org id from a prod table becoming a
// filesystem path.
// ---------------------------------------------------------------------------------------------

describe("parseDeepDiveArgs --pass", () => {
  it("PLANS on a bare --pass — spending a research budget is said out loud, never defaulted", () => {
    expect(parseDeepDiveArgs(["--pass"])).toEqual({
      mode: "pass",
      freshDays: undefined,
      execute: false,
      limit: undefined,
    });
  });

  it("dives only when --execute is typed", () => {
    expect(parseDeepDiveArgs(["--pass", "--execute"])).toEqual({
      mode: "pass",
      freshDays: undefined,
      execute: true,
      limit: undefined,
    });
  });

  it("refuses --pass together with --record — two writers, one ledger, no way to tell after", () => {
    const out = parseDeepDiveArgs(["--pass", "--record", "C-2021", "--by", "lead-enricher"]);
    expect(isCliRefusal(out)).toBe(true);
    if (!isCliRefusal(out)) return;
    expect(out.refusal).toContain("two different writers");
  });

  it("refuses --by with --pass, in the pass's own terms: it does not name producers", () => {
    const out = parseDeepDiveArgs(["--pass", "--by", "max"]);
    expect(isCliRefusal(out)).toBe(true);
    if (!isCliRefusal(out)) return;
    // The whole item turns on this. An operator who can type --by onto a pass has handed
    // themselves `covered` for four companies, which is inc.2's original defect automated.
    expect(out.refusal).toContain("NEVER names the producer");
  });

  it("refuses --execute / --limit when no pass is being run", () => {
    expect(isCliRefusal(parseDeepDiveArgs(["--execute"]))).toBe(true);
    expect(isCliRefusal(parseDeepDiveArgs(["--limit", "2"]))).toBe(true);
  });

  it("refuses a --limit that is not a positive whole number of orgs", () => {
    for (const bad of ["0", "-1", "1.5", "all", ""]) {
      expect(isCliRefusal(parseDeepDiveArgs(["--pass", "--limit", bad]))).toBe(true);
    }
    expect(parseDeepDiveArgs(["--pass", "--limit", "2"])).toMatchObject({ mode: "pass", limit: 2 });
  });

  it("refuses a value on --pass / --execute rather than swallowing it as an org id", () => {
    expect(isCliRefusal(parseDeepDiveArgs(["--pass", "C-2021"]))).toBe(true);
    expect(isCliRefusal(parseDeepDiveArgs(["--pass", "--execute", "yes"]))).toBe(true);
  });

  it("still carries --fresh-days through, so a pass ages runs the same way a list does", () => {
    expect(parseDeepDiveArgs(["--pass", "--fresh-days", "90"])).toMatchObject({ mode: "pass", freshDays: 90 });
  });
});

describe("dossierPath", () => {
  it("builds one file per org under the one dossier directory", () => {
    expect(dossierPath("C-2021")).toBe("data/enrichment/dossiers/C-2021.json");
    expect(DEEP_DIVE_DOSSIER_DIR).toBe("data/enrichment/dossiers");
  });

  it("REFUSES an org id that would escape the dossier directory", () => {
    // The id comes off a prod table and is about to become a path. `../../.env.local` is a read
    // of the service key wearing an org id's clothes.
    for (const evil of ["../../.env.local", "..", "C-2021/../../secrets", "/etc/passwd", "C-2021\\x"]) {
      const out = dossierPath(evil);
      expect(isCliRefusal(out)).toBe(true);
    }
  });

  it("refuses an empty id rather than reading the directory itself", () => {
    expect(isCliRefusal(dossierPath(""))).toBe(true);
    expect(isCliRefusal(dossierPath("   "))).toBe(true);
  });
});
