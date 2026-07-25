// People-ledger split — Master View 2.0 §8 increment 4b.
// Pure per CR-3: takes already-read rows, returns the split. No I/O, no clock.
//
// Rob's rule (Q39(a)): STOP interleaving entities and people in one list. The
// two ledgers are separate views over the SAME node set, so the split must be
// exhaustive — every row lands on exactly one side, and the counts reconcile
// back to the old combined total. A row that silently belongs to neither is a
// disappeared record, which is worse than a mixed list.

import { isCompany } from "@/lib/companies";
import type { Person } from "@/lib/types";

export interface LedgerSplit {
  humans: Person[];
  companies: Person[];
}

/** Partition the node list into the /people ledger and the /companies ledger. */
export function splitLedger(people: Person[]): LedgerSplit {
  const humans: Person[] = [];
  const companies: Person[] = [];
  for (const p of people) {
    (isCompany(p) ? companies : humans).push(p);
  }
  return { humans, companies };
}

export interface LedgerReconciliation {
  /** Rows in the combined (pre-split) ledger. */
  total: number;
  humans: number;
  companies: number;
  /** humans + companies === total. False means a row was dropped or duplicated. */
  reconciles: boolean;
}

/**
 * The DoD check as code: the two ledgers must add back up to the old one.
 * Callers render `reconciles: false` as a visible warning — never hide it.
 */
export function reconcileLedger(people: Person[]): LedgerReconciliation {
  const { humans, companies } = splitLedger(people);
  return {
    total: people.length,
    humans: humans.length,
    companies: companies.length,
    reconciles: humans.length + companies.length === people.length,
  };
}
