// Phase 2 ROI — regional labor-rate reference table.
//
// Rob's instruction (dump 2026-07-25, docs/plans/sources/ROB-PHASE2-ROI-DUMP-2026-07-25.md):
// "figure out what type of employee would likely normally handle that task, what their
// hourly rate is in the region the business is in (or est as close as possible) in order
// to come up with a projected value per hour of the labor."
//
// Every rate below is a REAL published figure, not a guess: BLS Occupational Employment
// and Wage Statistics (OEWS), **May 2025** release, median hourly wage, pulled from the
// BLS public API on 2026-07-25 (series OEU{area}{industry}{occ}08). House rule 10 — every
// stat carries a source URL.
//
// Pure per CR-3: data + lookup only. No clock, no network, no Next imports.

/** BLS OEWS survey vintage these rates come from. Shown in the UI so a stale table is visible. */
export const OEWS_VINTAGE = "May 2025" as const;
export const OEWS_PULLED_ON = "2026-07-25" as const;

/** Regions we have first-party BLS figures for. `custom` = the operator types a rate. */
export type RateRegion = "us" | "fl" | "naples" | "custom";

export const REGION_LABELS: Record<Exclude<RateRegion, "custom">, string> = {
  us: "United States (national)",
  fl: "Florida (statewide)",
  naples: "Naples–Immokalee–Marco Island, FL metro",
};

export interface LaborRole {
  /** BLS SOC code, no hyphen — also the API series occupation segment. */
  soc: string;
  /** SOC title as BLS publishes it. */
  title: string;
  /** Plain-language name a contractor would recognise. */
  commonName: string;
  /** Median hourly wage by region. `null` = BLS does not publish it for that area. */
  medianHourly: Record<Exclude<RateRegion, "custom">, number | null>;
  /** Per-occupation OEWS page. */
  source: string;
}

/**
 * The roles an MLE automation actually displaces. Kept deliberately short — one row per
 * job a small business would otherwise pay a human to do, not the whole SOC catalogue.
 */
export const LABOR_ROLES: LaborRole[] = [
  {
    soc: "434171",
    title: "Receptionists and Information Clerks",
    commonName: "Front-desk / phone answering",
    medianHourly: { us: 18.27, fl: 17.7, naples: 18.75 },
    source: "https://www.bls.gov/oes/current/oes434171.htm",
  },
  {
    soc: "434051",
    title: "Customer Service Representatives",
    commonName: "Customer service / inbound chat",
    medianHourly: { us: 21.53, fl: 19.44, naples: 21.0 },
    source: "https://www.bls.gov/oes/current/oes434051.htm",
  },
  {
    soc: "436014",
    title: "Secretaries and Administrative Assistants",
    commonName: "Admin / paperwork / follow-up",
    medianHourly: { us: 22.86, fl: 22.07, naples: 22.84 },
    source: "https://www.bls.gov/oes/current/oes436014.htm",
  },
  {
    soc: "433031",
    title: "Bookkeeping, Accounting, and Auditing Clerks",
    commonName: "Invoicing / bookkeeping",
    medianHourly: { us: 24.36, fl: 23.72, naples: 24.52 },
    source: "https://www.bls.gov/oes/current/oes433031.htm",
  },
  {
    soc: "435032",
    title: "Dispatchers, Except Police, Fire, and Ambulance",
    commonName: "Scheduling / dispatch",
    medianHourly: { us: 24.2, fl: 22.06, naples: 23.29 },
    source: "https://www.bls.gov/oes/current/oes435032.htm",
  },
  {
    soc: "273031",
    title: "Public Relations Specialists",
    commonName: "Social media / content posting",
    medianHourly: { us: 35.94, fl: 30.61, naples: 32.59 },
    source: "https://www.bls.gov/oes/current/oes273031.htm",
  },
  {
    soc: "131161",
    title: "Market Research Analysts and Marketing Specialists",
    commonName: "Marketing / SEO / reporting",
    medianHourly: { us: 37.87, fl: 36.27, naples: 36.19 },
    source: "https://www.bls.gov/oes/current/oes131161.htm",
  },
  {
    soc: "414012",
    title: "Sales Representatives, Wholesale and Manufacturing",
    commonName: "Outbound sales / quoting",
    medianHourly: { us: 34.65, fl: 30.04, naples: 30.93 },
    source: "https://www.bls.gov/oes/current/oes414012.htm",
  },
  {
    soc: "419041",
    title: "Telemarketers",
    commonName: "Outbound calling / appointment setting",
    // BLS publishes no Naples-metro figure for this occupation — reported as missing,
    // never back-filled from the state number (that would look like data we don't have).
    medianHourly: { us: 17.04, fl: 17.1, naples: null },
    source: "https://www.bls.gov/oes/current/oes419041.htm",
  },
];

export function findRole(soc: string): LaborRole | undefined {
  return LABOR_ROLES.find((r) => r.soc === soc);
}

/**
 * Median hourly wage for a role in a region, with an explicit fallback chain
 * (metro → state → national) so the UI can SAY which level it used rather than
 * silently presenting a national number as if it were local.
 */
export function rateFor(
  soc: string,
  region: Exclude<RateRegion, "custom">,
): { rate: number; usedRegion: Exclude<RateRegion, "custom">; fellBack: boolean } | null {
  const role = findRole(soc);
  if (!role) return null;
  const direct = role.medianHourly[region];
  if (direct != null) return { rate: direct, usedRegion: region, fellBack: false };
  const chain: Exclude<RateRegion, "custom">[] = region === "naples" ? ["fl", "us"] : ["us"];
  for (const next of chain) {
    const v = role.medianHourly[next];
    if (v != null) return { rate: v, usedRegion: next, fellBack: true };
  }
  return null;
}
