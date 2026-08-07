/**
 * Q85 inc.11 — the CAUSE gets a keyed writer, so the hold on prod row #206 can be retired
 * honestly instead of merely tidied away.
 *
 * inc.10 read the seven unkeyed rows #206–#212 one at a time and retired only two, because a
 * supersede note says *"same finding, re-run with current numbers"* and that sentence has to be
 * TRUE. Five were held, and every hold's `why` is a brief. This module answers two of them:
 *
 *   - **#206 — the CAUSE.** `meeting-archive/crm-gap` (#133) counts how many meetings the CRM
 *     never heard about. It has never said *why not*. The why is one empty Notion column on
 *     most of them, and that sentence existed in exactly one place: a hand-typed row that
 *     froze the moment it was filed.
 *   - **#211 — which SIDE blocks.** `meeting-archive/person-proposals` (#213) is the person
 *     half only. Nothing keyed states that the company is what stops the write and the person
 *     never does.
 *
 * WHY A THIRD KEY IN THIS NAMESPACE RATHER THAN MORE PROSE ON #133. #133 answers *how many
 * meetings are missing* and this answers *what is standing in the way*. They move independently:
 * filling one Notion cell changes this row and not that one, and writing a meeting changes that
 * row and not this one. One key carrying two independently-moving numbers is how a run corrects
 * half a row and leaves the other half stating yesterday — the #132-vs-#134 split, reproduced.
 *
 * THE SCOPE LINE IS Q85's OWN, ENFORCED NOT ASSUMED. Only rows a recorder saw are counted,
 * through `recorderSawMeeting` **imported** from the writer's own module — not a second reading
 * of `recording`. The 31 rows nobody recorded are Q84's pass and are named as excluded rather
 * than silently dropped, because a total that quietly shrinks reads as progress.
 *
 * NOTHING HERE IS AN INSTRUCTION TO GUESS. Every blocker states the field a human would go fix
 * and where that field lives — several of them are in **Notion**, not in this CRM, and saying
 * "add the company" to someone standing in the wrong system is how a duplicate org gets made.
 *
 * PURE (CR-3): no clock, no network, no Supabase, no Notion, no fetch.
 */

import type { ArchiveFinding } from "./archiveFinding";
import type { ActivityPlanRow } from "./activityPlan";
import { recorderSawMeeting } from "./activityDraft";

/**
 * Distinct from `KEY_CRM_GAP` (how many are missing) and `KEY_PERSON_PROPOSALS` (which humans
 * are unresolved). This one is the cause. Sharing either key would make each run overwrite the
 * other's row.
 */
export const KEY_WRITE_BLOCKERS = "meeting-archive/write-blockers";

/**
 * The blockers, in the order a reader should meet them: the biggest, cheapest fix first.
 *
 * Each carries the field a human edits AND the system that field lives in. The two are split
 * because they genuinely differ — `empty-company` is fixed in Notion, `unknown-company` is
 * fixed in the CRM — and an instruction that names the wrong system produces the wrong record.
 */
export type WriteBlocker =
  | "empty-company"
  | "unknown-company"
  | "ambiguous-company"
  | "no-date";

type BlockerSpec = { blocker: WriteBlocker; where: string; label: string };

const BLOCKER_SPECS: readonly BlockerSpec[] = [
  {
    blocker: "empty-company",
    where: "Notion",
    label: "the `Company Meeting with` column is EMPTY — nothing in the row or its title says who the meeting was with",
  },
  {
    blocker: "unknown-company",
    where: "the CRM",
    label: "a company is named that the CRM does not hold",
  },
  {
    blocker: "ambiguous-company",
    where: "the CRM",
    label: "two or more CRM orgs answer to the same name — this is a dedupe, not a lookup",
  },
  {
    blocker: "no-date",
    where: "Notion",
    label: "the company is known but no day can be read — `Call Date` is empty and the title carries no stamp",
  },
] as const;

/**
 * Which blocker, if any, stands between this row and a written activity.
 *
 * `null` means nothing does — the row is writable today. Note that a row is NEVER blocked on a
 * person: `activities.person_id` is nullable and inc.7 writes the row with a stated refusal when
 * nobody resolves. That asymmetry is the substance of #211 and it is asserted here in code, so
 * the claim on Rob's page is a consequence of the mapping rather than a sentence somebody typed.
 */
export function blockerFor(planRow: ActivityPlanRow): WriteBlocker | null {
  switch (planRow.disposition) {
    case "attachable":
      return null;
    case "no-company":
      return "empty-company";
    case "unknown-company":
      return "unknown-company";
    case "ambiguous-company":
      return "ambiguous-company";
    case "no-date":
      return "no-date";
  }
}

export type BlockerCensus = {
  /** Rows a recorder saw — Q85's stated scope, and the denominator for everything below. */
  inScope: number;
  /** Rows a recorder never saw. Named, not dropped: they are Q84's pass, not a smaller total. */
  outOfScope: number;
  /** In-scope rows nothing is standing in the way of. */
  writable: number;
  counts: Record<WriteBlocker, number>;
  /** The single blocker holding up the most rows, or `null` when nothing is blocked. */
  dominant: WriteBlocker | null;
};

/**
 * Count the blockers. Separated from the prose so the numbers can be asserted directly by a
 * test and read by any other caller without re-deriving them from a sentence.
 */
export function censusWriteBlockers(planRows: ActivityPlanRow[]): BlockerCensus {
  const counts: Record<WriteBlocker, number> = {
    "empty-company": 0,
    "unknown-company": 0,
    "ambiguous-company": 0,
    "no-date": 0,
  };
  let inScope = 0;
  let outOfScope = 0;
  let writable = 0;

  for (const planRow of planRows) {
    if (!recorderSawMeeting(planRow.row || ({} as ActivityPlanRow["row"]))) {
      outOfScope += 1;
      continue;
    }
    inScope += 1;
    const blocker = blockerFor(planRow);
    if (blocker === null) writable += 1;
    else counts[blocker] += 1;
  }

  // Ties are not broken. A tie means two fixes are equally large, and picking one by array
  // order would put an arbitrary instruction at the top of Rob's row.
  let dominant: WriteBlocker | null = null;
  let best = 0;
  let tied = false;
  for (const spec of BLOCKER_SPECS) {
    const n = counts[spec.blocker];
    if (n > best) {
      best = n;
      dominant = spec.blocker;
      tied = false;
    } else if (n === best && n > 0) {
      tied = true;
    }
  }
  if (tied) dominant = null;

  return { inScope, outOfScope, writable, counts, dominant };
}

/**
 * One ledger row naming what stands between the recorded meetings and the CRM, or `null` when
 * nothing is in the way.
 *
 * `null` is not "resolved" — the caller leaves any existing row for Rob to close, exactly as the
 * two sibling findings do. A script closing his to-do is the machine deciding his list is done.
 *
 * Severity **high**, unlike the person finding's medium: real conversations happened and every
 * company record involved currently reads as though they did not. That is the CRM saying
 * something untrue, which is the bar high is reserved for.
 */
export function buildWriteBlockerFinding(planRows: ActivityPlanRow[]): ArchiveFinding | null {
  const census = censusWriteBlockers(planRows);
  const blocked = census.inScope - census.writable;
  if (blocked === 0) return null;

  const parts: string[] = [];
  parts.push(
    `${blocked} of ${census.inScope} recorded meeting(s) cannot be written onto a company record. ` +
      `${census.writable} can. ` +
      `A further ${census.outOfScope} archive row(s) are out of Q85's scope entirely — no recorder saw them, ` +
      `and only someone who was in the room can close those (Q84's pass).`
  );

  parts.push(
    `\nWHAT IS STANDING IN THE WAY (${blocked}):\n` +
      BLOCKER_SPECS.filter((spec) => census.counts[spec.blocker] > 0)
        .map(
          (spec) =>
            `  · ${census.counts[spec.blocker]} — ${spec.label}\n    FIX IN: ${spec.where}`
        )
        .join("\n")
  );

  // #211's sentence, computed rather than typed. Nothing above is a person, and that is the
  // point: the person half can be entirely unresolved and the row still writes.
  parts.push(
    `\nTHE BLOCK IS ON THE COMPANY SIDE, NOT THE PERSON SIDE. ` +
      `An unresolved attendee never stops a write — the activity is written with the person column left ` +
      `null and the reason stated on the row. Every blocker above is a company or a date. ` +
      `Resolving the people (see \`meeting-archive/person-proposals\`) would not release a single row here.`
  );

  parts.push(
    `\nNothing has been written, created or attached. This row is a count of what is waiting, ` +
      `re-measured on every \`check:archive\` run.`
  );

  const title =
    census.dominant === null
      ? `${blocked} recorded meeting(s) blocked from the CRM`
      : `${blocked} recorded meeting(s) blocked — ${census.counts[census.dominant]} on ${dominantPhrase(census.dominant)}`;

  return {
    entityName: "Meeting archive",
    title,
    detail: parts.join("\n"),
    severity: "high",
    dedupeKey: KEY_WRITE_BLOCKERS,
  };
}

/** The short form of a blocker, for a title a human reads at a glance. */
function dominantPhrase(blocker: WriteBlocker): string {
  switch (blocker) {
    case "empty-company":
      return "an empty Notion `Company Meeting with` column";
    case "unknown-company":
      return "a company the CRM does not hold";
    case "ambiguous-company":
      return "two CRM orgs sharing one name";
    case "no-date":
      return "no readable meeting day";
  }
}
