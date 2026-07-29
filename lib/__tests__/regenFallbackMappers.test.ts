// Q71 inc.21 — `scripts/regen-fallback.mjs` maps Supabase rows with the STORE's
// mappers, never with a copy of them.
//
// It carried a copy for months, under a header promising it "mirrors
// lib/storage/supabaseStore.ts toPerson/toProject exactly". It did not: the copy
// was missing `legacySlug`, `orgId`, `phase2Estimate` and `equity` — four
// columns the real store reads — so `npm run seed:local` produced a local mirror
// in which nobody worked anywhere (12 org links dropped), no equity split
// existed and the Phase 2 ROI inputs were blank. Nothing failed. The overlay was
// well-formed, the counts matched, and the missing fields simply read as
// `undefined` the way an empty column does.
//
// That is the failure mode of every copy, so this suite pins the ABSENCE of one
// rather than the agreement of two (`seedLocalCrmMappers.test.ts` does the
// latter for the CRM half, and only because that script still copies). A test
// that asserts two mappers agree passes the moment someone adds a column to one
// and a matching line to the other; a test that asserts there is only one mapper
// cannot be satisfied that way.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as store from "../storage/supabaseStore";

const ROOT = join(__dirname, "..", "..");
const SCRIPT = readFileSync(join(ROOT, "scripts", "regen-fallback.mjs"), "utf8");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

/** Row mappers this script must not own. */
const MAPPERS = ["toPerson", "toOrgPerson", "toEdge", "toProject"] as const;

/**
 * Names the source DEFINES (as opposed to imports): `const x = `, `function x(`,
 * `let x = `. Deliberately blind to what the definition does — a local
 * `const toPerson = (r) => ({…})` is the defect whether or not it happens to
 * agree with the store today.
 */
export function localDefinitions(source: string): string[] {
  const found = [
    ...source.matchAll(
      /^\s*(?:export\s+)?(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm
    ),
  ].map((m) => m[1]);
  return [...new Set(found)].sort();
}

/** Named bindings the source imports from `spec`. */
export function importedFrom(source: string, spec: string): string[] {
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"${spec}"`);
  const m = source.match(re);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim().split(/\s+as\s+/)[0])
    .filter(Boolean)
    .sort();
}

describe("regen-fallback uses the store's mappers, not a copy", () => {
  it("imports all four mappers from lib/storage/supabaseStore", () => {
    expect(importedFrom(SCRIPT, "../lib/storage/supabaseStore")).toEqual(
      [...MAPPERS].sort()
    );
  });

  it("defines none of them locally", () => {
    const defined = localDefinitions(SCRIPT);
    // Non-vacuity: the parser must actually see this file's real declarations,
    // or "defines no mapper" would be true of an unreadable file too.
    expect(defined).toContain("allOrgs");
    expect(defined.length).toBeGreaterThan(4);
    for (const name of MAPPERS) expect(defined).not.toContain(name);
  });

  it("the store really exports all four (so the import cannot be decorative)", () => {
    for (const name of MAPPERS) {
      expect(typeof (store as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("seed:local runs the script under the ts-loader", () => {
    // Without `--import ./scripts/ts-loader.mjs` the .ts import is unresolvable
    // and the script dies on line 1 — so this is not style, it is the thing that
    // makes the import above work at all.
    expect(PKG.scripts["seed:local"]).toContain("--import ./scripts/ts-loader.mjs");
    expect(PKG.scripts["seed:local"]).toContain("scripts/regen-fallback.mjs");
  });

  it("toPerson carries the four fields the copy had lost", () => {
    const person = store.toPerson({
      id: "p-1",
      name: "Fixture",
      vertical_id: "v-1",
      status: "lead",
      signed: false,
      phase_one: false,
      legacy_slug: "fixture-slug",
      org_id: "o-1",
      phase2_estimate: { monthlyValue: 100 },
      equity: { split: "35/65" },
    });
    expect(person.legacySlug).toBe("fixture-slug");
    expect(person.orgId).toBe("o-1");
    expect(person.phase2Estimate).toEqual({ monthlyValue: 100 });
    expect(person.equity).toEqual({ split: "35/65" });
  });
});
