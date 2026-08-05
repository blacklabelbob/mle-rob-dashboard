// Q84 inc.185 — the registry's membership is now defended; its per-filer KEY LISTS are not.
//
// inc.183 built `LEDGER_FILERS` and proved the six filers listed there do not collide. inc.184
// proved the list is COMPLETE — a seventh filer fails the build. Both of those are about which
// files are in the table. Neither looks at the one thing every conclusion downstream is computed
// from: the `keys` array each entry carries.
//
// That array is trusted whole. `measureNamespace` asks whether those strings overlap, share a
// namespace, or lack a separator — it never asks whether they are the keys the file actually
// puts on the ledger. So a `.ts` filer that starts emitting a SECOND key, and does not think to
// add it to its entry, leaves the report saying `partitioned` about a smaller key set than the one
// in prod. Same shape this series keeps finding: not a wrong value, a claim measured against
// something that has since moved. The `.ts` imports do not help here — importing `KEY_CRM_GAP`
// proves that constant's spelling is current, and says nothing about a second constant beside it.
//
// This file closes that by resolving what each emission site actually carries and checking it
// against the patterns its filer declares:
//
//   undeclared — the file emits a key no declared pattern covers. The registry understates it,
//                so every namespace conclusion is scoped to a key set prod does not have.
//   unjudged   — the value is an expression this cannot resolve to a literal. NOT a pass. It is
//                reported with its path, line and verbatim text, because the honest output of a
//                measurement that cannot see something is to say so and name it.
//
// Resolution is deliberately shallow — a string literal, or an identifier declared as a string
// constant in the same file. It does not chase a call, an import, or a template with a hole in it.
// A deeper resolver would be a second, worse copy of the compiler, and the failure mode of getting
// it subtly wrong is the one thing worse than not knowing: a confident "declared" about a key that
// was never checked.

import { keysOverlap, type Filer, type KeyPattern } from "./keyNamespace";
import type { EmissionSite } from "./filerCensus";

/** What an emission site's value side turned out to be. */
export type EmittedKey =
  | { kind: "resolved"; key: string }
  | { kind: "unjudged"; reason: string };

/** `const NAME = "literal";` — the only declaration form this resolves, in any of the three quotes. */
const CONSTANT_LINE =
  /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])((?:[^\\]|\\.)*?)\2\s*;?\s*$/;

/**
 * Every `const NAME = "literal"` in one file's text.
 *
 * A name declared twice with DIFFERENT literals is dropped rather than resolved to either one: two
 * scopes in one file can hold the same identifier, a line scan cannot tell which is in view at the
 * emission, and guessing would produce exactly the confident-but-unchecked answer this file exists
 * to avoid. Dropping it sends the site to `unjudged`, where a human sees it.
 */
export function findStringConstants(text: string): Map<string, string> {
  const found = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const line of text.split("\n")) {
    const match = line.match(CONSTANT_LINE);
    if (!match) continue;
    const [, name, quote, body] = match;
    if (quote === "`" && body.includes("${")) continue;
    const seen = found.get(name);
    if (seen !== undefined && seen !== body) ambiguous.add(name);
    else found.set(name, body);
  }
  for (const name of ambiguous) found.delete(name);
  return found;
}

const LITERAL_VALUE = /^(["'`])((?:[^\\]|\\.)*?)\1\s*[,;]?\s*$/;
const IDENTIFIER_VALUE = /^([A-Za-z_$][\w$]*)\s*[,;]?\s*$/;

/**
 * What key a site puts on the ledger, or why that cannot be said.
 *
 * The reason strings are written for whoever reads the failing line, not for a machine — the point
 * of an unjudged site is that a person has to go look at it.
 */
export function resolveEmittedKey(value: string, constants: Map<string, string>): EmittedKey {
  const literal = value.match(LITERAL_VALUE);
  if (literal) {
    const [, quote, body] = literal;
    if (quote === "`" && body.includes("${")) {
      return { kind: "unjudged", reason: "interpolated template — the key is built at runtime" };
    }
    return { kind: "resolved", key: body };
  }
  const identifier = value.match(IDENTIFIER_VALUE);
  if (identifier) {
    const key = constants.get(identifier[1]);
    if (key !== undefined) return { kind: "resolved", key };
    return {
      kind: "unjudged",
      reason: `\`${identifier[1]}\` is not declared as a string constant in this file`,
    };
  }
  return { kind: "unjudged", reason: "expression — not a literal or a named string constant" };
}

/** True when one of the filer's declared patterns covers this exact key. */
export function isDeclared(key: string, patterns: KeyPattern[]): boolean {
  return patterns.some((pattern) => keysOverlap(key, pattern));
}

/** A key reaching the ledger that its filer's registry entry does not list. */
export type UndeclaredKey = { filer: string; path: string; line: number; key: string };

/** A site this check could not resolve — reported, never counted as declared. */
export type UnjudgedEmission = {
  filer: string;
  path: string;
  line: number;
  value: string;
  reason: string;
};

export type DeclarationAudit = {
  /** Sites resolved to a literal and checked. */
  checked: number;
  undeclared: UndeclaredKey[];
  unjudged: UnjudgedEmission[];
  /**
   * True when every key this could resolve is one the registry declares.
   *
   * Says nothing about `unjudged` on purpose — folding those in would let an unreadable expression
   * read as a failure, and folding them out silently would let one read as a pass. They are their
   * own list because they need their own answer.
   */
  declared: boolean;
};

/**
 * Check every registered filer's emissions against the keys its entry claims.
 *
 * Sites whose path is in no filer's `source` are skipped, not guessed at — an unregistered file is
 * inc.184's finding and reporting it twice, in two vocabularies, would make one defect look like
 * two. File text is read once per path.
 */
export function auditDeclaredKeys(
  filers: Filer[],
  sites: EmissionSite[],
  read: (path: string) => string,
): DeclarationAudit {
  const bySource = new Map(filers.map((f) => [f.source, f]));
  const constantsByPath = new Map<string, Map<string, string>>();
  const undeclared: UndeclaredKey[] = [];
  const unjudged: UnjudgedEmission[] = [];
  let checked = 0;

  for (const site of sites) {
    const filer = bySource.get(site.path);
    if (!filer) continue;
    let constants = constantsByPath.get(site.path);
    if (!constants) {
      constants = findStringConstants(read(site.path));
      constantsByPath.set(site.path, constants);
    }
    const resolved = resolveEmittedKey(site.value, constants);
    if (resolved.kind === "unjudged") {
      unjudged.push({
        filer: filer.name,
        path: site.path,
        line: site.line,
        value: site.value,
        reason: resolved.reason,
      });
      continue;
    }
    checked++;
    if (!isDeclared(resolved.key, filer.keys)) {
      undeclared.push({
        filer: filer.name,
        path: site.path,
        line: site.line,
        key: resolved.key,
      });
    }
  }

  return { checked, undeclared, unjudged, declared: undeclared.length === 0 };
}

/**
 * One line per finding, for the reporter to print under the census.
 *
 * The unjudged lines print every run they are non-empty, and that is not noise: they are the exact
 * extent of what the check above does NOT cover, and a limit nobody prints is a limit nobody
 * remembers. When both lists are empty this says nothing at all.
 */
export function declarationLines(audit: DeclarationAudit): string[] {
  const lines: string[] = [];
  for (const entry of audit.undeclared) {
    lines.push(
      `UNDECLARED KEY: ${entry.path}:${entry.line} files "${entry.key}", which "${entry.filer}" does ` +
        `not list in LEDGER_FILERS — the namespace report is measured against a smaller key set than prod has.`,
    );
  }
  for (const entry of audit.unjudged) {
    lines.push(
      `NOT KEY-CHECKED: ${entry.path}:${entry.line} (${entry.filer}) emits \`${entry.value}\` — ` +
        `${entry.reason}. Its declared keys are taken on trust.`,
    );
  }
  return lines;
}
