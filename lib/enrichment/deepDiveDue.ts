/**
 * Q87 inc.2 — which referral targets are OWED an automatic deep dive, decided by the record
 * instead of by whoever last remembered doing one.
 *
 * Q87's DoD has four parts and three of them shipped on 2026-08-05: the four companies exist,
 * they carry a *not yet met* gate, and the attribution runs Rob → Alex → Scott → each one. The
 * fourth — *"an automatic deep dive run so background exists before any introduction"* — did
 * NOT ship, and the annotation says so plainly: background exists "as an enrichment written by
 * hand this run, not as a pass that fires".
 *
 * THE DEFECT THIS CLOSES IS NOT THE MISSING PASS — IT IS THAT NOTHING CAN TELL THE DIFFERENCE.
 * All four orgs carry a 1,000–1,800 character `description`. Read the record and it looks
 * researched. Nothing on it distinguishes a paragraph a deep-dive pass produced from a paragraph
 * a session typed, and nothing distinguishes either from a paragraph that was true in July. So
 * "the deep dive has been done" is, today, an unfalsifiable claim — which is the same shape as
 * INCIDENT-LEDGER #22/#34 (a field's silence read as a fact) pointed at enrichment instead of at
 * a transcript. A pass that fires is worth building; a pass that cannot say whether it has ever
 * run for a given org is worth less than nothing, because its output is indistinguishable from
 * prose.
 *
 * SO THIS MODULE DECIDES ONE QUESTION AND REFUSES THE ADJACENT ONE.
 *
 *   - It answers **is this org owed a deep dive** — from the org's own fields plus provenance the
 *     caller supplies.
 *   - It does **not** answer *is the background any good*. Quality is `completeness-score.mjs`'s
 *     rubric (Q7b), already written and already tested, and a second copy of a scoring ladder
 *     living here is exactly the duplicate-rule class Q88 names. Where a score matters it is
 *     **handed in**, never recomputed.
 *
 * THE VERDICT THAT MATTERS IS `due-unattributed`. It says: there IS background, and nothing on
 * the record proves where it came from. That is deliberately not `covered` — crediting a
 * hand-typed paragraph as a completed automatic pass is how the pass never gets built — and
 * deliberately not `due-no-background` either, because a re-run that ignores 1,800 characters of
 * real research would throw away work Rob paid for in session time.
 *
 * PURE (CR-3): no clock, no fetch, no Supabase, no fs. Every input — including "now", when a
 * caller wants staleness — is handed in.
 */

/** The subset of an `orgs` row this decision reads. Nothing else is consulted. */
export interface DeepDiveOrg {
  id: string;
  name: string;
  /** `lead` / `client` / … — a target that became a client is no longer a pre-introduction case. */
  nodeType?: string | null;
  /** Free text. The 2026-08-05 run wrote the gate INTO this field, so it is where the flag lives. */
  relationship?: string | null;
  description?: string | null;
  notes?: string | null;
  /** `{ met: "2026-07-31" }` — a met company is past the point this item is about. */
  keyDates?: Record<string, unknown> | null;
}

/**
 * Provenance the CALLER supplies, per org id. Absent means absent — never "probably none".
 * `ranAt` is an ISO day; it is compared only against a `asOf` the caller also supplies.
 */
export interface DeepDiveRun {
  orgId: string;
  ranAt: string;
  /** What produced it — an agent/skill/script name. A run with no producer is not a run. */
  producedBy: string;
}

export type DeepDiveVerdict =
  /** Not a pre-introduction referral target (met, or a client, or never flagged as one). */
  | "not-a-target"
  /** Target, nothing on the record at all. The clean case for a first pass. */
  | "due-no-background"
  /** Target WITH background and NO recorded run. Re-runnable, but nothing may be discarded. */
  | "due-unattributed"
  /** Target with a recorded run older than the caller's freshness window. */
  | "due-stale"
  /** Target with a recorded run inside the window. */
  | "covered"
  /** The caller asked about staleness without supplying `asOf`. Never silently "covered". */
  | "unknown-freshness";

export interface DeepDiveDecision {
  orgId: string;
  name: string;
  verdict: DeepDiveVerdict;
  /** One line a human can read without opening the record. */
  because: string;
  /** Characters of background on the record — the thing a re-run must not throw away. */
  backgroundChars: number;
  /** The run this decision saw, if the caller supplied one. */
  lastRun?: DeepDiveRun;
}

export interface DeepDiveOptions {
  /** Recorded runs, by org. Omitted entirely = the caller has no provenance store yet. */
  runs?: DeepDiveRun[];
  /** ISO day the caller is asking AS OF. Required for any staleness verdict (no clock here). */
  asOf?: string;
  /** Days a run stays fresh. Only consulted when `asOf` is supplied. */
  freshDays?: number;
}

/**
 * The gate the 2026-08-05 run wrote into `relationship`, matched on its own words rather than on
 * a status enum — because `lead`/`unlit` is also what a cold outbound lead looks like, and the
 * two are not the same thing. Case-insensitive; the phrase is theirs, not inferred.
 */
const TARGET_RE = /referral target/i;

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Background = description + notes. Both are prose a re-run would be overwriting. */
export function backgroundChars(org: DeepDiveOrg): number {
  return text(org.description).length + text(org.notes).length;
}

/**
 * A target is a company we have NOT met and are not already working with. `key_dates.met` and a
 * non-lead node type each disqualify on their own — a met company's next step is a follow-up,
 * not a pre-introduction dossier.
 */
export function isReferralTarget(org: DeepDiveOrg): boolean {
  if (!TARGET_RE.test(text(org.relationship))) return false;
  const nodeType = text(org.nodeType).toLowerCase();
  if (nodeType && nodeType !== "lead") return false;
  const met = org.keyDates && typeof org.keyDates === "object" ? (org.keyDates as Record<string, unknown>).met : undefined;
  if (text(met)) return false;
  return true;
}

/** Whole days between two ISO days, positive when `later` is after `earlier`. */
function daysBetween(earlier: string, later: string): number | null {
  const a = Date.parse(`${earlier.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${later.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function deepDiveDecision(org: DeepDiveOrg, opts: DeepDiveOptions = {}): DeepDiveDecision {
  const chars = backgroundChars(org);
  const base = { orgId: org.id, name: org.name, backgroundChars: chars };

  if (!isReferralTarget(org)) {
    return {
      ...base,
      verdict: "not-a-target",
      because: "not a pre-introduction referral target on its own record (met, or not flagged as one)",
    };
  }

  const runs = (opts.runs ?? []).filter((r) => r.orgId === org.id && text(r.ranAt) && text(r.producedBy));
  const lastRun = runs.sort((a, b) => (a.ranAt < b.ranAt ? 1 : -1))[0];

  if (!lastRun) {
    return chars > 0
      ? {
          ...base,
          verdict: "due-unattributed",
          because: `${chars} chars of background on the record and no recorded deep-dive run — nothing proves where it came from, and a re-run must merge rather than replace it`,
        }
      : { ...base, verdict: "due-no-background", because: "referral target with no background at all" };
  }

  if (!text(opts.asOf)) {
    return {
      ...base,
      verdict: "unknown-freshness",
      lastRun,
      because: `a run is recorded (${lastRun.ranAt}, ${lastRun.producedBy}) but no as-of day was supplied, so its freshness is unknown`,
    };
  }

  const age = daysBetween(lastRun.ranAt, opts.asOf as string);
  if (age === null) {
    return {
      ...base,
      verdict: "unknown-freshness",
      lastRun,
      because: `run date ${lastRun.ranAt} or as-of ${opts.asOf} is not a readable day`,
    };
  }
  const fresh = opts.freshDays ?? 90;
  return age > fresh
    ? {
        ...base,
        verdict: "due-stale",
        lastRun,
        because: `last deep dive ${age} days ago (${lastRun.ranAt}, ${lastRun.producedBy}), past the ${fresh}-day window`,
      }
    : {
        ...base,
        verdict: "covered",
        lastRun,
        because: `deep dive ${age} days ago by ${lastRun.producedBy}`,
      };
}

export interface DeepDiveWorklist {
  decisions: DeepDiveDecision[];
  /** Everything a pass would act on, in the order it should — emptiest record first. */
  due: DeepDiveDecision[];
  counts: Record<DeepDiveVerdict, number>;
}

export function deepDiveWorklist(orgs: DeepDiveOrg[], opts: DeepDiveOptions = {}): DeepDiveWorklist {
  const decisions = orgs.map((o) => deepDiveDecision(o, opts));
  const counts: Record<DeepDiveVerdict, number> = {
    "not-a-target": 0,
    "due-no-background": 0,
    "due-unattributed": 0,
    "due-stale": 0,
    covered: 0,
    "unknown-freshness": 0,
  };
  for (const d of decisions) counts[d.verdict] += 1;
  const due = decisions
    .filter((d) => d.verdict.startsWith("due-"))
    .sort((a, b) => a.backgroundChars - b.backgroundChars || a.orgId.localeCompare(b.orgId));
  return { decisions, due, counts };
}
