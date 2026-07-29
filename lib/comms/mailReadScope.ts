// Q76 — "near 100% confidence that no agent silently reads users' mail."
//
// Rob named the class exactly: "not automatically having an agent run and
// scrape our users' emails for anything useful, like a transcript or
// otherwise." A sentence in a README cannot answer that question — the answer
// has to be a property of the code that goes red when it stops being true
// (CR-3). So this file is the DECLARATION of every automation allowed to touch
// mail, and `mailScopeBreaches` is the check.
//
// The check is deliberately inverted: a file inside an automation root that
// shows mail-reading evidence is a BREACH **unless** a scope claims it. Adding
// a mail-touching automation therefore cannot be done quietly — it fails the
// suite until someone writes down which mailbox it reads, under which
// credential, and where the audit row lands. That refusal-by-default is the
// whole mechanism; an allowlist that defaults to "permitted" answers nothing.
//
// Confidence is reported as WHAT THIS COVERS, never as a percentage — see
// MAIL_SCAN_ROOTS and the coverage note below.

import { stripComments } from "../coreSeam";
import { MAILBOX_LINKS, type MailboxLink } from "./mailboxLink";

/**
 * One automation permitted to read mail, with the four things that make the
 * permission auditable rather than assumed.
 *
 * `credentialEnv` is the least-privilege half: the single secret whose absence
 * makes this source inert (the n8n pipe 503s with it unset), so revoking a
 * source's reach is one env var, not a code change.
 *
 * `auditActivitySource` is the trail half: the value stamped on every row this
 * source writes, so "what has it read" is answerable by querying, not by
 * trusting. A scope that writes nothing traceable is a breach.
 */
export type MailReadScope = {
  sourceId: string;
  /** linkId of the connected mailbox from MAILBOX_LINKS. */
  mailbox: string;
  /** Env var that gates the source; unset ⇒ the source cannot run at all. */
  credentialEnv: string;
  /** `activities.source` value stamped on every row written from this read. */
  auditActivitySource: string;
  /** Repo-relative module paths permitted to touch mail for this source. */
  modules: string[];
  /** The fields this source is allowed to read off a message. */
  reads: string[];
  purpose: string;
};

// The roots scanned.
//
// `app/api` is the unattended surface — the population Rob's question names
// ("an agent run[s] and scrape[s]"). `scripts/` was deliberately excluded in
// inc.1 as "a human running a local script is a different risk"; inc.2 rejects
// that reasoning. A script is where a mailbox harvester would ACTUALLY be
// written first — no route to deploy, no secret header to satisfy, and one cron
// entry away from being unattended anyway. Excluding it left the cheapest place
// to do the thing Rob is worried about as the one place unwatched.
//
// Still NOT claimed: `lib/`. Those modules operate on a payload a declared door
// already delivered (`emailGraph`, `personFromEmail`, `n8nEmail`) — they hold no
// credential and open no connection, so inverting the rule there would flag ~15
// non-readers, and a guard that cries wolf gets skipped inside a week (Q74
// precedent). The cost of that choice, stated rather than implied: a hand-rolled
// poller written as a `lib/` module would not be seen by this scan. What closes
// that is a package-import marker tier over the whole tree — named here as the
// known limit, not silently absent.
export const MAIL_SCAN_ROOTS = ["app/api", "scripts"] as const;

// Extensions the scan reads. Exported so the walker and the coverage claim
// cannot drift: `scripts/` is almost entirely `.mjs`, so a `.ts`-only walker
// would have "covered" it while reading zero files — a green suite proving
// nothing, which is worse than the honest exclusion it replaced.
export const MAIL_SCAN_EXTENSIONS = [".ts", ".tsx", ".mjs", ".cjs", ".js"] as const;

// Exactly one automation reads mail today. The n8n Gmail workflow watches
// rob@aivoicetech.io and POSTs each message here; nothing in this repo polls,
// crawls, or holds a mailbox credential of its own.
export const MAIL_READ_SCOPES: readonly MailReadScope[] = [
  {
    sourceId: "n8n-gmail-capture",
    mailbox: "mbx-aivoicetech-rob",
    credentialEnv: "N8N_EMAIL_WEBHOOK_SECRET",
    auditActivitySource: "n8n",
    modules: ["app/api/webhooks/n8n-email/route.ts"],
    reads: ["from", "to", "cc", "subject", "date", "messageId", "snippet"],
    purpose:
      "File a message onto the matched contact's timeline as an activity row; " +
      "propose orgs/people from the parties. Header-gated to aivoicetech.io.",
  },
];

export type MailScopeBreach = {
  kind:
    | "undeclared-reader"
    | "phantom-module"
    | "duplicate-claim"
    | "unregistered-mailbox"
    | "no-credential"
    | "no-audit-trail";
  subject: string;
  detail: string;
};

export type MailFile = { path: string; source: string };

// Evidence that a module reads a MAILBOX, not merely that it knows the word
// "email" — the repo is a CRM, so `email` as a contact field is everywhere and
// matching it would make the guard noise. Each marker names a mail SOURCE:
// the provider, the protocol, the inbound payload type, or the connected-
// mailbox registry itself.
//
// Matched against comment-stripped source on purpose: a comment explaining
// that some OTHER workflow is the Gmail one must not implicate the file it
// sits in (this is real — the n8n error webhook has exactly that comment).
export const MAIL_SOURCE_MARKERS: readonly { name: string; re: RegExp }[] = [
  { name: "gmail", re: /\bgmail\b/i },
  { name: "imap", re: /\bimap\b/i },
  { name: "email-payload", re: /\bEmailPayload\b/ },
  { name: "mailbox-registry", re: /\bMAILBOX_LINKS\b|\bresolveMailboxLink\b/ },
];

/** Which mail-source markers a module actually shows. Empty ⇒ not a reader. */
export function mailReadMarkers(source: string): string[] {
  const bare = stripComments(source);
  return MAIL_SOURCE_MARKERS.filter((m) => m.re.test(bare)).map((m) => m.name);
}

/**
 * The guard. Returns every way the declaration and the tree disagree.
 *
 * Empty result = every mail-touching module under MAIL_SCAN_ROOTS is claimed by
 * a scope that names a registered mailbox, a revocable credential, and an audit
 * trail. That sentence is the honest form of Rob's "near 100%": it is a claim
 * about the scanned roots, and it is checkable.
 */
export function mailScopeBreaches(
  files: MailFile[],
  scopes: readonly MailReadScope[] = MAIL_READ_SCOPES,
  links: readonly MailboxLink[] = MAILBOX_LINKS
): MailScopeBreach[] {
  const breaches: MailScopeBreach[] = [];
  const onDisk = new Set(files.map((f) => f.path));
  const claimedBy = new Map<string, string>();

  for (const scope of scopes) {
    if (!links.some((l) => l.linkId === scope.mailbox)) {
      breaches.push({
        kind: "unregistered-mailbox",
        subject: scope.sourceId,
        detail: `reads mailbox "${scope.mailbox}", which is not a connected mailbox`,
      });
    }
    if (!scope.credentialEnv.trim()) {
      breaches.push({
        kind: "no-credential",
        subject: scope.sourceId,
        detail: "no credentialEnv — a source nobody can revoke is not least-privilege",
      });
    }
    if (!scope.auditActivitySource.trim()) {
      breaches.push({
        kind: "no-audit-trail",
        subject: scope.sourceId,
        detail: "no auditActivitySource — reads would leave no trail to query",
      });
    }
    for (const mod of scope.modules) {
      // A renamed module must not silently drop out of the declaration: the
      // claim would keep reading as covered while nothing enforces it.
      if (!onDisk.has(mod)) {
        breaches.push({
          kind: "phantom-module",
          subject: mod,
          detail: `claimed by ${scope.sourceId} but not present under the scanned roots`,
        });
        continue;
      }
      const prior = claimedBy.get(mod);
      if (prior) {
        breaches.push({
          kind: "duplicate-claim",
          subject: mod,
          detail: `claimed by both ${prior} and ${scope.sourceId}`,
        });
        continue;
      }
      claimedBy.set(mod, scope.sourceId);
    }
  }

  for (const file of files) {
    const markers = mailReadMarkers(file.source);
    if (markers.length === 0) continue;
    if (claimedBy.has(file.path)) continue;
    breaches.push({
      kind: "undeclared-reader",
      subject: file.path,
      detail: `reads mail (${markers.join(", ")}) but no scope in MAIL_READ_SCOPES claims it`,
    });
  }

  return breaches;
}
