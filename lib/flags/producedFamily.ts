// Q84 inc.186 — the one entry in the registry that is not a key, but a CLAIM ABOUT A FUNCTION.
//
// inc.183 proved the six filers do not collide. inc.184 proved the six are all of them. inc.185
// proved each filer's declared keys are the keys it emits — for every emission site whose key it
// could resolve. Two sites it could not: `dedupeKey: key` in `wrapperClock.ts`, where `key` comes
// from `departureKey(name)` at runtime. Those are covered in the registry by ONE pattern:
//
//     keys: [CENSUS_REFUSAL_KEY, CENSUS_UNREADABLE_ROWS_KEY, `${departureKey("")}*`]
//
// That line is better than a hand-typed `"wrapper-census-departure:*"` — it calls the producing
// function instead of copying its output. But it is not a derivation, it is an ASSUMPTION with a
// function call inside it: that `departureKey` appends its argument, verbatim, at the very end,
// so probing it with the empty string yields exactly the family's fixed prefix.
//
// Nothing checks that assumption, and the failure is silent in the direction that matters. Change
// the producer to `wrapper-census-departure:${name}:v2` — a plausible edit — and the probe returns
// `wrapper-census-departure::v2`, so the registry advertises `wrapper-census-departure::v2*`, a
// family **no row will ever be filed under**. `measureNamespace` keeps reporting `partitioned`
// against that phantom, `findCrossFilerCollisions` compares the wrong prefix, and the keys prod is
// actually carrying belong to no filer at all. inc.185's declaration audit cannot catch it either:
// it already classifies both departure sites as UNJUDGED, so they are outside its pass by design.
//
// So this file turns the probe into a derivation that VERIFIES ITSELF. It asks the producer for
// several distinct names and requires each answer to be the prefix followed by that name and
// nothing else. When that holds, the `*` family has one source — the function — the way the
// literal keys do. When it does not, it REFUSES to emit a pattern rather than emit a confident
// wrong one, and the refusal names what it saw. PURE per CR-3: no clock, no network, no I/O; the
// only thing it touches is the function handed to it.

import { isPattern, type KeyPattern } from "./keyPattern";

/** A producer: takes the variable part of a key and returns the whole key. */
export type KeyProducer = (name: string) => string;

/** Either the family this producer files under, or why that could not be established. */
export type DerivedFamily =
  | { pattern: KeyPattern; prefix: string }
  | { refused: string };

/**
 * The names the producer is probed with.
 *
 * Fixed and explicit rather than random: a derivation that passes today and fails tomorrow on the
 * same unchanged function would be worse than no check at all. They are chosen to be hostile —
 * one that could pass through a slugifier unchanged, one with the separator the current producer
 * uses, one with regex metacharacters, one with a trailing space a `trim()` would eat, and one
 * long enough that a truncating producer gives itself away.
 */
export const FAMILY_PROBES = [
  "probe",
  "a:b",
  "a.*+?[]",
  "trailing ",
  "x".repeat(64),
] as const;

/**
 * Derive the `prefix*` family a producer files under, and prove it rather than assume it.
 *
 * The rule every probe must satisfy is `produce(name) === produce("") + name`. That is the exact
 * property the registry's `${departureKey("")}*` line silently depends on, stated once, where it
 * can fail loudly.
 *
 * Refuses — never guesses — when:
 *   - the empty probe yields an empty string, which would advertise the bare pattern `*` and
 *     overlap every key on the ledger, turning the collision check into a false alarm on all of it;
 *   - the prefix already ends in `*`, so `${prefix}*` would not mean what `fixedPrefix` reads;
 *   - any probe's output is not the prefix followed by that probe verbatim — the producer decorates,
 *     reorders, trims or transforms its argument, and one fixed prefix cannot describe its family.
 */
export function deriveKeyFamily(produce: KeyProducer): DerivedFamily {
  const prefix = produce("");
  if (prefix === "") {
    return { refused: `producer returned "" for the empty name — the family would be the bare "*", which overlaps every key on the ledger` };
  }
  if (isPattern(prefix)) {
    return { refused: `producer's fixed part "${prefix}" already ends in "*" — the derived family would not read as one pattern` };
  }
  for (const probe of FAMILY_PROBES) {
    const produced = produce(probe);
    const expected = `${prefix}${probe}`;
    if (produced !== expected) {
      return {
        refused: `producer does not append its argument verbatim: name ${JSON.stringify(probe)} produced ${JSON.stringify(produced)}, not ${JSON.stringify(expected)} — the family cannot be described by one fixed prefix`,
      };
    }
  }
  return { pattern: `${prefix}*`, prefix };
}

/**
 * The family pattern for a registry entry, or a thrown refusal.
 *
 * Throwing at module load is deliberate and is the same severity inc.184 and inc.185 chose: the
 * only way here is for the registry to be describing a family the producer no longer files under,
 * and a registry that is wrong about which keys exist is worse than one that will not load. It
 * fails while the person who changed the producer still has the diff open. `lib/flags` and the
 * reporter scripts are the only importers — no page renders through this.
 */
export function familyPattern(produce: KeyProducer, label: string): KeyPattern {
  const derived = deriveKeyFamily(produce);
  if ("refused" in derived) {
    throw new Error(`LEDGER_FILERS cannot derive the ${label} key family: ${derived.refused}`);
  }
  return derived.pattern;
}
