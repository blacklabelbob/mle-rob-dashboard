// Q84 inc.15 — the first honest step toward closing the HIGH-severity finding, and it
// writes nothing.
//
// inc.14 put flag #133 on the dedupe mechanism, so the ledger now states a true count of
// the meetings the CRM never heard about. What it states is a WALL: "no path writes a
// meeting activity, one pipeline closes all 40". Six increments have now improved how that
// sentence is maintained and none has moved the number, because the number only moves when
// something can say WHICH company each of those meetings belongs to. That question has a
// cheap answer for some rows and no answer at all for others, and nobody has ever separated
// the two — so "build the pipeline" has stayed one undifferentiated 40-row task.
//
// This module separates them. It is PURE per CR-3 (no clock, no network, no Supabase, no
// Notion) and it is a PLAN — it returns what an activity WOULD attach to and never attaches
// anything. That is not caution theatre: `archiveCheck` refuses to auto-reconcile for the
// same stated reason, and it is the right one. Writing a meeting onto the wrong company is
// unrecoverable and quietly corrupts the attribution chain Rob shows people; an unattached
// meeting is a click.
//
// Matching is EXACT-AFTER-NORMALIZATION ONLY, reusing `normalizeName` from the dedup
// matcher rather than growing a third name ladder in this repo (inc.4/inc.5 spent two
// increments deleting the second copy of one). "PropLogix, LLC." and "proplogix llc" are
// the same org; anything that needs edit distance to agree is reported as unknown, because
// a fuzzy hit here becomes a real activity row on a real company record.

import { normalizeName } from "@/lib/dedup/match";
import type { ArchiveRowDetail } from "./unexplainedRows";

/** The CRM side, narrowed to what a name match can honestly use. */
export type CrmOrg = { id: string; name: string };

/**
 * Who can close the row, which is the only split that changes what happens next:
 *
 *   - `attachable`       — the archive names a company and exactly one CRM org normalizes to
 *                          it. A pipeline can write this activity unattended once one exists.
 *   - `ambiguous-company`— the name matches more than one org row. Never resolved by picking:
 *                          two orgs sharing a name is itself a finding (dedupe), and guessing
 *                          welds the call onto whichever happens to sort first.
 *   - `unknown-company`  — a company IS named and no CRM org matches it. Cheap for a human:
 *                          either the org is missing from the CRM or the spelling differs.
 *   - `no-company`       — the archive row never said who the meeting was with. Only someone
 *                          who was there can, so this lands in the same pile as the rows in
 *                          `unexplainedRows` — it is not a matching failure.
 *   - `no-date`          — the company IS known and the row carries no Call Date. An activity
 *                          is an event on a day; there is nothing to write into `occurred_at`.
 *                          Caught because the first live run called such a row "attachable"
 *                          and a plan that overstates what a pipeline can do unattended is
 *                          how the pipeline later writes a meeting onto the wrong day.
 */
export type ActivityDisposition =
  | "attachable"
  | "ambiguous-company"
  | "unknown-company"
  | "no-company"
  | "no-date";

export type ActivityPlanRow = {
  row: ArchiveRowDetail;
  disposition: ActivityDisposition;
  /** Set only when `attachable` — the one org an activity would be written onto. */
  org?: CrmOrg;
  /** Set only when `ambiguous-company` — every org that normalized to the same name. */
  candidates?: CrmOrg[];
  /** Plain-language next step, in the words of the field a human would go fix. */
  nextStep: string;
};

export type ActivityPlan = {
  rows: ActivityPlanRow[];
  counts: {
    /** Rows fed in — the CRM-gap list, not the whole archive. */
    considered: number;
    attachable: number;
    ambiguousCompany: number;
    unknownCompany: number;
    noCompany: number;
    noDate: number;
  };
};

/**
 * Index the CRM orgs by normalized name. A LIST per key, not a single org: two orgs with the
 * same name is a real state in this database (it is what the dedupe queue exists for), and
 * an index that keeps only the last one would silently make an ambiguous row look decided.
 */
function byNormalizedName(orgs: CrmOrg[]): Map<string, CrmOrg[]> {
  const index = new Map<string, CrmOrg[]>();
  for (const org of orgs) {
    const key = normalizeName(org.name || "");
    if (!key) continue; // an org with no name can never be the answer to "which company"
    const bucket = index.get(key);
    if (bucket) bucket.push(org);
    else index.set(key, [org]);
  }
  return index;
}

/**
 * @param archiveOnly the meetings the CRM has no activity for — `ArchiveCheck.archiveOnly`,
 *   read with the `company` field the Notion row carries ("Company Meeting with").
 * @param orgs every CRM org, id + name.
 *
 * The whole archive row is carried through, not just an id, so a report can print the day
 * and the title without a second lookup that could disagree with this pass.
 */
export function planMeetingActivities(archiveOnly: ArchiveRowDetail[], orgs: CrmOrg[]): ActivityPlan {
  const index = byNormalizedName(orgs);
  const rows: ActivityPlanRow[] = archiveOnly.map((row) => {
    const named = (row.company || "").trim();
    if (!named) {
      return {
        row,
        disposition: "no-company",
        nextStep:
          "the archive row never says who this was with — fill Notion's “Company Meeting with”, " +
          "or leave it: an activity attached to nobody is not worth writing",
      };
    }
    // Deliberately whole-string: a "Company Meeting with" of "Omega & Gulf Coast" is NOT split
    // on the separator and hopefully matched to one of them. Splitting would invent a decision
    // about which company owns a meeting that names two, and that is exactly the write nothing
    // here is allowed to guess at.
    const hits = index.get(normalizeName(named)) || [];
    if (hits.length === 1 && !row.day) {
      return {
        row,
        disposition: "no-date",
        org: hits[0],
        nextStep:
          `the company is known (${hits[0].name}) but the row has no Call Date — set it in Notion; ` +
          "an activity with no day cannot be written, and a guessed day is a wrong record",
      };
    }
    if (hits.length === 1) {
      return {
        row,
        disposition: "attachable",
        org: hits[0],
        nextStep: `a meeting activity would attach to ${hits[0].name} [${hits[0].id}] — nothing is written by this pass`,
      };
    }
    if (hits.length > 1) {
      return {
        row,
        disposition: "ambiguous-company",
        candidates: hits,
        nextStep:
          `${hits.length} CRM orgs are named “${named}” — merge or rename them first; ` +
          "picking one here would weld the call onto whichever sorted first",
      };
    }
    return {
      row,
      disposition: "unknown-company",
      nextStep: `no CRM org is named “${named}” — either the company is missing from the CRM or the spelling differs`,
    };
  });

  const count = (d: ActivityDisposition) => rows.filter((r) => r.disposition === d).length;
  return {
    rows,
    counts: {
      considered: archiveOnly.length,
      attachable: count("attachable"),
      ambiguousCompany: count("ambiguous-company"),
      unknownCompany: count("unknown-company"),
      noCompany: count("no-company"),
      noDate: count("no-date"),
    },
  };
}
