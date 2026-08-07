/**
 * Q85 inc.12 — the per-COMPANY breakdown, so "9 blocked on an empty Notion column" becomes the
 * short list of companies a human can actually go fill in one sitting.
 *
 * inc.11's `write-blockers` row (#214) counts blocked rows BY CAUSE. That is the right shape for
 * "what is standing in the way" and the wrong shape for doing anything about it: a person holding
 * that row still has to open 15 Notion pages to find out which company each one is. This module
 * answers the other question — *which companies*, and *how many rows each one closes* — because
 * three CG Roofing rows are ONE decision typed three times, not three decisions.
 *
 * IT RETIRES A HAND-TYPED ROW BY RE-STATING IT, NOT BY TIDYING IT AWAY. Prod #207 (*"3 recorded
 * CG Roofing meetings are unattached — their titles name cgroofinggroup.com, Notion's Company
 * field does not"*) is exactly this finding, typed once on 2026-08-07 and frozen since. The
 * moment a fourth CG Roofing call lands, or one of the three gets its Notion cell filled, that
 * row is wrong and nothing in the repo knows. This one is re-measured every `check:archive` run.
 *
 * WHAT IT REFUSES TO DO IS THE POINT.
 *
 *   - **A near miss is a QUESTION with a record attached, never a match.** Every company named
 *     here is a candidate the planner surfaced from the row's own title; none of it is written
 *     anywhere, and the instruction is always *confirm, then put it in Notion* — never *we have
 *     decided this is who it was*.
 *   - **`person-not-company` gets its own group and is never folded into the org it points at.**
 *     "Dixith" in a company field resolves to a PERSON the CRM holds, and that person has an
 *     `orgId`. Printing that org as the company the meeting was with would be a two-step guess
 *     (this handle is that person → that person's employer is the counterparty), and the second
 *     step is the one that invents a relationship. The group states the person and stops.
 *   - **Rows nothing can name are COUNTED, never dropped.** They are the residue only a human in
 *     the room can clear, and a per-company list that silently omitted them would read as a
 *     complete worklist while being a third of one.
 *
 * SCOPE IS Q85's, ENFORCED NOT ASSUMED — `recorderSawMeeting` imported from the writer's own
 * module, same as the blocker census, so the two rows on Rob's page can never disagree about
 * which meetings they are talking about.
 *
 * PURE (CR-3): no clock, no network, no Supabase, no Notion, no fetch.
 */

import type { ArchiveFinding } from "./archiveFinding";
import type { ActivityPlanRow, CrmOrg, CrmPerson } from "./activityPlan";
import { recorderSawMeeting } from "./activityDraft";
import { blockerFor } from "./writeBlockerFinding";

/**
 * Its own key, for the same reason every sibling has one: this number moves when a Notion cell
 * is filled for ONE company, while `write-blockers` moves on any cell and `crm-gap` moves only
 * when a meeting is actually written. One key over three independently-moving numbers is how a
 * run corrects a third of a row and leaves the rest stating yesterday.
 */
export const KEY_BLOCKED_BY_COMPANY = "meeting-archive/blocked-by-company";

/** One blocked meeting, in the terms a human needs to find it again in Notion. */
export type BlockedMeeting = {
  /** The Notion page id — the row a human opens. */
  id: string;
  /**
   * `null` when the archive row carries no link. Not defaulted to a constructed Notion URL: a
   * guessed link that 404s costs more than an honest "no link, here is the page id".
   */
  url: string | null;
  title: string;
  /** The day, when one is readable. `null` is a fact, not a gap to fill with the run date. */
  day: string | null;
};

/**
 * A company the CRM already holds that one or more blocked rows point at.
 *
 * `evidence` is kept per group because the two kinds are not equally strong and a human deciding
 * from this list is entitled to know which they are looking at: a `title-host` hit is the
 * company's own registered domain sitting in the title, a `title-name` hit is a word match.
 */
export type CompanyGroup = {
  orgId: string;
  orgName: string;
  evidence: ("title-host" | "title-name" | "org-qualifier")[];
  meetings: BlockedMeeting[];
};

/**
 * A blocked row whose near miss is a PERSON, not a company. Deliberately not a `CompanyGroup`:
 * the type itself refuses to let the person's employer be printed as the counterparty.
 */
export type PersonGroup = {
  personId: string;
  personName: string;
  /** The org the CRM says they work for. Carried as context for the human, never as the answer. */
  employerOrgId: string | null;
  meetings: BlockedMeeting[];
};

export type BlockedByCompany = {
  /** Recorded rows that are blocked — the denominator for everything below. */
  blocked: number;
  /** Blocked rows a named CRM company can be offered for. */
  named: number;
  /** Blocked rows whose only near miss is a person. */
  personOnly: number;
  /** Blocked rows nothing in the archive names at all. Counted, never dropped. */
  unnameable: number;
  companies: CompanyGroup[];
  people: PersonGroup[];
};

function meetingOf(planRow: ActivityPlanRow): BlockedMeeting {
  const row = planRow.row;
  return {
    id: row.id,
    // `ArchiveRow.url` is optional; normalized to `null` here rather than carried as
    // `undefined` so the one absent-link case has ONE shape, and `linkOf` below has one
    // thing to test. tsc caught this — vitest never would, which is why the type is narrow.
    url: row.url || null,
    title: row.title || "(untitled)",
    day: row.day || null,
  };
}

/**
 * The single org a near miss points at, or `null`.
 *
 * `null` when a hit names MORE than one org, on purpose: that is the ambiguous case, and folding
 * it into one group would pick a company by array order and put an arbitrary instruction in front
 * of a human. Such a row falls to `unnameable`, where "a script cannot name this" is true.
 */
function soleOrg(orgs: CrmOrg[] | undefined): CrmOrg | null {
  if (!orgs || orgs.length !== 1) return null;
  return orgs[0];
}

function solePerson(people: CrmPerson[] | undefined): CrmPerson | null {
  if (!people || people.length !== 1) return null;
  return people[0];
}

/**
 * Group the blocked recorded rows by the company (or person) their own archive row points at.
 *
 * Separated from the prose so the counts can be asserted directly rather than read back out of
 * a sentence.
 */
export function groupBlockedByCompany(planRows: ActivityPlanRow[]): BlockedByCompany {
  const companies = new Map<string, CompanyGroup>();
  const people = new Map<string, PersonGroup>();
  let blocked = 0;
  let unnameable = 0;

  for (const planRow of planRows) {
    if (!recorderSawMeeting(planRow.row || ({} as ActivityPlanRow["row"]))) continue;
    if (blockerFor(planRow) === null) continue;
    blocked += 1;

    const near = planRow.nearMiss;
    if (!near) {
      unnameable += 1;
      continue;
    }

    if (near.kind === "person-not-company") {
      const person = solePerson(near.people);
      if (!person) {
        unnameable += 1;
        continue;
      }
      const group = people.get(person.id) || {
        personId: person.id,
        personName: person.name,
        employerOrgId: person.orgId || null,
        meetings: [],
      };
      group.meetings.push(meetingOf(planRow));
      people.set(person.id, group);
      continue;
    }

    // The remaining kinds all name orgs. A row whose hits resolve to more than one org, or to
    // several different orgs, is left unnameable rather than assigned to the first.
    const orgs =
      near.kind === "org-qualifier"
        ? near.orgs
        : near.hits.flatMap((hit) => hit.orgs);
    const org = soleOrg(orgs);
    if (!org) {
      unnameable += 1;
      continue;
    }
    const group = companies.get(org.id) || {
      orgId: org.id,
      orgName: org.name,
      evidence: [],
      meetings: [],
    };
    if (!group.evidence.includes(near.kind)) group.evidence.push(near.kind);
    group.meetings.push(meetingOf(planRow));
    companies.set(org.id, group);
  }

  const companyList = [...companies.values()].sort(
    (a, b) => b.meetings.length - a.meetings.length || a.orgName.localeCompare(b.orgName),
  );
  const personList = [...people.values()].sort(
    (a, b) => b.meetings.length - a.meetings.length || a.personName.localeCompare(b.personName),
  );

  return {
    blocked,
    named: companyList.reduce((n, g) => n + g.meetings.length, 0),
    personOnly: personList.reduce((n, g) => n + g.meetings.length, 0),
    unnameable,
    companies: companyList,
    people: personList,
  };
}

/**
 * What goes on the link line. A row with no url prints its Notion page id and SAYS that is what
 * it is — never the string `null`, and never a url built out of the id. The doc on
 * `BlockedMeeting.url` promises exactly this; without it the worklist prints `null` in the one
 * place a human is meant to click, which reads as a broken row rather than an honest gap.
 */
function linkOf(m: BlockedMeeting): string {
  return m.url || `(no link on the row — Notion page id ${m.id})`;
}

const EVIDENCE_PHRASE: Record<CompanyGroup["evidence"][number], string> = {
  "title-host": "the company's own domain is in the meeting title",
  "title-name": "the company's name is in the meeting title",
  "org-qualifier": "a CRM org differs only by a trailing qualifier",
};

/**
 * One ledger row naming WHICH companies close the blocked meetings, or `null` when no blocked
 * row can be named at all.
 *
 * Severity **medium**, deliberately below #214's high: the alarm ("real conversations are missing
 * from these records") is already stated once at high, and re-raising it here would put two high
 * rows on Rob's page for one problem. This row is the worklist, not the alarm.
 */
export function buildBlockedByCompanyFinding(planRows: ActivityPlanRow[]): ArchiveFinding | null {
  const g = groupBlockedByCompany(planRows);
  if (g.companies.length === 0 && g.people.length === 0) return null;

  const parts: string[] = [];
  const closable = g.named + g.personOnly;
  parts.push(
    `${closable} of ${g.blocked} blocked meeting(s) already point at a record the CRM holds — ` +
      `across ${g.companies.length} compan(ies)` +
      (g.people.length > 0 ? ` and ${g.people.length} person/people` : "") +
      `. Each company below is ONE decision, not one per meeting.`,
  );

  if (g.companies.length > 0) {
    parts.push(
      `\nCOMPANIES THE CRM ALREADY HOLDS — confirm, then put the name in Notion's \`Company Meeting with\`:\n` +
        g.companies
          .map((group) => {
            const head =
              `  · ${group.orgName} [${group.orgId}] — ${group.meetings.length} meeting(s); ` +
              group.evidence.map((kind) => EVIDENCE_PHRASE[kind]).join(" / ");
            const lines = group.meetings
              .map((m) => `      ${m.day || "(no readable day)"} — ${m.title}\n      ${linkOf(m)}`)
              .join("\n");
            return `${head}\n${lines}`;
          })
          .join("\n"),
    );
  }

  if (g.people.length > 0) {
    parts.push(
      `\nA PERSON, NOT A COMPANY — and the CRM will not guess their employer is the counterparty:\n` +
        g.people
          .map((group) => {
            const head =
              `  · ${group.personName} [${group.personId}] — ${group.meetings.length} meeting(s). ` +
              `Notion's company field holds this person's name, not a company. ` +
              (group.employerOrgId
                ? `The CRM has them at ${group.employerOrgId}; that is CONTEXT, not the answer — say who the meeting was WITH.`
                : `The CRM has no employer on them.`);
            const lines = group.meetings
              .map((m) => `      ${m.day || "(no readable day)"} — ${m.title}\n      ${linkOf(m)}`)
              .join("\n");
            return `${head}\n${lines}`;
          })
          .join("\n"),
    );
  }

  if (g.unnameable > 0) {
    parts.push(
      `\n${g.unnameable} blocked meeting(s) are NOT on this list, and are not being hidden: ` +
        `nothing in the row or its title names a company, so no script can offer one. ` +
        `Only someone who was in the room can say who those were with.`,
    );
  }

  parts.push(
    `\nEvery company above is a CANDIDATE surfaced from the row's own title, never a decision. ` +
      `Nothing has been written, created or attached; re-measured on every \`check:archive\` run.`,
  );

  const top = g.companies[0];
  const title = top
    ? `${closable} blocked meeting(s) name a record we hold — ${top.meetings.length} of them are ${top.orgName}`
    : `${closable} blocked meeting(s) name a person we hold`;

  return {
    entityName: "Meeting archive",
    title,
    detail: parts.join("\n"),
    severity: "medium",
    dedupeKey: KEY_BLOCKED_BY_COMPANY,
  };
}
