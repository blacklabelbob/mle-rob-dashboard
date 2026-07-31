// Q84 inc.19 — the record ids a ledger row names are addresses, and until now they
// were inert text. Pure per CR-3: no clock, no network, no Supabase, no fetch.
//
// The observed shape, live on prod flag #133 today (inc.18 wrote it):
//
//   → “Dixith” is not a company in the CRM — it names a person: Dixith Magadiev
//     [P-1010] → C-2006 — put that person's company in Notion's “Company Meeting with”
//   → no CRM org is named exactly “Omega Title”, but one is the same name plus a
//     qualifier: Omega Title (FL) [C-2019] — confirm it is the same company
//
// inc.18's whole point was that each near-miss row names the ONE record a human should
// go confirm instead of creating a second. Rob reads that sentence in a browser, on a
// page where every other record reference is a link, and then has to go find the org
// himself — the same gap inc.13 closed for the meeting list ("a ledger row Rob reads in
// a browser told him to run a terminal command"). The fix is not new text: the ids are
// already correct and already printed. They just have to be clickable where he reads them.
//
// Deliberately narrow: this linkifies ids the CRM itself minted (`C-####`, `P-####`) and
// NOTHING else. It does not linkify company names, domains, or Notion titles — a name is
// ambiguous by construction (that ambiguity is the finding), and guessing a target would
// send Rob to the wrong record, which is exactly the mistake the near-miss bucket exists
// to prevent. An id is unambiguous or it is not a link.

/** One piece of a finding's detail: plain prose, or an id that addresses a record. */
export type DetailSegment =
  | { text: string; href?: undefined }
  | { text: string; href: string };

/**
 * `C-2019` → companies, `P-1010` → people. Kept as data rather than an if-chain so a
 * third record family (deals, meetings) is one line and cannot forget the boundary rule.
 */
const RECORD_ROUTES: Record<string, string> = {
  C: "/companies",
  P: "/people",
};

/**
 * The id shape, with BOTH boundaries asserted, and that is the load-bearing part:
 *
 *   - left: not preceded by a word character or a hyphen, so `ABC-2019` and `MLE-2026-100123`
 *     (a real invoice number on this CRM) never yield a bogus `/companies/C-...` link.
 *   - right: not followed by a word character or a hyphen, so `C-2019-draft` is left alone.
 *
 * Brackets, arrows, spaces and end-of-string all pass, which covers every form inc.18
 * actually emits (`[C-2019]`, `→ C-2006`, `[P-1010] → C-2006`).
 */
const RECORD_ID = /(^|[^\w-])([CP]-\d+)(?![\w-])/g;

/**
 * Split a finding's detail into renderable segments, in order, losing nothing.
 *
 * Concatenating every returned `text` reproduces the input exactly — pinned by test,
 * because the alternative failure is silent: a regex that eats a character would quietly
 * corrupt the sentence Rob is reading rather than throw.
 *
 * Empty input yields an empty list (nothing to render), never a segment of `""`.
 */
export function linkifyRecordIds(detail: string): DetailSegment[] {
  if (!detail) return [];

  const out: DetailSegment[] = [];
  let cursor = 0;

  // `RECORD_ID` is module-level and /g, so lastIndex must be reset per call — a shared
  // stateful regex is how "works once, skips the second row" bugs happen.
  RECORD_ID.lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = RECORD_ID.exec(detail)) !== null) {
    const [, lead, id] = m;
    // The lead char is part of the prose, not the id — it is only matched to prove the
    // left boundary. It goes back into the preceding text segment verbatim.
    const start = m.index + lead.length;
    if (start > cursor) out.push({ text: detail.slice(cursor, start) });

    const route = RECORD_ROUTES[id[0]];
    // Unreachable while the character class and the table agree; if they ever drift, the
    // id renders as the plain text it already was rather than linking to `/undefined/...`.
    out.push(route ? { text: id, href: `${route}/${id}` } : { text: id });
    cursor = start + id.length;
  }

  if (cursor < detail.length) out.push({ text: detail.slice(cursor) });
  return out;
}
