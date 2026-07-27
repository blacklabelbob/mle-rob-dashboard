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

/**
 * Q69 inc.15 — the address we actually wrote to, read back off the flag.
 *
 * `planOrgFromProposal` puts this in the new company's provenance note ("first
 * outbound contact TO trent@…"), and it is the only evidence on the record of
 * why the company exists at all. The route has always accepted it; the ledger
 * has never sent it, so every company created through the button lost the line.
 *
 * VERIFIED AGAINST THE DOMAIN, NOT TRUSTED. A flag's detail is prose on a
 * shared table — hand-editable, and inc.3's dedupe means one flag can outlive
 * the message that made it. An address at a DIFFERENT domain would write "first
 * outbound contact to <someone else>" onto this company's record forever, so a
 * mismatch returns "" and the note simply omits the line. A missing line is a
 * gap; a wrong one is a false statement on a customer record.
 *
 * Domain read after the LAST `@` (the inc.1 rule): `indexOf` reads
 * `"a@b"@roofco.com` as `b"@roofco.com` and would reject a legitimate address.
 */
export function addressFromDetail(detail: string, domain: string): string {
  const m = detail.match(/We sent mail to (\S+) and /);
  if (!m) return "";
  const address = m[1].toLowerCase();
  const at = address.lastIndexOf("@");
  if (at < 1 || at === address.length - 1) return "";
  return address.slice(at + 1) === domain.trim().toLowerCase() ? address : "";
}

/**
 * Q69 inc.16 — what the reviewer is told after the click, told truthfully.
 *
 * The create route does two writes, and only the first is guaranteed: the org
 * row, then the ledger flag's resolve. It reports the second as `flagResolved`
 * and deliberately does NOT throw when it fails — "the company exists either
 * way, and telling the reviewer the flag is still open beats a 500 that makes a
 * successful create look failed" (that route's own comment).
 *
 * That report had no consumer. The button rendered one unconditional green
 * "Created X ✓" for all three outcomes, so the case the route took care to
 * describe was the case the UI erased. The cost is not cosmetic: an unresolved
 * flag stays on the ledger, Rob clicks its Create button again, and inc.9's
 * race guard answers 409 `domain-already-known` — the button reads as broken on
 * the very domain it just succeeded on.
 *
 * `undefined` is its own outcome, never folded into `true`. It means the
 * response never carried the field (a body that failed to parse, a shape that
 * drifted), which is "we don't know", and claiming a close we cannot see is the
 * cheerful-200 failure one layer up. Non-`true` is therefore never reported as
 * done — a redundant glance at the ledger costs a second, a flag believed
 * handled outlives the session.
 */
export type CreateOutcome = { text: string; resolved: boolean };

export function createOutcomeMessage(
  orgName: string | undefined,
  flagResolved: boolean | undefined
): CreateOutcome {
  // The name is the reviewer's own confirmed word coming back — evidence the
  // row that exists is the row they meant. Absent, say the deed without it
  // rather than printing "Created undefined".
  const what = orgName && orgName.trim() ? `Created ${orgName.trim()}` : "Created";
  if (flagResolved === true) return { text: `${what} ✓`, resolved: true };
  if (flagResolved === false) {
    return { text: `${what} — this item stays open; resolve it by hand.`, resolved: false };
  }
  return { text: `${what} — couldn't confirm this item closed; check the ledger.`, resolved: false };
}

/**
 * Q69 inc.17 — the form's dead end, said out loud.
 *
 * The vertical select is filled by `GET /api/admin/org-proposals`. That fetch
 * has always been allowed to fail quietly (`r.ok ? r.json() : null`, `.catch`
 * with a comment saying the select stays empty and Create refuses) — which is
 * the right REFUSAL and the wrong REPORT. What the reviewer actually saw was a
 * select offering only "pick vertical…", a Create button greyed out forever,
 * and a tooltip reading "name and vertical are both required": the UI blaming
 * them for a list they were never shown and cannot populate. The proposal is
 * unactionable and nothing on screen says so, which is the same class of defect
 * as inc.16 — a real outcome the interface erased.
 *
 * `unreachable` and `empty` are kept apart because they need different people.
 * Unreachable is transient and the reviewer's move is to retry (reopening the
 * form refetches). Empty is a CRM with no verticals — no amount of retrying
 * fixes it, and `orgs.vertical_id` is a NOT NULL FK (inc.4), so the honest
 * sentence is that a company cannot be filed at all until one exists.
 *
 * ONE function drives both the notice and the button so they cannot disagree.
 * A blocked button whose tooltip names a different obstacle than the line above
 * it is how a reviewer concludes the page is broken rather than that the list
 * failed to load. Precedence is deliberate: a list that never arrived outranks
 * "pick a vertical", because picking is not a thing they can do.
 */
export type VerticalLoad = "loading" | "ready" | "unreachable";

export type PickerState = { notice: string; canCreate: boolean; blockReason: string };

export function verticalPickerState(
  load: VerticalLoad,
  verticalCount: number,
  hasName: boolean,
  hasVertical: boolean
): PickerState {
  if (load === "loading") {
    return { notice: "loading verticals…", canCreate: false, blockReason: "still loading the vertical list" };
  }
  if (load === "unreachable") {
    const s = "Couldn't load the vertical list — nothing was created. Close and reopen to retry.";
    return { notice: s, canCreate: false, blockReason: s };
  }
  if (verticalCount < 1) {
    const s = "No verticals exist yet — a company can't be filed without one. This proposal stays queued.";
    return { notice: s, canCreate: false, blockReason: s };
  }
  // Only here is the obstacle genuinely the reviewer's to clear.
  if (!hasName) return { notice: "", canCreate: false, blockReason: "type the company name" };
  if (!hasVertical) return { notice: "", canCreate: false, blockReason: "pick a vertical" };
  return { notice: "", canCreate: true, blockReason: "" };
}
