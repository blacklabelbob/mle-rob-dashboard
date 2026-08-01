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
// Pure per CR-3: no clock, no network, no React.

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
  if (!controls.length || !detail.includes(CONFIRM_INSTRUCTION)) return detail;
  const byKey = new Map(controls.map((c) => [hostConfirmKey(c.host, c.orgId), c] as const));

  let host: string | null = null;
  return detail
    .split("\n")
    .map((line) => {
      // Anything that is not a continuation ends the bullet's reach — an instruction further
      // down the row belongs to whatever bullet is above IT, or to none.
      if (!ARROW.test(line)) {
        host = BULLET.exec(line)?.[1] ?? null;
        return line;
      }
      if (!host || !line.includes(CONFIRM_INSTRUCTION)) return line;
      const orgId = ORG_ID.exec(line)?.[1];
      if (!orgId) return line;
      const control = byKey.get(hostConfirmKey(host, orgId));
      return control ? line.replace(CONFIRM_INSTRUCTION, instructionFor(control)) : line;
    })
    .join("\n");
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
