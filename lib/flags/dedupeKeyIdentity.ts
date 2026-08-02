// Q84 inc.103 — the answer to inc.101's second half: **a producer-owned constant fixes
// only the half of the population that imports anything.**
//
// The evidence is prod rows #144 and #145, both filed on C-2010, both saying the same
// thing — the org's one spare host slot is spent on a duplicate:
//
//     #144  dedupe_key: "org-hosts/duplicate-slot-C-2010"
//     #145  dedupe_key: "org-host/C-2010-duplicate-slot"
//
// One letter and a word order apart, so `eq("dedupe_key", key)` in the POST route read
// nothing and the second finding INSERTED. That is inc.8's stacking bug arriving through
// a door inc.8 did not close: inc.8 stopped a re-run from contradicting itself, on the
// assumption that a re-run sends back the same bytes. A code producer does — `KEY_CRM_GAP`
// in lib/meetings/crmGapFinding.ts and `KEY_NEEDS_HUMAN_ACCOUNT` in archiveFinding.ts are
// module constants, and prod #133/#134 have never drifted. Neither of these two rows came
// from a module. They were POSTed by an agent following the findings protocol, typing the
// key by hand at the call site, twice, from memory. No constant is importable there.
//
// So the enforceable thing at this end is not a registry but a **canonical identity**: the
// shape of the key with the drift taken out, so that two hand-typed spellings of the same
// finding can be RECOGNISED as one — separately from what the ledger stores.
//
// Deliberately NOT wired into the POST route's dedupe read. Making this the identity the
// route matches on would silently supersede one of two live prod rows the moment it shipped,
// on a similarity judgement rather than on the caller's stated key. Recognition is reported
// (scripts/flag-key-drift.mjs, plan-by-default); the stored key stays exactly what the
// producer sent. A false pairing then costs a line in a plan, never a resolved row.

/** A key's identity with call-site drift removed: case, separators, word order, plurals. */
export function canonicalDedupeKey(key: string | null | undefined): string | null {
  if (typeof key !== "string") return null;
  const tokens = key
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singularize)
    .sort();
  return tokens.length ? tokens.join("-") : null;
}

// "hosts" → "host" (the exact drift in #144 vs #145). Left alone when stripping the `s`
// would leave a stub ("crm", "gap") or when the word already ends in `ss` ("address").
function singularize(token: string): string {
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

/** Two keys name the same finding if their canonical identities match and both are real. */
export function sameFinding(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonicalDedupeKey(a);
  const cb = canonicalDedupeKey(b);
  return ca !== null && ca === cb;
}

export type KeyedRow = { id: number; dedupeKey: string | null | undefined };

export type DriftGroup = {
  /** The shared canonical identity. */
  identity: string;
  /** The rows that landed on it, in the order given. */
  rows: KeyedRow[];
  /** The distinct literal keys those rows carry — always 2+, or this is not drift. */
  spellings: string[];
};

/**
 * Rows whose keys are one identity spelled more than one way — the population that the
 * route's exact-match read can never join. A row with no key at all is not drift: it is
 * the older, louder problem (`dedupe_key: null` stacks unconditionally) and is reported
 * by its own count rather than folded in here where it would look like a spelling.
 */
export function findKeyDrift(rows: KeyedRow[]): DriftGroup[] {
  const byIdentity = new Map<string, KeyedRow[]>();
  for (const row of rows) {
    const identity = canonicalDedupeKey(row.dedupeKey);
    if (!identity) continue;
    const bucket = byIdentity.get(identity);
    if (bucket) bucket.push(row);
    else byIdentity.set(identity, [row]);
  }
  const groups: DriftGroup[] = [];
  for (const [identity, bucket] of byIdentity) {
    const spellings = [...new Set(bucket.map((r) => (r.dedupeKey as string).trim()))];
    // One spelling on many rows is the mechanism working (or a pre-inc.8 row); only a
    // second spelling means the ledger holds one finding it cannot see as one.
    if (spellings.length > 1) groups.push({ identity, rows: bucket, spellings });
  }
  return groups;
}
