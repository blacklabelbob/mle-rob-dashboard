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

// Q84 inc.23 — inc.20 renders a slug `entity_id` as plain text, and gave the reason:
// "a slug is a name with the spaces removed … `cg-roofing-group` only LOOKS resolvable."
// That was the right call on the evidence inc.20 had — the flag row alone. It is wrong
// on the evidence the CRM holds: the Q70 renumber PERSISTED the old slug, and `legacy_slug`
// is populated on every one of the 19 orgs and 22 people on prod today.
//
//   cg-roofing-group → C-2017     spinoff-homeclonevault → C-2002     will → P-1008
//   the-title-base   → C-2010     naples-spine-joint     → C-2011     jonathan-polk → P-1014
//
// So resolving one is not a guess about a name — it is reading a key the CRM itself wrote
// down when it renumbered the record. That is the whole distinction inc.19/inc.20 drew:
// `CG Roofing Group` (prose, ambiguous, never linked) vs an identifier the CRM minted.
// 12 of the 16 slug-carrying flags reach their record this way, including the two equity
// rows Rob asked about in dev_chat #53. `deal-gulf-coast-equity-phase4` still resolves to
// nothing — it names a DEAL, no org or person carries that slug — and stays plain text,
// which is the correct answer, not a failure.
//
// The index is built server-side (the flags GET) and passed in, so this file stays pure.

/** `legacy_slug` → the record id the CRM renumbered it to. */
export type SlugIndex = Record<string, string>;

/**
 * Build the slug→id index from rows the caller read, dropping any slug claimed by more
 * than one record.
 *
 * A collision is refused rather than resolved: orgs and people are separate tables with
 * no shared uniqueness constraint, so nothing stops both from carrying `caleb-green` one
 * day. Picking whichever row was read first would send Rob to the wrong record — the exact
 * failure this whole thread exists to prevent — and it would do it silently, since both
 * targets render a real page. A dropped slug just renders as the plain text it already was.
 */
export function buildSlugIndex(rows: { id: string; legacy_slug: string | null }[]): SlugIndex {
  const out: SlugIndex = {};
  const contested = new Set<string>();
  for (const r of rows) {
    if (!r.legacy_slug || !r.id) continue;
    if (contested.has(r.legacy_slug)) continue;
    const prior = out[r.legacy_slug];
    // Same slug, same id read twice is not a conflict — same slug, DIFFERENT id is.
    if (prior !== undefined && prior !== r.id) {
      delete out[r.legacy_slug];
      contested.add(r.legacy_slug);
      continue;
    }
    out[r.legacy_slug] = r.id;
  }
  return out;
}

/**
 * The record id a flag's `entity_id` addresses, or `null` when it addresses none.
 *
 * An already-minted id (`C-2017`) is itself. A slug resolves only through `slugIndex`,
 * and only to a value that is itself a minted id — a `legacy_slug` row pointing at
 * something malformed must not become a link to a page that does not exist.
 */
export function resolveFlagEntityId(
  entityId: string | null | undefined,
  slugIndex: SlugIndex | null | undefined,
): string | null {
  if (!entityId) return null;
  if (flagEntityHref(entityId)) return entityId;
  const mapped = slugIndex?.[entityId];
  return mapped && flagEntityHref(mapped) ? mapped : null;
}

// Q84 inc.24 — inc.23 made the slug rows REACHABLE from the Overview. The traffic in the
// other direction was still cut, and that is the direction Rob asked for by name.
//
// A record page renders its findings by asking `/api/admin/flags?person=C-2017`, and the
// route filters `entity_id IN (C-2017, …)` — the ids the CRM mints TODAY. Every flag that
// carries an `entity_id` on prod carries the PRE-renumber slug (`cg-roofing-group`), so
// that filter matches nothing: **all 16 of them render on no record page at all.** The CG
// Roofing registry conflict — the row Rob himself asked to see on Caleb's page and his two
// companies' pages (dev_chat #33) — is on the Overview and nowhere else.
//
// That makes the Overview checkbox a data-loss control rather than a filing one. It reads
// "mark read — clears from Overview, stays on the record until resolved", and marking it
// read clears the ONLY surface the finding has. inc.20 fixed exactly this lie for
// proposals; the Q70 renumber quietly recreated it for every slug-carrying flag.
//
// The expansion is deliberately the SAFE direction of the same lookup inc.23 built. There
// it resolved slug → id and refused a contested slug, because sending Rob to the wrong
// record is worse than sending him nowhere. Here it goes id → its own slug: a record only
// ever contributes the slug the CRM wrote on that record, so it cannot pull in a finding
// belonging to a different one. If two records did share a slug, the finding would surface
// on BOTH pages — visible and self-correcting, never hidden — which is why this direction
// does not drop a collision the way `buildSlugIndex` does.

/**
 * The `entity_id` values a record-page query must match: the ids asked for, plus the
 * legacy slug each of those records carries.
 *
 * Pure per CR-3 — the caller reads the rows. The result is a set for a Supabase `.in()`
 * filter; order is fixed anyway (the ids as given, then the slugs in row order, deduped)
 * so the same inputs always produce the same filter.
 */
export function expandEntityFilter(
  ids: string[],
  rows: { id: string; legacy_slug: string | null }[],
): string[] {
  const wanted = new Set(ids);
  const out = [...wanted];
  for (const r of rows) {
    // Only slugs belonging to a record the caller actually asked for, and never a slug
    // that is already one of the ids (a no-op that would just widen nothing).
    if (!r.legacy_slug || !wanted.has(r.id) || wanted.has(r.legacy_slug)) continue;
    if (!out.includes(r.legacy_slug)) out.push(r.legacy_slug);
  }
  return out;
}

// Q84 inc.25 — inc.24 named the one `entity_id` left on prod that reaches nothing in
// EITHER direction, and this closes it: `deal-gulf-coast-equity-phase4` on flag #83,
// the Gulf Coast 30% equity row Rob raised in dev-chat #53.
//
// inc.20 read that value correctly given what it could see — "a slug is a name with the
// spaces removed" — and inc.23 said it "resolves to nothing … no org or person carries
// that slug", which is true and was the wrong table. It is not a slug of anything: it is
// the PRIMARY KEY of a row in `deals`, and `/deals/deal-gulf-coast-equity-phase4` is a
// real page that renders today. All 8 deal ids on prod have this shape (`deal-jonathan-polk`,
// `deal-cg-roofing-group`), because deals were never renumbered by Q70 and so have no
// `legacy_slug` to join through.
//
// So this is the SAME distinction the whole thread turns on, not a loosening of it: the id
// is not matched by pattern — `deal-` as a prefix rule would link `deal-whatever-someone-typed`
// to a 404 — it is confirmed against the deals the CRM actually holds. Present in the table
// or plain text, exactly as an unclaimed legacy slug already behaves.
//
// The two halves land together on purpose. Linking the ledger row without giving the deal
// page its findings would flip the Overview checkbox on for #83 while its "stays on the
// record until resolved" promise was still false — the precise data-loss lie inc.24 fixed.
// `/deals/[id]` now renders the section, so the promise is true before the control appears.

/** The deal ids the CRM holds — the only proof that `/deals/<id>` resolves. */
export type DealIndex = ReadonlySet<string> | string[] | null | undefined;

/**
 * Where a flag's `entity_id` points when it names a DEAL, or `null` when it does not.
 *
 * Membership-tested, never pattern-matched, for the reason above. Kept separate from
 * `flagEntityHref` because the two answer different questions: that one reads an id whose
 * shape the CRM guarantees (`C-2017`), this one needs evidence the row exists.
 */
export function dealEntityHref(entityId: string | null | undefined, dealIds: DealIndex): string | null {
  if (!entityId || !dealIds) return null;
  // Narrowed on the ARRAY arm, not on `instanceof Set`: `ReadonlySet` is a structural type
  // with no constructor, so `instanceof` compiles but leaves the else-branch typed as the
  // whole union — the compiler catches it here rather than the check silently inverting.
  const has = Array.isArray(dealIds) ? dealIds.includes(entityId) : dealIds.has(entityId);
  return has ? `/deals/${entityId}` : null;
}

/**
 * The single href a flag's title should link to, across every record family — or `null`.
 *
 * One function so the ledger's two render sites (digest and full row) and the read-control
 * gate can never disagree about whether a row has a page. Order is by strength of evidence:
 * an id the CRM minted, then the record that id was renumbered from, then a deal row.
 *
 * `entityRef` is inc.23's already-resolved value (`entity_ref`), passed in rather than
 * recomputed so a client rendering a pre-inc.23 response degrades to plain text, never to
 * a link pointing somewhere else.
 *
 * Q84 inc.82 — `held` closes the last door inc.81 left open. `flagEntityHref` reads an id's
 * SHAPE, and a shape is not a record: an `entity_id` of `P-1043` is well-formed and minted by
 * nobody, so the title linked into Next's "This page could not be found." exactly as the chip
 * did. The deal arm one function up has always demanded membership for the same reason; this
 * gives the org/person arm the same evidence bar. Contract is inc.37's, verbatim: `null` /
 * `undefined` means NOT ASKED and filters nothing (a blipped lookup must leave Rob the ledger
 * he read yesterday, never a page-wide de-linking), an empty set means CONFIRMED NONE. A ref
 * that resolved out of `legacy_slug` came from the CRM's own rows and passes on its own merit.
 */
export function flagTitleHref(
  entityRef: string | null | undefined,
  entityId: string | null | undefined,
  dealIds: DealIndex,
  held?: Iterable<string> | null,
): string | null {
  const confirmed = held === null || held === undefined ? null : new Set(held);
  const direct = flagEntityHref(entityRef);
  if (direct && confirmed && !confirmed.has(entityRef as string)) return dealEntityHref(entityId, dealIds);
  return direct ?? dealEntityHref(entityId, dealIds);
}

// Q84 inc.26 — inc.24 fixed the record-page filter for flags that CARRY an `entity_id`.
// 16 flags do. The other 115 carry `entity_id = NULL`, and for six of them that is not the
// same thing as "addresses no record": they print the ids in the sentence.
//
//   #137 → C-2017, C-2018       #133 → P-1010, C-2006, C-2019, C-2018
//   #129 → six people           #128 → four people      #101/#99 → P-1001, C-2001, P-1043
//
// Eighteen distinct records, every one of them a page that renders, and not one of these
// findings appears on any of them. #137 is the CG Roofing / Gulf Coast row inc.22 gave
// header chips to — Rob can now click THROUGH it to Caleb's companies, but if he opens
// C-2017 first, the finding about it is not there.
//
// This is the SAME evidence rule the whole thread runs on, applied to the filter instead of
// the render: an id the CRM minted, printed by the flag itself, is an address. A name is
// not. #137's `entity_name` is still the un-resolvable string "CG Roofing Group / Gulf
// Coast RE Group" and is still never matched — nothing here reads a name.
//
// Deliberately NOT paired with the read control this time, and that asymmetry is the point.
// inc.25 shipped its link and its record surface together because linking first would have
// turned the Overview checkbox into a delete button. This direction is the safe one: a
// finding GAINS a surface it did not have, while `overviewReadControl` still needs
// `entity_ref` + a resolving href, which a NULL-entity row has neither of — so the checkbox
// stays off and no row can be cleared into nowhere. Turning it on is inc.27's job.

/**
 * The minted record ids a flag names anywhere a human reads it — title and detail, deduped,
 * in the order they are printed.
 *
 * Off the same linkifier the detail renders with, so this can never claim a row names a
 * record the paragraph below does not link. Title is scanned too because a finding is free
 * to put the id in its header; only prose IS printed there today, and this costs nothing.
 */
export function flagNamedRecordIds(
  title: string | null | undefined,
  detail: string | null | undefined,
): string[] {
  const out: string[] = [];
  for (const field of [title, detail]) {
    for (const seg of linkifyRecordIds(field ?? "")) {
      if (seg.href && !out.includes(seg.text)) out.push(seg.text);
    }
  }
  return out;
}

/**
 * The flags a record page should show: the ones filed against it, plus the ones that name it.
 *
 * `entityFilter` is inc.24's widened list (the ids asked for + the slugs they were renumbered
 * from) and stays an exact match — a row filed against a record is on that record's page no
 * matter what its text says. `wanted` is the minted ids only; a NULL-entity row joins by
 * naming one of them.
 *
 * Pure per CR-3 and order-preserving: the caller hands rows already ordered by the database
 * (open first, then severity, then date) and this only drops, so one ordering serves both
 * arms and there is no comparator here to drift from the one in SQL.
 *
 * Q84 inc.39 — the CONTRACT on `wanted`, because `flagHasRecordSurface` is pinned as the same
 * predicate and that pin is only sound while this holds: **every id in `wanted` must be a
 * record the CRM holds.** This function cannot check it (pure, no network), so it is stated
 * here and guaranteed upstream. A `wanted` carrying an id the CRM does not hold would keep a
 * row on a page while `flagHasRecordSurface` — which intersects against the CRM's own set —
 * calls that same row page-less, and the Overview would tell Rob to resolve a finding there
 * because it has nowhere else to live. That is inc.27's defect coming back through a side
 * door, so the guarantee is named rather than assumed. See `flagHasRecordSurface`.
 */
export function selectRecordFlags<
  T extends { entity_id: string | null; title?: string | null; detail?: string | null },
>(rows: T[], entityFilter: string[], wanted: string[]): T[] {
  const filed = new Set(entityFilter);
  const asked = new Set(wanted);
  return rows.filter((r) =>
    r.entity_id
      ? filed.has(r.entity_id)
      : flagNamedRecordIds(r.title, r.detail).some((id) => asked.has(id)),
  );
}

// Q84 inc.27 — inc.26 gave those six NULL-entity rows a record surface and deliberately
// left the Overview control alone, on the reasoning that `overviewReadControl` needs an
// `entity_ref` + a resolving href "which a NULL-entity row has neither of — so the checkbox
// stays off". That reasoning was half wrong, and the wrong half is the one Rob reads.
//
// The checkbox was never off: `overviewReadControl` returns `checkbox: true` for every
// non-proposal row regardless. `hasRecord` decides the TOOLTIP's second clause, and for
// these six it now says the opposite of what is true — measured on prod today, flag #137
// (`entity_id: null`, `entity_href: null`) is returned by `/api/admin/flags?entities=C-2017`
// and renders on that company's page, while the Overview tells Rob "it has no record page,
// so resolve it here".
//
// That is the same class of defect inc.20 fixed for proposals and inc.24 for slug rows —
// a control describing an outcome that isn't the real one — only quieter, because here the
// click is SAFE and the caption is what lies. Rob resolves a finding on the Overview that
// he could have worked on the company's page, or leaves it unread because clearing it looks
// like losing it.
//
// The rule is not re-derived here: `flagNamedRecordIds` is the same function inc.26's filter
// keeps rows with, so "the tooltip says it has a record page" and "a record page shows it"
// are one predicate. No name is read; a `titleHref` is still the stronger evidence and is
// checked first.

/**
 * Whether a flag has a record page at all — the tooltip's question, answered with the same
 * evidence the record page's own filter uses.
 *
 * `titleHref` is the caller's already-resolved link (server-side across deals; see
 * `flagTitleHref`). A row without one still has a surface if it NAMES a minted id, because
 * `selectRecordFlags` keeps it on that record's page.
 *
 * Q84 inc.38 — inc.37 proved a minted-LOOKING id is not a record (prod #101 prints `P-1043`,
 * an example inside a quote of Rob's own words, and no such person exists) and threaded the
 * server's confirmed set into the scope marker and the chips. It did not thread it here, so
 * the one remaining reader of the raw set is the control that decides whether checking a box
 * loses a finding: `overviewReadControl`'s second clause. On a row whose only named ids were
 * phantoms this would answer "it has a record page, so it stays there" — the same promise
 * inc.24 found false for slug rows and inc.25 refused to ship before `/deals/[id]` rendered —
 * while `selectRecordFlags` intersects against ids the CRM holds and puts it on no page at all.
 *
 * Stated rather than oversold: **no live row hits this today.** All 131 prod flags were
 * re-read and every named id checked against the 19 orgs + 22 people; #101 is the only row
 * naming a phantom and it also names P-1001 and C-2001, so its tooltip is right either way.
 * This closes the predicate, not an observed lie — the ladder's rule is that an unconfirmed
 * id never decides anything, and this was the last place one still did.
 *
 * `minted` is optional and unproven-by-default, exactly as on `flagNamedScope` and
 * `flagRecordChips`: a caller that cannot say gets today's answer, never a silent drop.
 *
 * Q84 inc.39 — inc.38 pinned this as ONE predicate with `selectRecordFlags`, but only over
 * rows a page ASKED for by its own id. A person's page does not work that way: it fans out
 * through `org_memberships`, so its `wanted` is `[the person, ...every org they belong to]`
 * and a row naming only C-2017 lands on P-1001's page without ever naming P-1001. The
 * question inc.39 was set was whether that door lets the two disagree. **It cannot**, and the
 * reason is structural rather than a property of today's data:
 *
 *   - the org half is guaranteed by the database — `org_memberships_org_id_fkey`, verified on
 *     PROD and not merely in `0003` (this repo has committed-but-unapplied migrations, so the
 *     file is not evidence): `FOREIGN KEY (org_id) REFERENCES orgs(id) ON UPDATE CASCADE ON
 *     DELETE CASCADE`. A membership cannot name an org that is not a record, a deleted org
 *     takes its memberships with it, and — the half that matters on a ladder about the Q70
 *     renumber — an org whose id CHANGES drags the membership to the new id instead of
 *     leaving a stale one behind.
 *   - the page's own half is guaranteed by the page — `app/people/[id]/page.tsx` calls
 *     `notFound()` before it renders, then passes `person.id` off the loaded record, never
 *     the URL text. (`app/companies/[id]/page.tsx` passes `company.id` through the same prop,
 *     resolved the same way.)
 *
 * So every id in `wanted` is an id the CRM holds, `named_ref` is drawn from that same CRM, and
 * a kept row always has a confirmed named id. Measured alongside: 16 memberships on prod, zero
 * dangling. Stated as the reason, not the proof — the constraint is the reason; the count would
 * only ever be a coincidence.
 *
 * Q84 inc.83 — inc.82's own named next, and it is a real one. `selectRecordFlags` has TWO arms
 * and they are EXCLUSIVE: a row with a non-null `entity_id` is matched against the page's filed
 * list and its sentence is never read; only a NULL-entity row joins by NAMING an id. This
 * predicate had one arm and it was inclusive — href OR names — which agreed with the filter only
 * because, before inc.82, an id-shaped `entity_id` always produced a truthy `titleHref` and the
 * name arm was unreachable for a filed row. inc.82 made the server refuse an unminted id, so
 * that early return stopped firing and the fall-through opened: a row FILED on `P-1043` whose
 * detail happens to print `C-2001` would be called page-ful here while `selectRecordFlags` puts
 * it on no page at all — the filed arm looks up `P-1043`, which no page asks for, and never
 * reaches the sentence. That is inc.27's defect through the door inc.82 opened, and it is the
 * more expensive direction: the tooltip would read *"stays on the record until resolved"* while
 * checking the box clears the finding's ONLY surface.
 *
 * `filedEntityId` is the row's own `entity_id`, and its absence keeps the pre-inc.83 answer —
 * the same unproven-by-default contract `minted` carries. Note the asymmetry is deliberate: a
 * falsy `titleHref` on a filed row is not "not asked". `entity_href` ABSENT (a pre-inc.25
 * response) falls back to the shape rule client-side and comes back truthy; a blipped lookup
 * passes `held: null`, which `flagTitleHref` reads as not-asked and links anyway. So reaching
 * here with a filed row and no href means the server was asked and answered no page — and no
 * page's `entityFilter` (its own ids plus the slugs they were renumbered from) can contain an
 * id that resolves to no record. Structural, like the FK above; not a property of today's rows.
 */
export function flagHasRecordSurface(
  titleHref: string | null | undefined,
  title: string | null | undefined,
  detail: string | null | undefined,
  minted?: Iterable<string> | null,
  filedEntityId?: string | null,
): boolean {
  if (titleHref) return true;
  // The FILED arm is exclusive in `selectRecordFlags`; so it is here. See the note above.
  if (filedEntityId) return false;
  return mintedOnly(flagNamedRecordIds(title, detail), minted).length > 0;
}

// Q84 inc.28 — inc.26 put the six NULL-entity rows onto the pages of the records they NAME,
// and inc.27 made the Overview stop calling them page-less. Both were about getting the row
// TO the page. Neither said anything about what the row looks like once it is there, and on
// the page it now reads as that record's own finding.
//
// Prod #137 is the case: `entity_id` NULL, `entity_name` the single string
// "CG Roofing Group / Gulf Coast RE Group", detail naming C-2017 and C-2018. On
// /companies/C-2017 it renders with the same header, the same chips and the same Resolve
// button as C-2017's four filed rows. Nothing on it says the finding is a conflict BETWEEN
// two companies, that it is filed against neither, or that the identical row is also sitting
// on C-2018's page — so resolving it on one page silently clears it from the other, which is
// correct behaviour (one ledger row, one id) described nowhere.
//
// Same evidence rule as every increment in this thread, and it reads NO name: the marker is
// built from `flagNamedRecordIds`, the function `selectRecordFlags` filters with, so a row
// can only be captioned "names C-2018" when it literally prints that id. `entity_name` —
// the ambiguous half — is never parsed, and a row with an `entity_id` gets no marker at all,
// because that row IS filed and the header is telling the truth about it.

/**
 * Keep only the ids the CRM confirmed it holds — or every id, when nobody confirmed anything.
 *
 * The `null`/`undefined` case is not "no records exist", it is "not asked": the Overview
 * digest, a cached response written before inc.37, a unit test handing three arguments. An
 * absent proof is never read as a disproof anywhere on this ladder, and dropping a real
 * record because a lookup was skipped is the worse of the two failures by far.
 */
export function mintedOnly(ids: string[], minted?: Iterable<string> | null): string[] {
  if (minted === null || minted === undefined) return ids;
  const held = new Set(minted);
  return ids.filter((id) => held.has(id));
}

/** Why a NULL-entity finding is on the page being read, and what else it is about. */
export type NamedScope = {
  /** Every minted id the finding names, in print order — the records it spans. */
  named: string[];
  /** The one that is the page being read, when the caller can prove which page that is. */
  here: string | null;
  /** The rest — the records this same row is also sitting on right now. */
  others: string[];
};

/**
 * The scope note for a finding on a record page, or `null` when the row needs none.
 *
 * `null` for a filed row (`entity_id` set): it is filed against a record, its header names
 * that record, and there is nothing to disclose. `null` too when the text names no minted
 * id, which on a record page means the row got there by being filed — belt and braces with
 * the arm above rather than a second rule.
 *
 * `pageId` is the id in the URL. It is optional and unproven-by-default on purpose: the
 * flags route fans a `?person=` query out through org memberships, so a row can legitimately
 * be on a page whose id it does not name. When that happens `here` is `null` and the caller
 * says only what is true — which records the row names — instead of guessing which one is
 * the page.
 *
 * Q84 inc.37 — an id that MATCHES the pattern is not the same thing as a record.
 *
 * Everything on this ladder has been careful that a NAME is never an address. Nothing ever
 * checked the other half: that a minted-looking id is one the CRM actually holds. Prod #101
 * is the case, and it is not a typo — its detail quotes Rob's own instruction, *"the id you
 * now see in the address bar is the one to say out loud (\"pull up P-1043\")"*. `P-1043` is
 * an EXAMPLE inside a sentence, and there is no P-1043: 22 people exist, P-1001..P-1022.
 * Yet it was counted as a record this finding names, so on /people/P-1001 the marker said
 * the row "appears on each named record — one ledger row on every one of those pages" and
 * linked to a dead end, and the Resolve button promised to clear it from there. (That page
 * answers 200 and renders Next's "This page could not be found." screen — a dead end for
 * the reader, not an HTTP 404; the distinction is checked rather than assumed.)
 *
 * `minted` is the server's answer to "which of these ids does the CRM hold" — the same
 * confirm-don't-infer rule inc.25 wrote for deal ids ("an id the table does not have stays
 * plain text"), applied to the ids a flag NAMES. Optional and unproven-by-default like every
 * other argument here: a caller that cannot say gets today's behaviour, never a silent drop.
 */
export function flagNamedScope(
  entityId: string | null | undefined,
  title: string | null | undefined,
  detail: string | null | undefined,
  pageId?: string | null,
  minted?: Iterable<string> | null,
): NamedScope | null {
  if (entityId) return null;
  const named = mintedOnly(flagNamedRecordIds(title, detail), minted);
  if (named.length === 0) return null;
  const here = pageId && named.includes(pageId) ? pageId : null;
  return { named, here, others: named.filter((id) => id !== here) };
}

/**
 * A PostgREST `or=` filter matching the rows either arm above can keep: an `entity_id` in
 * the widened list, or no `entity_id` at all.
 *
 * The null arm is a coarse pre-filter — `selectRecordFlags` does the real work — but it must
 * be a SUPERSET of what that keeps, or a finding disappears at the database instead of at the
 * function that documents why. Values are double-quoted and escaped rather than assumed
 * word-safe: an unquoted comma inside an id would silently split it into two filter terms.
 */
export function entityOrFilter(entityFilter: string[]): string {
  const list = entityFilter.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
  return `entity_id.in.(${list}),entity_id.is.null`;
}

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
 *
 * Q84 inc.29 — `alreadyLinked` extends the one rule this function has always had ("do not
 * print a chip for an id this row already links elsewhere") to the two links inc.28 added
 * underneath it. It is the caller's list because only the caller knows what it rendered:
 * the page being read (a chip to the page you are standing on is a link to nowhere) and
 * every id the scope marker prints as a link one line below. Nothing is HIDDEN by this —
 * each suppressed id is still linkified inside the detail paragraph, which is where the
 * chip's own href came from; the second and third copy of the same link is what goes.
 */
export function flagRecordChips(
  entityId: string | null | undefined,
  detail: string | null | undefined,
  alreadyLinked?: Iterable<string> | null,
  minted?: Iterable<string> | null,
): RecordChip[] {
  const seen = new Set<string>();
  // inc.37: the chips take the same confirmed set as the marker, and they have to — the
  // marker suppresses a chip by LINKING that id (`alreadyLinked`), so filtering one and
  // not the other would hand P-1043 straight back as a chip the moment the sentence
  // stopped printing it. One set, both renders, or the fix undoes itself.
  const held = minted === null || minted === undefined ? null : new Set(minted);
  // Only skip the entity id when it is genuinely rendered as a link above. A slug
  // entity_id renders as plain text, so an id inside the detail is still the only way in.
  if (entityId && flagEntityHref(entityId)) seen.add(entityId);
  for (const id of alreadyLinked ?? []) if (id) seen.add(id);

  const out: RecordChip[] = [];
  for (const seg of linkifyRecordIds(detail ?? "")) {
    if (!seg.href || seen.has(seg.text)) continue;
    if (held && !held.has(seg.text)) continue;
    seen.add(seg.text);
    out.push({ id: seg.text, href: seg.href });
  }
  return out;
}
