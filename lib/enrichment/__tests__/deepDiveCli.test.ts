import { describe, expect, it } from "vitest";
import { DEEP_DIVE_LEDGER_PATH, isCliRefusal, parseDeepDiveArgs } from "../deepDiveCli";
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
