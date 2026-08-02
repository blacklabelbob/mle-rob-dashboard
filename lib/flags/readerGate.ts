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

/**
 * Files where a gated reader call hands over a row that never mentions the object the payload
 * was read off — a row from somewhere else, or a literal standing in for one.
 *
 * Separate from `ungatedReaderCallers` on purpose: that one names calls that show Rob too much,
 * this one names calls that grade the wrong finding. A file can offend both lists.
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
        return !!root && !mentions(row, root);
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
