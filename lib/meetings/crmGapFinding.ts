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
import type { ActivityDisposition, ActivityPlan, ActivityPlanRow, CrmOrg } from "./activityPlan";
import type { AttendanceResolution } from "./attendeeCompany";
import { proposalText, proposeOrgForHost } from "./hostProposal";

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
  const nearMisses = plan.rows.filter((r: ActivityPlanRow) => r.nearMiss).length;
  const built =
    `Building that pipeline is necessary and NOT sufficient: of the ${p.considered}, ` +
    `${p.attachable} could be filed unattended today (the archive names a company the CRM ` +
    `already has). The other ${needsHuman} need a person first — ` +
    // Q84 inc.18: "does not have" was FALSE for two of these rows — the CRM held Omega Title
    // under a qualified name and Dixith as a person — and a reader following that sentence
    // creates the duplicate. The near misses are counted apart because their ask is the
    // opposite one: confirm an existing record, do not add a new one.
    `${p.unknownCompany} name a company the CRM does not match` +
    (nearMisses
      ? ` (${nearMisses} of those DO have a close record in the CRM already — confirm it, do not create a second)` : "") +
    `, ` +
    `${p.ambiguousCompany} name a company two CRM orgs answer to, ` +
    `${p.noDate} have a known company and no Call Date, and ` +
    `${p.noCompany} never said who the meeting was with at all.`;
  return p.noCompany
    ? `${built} The last group is the wall — the rows below are everything that ISN'T it, ` +
      `because those ${p.noCompany} carry one identical ask and printing them would bury the rest.`
    : built;
}

/**
 * One planned row paired with what its own recording's attendee list said. Exactly the shape
 * `attendanceForRow` already returns, carried by the caller — this module reads it, it never
 * performs the join (that key lives in `archiveCheck.recordingKey` and stays there).
 */
export type RowAttendance = { row: ArchiveRow; resolution: AttendanceResolution };

/**
 * The attendance evidence, folded into the CRM-gap row — because inc.64 filed this finding by
 * HAND, with no dedupeKey, which is the exact disease inc.8→inc.14 spent seven increments
 * curing on #133 and #134: a ledger number nobody re-types goes stale on Rob's page. It rides
 * the mechanism now or it does not go on the page at all.
 *
 * **Grouped by HOST, not by row, and that is the entire point of printing it.** inc.64/65
 * measured 3 rows behind 2 unknown hosts (`cgroofing.net`, `gulfregroup.com`); listing 3 rows
 * asks Rob to read three meetings, listing 2 hosts asks him to fill two Domain fields — after
 * which those rows attach themselves unattended, permanently. The ask CONVERTS rather than
 * shrinks, so it is stated in the unit he acts in.
 *
 * `no-external` is said out loud in the tally rather than dropped. Those calls carried only our
 * own domains or free mailboxes and can NEVER name a company; omitting them would make this
 * evidence look like it moves more rows than it does — the same overclaim inc.15 disproved.
 * `ambiguous-orgs` is reported, never resolved: two companies in the room is a human's call.
 */
function attendanceBlock(entries: RowAttendance[], orgs: CrmOrg[] = []): string {
  if (!entries.length) return "";
  const tally = (kind: AttendanceResolution["kind"]) =>
    entries.filter((e) => e.resolution.kind === kind).length;

  // host → the rows whose recording carried it. A host can appear on more than one meeting;
  // that is one field to fill, not one per meeting, so the rows hang UNDER the host.
  const byHost = new Map<string, ArchiveRow[]>();
  for (const { row, resolution } of entries) {
    if (resolution.kind !== "unknown-hosts") continue;
    for (const host of resolution.hosts) {
      const at = byHost.get(host) ?? [];
      at.push(row);
      byHost.set(host, at);
    }
  }

  const resolved = entries.filter((e) => e.resolution.kind === "resolved");
  const ambiguous = entries.filter((e) => e.resolution.kind === "ambiguous-orgs");

  const head =
    `${entries.length} of those rows have a recording on this machine, so who was in the room ` +
    `is known independently of what Notion's "Company Meeting with" field says: ` +
    `${tally("resolved")} name a CRM company outright · ${byHost.size} distinct guest host(s) ` +
    `across ${tally("unknown-hosts")} row(s) that no CRM org carries · ` +
    `${tally("ambiguous-orgs")} had two companies in the room and are never picked here · ` +
    `${tally("no-external")} carried only our own domains or free mailboxes and can never name ` +
    `a company at all.`;

  const blocks: string[] = [head];

  if (byHost.size) {
    const lines = [...byHost.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([host, rows]) => {
        const at = rows
          .slice()
          .sort((a, b) => (b.day || "").localeCompare(a.day || ""))
          .map((r) => `${r.day || "(no date)"} ${trimDateTail((r.title || "").trim(), r.day) || "(untitled)"}`)
          .join("; ");
        // Q84 inc.67 — "put it in the RIGHT org's Domain field" is only actionable if Rob
        // already knows which org that is, and both live hosts are near-misses of hosts the
        // CRM holds. When one org is close enough to name, the ask becomes a yes/no instead
        // of a search. When nothing is close, the line is byte-identical to inc.66's — no
        // filler sentence pretending the CRM helped.
        // Q84 inc.70 — `orgs` is passed a second time on purpose: the first decides WHICH org
        // to propose, this one decides whether the write that proposal implies would survive
        // the server's own rule (inc.69's 409). Same table, two different questions.
        const proposal = proposalText(proposeOrgForHost(host, orgs), orgs);
        return (
          `• ${host} — put it in the right org's Domain field (a company can use more than one). Heard on: ${at}` +
          (proposal ? `\n    → ${proposal}` : "")
        );
      });
    blocks.push(
      `${byHost.size} FIELD(S) TO FILL IN THE CRM, and then ${entries.filter((e) => e.resolution.kind === "unknown-hosts").length} ` +
        `row(s) answer themselves unattended, permanently:\n${lines.join("\n")}`,
    );
  }

  if (resolved.length) {
    const lines = resolved
      .map((e) =>
        `• ${e.row.day || "(no date)"} — ${trimDateTail((e.row.title || "").trim(), e.row.day) || "(untitled)"}` +
        `\n    → the room says ${e.resolution.kind === "resolved" ? e.resolution.org.name : ""}`,
      )
      .join("\n");
    blocks.push(`${resolved.length} · ROOM NAMES A CRM COMPANY — evidence from the attendee list, not from prose:\n${lines}`);
  }

  if (ambiguous.length) {
    const lines = ambiguous
      .map((e) =>
        `• ${e.row.day || "(no date)"} — ${trimDateTail((e.row.title || "").trim(), e.row.day) || "(untitled)"}` +
        `\n    → two CRM orgs were in the room (${e.resolution.kind === "ambiguous-orgs" ? e.resolution.orgs.map((o) => o.name).join(", ") : ""}) — a human says which`,
      )
      .join("\n");
    blocks.push(`${ambiguous.length} · TWO COMPANIES IN THE ROOM — never auto-picked:\n${lines}`);
  }

  return blocks.join("\n\n");
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
export function buildCrmGapFinding(
  check: ArchiveCheck,
  plan?: ActivityPlan,
  attendance: RowAttendance[] = [],
  orgs: CrmOrg[] = [],
): ArchiveFinding | null {
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

  // Printed LAST and as its own block: it is a second, independent reading of the same rows
  // (Notion's company field vs who was actually in the room), so it sits beside the plan
  // rather than inside it. Empty when no planned row has a recording here — the honest state
  // for the in-person rows, never a fabricated "0 of 0" paragraph.
  const heard = attendanceBlock(attendance, orgs);
  const heardBlock = heard ? `\n\n${heard}` : "";

  const detail = noPipeline
    ? `${shared} Nothing here is a failed MATCH — with zero meeting activities there was ` +
      `nothing to match against. Every archived meeting is missing because no path writes ` +
      `a meeting activity, not because the reconciliation disagreed.${planBlock}${heardBlock}`
    : // The partial gap keeps its OWN uncapped list: there the rows are the ask one by one,
      // and the plan's grouped list drops the no-company wall on purpose. Swapping one for
      // the other would silently shorten a list Rob reads as complete. Plan sentence only.
      `${shared} These specific meetings fell through a pipeline that otherwise works, so ` +
      `each one is its own missing record. Never auto-reconciled: writing an activity onto ` +
      `the wrong company is unrecoverable, an unmatched pair is a click to fix.` +
      (plan ? ` ${planSentence(plan)}` : "") +
      `\n\n${rowLines(check.archiveOnly)}${heardBlock}`;

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
