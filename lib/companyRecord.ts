// Company record shell — Master View 2.0 §8 increment 5a.
// Pure per CR-3: takes already-read rows, returns what the page renders.
// No clock, no network, no Next imports.
//
// Honesty rules this file enforces:
//  - "Owner first" (§3.2) is derived ONLY from a person's own stored role text.
//    Nothing is invented: the row prints the person's real `role` string, and a
//    person with no role is never promoted or labelled. If no role text names an
//    owner, nobody is shown as one — the rail is name-ordered and says so.
//  - A company with no linked people renders an explicit empty state; it never
//    borrows rows from another company or falls back to the whole roster.

import type { NetworkData, Person, Vertical } from "@/lib/types";
import { isCompany } from "@/lib/companies";

/** Role words that name the top of a company on their face. */
const OWNER_ROLE_WORDS = [
  "owner",
  "founder",
  "co-founder",
  "cofounder",
  "president",
  "ceo",
  "principal",
  "managing partner",
] as const;

export function hasOwnerRoleSignal(role: string | undefined): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  return OWNER_ROLE_WORDS.some((w) => r.includes(w));
}

export interface CompanyPersonRow {
  id: string;
  name: string;
  /** The person's stored role text, verbatim. Never synthesised. */
  role?: string;
  relationship?: string;
  status: Person["status"];
  /** True only when their OWN role text names them as owner-equivalent. */
  ownerSignal: boolean;
}

export interface CompanyRecord {
  company: Person;
  verticalName?: string;
  verticalColor?: string;
  rep?: string;
  /** People whose `orgId` points at this company. Owner-signal first, then name. */
  peopleHere: CompanyPersonRow[];
  /** True when at least one row carried an owner-signal role. */
  ownerIdentified: boolean;
}

export interface CompanyRecordInput {
  companyId: string;
  people: Person[];
  verticals: Vertical[];
}

/**
 * Returns null when the id is unknown OR names a person rather than a company —
 * the caller 404s. A person id must never render the company shell.
 */
export function buildCompanyRecord({
  companyId,
  people,
  verticals,
}: CompanyRecordInput): CompanyRecord | null {
  const company = people.find((p) => p.id === companyId);
  if (!company || !isCompany(company)) return null;

  const vertical = verticals.find((v) => v.id === company.verticalId);

  const peopleHere = people
    .filter((p) => !isCompany(p) && p.orgId === company.id)
    .map<CompanyPersonRow>((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      relationship: p.relationship,
      status: p.status,
      ownerSignal: hasOwnerRoleSignal(p.role),
    }))
    .sort(
      (a, b) =>
        Number(b.ownerSignal) - Number(a.ownerSignal) ||
        a.name.localeCompare(b.name),
    );

  return {
    company,
    verticalName: vertical?.name,
    verticalColor: vertical?.color,
    rep: company.assignedRep,
    peopleHere,
    ownerIdentified: peopleHere.some((p) => p.ownerSignal),
  };
}

/** Convenience for the page. */
export function companyRecordFromNetwork(
  data: NetworkData,
  companyId: string,
): CompanyRecord | null {
  return buildCompanyRecord({
    companyId,
    people: data.people,
    verticals: data.verticals,
  });
}
