// Q84 inc.106 — WHO MAY WRITE `flags.payload`.
//
// inc.101 put the scope rule on the write door (`POST /api/admin/flags` calls
// `scopeHostConfirmPayload` before the column is ever set); inc.102 put the same rule on the
// read door, and its comment named the second thing an ungated payload could come from: "any
// other writer of the column". inc.106 went looking for that writer, starting from the route
// the handover named — `/api/admin/orgs`.
//
// THERE IS NO SUCH ROUTE. The org host write lives at `PATCH /api/admin/people` (it switches to
// the `orgs` table for a `C-` id and writes `orgs.domain`), and it files no flag and mints no
// payload — so the question "should it mint one now that the reader gates one" has no subject.
// Read across the whole tree, `POST /api/admin/flags` is the ONLY writer of the column.
//
// That is a fact about today, and a fact about today is exactly the kind of thing that stops
// being true without anybody noticing — which is what this module exists to prevent. The
// invariant is not "no other route writes payloads", it is "the write that scopes is the only
// write there is", and CR-3 says a guarantee lives in code, not in a comment claiming it holds.
//
// Deliberately TEXTUAL and deliberately narrow. It answers one question — does this file put a
// `payload` KEY into an object while also talking to the `flags` table — because that is the
// shape of the mistake: someone adds a field to an insert. It is not a type system and does not
// pretend to be: a writer that assembles its row dynamically would slip past, and the honest
// name for that is a limit, not a hole this module quietly covers.
//
// Pure per CR-3: it is handed file contents and returns a verdict. No filesystem, no clock, no
// network — the walk belongs to the caller, so the rule stays testable on strings.

import type { Anchor } from "./anchorPin";
import type { SourceFile } from "./scanPerimeter";

/** The one file allowed to put a payload into a `flags` row, because it is the one that scopes. */
export const SCOPED_PAYLOAD_WRITER = "app/api/admin/flags/route.ts";

/**
 * Q84 inc.116 — this door's whole rule is "every writer except that one path", so if the path
 * stops existing the rule excludes nothing and reports nothing, and the green means only that
 * there is no subject. The pin used to be a bespoke `TREE.some(...)` in this door's test; it is
 * the shared shape now, so it and the read door's pin strengthen together.
 */
export const SCOPED_PAYLOAD_WRITER_ANCHOR: Anchor = { kind: "path", name: SCOPED_PAYLOAD_WRITER };

/** This door's name in a notice — a shared check must say WHICH door went blind (inc.115). */
export const PAYLOAD_WRITE_GUARD = "the flags.payload write gate";

// Q84 inc.116 — `SourceFile` is the perimeter's vocabulary, declared once in `./scanPerimeter`.
// Re-exported here so this module's existing importers are unchanged.
export type { SourceFile };

/**
 * `payload` used as an OBJECT KEY — `{ payload`, `, payload:`, `, payload }`.
 *
 * The leading `{` or `,` is what makes this narrow enough to be worth running. Without it the
 * check lights up on every route that names its request body `payload` (`let payload:`,
 * `const payload = await req.json()`, `payload.product`, the string "invalid payload"), and a
 * guard that cries wolf on eleven innocent files is a guard somebody deletes.
 */
const PAYLOAD_KEY = /[{,]\s*payload\s*(?::|,|\})/;

/** A file that talks to the `flags` table at all — either spelling of the client's selector. */
const FLAGS_TABLE = /from\(\s*["'`]flags["'`]\s*\)/;

/**
 * Files that appear to write `flags.payload` without being the writer that scopes it.
 *
 * Returns repo-relative paths, sorted, so a failure reads as a list rather than a diff.
 */
export function unscopedPayloadWriters(files: readonly SourceFile[]): string[] {
  return files
    .filter((f) => f.path !== SCOPED_PAYLOAD_WRITER)
    .filter((f) => FLAGS_TABLE.test(f.text) && PAYLOAD_KEY.test(f.text))
    .map((f) => f.path)
    .sort();
}

/**
 * The sentence a failing check prints. Says what to do, not just what is wrong: the remedy is
 * never "add a scope call here" (that would be inc.4/inc.5's second copy of the ladder) — it is
 * to send the payload through the route that already asks the question.
 */
export function unscopedPayloadWriterRefusal(offenders: readonly string[]): string | null {
  if (!offenders.length) return null;
  return (
    `${offenders.length} file${offenders.length === 1 ? "" : "s"} write${offenders.length === 1 ? "s" : ""} ` +
    `a payload onto a flags row outside ${SCOPED_PAYLOAD_WRITER}: ${[...offenders].join(", ")}. ` +
    `A payload that does not pass scopeHostConfirmPayload can point at an org the finding never ` +
    `names, and the reader will render a live write button to it. Send the payload as the body ` +
    `of POST /api/admin/flags instead of setting the column directly.`
  );
}
