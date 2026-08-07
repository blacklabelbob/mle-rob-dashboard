/**
 * Q85 inc.9 — the person decisions become a ROW ROB CAN ACT ON, and the row is corrected in
 * place instead of stacking.
 *
 * inc.8 built the decision (`decidePersonProposal`) and then filed its result to
 * `/api/admin/flags` **by hand, with no `dedupeKey`** — which is precisely the disease Q84
 * inc.8→inc.14 spent six increments curing: prod once held #132 saying 26, #134 saying 25 and
 * #136, all open at the same time, about one finding. A hand-filed row is stale the first run
 * nobody retypes it, and the count here moves every time a meeting lands. So the person half
 * goes onto the same mechanism as its two siblings: one stable key, one row, re-minted every
 * `check:archive`.
 *
 * THE TWO ASKS STAY TWO ASKS ON ONE ROW, and that is deliberate rather than tidy:
 *
 *   - **PROPOSE** — the CRM holds nobody like this. The action is *open a person record*, in
 *     the CRM, and it is Rob's to accept.
 *   - **WITHHOLD** — the value is an existing person's display handle. The action is *fix the
 *     name in Notion*, and it must never become a person record.
 *
 * They ride ONE ledger row because they are one finding ("the attendee names on the archive do
 * not all resolve") with two dispositions; two keys would let a run correct one and leave the
 * other saying yesterday's names — the exact split that produced #132 vs #134. They are printed
 * under two headings with two different verbs so nobody can act on the wrong one.
 *
 * NOTHING IS WRITTEN, AND NOTHING IS PROPOSED HERE. This composes text. No person record, no
 * proposal row, no Notion edit — the accept click stays a human's, and the withheld names have
 * no click at all because their fix is not in this system.
 *
 * PURE (CR-3): no clock, no network, no Supabase, no Notion, no fetch.
 */

import type { ArchiveFinding } from "./archiveFinding";
import type { PersonProposalDecision } from "./personProposal";
import { personProposalText } from "./personProposal";

/**
 * Distinct from `KEY_CRM_GAP` and `KEY_NEEDS_HUMAN_ACCOUNT` on purpose: those two are about
 * MEETINGS the CRM never heard about. This is about PEOPLE. Sharing a key would make each run
 * overwrite the other's row, which is the failure the keys exist to prevent.
 */
export const KEY_PERSON_PROPOSALS = "meeting-archive/person-proposals";

/** The heading a reader scans for. Spelled once so the prose and any future re-aim agree. */
export const PROPOSE_HEADING = "PROPOSE — the CRM has never met these people";
export const WITHHOLD_HEADING = "DO NOT CREATE — fix the name in Notion";

/**
 * Q85 inc.23 — the row says PROPOSE and has never said WHAT ROB HAS TO SUPPLY.
 *
 * Twenty-two increments built the decision, the plan and, in inc.22, the caller that runs the
 * plan against live prod. Every one of them stops at the same two answers: `people.vertical_id`
 * is NOT NULL and the meeting row's company cell — the one cell that could have named a
 * vertical — is empty, which is the reason the name is on this row at all; and Rob's standing
 * no-orphans rule makes the referrer required for a rule rather than for a column. Both are
 * refusals in `planPersonFromArchive` (`vertical-required`, `referrer-required`), and until now
 * they were visible only to whoever ran a script in a terminal. Rob reads the LEDGER. A row
 * that asks him to accept a person, without telling him the two things only he can answer, is
 * an ask he cannot action — which is how "propose the person" stayed a sentence for 22
 * increments.
 *
 * The vertical list is passed in, never hard-coded: it is read from the same database the row
 * would land in, so an option printed here is an option Postgres will accept. Hard-coding it is
 * how the planner's readable `unknown-vertical` refusal turns into a 500 on the NOT NULL FK.
 */
export const ANSWER_HEADING = "WHAT ONLY YOU CAN ANSWER (both, per name)";

/**
 * One ledger row for every unresolved attendee name, or `null` when there are none.
 *
 * `null` is not "resolved". The caller leaves any existing row for Rob to close, exactly as the
 * sibling findings do — a script deciding his to-do list is finished is the machine closing his
 * work for him.
 *
 * Severity is **medium**, not high: nothing is broken and no record is wrong. Two names are
 * waiting on a click and one is waiting on a Notion edit. High is reserved for a CRM that is
 * saying something untrue.
 */
export function buildPersonProposalFinding(
  decisions: PersonProposalDecision[],
  /**
   * The verticals this CRM actually holds, read live by the caller. Empty is a legitimate
   * state — the caller could not reach the list — and the row then asks for the list by name
   * instead of printing an invented one. Optional so the withhold-only and empty cases, which
   * never print an option list, keep their existing call shape.
   */
  verticalIds: readonly string[] = []
): ArchiveFinding | null {
  // Deduplicate by name: the same attendee appears on every meeting they attended, and a row
  // that lists a person three times reads as three people.
  const byName = new Map<string, PersonProposalDecision>();
  for (const d of decisions) if (!byName.has(d.name)) byName.set(d.name, d);
  const unique = [...byName.values()];
  if (unique.length === 0) return null;

  const propose = unique.filter((d) => d.kind === "propose");
  const withhold = unique.filter((d) => d.kind === "withhold");

  const parts: string[] = [];
  parts.push(
    `${unique.length} name(s) on the meeting archive resolve to nobody in the CRM. ` +
      `They are NOT one ask: ${propose.length} need a person record, ${withhold.length} must NOT get one. ` +
      `Nothing here has been created — no person, no proposal, no attachment.`
  );

  if (propose.length) {
    parts.push(
      `\n${PROPOSE_HEADING} (${propose.length}):\n` +
        propose.map((d) => `  ＋ ${personProposalText(d)}`).join("\n")
    );
    // The two answers, printed WITH the names rather than in a doc nobody opens. Neither is
    // guessable and neither is defaulted: a vertical invented here is a wrong record, and
    // defaulting the referrer to Rob would be this build putting an invented relationship in
    // front of him.
    const options = verticalIds.length
      ? verticalIds.join(" · ")
      : "ask for the list — it could not be read this run";
    parts.push(
      `\n${ANSWER_HEADING}:\n` +
        `  1. VERTICAL — one of: ${options}. The meeting row's company cell is empty, which is why ` +
        `this proposal exists, so nothing on the row can name one and the column will not take a blank.\n` +
        `  2. WHO INTRODUCED THEM — a P-#### already in the CRM. Being on a meeting is not an ` +
        `introduction, and a person filed with no referrer is an orphan on your network.\n` +
        `  Answer both and the record is one command, per name:\n` +
        propose
          .map(
            (d) =>
              `    npm run propose:archive-person -- --input /tmp/q85-check.json ` +
              `--name "${d.name}" --vertical <id> --referred-by P-####`
          )
          .join("\n") +
        `\n  (the input file comes from: npm run --silent check:archive -- --json > /tmp/q85-check.json)`
    );
  }

  if (withhold.length) {
    parts.push(
      `\n${WITHHOLD_HEADING} (${withhold.length}):\n` +
        withhold.map((d) => `  ⛔ ${personProposalText(d)}`).join("\n") +
        `\n  The fix for these is in Notion, not here. Creating the record would duplicate a human the CRM already holds.`
    );
  }

  // The title carries both numbers because a single total would hide the distinction the whole
  // module exists to draw — "3 unknown attendees" invites three records, one of which is wrong.
  const title =
    withhold.length === 0
      ? `${propose.length} meeting attendee(s) the CRM has never met`
      : `${propose.length} meeting attendee(s) to propose · ${withhold.length} that must NOT become a record`;

  return {
    entityName: "Meeting archive",
    title,
    detail: parts.join("\n"),
    severity: "medium",
    dedupeKey: KEY_PERSON_PROPOSALS,
  };
}
