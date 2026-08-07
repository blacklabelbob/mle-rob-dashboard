/**
 * Q85 inc.5 — the archive read finally carries WHO WAS IN THE ROOM.
 *
 * Q85's DoD says a meeting must land on the right org **AND person**. Four increments got the
 * org half moving (Notion's company field → host → title name) and the person half never moved
 * a millimetre, for one structural reason: `ArchiveRowDetail` carried no attendees at all. The
 * planner could not have resolved a person if it wanted to — there was nothing to resolve from.
 *
 * The Notion archive has carried the answer the whole time, in four columns this module is the
 * first thing to read: `Contact Name`, `Non MLE Attendees`, `MLE Attendees`, `Sales Rep`.
 *
 * WHY SIDE IS READ, NEVER INFERRED. The two internal columns are internal *by the field's own
 * meaning* — `MLE Attendees` is a multi_select of our own people, `Sales Rep` is a Notion people
 * property. So this module never guesses whether a human is ours; the column it was typed into
 * says so. That matters more than it sounds: Rob and Will are on both sides of every meeting,
 * and attaching "Rob Acheson" to a customer record as the person the meeting was with is the
 * exact wrong write — it would make every company look like we met ourselves.
 *
 * WHAT IT REFUSES, on the same rule the org half already runs on (inc.4's two-token floor):
 * a single-token name IDENTIFIES NOBODY. Live prod carries `Alex`, `Chai`, `Shasta`, `Dani`,
 * `Michael` in these columns — first names with no surname, several of them visibly truncated.
 * A CRM with more than one Alex resolves that to a coin flip, and a call welded onto the wrong
 * person is unrecoverable. Those names are still CARRIED (they are real evidence a human was
 * there, and a reader can close them in seconds) but they are marked `identifying: false`, and
 * a caller that resolves people is expected to treat them as a question, never a match.
 *
 * PURE (CR-3): no clock, no network, no Notion, no Supabase. It reads fields the row already
 * holds and writes nothing. Name normalization is `normalizeName` from `lib/dedup/match`,
 * IMPORTED — this repo has already paid twice to delete a duplicated name predicate, and a
 * fourth ladder that could drift from the other three is the same defect.
 */

import { normalizeName } from "@/lib/dedup/match";

/** The four Notion columns, exactly as the archive stores them. All optional — most rows are empty. */
export type ArchiveAttendeeFields = {
  /** `Contact Name` rich_text. Free-form, often one first name. */
  contactName?: string;
  /** `Non MLE Attendees` rich_text. Comma-separated in practice: "Alex Greenwood, Chris Acheson, Shasta". */
  nonMleAttendees?: string;
  /** `MLE Attendees` multi_select — our own people, internal by the column's meaning. */
  mleAttendees?: string[];
  /** `Sales Rep` Notion people property — ours, same reasoning. */
  salesRep?: string[];
};

/** Which side of the table. Read off the source column, never inferred from the name. */
export type AttendeeSide = "counterparty" | "internal";

/** The column a name came from, carried so a reader can go fix the field it was typed into. */
export type AttendeeSource = "Contact Name" | "Non MLE Attendees" | "MLE Attendees" | "Sales Rep";

export type ArchiveAttendee = {
  /** As written, whitespace-collapsed. Never rewritten — the archive's spelling is the evidence. */
  name: string;
  side: AttendeeSide;
  source: AttendeeSource;
  /**
   * `false` when the name carries fewer than two significant tokens. Such a name is real
   * evidence a human attended and is USELESS for resolving which human — a caller may show it,
   * must not match on it.
   */
  identifying: boolean;
};

/** Two tokens, the same floor the org half runs on (inc.4). One token identifies nobody. */
const IDENTIFYING_TOKEN_FLOOR = 2;

/**
 * Separators that actually appear in these columns: comma, semicolon, slash, newline, and a
 * spelled-out " and ". Deliberately NOT a bare space — "Alex Greenwood" is one person.
 */
const SEPARATORS = /\s*(?:,|;|\/|\n|\r|\band\b|&)\s*/i;

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tokensOf(name: string): string[] {
  return normalizeName(name).split(" ").filter(Boolean);
}

function isIdentifying(name: string): boolean {
  return tokensOf(name).length >= IDENTIFYING_TOKEN_FLOOR;
}

function splitNames(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(SEPARATORS)
    .map(collapse)
    .filter(Boolean);
}

/**
 * Every human the row names, both sides, deduped.
 *
 * Dedupe is by normalized name, first source wins — live rows genuinely repeat a person across
 * columns (one row carries `Dixith` in BOTH `Contact Name` and `Non MLE Attendees`), and two
 * rows for one human would read as a two-person meeting.
 *
 * ONE RECLASSIFICATION, and it only ever moves a name TOWARD internal: a counterparty entry
 * whose name matches somebody in the internal columns is our own person typed into the wrong
 * box. Erring that direction is safe — the cost is a person we fail to attach — where the
 * other direction would put a customer's call on a colleague's record.
 */
export function readArchiveAttendees(fields: ArchiveAttendeeFields): ArchiveAttendee[] {
  const internalNames = [
    ...(fields.mleAttendees ?? []).map((n) => ({ name: collapse(n), source: "MLE Attendees" as const })),
    ...(fields.salesRep ?? []).map((n) => ({ name: collapse(n), source: "Sales Rep" as const })),
  ].filter((entry) => entry.name);

  const counterpartyNames = [
    ...splitNames(fields.contactName).map((name) => ({ name, source: "Contact Name" as const })),
    ...splitNames(fields.nonMleAttendees).map((name) => ({ name, source: "Non MLE Attendees" as const })),
  ];

  const internalKeys = new Set(internalNames.map((entry) => normalizeName(entry.name)));

  const out: ArchiveAttendee[] = [];
  const seen = new Set<string>();

  const push = (name: string, source: AttendeeSource, side: AttendeeSide) => {
    const key = normalizeName(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ name, side, source, identifying: isIdentifying(name) });
  };

  // Internal first, so the reclassification below is a lookup rather than a second pass.
  for (const entry of internalNames) push(entry.name, entry.source, "internal");
  for (const entry of counterpartyNames) {
    push(entry.name, entry.source, internalKeys.has(normalizeName(entry.name)) ? "internal" : "counterparty");
  }

  return out;
}

/**
 * The subset a person resolver may act on: the other side of the table, named well enough to
 * be one human. Everything this drops is still in `readArchiveAttendees` for a reader to see —
 * dropping a name from resolution is not the same as pretending nobody was there.
 */
export function resolvableCounterparties(attendees: ArchiveAttendee[]): ArchiveAttendee[] {
  return attendees.filter((a) => a.side === "counterparty" && a.identifying);
}

export type AttendeeCoverage = {
  /** Rows naming at least one human at all, either side. */
  withAnyAttendee: number;
  /** Rows naming at least one counterparty human, identifying or not. */
  withCounterparty: number;
  /** Rows a person resolver could actually act on today. The only number that predicts work. */
  withResolvableCounterparty: number;
  /**
   * Rows whose ONLY counterparty is a single-token name. These are the cheap human fix — a
   * surname typed into Notion converts each one into resolvable work.
   */
  counterpartyNotIdentifying: number;
  total: number;
};

/** Honest denominators for a report: how far the person half can actually reach on this data. */
export function summarizeAttendeeCoverage(rows: ArchiveAttendeeFields[]): AttendeeCoverage {
  let withAnyAttendee = 0;
  let withCounterparty = 0;
  let withResolvableCounterparty = 0;
  let counterpartyNotIdentifying = 0;

  for (const row of rows) {
    const attendees = readArchiveAttendees(row);
    if (attendees.length) withAnyAttendee += 1;
    const counterparties = attendees.filter((a) => a.side === "counterparty");
    if (!counterparties.length) continue;
    withCounterparty += 1;
    if (counterparties.some((a) => a.identifying)) withResolvableCounterparty += 1;
    else counterpartyNotIdentifying += 1;
  }

  return {
    withAnyAttendee,
    withCounterparty,
    withResolvableCounterparty,
    counterpartyNotIdentifying,
    total: rows.length,
  };
}
