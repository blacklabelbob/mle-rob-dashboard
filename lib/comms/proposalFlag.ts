// Q69 increment 6: reading a queued proposal back OFF the ledger.
//
// inc.3 wrote proposals onto the shared `flags` table because a second queue is
// a queue nobody looks at. The cost of that reuse is this file: a flag row is
// prose plus a title, so the UI needs one place — tested — that decides "is this
// row a company proposal, and which domain is it about?".
//
// The title is the contract (`proposalTitle()` in ./orgProposal, also the dedupe
// key). Parsing it here rather than in the component keeps the two ends of that
// contract in one testable pair: change the prefix and these tests fail loudly
// instead of the button quietly vanishing from the ledger.

import { proposalTitle } from "./orgProposal";

const TITLE_PREFIX = "New company domain: ";

// Guard: if proposalTitle's shape ever drifts from the prefix this file parses,
// fail at import time rather than rendering a ledger with no create buttons.
if (!proposalTitle("x.com").startsWith(TITLE_PREFIX)) {
  throw new Error("proposalFlag: title contract drifted from proposalTitle()");
}

/**
 * The domain a proposal flag is about, or null if this row is an ordinary
 * finding. Null — not "" — because an empty domain is a value the create route
 * would reject with a confusing 400; "this is not a proposal" is a different
 * fact from "this proposal has no domain".
 */
export function proposalDomain(title: string): string | null {
  if (!title.startsWith(TITLE_PREFIX)) return null;
  const domain = title.slice(TITLE_PREFIX.length).trim();
  return domain ? domain : null;
}

/**
 * The name guess inc.3 parked in the detail line, for pre-filling the input.
 *
 * It is a PRE-FILL, never a default: the create route refuses a blank name, and
 * a reviewer who clears this box must type one. Returns "" when the detail
 * carries no suggestion (a punctuation-only domain label), which leaves the box
 * empty and the refusal path intact — the one thing that must not happen is a
 * guessed name reaching `orgs.name` without a human confirming it.
 */
export function suggestedNameFromDetail(detail: string): string {
  const m = detail.match(/Suggested name: "([^"]*)"/);
  return m ? m[1] : "";
}
