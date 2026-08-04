/**
 * Q84 inc.166 — asking the ledger for the keys you track instead of the whole ledger.
 *
 * THE MEASUREMENT THAT MOTIVATED THIS, TAKEN BEFORE THE CODE. Prod `flags` holds **144 rows**
 * (PostgREST `count=exact`) and `GET /api/admin/flags` returned **144** — nothing is truncated
 * today, so inc.165's short-read harm is not currently live. What could not be measured from
 * outside is the CAP: no table in this project exceeds it, so its value is unknown rather than
 * "unlimited". That is the whole argument for narrowing — a read bounded by the keys the caller
 * tracks (10 distinct `dedupe_key` on prod, a handful of them this gate's) cannot hit a cap
 * whose value nobody knows, and stops depending on the ledger staying small.
 *
 * NOT A REPLACEMENT FOR inc.165'S SYMMETRY. A narrowed read still proves nothing by absence: a
 * key missing from it still closes nothing and reopens nothing. This removes a CAUSE of short
 * reads; the rule that survives one is kept exactly as it is.
 *
 * FORWARD- AND BACKWARD-SAFE BY CONSTRUCTION. A deployment that predates the `keys` param
 * ignores it and answers with the whole ledger — a superset of what was asked for, which every
 * caller here already handles. So the script may narrow its asks before the route ships, and the
 * route may ship before any caller narrows.
 *
 * PURE per CR-3 — no network, no clock, no `process.env`.
 */

/** The query param the ledger read narrows on. One spelling, both sides. */
export const LEDGER_KEYS_PARAM = "keys";

/**
 * Q84 inc.167 — what a key list actually asks for, decided ONCE.
 *
 * inc.166 made the narrowing correct but left the un-narrowed read INDISTINGUISHABLE from a
 * narrowed one at the call site: hand `ledgerReadUrl` a forgotten, empty key list and it silently
 * reads the whole ledger, which is the pre-inc.166 behaviour with none of the pre-inc.166 intent.
 * `narrowed` is that distinction made observable, so a caller can refuse the implicit read and say
 * so out loud, and so the URL builder and the caller cannot drift apart about what "empty" means —
 * the two-copies disease inc.164 collapsed once already.
 *
 * PURE per CR-3, and it decides nothing about POLICY: whether an un-narrowed read is acceptable is
 * the caller's call. This only reports which one it is about to do.
 */
export function ledgerReadPlan(keys: readonly string[] = []): {
  keys: string[];
  narrowed: boolean;
  unaskable: string[];
} {
  const wanted = [...new Set(keys.filter((k) => typeof k === "string" && k.length > 0))];
  const askable = wanted.filter(keySurvivesTransport);
  return {
    keys: askable,
    narrowed: askable.length > 0,
    unaskable: wanted.filter((k) => !keySurvivesTransport(k)),
  };
}

/**
 * Q84 inc.168 — does the key this gate FILED come back as the key the ledger was ASKED about?
 *
 * inc.167 asked whether a filed row and a read key are provably the same string. They are not, and
 * the counter-example is transport, not spelling. `departureKey()` is one definition and every call
 * site uses it, so the two strings START identical — but the comma is both this param's separator
 * and a legal character in a wrapper's filename. `encodeURIComponent` escapes it to `%2C` and buys
 * nothing: `searchParams.get()` decodes it back BEFORE `parseLedgerKeys` splits, so a row filed
 * under `wrapper-census-departure:run,thing.sh` is asked about as two keys that were never filed —
 * and the real key, mentioned by nobody, reads as absent. Absence moves nothing (inc.165), so the
 * failure is silent: that row is never seen resolved and never seen reopened, forever.
 *
 * THE CHECK IS A PROOF, NOT A BLACKLIST. Guessing which characters are dangerous is how the next
 * one gets missed. A key is askable iff the parser hands it back alone and unchanged — the parser
 * that the route actually runs, on this exact string. Percent-encoding is lossless by construction
 * (`encodeURIComponent` → `URLSearchParams.get` is identity), so `parseLedgerKeys` is the only lossy
 * step and the only one worth asking. Trimming and empty-collapse are covered by the same check
 * without naming them.
 *
 * AN UNASKABLE KEY IS DROPPED AND SAID OUT LOUD, NEVER MANGLED. Dropping it means the ledger is
 * never asked about it, which is exactly `null`'s behaviour for that key: it closes nothing and
 * reopens nothing, and the row stays on Rob's page where he can see it. Sending it anyway is the
 * only option that could act on an answer about the wrong key.
 *
 * PURE per CR-3.
 */
export function keySurvivesTransport(key: string): boolean {
  const parsed = parseLedgerKeys(key);
  return parsed !== null && parsed.length === 1 && parsed[0] === key;
}

/**
 * The URL that asks Rob's ledger about exactly `keys`.
 *
 * An empty key list asks for the WHOLE ledger rather than for nothing: a `keys=` with no value must
 * never be read as "match nothing" — that would answer "no row is open and none resolved" for every
 * key, which is the short read inc.166 exists to make unreachable, manufactured at full strength.
 * The URL layer therefore stays permissive; refusing an un-narrowed read is a caller's decision and
 * `ledgerReadPlan().narrowed` is how a caller sees which one it is getting.
 */
export function ledgerReadUrl(base: string, keys: readonly string[] = []): string {
  const root = `${base.replace(/\/$/, "")}/api/admin/flags`;
  const { keys: wanted, narrowed } = ledgerReadPlan(keys);
  if (!narrowed) return root;
  return `${root}?${LEDGER_KEYS_PARAM}=${wanted.map(encodeURIComponent).join(",")}`;
}

/**
 * The route's side: the keys a request asked for, or `null` for "asked for the whole ledger".
 *
 * `null` and `[]` are deliberately different and neither is guessed. A missing param is `null`
 * (answer everything, the pre-inc.166 contract). A param present but empty after trimming is ALSO
 * `null`, for the reason above — a malformed narrow must widen, never narrow to nothing.
 */
export function parseLedgerKeys(raw: string | null): string[] | null {
  if (raw === null) return null;
  const keys = [...new Set(raw.split(",").map((k) => k.trim()).filter((k) => k.length > 0))];
  return keys.length > 0 ? keys : null;
}
