// Q69 inc.28 — the standing version of inc.27's footnote.
//
// inc.27 answers "is that company still in my CRM?" at ADD time, and only then.
// A domain blocked last week that a company claimed since is invisible: nobody
// re-opens the add box for a domain already on the list, so the one moment the
// question gets asked is the one moment it cannot come up. This runs the same
// read-only check over the WHOLE blocklist so the answer is standing, not a
// toast that scrolled away.
//
// WHAT IT IS SCOPED TO, AND WHY THAT IS NOT A SILENT CAP: only the domains the
// reviewer ADDED are swept, never the 490-domain built-in floor. The floor has
// applied at ingest since the code-level blocklist shipped (inc.22), so no org
// in this CRM was ever created from a floor domain by this pipeline — there is
// nothing there to find. Added domains are the opposite case by construction:
// they were blocked *after* mail from them had already been arriving, which is
// exactly the window where an org could have been created. The rendered text
// says which set was checked rather than implying "the blocklist" wholesale.
//
// READ-ONLY, like inc.27: it names records and links to them. It never deletes,
// merges, or renames one (HARD LIMIT — no record is touched without a Rob
// instruction).
//
// Pure (CR-3): no clock, no network, no Supabase client.

import { orgHoldsDomain, type ClaimingOrg } from "./genericDomainClaims";

export type AuditOrgLink = { id: string; name: string; href: string };

export type AuditFinding = {
  domain: string;
  orgs: AuditOrgLink[];
  text: string;
};

export type BlocklistAudit =
  /**
   * The org read SUCCEEDED. `findings` may be empty, and an empty list here is
   * a real "nothing holds these" — the only state allowed to say so.
   */
  | { kind: "checked"; findings: AuditFinding[]; text: string; checkedCount: number }
  /**
   * The read failed or never ran. Never rendered as clean: "no blocked domain
   * has a company on it" is a claim about the database, and inc.27's whole
   * reason for existing is that making it off a failed query is how a stale org
   * row goes unnoticed forever.
   */
  | { kind: "unchecked"; findings: []; text: string; checkedCount: number };

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Normalized the same way as the write planner and 0022's `lower(domain)` index. */
function norm(d: string): string {
  return d.trim().toLowerCase();
}

/**
 * @param blockedDomains domains from the editable blocklist (rows, not the floor)
 * @param orgs           org rows from a SUCCESSFUL read; ones holding no domain are ignored
 */
export function auditBlockedDomains(
  blockedDomains: string[],
  orgs: ClaimingOrg[]
): BlocklistAudit {
  const domains: string[] = [];
  const seen = new Set<string>();
  for (const raw of blockedDomains) {
    const d = norm(raw ?? "");
    if (!d || seen.has(d)) continue;
    seen.add(d);
    domains.push(d);
  }

  const findings: AuditFinding[] = [];
  for (const domain of domains) {
    const held = orgs.filter((o) => orgHoldsDomain(o, domain));
    if (held.length === 0) continue;
    const links = held.map((o) => ({ id: o.id, name: o.name, href: `/companies/${o.id}` }));
    findings.push({
      domain,
      orgs: links,
      text:
        `${links.map((l) => l.name).join(", ")} still ${plural(links.length, "holds", "hold")} ${domain}, ` +
        `which is on your blocklist. The block stops NEW companies being created from ${domain}; ` +
        `it did not change ${plural(links.length, "that record", "those records")}.`,
    });
  }

  return {
    kind: "checked",
    findings,
    checkedCount: domains.length,
    text: findings.length === 0 ? "" : summaryText(findings.length, domains.length),
  };
}

function summaryText(findingCount: number, checkedCount: number): string {
  return (
    `${findingCount} of the ${checkedCount} ${plural(checkedCount, "domain", "domains")} you blocked ` +
    `${plural(findingCount, "is", "are")} still held by a company.`
  );
}

/** The org read did not succeed. Say that — never "nothing holds them". */
export function uncheckedBlocklistAudit(checkedCount: number, reason?: string): BlocklistAudit {
  return {
    kind: "unchecked",
    findings: [],
    checkedCount,
    text:
      `Couldn't check whether any company still holds your blocked domains${reason ? ` (${reason})` : ""}. ` +
      `The blocks themselves are unaffected.`,
  };
}

/** Nothing to sweep: no added domains at all. Honest, and costs no query. */
export function emptyBlocklistAudit(): BlocklistAudit {
  return { kind: "checked", findings: [], checkedCount: 0, text: "" };
}
