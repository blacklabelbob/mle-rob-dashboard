/**
 * Q85 inc.17 — the title as its OWN evidence grade, and the reason it is a second grade rather
 * than a second source feeding the first.
 *
 * inc.16 ran the join live and offered zero of nine. Seven rows are `no-counterparty` — the
 * `Contact Name` and `Non MLE Attendees` columns are literally empty in Notion — and two are
 * `no-matched-person`. inc.15's evidence class is correct and has nothing to read on these rows,
 * so the only route that does not require Rob to type in Notion first is the one signal those
 * rows DO carry: their titles. `titleCompany.ts` has been built since inc.3/inc.4 and nothing
 * has ever consumed it.
 *
 * WHY THE TWO ARE NEVER MERGED. `candidateOrgFromAttendees` answers "the archive named a human,
 * the CRM knows that human's employer" — a lookup. A title answers "these words appeared in a
 * string a recorder generated", and inc.3 already documented the counter-example living in this
 * very set: `Robert Acheson, Austin Wilkins | Cloudflare / SEO optimization — 2026-08-03` names
 * Cloudflare as the TOPIC, not the counterparty. If both classes emptied into one `candidate`
 * field, a reader could not tell which fact produced the answer, and the weaker one would
 * inherit the stronger one's credibility exactly when the stronger one came back empty. So this
 * module returns its own type, with its own outcome set, and the caller keeps them in separate
 * fields. There is no code path that turns a title answer into an attendee answer.
 *
 * IT IS SUBORDINATE, NOT ALTERNATIVE. `titleOrgCandidate` is only ever consulted for a row whose
 * attendee-derived outcome is NOT `candidate`. A row where the humans already answered is never
 * re-answered by its title, and the two can therefore never disagree in the output — the
 * question of which to believe does not arise, because it is never asked twice.
 *
 * TWO HITS ARE A REFUSAL, in both directions and for `titleCompany.ts`'s stated reason: a title
 * naming two known companies is a question, and answering it by taking the first is the guess
 * these modules exist to refuse. A host hit and a name hit that land on the SAME org are one
 * answer, not two — that is agreement between two readings of one string, not two witnesses.
 *
 * PURE (CR-3): no clock, no network, no Supabase, no Notion, no filesystem. It returns an offer a
 * human rules on, at a grade the offer states out loud.
 */

import type { CrmOrg } from "./activityPlan";
import { titleHostHits, titleNameHits } from "./titleCompany";

/**
 * What a meeting title can honestly say about which company an empty-cell row belongs to.
 *
 *   - `title-candidate` — exactly one CRM org, reached from the title alone. The weakest offer
 *                         this build makes, and it says so in `grade` and in `nextStep`.
 *   - `no-title-match`  — the title states hosts or names and none reach a CRM org. Common and
 *                         not a failure: most titles are subjects, not counterparties.
 *   - `ambiguous-title` — the title reaches more than one org. Never tiebroken.
 */
export type TitleOrgOutcome = "title-candidate" | "no-title-match" | "ambiguous-title";

/** Which reading of the title produced a hit. Carried so a human can audit the string. */
export type TitleEvidenceKind = "host" | "name";

/** One reading of the title that reached an org, kept verbatim as the title stated it. */
export type TitleOrgEvidence = {
  kind: TitleEvidenceKind;
  /** The host or the normalized name candidate, as `titleCompany` extracted it. */
  token: string;
  orgId: string;
  orgName: string;
};

export type TitleOrgCandidate = {
  outcome: TitleOrgOutcome;
  /**
   * Always `"title"`. A constant, and deliberately so: a consumer that renders or logs this
   * object cannot omit the grade by forgetting to look at the type it came from. This is the
   * field that keeps the two evidence classes distinguishable at every downstream surface.
   */
  grade: "title";
  /** Set only on `title-candidate`. */
  orgId?: string;
  /** Set only on `title-candidate`. The CRM's spelling, which is what would be written. */
  orgName?: string;
  /** Every reading that reached an org, on every outcome that had any. */
  evidence: TitleOrgEvidence[];
  /** Set on `ambiguous-title` — the distinct org ids in play, in first-reached order. */
  competingOrgIds?: string[];
  /** Plain-language next step, in the words of the thing a human would go do. */
  nextStep: string;
};

/**
 * Derive the company an empty-cell archive row might belong to, from its title alone.
 *
 * @param title the archive row's title, as the recorder wrote it.
 * @param orgs the CRM's orgs, from the same snapshot the caller will show the human.
 * @param hostIndex `indexOrgsByHost(orgs)` — passed in rather than rebuilt so a title host and a
 *   company-field host can never resolve to different companies (`titleCompany`'s own rule).
 */
export function candidateOrgFromTitle(
  title: string | null | undefined,
  orgs: CrmOrg[],
  hostIndex: Map<string, CrmOrg[]>
): TitleOrgCandidate {
  const evidence: TitleOrgEvidence[] = [];

  // Hosts first — an address stated in a title is the stronger of the two readings, and its
  // order here is only presentational: nothing below prefers one kind over the other.
  for (const hit of titleHostHits(title, hostIndex)) {
    for (const org of hit.orgs) {
      evidence.push({ kind: "host", token: hit.host, orgId: org.id, orgName: org.name });
    }
  }
  for (const hit of titleNameHits(title, orgs)) {
    for (const org of hit.orgs) {
      evidence.push({ kind: "name", token: hit.candidate, orgId: org.id, orgName: org.name });
    }
  }

  if (evidence.length === 0) {
    return {
      outcome: "no-title-match",
      grade: "title",
      evidence: [],
      nextStep:
        "This meeting's title reaches no company in the CRM. Nothing on this row can name the " +
        "counterparty — fill `Contact Name` or `Company Meeting with` in Notion.",
    };
  }

  const distinctOrgIds = [...new Set(evidence.map((e) => e.orgId))];
  if (distinctOrgIds.length > 1) {
    return {
      outcome: "ambiguous-title",
      grade: "title",
      evidence,
      competingOrgIds: distinctOrgIds,
      nextStep:
        `This meeting's title reaches ${distinctOrgIds.length} different companies ` +
        `(${distinctOrgIds.join(", ")}). A title naming two companies is a question, not a ` +
        "match — type the company into `Company Meeting with` yourself.",
    };
  }

  const orgId = distinctOrgIds[0];
  const org = orgs.find((o) => o.id === orgId)!;
  return {
    outcome: "title-candidate",
    grade: "title",
    orgId: org.id,
    orgName: org.name,
    evidence,
    nextStep:
      `TITLE-DERIVED, weaker than an attendee match: the title says ` +
      `${evidence.map((e) => `"${e.token}" (${e.kind})`).join(", ")}, which reaches ` +
      `${org.name} (${org.id}). A title names what a call was ABOUT as often as who it was ` +
      "WITH — read the title before confirming.",
  };
}
