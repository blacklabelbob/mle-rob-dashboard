// Company-ledger rows — Master View 2.0 §8 increment 4a.
// Pure per CR-3: takes already-read data, does the arithmetic, returns rows.
// The page does the I/O; this file is the only place company money is derived.
//
// Money discipline (same rule the invoice ledger uses): a deal whose value is
// missing or unreadable is EXCLUDED from the totals and COUNTED, never zeroed —
// a fabricated $0 on a money column is worse than an honest "1 deal, no value".

import type { Activity, Deal, NetworkData, Person, Vertical } from "@/lib/types";

// Stages that mean money is committed but not yet collected.
export const OWED_STAGES = ["signed", "invoiced", "delivering"] as const;

export interface CompanyRow {
  id: string;
  name: string;
  verticalName: string;
  verticalColor: string;
  status: Person["status"];
  nodeType?: Person["nodeType"];
  phaseOne: Person["phaseOne"];
  rep?: string;
  dealCount: number;
  paidTotal: number;
  owedTotal: number;
  /** Deals counted in paid/owed state but carrying no readable value. */
  valueUnknownCount: number;
  /** ISO timestamp of the most recent activity anchored to this company. */
  lastTouch?: string;
  peopleHere: number;
}

export function isCompany(p: Person): boolean {
  return p.entityKind === "company";
}

function readableValue(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isPaid(d: Deal): boolean {
  return d.stage === "paid" || Boolean(d.keyDates?.paid);
}

function isOwed(d: Deal): boolean {
  if (isPaid(d) || d.stage === "lost") return false;
  return (OWED_STAGES as readonly string[]).includes(d.stage);
}

export interface CompanyRowInput {
  people: Person[];
  verticals: Vertical[];
  deals: Deal[];
  activities?: Activity[];
}

/**
 * One row per company node. Sorted by money at stake (owed, then paid), then
 * name — the ledger opens on what needs attention, not on the alphabet.
 */
export function buildCompanyRows({
  people,
  verticals,
  deals,
  activities = [],
}: CompanyRowInput): CompanyRow[] {
  const verticalById = new Map(verticals.map((v) => [v.id, v]));

  const headcount = new Map<string, number>();
  for (const p of people) {
    if (isCompany(p) || !p.orgId) continue;
    headcount.set(p.orgId, (headcount.get(p.orgId) ?? 0) + 1);
  }

  const rows = people.filter(isCompany).map((c) => {
    const own = deals.filter((d) => d.orgId === c.id);
    let paidTotal = 0;
    let owedTotal = 0;
    let valueUnknownCount = 0;

    for (const d of own) {
      const paid = isPaid(d);
      const owed = isOwed(d);
      if (!paid && !owed) continue;
      const value = readableValue(d.value);
      if (value === null) {
        valueUnknownCount += 1;
        continue;
      }
      if (paid) paidTotal += value;
      else owedTotal += value;
    }

    const touches = activities
      .filter((a) => a.orgId === c.id || own.some((d) => d.id === a.dealId))
      .map((a) => a.occurredAt)
      .filter(Boolean)
      .sort();

    const vertical = verticalById.get(c.verticalId);

    return {
      id: c.id,
      name: c.name,
      verticalName: vertical?.name ?? "—",
      verticalColor: vertical?.color ?? "#64748b",
      status: c.status,
      nodeType: c.nodeType,
      phaseOne: c.phaseOne,
      rep: c.assignedRep,
      dealCount: own.length,
      paidTotal,
      owedTotal,
      valueUnknownCount,
      lastTouch: touches.length ? touches[touches.length - 1] : undefined,
      peopleHere: headcount.get(c.id) ?? 0,
    } satisfies CompanyRow;
  });

  return rows.sort(
    (a, b) =>
      b.owedTotal - a.owedTotal ||
      b.paidTotal - a.paidTotal ||
      a.name.localeCompare(b.name),
  );
}

export interface CompanyLedgerTotals {
  companies: number;
  paidTotal: number;
  owedTotal: number;
  valueUnknownCount: number;
}

export function companyTotals(rows: CompanyRow[]): CompanyLedgerTotals {
  return rows.reduce<CompanyLedgerTotals>(
    (acc, r) => ({
      companies: acc.companies + 1,
      paidTotal: acc.paidTotal + r.paidTotal,
      owedTotal: acc.owedTotal + r.owedTotal,
      valueUnknownCount: acc.valueUnknownCount + r.valueUnknownCount,
    }),
    { companies: 0, paidTotal: 0, owedTotal: 0, valueUnknownCount: 0 },
  );
}

/** Convenience for the page: network + deals + activities → rows. */
export function companyRowsFromNetwork(
  data: NetworkData,
  deals: Deal[],
  activities?: Activity[],
): CompanyRow[] {
  return buildCompanyRows({
    people: data.people,
    verticals: data.verticals,
    deals,
    activities,
  });
}
