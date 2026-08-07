import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LEDGER_FILERS,
  MIRRORED_INTAKE_SILENCE_KEY,
  MIRRORED_KEY_DRIFT_KEY,
  MIRRORED_MIGRATION_BACKLOG_KEY,
  findCrossFilerCollisions,
  findSharedNamespaces,
  findUnnamespacedKeys,
  keyNamespace,
  keysOverlap,
  measureNamespace,
  type Filer,
} from "../keyNamespace";

const repoRoot = join(__dirname, "..", "..", "..");
const readScript = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

describe("keysOverlap", () => {
  it("treats two literals as overlapping only when identical", () => {
    expect(keysOverlap("a/b", "a/b")).toBe(true);
    expect(keysOverlap("a/b", "a/c")).toBe(false);
  });

  it("matches a literal against a pattern by prefix", () => {
    expect(keysOverlap("wrapper-census-departure:seed.sh", "wrapper-census-departure:*")).toBe(true);
    expect(keysOverlap("wrapper-census-unreadable", "wrapper-census-departure:*")).toBe(false);
  });

  it("overlaps two patterns when either prefix contains the other", () => {
    expect(keysOverlap("a-*", "a-b-*")).toBe(true);
    expect(keysOverlap("a-b-*", "a-c-*")).toBe(false);
  });
});

describe("keyNamespace", () => {
  it("returns the segment before the first slash", () => {
    expect(keyNamespace("meeting-archive/crm-gap")).toBe("meeting-archive");
    expect(keyNamespace("a/b/c")).toBe("a");
  });

  it("returns null when nothing separates the prefix from the name", () => {
    // The whole reason this is null: `-` is not a separator the ledger reads, so reporting
    // `wrapper-census-unreadable` as namespaced would claim a partition that does not exist.
    expect(keyNamespace("wrapper-census-unreadable")).toBeNull();
    expect(keyNamespace("unapplied-migrations")).toBeNull();
    expect(keyNamespace("wrapper-census-departure:seed.sh")).toBeNull();
  });

  it("returns null for a leading slash rather than an empty namespace", () => {
    expect(keyNamespace("/orphan")).toBeNull();
  });
});

describe("findCrossFilerCollisions", () => {
  it("reports two different filers that can emit the same key", () => {
    const filers: Filer[] = [
      { name: "one", source: "a.ts", keys: ["ns/shared"] },
      { name: "two", source: "b.ts", keys: ["ns/shared"] },
    ];
    const found = findCrossFilerCollisions(filers);
    expect(found).toHaveLength(1);
    expect(found[0].filers).toEqual(["one", "two"]);
  });

  it("catches a literal swallowed by another filer's pattern", () => {
    const filers: Filer[] = [
      { name: "gate", source: "a.ts", keys: ["census-departure:*"] },
      { name: "agent", source: "b.mjs", keys: ["census-departure:seed.sh"] },
    ];
    expect(findCrossFilerCollisions(filers)).toHaveLength(1);
  });

  it("does not report a filer against itself — that is inc.182's within-batch job", () => {
    const filers: Filer[] = [{ name: "one", source: "a.ts", keys: ["ns/k", "ns/k"] }];
    expect(findCrossFilerCollisions(filers)).toEqual([]);
  });
});

describe("findSharedNamespaces", () => {
  it("reports a namespace two filers write into, even with distinct keys", () => {
    const filers: Filer[] = [
      { name: "one", source: "a.ts", keys: ["meeting-archive/a"] },
      { name: "two", source: "b.ts", keys: ["meeting-archive/b"] },
    ];
    expect(findSharedNamespaces(filers)).toEqual([
      { namespace: "meeting-archive", filers: ["one", "two"] },
    ]);
  });

  it("stays quiet when each filer owns its own namespace", () => {
    const filers: Filer[] = [
      { name: "one", source: "a.ts", keys: ["one/a", "one/b"] },
      { name: "two", source: "b.ts", keys: ["two/a"] },
    ];
    expect(findSharedNamespaces(filers)).toEqual([]);
  });
});

describe("findUnnamespacedKeys", () => {
  it("names the key, not just the filer, so half-namespaced filers are readable", () => {
    const filers: Filer[] = [{ name: "one", source: "a.ts", keys: ["ns/named", "bare-key"] }];
    expect(findUnnamespacedKeys(filers)).toEqual([{ filer: "one", key: "bare-key" }]);
  });
});

describe("the live registry", () => {
  it("mirrors the .mjs literals that cannot be imported", () => {
    // A mirror nothing verifies is the two-copies disease. These three assertions are what make
    // the table in keyNamespace.ts one copy with a witness rather than a second source of truth.
    expect(readScript("scripts/migration-backlog.mjs")).toContain(
      `dedupeKey: "${MIRRORED_MIGRATION_BACKLOG_KEY}"`,
    );
    expect(readScript("scripts/fireflies-quota.mjs")).toContain(
      `dedupeKey: "${MIRRORED_INTAKE_SILENCE_KEY}"`,
    );
    expect(readScript("scripts/flag-key-drift.mjs")).toContain(
      `KEY_FLAG_KEY_DRIFT = "${MIRRORED_KEY_DRIFT_KEY}"`,
    );
  });

  it("has no two filers able to emit the same key", () => {
    // The defect this increment went looking for. Zero today — and this is the assertion that
    // turns "zero today" into "zero, or the build fails".
    expect(findCrossFilerCollisions(LEDGER_FILERS)).toEqual([]);
  });

  it("is NOT partitioned, and says so rather than claiming it is", () => {
    const report = measureNamespace(LEDGER_FILERS);
    expect(report.partitioned).toBe(false);

    // Independent processes in one namespace, separated only by the words they picked.
    // Q85 inc.9 added a THIRD — `meeting-archive/person-proposals` — which makes the point
    // sharper, not stale: the namespace keeps growing and nothing enforces the partition.
    expect(report.sharedNamespaces).toEqual([
      {
        namespace: "meeting-archive",
        filers: ["notion-crm-check.mjs", "meeting-archive pass", "notion-crm-check.mjs (people)"],
      },
    ]);

    // And five keys in the global space, where a hand-typed agent key lands (inc.103 #144/#145).
    expect(report.unnamespaced.map((u) => u.key).sort()).toEqual([
      "meeting-intake-silence",
      "unapplied-migrations",
      "wrapper-census-departure:*",
      "wrapper-census-unreadable",
      "wrapper-census-unreadable-rows",
    ]);
  });

  it("keeps the wrapper gate's two fixed keys clear of its departure pattern", () => {
    // wrapper-census-unreadable-rows is a longer string in the same flat space as
    // wrapper-census-unreadable — worth an explicit assertion, since one truncation of the
    // departure prefix would swallow both.
    const gate = LEDGER_FILERS.find((f) => f.name === "audit-wrapper-clocks.mjs")!;
    const [refusal, rows, departures] = gate.keys;
    expect(keysOverlap(refusal, departures)).toBe(false);
    expect(keysOverlap(rows, departures)).toBe(false);
    expect(keysOverlap(refusal, rows)).toBe(false);
  });
});
