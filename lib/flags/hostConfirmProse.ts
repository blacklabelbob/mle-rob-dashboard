// Q84 inc.76 — the OTHER half of the row inc.69–75 built.
//
// THE DEFECT, stated plainly: the finding's prose still ends *"Confirm it and put the host on
// that org"*. That sentence was written when confirming meant Rob opening the company, finding
// the Domain field and typing a host into it. Since inc.73 the very same row renders a control
// that does it in one click — so the ledger now instructs him, by hand, to do the thing a button
// two lines below already does. inc.75 fixed the control's own words; the paragraph above it was
// never told the control exists.
//
// WHY THE SWAP HAPPENS HERE AND NOT WHERE THE PROSE IS WRITTEN. `buildCrmGapFinding` composes
// the detail BEFORE the row is written, and whether a button will exist is not knowable then:
// `flags.payload` may be refused by a database without the column (0035 is PENDING on prod, and
// inc.74's guard lands the row WITHOUT the payload in that case). A sentence promising a click
// that never renders is worse than the stale instruction. At READ time the question is already
// answered — the controls in hand ARE the payload, graded — so the swap is made against evidence
// rather than against an expectation.
//
// FOUR REFUSALS:
//   - The match is on the PAIR (the host from the bullet, the org id from its own arrow line),
//     never on the sentence. Two hosts on one row carry the same sentence; rewriting the wrong
//     one would point Rob at a button that writes a different company's field.
//   - A line whose pair has NO control is returned byte-for-byte. No control, no claim.
//   - A link control (the action belongs to another org's page) never says "the button on this
//     row" — it says where the control is, which is inc.73's rule restated in prose.
//   - Called with no controls the whole detail is returned identical, so a pre-0035 ledger reads
//     exactly as it does today.
//
// Q84 inc.77 extends the same read-time rule one level up, to the block's HEADING — see
// `retargetHeading`. Same evidence, same refusals, one more stale instruction retired.
//
// Pure per CR-3: no clock, no network, no React.

import { WITHIN_ARCHIVE_CHECK } from "@/lib/meetings/archiveCadence";
import { FIELDS_TO_FILL_HEADING, UNATTENDED_CLOSE_CLAUSE } from "@/lib/meetings/crmGapFinding";
import { CONFIRM_INSTRUCTION } from "@/lib/meetings/hostProposal";
import { hostConfirmKey, type HostConfirmControl } from "./hostConfirmView";

/** `• cgroofing.net — put it in the right org's Domain field …` — the host owns the lines under it. */
const BULLET = /^• (\S+) —/;
/** The continuation line the instruction lives on. Only these may claim the bullet's host. */
const ARROW = /^\s+→ /;
/** `likely CG Roofing Group [C-2010] — …` — the org the instruction is about. */
const ORG_ID = /\[(C-\d+)\]/;

/**
 * The finding's detail with every stale confirm instruction re-aimed at the control that now
 * exists for that exact host/org pair.
 *
 * @param detail the row's `detail` exactly as stored.
 * @param controls what `hostConfirmControls` decided for THIS page — so the wording matches the
 *   affordance the reader can actually see, not the one some other page has.
 */
export function retargetConfirmProse(detail: string, controls: readonly HostConfirmControl[]): string {
  if (!controls.length) return detail;
  const byKey = new Map(controls.map((c) => [hostConfirmKey(c.host, c.orgId), c] as const));

  let host: string | null = null;
  return detail
    .split("\n")
    .map((line) => {
      // Anything that is not a continuation ends the bullet's reach — an instruction further
      // down the row belongs to whatever bullet is above IT, or to none.
      if (!ARROW.test(line)) {
        host = BULLET.exec(line)?.[1] ?? null;
        return retargetHeading(line, controls);
      }
      if (!host || !line.includes(CONFIRM_INSTRUCTION)) return line;
      const orgId = ORG_ID.exec(line)?.[1];
      if (!orgId) return line;
      const control = byKey.get(hostConfirmKey(host, orgId));
      return control ? line.replace(CONFIRM_INSTRUCTION, instructionFor(control)) : line;
    })
    .join("\n");
}

/**
 * Q84 inc.77 — the same stale instruction one level up.
 *
 * `N FIELD(S) TO FILL IN THE CRM` counts fields the check found empty, and it was written when
 * filling one meant typing. On the rows that now carry a control some of that N is clicks — but
 * NOT necessarily all of it, and that is the whole difficulty: a proposal is only minted where
 * one org is close enough to name, so a row can honestly be "3 fields, 2 of them a click". A
 * heading that said "3 clicks" would send Rob looking for a button that was never minted.
 *
 * THE REFUSALS:
 *   - The `N` itself is never rewritten. It is what the stored row asserts, and a control that
 *     has already been clicked does not un-find the gap the check found.
 *   - Every host is counted ONCE, at its strongest state (done > button here > link elsewhere),
 *     so a payload carrying two actions for one host cannot inflate the count past the heading's.
 *   - If the controls cover MORE hosts than the heading counts, the payload and the prose
 *     disagree and the line is returned untouched — a disagreement is not something to narrate
 *     over in a parenthetical.
 *   - A link is never described as a click "here" (inc.73's rule); it says whose page it is on.
 */
function retargetHeading(line: string, controls: readonly HostConfirmControl[]): string {
  const at = line.indexOf(FIELDS_TO_FILL_HEADING);
  if (at <= 0) return line;
  const total = Number(line.slice(0, at).trim());
  if (!Number.isInteger(total) || total <= 0) return line;

  // Strongest state per host: what a reader can do about that field, once.
  const strongest = new Map<string, HostConfirmControl>();
  for (const c of controls) {
    const held = strongest.get(c.host);
    if (!held || rank(c) > rank(held)) strongest.set(c.host, c);
  }
  if (!strongest.size || strongest.size > total) return line;

  const states = [...strongest.values()];
  const done = states.filter((c) => c.done).length;
  const here = states.filter((c) => c.here && !c.done).length;
  const link = states.filter((c) => !c.here).length;
  const byHand = total - strongest.size;

  const parts: string[] = [];
  if (done) parts.push(`${done} already set from this page`);
  if (here) parts.push(`${here} one click away right here`);
  if (link) parts.push(`${link} one click away on the company's own page`);
  if (byHand) parts.push(`${byHand} still typed by hand`);

  const end = at + FIELDS_TO_FILL_HEADING.length;
  const graded = line.slice(0, end) + ` (${parts.join(" · ")})` + line.slice(end);
  return sayWhenTheCloseLands(graded, done);
}

/**
 * Q84 inc.79 — the ceiling moved to `lib/meetings/archiveCadence`, where the CONTROL can read
 * it too without this module and `hostConfirmView` importing each other. Re-exported because
 * the constant was inc.78's public answer to "how long", and a caller that already found it
 * here should not have to be told it moved.
 */
export { ARCHIVE_CHECK_CEILING_MINUTES } from "@/lib/meetings/archiveCadence";

/**
 * Q84 inc.78 — the heading's second clause promises a close that nothing has started yet.
 *
 * *"and then N row(s) answer themselves unattended, permanently"* is a true sentence about a
 * field nobody has filled. The moment Rob DOES fill one from this page it becomes a sentence
 * about a write that has already landed — and the row on screen still says N, because the
 * only thing that re-reads the archive is the 30-minute check. He would reload, see the same
 * number, and conclude the click did nothing. That is inc.75's *"did it work?"* ambiguity
 * arriving one level up, and the fix is the same: state the past tense, then state the wait.
 *
 * THE REFUSALS:
 *   - Said ONLY when a write has landed from this page. With nothing set, the promise is
 *     future tense about a future action and a cadence bolted to it is trivia.
 *   - A ceiling, never a countdown, and never a clock time — see the constant above.
 *   - *"permanently"* is never weakened or removed. The wait is about WHEN the row closes,
 *     not whether it stays closed; this clause adds to that promise and does not qualify it.
 *   - It rides the SAME grading pass as the count in front of it: one decision, not two. If
 *     the heading half declined (no controls, a count the payload disagrees with, no integer
 *     in front), this never fires either, so prose quoting the clause elsewhere is untouched.
 */
function sayWhenTheCloseLands(line: string, done: number): string {
  if (!done) return line;
  const at = line.indexOf(UNATTENDED_CLOSE_CLAUSE);
  if (at < 0) return line;
  const end = at + UNATTENDED_CLOSE_CLAUSE.length;
  return (
    line.slice(0, end) +
    ` — the ${done} already set on the next archive check, ${WITHIN_ARCHIVE_CHECK}` +
    line.slice(end)
  );
}

/** done beats a button, a button beats a link — the most a reader can do about that host. */
function rank(control: HostConfirmControl): number {
  if (control.done) return 2;
  return control.here ? 1 : 0;
}

function instructionFor(control: HostConfirmControl): string {
  if (control.done) {
    // Past tense, and it names the limit inc.75 already states in the tooltip: the finding is
    // still open because that is Rob's call, not because the write did not happen.
    return `Done — this company's Domain is ${control.host}, set from the control on this row`;
  }
  if (control.here) return "Confirm it with the control on this row — one click puts the host on this company";
  return `Confirm it on ${control.orgId}'s own page, where the Domain field it changes is on screen`;
}
