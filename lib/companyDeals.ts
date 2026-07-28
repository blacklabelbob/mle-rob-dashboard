// Company deals section — Master View 2.0 §8 increment 5b.
// Pure per CR-3: takes already-read rows, returns exactly what the section
// renders. No clock, no network, no Next imports, no money is ever derived.
//
// Honesty rules this file enforces:
//  - Money is REPORTED, never computed into existence. `value` is optional on a
//    deal; a deal without one is counted in `valueMissing`, never as $0, and it
//    is excluded from the totals rather than silently zeroing them (the MC.9
//    invoice-ledger precedent).
//  - A deal reached through a PERSON at this company is shown, but it is never
//    passed off as the company's own paper: it carries `anchoredVia` with that
//    person's name so the record says how it got here.
//  - PHASE IS STORED (Q40 inc.10, 0026) BUT IS NEVER INVENTED. A deal without one
//    means nobody has stated which phase the agreement is for — which is NOT the
//    same as Phase 1 (the whole point of the column). This module still does NOT
//    emit a per-deal warning about it: that would be 19 identical lines about the
//    same silence. It reports it ONCE, as `phaseStoreAvailable`, which is true when
//    at least one deal here carries a recorded phase. Deliberately derived from the
//    rows rather than from "the migration exists": the section's job is to tell Rob
//    whether the phases on screen are real, and a column nobody has written is
//    indistinguishable, on screen, from no column at all.
//  - What IS checkable today is the stage↔key-date contract, and it is checked:
//    a deal parked on `paid` with no paid date, or `invoiced` with no invoiced
//    date, is a money claim with no paperwork behind it and it gets a flag.

import type { Deal, DealStage, Person } from "@/lib/types";

/** Stages that assert a document/event exists, mapped to the date that proves it. */
const STAGE_EVIDENCE: Partial<Record<DealStage, { field: keyof Deal["keyDates"]; label: string }>> = {
  signed: { field: "signed", label: "signed date" },
  invoiced: { field: "invoiced", label: "invoiced date" },
  paid: { field: "paid", label: "paid date" },
};

/** Ladder order, worst-first display is NOT used here — deals sort by progress. */
const STAGE_ORDER: DealStage[] = [
  "paid",
  "delivering",
  "invoiced",
  "signed",
  "negotiating",
  "quote_sent",
  "meeting_held",
  "meeting_booked",
  "contacted",
  "new_lead",
  "stalled",
  "lost",
];

export interface CompanyDealFlag {
  /** Stable slug so the ledger can dedupe if these ever get POSTed. */
  code: "stage_without_evidence" | "paid_date_without_value";
  text: string;
}

export interface CompanyDealRow {
  id: string;
  name: string;
  stage: DealStage;
  /** Undefined means the deal carries no value — never coerced to 0. */
  value?: number;
  keyDates: Deal["keyDates"];
  referralSourced: boolean;
  /** Set only when the deal reached this company through a person, not an orgId. */
  anchoredVia?: string;
  /** Q40 inc.10 — the phase this agreement is FOR, when a human recorded one. */
  phase?: 1 | 2 | 3;
  flags: CompanyDealFlag[];
}

export interface CompanyDealsSummary {
  rows: CompanyDealRow[];
  /** Sum of `value` for deals whose stage is `paid`. Excludes valueless deals. */
  paidTotal: number;
  /** Sum of `value` for deals past quote and not paid/lost. Excludes valueless deals. */
  openTotal: number;
  /** How many rows carried no `value` at all — printed, never absorbed. */
  valueMissing: number;
  /** True once at least one deal here carries a recorded phase (Q40 inc.10). */
  phaseStoreAvailable: boolean;
}

const CLOSED_OUT: DealStage[] = ["paid", "lost"];
const COUNTS_AS_OPEN: DealStage[] = [
  "quote_sent",
  "negotiating",
  "signed",
  "invoiced",
  "delivering",
];

function flagsFor(deal: Deal): CompanyDealFlag[] {
  const flags: CompanyDealFlag[] = [];
  const evidence = STAGE_EVIDENCE[deal.stage];
  if (evidence && !deal.keyDates?.[evidence.field]) {
    flags.push({
      code: "stage_without_evidence",
      text: `Stage is “${deal.stage}” but there is no ${evidence.label} on file.`,
    });
  }
  if (deal.keyDates?.paid && deal.value === undefined) {
    flags.push({
      code: "paid_date_without_value",
      text: "Marked paid with no deal value recorded — the amount is unknown, not zero.",
    });
  }
  return flags;
}

export interface CompanyDealsInput {
  companyId: string;
  deals: Deal[];
  /** Full people roster — used only to resolve person-anchored deals + names. */
  people: Person[];
}

export function buildCompanyDeals({
  companyId,
  deals,
  people,
}: CompanyDealsInput): CompanyDealsSummary {
  const peopleHereById = new Map(
    people.filter((p) => p.orgId === companyId).map((p) => [p.id, p.name]),
  );

  const rows = deals
    .filter((d) => d.orgId === companyId || (d.personId ? peopleHereById.has(d.personId) : false))
    .map<CompanyDealRow>((d) => ({
      id: d.id,
      name: d.name,
      stage: d.stage,
      value: d.value,
      keyDates: d.keyDates ?? {},
      referralSourced: d.referralSourced,
      phase: d.phase,
      anchoredVia:
        d.orgId === companyId
          ? undefined
          : d.personId
            ? peopleHereById.get(d.personId)
            : undefined,
      flags: flagsFor(d),
    }))
    .sort((a, b) => {
      const byStage = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
      if (byStage !== 0) return byStage;
      return (b.value ?? 0) - (a.value ?? 0);
    });

  let paidTotal = 0;
  let openTotal = 0;
  let valueMissing = 0;
  for (const r of rows) {
    if (r.value === undefined) {
      valueMissing += 1;
      continue;
    }
    if (r.stage === "paid") paidTotal += r.value;
    else if (COUNTS_AS_OPEN.includes(r.stage)) openTotal += r.value;
  }

  return {
    rows,
    paidTotal,
    openTotal,
    valueMissing,
    phaseStoreAvailable: rows.some((r) => r.phase !== undefined),
  };
}

export const __testing = { STAGE_ORDER, CLOSED_OUT, COUNTS_AS_OPEN };
