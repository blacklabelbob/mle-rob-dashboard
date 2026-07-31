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

// Q84 inc.20 — the SAME page prints a record reference in a second place, and there the
// rule was inverted: `flagEntityHref` below replaces `href={`/people/${f.entity_id}`}`,
// which the ledger applied to every flag whose `entity_id` was non-null.
//
// Measured on prod, not assumed: all 16 flags that carry an `entity_id` carry a SLUG —
// `cg-roofing-group`, `will`, `derm-clinic-pilot`, `spinoff-homeclonevault`,
// `deal-gulf-coast-equity-phase4`. Not one is a `P-####`. So the entity-name link was
// dead on 100% of the rows that had it (10 open today), including the two equity rows
// Rob asked for in dev_chat #53. `/people/P-1010` renders Dixith Magadiev;
// `/people/deal-gulf-coast-equity-phase4` renders Next's notFound.
//
// The narrow rule is inc.19's, unchanged: link ids the CRM minted, never a name. A slug
// is a name with the spaces removed — `derm-clinic-pilot` and `deal-gulf-coast-equity-phase4`
// have no record at all, and `cg-roofing-group` only LOOKS resolvable. Sending Rob to a
// guessed record is worse than sending him nowhere, so an unrecognised entity_id renders
// as plain text, exactly as `entity_id: null` already did.

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

/**
 * Where a flag's own `entity_id` points, or `null` when it does not address a record.
 *
 * Anchored (`^…$`) rather than scanned: this is one whole id, not prose. A value like
 * `deal-gulf-coast-equity-phase4` contains no id and must not half-match; a hypothetical
 * `cg-C-2019` is not the id `C-2019` either.
 *
 * Off the same `RECORD_ROUTES` table the detail linkifier uses, so a third record family
 * lights up in both places at once and the two can never disagree about where `C-2019` lives.
 */
export function flagEntityHref(entityId: string | null | undefined): string | null {
  if (!entityId) return null;
  const m = /^([CP])-\d+$/.exec(entityId);
  if (!m) return null;
  const route = RECORD_ROUTES[m[1]];
  return route ? `${route}/${entityId}` : null;
}

// Q84 inc.22 — inc.19 made the ids INSIDE a detail clickable and inc.20 removed the
// title link that 404'd. Both were right, and together they left a gap on the row that
// started this thread: prod flag #137's `entity_name` is the single string
// `CG Roofing Group / Gulf Coast RE Group` and its `entity_id` is NULL, so the title
// names TWO records and reaches neither. It is not one row: #133 names 4 records
// (`C-2006`, `C-2018`, `C-2019`, `P-1010`), #129 names 6, #128 names 4 — all with a
// null `entity_id`, all reachable only by reading the paragraph underneath.
//
// The fix adds no new claim. It does NOT try to resolve `CG Roofing Group` to a record —
// that name-to-record guess is the exact mistake inc.19/inc.20 refused twice, and a
// slash-separated title cannot address one record anyway. It surfaces the ids the row
// ALREADY prints, in the header, where the row is scanned. Every chip is an id the CRM
// minted and the flag itself wrote; nothing is inferred from a name.

/** A record a flag names, ready to render as a link. */
export type RecordChip = { id: string; href: string };

/**
 * The records a flag addresses, deduped, in the order the flag names them.
 *
 * Sourced from the SAME linkifier that renders the detail, so a chip can never point
 * somewhere the paragraph below it does not — one route table, one boundary rule, one
 * definition of "this is an id".
 *
 * `entityId` is passed so its chip is DROPPED when the title already links it: repeating
 * the id Rob just clicked is noise, and noise on this list is how a real finding gets
 * scrolled past. When `entityId` is a slug (every flag on prod that has one), it is not a
 * link anywhere, so nothing is dropped.
 *
 * Uncapped on purpose — #129 names 6 records and truncating to "the first 3" would print
 * a count the row does not have. These ids are already on screen; this only makes them
 * reachable.
 */
export function flagRecordChips(
  entityId: string | null | undefined,
  detail: string | null | undefined,
): RecordChip[] {
  const seen = new Set<string>();
  // Only skip the entity id when it is genuinely rendered as a link above. A slug
  // entity_id renders as plain text, so an id inside the detail is still the only way in.
  if (entityId && flagEntityHref(entityId)) seen.add(entityId);

  const out: RecordChip[] = [];
  for (const seg of linkifyRecordIds(detail ?? "")) {
    if (!seg.href || seen.has(seg.text)) continue;
    seen.add(seg.text);
    out.push({ id: seg.text, href: seg.href });
  }
  return out;
}
