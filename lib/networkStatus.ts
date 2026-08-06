// Q89 inc.28 — WHY IS THIS RECORD UNLIT?
//
// Rob, dev_chat 2026-08-06 (#58/#60/#62): "Omega Title FL still unlit", "Why is On
// Time Moving & Storage Unlit", "Why is Gulf Coast Realty just lit even though
// they're a customer of ours". Three questions with one answer: `status` is a field
// a human types. Nothing has ever compared it to the facts already on the record, so
// it is only as current as the last person who remembered to change it. On Time
// Moving carries a $7,000 quote dated 2026-07-17 and reads "unlit"; Omega Title was
// met 2026-07-28 (two of its people are `warm` with that met date on them) and the
// org above them reads "unlit". Both are wrong against the definitions that ship in
// lib/types.ts:4-7 — not wrong by opinion.
//
// This module computes the status a record's OWN fields justify, and names the field
// that justifies it. It does not write. Nothing here changes a stored status: the
// point is to show Rob the disagreement and let him rule, not to quietly overwrite a
// judgement he may have made for a reason the columns cannot see.
//
// CR-3: the ladder is code, with explicit thresholds, so two runs on one record agree.
// No clock — every input is a stored fact, so no `now()` and no time parameter.

import type { NodeStatus, Person } from "./types";

/** The record fields this ladder reads. A `Person` satisfies it; so does an org row. */
export interface StatusFacts {
  status: NodeStatus;
  signed?: boolean;
  quotedAmount?: number;
  keyDates?: { met?: string; quoted?: string; signed?: string; invoiced?: string; paid?: string };
}

export interface JustifiedStatus {
  /** The status the record's own fields support. */
  status: NodeStatus;
  /** Plain sentence naming the field that decided it — Rob reads this, not the code. */
  reason: string;
  /** Every fact that fed the decision, as "field=value". Never a summary, never a guess. */
  evidence: string[];
}

const RANK: Record<NodeStatus, number> = { unlit: 0, warm: 1, lit: 2 };

function facts(r: StatusFacts): string[] {
  const k = r.keyDates ?? {};
  const out: string[] = [];
  if (r.signed) out.push("signed=true");
  for (const f of ["paid", "invoiced", "signed", "quoted", "met"] as const) {
    if (k[f]) out.push(`keyDates.${f}=${k[f]}`);
  }
  if (typeof r.quotedAmount === "number" && r.quotedAmount > 0) {
    out.push(`quotedAmount=${r.quotedAmount}`);
  }
  return out;
}

/**
 * What the record's own fields justify.
 *
 * The ladder, top rung wins (lib/types.ts:4-7 is the authority for each rung's meaning):
 *   lit   ← paid, or invoiced, or signed=true / a signed date. "signed / paying".
 *   warm  ← quoted (amount or date), met, or any member person already warm/lit.
 *           "in conversation, quoted, or personally close".
 *   unlit ← no such fact on the record. "known about, not yet activated".
 *
 * `members` are the people attached to an org. A company whose people have been met is
 * in conversation whatever the company row says — that is the Omega case exactly.
 */
export function justifiedStatus(record: StatusFacts, members: readonly StatusFacts[] = []): JustifiedStatus {
  const k = record.keyDates ?? {};
  const evidence = facts(record);

  if (k.paid) return { status: "lit", reason: `paid ${k.paid}`, evidence };
  if (k.invoiced) return { status: "lit", reason: `invoiced ${k.invoiced}`, evidence };
  if (record.signed || k.signed) {
    return { status: "lit", reason: k.signed ? `signed ${k.signed}` : "signed=true", evidence };
  }

  if (typeof record.quotedAmount === "number" && record.quotedAmount > 0) {
    return { status: "warm", reason: `quoted $${record.quotedAmount.toLocaleString("en-US")}`, evidence };
  }
  if (k.quoted) return { status: "warm", reason: `quoted ${k.quoted}`, evidence };
  if (k.met) return { status: "warm", reason: `met ${k.met}`, evidence };

  // The org rung: warmth on the people is warmth on the company. Report WHICH member
  // carried it, with their own met date, so the claim is checkable on one more click.
  const warmMember = members.find((m) => RANK[m.status] > 0);
  if (warmMember) {
    const met = warmMember.keyDates?.met;
    const memberEvidence = facts(warmMember).map((e) => `member.${e}`);
    return {
      status: "warm",
      reason: met ? `a person here was met ${met}` : "a person here is already warm or lit",
      evidence: [...evidence, ...memberEvidence],
    };
  }

  return { status: "unlit", reason: "no meeting, quote, signature or payment on the record", evidence };
}

export type DriftKind = "understated" | "overstated";

export interface StatusDrift {
  stored: NodeStatus;
  justified: NodeStatus;
  kind: DriftKind;
  reason: string;
  evidence: string[];
  /** True only for `understated`. See below — this is the honesty gate, not decoration. */
  assertable: boolean;
}

/**
 * Stored status vs justified status. `null` when they agree.
 *
 * The two directions are NOT symmetric and this module refuses to pretend they are:
 *
 *  - **understated** (stored below justified) is a provable defect. The record itself
 *    holds a quote or a signature or a met date; there is no reading of lib/types.ts
 *    under which it is still "known about, not yet activated". Assertable.
 *
 *  - **overstated** (stored above justified) is NOT provably wrong. `lit` also means
 *    "actively referring", and no column on this record records a referral. A record
 *    Rob lit because someone sends him work will always look overstated here. It is
 *    reported so it can be looked at, and flagged `assertable: false` so nothing
 *    downstream can print it as an error.
 */
export function statusDrift(record: StatusFacts, members: readonly StatusFacts[] = []): StatusDrift | null {
  const j = justifiedStatus(record, members);
  if (j.status === record.status) return null;
  const kind: DriftKind = RANK[j.status] > RANK[record.status] ? "understated" : "overstated";
  return {
    stored: record.status,
    justified: j.status,
    kind,
    reason: j.reason,
    evidence: j.evidence,
    assertable: kind === "understated",
  };
}

export interface DriftReport {
  items: Array<{ id: string; name: string; drift: StatusDrift }>;
  /**
   * Does this book record membership AT ALL? False when not one row carries `orgId`.
   *
   * Q91(c). This is not a statistic, it is the precondition for the org rung. The
   * committed `data/network.json` is synthetic scaffolding (`__synthetic: true`) and
   * carries **zero** `orgId` links — so under `STORAGE_SOURCE=file` with no local
   * overlay, `byOrg` is empty for every org in the book and the member lookup returns
   * `[]` for all of them. That is indistinguishable, inside `justifiedStatus`, from an
   * org whose people are genuinely all cold. The ladder would then report `unlit`,
   * reason "no meeting, quote, signature or payment on the record", about a company
   * that was met — which is the exact Omega sentence Rob already had to ask about.
   * A badge cannot be allowed to print that as a finding, so the book states what it
   * cannot answer instead of the module guessing.
   */
  membershipKnown: boolean;
  /**
   * Org rows whose drift was WITHHELD because this book cannot answer the org rung.
   *
   * Only overstated org drift is withheld, and only when `membershipKnown` is false.
   * Understated drift survives — it is proven by fields on the record itself (a quote,
   * a signature, a payment) and members have no bearing on it. Overstated is the one
   * direction the missing membership can manufacture: stored `warm`, no member list to
   * justify it, so the ladder falls through to `unlit` and the record looks wrong when
   * the BOOK is what is incomplete. Withheld, named, and counted — never silently
   * dropped, because a suppressed row that nobody can enumerate is its own defect.
   */
  withheldForMissingMembership: string[];
}

/**
 * Convenience for a whole book of records; org members are looked up by `orgId`.
 *
 * Returns the book's own state alongside the rows, rather than a bare array, because
 * the caller cannot otherwise tell a confident `unlit` from an unanswerable one.
 */
export function driftReport(records: readonly Person[]): DriftReport {
  const byOrg = new Map<string, Person[]>();
  for (const p of records) {
    if (!p.orgId) continue;
    const list = byOrg.get(p.orgId);
    if (list) list.push(p);
    else byOrg.set(p.orgId, [p]);
  }
  const membershipKnown = byOrg.size > 0;

  const items: DriftReport["items"] = [];
  const withheldForMissingMembership: string[] = [];
  for (const r of records) {
    const drift = statusDrift(r, byOrg.get(r.id) ?? []);
    if (!drift) continue;
    const isOrg = r.entityKind === "company";
    if (!membershipKnown && isOrg && drift.kind === "overstated") {
      withheldForMissingMembership.push(r.id);
      continue;
    }
    items.push({ id: r.id, name: r.name, drift });
  }
  return { items, membershipKnown, withheldForMissingMembership };
}
