// The repo's ONE reader of `supabase/migrations/*.sql` -> table -> columns.
//
// Extracted from `scripts/exposure-audit.mjs` (Q73 inc.24) the moment a second consumer
// appeared (`scripts/gen-role-grants.mjs`, Q73 inc.25). It is extracted rather than copied
// because inc.21 of Q71 spent an increment deleting exactly that kind of copy: a mapping
// duplicated out of `lib/storage/supabaseStore.ts` that fell four columns behind and made
// the local dashboard show nobody employed anywhere. A column-privilege generator that
// silently missed a column would grant a booker read on it — the failure this item exists
// to prevent — so there is one parser and both callers get the same answer by construction.
//
// Side-effect free on import: it exports functions and runs nothing. The audit script owns
// its own report writing; this file must stay importable from a vitest test.
//
// Deliberately forgiving: migrations are ours, not arbitrary SQL, so a regex pass over
// `create table` bodies plus `add column` beats pulling in a SQL parser for 35 files we wrote.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Blank out SQL comments, preserving byte offsets and newlines.
 *
 * NOT cosmetic, and not optional — this is the fix for a real miscount found by the Q73
 * rollout half (inc.26). Without it, a comment sentence containing a comma is split by
 * `splitTop` into a fragment that *starts* with a word, and the column regex reads that word
 * as a column name while the real column on the next line is swallowed into the same
 * fragment. `0012_invoice_ledger.sql` alone produced four invented columns (`never`, `not`,
 * `plus`, `which`) and lost four real ones (`issue_date`, `status_text`, `due_date`,
 * `source_sha256`).
 *
 * Both directions are defects, and neither is loud: an invented column makes the generated
 * GRANT fail to apply, and a swallowed column is a column the exposure audit does not count —
 * an UNDERCOUNT of exposure, which is the one direction that report's own doctrine forbids.
 *
 * Replaced with spaces rather than removed so that offsets stay usable and `splitTop`'s depth
 * counting cannot be thrown by a paren that only existed inside prose.
 */
export function stripComments(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];

    // Single-quoted literal — copied through verbatim; a `--` inside one is data, and the
    // check constraints in these migrations are full of regex literals.
    if (ch === "'") {
      out += ch;
      i++;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }

    // Dollar-quoted body ($$ … $$) — trigger and function bodies. Same reasoning.
    if (ch === "$" && sql[i + 1] === "$") {
      out += "$$";
      i += 2;
      const end = sql.indexOf("$$", i);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }

    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") { out += " "; i++; }
      continue;
    }

    if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      for (const c of sql.slice(i, stop)) out += c === "\n" ? "\n" : " ";
      i = stop;
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

/** Split a CREATE TABLE body on top-level commas only. */
export function splitTop(body) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/**
 * table -> Set(columns), from every migration in order.
 *
 * @param {string} [dir] migrations directory; defaults to the repo's own.
 * @returns {Map<string, Set<string>>}
 */
export function readSchema(dir = join(repoRoot, "supabase/migrations")) {
  const tables = new Map();
  const add = (t, c) => {
    const key = t.replace(/^public\./, "").trim();
    if (!tables.has(key)) tables.set(key, new Set());
    if (c) tables.get(key).add(c);
  };

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = stripComments(readFileSync(join(dir, file), "utf8"));

    // create table [if not exists] <name> ( ...body... );
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)\s*\(/gi;
    let m;
    while ((m = re.exec(sql))) {
      const table = m[1];
      add(table, null);
      // Walk to the matching close paren so nested type parens don't truncate.
      let depth = 1;
      let i = re.lastIndex;
      for (; i < sql.length && depth > 0; i++) {
        if (sql[i] === "(") depth++;
        else if (sql[i] === ")") depth--;
      }
      const body = sql.slice(re.lastIndex, i - 1);
      for (const line of splitTop(body)) {
        const col = /^\s*"?([a-z_][a-z0-9_]*)"?\s+\S/i.exec(line);
        if (!col) continue;
        const first = col[1].toLowerCase();
        if (["primary", "unique", "constraint", "foreign", "check", "exclude"].includes(first)) continue;
        add(table, first);
      }
    }

    // alter table <name> add column [if not exists] <col>
    const alt = /alter\s+table\s+(?:if\s+exists\s+)?([\w.]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
    while ((m = alt.exec(sql))) add(m[1], m[2].toLowerCase());
  }
  return tables;
}
