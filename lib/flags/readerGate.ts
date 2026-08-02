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

/** A source file as read off disk. `path` is repo-relative, with `/` separators. */
export type SourceFile = {
  path: string;
  text: string;
};

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
  const needle = `${READER}(`;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) {
    if (/function\s+$/.test(text.slice(Math.max(0, i - 12), i))) continue;
    const args = scanArgs(text, i + needle.length);
    if (args) lists.push(args);
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

/**
 * The initializer of `const|let|var <name> = …` in the same file, or null.
 *
 * Null covers four honest ignorances that must not read as a mismatch: no declaration here (the
 * row is imported, a parameter, or destructured), more than one declaration of the name (which of
 * them reached the call is a scope question this cannot answer), an unterminated initializer, and
 * a name written to after it is declared (inc.110 — the declaration is then no longer what the
 * call received).
 *
 * LIMIT, stated rather than covered up: textual and file-local. A shadowed name in a nested scope
 * resolves to whichever single declaration exists.
 */
function declaredInitializer(text: string, name: string): string | null {
  const decl = new RegExp(`(?<![\\w$.])(?:const|let|var)\\s+${name}\\s*(?::[^=;]*)?=`, "g");
  let found: number | null = null;
  for (let m = decl.exec(text); m; m = decl.exec(text)) {
    if (found !== null) return null; // declared twice — which one reached the call is not knowable here
    found = m.index + m[0].length;
  }
  if (found === null) return null;
  if (writtenTo(text, name)) return null; // the declaration is no longer the whole story
  return scanInitializer(text, found);
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

/**
 * What the row argument actually says: itself when written at the call site, its declaration when
 * passed by name, or null when this file cannot read it and must therefore say nothing.
 */
function rowEvidence(fileText: string, rowArg: string): string | null {
  const name = bareIdentifier(rowArg);
  if (!name) return rowArg;
  return declaredInitializer(fileText, name);
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
