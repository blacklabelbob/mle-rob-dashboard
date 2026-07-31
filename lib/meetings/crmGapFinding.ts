// Q84 inc.14 — the OTHER meeting finding on Rob's ledger, put on the same mechanism.
//
// inc.8 → inc.13 spent six increments making ONE row (#134, "N archived meetings can only
// be closed by someone who was in the room") state a true number without a human retyping
// it. Prod flag **#133 — the HIGH-severity one — was left behind**: `dedupe_key: null`,
// filed by hand on 2026-07-30, still open today reading *"40 recorded meetings are in the
// archive; the CRM has ZERO meeting activities"*.
//
// That number is stale BY CONSTRUCTION, and inc.7 is what made it so: it put the archive
// FILL on the same 30-minute launchd timer as the Fireflies pull, so `archiveRows` grows
// on its own. The row will keep saying 40 through the 41st recorded call, and it is the
// row that carries the highest severity on the page. Rob named this disease himself on the
// equity split — a ledger number nobody corrects is how 40/60 stayed wrong for five days.
//
// Pure per CR-3: no clock, no network, no Supabase, no fetch. The caller reads both sides,
// `checkArchiveAgainstCrm` decides what agrees, and this turns that into the one row.

import { type ArchiveFinding, trimDateTail } from "./archiveFinding";
import type { ArchiveCheck, ArchiveRow } from "./archiveCheck";
import type { ActivityDisposition, ActivityPlan, ActivityPlanRow } from "./activityPlan";

/**
 * The key #133 is being ADOPTED onto, deliberately: the point is to correct that row, not
 * to open a fifth one beside it. Distinct from KEY_NEEDS_HUMAN_ACCOUNT because these are
 * genuinely two findings — one is "the CRM never heard about meetings that were recorded",
 * the other is "these meetings were never recorded at all". Sharing a key would make each
 * run overwrite the other's row.
 */
export const KEY_CRM_GAP = "meeting-archive/crm-gap";

/** One line per meeting the CRM never heard about. Same shape as the archive finding's list. */
function rowLines(rows: ArchiveRow[]): string {
  return rows
    .slice()
    .sort((a, b) => (b.day || "").localeCompare(a.day || ""))
    .map((r) => {
      const named = trimDateTail((r.title || "").trim(), r.day);
      return `• ${r.day || "(no date)"} — ${named || "(untitled)"}`;
    })
    .join("\n");
}

/**
 * The buckets a human has to move before any pipeline could file the row, cheapest first —
 * and NOT `no-company`, which is deliberately left out of the printed list below. Every one
 * of those rows carries the same one-line ask ("fill Notion's Company Meeting with"), and
 * today there are 33 of them against 7 of everything else: printing all 33 identical lines
 * would bury the seven rows that name a company and can actually be fixed one at a time.
 * The count is still stated in the sentence above the list — omitted from the list, never
 * from the arithmetic.
 */
const HUMAN_BUCKETS: Array<[ActivityDisposition, string]> = [
  [
    "unknown-company",
    // Q84 inc.17: some of these name a DOMAIN, and the fix for those is one field on the org
    // in the CRM, not a retype in Notion. The per-row line below says which is which.
    "the company is named and the CRM does not have it — add the org, add its domain, or fix the spelling in Notion",
  ],
  ["ambiguous-company", "two CRM orgs share the name — merge or rename them first; picking one here would weld the call onto whichever sorted first"],
  ["no-date", "the company is known and the row has no Call Date — an activity is an event on a day"],
  ["attachable", "a pipeline could file these unattended once one exists — nothing else is owed"],
];

/**
 * The plan's rows, grouped by who can close them. Each row prints its own next step rather
 * than a bucket-wide instruction, because the step names the company or the field — the
 * thing a person actually goes and fixes.
 */
function planLines(plan: ActivityPlan): string {
  const blocks: string[] = [];
  for (const [disposition, why] of HUMAN_BUCKETS) {
    const items = plan.rows.filter((r: ActivityPlanRow) => r.disposition === disposition);
    if (!items.length) continue;
    const lines = items
      .slice()
      .sort((a, b) => (b.row.day || "").localeCompare(a.row.day || ""))
      .map((item) => {
        const named = trimDateTail((item.row.title || "").trim(), item.row.day);
        return `• ${item.row.day || "(no date)"} — ${named || "(untitled)"}\n    → ${item.nextStep}`;
      });
    blocks.push(`${items.length} · ${disposition.toUpperCase()} — ${why}\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}

/**
 * What the pipeline would actually close, and what it could not touch. This sentence replaces
 * inc.14's "One pipeline closes all N", which was true about the CAUSE and false about the
 * CURE — and which is why seven increments improved how the number was maintained and none
 * moved it. Of today's 40, exactly one can be filed unattended; the rest are a data ask.
 */
function planSentence(plan: ActivityPlan): string {
  const p = plan.counts;
  const needsHuman = p.unknownCompany + p.ambiguousCompany + p.noDate + p.noCompany;
  const built =
    `Building that pipeline is necessary and NOT sufficient: of the ${p.considered}, ` +
    `${p.attachable} could be filed unattended today (the archive names a company the CRM ` +
    `already has). The other ${needsHuman} need a person first — ` +
    `${p.unknownCompany} name a company the CRM does not have, ` +
    `${p.ambiguousCompany} name a company two CRM orgs answer to, ` +
    `${p.noDate} have a known company and no Call Date, and ` +
    `${p.noCompany} never said who the meeting was with at all.`;
  return p.noCompany
    ? `${built} The last group is the wall — the rows below are everything that ISN'T it, ` +
      `because those ${p.noCompany} carry one identical ask and printing them would bury the rest.`
    : built;
}

/**
 * The ledger row for "meetings that happened and never reached the CRM".
 *
 * Returns null when every archive row has a CRM activity — a row saying "0 meetings are
 * missing" is noise on a to-do list. As with the archive finding, an existing row is NOT
 * auto-resolved: whether a finding is done is Rob's call.
 *
 * TWO SHAPES, AND THEY ARE NOT THE SAME PROBLEM — the script has said so in its console
 * output since inc.2 and the ledger row never did:
 *
 *   - `crmMeetings === 0` → nothing was ever matched because there was nothing to match
 *     against. No path writes a meeting activity at all. HIGH: the pipeline is absent,
 *     not lagging.
 *   - `crmMeetings > 0`  → the pipeline exists and these specific meetings fell through
 *     it. Now the rows ARE the ask (inc.13's lesson: a count Rob cannot act on is not a
 *     to-do), so they are listed, newest first, uncapped — a silent top-N would read as
 *     "that's all of them".
 *
 * @param plan optional — `planMeetingActivities(check.archiveOnly, orgs)` from the same run.
 *   With it, the row says what a pipeline would and would not close and lists the rows a
 *   person has to move. WITHOUT it the row states the gap and stops: the old text claimed
 *   "one pipeline closes all N", and a claim about the cure cannot be made from the
 *   reconciliation alone — that is precisely the sentence inc.15 disproved. Missing is not
 *   the same as zero, so no breakdown is printed rather than an invented one.
 */
export function buildCrmGapFinding(check: ArchiveCheck, plan?: ActivityPlan): ArchiveFinding | null {
  const { counts } = check;
  const missing = counts.archiveOnly;
  if (!missing) return null;

  const noPipeline = counts.crmMeetings === 0;

  const shared =
    `Of the archive's ${counts.archiveRows} row(s), ${missing} have no meeting activity on ` +
    `any org or person record. The CRM holds ${counts.crmMeetings} meeting activit(ies) and ` +
    `${counts.matched} of them agree with an archived row` +
    `${counts.crmOnly ? `; ${counts.crmOnly} CRM meeting(s) have no archive row at all` : ""}` +
    `${counts.ambiguous ? `; ${counts.ambiguous} row(s) could honestly be more than one CRM meeting and are never resolved by guessing` : ""}.`;

  // The plan's list, when there is one to print. `planLines` can come back empty — every
  // orphan in the no-company wall — and an empty block would leave a dangling colon under a
  // sentence promising rows.
  const planned = plan ? planLines(plan) : "";
  const planBlock = plan ? ` ${planSentence(plan)}${planned ? `\n\n${planned}` : ""}` : "";

  const detail = noPipeline
    ? `${shared} Nothing here is a failed MATCH — with zero meeting activities there was ` +
      `nothing to match against. Every archived meeting is missing because no path writes ` +
      `a meeting activity, not because the reconciliation disagreed.${planBlock}`
    : // The partial gap keeps its OWN uncapped list: there the rows are the ask one by one,
      // and the plan's grouped list drops the no-company wall on purpose. Swapping one for
      // the other would silently shorten a list Rob reads as complete. Plan sentence only.
      `${shared} These specific meetings fell through a pipeline that otherwise works, so ` +
      `each one is its own missing record. Never auto-reconciled: writing an activity onto ` +
      `the wrong company is unrecoverable, an unmatched pair is a click to fix.` +
      (plan ? ` ${planSentence(plan)}` : "") +
      `\n\n${rowLines(check.archiveOnly)}`;

  return {
    entityName: "CRM meeting record",
    title: noPipeline
      ? `${counts.archiveRows} recorded meetings are in the archive; the CRM has NO meeting activities`
      : `${missing} archived meetings never reached the CRM`,
    detail,
    severity: noPipeline ? "high" : "medium",
    dedupeKey: KEY_CRM_GAP,
  };
}
