// Q69 inc.7 — the `link_id` invariant (BUILD-QUEUE Q69, 07-comms.md Phase A:
// "adopt the link_id invariant now, with one mailbox").
//
// Every captured email is keyed by WHICH connected mailbox it came from. With
// one mailbox that reads like bookkeeping; it is not. Rob's standing identity
// rule (~/.claude/rules/email-identity.md) — aivoicetech.io and
// boostuppayments.com are never linked — is today enforced by a code check on
// the headers. Keying the row by its mailbox turns that rule into a property of
// the DATA: a row that cannot name a connected mailbox cannot exist, so mail
// from an unregistered inbox has nowhere to land even if a future capture path
// forgets to run the header gate.
//
// This module owns the registry and both refusals. It imports nothing from
// lib/n8nEmail (which imports IT) so the constants have one home and no cycle.

// The 2026-07-08 crossover domain. Mail addressed to rob@boostuppayments.com
// can physically sit in the aivoicetech inbox because of the Dec-2024 Gmail
// forwarding rule, so this domain is judged on headers AND barred from ever
// being a connected mailbox.
export const CROSSOVER_DOMAIN = "boostuppayments.com";

export interface MailboxLink {
  linkId: string; // stable key stamped on every activity from this mailbox
  address: string; // the connected account, lowercase
}

// The connected mailboxes. Exactly one today — the n8n Gmail pipe on
// rob@aivoicetech.io. Adding a second one here is the whole migration: the
// missing-mailbox default below stops applying the moment this list grows,
// which is what keeps a second inbox's mail from silently filing as Rob's.
export const MAILBOX_LINKS: readonly MailboxLink[] = [
  { linkId: "mbx-aivoicetech-rob", address: "rob@aivoicetech.io" },
];

// Import-time invariants. A registry that drifts (a duplicate id, an uppercase
// address that then matches nothing, a crossover mailbox) must fail loudly at
// startup rather than quietly mis-key or drop mail at 3am.
(() => {
  const ids = new Set<string>();
  const addresses = new Set<string>();
  for (const link of MAILBOX_LINKS) {
    if (!link.linkId || !link.address.includes("@")) {
      throw new Error(`mailboxLink: malformed link ${JSON.stringify(link)}`);
    }
    if (link.address !== link.address.toLowerCase()) {
      throw new Error(`mailboxLink: address must be lowercase (${link.address})`);
    }
    if (link.address.endsWith(`@${CROSSOVER_DOMAIN}`)) {
      throw new Error(
        `mailboxLink: ${CROSSOVER_DOMAIN} can never be a connected mailbox (${link.address})`
      );
    }
    if (ids.has(link.linkId)) throw new Error(`mailboxLink: duplicate linkId ${link.linkId}`);
    if (addresses.has(link.address)) {
      throw new Error(`mailboxLink: duplicate address ${link.address}`);
    }
    ids.add(link.linkId);
    addresses.add(link.address);
  }
  if (MAILBOX_LINKS.length === 0) throw new Error("mailboxLink: no connected mailbox");
})();

// The link every legacy caller means when it says nothing. Only meaningful
// while exactly one mailbox is connected — see resolveMailboxLink.
export const DEFAULT_MAILBOX_LINK: MailboxLink = MAILBOX_LINKS[0];

export type MailboxResolution =
  | { ok: true; link: MailboxLink }
  | { ok: false; reason: string };

// n8n stamps either the mailbox address or the link id; both resolve, nothing
// else does. An unknown value is REFUSED, never defaulted — falling back to the
// sole link would file a second inbox's mail onto Rob's identity, which is the
// exact mix-up this invariant exists to make impossible.
export function resolveMailboxLink(
  declared?: string | null,
  links: readonly MailboxLink[] = MAILBOX_LINKS
): MailboxResolution {
  const raw = (declared ?? "").trim().toLowerCase();
  if (!raw) {
    // Silence is only readable when there is one possible answer. The day a
    // second mailbox is connected this becomes a hard refusal on its own.
    if (links.length === 1) return { ok: true, link: links[0] };
    return {
      ok: false,
      reason: `mailbox is required — ${links.length} mailboxes connected, cannot infer`,
    };
  }
  const hit = links.find((l) => l.linkId.toLowerCase() === raw || l.address === raw);
  if (!hit) {
    return { ok: false, reason: `unknown mailbox (${raw}) — not a connected mailbox` };
  }
  return { ok: true, link: hit };
}
