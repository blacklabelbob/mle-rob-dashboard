/**
 * Q85 inc.10 — retiring the UNKEYED hand-filed rows that inc.2–inc.9 left on Rob's ledger,
 * without deleting a fact nothing else says.
 *
 * The situation this exists for, measured on prod 2026-08-07: rows **#206–#212** are seven
 * hand-POSTed findings, all open at once, all about the same week of Q85 work, none of them
 * carrying a `dedupeKey`. The supersede mechanism (`planFlagWrite`) cannot touch them — it
 * pairs rows BY KEY, and these have none. That is not a bug in the mechanism; it is what
 * "unkeyed" means. So they will sit there until something deliberately retires them.
 *
 * WHY THIS IS NOT "RESOLVE THE OLD ONES AND MOVE ON". A supersede says *this row's finding is
 * still on your ledger, in a newer row*. That sentence must be TRUE. Of the seven, only some
 * are re-minted every run by a keyed writer; the rest carry a measurement or a cause that no
 * writer reproduces today. Retiring one of those would not tidy the ledger, it would silently
 * delete the only place a fact is written down — the exact harm the ledger exists to prevent
 * (INCIDENT-LEDGER #22/#34: an absence asserted from a surface that simply wasn't carrying it).
 *
 * So the plan has two dispositions and the difference is the whole point:
 *
 *   - **retire** — a live keyed row states this finding and re-states it on every run. The
 *     legacy row is resolved with `supersededNote(survivor)`, never deleted, and the existing
 *     Reopen control undoes it.
 *   - **hold** — nothing keyed says this today. The row STAYS OPEN, and the stated reason
 *     names what would have to be built before it could be retired. A hold is a work item,
 *     not a verdict.
 *
 * The mapping below is reviewed content-by-content and lives in code rather than in a script's
 * prose so it is testable (CR-3). This module is PURE: no clock, no network, no Supabase, no
 * fetch. The caller reads the rows and applies the plan.
 */

import { supersededNote, type FlagStatus } from "./supersede";

/** A ledger row as this pass needs to see it. `dedupeKey` null is the whole reason it's here. */
export type LedgerRow = {
  id: number;
  status: FlagStatus;
  dedupeKey: string | null;
};

export type Disposition = "retire" | "hold";

export type RetirementRule = {
  /** The unkeyed row on Rob's ledger. */
  legacyId: number;
  disposition: Disposition;
  /** Required for `retire`: the dedupe key of the live row that re-states this finding. */
  survivorKey?: string;
  /** Why — in the terms of the finding itself, not "cleanup". Printed with the plan. */
  why: string;
};

export type RetirementStep =
  | { legacyId: number; action: "retire"; survivorId: number; note: string; why: string }
  | { legacyId: number; action: "hold"; why: string }
  | { legacyId: number; action: "skip"; reason: string };

/**
 * THE REVIEWED MAPPING (prod ids, measured 2026-08-07 — Q85 inc.10).
 *
 * Read the `why` on every hold as the next increment's brief: each one names a finding that is
 * true, is on Rob's page exactly once, and has no writer keeping it current.
 */
export const Q85_LEGACY_RETIREMENTS: readonly RetirementRule[] = [
  {
    legacyId: 206,
    disposition: "retire",
    survivorKey: "meeting-archive/write-blockers",
    why: "HELD at inc.10 because nothing keyed stated the CAUSE. inc.11 built the writer: `buildWriteBlockerFinding` re-measures the blocker breakdown — empty Notion company column vs a company the CRM does not hold vs no readable day — on every `check:archive` run, naming the system each fix lives in. The cause is now re-stated with current numbers where this row's are frozen.",
  },
  {
    legacyId: 207,
    disposition: "hold",
    why: "Three named CG Roofing meetings whose titles hold the domain the Notion field omits. No keyed writer emits a per-company breakdown; the survivor family counts rows, not companies.",
  },
  {
    legacyId: 208,
    disposition: "hold",
    why: "The 4→6 movement in title-derived company names is a DELTA. No keyed row carries a before/after, so this is the only record that the planner's reach grew.",
  },
  {
    legacyId: 209,
    disposition: "hold",
    why: "A denominator — 6 of 46 orphaned rows name a counterparty at all. `meeting-archive/person-proposals` (#213) reports only the UNRESOLVED 3; it never states how many rows named anyone.",
  },
  {
    legacyId: 210,
    disposition: "retire",
    survivorKey: "meeting-archive/person-proposals",
    why: "The resolved-vs-unknown split of the counterparties is exactly what the person-proposal writer recomputes every `check:archive` run — and its numbers are current where this row's are frozen.",
  },
  {
    legacyId: 211,
    disposition: "retire",
    survivorKey: "meeting-archive/write-blockers",
    why: "HELD at inc.10 because #213 is the person half only. inc.11's finding states the company/person asymmetry as a computed consequence of its own blocker mapping — every blocker it can emit is a company or a date, and an unresolved attendee never stops a write. Re-stated every run rather than typed once.",
  },
  {
    legacyId: 212,
    disposition: "retire",
    survivorKey: "meeting-archive/person-proposals",
    why: "'Dix thedev08' must not become a second record — re-minted every run as #213's `must NOT become a record` half, with the P-1010 link intact.",
  },
] as const;

/**
 * Decide, per rule, what may actually be done to the ledger.
 *
 * Every refusal is a `skip` with a stated reason rather than a silent drop, because a
 * retirement pass that quietly does less than it claims is the same class of failure as one
 * that does too much.
 *
 * @param rules    the reviewed mapping
 * @param ledger   the rows the caller read — legacy rows AND candidate survivors
 */
export function planLegacyRetirements(
  rules: readonly RetirementRule[],
  ledger: readonly LedgerRow[],
): RetirementStep[] {
  const byId = new Map(ledger.map((r) => [r.id, r]));
  const openSurvivorByKey = new Map<string, LedgerRow>();
  for (const row of ledger) {
    if (row.dedupeKey && row.status === "open" && !openSurvivorByKey.has(row.dedupeKey)) {
      openSurvivorByKey.set(row.dedupeKey, row);
    }
  }

  return rules.map((rule): RetirementStep => {
    const row = byId.get(rule.legacyId);
    if (!row) return { legacyId: rule.legacyId, action: "skip", reason: "row not on the ledger — nothing to retire" };
    if (row.status !== "open") {
      return { legacyId: rule.legacyId, action: "skip", reason: "already resolved — leaving the existing resolution alone" };
    }
    // A keyed row belongs to `planFlagWrite`. This one-time pass must never reach into the
    // mechanism's rows, or two things would be correcting the same row on different rules.
    if (row.dedupeKey) {
      return { legacyId: rule.legacyId, action: "skip", reason: `row is keyed (${row.dedupeKey}) — the supersede mechanism owns it, not this pass` };
    }
    if (rule.disposition === "hold") return { legacyId: rule.legacyId, action: "hold", why: rule.why };

    const key = rule.survivorKey;
    if (!key) return { legacyId: rule.legacyId, action: "skip", reason: "retire rule carries no survivorKey" };
    const survivor = openSurvivorByKey.get(key);
    if (!survivor) {
      return { legacyId: rule.legacyId, action: "skip", reason: `no OPEN row on key ${key} — a supersede would point at nothing` };
    }
    return {
      legacyId: rule.legacyId,
      action: "retire",
      survivorId: survivor.id,
      note: supersededNote(survivor.id),
      why: rule.why,
    };
  });
}

/** One line per step, for the terminal and for the increment's proof. */
export function retirementPlanText(steps: readonly RetirementStep[]): string {
  if (steps.length === 0) return "no legacy rows in scope";
  const lines = steps.map((s) => {
    if (s.action === "retire") return `RETIRE  #${s.legacyId} → #${s.survivorId}  ${s.why}`;
    if (s.action === "hold") return `HOLD    #${s.legacyId}  stays OPEN — ${s.why}`;
    return `SKIP    #${s.legacyId}  ${s.reason}`;
  });
  const retiring = steps.filter((s) => s.action === "retire").length;
  const holding = steps.filter((s) => s.action === "hold").length;
  return [
    `${retiring} to retire · ${holding} held open on purpose · ${steps.length - retiring - holding} skipped`,
    ...lines,
  ].join("\n");
}
