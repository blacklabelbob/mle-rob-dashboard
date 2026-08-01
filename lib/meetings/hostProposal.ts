// Q84 inc.67 — the two hosts on Rob's ledger row are NEAR-MISSES of hosts the CRM already has,
// and the row asks him to type a domain from scratch anyway.
//
// inc.66 put the ask in the unit he acts in: `cgroofing.net` and `gulfregroup.com`, two Domain
// fields to fill. But the CRM stores `cgroofinggroup.com` on CG Roofing Group and
// `gulfcoastregroup.com` on Gulf Coast RE Group. Typing a domain onto the *right* org means
// first finding the right org — so the ask is really "go search the CRM", stated as "fill a
// field". A proposal turns it into a yes.
//
// THE PROPOSAL IS NEVER AN ANSWER, AND THE RULES KEEP IT THAT WAY:
//   - inc.17 established on this very data that `cgroofing.net` is NOT the same host as
//     `cgroofinggroup.com`. Nothing here equates them. This module says "this org looks like
//     the owner, confirm it" and every caller prints it as a question.
//   - NO EDIT DISTANCE, NO SCORES. `lib/dedup/match.ts` refuses fuzzy matching by design —
//     a wrong suggestion on Rob's real network is worse than a missing one — and a similarity
//     number would be exactly that, wearing a percentage. Every rung below is an exact
//     comparison a human can re-run in his head and either agree or disagree with.
//   - Ties are never broken. Two orgs reaching the same rung is reported as two, with no pick;
//     the same discipline `ambiguous-company` and `ambiguous-orgs` already hold to.
//   - Nothing is written. This returns what a human WOULD confirm.

import { extractHost, type CrmOrg } from "./activityPlan";
import { hostClaimConflict, hostClaimMessage } from "./hostClaim";
import { normalizeName } from "@/lib/dedup/match";

/**
 * The part of a host that names the company: everything before the TLD, last label first.
 * `cgroofinggroup.com` → `cgroofinggroup`, `mail.cgroofing.net` → `cgroofing`.
 *
 * Deliberately naive about multi-part suffixes (`co.uk` yields `co`). Rob's network is US
 * .com/.net today, and a public-suffix list is a dependency that would have to be kept current
 * to stay correct — a stale one would silently mis-label. When a `co.uk` host appears the
 * honest outcome is that it proposes nothing, which is this module's safe direction.
 */
export function hostLabel(host: string): string {
  const clean = extractHost(host);
  if (!clean) return "";
  const parts = clean.split(".").filter(Boolean);
  if (parts.length < 2) return "";
  return parts[parts.length - 2];
}

/** An org name reduced to the letters a host could carry: "Gulf Coast RE Group" → "gulfcoastregroup". */
function nameSquashed(name: string): string {
  return normalizeName(name || "").replace(/ /g, "");
}

/** An org name's words: "CG Roofing Group" → ["cg", "roofing", "group"]. */
function nameWords(name: string): string[] {
  return normalizeName(name || "").split(" ").filter(Boolean);
}

/** Every host the org already stores, as labels. */
function storedLabels(org: CrmOrg): string[] {
  const out: string[] = [];
  for (const value of [org.domain, org.website]) {
    const label = hostLabel(value || "");
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/**
 * Why an org is being proposed for a host. Ordered strongest first, and the order is the
 * ranking — there is no score to compare, so the rung IS the comparison.
 *
 *   - `name-exact`      — the host label is the org's own name with the spaces taken out
 *                         (`gulfcoastregroup.com` ← "Gulf Coast RE Group"). The strongest
 *                         thing that can be true without the host already being on the record.
 *   - `name-drop-word`  — the label is the org's name with exactly ONE word left out, and the
 *                         missing word is named. This is what both live cases are:
 *                         "CG Roofing Group" minus "group" is `cgroofing`; "Gulf Coast RE
 *                         Group" minus "coast" is `gulfregroup`. Companies shorten their own
 *                         name in a domain constantly — and it is still a human's yes.
 *   - `stored-prefix`   — one of the org's existing host labels starts with this label, or
 *                         this label starts with one of theirs (`cgroofing` / `cgroofinggroup`).
 *                         Weakest rung on purpose: a prefix is also how two unrelated companies
 *                         in one industry collide.
 */
export type HostProposalReason =
  | { rung: "name-exact" }
  | { rung: "name-drop-word"; missingWord: string }
  | { rung: "stored-prefix"; storedLabel: string };

export type HostProposalCandidate = { org: CrmOrg; reason: HostProposalReason };

/**
 * What the CRM can say about who owns an unrecognised host.
 *
 *   - `pick`       — the ONE org that reached the best rung, or `null` when more than one did.
 *   - `candidates` — every org at that rung, always populated when this is non-null.
 *
 * `null` means the CRM holds nothing close, and the caller keeps its existing ask: type the
 * domain onto whichever org is right. Silence is the correct answer more often than not.
 */
export type HostProposal = { host: string; pick: CrmOrg | null; candidates: HostProposalCandidate[] };

const RUNG_ORDER: HostProposalReason["rung"][] = ["name-exact", "name-drop-word", "stored-prefix"];

/** The best reason THIS org gives for owning THIS label, or null. First rung reached wins. */
function reasonFor(label: string, org: CrmOrg): HostProposalReason | null {
  if (!label) return null;

  const squashed = nameSquashed(org.name);
  if (squashed && squashed === label) return { rung: "name-exact" };

  const words = nameWords(org.name);
  // Two words minimum: dropping the only word of a one-word name leaves nothing, and dropping
  // one of two leaves a single common word ("group", "title") that would match half the CRM.
  if (words.length > 2) {
    for (let i = 0; i < words.length; i++) {
      const without = words.slice(0, i).concat(words.slice(i + 1)).join("");
      if (without && without === label) return { rung: "name-drop-word", missingWord: words[i] };
    }
  }

  for (const stored of storedLabels(org)) {
    // Equality is excluded: if the label already equals a stored host the org OWNS it, and this
    // host would never have reached here — `resolveCompanyFromAttendance` matches exact hosts
    // first. Reaching this line on an equal pair would mean the two disagree, and quietly
    // proposing what the other side already rejected is how two ladders drift apart.
    if (stored === label) continue;
    if (stored.startsWith(label) || label.startsWith(stored)) return { rung: "stored-prefix", storedLabel: stored };
  }
  return null;
}

/**
 * Which CRM org, if any, a human should be asked to confirm for an unrecognised guest host.
 *
 * @param orgs every CRM org. Orgs are compared independently and the best rung any of them
 *   reaches decides the shortlist — an org that matches on a weaker rung is dropped rather than
 *   listed underneath, because a list ordered by strength reads as a ranking and invites
 *   picking the top one without reading why.
 */
export function proposeOrgForHost(host: string, orgs: CrmOrg[]): HostProposal | null {
  const label = hostLabel(host);
  if (!label) return null;

  const hits: HostProposalCandidate[] = [];
  for (const org of orgs) {
    const reason = reasonFor(label, org);
    if (reason) hits.push({ org, reason });
  }
  if (!hits.length) return null;

  const best = RUNG_ORDER.find((rung) => hits.some((h) => h.reason.rung === rung));
  const candidates = hits.filter((h) => h.reason.rung === best);
  return {
    host: extractHost(host),
    pick: candidates.length === 1 ? candidates[0].org : null,
    candidates,
  };
}

/**
 * Q84 inc.68 — WHERE the host would go, which is a different question from WHICH org it belongs to.
 *
 * inc.67 named the org. The ask under it says *"put it in the right org's Domain field (a company
 * can use more than one)"* — and a company can use more than one only up to a point: an org record
 * carries exactly TWO host slots, `website` (the primary, and on prod every org that has any host
 * has this one) and `domain` (added by inc.21 for exactly this case, the SECOND host). There is no
 * third. So "fill the Domain field" is safe advice only while that field is empty, and nothing has
 * ever checked it.
 *
 * CORRECTED BY inc.69, which re-read the same table: **"all 19 orgs read `domain: null`" was
 * wrong.** C-2010 (The Title Base) has carried `domain: thetitlebase.com` since 2026-07-23 —
 * its own website host, duplicated into the second slot by that day's intake, months before
 * inc.68 measured. inc.68's conclusion survives (the two orgs it names, C-2017 and C-2018, do
 * read null, so the ledger's instruction is true for them) but its census did not, and the
 * difference matters: the slot was never universally free, so this check was already load-
 * bearing when it was written, not merely pre-emptive. Stating it is still the point: **the one-click confirm inc.67 asked about cannot exist until something knows whether the
 * slot is free**, because a click that silently overwrote a stored host would delete a key
 * `indexOrgsByHost` currently matches on, and the row it broke would not fail loudly — it would
 * just stop resolving.
 *
 *   - `free`      — `domain` is empty. One field, nothing lost. The only state a confirm may write.
 *   - `occupied`  — `domain` already holds a DIFFERENT host. Both slots are spoken for; a third
 *                   host is a schema question for a human, never a click.
 *   - `already`   — `domain` is this exact host. Unreachable in principle: an org storing the host
 *                   is matched by `resolveCompanyFromAttendance` before anything reaches here.
 *                   Reported rather than swallowed, because reaching it means the two disagree.
 */
export type HostWriteSlot =
  | { kind: "free" }
  | { kind: "occupied"; storedHost: string }
  | { kind: "already" };

/** Whether this host could be written to that org's `domain` without destroying a stored host. */
export function hostWriteSlot(host: string, org: CrmOrg): HostWriteSlot {
  const stored = extractHost(org.domain || "");
  if (!stored) return { kind: "free" };
  if (stored === extractHost(host)) return { kind: "already" };
  return { kind: "occupied", storedHost: stored };
}

/** What the reader is told about the slot. Never an instruction the CRM cannot carry out. */
export function writeSlotText(slot: HostWriteSlot): string {
  switch (slot.kind) {
    case "free":
      return "its Domain field is empty, so this is one field to fill and nothing is displaced";
    case "occupied":
      return (
        `its Domain field already holds ${slot.storedHost} — an org carries two hosts at most ` +
        "(website + domain) and both are taken, so a third host is a human's call, not a field edit"
      );
    case "already":
      return "that org already stores this exact host, which should have matched before reaching here";
  }
}

/** The half-sentence a human reads after the org's name. States the comparison, not a verdict. */
export function proposalReasonText(reason: HostProposalReason): string {
  switch (reason.rung) {
    case "name-exact":
      return "the host is that org's own name with the spaces removed";
    case "name-drop-word":
      return `the host is that org's name without the word “${reason.missingWord}”`;
    case "stored-prefix":
      return `it already stores ${reason.storedLabel} — same opening, different host`;
  }
}

/**
 * Q84 inc.70 — WHETHER THE WRITE THIS LINE ASKS FOR WOULD ACTUALLY BE ACCEPTED.
 *
 * inc.68 checked the destination slot (`domain` empty on this org). inc.69 checked the host
 * (no OTHER record already resolves by it) and enforced that one server-side, as a 409 on the
 * People PATCH route. Two halves of "safe", built one increment apart — and the ledger row was
 * still stating only inc.68's half. A row can therefore promise *"one field to fill and nothing
 * is displaced"* about a write the server would refuse. **The page and the server now read the
 * same two rules from the same modules**, so the promise cannot drift from the enforcement.
 *
 * ⚠️ A LIVE DEFECT THIS CLOSED, not a hypothetical: the pick line appended *"Confirm it and put
 * the host on that org"* UNCONDITIONALLY — including when the slot came back `occupied`. inc.68
 * pinned the occupied *wording* to contain no fill/replace/overwrite verb, then the sentence
 * after it said exactly that anyway. C-2010 (The Title Base) has a full `domain` slot on prod
 * today, so this was one proposal away from telling Rob to put a host in a field that has one.
 * The instruction is now emitted ONLY when both halves say yes.
 *
 * On the conflict half being unreachable FROM THIS CALLER, said out loud rather than dressed up:
 * a host only reaches an `unknown-hosts` row when `indexOrgsByHost` — which keys BOTH `website`
 * and `domain` — matched nothing, so `hostClaimConflict` returns `clear` on every row Rob can
 * see today. It is wired anyway for the reason `already` is reported rather than swallowed
 * (inc.68): reaching it means this ladder and `resolveCompanyFromAttendance` disagree, and a
 * disagreement between two host ladders is the thing worth printing, not the thing to smooth over.
 */
export function confirmSafetyText(host: string, org: CrmOrg, orgs: CrmOrg[]): string {
  const claim = hostClaimConflict(host, org, orgs);
  if (claim.kind !== "clear") return hostClaimMessage(claim, host);
  return writeSlotText(hostWriteSlot(host, org));
}

/** Whether a confirm click could be carried out at all — both halves, not either one. */
export function confirmIsWritable(host: string, org: CrmOrg, orgs: CrmOrg[]): boolean {
  return hostClaimConflict(host, org, orgs).kind === "clear" && hostWriteSlot(host, org).kind === "free";
}

/**
 * Q84 inc.76 — the sentence, in ONE place, because the ledger now rewrites it.
 *
 * This line was written when a confirm was something Rob did by hand in the Domain field.
 * inc.69–75 put a control on the same row that does exactly this, so on a row that HAS the
 * control the sentence is stale instructions — and `lib/flags/hostConfirmProse.ts` swaps it for
 * what the control actually offers. It can only find it if both ends spell it identically, and
 * a hand-copied second spelling would fail silently (the swap simply never fires), which is the
 * same failure mode inc.75 refused for `hostConfirmKey`.
 */
export const CONFIRM_INSTRUCTION = "Confirm it and put the host on that org";

/**
 * The line printed under an unknown host. Always ends in a question a human answers, never in
 * an instruction that assumes the proposal is right — and when two orgs tie it says so and
 * picks neither, because a coin flip here puts a call on the wrong company's record.
 *
 * @param orgs every CRM org, so the write can be checked against the whole table and not just
 *   against the proposed org's own record. Defaults to empty: with no table to check, the
 *   host-collision half cannot fire, which leaves the line exactly where inc.68 left it.
 */
export function proposalText(proposal: HostProposal | null, orgs: CrmOrg[] = []): string {
  if (!proposal || !proposal.candidates.length) return "";
  if (proposal.pick) {
    const [only] = proposal.candidates;
    // Q84 inc.68 — the slot is stated on the SAME line as the pick, because "confirm it and put
    // the host on that org" is an instruction, and an instruction that cannot be carried out
    // without displacing a stored host is worse than no instruction at all.
    const state = confirmSafetyText(proposal.host, only.org, orgs);
    const head = `likely ${only.org.name} [${only.org.id}] — ${proposalReasonText(only.reason)}; ${state}. `;
    // Q84 inc.70 — the instruction is earned, not appended. Where the write would be refused the
    // line closes on what is actually true, with no write verb anywhere in it: the proposal is
    // still worth reading (it names the company), it is just not a field edit.
    if (!confirmIsWritable(proposal.host, only.org, orgs)) {
      return (
        head +
        "So this one is not a field to fill — the org above is who it looks like, and what to do " +
        "about the host it already carries is a human's call"
      );
    }
    return head + `${CONFIRM_INSTRUCTION}; a look-alike host is never assumed to be the same company`;
  }
  const listed = proposal.candidates
    .map((c) => `${c.org.name} [${c.org.id}] (${proposalReasonText(c.reason)})`)
    .join(", ");
  return `${proposal.candidates.length} orgs look equally close — ${listed} — so none is proposed; say which one`;
}
