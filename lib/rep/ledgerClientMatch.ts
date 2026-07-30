/**
 * Q81 leg (c), inc.3 — the join that did not exist.
 *
 * The rep list needed no join: it shows every overdue invoice, keyed by the ledger's own
 * `client_slug`. The DEAL RECORD does, and the repo had none — nothing anywhere maps a CRM
 * org to a ledger client. The two sides were never named the same way:
 *
 *     org "CG Roofing Group"    →  ledger `cg_roofing`
 *     org "Gulf Coast RE Group" →  ledger `gulf_coast`
 *
 * so slugifying the org name and comparing gets zero matches, and fuzzy-matching gets the
 * wrong ones. **On a money panel a wrong match is worse than no match**: it puts one client's
 * overdue payment on another client's record, in front of a rep about to make a call. So the
 * rule here is deliberately narrow and refuses when it cannot be sure:
 *
 *   1. Compare TOKENS, not strings. The ledger slug's tokens must be a *leading run* of the
 *      org's tokens (`cg roofing` leads `cg roofing group`). A leading run is what actually
 *      happened — the ledger drops trailing corporate words ("Group", "RE Group").
 *   2. A match must be UNIQUE. If two ledger clients both lead an org name, or one slug leads
 *      two orgs, this returns `ambiguous` and the screen says so. Guessing is not available.
 *   3. Never partial-token. `gulf` does not lead `gulfstream` — tokens match whole or not at
 *      all, which is what stops "Red Rock Roofing" from ever answering to `red_rock_roofing_x`.
 *
 * Pure and clock-free (CR-3): the caller supplies the ledger's slugs, this decides nothing
 * about time and reads nothing from the network.
 */

/** Lowercase word tokens of a name or slug — `_`, `-`, spaces and punctuation all split. */
export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 0);
}

/** True when `prefix` is a whole-token leading run of `tokens`. */
export function isLeadingTokenRun(prefix: readonly string[], tokens: readonly string[]): boolean {
  if (prefix.length === 0 || prefix.length > tokens.length) return false;
  return prefix.every((t, i) => t === tokens[i]);
}

export type LedgerClientMatch =
  /** One ledger client, unambiguously this org's. */
  | { state: "matched"; slug: string }
  /** No ledger client answers to this org — it has never been invoiced under this name. */
  | { state: "none" }
  /** More than one candidate. Reported, never resolved by preference. */
  | { state: "ambiguous"; candidates: string[] };

/**
 * Resolve one CRM org name to the ledger's `client_slug`.
 *
 * `ledgerSlugs` is the distinct set the ledger actually contains — passing the live set (not a
 * hardcoded table) is what keeps this from rotting the first time a client is added.
 */
export function resolveLedgerClientSlug(
  orgName: string | null | undefined,
  ledgerSlugs: readonly string[]
): LedgerClientMatch {
  const orgTokens = tokenize(orgName ?? "");
  if (orgTokens.length === 0) return { state: "none" };

  const matches = new Set<string>();
  for (const slug of ledgerSlugs) {
    const slugTokens = tokenize(slug);
    if (isLeadingTokenRun(slugTokens, orgTokens)) matches.add(slug);
  }

  const candidates = [...matches].sort();
  if (candidates.length === 0) return { state: "none" };
  if (candidates.length > 1) return { state: "ambiguous", candidates };
  return { state: "matched", slug: candidates[0] };
}

/** Distinct `client_slug` values present in the rows read, in stable order. */
export function distinctClientSlugs(
  rows: readonly { clientSlug: string }[]
): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const s = r.clientSlug?.trim();
    if (s) seen.add(s);
  }
  return [...seen].sort();
}
