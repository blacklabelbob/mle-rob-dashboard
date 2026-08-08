/**
 * Q87 inc.5 — THE PASS THAT FIRES.
 *
 * The three pieces before this one each closed the gap the one before it named. inc.2 asked the
 * question (`deepDiveDue.ts` — is this org owed a deep dive?) and measured 4 referral targets,
 * every one `due-unattributed`. inc.3 built the place a run gets written down
 * (`deepDiveLedger.ts`). inc.4 gave that ledger a writer (`deep-dive-worklist.mjs --record`) —
 * an OPERATOR typing a producer name by hand. What has never existed is the thing Rob actually
 * asked for: *"we need to do an auto deep dive on them so we have some background"*. A pass.
 *
 * SO THE ONE RULE THIS MODULE IS BUILT AROUND: **a ledger row is earned by a dive that produced
 * something, never by a pass that ran.** inc.4's `--record` refuses a run with no `--by` because
 * an operator would otherwise credit themselves; the automated equivalent is worse, because
 * nobody is watching. A pass that appends a row every time it iterates an org would move all four
 * targets to `covered` on its first tick having researched nothing — re-creating, automatically
 * and at scale, exactly the unfalsifiable claim inc.2 was built to kill (INCIDENT-LEDGER #22/#34:
 * a field's silence read as a fact). So:
 *
 *   1. THE PASS NEVER NAMES THE PRODUCER. `producedBy` arrives on the dive RESULT, from whatever
 *      actually did the research. The pass cannot sign work on a researcher's behalf, and a
 *      result that names no producer is refused here rather than at the ledger, so the refusal
 *      is attributed to the org it declined to cover.
 *
 *   2. A DIVE WITH NO FINDINGS IS NOT A DIVE. Empty `summary` → no row. The org stays due, which
 *      is the truth: nothing was learned.
 *
 *   3. A FINDING WITH NO SOURCE IS NOT A FINDING. `~/.claude/rules/external-facts.md` — a claim
 *      about an outside company needs the URL that establishes it, and this pass writes about
 *      companies MLE has never met. Sourceless prose is precisely the hand-typed paragraph the
 *      whole item exists to distinguish itself from, so it may not buy provenance.
 *
 *   4. EXECUTION IS NEVER A DEFAULT (rule 1 of `summaryPass.ts`, deliberately identical). `execute`
 *      is required, not optional-with-a-value. A dive costs a research budget; a caller that has
 *      not said "yes, spend" gets a plan. Two spend triggers that disagree about what a missing
 *      flag means is how one of them gets called wrong.
 *
 *   5. WHICH ORGS ARE DUE IS NOT RE-DECIDED HERE. `deepDiveWorklist` owns that rule, including the
 *      `referral target` phrase match and the emptiest-record-first order. A second copy inside the
 *      pass is the duplicate-rule class Q88 exists to catch.
 *
 *   6. A PER-ORG FAILURE IS CONTAINED AND NAMED; A READ FAILURE THROWS. One company's researcher
 *      blowing up must not silence the other three, but a failed org read or a failed ledger read
 *      means the pass does not know what it is looking at — and "0 due" is what that would look
 *      like from outside.
 *
 *   7. THE LEDGER IS THREADED, NOT RE-READ. Each recording folds into the value the next one sees,
 *      so two orgs covered in one tick both land. Re-reading (or writing per org) is how the
 *      second write drops the first.
 *
 * PURE (CR-3): no clock, no fs, no fetch, no Supabase, no env. The org read, the ledger read, the
 * dive itself, the write, and the day are all injected — every rule above is tested with none of
 * them in the room.
 */

import {
  deepDiveWorklist,
  type DeepDiveDecision,
  type DeepDiveOptions,
  type DeepDiveOrg,
  type DeepDiveRun,
} from "./deepDiveDue";
import {
  parseLedger,
  recordRun,
  type LedgerFile,
  type RejectedRow,
} from "./deepDiveLedger";

/** What a researcher hands back for one org. The pass supplies none of these fields. */
export interface DeepDiveFinding {
  /** Who did the research — an agent/skill/script name. Rule 1: never filled in by the pass. */
  producedBy?: string;
  /** ISO day the research happened. Handed in; there is no clock here. */
  ranAt?: string;
  /** What was learned. Empty means nothing was learned — rule 2. */
  summary?: string;
  /** URLs establishing the summary. Rule 3: no source, no row. */
  sources?: readonly string[];
}

export type DeepDiveOutcome =
  /** A row was earned and folded into the ledger. `duplicate` = already on file, still covered. */
  | { orgId: string; kind: "recorded"; run: DeepDiveRun; ledgerOutcome: "appended" | "duplicate" }
  /** The dive ran (or failed) and did NOT earn a row. The org stays due, and here is why. */
  | { orgId: string; kind: "not-recorded"; reason: string };

export interface DeepDivePassDeps {
  /** Every org worth considering. Filtered by `deepDiveWorklist`, never by a caller (rule 5). */
  listOrgs: () => Promise<readonly DeepDiveOrg[]>;
  /** The ledger file exactly as stored — parsing is the ledger module's job, not the caller's. */
  loadLedger: () => Promise<unknown>;
  /** Do the research for one org. Rejecting is allowed; it is contained and named (rule 6). */
  dive: (decision: DeepDiveDecision) => Promise<DeepDiveFinding>;
  /** Persist the final ledger. Called ONCE, and only when something was actually appended. */
  saveLedger: (ledger: LedgerFile) => Promise<void>;
}

export interface DeepDivePassInput {
  /** Env names that are unset. Non-empty short-circuits before any read. */
  missingConfig: readonly string[];
  /** Rule 4: required. `false` plans and stops; `true` dives. */
  execute: boolean;
  /** Positive caps how many orgs this tick dives. Omitted = every due org. */
  limit?: number;
  /** Passed straight through to `deepDiveWorklist` — `asOf`, `freshDays`. Runs are supplied here. */
  freshness?: Omit<DeepDiveOptions, "runs">;
}

export interface DeepDivePlan {
  counts: Record<string, number>;
  /** Due orgs in worklist order (emptiest record first), after `limit`. */
  due: DeepDiveDecision[];
  /** Due orgs the limit left for a later tick — reported, never silently dropped. */
  deferred: DeepDiveDecision[];
  /** Ledger rows the ledger itself refused. Carried into every result shape. */
  rejectedLedgerRows: RejectedRow[];
}

export type DeepDivePassResult =
  | { kind: "not-configured"; missing: readonly string[] }
  | { kind: "planned"; plan: DeepDivePlan }
  | {
      kind: "executed";
      plan: DeepDivePlan;
      outcomes: DeepDiveOutcome[];
      recorded: number;
      refused: number;
      /** The ledger as it now stands. Present only when a row was appended. */
      ledger?: LedgerFile;
    };

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Decide whether a finding earned a ledger row, and say why not when it did not.
 *
 * Exported because this is the rule worth testing directly — it is the whole difference between
 * a pass that proves background exists and a pass that asserts it.
 */
export function runFromFinding(
  orgId: string,
  finding: DeepDiveFinding | null | undefined,
): DeepDiveRun | { refused: string } {
  if (!finding || typeof finding !== "object") {
    return { refused: "the researcher returned nothing at all — no run recorded" };
  }
  const producedBy = text(finding.producedBy);
  const ranAt = text(finding.ranAt);
  const summary = text(finding.summary);
  const sources = (finding.sources ?? []).map(text).filter(Boolean);

  // Rule 1 — before anything else, because an unattributed row is the failure this item is about.
  if (!producedBy) {
    return { refused: "the dive named no producer — a pass may not sign research on a researcher's behalf" };
  }
  if (!ranAt) {
    return { refused: `${producedBy} returned no run date — an undated run cannot be aged, so it is not recorded` };
  }
  // Rule 2.
  if (!summary) {
    return { refused: `${producedBy} produced no findings — an empty dive does not cover a company` };
  }
  // Rule 3.
  if (sources.length === 0) {
    return {
      refused: `${producedBy} produced findings with no source URL — an unsourced claim about an outside company is the hand-typed paragraph this pass exists to be distinguishable from`,
    };
  }
  return { orgId, ranAt, producedBy };
}

const isRefusal = (v: DeepDiveRun | { refused: string }): v is { refused: string } =>
  Object.prototype.hasOwnProperty.call(v, "refused");

/**
 * Plan the deep-dive pass and — only when told to — run it.
 *
 * Returns rather than throws for the same reason `runSummaryPass` does: a caller needs both halves
 * of a partial pass. Org and ledger reads still throw (rule 6).
 */
export async function runDeepDivePass(
  deps: DeepDivePassDeps,
  input: DeepDivePassInput,
): Promise<DeepDivePassResult> {
  if (input.missingConfig.length > 0) {
    return { kind: "not-configured", missing: input.missingConfig };
  }

  const orgs = await deps.listOrgs();
  let ledgerRaw = await deps.loadLedger();

  // Read through the ledger module's OWN parser — a malformed row must be refused by the same
  // rule on the way in as on the way out, and the rows it refused travel with the result rather
  // than disappearing into a verdict.
  const { runs: knownRuns, rejected: rejectedLedgerRows } = parseLedger(ledgerRaw ?? { version: 1, runs: [] });

  const worklist = deepDiveWorklist([...orgs], { ...(input.freshness ?? {}), runs: knownRuns });
  const cap = input.limit && input.limit > 0 ? input.limit : worklist.due.length;
  const due = worklist.due.slice(0, cap);
  const deferred = worklist.due.slice(cap);
  const plan: DeepDivePlan = {
    counts: worklist.counts,
    due,
    deferred,
    rejectedLedgerRows,
  };

  if (!input.execute || due.length === 0) return { kind: "planned", plan };

  const outcomes: DeepDiveOutcome[] = [];
  let appended = 0;
  let ledger: LedgerFile | undefined;

  for (const decision of due) {
    let finding: DeepDiveFinding | null = null;
    try {
      finding = await deps.dive(decision);
    } catch (err) {
      // Rule 6 — one company's researcher failing does not silence the rest, and does not record.
      outcomes.push({
        orgId: decision.orgId,
        kind: "not-recorded",
        reason: `the dive failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const result = runFromFinding(decision.orgId, finding);
    if (isRefusal(result)) {
      outcomes.push({ orgId: decision.orgId, kind: "not-recorded", reason: result.refused });
      continue;
    }

    // Rule 7 — thread the ledger so a second recording sees the first.
    const recorded = recordRun(ledgerRaw ?? { version: 1, runs: [] }, result);
    ledgerRaw = recorded.ledger;
    ledger = recorded.ledger;
    if (recorded.outcome === "appended") appended += 1;
    outcomes.push({
      orgId: decision.orgId,
      kind: "recorded",
      run: result,
      ledgerOutcome: recorded.outcome,
    });
  }

  if (appended > 0 && ledger) await deps.saveLedger(ledger);

  return {
    kind: "executed",
    plan,
    outcomes,
    recorded: outcomes.filter((o) => o.kind === "recorded").length,
    refused: outcomes.filter((o) => o.kind === "not-recorded").length,
    ledger,
  };
}

/** Counts and reasons, never researched prose — the log may not leak a summary paragraph. */
export function deepDivePassLog(result: DeepDivePassResult): Record<string, unknown> {
  if (result.kind === "not-configured") return { pass: "deep-dive", state: "not-configured", missing: result.missing };
  if (result.kind === "planned") {
    return {
      pass: "deep-dive",
      state: "planned",
      due: result.plan.due.length,
      deferred: result.plan.deferred.length,
      rejectedLedgerRows: result.plan.rejectedLedgerRows.length,
      counts: result.plan.counts,
    };
  }
  return {
    pass: "deep-dive",
    state: "executed",
    due: result.plan.due.length,
    deferred: result.plan.deferred.length,
    recorded: result.recorded,
    refused: result.refused,
    reasons: result.outcomes
      .filter((o): o is Extract<DeepDiveOutcome, { kind: "not-recorded" }> => o.kind === "not-recorded")
      .map((o) => `${o.orgId}: ${o.reason}`),
    rejectedLedgerRows: result.plan.rejectedLedgerRows.length,
  };
}
