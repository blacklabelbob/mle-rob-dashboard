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

/**
 * Q69 inc.18 — the OTHER button on a proposal, and what it really does.
 *
 * inc.15 found that resolving a proposal silently loses a company and answered
 * it by ADDING the Create control beside it. The destructive click itself was
 * never touched: on a proposal row, "Resolve" still reads as ordinary ledger
 * housekeeping ("done with this for now") while doing something permanent.
 * `supabaseProposalSink.existingTitles` selects flags at ANY status — its own
 * comment: "resolved means 'no'" — so once this title is resolved, inc.3's
 * dedupe never proposes that domain again. Every future email to the company
 * is deduped against a flag Rob dismissed in a hurry, and no surface anywhere
 * says the door closed. Same class as inc.16/inc.17: a real outcome the
 * interface erased, this time the irreversible one.
 *
 * NOT A CONFIRM DIALOG. A modal on the ledger's most-used button taxes the
 * ordinary findings to warn about the rare one, and "are you sure?" is the
 * MS-DOS answer to a UI question. The honest fix is cheaper: on a proposal row
 * only, the button stops claiming to be a resolve, says what it decides
 * ("Not a company"), names the permanence in one quiet line, and points at the
 * button that does the other thing. The reviewer reads it BEFORE the click,
 * which is the only moment the sentence is worth anything.
 *
 * The note placeholder changes with it. On a proposal, the note is the only
 * record of WHY a domain was shut out of the CRM forever — a reviewer asked
 * "optional note…" writes nothing, and next quarter nobody can tell a vendor
 * from a missed customer.
 *
 * Ordinary flags get their existing copy back, unchanged and hint-free: 99% of
 * the ledger is not proposals, and a permanence warning on a row where nothing
 * is permanent is noise that teaches Rob to ignore the line that matters.
 */
export type ResolveCopy = { label: string; tooltip: string; hint: string; notePlaceholder: string };

export function resolveControlCopy(title: string): ResolveCopy {
  const domain = proposalDomain(title);
  if (!domain) {
    return {
      label: "Resolve",
      tooltip: "mark this handled",
      hint: "",
      notePlaceholder: "optional note…",
    };
  }
  return {
    label: "Not a company",
    // The tooltip and the hint carry the same fact, because the button and the
    // line beneath it disagreeing is the inc.17 defect.
    tooltip: `permanent — ${domain} is never proposed again`,
    hint: `Dismissing is permanent: ${domain} won't be proposed again. If it is a company, use Create company.`,
    notePlaceholder: "why isn't this a company?",
  };
}

/**
 * Q69 inc.19 — the ledger write that failed, and the button that said nothing.
 *
 * inc.18 taught the Resolve button to name the permanence it carries. It never
 * checked whether the click landed. `ThingsToAddress.resolve()` refetched only
 * `if (r.ok)` — the failure branch was empty — and `markRead()` didn't read
 * `r.ok` at all. So a refused PATCH rendered as ABSOLUTELY NOTHING: the row sat
 * there unchanged, the note the reviewer typed sat there unsent, and the only
 * available reading is "the button is broken". Same class as inc.15–inc.18: a
 * real outcome the interface erased — this time the outcome of the click itself.
 *
 * WHY IT'S WORSE ON A PROPOSAL ROW. inc.18 just told Rob this click is
 * permanent. When it silently no-ops he has to assume the worst — that the
 * domain may already be shut out — and the safe move (don't click again) is
 * exactly the move that leaves the item stuck forever. The single most useful
 * sentence after a failed dismiss is that the domain is still proposed.
 *
 * REFUSED AND UNREACHABLE ARE DIFFERENT CLAIMS, kept apart the way inc.16 kept
 * `false` apart from `undefined`. A response — any status — means the route ran
 * and answered; every failure path in `/api/admin/flags` returns BEFORE the
 * update, so "nothing changed" is a fact we own. A thrown fetch is a request
 * that may have been applied and lost on the way home; claiming nothing changed
 * there is the cheerful-200 failure inverted, so it says so and asks for a
 * reload BEFORE another click — a second dismiss on a proposal is the click
 * that can't be taken back.
 *
 * READ IS NOT RESOLVE. A failed "mark read" costs a row staying on the Overview
 * for another minute; a failed dismiss is the one Rob must act on. Giving both
 * the same alarm is how the alarm that matters gets ignored — the same reason
 * inc.18 left ordinary flags hint-free.
 */
export type LedgerAction = "resolve" | "read";

export type WriteFailure = { text: string; certain: boolean };

export function writeFailureMessage(
  action: LedgerAction,
  status: number | null,
  title: string
): WriteFailure {
  const domain = proposalDomain(title);
  // `null` = the request never came back. We do not know, and the reviewer's
  // next click is the expensive one.
  if (status === null) {
    if (action === "read") {
      return { text: "Couldn't reach the server — this may still be unread.", certain: false };
    }
    const subject = domain
      ? `${domain} may or may not have been dismissed`
      : "this may or may not have been saved";
    return { text: `Couldn't reach the server — ${subject}. Reload before clicking again.`, certain: false };
  }
  if (action === "read") {
    return { text: `Still unread — nothing changed (server said ${status}).`, certain: true };
  }
  // The reassurance is the point: after inc.18's warning, "still proposed" is
  // what tells Rob the permanent thing did NOT happen.
  const subject = domain
    ? `${domain} was NOT dismissed and is still proposed`
    : "this item is still open";
  return { text: `Nothing changed — ${subject} (server said ${status}). Try again.`, certain: true };
}

/**
 * Q69 inc.20 — the Overview checkbox that promises to clear a row it can never
 * clear.
 *
 * The Overview's unread filter has a deliberate exception (inc.6): a proposal
 * has `entity_id: null` because no record exists yet, so the Overview is its
 * ONLY surface, and marking it read must not be able to hide the one place it
 * can be acted on. Correct rule — with no control-side counterpart. The
 * checkbox still renders on proposal rows, still PATCHes `read_at`, and the row
 * still stays. The box ticks (it is uncontrolled, so the DOM keeps it ticked),
 * nothing moves, and the honest reading is "the checkbox is broken".
 *
 * Its tooltip is worse than the click. "clears from Overview, stays on the
 * record until resolved" is false in BOTH clauses on a proposal: it does not
 * clear, and there is no record to stay on. This is inc.16's defect with the
 * sign flipped — there the UI erased a real outcome, here it advertises an
 * outcome that cannot happen.
 *
 * So the control tells the truth per row instead of one caption for all of
 * them: no checkbox on a proposal (an unclickable one still invites the click),
 * and on an ordinary flag a tooltip whose second clause depends on whether that
 * flag actually HAS a record page — `hasRecord` is `entity_id`, and an
 * entity-less finding pointing at a page that does not exist is the same lie in
 * a quieter place.
 *
 * The proposal line names the two exits, because "why won't this go away" is
 * only useful when answered with what does make it go away.
 */
export type ReadControl = { checkbox: boolean; tooltip: string };

export function overviewReadControl(title: string, hasRecord: boolean): ReadControl {
  if (proposalDomain(title)) {
    return {
      checkbox: false,
      tooltip: "stays here until you create the company or dismiss it — there's no record page for it yet",
    };
  }
  return {
    checkbox: true,
    tooltip: hasRecord
      ? "mark read — clears from Overview, stays on the record until resolved"
      : "mark read — clears from Overview; it has no record page, so resolve it here",
  };
}
