import type { NetworkData, NetworkStats, Person } from "@/lib/types";

// Contribution = what a node is really worth: cash on paper + probability-weighted
// estimate of revenue behind the doors they open. Drives node size in the graph.
export function contribution(p: Person): number {
  const paper = p.quotedAmount ?? 0;
  const est = p.estimate ? p.estimate.estRevenue * p.estimate.probability : 0;
  return paper + est;
}

// Demo records (fabricated rep-training data, name-tagged "(DEMO)") exist only
// for the Rep Cockpit; every real-data surface must exclude them.
export function isDemo(p: Person): boolean {
  return p.name.includes("(DEMO)");
}

// signed counts in rollups ONLY when a signed date exists; a signed flag with no
// date is a data conflict (e.g. Gulf Coast 2026-07) — flagged, never silently summed.
export function isDisputedSigned(p: Person): boolean {
  return p.signed && !p.keyDates?.signed;
}

export function computeStats(data: NetworkData): NetworkStats {
  const people = data.people;
  const litCount = people.filter((p) => p.status === "lit").length;
  const warmCount = people.filter((p) => p.status === "warm").length;
  return {
    totalPeople: people.length,
    litCount,
    warmCount,
    unlitCount: people.length - litCount - warmCount,
    signedCount: people.filter((p) => p.signed).length,
    pipelineQuoted: people
      .filter((p) => !p.signed)
      .reduce((s, p) => s + (p.quotedAmount ?? 0), 0),
    signedValue: people
      .filter((p) => p.signed && !isDisputedSigned(p))
      .reduce((s, p) => s + (p.quotedAmount ?? 0), 0),
    disputedSignedValue: people
      .filter(isDisputedSigned)
      .reduce((s, p) => s + (p.quotedAmount ?? 0), 0),
    estNetworkValue: people.reduce((s, p) => s + contribution(p), 0),
  };
}

export function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}
