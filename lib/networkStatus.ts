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
  /**
   * How many records this one opened the door to — `referredById` edges pointing here.
   *
   * Q91(a) inc.32. This is not a new signal, it is a signal the ladder **promised and
   * then never read**. `lib/types.ts:4-7` defines `lit` as "signed / paying / actively
   * referring" and `warm` as "in conversation, quoted, or **personally close**", and
   * this module implemented only the money half of both. `statusDrift`'s own doc said
   * "no column on this record records a referral" — that sentence was false: the
   * column is `referredById` on the OTHER row, and `/people/[id]` has been counting it
   * as `doorsOpened` the whole time.
   *
   * Measured on prod before this was added: 8 of 29 person rows drifted, every one of
   * them `overstated`, and the top of that list was **P-1001 Rob Acheson — 10 doors
   * opened**, the record that IS the origin of the network. A badge reading "worth a
   * look" on Rob's own row is the furniture failure `StatusJustification` warns about
   * in its own header, and it would have shipped the day the person page was wired.
   *
   * Omitted (`undefined`) means NOT COUNTED, and is not the same as zero. A caller
   * that cannot count edges — an org row, a fixture, `justifiedStatus` called on bare
   * facts — must leave it undefined rather than pass 0, because 0 is the assertion
   * "this record opened no doors" and only a caller holding the whole book may make it.
   */
  doorsOpened?: number;
}

export interface JustifiedStatus {
  /** The status the record's own fields support. */
  status: NodeStatus;
  /** Plain sentence naming the field that decided it — Rob reads this, not the code. */
  reason: string;
  /** Every fact that fed the decision, as "field=value". Never a summary, never a guess. */
  evidence: string[];
  /**
   * May this justification be shown to Rob as a DEFECT, or only as something to look at?
   *
   * Q91(a) inc.32. The money rungs are provable: a paid date, a signature, a quote are
   * artifacts, and no reading of lib/types.ts leaves the record below them. The
   * **referral rung is not** — `referredById` is the attribution chain (every record
   * traces back to Rob by design, `attribution-keeper`'s no-orphans rule), so an edge
   * means "this is who introduced them", which OVERLAPS with "actively referring"
   * without being the same claim. One edge on a record that merely sits in a chain is
   * not evidence of a referral relationship.
   *
   * So the rung is allowed to DEFEND a stored status and forbidden to ACCUSE one.
   * Measured on prod: without this flag it silenced the false accusation on P-1001
   * (correct) and manufactured five new assertable ones — "should be lit" off a single
   * attribution edge, on Daniella Roach, Dixith Magadiev, Gary Waskovich, John Burns
   * and Alex Greenwood. Trading one wrong badge for five is not a fix. Whether an edge
   * is an active referral is Rob's judgement; the ladder surfaces it and stops there.
   */
  provable: boolean;
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
  // Printed only when it was actually counted, and only when it is non-zero. A row
  // reading `doorsOpened=0` beside a `lit` status looks like the finding, when in fact
  // it is the absence of one — the evidence list is facts, never their absence.
  if (typeof r.doorsOpened === "number" && r.doorsOpened > 0) {
    out.push(`doorsOpened=${r.doorsOpened}`);
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

  if (k.paid) return { status: "lit", reason: `paid ${k.paid}`, evidence, provable: true };
  if (k.invoiced) return { status: "lit", reason: `invoiced ${k.invoiced}`, evidence, provable: true };
  if (record.signed || k.signed) {
    return { status: "lit", reason: k.signed ? `signed ${k.signed}` : "signed=true", evidence, provable: true };
  }

  // "actively referring" is a `lit` rung in lib/types.ts:4-7 and always has been; this
  // is where it finally gets read. It sits BELOW the money rungs deliberately — a paid
  // customer who also refers is lit for the reason Rob cares about first — and above
  // `quoted`, because a record that has opened doors is further along than one merely
  // quoted. Counted-and-zero falls straight through, exactly like an absent field.
  if (typeof record.doorsOpened === "number" && record.doorsOpened > 0) {
    const n = record.doorsOpened;
    return {
      status: "lit",
      reason: `opened ${n} ${n === 1 ? "door" : "doors"} in the network`,
      evidence,
      // The one rung that may not accuse — see JustifiedStatus.provable.
      provable: false,
    };
  }

  if (typeof record.quotedAmount === "number" && record.quotedAmount > 0) {
    return { status: "warm", reason: `quoted $${record.quotedAmount.toLocaleString("en-US")}`, evidence, provable: true };
  }
  if (k.quoted) return { status: "warm", reason: `quoted ${k.quoted}`, evidence, provable: true };
  if (k.met) return { status: "warm", reason: `met ${k.met}`, evidence, provable: true };

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
      provable: true,
    };
  }

  return { status: "unlit", reason: "no meeting, quote, signature or payment on the record", evidence, provable: true };
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
 *  - **overstated** (stored above justified) is NOT provably wrong, and stays
 *    `assertable: false` so nothing downstream can print it as an error.
 *
 *    ⚠️ This clause used to read "`lit` also means 'actively referring', and no column
 *    on this record records a referral." **The second half was false and is corrected
 *    here (inc.32), not quietly deleted** — the referral IS recorded, as
 *    `referredById` on the row that was referred, which `/people/[id]` has been
 *    counting as `doorsOpened` since long before this module existed. The ladder now
 *    reads it (`StatusFacts.doorsOpened`), so "Rob lit them because they send him
 *    work" is justified rather than merely excused. What remains genuinely
 *    unprovable is warmth with no artifact at all — "personally close" — which no
 *    column holds, so overstated stays non-assertable for that reason and only that
 *    reason.
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
    // Two gates, both required. `understated` is the direction that CAN be proven;
    // `j.provable` is whether THIS rung proved it. The referral rung reaches only the
    // second — it may defend a stored `lit`, never accuse a stored `warm`.
    assertable: kind === "understated" && j.provable,
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

  // Doors opened, counted once for the whole book. `driftReport` is the only caller
  // that may supply `doorsOpened` at all, because it is the only one holding every row
  // — counting edges from a partial list would understate a connector and print the
  // accusation this rung exists to prevent.
  const doors = new Map<string, number>();
  for (const p of records) {
    if (!p.referredById) continue;
    doors.set(p.referredById, (doors.get(p.referredById) ?? 0) + 1);
  }

  const items: DriftReport["items"] = [];
  const withheldForMissingMembership: string[] = [];
  for (const r of records) {
    const drift = statusDrift({ ...r, doorsOpened: doors.get(r.id) ?? 0 }, byOrg.get(r.id) ?? []);
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
