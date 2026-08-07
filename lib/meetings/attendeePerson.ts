/**
 * Q85 inc.6 — the resolver: the archive's counterparty names become CRM person ids, or a
 * question. Never a nearby human.
 *
 * inc.5 finished the READ half — `readArchiveAttendees` puts every human the archive names on
 * the row, with the side read off the column rather than guessed. This module is the other
 * half of Q85's "right org AND person": it decides which of those names is a person the CRM
 * already holds. It resolves; it does not write. The output is a decision a writer may act on
 * and a reader can audit, and every refusal names the record it nearly hit.
 *
 * THE MATCH RULE IS EXACT-AFTER-NORMALIZATION, and that is the whole ladder. `normalizeName`
 * is IMPORTED from `lib/dedup/match` — a fifth name predicate in this repo would be the same
 * defect it has already paid twice to delete. "Alex Greenwood" and "alex  greenwood" are one
 * person; anything that needs a character changed to agree is reported as unknown.
 *
 * IT REFUSES EDIT DISTANCE FOR THE SAME REASON THE ORG HALF DOES (inc.4), and the reason is
 * sharper on humans: edit distance cannot tell a typo from a different person, and surnames
 * that differ by one character are ordinary — Stiber/Stiber, Green/Greene, Chen/Chan are real
 * pairs of real people. A call welded onto the wrong human is unrecoverable, and it is worse
 * than a wrong company: it is a private conversation on a stranger's record.
 *
 * IT REFUSES FIRST-NAME MATCHING TOO, which is the distinction worth stating because this repo
 * already has a first-name index. `activityPlan.byPersonName` keys people by first name ON
 * PURPOSE — but only to say WHICH record a value nearly hit, in a report a human reads. That
 * index may never reach a write. Here, a name below inc.5's two-token floor is `not-identifying`
 * and stops: a CRM with two Alexes resolves "Alex" to a coin flip.
 *
 * THE ONE DISAMBIGUATION, and it only ever NARROWS. When two CRM people share a normalized
 * name, the meeting's already-resolved org can pick between them — but only when exactly one
 * of the candidates belongs to that org. It never adds a candidate that the name did not
 * already produce, and it never breaks a tie by "closest" anything. Two same-name people at
 * the SAME org stays ambiguous, because that is genuinely two records a human must look at.
 *
 * PURE (CR-3): no clock, no network, no Supabase, no Notion. Callers supply the people.
 */

import { normalizeName } from "@/lib/dedup/match";
import type { CrmPerson } from "./activityPlan";
import type { ArchiveAttendee } from "./archiveAttendees";

/**
 * What resolution concluded about one attendee.
 *
 *   - `matched`          — exactly one CRM person, exact after normalization. The only outcome
 *                          a writer may attach on.
 *   - `ambiguous`        — the name is in the CRM more than once and the org did not decide it.
 *                          A question with specific ids attached, never a pick.
 *   - `unknown`          — the CRM holds nobody by that name. The honest ask is a person
 *                          proposal, not an attach to whoever is nearest.
 *   - `not-identifying`  — fewer than two significant tokens (inc.5's floor). Real evidence a
 *                          human was there, useless for saying which human.
 */
export type AttendeeResolutionOutcome = "matched" | "ambiguous" | "unknown" | "not-identifying";

export type AttendeeResolution = {
  attendee: ArchiveAttendee;
  outcome: AttendeeResolutionOutcome;
  /** Set only on `matched`. The one person an activity would attach. */
  person?: CrmPerson;
  /** Every CRM person the name hit. Carried on `matched` and `ambiguous` so a reader sees the field of play. */
  candidates: CrmPerson[];
  /**
   * Set only when the org narrowed a multi-candidate name to one. Recorded because a match a
   * second fact decided is not the same evidence as a name that was unique on its own, and a
   * human reviewing the plan is entitled to know which one they are looking at.
   */
  disambiguatedBy?: "org";
  /** Plain-language next step, in the words of the thing a human would go do. */
  nextStep: string;
};

/** Index people by normalized full name. A LIST per key — two people with one name is a real state. */
function byFullName(people: CrmPerson[]): Map<string, CrmPerson[]> {
  const index = new Map<string, CrmPerson[]>();
  for (const person of people) {
    const key = normalizeName(person.name);
    if (!key) continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(person);
    else index.set(key, [person]);
  }
  return index;
}

/**
 * Resolve one attendee against the CRM's people.
 *
 * `orgId` is the org the meeting has ALREADY been resolved onto by the org half — passing an
 * unresolved org is not a way to guess one. It is used only to narrow.
 */
export function resolveAttendee(
  attendee: ArchiveAttendee,
  people: CrmPerson[],
  orgId?: string | null,
  index?: Map<string, CrmPerson[]>
): AttendeeResolution {
  if (!attendee.identifying) {
    return {
      attendee,
      outcome: "not-identifying",
      candidates: [],
      nextStep:
        `“${attendee.name}” (${attendee.source}) is one name with no surname — it identifies nobody. ` +
        `Add the surname in Notion and this attendee resolves unattended.`,
    };
  }

  const lookup = index ?? byFullName(people);
  const candidates = lookup.get(normalizeName(attendee.name)) ?? [];

  if (candidates.length === 0) {
    return {
      attendee,
      outcome: "unknown",
      candidates: [],
      nextStep:
        `The CRM holds nobody named “${attendee.name}” (${attendee.source}). ` +
        `Propose the person — do not attach this meeting to a similar name.`,
    };
  }

  if (candidates.length === 1) {
    return { attendee, outcome: "matched", person: candidates[0], candidates, nextStep: "Attach." };
  }

  // More than one. The org may narrow it — only to exactly one, only from this same list.
  if (orgId) {
    const atOrg = candidates.filter((person) => person.orgId === orgId);
    if (atOrg.length === 1) {
      return {
        attendee,
        outcome: "matched",
        person: atOrg[0],
        candidates,
        disambiguatedBy: "org",
        nextStep: `Attach — ${candidates.length} people share this name and one is at the meeting's org.`,
      };
    }
  }

  return {
    attendee,
    outcome: "ambiguous",
    candidates,
    nextStep:
      `“${attendee.name}” names ${candidates.length} CRM people (${candidates.map((p) => p.id).join(", ")}). ` +
      `Confirm which one was on the call — nothing is attached until a human says.`,
  };
}

export type AttendeeResolutionSummary = {
  matched: number;
  ambiguous: number;
  unknown: number;
  notIdentifying: number;
  total: number;
};

export type ResolvedAttendees = {
  resolutions: AttendeeResolution[];
  /** The person ids a writer may attach, in the order the archive named them. Empty is a normal answer. */
  attachablePersonIds: string[];
  counts: AttendeeResolutionSummary;
};

/**
 * Resolve every counterparty on one row. Internal attendees are dropped here rather than
 * resolved: they are Rob and Will, they are on both sides of every meeting, and attaching them
 * as the person a meeting was WITH is the exact write inc.5 exists to prevent.
 */
export function resolveRowAttendees(
  attendees: ArchiveAttendee[],
  people: CrmPerson[],
  orgId?: string | null
): ResolvedAttendees {
  const index = byFullName(people);
  const resolutions = attendees
    .filter((attendee) => attendee.side === "counterparty")
    .map((attendee) => resolveAttendee(attendee, people, orgId, index));

  const counts: AttendeeResolutionSummary = {
    matched: resolutions.filter((r) => r.outcome === "matched").length,
    ambiguous: resolutions.filter((r) => r.outcome === "ambiguous").length,
    unknown: resolutions.filter((r) => r.outcome === "unknown").length,
    notIdentifying: resolutions.filter((r) => r.outcome === "not-identifying").length,
    total: resolutions.length,
  };

  return {
    resolutions,
    attachablePersonIds: resolutions
      .filter((r) => r.outcome === "matched" && r.person)
      .map((r) => r.person!.id),
    counts,
  };
}
