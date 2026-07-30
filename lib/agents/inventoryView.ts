// Q79 half (c) — the ranking behind the Agents & Skills page.
//
// Half (a) generated the inventory and half (b) graded it. Neither is the point
// on its own: Rob's words were "it's really hard to see if any of them are giving
// the wrong instructions when I don't even know they exist." So the page has one
// job — put the ones that are LYING at the top, and never let a clean file outrank
// a flagged one. That ordering is a rule, so it lives here in code (CR-3) with
// tests, not in JSX where a stray sort key would quietly re-shuffle the evidence.

import type { AssetRecord, AuditFinding, FindingSeverity } from "./inventory";

export interface AssetRow {
  asset: AssetRecord;
  findings: AuditFinding[];
  high: number;
  medium: number;
  /** Worst severity present, or null when the file is clean. Drives the badge. */
  worst: FindingSeverity | null;
  /** Path with the scan root collapsed to `~/.claude`, so the row is readable. */
  displayPath: string;
}

/**
 * `~/.claude/agents/foo.md` beats `/Users/<someone>/.claude/agents/foo.md` on a
 * screen Rob reads at a glance — and it keeps a home directory out of a surface
 * that may end up screenshotted.
 */
export function shortenPath(path: string, source: string): string {
  if (source && path.startsWith(source)) {
    return `~/.claude${path.slice(source.length)}`;
  }
  return path;
}

/**
 * Worst-first, and strictly: any file with a `high` outranks every file without
 * one, regardless of how many `medium`s the other has piled up. A gate-failing
 * lie is not out-weighed by seven "mentions STG" notes. Ties break by medium
 * count, then kind (agents first — they act), then name, so two runs on the same
 * inventory produce the identical page.
 */
export function rankAssets(
  assets: readonly AssetRecord[],
  findings: readonly AuditFinding[],
  source = "",
): AssetRow[] {
  const bySlug = new Map<string, AuditFinding[]>();
  for (const f of findings) {
    const key = `${f.kind}:${f.slug}`;
    const list = bySlug.get(key);
    if (list) list.push(f);
    else bySlug.set(key, [f]);
  }

  const rows: AssetRow[] = assets.map((asset) => {
    const own = bySlug.get(`${asset.kind}:${asset.slug}`) ?? [];
    const high = own.filter((f) => f.severity === "high").length;
    const medium = own.length - high;
    return {
      asset,
      // High before medium inside a row too — the first line Rob reads is the worst one.
      findings: [...own].sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
      high,
      medium,
      worst: high > 0 ? "high" : medium > 0 ? "medium" : null,
      displayPath: shortenPath(asset.path, source),
    };
  });

  return rows.sort(
    (a, b) =>
      Number(b.high > 0) - Number(a.high > 0) ||
      b.high - a.high ||
      b.medium - a.medium ||
      a.asset.kind.localeCompare(b.asset.kind) ||
      a.asset.name.localeCompare(b.asset.name),
  );
}

function severityRank(s: FindingSeverity): number {
  return s === "high" ? 2 : 1;
}

/**
 * Count of files with no findings at all. Shown as its own number because
 * "125 clean" is the reassurance, and 8 flagged is the work — merging them into
 * one total would hide both.
 */
export function cleanCount(rows: readonly AssetRow[]): number {
  return rows.filter((r) => r.worst === null).length;
}
