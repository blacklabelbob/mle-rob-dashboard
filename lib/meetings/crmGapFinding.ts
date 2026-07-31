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
 *     against. No path writes a meeting activity at all. That is ONE build task that
 *     closes every row at once, so listing the meetings individually would file 40
 *     to-dos for a single fix. HIGH: the pipeline is absent, not lagging.
 *   - `crmMeetings > 0`  → the pipeline exists and these specific meetings fell through
 *     it. Now the rows ARE the ask (inc.13's lesson: a count Rob cannot act on is not a
 *     to-do), so they are listed, newest first, uncapped — a silent top-N would read as
 *     "that's all of them".
 */
export function buildCrmGapFinding(check: ArchiveCheck): ArchiveFinding | null {
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

  const detail = noPipeline
    ? `${shared} Nothing here is a failed MATCH — with zero meeting activities there was ` +
      `nothing to match against. Every archived meeting is missing because no path writes ` +
      `a meeting activity, not because the reconciliation disagreed. One pipeline closes ` +
      `all ${missing}, which is why they are not listed as ${missing} separate to-dos.`
    : `${shared} These specific meetings fell through a pipeline that otherwise works, so ` +
      `each one is its own missing record. Never auto-reconciled: writing an activity onto ` +
      `the wrong company is unrecoverable, an unmatched pair is a click to fix.` +
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
