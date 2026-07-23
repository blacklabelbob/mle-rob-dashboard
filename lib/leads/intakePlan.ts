// Task 5.1 lead-intake planner (pure, CR-3): a validated AIDRE/AIVA payload
// plus the current ledger in → an exact plan out (match-or-create person,
// open deal at INTAKE_STAGE, one intake activity). No network, no clock —
// `now` is passed in, so the same input always yields a JSON-identical plan.
// The route (POST /api/leads) authenticates, parses with parseLeadIntake,
// then EXECUTES this plan verbatim — it never invents ops of its own.
//
// Matching philosophy inherited from the Task 3.5 matcher: only exact-after-
// normalization email/phone signals attach a lead to an existing record.
// A name-only collision CREATES a new person — attaching "John Smith the
// roofer" to an unrelated John Smith would corrupt Rob's real network, while
// the duplicate row the create leaves behind surfaces in the nightly dedup
// review queue (Task 3.5/4.2), which is the designed safety net.

import type { Activity, Deal, Person } from "@/lib/types";
import { isDemo } from "@/lib/stats";
import {
  findDuplicatePairs,
  type DedupPair,
  type DedupSignal,
} from "@/lib/dedup/match";
import { describeIntakeSource } from "./sourceContext";
import { INTAKE_STAGE, type LeadIntakePayload } from "./intakePayload";

// Placeholder id for the incoming lead in the matcher pass; slugs are
// lowercase, so this can never collide with a real ledger id.
const INCOMING = "__INCOMING_LEAD__";

export interface IntakeMatch {
  personId: string;
  matchedName: string;
  signals: DedupSignal[];
  evidence: string[];
  /** Contact-only empty-field fills (whitelist below) — never money/status. */
  fills: Partial<Person>;
}

export interface IntakePlan {
  person:
    | { action: "create"; record: Person }
    | { action: "match"; match: IntakeMatch };
  deal: Deal;
  activity: Activity;
  /** Free-text vertical that didn't map to the registry (route flags it). */
  verticalUnmatched?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextId(name: string, taken: Set<string>): string {
  const base = slugify(name) || "lead";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

// The ONLY fields a match may write, and only into empty slots — same
// posture as the merge planner's fold whitelist (money is structurally
// unreachable: quotedAmount/signed/estimate simply aren't in this list).
const FILL_WHITELIST = ["phone", "email", "role", "business"] as const;

function contactFills(existing: Person, payload: LeadIntakePayload): Partial<Person> {
  const incoming: Partial<Person> = {
    phone: payload.contact.phone,
    email: payload.contact.email,
    role: payload.contact.role,
    business: payload.company,
  };
  const fills: Partial<Person> = {};
  for (const f of FILL_WHITELIST) {
    const have = existing[f];
    const want = incoming[f];
    if ((have === undefined || have === "") && want !== undefined && want !== "") {
      fills[f] = want;
    }
  }
  return fills;
}

// Deterministic best match: strongest signal wins (email > phone), then the
// lexicographically smallest id, so re-runs on the same ledger never flap.
function pickMatch(pairs: DedupPair[]): DedupPair | null {
  const strong = pairs.filter(
    (p) =>
      (p.aId === INCOMING || p.bId === INCOMING) &&
      (p.signals.includes("email-exact") || p.signals.includes("phone-exact"))
  );
  if (!strong.length) return null;
  const rank = (p: DedupPair) => (p.signals.includes("email-exact") ? 0 : 1);
  strong.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const aOther = a.aId === INCOMING ? a.bId : a.aId;
    const bOther = b.aId === INCOMING ? b.bId : b.aId;
    return aOther < bOther ? -1 : 1;
  });
  return strong[0];
}

// Task 5.2 idempotency: with a client Idempotency-Key, deal/activity ids
// derive from (product, key) instead of (personId, now) — so a retried
// submit targets the SAME rows, and the deal row itself is the idempotency
// record (the route sees it already exists and writes nothing). Product in
// the id scopes keys per caller: AIDRE's "abc" can never collide with AIVA's.
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{1,100}$/;

export function intakeIds(product: string, idempotencyKey: string) {
  const slug = idempotencyKey.toLowerCase();
  return {
    dealId: `lead-${product}-${slug}`,
    activityId: `lead-act-${product}-${slug}`,
  };
}

export function planLeadIntake(
  payload: LeadIntakePayload,
  existing: Person[],
  verticals: { id: string; name: string }[],
  now: string,
  idempotencyKey?: string
): IntakePlan {
  // Vertical: free text mapped against the registry by id or normalized name;
  // no match → recorded honestly as unmatched, never guessed.
  let verticalId: string | undefined;
  let verticalUnmatched: string | undefined;
  if (payload.vertical) {
    const norm = slugify(payload.vertical);
    const hit = verticals.find((v) => v.id === norm || slugify(v.name) === norm);
    if (hit) verticalId = hit.id;
    else verticalUnmatched = payload.vertical;
  }

  // Matcher pass vs the real ledger (demo rows excluded — attaching a real
  // lead to seeded demo data would be fiction).
  const ledger = existing
    .filter((p) => !isDemo(p))
    .map((p) => ({ id: p.id, name: p.name, email: p.email, phone: p.phone }));
  const pairs = findDuplicatePairs([
    ...ledger,
    {
      id: INCOMING,
      name: payload.contact.name,
      email: payload.contact.email,
      phone: payload.contact.phone,
    },
  ]);
  const best = pickMatch(pairs);

  let person: IntakePlan["person"];
  let personId: string;
  if (best) {
    personId = best.aId === INCOMING ? best.bId : best.aId;
    const matched = existing.find((p) => p.id === personId)!;
    person = {
      action: "match",
      match: {
        personId,
        matchedName: matched.name,
        signals: best.signals,
        evidence: best.evidence,
        fills: contactFills(matched, payload),
      },
    };
  } else {
    const taken = new Set(existing.map((p) => p.id));
    personId = nextId(payload.contact.name, taken);
    person = {
      action: "create",
      record: {
        id: personId,
        name: payload.contact.name,
        entityKind: "person",
        business: payload.company,
        role: payload.contact.role,
        verticalId: verticalId ?? "",
        phone: payload.contact.phone,
        email: payload.contact.email,
        status: "unlit", // no door opened yet — import-default convention
        signed: false,
        keyDates: {},
        phaseOne: "not-started",
        notes: `[lead: ${payload.product}]`, // Q35 [import: tag] convention
        assignedRep: payload.assigned_rep,
      },
    };
  }

  // Ids: (product, Idempotency-Key) when the caller sent one (Task 5.2 —
  // retries hit the same rows), else (personId, now) as before.
  const stamp = now.replace(/[^0-9]/g, "").slice(0, 14);
  const ids = idempotencyKey ? intakeIds(payload.product, idempotencyKey) : undefined;
  const deal: Deal = {
    id: ids?.dealId ?? `lead-${personId}-${stamp}`,
    personId,
    verticalId,
    ownerId: payload.assigned_rep,
    name: `${payload.product.toUpperCase()} lead — ${payload.contact.name}`,
    stage: INTAKE_STAGE,
    referralSourced: false,
    keyDates: {},
    bookProtected: false,
    createdAt: now,
    updatedAt: now,
  };

  // ActivitySource has no "aiva" value yet — AIVA rides the generic "api"
  // channel; the true product always lives in sourceContext.product.
  const activity: Activity = {
    id: ids?.activityId ?? `lead-act-${personId}-${stamp}`,
    personId,
    dealId: deal.id,
    type: "note",
    source: payload.product === "aidre" ? "aidre" : "api",
    sourceContext: {
      ...payload.source_context,
      product: payload.product,
      ...(payload.demo ? { demo: payload.demo } : {}),
      ...(payload.assigned_rep ? { assigned_rep: payload.assigned_rep } : {}),
    },
    summary: `${payload.product.toUpperCase()} lead intake — ${describeIntakeSource(payload.source_context)}`,
    bookProtected: false,
    occurredAt: now,
    createdAt: now,
  };

  return verticalUnmatched
    ? { person, deal, activity, verticalUnmatched }
    : { person, deal, activity };
}
