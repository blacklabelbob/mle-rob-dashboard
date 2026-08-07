/**
 * Q85 inc.24 — the person half, asked of the rows that ARE ALREADY ON PROD.
 *
 * inc.7 built the person half of the DRAFT path: `draftActivityFromPlan` attaches `personId`
 * when a row names exactly one resolved counterparty, and refuses by name otherwise. That
 * logic is correct and it has never touched a prod row, because the four `meeting` activities
 * on prod were not written by it — they came from Q89 inc.6's hand-authored
 * `data/meetings/*.activity.json` payloads through `publish-meeting-activity.mjs`, and those
 * payloads carry no `personId` field at all.
 *
 * So `activities.person_id` is null on 100% of prod's meeting rows, and the reason is NOT that
 * the resolver refused. Nothing ever asked it. Q85's DoD says "on the right org AND person";
 * the org half has shipped, and the person half is unmeasured on every row it applies to.
 *
 * THIS MODULE ASKS THE QUESTION OF A STORED ROW, and its input is the row itself rather than a
 * second read of Notion. `sourceContext` already carries the attendee columns the archive had
 * (`attendeesMle`, `attendeesOther`, `contactName`, `salesRep`), so re-reading Notion here
 * would put a second ladder on the same rows and let the two answers drift — the same reason
 * `propose-archive-person.mjs` takes its snapshot as an input.
 *
 * IT DECIDES; IT DOES NOT WRITE, and it never invents an attendee. A row that stored no
 * counterparty names is reported as exactly that (`no-counterparties-stored`) — which is a
 * statement about OUR row, not about who was in the room. Reaching back to Notion to fill it
 * would turn a gap in our storage into a claim about the meeting.
 *
 * THE ORG GUARD IS THIS MODULE'S OWN, and it is the rule the draft path does not need. A draft
 * resolves attendees for a row whose company is being decided in the same pass. Here the org is
 * already ON the stored row and is a fact, so a counterparty who resolves to a person at a
 * DIFFERENT org is refused (`cross-org`) rather than attached. Daniella Roach is at `C-2003`;
 * `A-MTG-2026-07-30-MARTINFIERRO` is on `C-2005`. An exact name match is not permission to put
 * a restaurant's call on a person who belongs to another company's record.
 *
 * PURE (CR-3): no clock, no network, no Supabase, no Notion. Callers supply the row and the people.
 */

import { readArchiveAttendees, type ArchiveAttendeeFields } from "./archiveAttendees";
import { resolveRowAttendees } from "./attendeePerson";
import type { CrmPerson } from "./activityPlan";

/**
 * The shape of a stored `activities` row this module needs. Deliberately a narrow structural
 * type rather than the full row: this module has no business seeing a money column, and the
 * compiler agreeing to that is the cheapest guard available.
 */
export type StoredMeetingRow = {
  id: string;
  orgId: string | null;
  personId: string | null;
  sourceContext?: Record<string, unknown> | null;
};

/**
 * Why a row does not get a person. Every one of these is a sentence a reader can act on.
 *
 *   - `already-attached`         — `person_id` is set. Never re-decided; a stored attribution is
 *                                  somebody's answer and this module does not overrule it.
 *   - `no-counterparties-stored` — the row carries internal names only (or none). Our storage
 *                                  gap, stated as ours.
 *   - `not-identifying`          — every stored counterparty name is below the two-token floor
 *                                  ("Dani", "Michael"). Kept separate from `unresolved` because
 *                                  the two ask for opposite things: this one says the ARCHIVE
 *                                  field is too thin to name anybody, where `unresolved` says
 *                                  the CRM is missing a person. Proposing a person called
 *                                  "Dani" would create the wrong record confidently.
 *   - `unresolved`               — counterparties are stored, identifying, and none resolved to
 *                                  a CRM person.
 *   - `ambiguous`                — a stored name hits more than one CRM record.
 *   - `many`                     — more than one counterparty resolved and `person_id` holds one.
 *   - `cross-org`                — the only resolved person belongs to a different org than the
 *                                  row's. The org on the row is the fact; the name match is not.
 */
export type StoredPersonRefusal =
  | "already-attached"
  | "no-counterparties-stored"
  | "not-identifying"
  | "unresolved"
  | "ambiguous"
  | "many"
  | "cross-org";

export type StoredPersonDecision =
  | { kind: "attach"; activityId: string; personId: string; personName: string; orgId: string }
  | { kind: "refused"; activityId: string; reason: StoredPersonRefusal; detail: string };

/**
 * The attendee columns a stored row kept, mapped back onto the archive's own field names.
 *
 * `attendeesMle` / `attendeesOther` are the keys `notion-meetings-sync` writes; `contactName`
 * and `salesRep` are carried because rows written by the draft path spell them that way. A key
 * that is absent stays absent — an empty array here would read as "the archive said nobody",
 * which is a different claim from "our row did not keep the column".
 */
export function attendeeFieldsFromStored(sourceContext: Record<string, unknown> | null | undefined): ArchiveAttendeeFields {
  const sc = sourceContext ?? {};
  // An array that survives filtering to nothing is treated as absent, not as an empty column: a
  // stored `[]` is our serialiser, not the archive saying nobody was there.
  const strings = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const kept = value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
    return kept.length > 0 ? kept : undefined;
  };
  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() !== "" ? value : undefined;

  const other = strings(sc.attendeesOther);
  const fields: ArchiveAttendeeFields = {};
  const mle = strings(sc.attendeesMle);
  if (mle) fields.mleAttendees = mle;
  const rep = strings(sc.salesRep);
  if (rep) fields.salesRep = rep;
  // `Non MLE Attendees` is a comma-separated rich_text upstream; the stored form is an array.
  // Rejoining with ", " hands the splitter exactly what it was written for rather than adding a
  // second parser for the same column.
  if (other) fields.nonMleAttendees = other.join(", ");
  const contact = text(sc.contactName);
  if (contact) fields.contactName = contact;
  return fields;
}

/**
 * One stored row's person half.
 *
 * `people` is the full CRM list; the org guard is applied AFTER resolution rather than by
 * pre-filtering the list, on purpose — filtering first would turn a cross-org name collision
 * into `unresolved`, and "we found her, at another company" is the finding worth printing.
 */
export function decideStoredPerson(row: StoredMeetingRow, people: CrmPerson[]): StoredPersonDecision {
  if (row.personId) {
    return {
      kind: "refused",
      activityId: row.id,
      reason: "already-attached",
      detail: `person_id already holds ${row.personId} — a stored attribution is somebody's answer, not this module's to re-decide`,
    };
  }

  const fields = attendeeFieldsFromStored(row.sourceContext);
  const attendees = readArchiveAttendees(fields);
  const counterparties = attendees.filter((a) => a.side === "counterparty");

  if (counterparties.length === 0) {
    const internal = attendees.map((a) => a.name);
    return {
      kind: "refused",
      activityId: row.id,
      reason: "no-counterparties-stored",
      detail:
        internal.length > 0
          ? `the row stores ${internal.length} attendee name(s) and all are ours (${internal.join(", ")}) — no counterparty was kept, so there is nobody on this row to resolve`
          : "the row stores no attendee names at all — the person half cannot be decided from what we saved",
    };
  }

  const resolved = resolveRowAttendees(attendees, people, row.orgId ?? null);
  const { counts, attachablePersonIds } = resolved;

  if (attachablePersonIds.length === 0) {
    const names = counterparties.map((a) => a.name).join(", ");
    // Order matters and it is a truth order, not a preference. `ambiguous` is the only outcome
    // that names real records, so it outranks. `not-identifying` outranks `unresolved` because a
    // row whose ONLY counterparty names are single tokens has not told us the CRM is missing
    // anybody — reporting that as `unresolved` would send a reader off to propose "Dani".
    if (counts.ambiguous > 0) {
      return {
        kind: "refused",
        activityId: row.id,
        reason: "ambiguous",
        detail: `${counts.ambiguous} stored counterparty name(s) hit more than one CRM record (${names}) — a question with ids attached, never a pick`,
      };
    }
    if (counts.unknown === 0 && counts.notIdentifying > 0) {
      return {
        kind: "refused",
        activityId: row.id,
        reason: "not-identifying",
        detail: `all ${counts.notIdentifying} stored counterparty name(s) are below the two-token floor (${names}) — the archive field is too thin to name anybody, which is a different gap from a person the CRM is missing`,
      };
    }
    return {
      kind: "refused",
      activityId: row.id,
      reason: "unresolved",
      detail: `${counts.unknown} stored counterparty name(s) resolved to nobody in the CRM (${names}) — the honest ask is a person proposal, not an attach to whoever is nearest`,
    };
  }

  if (attachablePersonIds.length > 1) {
    return {
      kind: "refused",
      activityId: row.id,
      reason: "many",
      detail: `${attachablePersonIds.length} counterparties resolved (${attachablePersonIds.join(", ")}) and person_id holds one — none is picked`,
    };
  }

  const personId = attachablePersonIds[0];
  const person =
    resolved.resolutions.find((r) => r.person?.id === personId)?.person ?? people.find((p) => p.id === personId);
  const personOrg = person?.orgId ?? "";

  if (row.orgId && personOrg && personOrg !== row.orgId) {
    return {
      kind: "refused",
      activityId: row.id,
      reason: "cross-org",
      detail: `the one resolved counterparty ${personId} (${person?.name ?? "?"}) belongs to ${personOrg}, and this meeting is on ${row.orgId} — an exact name match is not permission to put this call on another company's person`,
    };
  }

  return {
    kind: "attach",
    activityId: row.id,
    personId,
    personName: person?.name ?? personId,
    orgId: row.orgId ?? "",
  };
}
