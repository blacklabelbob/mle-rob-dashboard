// Dedup run shaping (PRD Task 3.5 — queue persistence half). Pure per CR-3:
// takes already-fetched records, returns exactly the rows the `dedup_review`
// table upserts. The route owns the clock and the network.
//
// Records are matched WITHIN a kind only (people↔people, orgs↔orgs): a person
// sharing their company's phone number is normal CRM structure, not a
// duplicate, so cross-kind pairs are structurally impossible here.

import { findDuplicatePairs, type DedupPair, type DedupRecord } from "@/lib/dedup/match";

export type DedupKind = "person" | "org";

export interface DedupSourceRecord extends DedupRecord {
  node_type?: string | null;
}

// One row per detected pair, keyed so re-runs upsert instead of duplicate.
// `status` is deliberately absent: on insert the table defaults it to 'open',
// on conflict the upsert never touches it — a dismissed pair stays dismissed
// even when the detector keeps seeing the same signals.
export interface DedupReviewRow {
  pair_key: string;
  a_id: string;
  b_id: string;
  kind: DedupKind;
  signals: string[];
  confidence: DedupPair["confidence"];
  evidence: string[];
}

// Same DEMO rule as the completeness scorer (scripts/enrichment): demo-* ids
// and node_type "demo" never enter the queue.
export function isDemoRecord(r: DedupSourceRecord): boolean {
  return /^demo-/.test(r.id) || r.node_type === "demo";
}

export function pairKey(kind: DedupKind, pair: DedupPair): string {
  return `${kind}:${pair.aId}:${pair.bId}`;
}

export function collectDedupRows(input: {
  people: DedupSourceRecord[];
  orgs: DedupSourceRecord[];
}): DedupReviewRow[] {
  const kinds: Array<[DedupKind, DedupSourceRecord[]]> = [
    ["person", input.people],
    ["org", input.orgs],
  ];
  const rows: DedupReviewRow[] = [];
  for (const [kind, records] of kinds) {
    for (const pair of findDuplicatePairs(records.filter((r) => !isDemoRecord(r)))) {
      rows.push({
        pair_key: pairKey(kind, pair),
        a_id: pair.aId,
        b_id: pair.bId,
        kind,
        signals: pair.signals,
        confidence: pair.confidence,
        evidence: pair.evidence,
      });
    }
  }
  return rows;
}
