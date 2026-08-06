/**
 * Q89 inc.23 — critic-rob punch #7: *"The Overview action block is a 22-row wall with no
 * cap and no summary layer. Every action item in the CRM, ungrouped, unlabeled, unranked.
 * That is the raw-sprawl defect. Once context lands: group by company, cap each block at
 * ~5 with 'show all N'."*
 *
 * Context landed in inc.4 (`provenance.context` — the company name, stamped on the
 * ADDRESS, never glued into the claim). This module is the "once context lands" half.
 *
 * Two rules, and they are different rules:
 *
 *  1. **Group by company.** 22 rows from six companies read as one undifferentiated wall;
 *     the same 22 under six headings read as six short lists. Nothing is dropped by
 *     grouping — every item still renders, under its own company.
 *
 *  2. **Cap what is OPEN, never what EXISTS.** The cap hides rows behind a disclosure; it
 *     never removes them and never changes the count. This matters more here than on a
 *     normal list: this surface's entire premise is that a meeting's contents must be
 *     visible or they did not happen. A cap that silently truncated would re-create, in
 *     the UI, exactly the defect Q89 exists to fix. So the overflow count is printed and
 *     the rows stay one click away — `hidden` is returned, not discarded.
 *
 * Pure per CR-3: no clock, no store, no DOM. It computes layout groups and nothing else —
 * it never ranks (that is `meeting-next-steps` via `rank`), never validates (that is
 * `meetingIntel.validate`), and never writes a company name into an item's text.
 */

import type { IntelItem } from "./meetingIntel";

/** Rows shown before the disclosure. ~5 per the review; one number, one place. */
export const GROUP_CAP = 5;

export type IntelGroup = {
  /**
   * The company these items came from, or null on a single-company surface where
   * `provenance.context` is deliberately absent and a heading would be noise.
   */
  context: string | null;
  /** Rendered immediately. */
  shown: IntelItem[];
  /** Rendered behind "show all N" — present, never dropped. */
  hidden: IntelItem[];
  /** shown + hidden. Printed, so the cap can never read as the true total. */
  total: number;
};

/**
 * Group a block's items by company and cap each group.
 *
 * Order is deterministic and stated rather than incidental:
 *
 *  - **Ranked blocks** (every item carries an external rank) order groups by their best
 *    rank, so the company holding next-step #1 is the first thing on the screen. Grouping
 *    would otherwise bury a global ranking under alphabetical or arrival order — losing
 *    the one thing a ranking is for.
 *  - **Unranked blocks** keep first-appearance order, which is source order — the same
 *    "as said, not ranked" contract the block header already prints.
 *
 * Within a group, item order is always preserved exactly as given. This module never
 * reorders items, only groups.
 */
export function groupIntelItems(items: IntelItem[], cap: number = GROUP_CAP): IntelGroup[] {
  // Keyed by `string | null`, NOT by a sentinel string. A sentinel has to be a value no
  // company could ever be named, and the first attempt at one put a raw NUL byte into this
  // file — caught by `anchorRegistry.test.ts`, which exists because a NUL makes grep call a
  // whole module "binary" and report NO MATCH for names that are in it. `null` is a
  // perfectly good Map key; there was never a reason to encode it as text.
  const order: (string | null)[] = [];
  const byKey = new Map<string | null, IntelItem[]>();

  for (const item of items) {
    // A blank/whitespace context is the same fact as no context: we do not know whose it
    // is. It must not become a group headed by an empty string.
    const key = item.provenance.context?.trim() || null;
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(item);
  }

  // "Ranked" here mirrors `IntelBlock.ordering`: it is only true when EVERY item carries a
  // rank. A partial ranking is not a ranking — sorting on it would invent an order for the
  // items that never had one.
  const ranked = items.length > 0 && items.every((i) => typeof i.rank === "number");

  const keys = ranked
    ? [...order].sort((a, b) => bestRank(byKey.get(a)!) - bestRank(byKey.get(b)!))
    : order;

  return keys.map((key) => {
    const group = byKey.get(key)!;
    const safeCap = Math.max(1, Math.floor(cap));
    return {
      context: key,
      shown: group.slice(0, safeCap),
      hidden: group.slice(safeCap),
      total: group.length,
    };
  });
}

function bestRank(items: IntelItem[]): number {
  return Math.min(...items.map((i) => i.rank ?? Number.POSITIVE_INFINITY));
}
