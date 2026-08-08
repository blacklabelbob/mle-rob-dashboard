import { describe, expect, it } from "vitest";

import {
  auditVerificationClaims,
  classifyCommand,
  formatVerifiedLine,
  makeReceipt,
  parseRcClaims,
  type VerifyReceipt,
} from "../verifyReceipt";

const receipt = (over: Partial<VerifyReceipt> = {}): VerifyReceipt =>
  makeReceipt({
    command: "npx vitest run",
    rc: 0,
    startedAt: "2026-08-08T10:00:00.000Z",
    finishedAt: "2026-08-08T10:04:00.000Z",
    ...over,
  });

describe("classifyCommand", () => {
  it("names the check a command IS", () => {
    expect(classifyCommand("npx vitest run")).toBe("vitest");
    expect(classifyCommand("STORAGE_SOURCE=file npm run build")).toBe("build");
    expect(classifyCommand("npx tsc --noEmit")).toBe("typecheck");
    expect(classifyCommand("npm run worklist:q84")).toBe("other");
  });

  it("survives the flags a real run carries", () => {
    expect(classifyCommand("npx vitest run --silent lib/meetings")).toBe("vitest");
  });

  // Found by the two-claim audit test below: a claim's context window reaches
  // back over the PREVIOUS command, so first-listed-wins hands the build claim
  // to the vitest receipt. Nearest command wins, always.
  it("takes the nearest command, not the first one it recognises", () => {
    expect(
      classifyCommand("`npx vitest run` → rc=0. `STORAGE_SOURCE=file npm run build` → "),
    ).toBe("build");
    expect(
      classifyCommand("`npm run build` → rc=0. `npx vitest run` → "),
    ).toBe("vitest");
  });
});

describe("formatVerifiedLine", () => {
  it("emits the line when a run was observed", () => {
    expect(formatVerifiedLine(receipt())).toBe(
      "MEASURED `npx vitest run` → rc=0 (vitest, finished 2026-08-08T10:04:00.000Z)",
    );
  });

  it("says rc=1 as readily as rc=0 — it reports, it does not approve", () => {
    expect(formatVerifiedLine(receipt({ rc: 1 }))).toContain("rc=1");
  });

  // The #47/#48 generator: a paragraph written for a run that never happened.
  it("refuses an rc that is not an integer measurement", () => {
    expect(() =>
      formatVerifiedLine(receipt({ rc: undefined as unknown as number })),
    ).toThrow(/must be an integer measured/);
    expect(() => formatVerifiedLine(receipt({ rc: 0.5 }))).toThrow(
      /must be an integer measured/,
    );
  });

  it("refuses a receipt with no run behind it", () => {
    expect(() => formatVerifiedLine(receipt({ finishedAt: "" }))).toThrow(
      /did not observe a run/,
    );
    expect(() =>
      formatVerifiedLine(receipt({ finishedAt: "2026-08-08T09:00:00.000Z" })),
    ).toThrow(/did not come from a run/);
  });

  it("refuses an empty command", () => {
    expect(() => formatVerifiedLine(receipt({ command: "   " }))).toThrow(
      /empty command/,
    );
  });
});

describe("parseRcClaims", () => {
  it("reads the tool out of the words before the claim", () => {
    const claims = parseRcClaims("`npx vitest run` → 323 files / 5,506 tests, rc=0");
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ rc: 0, tool: "vitest" });
  });

  it("catches the phrasings these rows actually use", () => {
    const claims = parseRcClaims(
      "`STORAGE_SOURCE=file npm run build` → exit 0, 0 error TS; and `npx vitest run` exit code 0",
    );
    expect(claims.map((c) => c.tool)).toEqual(["build", "vitest"]);
  });

  it("does not read a comma-thousands test count as an exit code", () => {
    expect(parseRcClaims("323 files / 5,506 tests")).toHaveLength(0);
  });
});

describe("auditVerificationClaims", () => {
  const prose = "`npx vitest run` → rc=0. `STORAGE_SOURCE=file npm run build` → rc=0.";

  it("backs a claim only when a receipt from this run agrees", () => {
    const audit = auditVerificationClaims(prose, [
      receipt(),
      receipt({ command: "npm run build" }),
    ]);
    expect(audit.unbacked).toHaveLength(0);
    expect(audit.backed).toHaveLength(2);
  });

  // inc.27's exact shape: the paragraph exists, the run does not.
  it("fails the claim an increment wrote before it ran anything", () => {
    const audit = auditVerificationClaims(prose, []);
    expect(audit.unbacked.map((c) => c.tool)).toEqual(["vitest", "build"]);
  });

  // #47's exact shape: vitest was red, the wrapper reported tail's success.
  it("fails a green claim when the receipt measured red", () => {
    const audit = auditVerificationClaims("`npx vitest run` → rc=0", [
      receipt({ rc: 1 }),
    ]);
    expect(audit.unbacked).toHaveLength(1);
    expect(audit.backed).toHaveLength(0);
  });

  it("does not let one tool's receipt vouch for another's claim", () => {
    const audit = auditVerificationClaims("`npm run build` → rc=0", [receipt()]);
    expect(audit.unbacked.map((c) => c.tool)).toEqual(["build"]);
  });

  it("reports an unattributable claim instead of silently dropping it", () => {
    const audit = auditVerificationClaims("the script returned rc=0", []);
    expect(audit.unbacked).toHaveLength(0);
    expect(audit.unattributed).toHaveLength(1);
  });
});
