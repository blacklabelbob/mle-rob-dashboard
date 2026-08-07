/**
 * Q85 inc.19 — the hole `supersede.ts` names in its own second bullet: **"no key → insert,
 * exactly as before. Unkeyed callers are untouched."**
 *
 * That rule is right for what it was written for. What it leaves open is the case measured on
 * prod this run: a KEYED, self-maintaining finding and an UNKEYED hand-filed one, both open,
 * both about the same three humans, disagreeing on the count a reader scans for.
 *
 *   #213  `meeting-archive/person-proposals`  "2 meeting attendee(s) to propose · 1 that must NOT become a record"
 *   #219  (no key, filed by hand by inc.18)   "Only ONE of the two unmatched meeting attendees should become a person"
 *
 * Both name “Joseph Green”, “Dix thedev08” and P-1010. #213 is re-minted every `check:archive`
 * and will track the truth; #219 is frozen at the moment it was typed and is already the older
 * of the two readings. This is the #132/#134/#136 disease that `personFinding.ts` was built to
 * cure, arriving through the one door that module cannot watch — the ledger POST an increment
 * makes directly, under the FINDINGS PROTOCOL, with no key on it.
 *
 * WHAT THIS DOES NOT DO. It does not forbid unkeyed rows: the findings protocol depends on them,
 * and most carry something no keyed filer knows. It does not compare prose, score similarity, or
 * guess. It asks ONE question with a yes/no answer — *does this unkeyed row name any subject the
 * keyed row does not?* If it names something new, it is carrying new information and is left
 * alone. Only when its subjects are a subset of a keyed row's is it a restatement, and even then
 * the output is a RECOMMENDATION a human applies, because closing a row on Rob's to-do list is
 * his call and the note it leaves says so.
 *
 * PURE (CR-3): no clock, no network, no Supabase, no fetch. The caller reads the ledger.
 */

import type { FlagStatus } from "./supersede";

/** A ledger row as this module needs it — the caller's read, narrowed. */
export type LedgerFlagRow = {
  id: number;
  status: FlagStatus;
  /** `null` for the hand-filed rows this module exists to notice. */
  dedupeKey: string | null;
  entityName: string | null;
  title: string | null;
  detail: string | null;
};

/**
 * A subject is a thing the ledger row is ABOUT, and only two shapes count:
 *
 *   - a record id — `P-1010`, `C-2019` — because that is the CRM's own name for a record and
 *     two rows using it are provably about the same one;
 *   - a quoted name — `“Joseph Green”`, `"Dix thedev08"` — because both filers quote the name
 *     they are asking about, and an unquoted proper noun in prose is not distinguishable from
 *     the sentence around it without guessing.
 *
 * Everything else in the prose is ignored on purpose. A looser extractor would make two rows
 * about different problems look alike because they share a company name in a clause.
 */
const RECORD_ID = /\b[CP]-\d{3,}\b/g;
const QUOTED = /[“"]([^”"\n]{2,60})[”"]/g;

/** Case- and whitespace-insensitive, so `“Joseph  Green”` and `"joseph green"` are one subject. */
function canon(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Every subject named anywhere in a row's title and detail.
 *
 * Returned as a sorted array rather than a Set so a caller can print it and a test can pin it;
 * duplicates are collapsed because a name repeated under two headings is still one subject.
 */
export function subjectsOf(row: Pick<LedgerFlagRow, "title" | "detail">): string[] {
  const text = `${row.title ?? ""}\n${row.detail ?? ""}`;
  const found = new Set<string>();
  for (const m of text.matchAll(RECORD_ID)) found.add(m[0].toUpperCase());
  for (const m of text.matchAll(QUOTED)) {
    const c = canon(m[1]);
    // A quoted sentence is not a subject. Names are short; the ledger's prose quotes whole
    // clauses ("Company Meeting with", "Create the person first") and those are caught by the
    // subset test below only when the keyed row happens to quote them too — which is the
    // correct outcome, because then both rows really are quoting the same thing.
    if (c) found.add(c);
  }
  return [...found].sort();
}

/**
 * Q85 inc.19, SECOND PASS — what the first live run against prod taught, before anything was
 * applied.
 *
 * The subset test alone offered to supersede #178 and #192 with #176. All three are about
 * C-2019 and NOTHING else: "two books disagree about who C-2019 is", "C-2019 asserts one Omega
 * domain while the archive names two", and "C-2019 reads unlit and its seven people are missing".
 * Three genuinely different findings that share one company. Applying that plan would have
 * closed two live problems because a third problem mentioned the same org.
 *
 * The flaw is precise: **a record id is the row's ENTITY, not its subject matter.** Every
 * finding about a company names that company, so containment on ids alone is guaranteed, not
 * evidence. So a restatement now additionally requires the shared set to carry at least one
 * QUOTED NAME — the thing a filer quotes because it is what the row is asking about. #176 and
 * #178 share no quoted name and are correctly left alone.
 */
function isQuotedName(subject: string): boolean {
  return !RECORD_ID_EXACT.test(subject);
}
const RECORD_ID_EXACT = /^[CP]-\d{3,}$/;

export type Restatement = {
  /** The unkeyed row that says nothing the survivor does not. */
  restatedId: number;
  /** The keyed row that will keep saying it, correctly, on every re-run. */
  survivorId: number;
  survivorKey: string;
  /** The subjects both rows name — the evidence for the call, printed, never summarised. */
  sharedSubjects: string[];
};

/**
 * Unkeyed open rows whose subjects are wholly contained in one keyed open row's.
 *
 * REFUSES ON AMBIGUITY. If two keyed rows both contain an unkeyed row's subjects, nothing is
 * emitted for it: picking one would be this module deciding which finding owns a human, and the
 * whole point of the subset test is that it never guesses. Such a row is reported by
 * `ambiguousRestatements` instead, for a person to read.
 *
 * Resolved rows on both sides are skipped. A closed row is Rob's judgement and superseding it
 * would overwrite his note; a finding that only survives in a closed keyed row is not surviving.
 */
export function findRestatements(rows: LedgerFlagRow[]): Restatement[] {
  const out: Restatement[] = [];
  for (const { row, keepers } of candidatePairs(rows)) {
    if (keepers.length !== 1) continue;
    const k = keepers[0];
    out.push({
      restatedId: row.id,
      survivorId: k.row.id,
      survivorKey: k.row.dedupeKey as string,
      sharedSubjects: k.shared,
    });
  }
  return out.sort((a, b) => a.restatedId - b.restatedId);
}

/** The rows the subset test matched more than once — reported, never auto-applied. */
export function ambiguousRestatements(
  rows: LedgerFlagRow[]
): { restatedId: number; survivorIds: number[] }[] {
  const out: { restatedId: number; survivorIds: number[] }[] = [];
  for (const { row, keepers } of candidatePairs(rows)) {
    if (keepers.length < 2) continue;
    out.push({ restatedId: row.id, survivorIds: keepers.map((k) => k.row.id).sort((a, b) => a - b) });
  }
  return out.sort((a, b) => a.restatedId - b.restatedId);
}

function candidatePairs(rows: LedgerFlagRow[]) {
  const open = rows.filter((r) => r.status === "open");
  const keyed = open.filter((r) => typeof r.dedupeKey === "string" && r.dedupeKey.length > 0);
  const unkeyed = open.filter((r) => !r.dedupeKey);
  const subjects = new Map<number, string[]>();
  for (const r of open) subjects.set(r.id, subjectsOf(r));

  return unkeyed.flatMap((row) => {
    const mine = subjects.get(row.id) ?? [];
    // A row naming no subject at all is never a restatement. The empty set is a subset of
    // everything, and that arithmetic would supersede every prose-only row on the ledger.
    if (mine.length === 0) return [];
    // ...and a row naming ONLY record ids is never a restatement either. See `isQuotedName`:
    // the id is which company the row is filed against, which every sibling finding shares.
    if (!mine.some(isQuotedName)) return [];
    const keepers = keyed
      .filter((k) => k.entityName != null && k.entityName === row.entityName)
      .map((k) => ({ row: k, theirs: subjects.get(k.id) ?? [] }))
      .filter((k) => mine.every((s) => k.theirs.includes(s)))
      .map((k) => ({ row: k.row, shared: mine }));
    return [{ row, keepers }];
  });
}
