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
 * The URL that asks Rob's ledger about exactly `keys`.
 *
 * An empty key list asks for the WHOLE ledger rather than for nothing: the caller only reads when
 * it has keys to ask about, and a `keys=` with no value must never be read as "match nothing" —
 * that would answer "no row is open and none resolved" for every key, which is the short read this
 * increment exists to make unreachable, manufactured at full strength.
 */
export function ledgerReadUrl(base: string, keys: readonly string[] = []): string {
  const root = `${base.replace(/\/$/, "")}/api/admin/flags`;
  const wanted = [...new Set(keys.filter((k) => typeof k === "string" && k.length > 0))];
  if (wanted.length === 0) return root;
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
