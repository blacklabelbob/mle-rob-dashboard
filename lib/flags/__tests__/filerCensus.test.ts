import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  censusFilers,
  censusLines,
  findEmissionSites,
  isRowRead,
  isTypeAnnotation,
  scanTree,
  type EmissionSite,
  type TreeReader,
} from "../filerCensus";
import { LEDGER_FILERS } from "../keyNamespace";

const repoRoot = join(__dirname, "..", "..", "..");

/** The same reader shape `flag-key-drift.mjs` builds, so both walk the tree by one policy. */
const fsReader: TreeReader = {
  list: (dir) =>
    readdirSync(join(repoRoot, dir), { withFileTypes: true }).map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    })),
  read: (path) => readFileSync(join(repoRoot, path), "utf8"),
};

const scanRepo = () => scanTree(fsReader);

describe("isTypeAnnotation", () => {
  it("recognises a declared shape rather than an emitted key", () => {
    expect(isTypeAnnotation("string;")).toBe(true);
    expect(isTypeAnnotation("string | null | undefined,")).toBe(true);
    expect(isTypeAnnotation("string}")).toBe(true);
  });

  it("does not swallow a key that merely looks like a word", () => {
    expect(isTypeAnnotation("KEY_CRM_GAP,")).toBe(false);
    expect(isTypeAnnotation('"meeting-intake-silence",')).toBe(false);
    expect(isTypeAnnotation("key,")).toBe(false);
  });
});

describe("isRowRead", () => {
  it("separates normalising a fetched column from minting a key", () => {
    expect(isRowRead("f.dedupe_key ?? f.dedupeKey,")).toBe(true);
    expect(isRowRead("KEY_FLAG_KEY_DRIFT,")).toBe(false);
  });
});

describe("findEmissionSites", () => {
  it("reports the line and the value verbatim", () => {
    const text = ["const a = 1;", "  dedupeKey: KEY_CRM_GAP,"].join("\n");
    expect(findEmissionSites("lib/x.ts", text)).toEqual([
      { path: "lib/x.ts", line: 2, value: "KEY_CRM_GAP," },
    ]);
  });

  it("ignores prose about a key", () => {
    const text = ["// dedupeKey: meeting-archive/crm-gap is the one #133 lost", " * dedupeKey: x"].join("\n");
    expect(findEmissionSites("lib/x.ts", text)).toEqual([]);
  });

  it("ignores a declared field and a read-back", () => {
    const text = ["  dedupeKey: string;", "  dedupeKey: f.dedupe_key ?? null,"].join("\n");
    expect(findEmissionSites("lib/x.ts", text)).toEqual([]);
  });
});

describe("censusFilers", () => {
  const site = (path: string, line = 1): EmissionSite => ({ path, line, value: "K," });

  it("is complete when the tree and the table agree", () => {
    const census = censusFilers([site("lib/a.ts")], [{ name: "a", source: "lib/a.ts" }]);
    expect(census.complete).toBe(true);
    expect(censusLines(census)).toEqual([]);
  });

  it("reports a file that emits and is claimed by nobody", () => {
    const census = censusFilers(
      [site("lib/a.ts"), site("lib/seventh.ts", 40), site("lib/seventh.ts", 44)],
      [{ name: "a", source: "lib/a.ts" }],
    );
    expect(census.unregistered).toEqual([
      { path: "lib/seventh.ts", sites: [site("lib/seventh.ts", 40), site("lib/seventh.ts", 44)] },
    ]);
    expect(census.complete).toBe(false);
    // One finding for the file, not one per line — the fix is a single registry entry.
    expect(censusLines(census)).toEqual([
      "UNREGISTERED FILER: lib/seventh.ts emits a dedupeKey (line 40, 44) and is in no LEDGER_FILERS entry — the namespace report cannot see it.",
    ]);
  });

  it("reports a registry entry whose source has stopped emitting", () => {
    const census = censusFilers([], [{ name: "ghost", source: "lib/gone.ts" }]);
    expect(census.sourceless).toEqual([{ name: "ghost", source: "lib/gone.ts" }]);
    expect(censusLines(census)[0]).toContain("SOURCELESS ENTRY");
  });
});

describe("the live tree", () => {
  // This is the assertion the file exists for. It fails the day a seventh filer is added without
  // a LEDGER_FILERS entry — before that filer's first key ever reaches prod, and while the person
  // who added it is still looking at the diff.
  it("registers every source that emits a dedupe key", () => {
    const census = censusFilers(scanRepo(), LEDGER_FILERS);
    expect(censusLines(census)).toEqual([]);
    expect(census.complete).toBe(true);
  });

  it("finds the seven filers the namespace report measures", () => {
    const emitting = new Set(scanRepo().map((s) => s.path));
    expect([...emitting].sort()).toEqual(LEDGER_FILERS.map((f) => f.source).sort());
  });
});
