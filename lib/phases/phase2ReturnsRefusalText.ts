// Q63 leg (5) inc.12: what the door's refusal SAYS to the person holding the form.
//
// `planPhase2ReturnsWrite` answers in refusal codes — `bad_measured_at`,
// `no_revenue_basis`. Those are precise and they are not English. Something has to
// turn them into a sentence a measurer can act on, and that translation lives here,
// pure and tested, rather than inside the form's JSX, for one reason that has bitten
// this codebase before: a wording that exists only in a component is a wording no
// test can pin, and the guarantee's vocabulary is exactly the vocabulary that must
// not drift. `phase2Guarantee` composes the money sentence in one place for the same
// reason; this is its counterpart on the way in.
//
// THE SENTENCES SAY WHAT WOULD FIX IT, NOT WHAT IS WRONG. "Required" tells a measurer
// nothing they cannot already see from an empty box. Each line below names the shape
// the door will accept, because the person reading it is mid-correction.
//
// A BLANK NUMBER IS NEVER "MEASURED AS ZERO" — inc.8 made that a property of the
// intake seam, and the sentence for `bad_labor_hours_saved` has to carry the same
// meaning outward: a customer who genuinely saved no hours is a measurement of 0,
// typed deliberately, and the form says so rather than letting a blank stand in for
// a number nobody entered.
//
// EXHAUSTIVE BY TYPE. The map is keyed by `Phase2ReturnsRefusal`, so a refusal added
// to the door without a sentence here fails the build rather than reaching a rep as
// a raw code like `bad_revenue`.

import type { Phase2ReturnsRefusal } from "./phase2ReturnsWrite";

const TEXT: Record<Phase2ReturnsRefusal, string> = {
  no_customer_id:
    "This measurement is not attached to a customer. Open it from a company record.",
  no_measured_by: "Enter who took this measurement — a measurement with no measurer is unauditable.",
  no_measured_at: "Enter the date and time this measurement describes.",
  bad_measured_at: "That date could not be read. Use the picker, or an ISO instant.",
  no_revenue_basis: "Choose which revenue question this number answers.",
  bad_revenue_basis: "That is not a revenue basis. Choose top line or attributed.",
  bad_labor_hours_saved:
    "Hours saved must be a number that is zero or more. If no hours were saved, enter 0 — leaving it blank is not the same claim.",
  bad_labor_cost_per_hour:
    "Loaded cost per hour must be a number that is zero or more.",
  bad_revenue:
    "Revenue since Phase 2 started must be a number that is zero or more. If none, enter 0.",
};

/**
 * A refusal code → the sentence shown beside the field it refused.
 *
 * Unknown codes are handed back verbatim rather than swallowed or replaced with a
 * generic apology: a code on screen is ugly, but it is the truth and it is
 * greppable. A soothing "something went wrong" would hide the one string that says
 * which door refused and why.
 */
export function phase2RefusalText(reason: string): string {
  return TEXT[reason as Phase2ReturnsRefusal] ?? reason;
}

/**
 * Refusals as the API returns them → field name → sentence.
 *
 * The FIRST refusal for a field wins. The door reports at most one reason per field
 * today, and if that ever changes, showing the earliest (the door checks presence
 * before shape) keeps "you left it blank" from being buried under "and it is
 * malformed" — which is the less useful of the two when the box is empty.
 */
export function phase2RefusalsByField(
  refusals: readonly { field: string; reason: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of refusals) {
    if (!(r.field in out)) out[r.field] = phase2RefusalText(r.reason);
  }
  return out;
}
