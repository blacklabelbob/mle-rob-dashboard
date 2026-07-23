import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import { parseLeadIntake } from "@/lib/leads/intakePayload";
import { IDEMPOTENCY_KEY_RE, intakeIds, planLeadIntake } from "@/lib/leads/intakePlan";
import { checkRateLimit } from "@/lib/leads/rateLimit";
import {
  bearerToken,
  leadKeysFromEnv,
  leadsConfigured,
  productsForToken,
} from "@/lib/leads/intakeAuth";

export const dynamic = "force-dynamic";

// PRD Task 5.1 — AIDRE/AIVA lead intake. Per-product bearer tokens
// (LEADS_KEY_AIDRE / LEADS_KEY_AIVA; none set → 503, fully inert) →
// parseLeadIntake (Task 1.11 envelope, reports every problem) →
// planLeadIntake (pure planner, CR-3) → this route executes the plan
// VERBATIM via the store — it never invents ops of its own.
// Missing/wrong token → 401 (DoD); a token for the wrong product → 401 too
// (an AIDRE key can't submit AIVA leads).
//
// Task 5.2 layers on top:
// - Rate-limit: sliding window per authenticated product (pure lib, clock
//   injected); over the limit → 429 + Retry-After. Counted post-auth so an
//   unauthenticated flood can't starve a product's real quota.
// - Idempotency: optional Idempotency-Key header. Deal/activity ids derive
//   from (product, key), so the deal row IS the idempotency record — a retry
//   finds it in the ledger, WRITES NOTHING, and returns 200 replayed:true.
//   No side table to drift; same key twice → one person, one deal, one
//   activity (the DoD), structurally.

const rateHits = new Map<string, number[]>();

// Unmatched free-text vertical is a registry finding Rob should see —
// FINDINGS PROTOCOL routes it to the flags table (Things to Address).
// Best-effort: a flag failure never fails the intake itself.
async function flagUnmatchedVertical(personId: string, name: string, vertical: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    await createClient(url, key, { auth: { persistSession: false } })
      .from("flags")
      .insert({
        entity_id: personId,
        entity_name: name,
        title: `Lead vertical "${vertical}" not in registry`,
        detail: `Intake lead for ${name} arrived with vertical "${vertical}", which matched nothing in the vertical registry. The lead was stored without a vertical — assign one on the record page or add the vertical to the registry.`,
        severity: "low",
      });
  } catch (e) {
    console.log("[leads] vertical flag failed (non-fatal)", e);
  }
}

export async function POST(req: Request) {
  const keys = leadKeysFromEnv(process.env);
  if (!leadsConfigured(keys)) {
    return NextResponse.json({ error: "lead intake not configured" }, { status: 503 });
  }

  const token = bearerToken(req.headers.get("authorization"));
  const products = token ? productsForToken(keys, token) : [];
  if (products.length === 0) {
    return NextResponse.json({ error: "missing or invalid bearer token" }, { status: 401 });
  }

  const rate = checkRateLimit(rateHits, products.join(","), Date.now());
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const idempotencyKey = req.headers.get("idempotency-key")?.trim() || undefined;
  if (idempotencyKey && !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    return NextResponse.json(
      { error: "Idempotency-Key must match [A-Za-z0-9_-]{1,100}" },
      { status: 400 }
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const parsed = parseLeadIntake(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid payload", errors: parsed.errors }, { status: 400 });
  }
  const payload = parsed.payload;
  if (!products.includes(payload.product)) {
    return NextResponse.json(
      { error: `token not valid for product "${payload.product}"` },
      { status: 401 }
    );
  }

  const store = getStore();

  // Idempotent replay: if a deal with this (product, key) id already exists,
  // the first submit already landed — write nothing, echo the ids back.
  if (idempotencyKey) {
    const ids = intakeIds(payload.product, idempotencyKey);
    const prior = (await store.listDeals()).find((d) => d.id === ids.dealId);
    if (prior) {
      console.log("[leads] replay", payload.product, ids.dealId);
      return NextResponse.json(
        {
          ok: true,
          replayed: true,
          person: { action: "replay", id: prior.personId },
          dealId: ids.dealId,
          activityId: ids.activityId,
        },
        { status: 200 }
      );
    }
  }

  const { people, verticals } = await store.getNetwork();
  const plan = planLeadIntake(payload, people, verticals, new Date().toISOString(), idempotencyKey);

  // Execute the plan verbatim.
  const planPerson = plan.person;
  if (planPerson.action === "create") {
    await store.upsertPerson(planPerson.record);
  } else if (Object.keys(planPerson.match.fills).length > 0) {
    const existing = people.find((p) => p.id === planPerson.match.personId);
    if (existing) {
      await store.upsertPerson({ ...existing, ...planPerson.match.fills });
    }
  }
  await store.upsertDeal(plan.deal);
  await store.upsertActivity(plan.activity);

  if (plan.verticalUnmatched) {
    const personId =
      planPerson.action === "create" ? planPerson.record.id : planPerson.match.personId;
    await flagUnmatchedVertical(personId, payload.contact.name, plan.verticalUnmatched);
  }

  console.log(
    "[leads] intake",
    payload.product,
    plan.person.action,
    plan.deal.personId,
    plan.deal.id
  );
  return NextResponse.json(
    {
      ok: true,
      person:
        planPerson.action === "create"
          ? { action: "create", id: planPerson.record.id }
          : {
              action: "match",
              id: planPerson.match.personId,
              matchedName: planPerson.match.matchedName,
              signals: planPerson.match.signals,
            },
      dealId: plan.deal.id,
      activityId: plan.activity.id,
      ...(plan.verticalUnmatched ? { verticalUnmatched: plan.verticalUnmatched } : {}),
    },
    { status: 201 }
  );
}
