// Q69 (Email → company graph), increment 3: rung 6 gets somewhere to land.
//
// inc.2 wired the ladder in, but a `propose-org` plan died inside the request:
// Rob sends a first email to a roofing company we have never dealt with, and
// nothing anywhere records that a company is waiting to be created. This module
// turns that plan into a NEEDS-ACTION item on the existing "Things to Address"
// ledger (the `flags` table, 0004) — reuse over a new proposals table, because
// a queue nobody looks at is worse than no queue.
//
// The rule from inc.1 still holds and is what this file must not break:
// RUNG 6 PROPOSES, NEVER CREATES. Nothing here writes to `orgs` or `people`.
// A proposal is reviewable; an auto-created org is cleanup.
//
// Pure except for the injected sink (CR-3): planning takes addresses, a
// direction and the index, and returns what SHOULD be queued.

import { planEmailGraph, type EmailDirection, type GraphIndex } from "./emailGraph";

export interface OrgProposal {
  domain: string;
  /** The address we sent to — the evidence line for whoever reviews it. */
  address: string;
  /** A conservative guess, shown as a suggestion only. Never an entity name. */
  suggestedName: string;
}

export interface OrgProposalFlag {
  entityId: null; // no CRM row exists yet — that is the whole point of the queue
  entityName: string;
  title: string;
  detail: string;
  severity: "low";
}

/**
 * Every distinct new domain this message was SENT to, in listing order.
 *
 * Called only when the ladder anchored nothing: a message that already landed
 * on a record is a timeline event, not a proposal. One message can legitimately
 * open two new companies (a cc'd introduction), so this returns a list — but
 * deduped by domain, or two addresses at the same company queue it twice.
 */
export function planOrgProposals(
  counterparts: string[],
  direction: EmailDirection,
  index: GraphIndex
): OrgProposal[] {
  const seen = new Set<string>();
  const out: OrgProposal[] = [];
  for (const address of counterparts) {
    const plan = planEmailGraph(address, direction, index);
    if (plan.kind !== "propose-org") continue;
    if (seen.has(plan.domain)) continue;
    seen.add(plan.domain);
    out.push({
      domain: plan.domain,
      address: plan.address,
      suggestedName: suggestedNameFor(plan.domain),
    });
  }
  return out;
}

/**
 * `the-title-base.com` → `The Title Base`. First label only, hyphens and
 * underscores read as spaces. Deliberately a SUGGESTION carried in the flag
 * detail — a guessed name written into an entity field is how the CRM grows a
 * company called "Mail" from `mail.roofco.com`.
 */
export function suggestedNameFor(domain: string): string {
  const label = domain.split(".")[0] ?? "";
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * The dedupe key. Stable per domain and per message-independent, so the same
 * new company emailed ten times this week queues ONE item. Any change to this
 * string re-opens every proposal already resolved — it is a schema, not copy.
 */
export function proposalTitle(domain: string): string {
  return `New company domain: ${domain}`;
}

export function proposalToFlag(proposal: OrgProposal): OrgProposalFlag {
  const suggestion = proposal.suggestedName
    ? ` Suggested name: "${proposal.suggestedName}" (a guess from the domain — confirm before creating).`
    : "";
  return {
    entityId: null,
    entityName: proposal.domain,
    title: proposalTitle(proposal.domain),
    detail:
      `We sent mail to ${proposal.address} and ${proposal.domain} matches no company in the CRM. ` +
      `Nothing was created — review and create the org if this is a real counterparty.${suggestion}`,
    severity: "low",
  };
}

/** The narrow slice of the flags table this module is allowed to touch. */
export interface ProposalSink {
  /** Which of these titles already exist (any status — resolved means "no"). */
  existingTitles(titles: string[]): Promise<string[]>;
  insert(flags: OrgProposalFlag[]): Promise<void>;
}

export interface RecordResult {
  created: string[]; // domains queued this call
  duplicate: string[]; // domains already on the ledger
}

/**
 * Queue the proposals, skipping any already on the ledger.
 *
 * A resolved flag still counts as existing: Rob resolving "New company domain:
 * roofco.com" is a decision, and re-queuing it on the next email would make the
 * ledger argue with him.
 */
export async function recordOrgProposals(
  proposals: OrgProposal[],
  sink: ProposalSink
): Promise<RecordResult> {
  if (proposals.length === 0) return { created: [], duplicate: [] };
  const titles = proposals.map((p) => proposalTitle(p.domain));
  const existing = new Set(await sink.existingTitles(titles));
  const fresh = proposals.filter((p) => !existing.has(proposalTitle(p.domain)));
  if (fresh.length > 0) await sink.insert(fresh.map(proposalToFlag));
  return {
    created: fresh.map((p) => p.domain),
    duplicate: proposals.filter((p) => existing.has(proposalTitle(p.domain))).map((p) => p.domain),
  };
}
