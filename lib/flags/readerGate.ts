// Q84 inc.107 — WHO MAY READ A PAYLOAD WITHOUT ITS ROW.
//
// inc.102 put the scope rule on the read door: `hostConfirmControls` takes the row's own
// title/detail/`entity_id` and drops an action naming an org the finding cannot reach. It
// arrived as an OPTIONAL last parameter, and its own doc advertises the escape hatch —
// *"omit it and every control behaves exactly as it did in inc.73"* — which is the reader
// inc.102 proved renders a live `Set Domain to elsewhere.com` button on C-9999's page.
//
// THE READ inc.106 HANDED OVER: can the parameter simply be made required? At the type level,
// YES, and the assumption that it could not is wrong — TypeScript's "required cannot follow
// optional" (TS1016) is about `b?: T`, not about `b: T = []`, so `row` moving to required
// compiles. Verified, not asserted: `f(a, b: string[] = [], c: {x?: string})` type-checks, and
// `f(1)` then fails TS2554 *Expected 3 arguments, but got 1*.
//
// WHICH IS EXACTLY WHY IT IS THE WRONG FIX. The cost is not the edit, it is what the edit
// erases. ~25 call sites pass two arguments and assert the reader's CORE rule — `here` is true
// on the action's own page and false everywhere else (inc.73), the done state is only ever on a
// `here` control (inc.75). Requiring `row` forces every one of them to also state a scope, and a
// test that must satisfy two rules at once no longer pins either; the suite would lose its only
// statement of what the reader does independent of scope. inc.102 pinned the pair deliberately
// (`gated == ungated` for an in-scope payload) and that assertion cannot survive its own premise
// being unspellable.
//
// So the hole is not "the parameter is optional" — a test SHOULD be able to omit it. The hole is
// that nothing stops a THIRD production caller from omitting it. That is a fact about today of
// exactly inc.106's kind, and CR-3 says such a guarantee lives in code rather than in a comment
// claiming it holds. Same shape as `payloadWriters.ts`, the other door, one increment earlier.
//
// Pure per CR-3: handed file contents, returns a verdict. No filesystem, no clock, no network —
// the walk belongs to the caller, so the rule stays testable on strings.

import type { Anchor } from "./anchorPin";
import type { SourceFile } from "./scanPerimeter";

/** The reader whose scope argument is optional in the type system and mandatory in production. */
export const READER = "hostConfirmControls";

/** `payload, pageId, written, row` — the row is the 4th, so a gated call has 4 arguments. */
export const ROW_ARG_COUNT = 4;

/**
 * This file, which quotes both spellings of the call in its own prose and reported ITSELF on the
 * first live run. It renders nothing and is excluded by path — the same self-exclusion
 * `payloadWriters.ts` makes for the writer it blesses.
 *
 * That exclusion also names the scan's LIMIT out loud: a call inside a comment reads exactly like
 * a call. Anywhere but here that is the safe direction — a commented-out ungated reader is worth
 * a nag — but a guard cannot be the one file allowed to describe the thing it forbids and also
 * be judged for describing it.
 */
export const RULE_FILE = "lib/flags/readerGate.ts";

/**
 * Q84 inc.118 — the self-exclusion is a rule hanging off a PATH, and until now nothing asked
 * whether the path still pointed at anything. Move or rename this file without updating the
 * constant and the exclusion excludes nobody: the guard would start reporting its own commentary
 * as ungated callers, which is a nag, and the reader's fix for a nag is to widen the exclusion —
 * so the quiet failure arrives one step later, wearing a loud one's clothes.
 */
export const RULE_FILE_ANCHOR: Anchor = { kind: "path", name: RULE_FILE };

/**
 * Q84 inc.116 — the reader must still BE somewhere, and the pin is deliberately a DECLARATION pin
 * rather than a text match: this file spells `export function hostConfirmControls(` twice above,
 * explaining that a declaration is not a call, so a looser rule would let this module's own
 * commentary vouch for a reader that had been renamed out of existence.
 *
 * The read door's old real-tree pin was on a CALLER, which is a weaker promise wearing this one's
 * name: it holds only while a live caller exists. Both are kept — a caller proves the walk reaches
 * production, this proves there is something to call.
 */
export const READER_ANCHOR: Anchor = { kind: "declaration", name: READER };

// Q84 inc.116 — `SourceFile` is the perimeter's vocabulary, declared once in `./scanPerimeter`.
// Re-exported here so this module's existing importers are unchanged.
export type { SourceFile };

/**
 * The argument lists of every `hostConfirmControls(...)` CALL in a file.
 *
 * Balanced-scan rather than a regex, because the live call spans four lines and carries both a
 * ternary and an object literal — `hostConfirmControls(f.payload, mode === "entity" ? (person ??
 * entity ?? null) : null, written, { title: f.title, ... })` — and no regex reads that honestly.
 *
 * The declaration is skipped: `export function hostConfirmControls(` is the reader, not a call.
 *
 * LIMIT, stated rather than covered up: it is textual. Quoted parens are skipped, but a comment
 * carrying an unbalanced bracket inside an argument list, or a call reached through an alias or
 * a variable, is not seen. This is a guard, not a type system.
 */
function callArgLists(text: string): string[][] {
  const lists: string[][] = [];
  for (const name of [READER, ...aliasNames(text).names]) {
    const call = new RegExp(`(?<![\\w$.])${name}\\s*\\(`, "g");
    for (let m = call.exec(text); m; m = call.exec(text)) {
      // `export function hostConfirmControls(` is the reader, not a call.
      if (/function\s+$/.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
      const args = scanArgs(text, m.index + m[0].length);
      if (args) lists.push(args);
    }
  }
  return lists;
}

/** Splits an argument list at top-level commas, starting just inside the `(`. */
function scanArgs(text: string, start: number): string[] | null {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      const end = skipString(text, i, c);
      if (end === -1) return null;
      current += text.slice(i, end + 1);
      i = end;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" && depth === 0) {
      // A trailing comma leaves an empty tail; it is punctuation, not an argument.
      if (current.trim()) args.push(current.trim());
      return args;
    } else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  return null;
}

function skipString(text: string, open: number, quote: string): number {
  for (let i = open + 1; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === quote) return i;
  }
  return -1;
}

/**
 * Every file that calls the reader at all.
 *
 * Exported so a walk that silently matched nothing cannot read as a clean bill of health — the
 * test asserts the live caller is IN here before it asserts nobody offends (inc.106's precedent).
 */
export function readerCallers(files: readonly SourceFile[]): string[] {
  return files
    .filter((f) => f.path !== RULE_FILE)
    .filter((f) => callArgLists(f.text).length > 0)
    .map((f) => f.path)
    .sort();
}

/**
 * Files with a reader call that does not hand over the row.
 *
 * A call offends if it passes fewer than four arguments, or passes a literal `undefined` in the
 * row's place — the two spellings of "restore the ungated reader". Returns repo-relative paths,
 * sorted, so a failure reads as a list rather than a diff.
 */
export function ungatedReaderCallers(files: readonly SourceFile[]): string[] {
  return files
    .filter((f) => f.path !== RULE_FILE)
    .filter((f) =>
      callArgLists(f.text).some(
        (args) => args.length < ROW_ARG_COUNT || args[ROW_ARG_COUNT - 1] === "undefined",
      ),
    )
    .map((f) => f.path)
    .sort();
}

// Q84 inc.108 — WHAT THE ARGUMENT COUNT CANNOT SEE.
//
// inc.107 handed over a suspicion: a caller passing a row whose every field is `undefined`
// satisfies `ungatedReaderCallers` and might drop every action. The first half is true. The
// second half was READ at the reader rather than argued, and it does not make the guard wrong —
// an all-empty row drops everything, which is the OPPOSITE failure from the one this file
// chases, and it is the correct answer for a row that genuinely names nothing (inc.26: such a
// row reaches no org page, so every action it carried was already an unclickable link). The
// route stores `null` for exactly that row. So the gate must NOT demand a row that names
// something: the demand would forbid the one call that is right. Pinned in
// `hostConfirmView.test.ts` → "a row that names nothing".
//
// THE HOLE THE COUNT ACTUALLY LEAVES is narrower and real: the fourth argument must be THIS
// row. Both live calls read the payload and all three fields off the same `f`. Nothing stops a
// caller handing `f.payload` alongside some OTHER row's title and detail — and that reader is
// not over- or under-permissive, it is simply wrong about which finding it is grading, in the
// one direction inc.101's ladder cannot detect (both rows are well-formed).
//
// ABSTAINS RATHER THAN GUESSES. If the payload argument is not read off an object — a bare
// `payload` variable — there is no root to match and this says nothing. It fires only when the
// payload demonstrably comes from an object and the row demonstrably does not mention it.

/** The root identifier of a member expression (`f.payload` → `f`), or null for anything else. */
function receiverRoot(arg: string): string | null {
  const m = /^([A-Za-z_$][\w$]*)\s*\./.exec(arg.trim());
  return m ? m[1] : null;
}

/** Whether `text` uses `root` as an identifier, not as somebody else's property. */
function mentions(text: string, root: string): boolean {
  return new RegExp(`(?<![\\w$.])${root}(?![\\w$])`).test(text);
}

// Q84 inc.109 — THE HOISTED ROW WAS NOT ABSTAINED ON. IT WAS NAGGED.
//
// inc.108 handed over a suspicion phrased as a gap: `mismatchedRowCallers` "abstains on a hoisted
// row". Read at the function rather than taken on its word, and it is the opposite — a bare
// identifier mentions nothing, so `!mentions("row", "f")` is TRUE and the correct caller is
// REPORTED. Not a blind spot: a false positive, on the spelling a refactor most likely produces.
//
// That is the one failure this file cannot afford. `payloadWriters.ts` states it a increment
// earlier in its own words — a guard that cries wolf is a guard somebody deletes — and it is
// worse here, because the sentence this guard prints accuses a correct author of grading the
// wrong finding.
//
// THE ASYMMETRY IS THE BUG. The module doc already claims the right doctrine: abstain rather than
// guess. It honours it on the PAYLOAD side (a bare `payload` has no root, so no opinion) and
// breaks it on the ROW side, where an argument it equally cannot read is treated as proof of
// mismatch. Same ignorance, opposite verdict.
//
// SO THE ANSWER TO "FOLLOW IT, OR STATE THE LIMIT" IS BOTH, AND IN THAT ORDER. A `const row =
// {...}` in the same file is readable, deterministically — following it keeps the real catch (a
// hoisted row built off ANOTHER object still offends). What cannot be read — an imported row, a
// parameter, a destructured binding, or a name declared twice — is abstained on, which is what
// inc.108 wrongly believed was already happening.

/** A bare identifier, i.e. a row passed by name rather than written at the call site. */
function bareIdentifier(arg: string): string | null {
  const t = arg.trim();
  return /^[A-Za-z_$][\w$]*$/.test(t) && t !== "undefined" ? t : null;
}

/** Every `const|let|var <name> =` in the file, as offsets just past the `=`. */
function declarationEnds(text: string, name: string): number[] {
  const decl = new RegExp(`(?<![\\w$.])(?:const|let|var)\\s+${name}\\s*(?::[^=;]*)?=`, "g");
  const ends: number[] = [];
  for (let m = decl.exec(text); m; m = decl.exec(text)) ends.push(m.index + m[0].length);
  return ends;
}

// Q84 inc.110 — A DECLARATION IS NOT A VALUE.
//
// inc.109 handed this over as a miss: `const row = { title: f.title }` then `row.title =
// other.title` resolves clean and is graded clean. PROBED at the real function before it was
// built on, and the miss is the lesser half. Three spellings, three verdicts:
//
//   const row = { title: f.title };   row.title = other.title;  →  []          (silent — a miss)
//   const row = { title: other.title }; row.title = f.title;    →  ["a.tsx"]   (ACCUSED — wrong)
//   let row = { title: f.title };     row = other;              →  []          (silent — a miss)
//
// The middle one is a FALSE POSITIVE — a correct caller, told it grades the wrong finding — which
// is the failure inc.109 spent a whole increment removing from this same function. So the honest
// answer to "detect it, or state the contract as *the row as DECLARED*" is neither: a guard whose
// contract is the declaration is a guard that confidently grades a value nobody passed.
//
// A write to the name IS detectable textually — cheaply and in the same style as the declaration
// scan — and what it proves is only that this file can no longer read the row. That is inc.109's
// fourth ignorance, not a fifth rule: abstain. Both misses stay misses on purpose; the safe
// direction for a nag is silence (inc.71), and the accusation is the one thing it cannot afford.

/**
 * Whether `name` is written to anywhere in the file — reassigned, mutated through a property or
 * index, compound-assigned, or handed to `Object.assign` as the target.
 *
 * Deliberately NOT position-aware. A write below the call is as disqualifying as one above it:
 * this file cannot order statements it never parsed, and either way it no longer knows the row.
 */
function writtenTo(text: string, name: string): boolean {
  const use = new RegExp(`(?<![\\w$.])${name}(?![\\w$])`, "g");
  for (let m = use.exec(text); m; m = use.exec(text)) {
    const before = text.slice(Math.max(0, m.index - 32), m.index);
    if (/(?:const|let|var)\s+$/.test(before)) continue; // the declaration itself, not a write
    if (/Object\s*\.\s*assign\s*\(\s*$/.test(before)) return true;
    // `=` that is not `==`, `===` or `=>`; through any run of `.prop` / `[expr]` accessors.
    if (/^\s*(?:\.[A-Za-z_$][\w$]*|\[[^\]\n]*\])*\s*(?:\|\||&&|\?\?|[+\-*/%])?=(?![=>])/.test(
        text.slice(m.index + name.length))) {
      return true;
    }
  }
  return false;
}

/** The initializer text from just after `=` to the top-level `;` or line end that closes it. */
function scanInitializer(text: string, start: number): string | null {
  let depth = 0;
  let out = "";
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      const end = skipString(text, i, c);
      if (end === -1) return null;
      out += text.slice(i, end + 1);
      i = end;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if ((c === ";" || c === "\n") && depth === 0) break;
    out += c;
  }
  const trimmed = out.trim();
  return trimmed ? trimmed : null;
}

// Q84 inc.111 — AN ABSTENTION IS NOT A CLEAN BILL OF HEALTH.
//
// inc.107..inc.110 each answered "accuse or stay quiet?" with quiet, and each time that was the
// right answer: the accusation is the one thing a nag cannot afford. But the four ignorances all
// route to the same silent `null`, and the effect compounds — a file can now be un-gradeable four
// different ways and `mismatchedRowCallers` reports none of them. Green means EITHER "every gated
// call was read and every one grades its own finding" OR "the guard could not read a thing." Two
// opposite states, one colour.
//
// SURFACING THEM IS NOT THE NAG THIS FILE WAS BUILT TO AVOID, because it is a different sentence
// aimed at a different question. `mismatchedRowRefusal` says *this call is wrong*; that is the
// claim inc.109 and inc.110 proved must never be made on an unread argument. An abstention says
// *this call was not checked* — a fact about the GUARD, not a verdict on the author, and one this
// file can always establish with certainty because not-reading is the thing it directly observed.
//
// So the deliverable is a COVERAGE list, not a second lint: nothing here is an offence, and the
// notice says so in its first clause. Its value is that the real-tree test can pin today's answer
// — every live gated call is readable — so a refactor that hoists a row into an import turns the
// guard quiet AND turns the suite red, instead of only the first.

/**
 * Why a gated call could not be graded. The wording is the notice's, so a reason is never
 * paraphrased into an accusation on its way out.
 */
export const ABSTENTION = {
  noRoot: "its payload is not read off an object, so there is no root to match a row against",
  notDeclared: "its row is passed by name and declared nowhere in the same file",
  declaredTwice: "its row's name is declared more than once, and scope is not readable here",
  writtenTo: "its row is written to after it is declared, so the declaration is not what was passed",
  unreadable: "its row's declaration could not be read to the end",
  // inc.112 — a file-level ignorance rather than a per-call one: the alias itself is unreadable.
  aliasAmbiguous:
    "it binds the reader to a name that is declared more than once or written to, so calls through that name were not counted at all",
  // inc.113 — the reader reached with no local binding to follow: a property off some receiver.
  propertyAccess:
    "it reaches the reader through a property, and this file cannot tell whether that receiver is the module that exports it, so calls through it were not counted at all",
} as const;

export type AbstentionReason = (typeof ABSTENTION)[keyof typeof ABSTENTION];

/** A gated call this file declined to grade, and the ignorance that stopped it. */
export type ReaderAbstention = { path: string; reason: AbstentionReason };

/** The row as evidence, or the ignorance that means there is none. */
type RowRead = { evidence: string; reason?: undefined } | { evidence?: undefined; reason: AbstentionReason };

/**
 * What the row argument actually says: itself when written at the call site, its declaration when
 * passed by name, or the reason this file cannot read it and must therefore say nothing.
 *
 * LIMIT, stated rather than covered up: textual and file-local. A shadowed name in a nested scope
 * resolves to whichever single declaration exists.
 */
function readRow(fileText: string, rowArg: string): RowRead {
  const name = bareIdentifier(rowArg);
  if (!name) return { evidence: rowArg };
  const ends = declarationEnds(fileText, name);
  if (ends.length === 0) return { reason: ABSTENTION.notDeclared };
  if (ends.length > 1) return { reason: ABSTENTION.declaredTwice };
  if (writtenTo(fileText, name)) return { reason: ABSTENTION.writtenTo };
  const initializer = scanInitializer(fileText, ends[0]);
  return initializer === null ? { reason: ABSTENTION.unreadable } : { evidence: initializer };
}

function rowEvidence(fileText: string, rowArg: string): string | null {
  return readRow(fileText, rowArg).evidence ?? null;
}

/**
 * Every gated reader call `mismatchedRowCallers` declined to grade, with its reason.
 *
 * NOT a list of offences — every entry may be perfectly correct code, and the notice leads with
 * that. It exists so the guard's silence can be told apart from its approval: this is the exact
 * set of calls the mismatch rule never had an opinion about.
 *
 * Ungated calls and a literal `undefined` are skipped, not abstained on — they are the other
 * guard's business and it is already loud about them.
 */
export function abstainedReaderCallers(files: readonly SourceFile[]): ReaderAbstention[] {
  const seen = new Set<string>();
  const out: ReaderAbstention[] = [];
  for (const file of files) {
    if (file.path === RULE_FILE) continue;
    for (const reason of fileLevelIgnorance(file.text)) {
      const key = `${file.path} ${reason}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ path: file.path, reason });
      }
    }
    for (const args of callArgLists(file.text)) {
      if (args.length < ROW_ARG_COUNT) continue;
      const row = args[ROW_ARG_COUNT - 1];
      if (row === "undefined") continue;
      const reason = receiverRoot(args[0]) ? readRow(file.text, row).reason : ABSTENTION.noRoot;
      if (!reason) continue;
      const key = `${file.path}\u0000${reason}`;
      if (seen.has(key)) continue; // one file, one reason — a repeated spelling is not new news
      seen.add(key);
      out.push({ path: file.path, reason });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason));
}

/**
 * The sentence a coverage gap prints. Says in its first clause that nothing here is an offence,
 * because a reader who mistakes this for the refusal will "fix" correct code.
 */
export function abstentionNotice(abstentions: readonly ReaderAbstention[]): string | null {
  if (!abstentions.length) return null;
  const many = abstentions.length !== 1;
  const lines = abstentions.map((a) => `${a.path} — ${a.reason}`).join("; ");
  return (
    `Nothing below is wrong: ${abstentions.length} reader call${many ? "s were" : " was"} left ` +
    `UNGRADED because ${READER}'s mismatch rule could not read ${many ? "them" : "it"} — ${lines}. ` +
    `The rule stays silent on ${many ? "these" : "this"} by design (an argument it cannot read is ` +
    `not evidence of a mismatch), so its green is coverage-shaped, not proof. Write the row at the ` +
    `call site, or off a single unwritten declaration, to bring ${many ? "them" : "it"} back under ` +
    `the guard.`
  );
}

/**
 * Files where a gated reader call hands over a row that never mentions the object the payload
 * was read off — a row from somewhere else, or a literal standing in for one.
 *
 * Separate from `ungatedReaderCallers` on purpose: that one names calls that show Rob too much,
 * this one names calls that grade the wrong finding. A file can offend both lists.
 *
 * A row passed by name is resolved to its declaration in the same file (inc.109) — and when it
 * cannot be resolved, this abstains, because an argument it cannot read is not evidence of a
 * mismatch. Reporting it was inc.108's actual defect, not its stated one.
 */
export function mismatchedRowCallers(files: readonly SourceFile[]): string[] {
  return files
    .filter((f) => f.path !== RULE_FILE)
    .filter((f) =>
      callArgLists(f.text).some((args) => {
        if (args.length < ROW_ARG_COUNT) return false; // ungatedReaderCallers' business
        const row = args[ROW_ARG_COUNT - 1];
        if (row === "undefined") return false; // likewise
        const root = receiverRoot(args[0]);
        if (!root) return false; // no root to match — no opinion
        const evidence = rowEvidence(f.text, row);
        if (evidence === null) return false; // a row this cannot read is not a row from elsewhere
        return !mentions(evidence, root);
      }),
    )
    .map((f) => f.path)
    .sort();
}

/** The sentence a mismatched row prints. Names the confusion, not the syntax. */
export function mismatchedRowRefusal(offenders: readonly string[]): string | null {
  if (!offenders.length) return null;
  const many = offenders.length !== 1;
  return (
    `${offenders.length} file${many ? "s" : ""} hand${many ? "" : "s"} ${READER} a row that never ` +
    `mentions the object its payload came from: ${[...offenders].join(", ")}. The call is gated ` +
    `and every argument is well-formed, so nothing else will ever object — but the payload is ` +
    `graded against a DIFFERENT finding's reach, which silently keeps or drops the wrong ` +
    `actions. Read title, detail and entityId off the same row as the payload.`
  );
}

/**
 * The sentence a failing check prints. Says what the omission COSTS, because the signature will
 * not: the compiler accepts the two-argument call, and the only thing that ever objects is this.
 */
export function ungatedReaderRefusal(offenders: readonly string[]): string | null {
  if (!offenders.length) return null;
  const many = offenders.length !== 1;
  return (
    `${offenders.length} file${many ? "s" : ""} call${many ? "" : "s"} ${READER} without the row ` +
    `it reads the payload off: ${[...offenders].join(", ")}. The signature allows it and the ` +
    `compiler will not object, but an ungated reader renders a live "Set Domain to …" button ` +
    `for an org the finding never names. Pass { title, detail, entityId } as the fourth argument.`
  );
}

// Q84 inc.112 — A CALL THE WALK NEVER SAW.
//
// inc.111 taught this file to say when it could not READ a call. It could not say anything about
// a call it never FOUND. `callArgLists` matched the literal text `hostConfirmControls(`, so a file
// that binds the reader to another name — `import { hostConfirmControls as read }`, or a plain
// `const read = hostConfirmControls` — contributes no calls at all. Every rule here is built on
// that list, so such a file is absent from `readerCallers`, absent from `ungatedReaderCallers`,
// and absent from inc.111's own coverage list. Silence at every door, including the door built to
// report silence.
//
// AND THE REAL-TREE TEST CANNOT CATCH IT. It asserts the live caller is IN the walk before it
// asserts nobody offends (inc.106's precedent), which proves the walk is not globally empty. One
// aliased file is invisible while that assertion stays green — the walk was never the unit of
// ignorance, the FILE is.
//
// FOLLOWING THE ALIAS IS NOT A GUESS, which is what separates this from inc.109's and inc.110's
// refusals. `read` and `hostConfirmControls` are the same function, so the arity and the row rules
// apply to a call through either name with identical force; resolving the binding restores
// coverage rather than inventing a verdict.
//
// WHERE IT STOPS IS THE SAME PLACE EVERYTHING ELSE STOPS. A name declared twice, or written to,
// is a name this file cannot claim is still the reader — following it there would accuse whoever
// owns the other declaration, the one failure the doctrine forbids. So an ambiguous alias is not
// followed and not judged; it is REPORTED as coverage (inc.111's shape), because a binding this
// file gave up on is exactly the state that used to look identical to health.

/**
 * Names this file binds to the reader, plus whether any binding had to be given up on.
 *
 * Two spellings, both textual: `X as read` (import or re-export) and `const|let|var read = X` where
 * the right-hand side is the bare identifier — `const c = X(...)` is a CALL, not an alias, and the
 * lookahead is what tells them apart.
 *
 * LIMIT, stated rather than covered up: a reader reached through a property (`mod.hostConfirm…`),
 * a default import, or an element of an object/array is not a binding this reads.
 */
// Q84 inc.113 — A NAME THIS FILE IS NOT ALLOWED TO CLAIM.
//
// inc.112 followed the reader under another LOCAL name. It handed over the spellings that have no
// local name to follow: `mod.hostConfirmControls(...)` off a namespace import, and a default import
// renamed at the import site. Read at `callArgLists`, and both are still invisible — the needle's
// lookbehind `(?<![\w$.])` excludes a dot on purpose, so a property call is not merely uncounted,
// it is EXCLUDED BY DESIGN, and no rule downstream ever hears about the file.
//
// FOLLOWING IT WOULD BE THE GUESS inc.112 WAS NOT. `read` and `hostConfirmControls` were provably
// the same function — one binding, in one file, in view. `mod.hostConfirmControls` is the same
// function only if `mod` is the module that exports it, and that is a CROSS-FILE fact this walk
// does not have: it is handed text and never resolves a specifier. Counting the call would apply
// the arity and row rules to a function this file cannot show is the reader — an accusation built
// on an unread premise, which is the one failure the doctrine forbids (inc.109, inc.110).
//
// SO THE HONEST MOVE IS THE ONE inc.111 BUILT THE SHAPE FOR: report it as coverage. The property
// access is textual evidence the walk already holds and has never used, and the abstention says
// exactly what is true — this file reaches the reader by a spelling that was not counted — without
// claiming anything about whether the call is right. Silent-and-uncounted and silent-and-clean stop
// being the same colour, which is the whole of inc.111.
//
// THE OTHER HALF OF THE HANDOVER GETS A LIMIT, NOT A RULE. `import read from "./hostConfirmView"`
// renames at the import site and never writes the reader's name at all, so there is no textual
// evidence to abstain on — a file-level notice would have to fire on every file or none. Stated
// here rather than covered up: this guard sees names, and a default import erases the name.

/** Whether the file reaches the reader through a property — `ns.hostConfirmControls`, `?.` alike. */
function propertyAccess(text: string): boolean {
  return new RegExp(`\\.\\s*${READER}(?![\\w$])`).test(text);
}

/**
 * The ignorances that belong to the FILE rather than to one call: a binding this file gave up on
 * (inc.112) and a reader reached through a property it may not claim is the reader (inc.113).
 *
 * Both mean the same thing operationally — calls exist here that no rule in this module counted —
 * and neither is an offence, which is why they leave by the coverage door.
 */
function fileLevelIgnorance(text: string): AbstentionReason[] {
  const reasons: AbstentionReason[] = [];
  if (aliasNames(text).ambiguous) reasons.push(ABSTENTION.aliasAmbiguous);
  if (propertyAccess(text)) reasons.push(ABSTENTION.propertyAccess);
  return reasons;
}

// Q84 inc.114 — THE FILE THAT NEVER ENTERED.
//
// inc.111..inc.113 taught this module to report a call it could not read, a binding it had to give
// up on, and a spelling it is not allowed to claim. Every one of those ignorances presumes the file
// reached the guard at all. The WALK's own boundary was never stated anywhere it could be checked:
// the roots (`app`, `lib`, `scripts`, `components`) and the extension filter lived as two literals
// in the TEST, so a production caller outside them is invisible to every rule at once — and no
// abstention can fire, because the file never entered.
//
// THAT IS NOT HYPOTHETICAL HERE. `proxy.ts` — the app-level Basic-Auth gate — sits at the repo root
// and is production; `scripts/net-sentinel.cjs` sits INSIDE a scanned root and was dropped by an
// extension filter that knew `.ts|.tsx|.mjs|.js` and not `.cjs`. Six tracked source files were
// outside the guard's reach, and nothing said so.
//
// SO THE ANSWER TO inc.113's HANDOVER IS BOTH HALVES, SPLIT ON WHO CAN KNOW WHAT. The filesystem
// belongs to the caller (this module is pure per CR-3 and will not grow a `readdir`), so the WALK
// stays in the test — but the CONTRACT it walks to moves here, as data plus a predicate, and the
// test drives its own listing through it. The two can no longer drift by editing one literal: a
// new top-level `src/`, or a `.jsx` production file, turns the suite red instead of quietly
// shrinking what "no offenders" covers.
//
// EXCLUDED-BY-DESIGN IS NOT UNCOVERED, and the distinction is inc.113's. `__tests__` is skipped on
// purpose — the module doc says a test MAY call the reader two-arg — and `node_modules` is not
// ours. Reporting either would train the reader to ignore the list, which is how a real `src/`
// would then get ignored too.

// Q84 inc.115 — THE PERIMETER MOVED OUT OF THIS FILE, and the move is the finding, not a tidy-up.
// The WRITE door (`payloadWriters.ts`, inc.106) kept its own hand-copied roots and extension filter
// in its own test — the same two literals inc.114 had just proven wrong here, still wrong there. A
// perimeter that belongs to one guard is a perimeter the other guard copies. It now lives in
// `./scanPerimeter`, owned once, imported by both doors; these re-exports keep this module's
// existing importers unchanged.
export {
  SCANNED_ROOTS,
  SOURCE_FILE,
  scannedByWalk,
  unscannedSources,
  unscannedNotice,
} from "./scanPerimeter";

/** This module's name in an `unscannedNotice` — the notice must say WHICH door went blind. */
export const READER_GATE_GUARD = "the payload-read gate";

function aliasNames(text: string): { names: string[]; ambiguous: boolean } {
  const found = new Set<string>();
  const asBinding = new RegExp(`(?<![\\w$.])${READER}\\s+as\\s+([A-Za-z_$][\\w$]*)`, "g");
  for (let m = asBinding.exec(text); m; m = asBinding.exec(text)) found.add(m[1]);
  const assigned = new RegExp(
    `(?<![\\w$.])(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=;]*)?=\\s*${READER}(?![\\w$.(])`,
    "g",
  );
  for (let m = assigned.exec(text); m; m = assigned.exec(text)) found.add(m[1]);

  const names: string[] = [];
  let ambiguous = false;
  for (const name of found) {
    if (declarationEnds(text, name).length > 1 || writtenTo(text, name)) ambiguous = true;
    else names.push(name);
  }
  return { names: names.sort(), ambiguous };
}
