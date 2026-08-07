// Q84 inc.183 — the choke point inc.182 built stops at the process boundary.
//
// inc.182 asserts every `dedupeKey` in ONE assembled batch appears once before that batch is
// POSTed. That is a within-process guarantee and it says nothing about the population it shares
// the ledger with: `audit-wrapper-clocks.mjs`, `notion-crm-check.mjs`, `flag-key-drift.mjs`,
// `migration-backlog.mjs` and the intake-silence pass each POST to the SAME `/api/admin/flags`
// on their own ticks, in their own processes, and nothing compares keys across them. The route's
// dedupe read is `eq("dedupe_key", key)` with no notion of who sent it — so if two filers ever
// emit the same string, the second one does not stack, it SUPERSEDES. One gate's finding
// overwrites another gate's finding and both gates report success.
//
// The question this file answers is narrow and was asked as a measurement, not a fix: is the key
// namespace actually PARTITIONED per filer, or does it merely happen not to collide today?
//
// MEASURED ANSWER, against the tree as it stands: **it merely happens not to collide.** Zero
// literal collisions, zero canonical collisions — and no partition either. Three conventions are
// live at once:
//
//   `ns/key`   meeting-archive/crm-gap, meeting-archive/needs-human-account, flag-ledger/key-drift
//   `ns-key`   wrapper-census-unreadable, wrapper-census-unreadable-rows, wrapper-census-departure:*
//   bare       unapplied-migrations, meeting-intake-silence
//
// and the `meeting-archive/` namespace is claimed by TWO independent filers — `crmGapFinding.ts`
// (run by notion-crm-check.mjs) and `archiveFinding.ts` (run by the archive pass). They differ
// only in the suffix each happened to choose. Nothing anywhere would have stopped them choosing
// the same one, and the two most recently added keys are bare strings in the global namespace
// where the next hand-typed agent key lands (inc.103's #144/#145 is that exact failure, within a
// single namespace instead of across two).
//
// So this file REPORTS the shape of the namespace and refuses to invent a partition. Renaming a
// live key to enforce one is not a measurement — it would orphan every prod row filed under the
// old spelling, which is the defect inc.103 declined to cause by pairing. Same contract as the
// rest of lib/flags: recognition is advisory, nothing here is wired into the POST route's read,
// and the worst a false positive costs is a line in a plan.

// The pattern shape primitives moved down to `keyPattern.ts` in inc.186 so the family derivation
// can use the same `isPattern` without importing this file back (the registry below calls that
// derivation at module load, and the cycle threw). Re-exported here: one definition, same imports.
import { fixedPrefix, isPattern, type KeyPattern } from "./keyPattern";
export { fixedPrefix, isPattern, type KeyPattern };

export type Filer = {
  /** How the filer identifies itself in a report — the process or module that owns the POST. */
  name: string;
  /** Where the keys are defined, so a reader can go read them. */
  source: string;
  /** Every key this filer can put on the ledger. `*` at the end means "any suffix". */
  keys: KeyPattern[];
};

/**
 * Two patterns overlap when at least one string satisfies both.
 *
 * Literal vs literal is equality. Literal vs pattern is a prefix test. Pattern vs pattern overlaps
 * when either prefix contains the other — `a-*` and `a-b-*` both produce `a-b-c`.
 */
export function keysOverlap(a: KeyPattern, b: KeyPattern): boolean {
  const pa = isPattern(a);
  const pb = isPattern(b);
  const fa = fixedPrefix(a);
  const fb = fixedPrefix(b);
  if (!pa && !pb) return fa === fb;
  if (pa && pb) return fa.startsWith(fb) || fb.startsWith(fa);
  return pa ? fb.startsWith(fa) : fa.startsWith(fb);
}

/**
 * A key's namespace: the segment before the first `/`.
 *
 * `null` for a key with no `/` at all — and that is the point of returning null rather than
 * guessing. `wrapper-census-unreadable` READS as namespaced and is not: nothing separates the
 * prefix from the name, so `wrapper-census-unreadable-rows` is not a second key inside a
 * namespace, it is a longer string in the same flat space. Treating `-` as a separator here
 * would report a partition that the ledger's exact-match read does not have.
 */
export function keyNamespace(key: KeyPattern): string | null {
  const slash = key.indexOf("/");
  if (slash <= 0) return null;
  return key.slice(0, slash);
}

export type CrossFilerCollision = {
  /** The two filers that can produce the same key, in the order given. */
  filers: [string, string];
  /** The two patterns that overlap. */
  keys: [KeyPattern, KeyPattern];
};

/**
 * Pairs of DIFFERENT filers that can put the same string on the ledger.
 *
 * This is the one finding here that is an outright defect rather than a shape: the route would
 * treat the second arrival as a correction of the first, so one gate's row disappears and neither
 * gate can tell. A filer overlapping ITSELF is inc.182's job (one batch, one key) and is not
 * repeated here.
 */
export function findCrossFilerCollisions(filers: Filer[]): CrossFilerCollision[] {
  const found: CrossFilerCollision[] = [];
  for (let i = 0; i < filers.length; i++) {
    for (let j = i + 1; j < filers.length; j++) {
      for (const a of filers[i].keys) {
        for (const b of filers[j].keys) {
          if (keysOverlap(a, b)) {
            found.push({ filers: [filers[i].name, filers[j].name], keys: [a, b] });
          }
        }
      }
    }
  }
  return found;
}

export type SharedNamespace = {
  namespace: string;
  /** The filers writing into it — always 2+, or it is partitioned. */
  filers: string[];
};

/**
 * Namespaces claimed by more than one filer.
 *
 * Not a collision — `meeting-archive/crm-gap` and `meeting-archive/needs-human-account` are two
 * distinct rows and always have been. It is the ABSENCE of the partition: the only thing keeping
 * these two independent processes apart is that they picked different words, and a reader looking
 * at `meeting-archive/*` on Rob's page cannot tell which gate owns a given row or which one to
 * go fix when it is wrong.
 */
export function findSharedNamespaces(filers: Filer[]): SharedNamespace[] {
  const byNamespace = new Map<string, Set<string>>();
  for (const filer of filers) {
    for (const key of filer.keys) {
      const ns = keyNamespace(key);
      if (!ns) continue;
      const bucket = byNamespace.get(ns);
      if (bucket) bucket.add(filer.name);
      else byNamespace.set(ns, new Set([filer.name]));
    }
  }
  return [...byNamespace]
    .filter(([, names]) => names.size > 1)
    .map(([namespace, names]) => ({ namespace, filers: [...names] }));
}

export type UnnamespacedKey = { filer: string; key: KeyPattern };

/**
 * Keys carrying no namespace separator at all — the global space.
 *
 * These are the ones a hand-typed agent key can land on without either side importing anything,
 * which is the mechanism behind prod #144/#145. Reported per key rather than per filer because
 * one filer can be half-namespaced, and naming the key is what a reader can act on.
 */
export function findUnnamespacedKeys(filers: Filer[]): UnnamespacedKey[] {
  const bare: UnnamespacedKey[] = [];
  for (const filer of filers) {
    for (const key of filer.keys) {
      if (keyNamespace(key) === null) bare.push({ filer: filer.name, key });
    }
  }
  return bare;
}

export type NamespaceReport = {
  filers: Filer[];
  collisions: CrossFilerCollision[];
  sharedNamespaces: SharedNamespace[];
  unnamespaced: UnnamespacedKey[];
  /** True only when every filer's keys are its own AND every key is namespaced. */
  partitioned: boolean;
};

/** The whole shape in one pass, for a reporter to print. */
export function measureNamespace(filers: Filer[]): NamespaceReport {
  const collisions = findCrossFilerCollisions(filers);
  const sharedNamespaces = findSharedNamespaces(filers);
  const unnamespaced = findUnnamespacedKeys(filers);
  return {
    filers,
    collisions,
    sharedNamespaces,
    unnamespaced,
    partitioned:
      collisions.length === 0 && sharedNamespaces.length === 0 && unnamespaced.length === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The live registry.
//
// The `.ts` keys are IMPORTED, not retyped, so this table cannot drift from the constants it
// describes — a rename breaks the build here. The three `.mjs` filers export nothing importable
// from a TS module, so their keys are mirrored as literals AND the mirror is checked against the
// script source by keyNamespace.test.ts. A mirror nothing verifies is exactly the two-copies
// disease inc.164 named; the test is what makes this one copy with a witness.

import { KEY_CRM_GAP } from "../meetings/crmGapFinding";
import { KEY_NEEDS_HUMAN_ACCOUNT } from "../meetings/archiveFinding";
import { KEY_PERSON_PROPOSALS } from "../meetings/personFinding";
import { CENSUS_REFUSAL_KEY, CENSUS_UNREADABLE_ROWS_KEY, departureKey } from "../integrity/wrapperClock";
import { familyPattern } from "./producedFamily";

/**
 * Q84 inc.186 — the departure family, DERIVED from its producer and checked, not probed and
 * trusted. This was `` `${departureKey("")}*` ``, which quietly assumed the producer appends its
 * argument verbatim at the end; `familyPattern` states that assumption and refuses to load rather
 * than advertise a family no row is filed under. See lib/flags/producedFamily.ts.
 */
export const DEPARTURE_FAMILY = familyPattern(departureKey, "wrapper-census departure");

/** Mirrored from scripts/migration-backlog.mjs — asserted still current by the test. */
export const MIRRORED_MIGRATION_BACKLOG_KEY = "unapplied-migrations";
/** Mirrored from scripts/fireflies-quota.mjs — asserted still current by the test. */
export const MIRRORED_INTAKE_SILENCE_KEY = "meeting-intake-silence";
/** Mirrored from scripts/flag-key-drift.mjs — asserted still current by the test. */
export const MIRRORED_KEY_DRIFT_KEY = "flag-ledger/key-drift";

export const LEDGER_FILERS: Filer[] = [
  {
    name: "audit-wrapper-clocks.mjs",
    source: "lib/integrity/wrapperClock.ts",
    keys: [CENSUS_REFUSAL_KEY, CENSUS_UNREADABLE_ROWS_KEY, DEPARTURE_FAMILY],
  },
  {
    name: "notion-crm-check.mjs",
    source: "lib/meetings/crmGapFinding.ts",
    keys: [KEY_CRM_GAP],
  },
  {
    name: "meeting-archive pass",
    source: "lib/meetings/archiveFinding.ts",
    keys: [KEY_NEEDS_HUMAN_ACCOUNT],
  },
  {
    // Q85 inc.9 — the PEOPLE half of the same script. Registered as its own filer rather than
    // folded into the `notion-crm-check.mjs` row above, because the census keys on the SOURCE
    // file that emits the constant, and this key lives in its own module.
    name: "notion-crm-check.mjs (people)",
    source: "lib/meetings/personFinding.ts",
    keys: [KEY_PERSON_PROPOSALS],
  },
  {
    name: "flag-key-drift.mjs",
    source: "scripts/flag-key-drift.mjs",
    keys: [MIRRORED_KEY_DRIFT_KEY],
  },
  {
    name: "migration-backlog.mjs",
    source: "scripts/migration-backlog.mjs",
    keys: [MIRRORED_MIGRATION_BACKLOG_KEY],
  },
  {
    name: "fireflies-quota.mjs",
    source: "scripts/fireflies-quota.mjs",
    keys: [MIRRORED_INTAKE_SILENCE_KEY],
  },
];
