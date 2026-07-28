import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import { decideSignal } from "@/lib/phases/signalIntake";
import { rowPatch } from "@/lib/phases/componentStateRow";
import { livePhaseComponentDb } from "@/lib/phases/componentStateDb";
import {
  PHASE_SIGNAL_HEADER,
  phaseSignalConfigured,
  phaseSignalEnv,
  resolveSignalCustomer,
  signalHttp,
  signalStorageFailure,
  verifyPhaseSignalSecret,
} from "@/lib/phases/signalGate";

export const dynamic = "force-dynamic";

// Q40 leg (4) inc.4 — the phase component signal endpoint.
// Contract: docs/plans/PHASE-SIGNAL-WEBHOOK-CONTRACT.md (v1).
//
// Rob (dump 7.22.26-3): "in order for those elements of each Phase to toggle
// over to live, a signal has to be sent from my partners tools." This is the
// door that signal arrives at. It decides NOTHING: inc.1 decides whether the
// signal applies, inc.2 what row it writes, inc.3 how that row reaches Postgres,
// inc.4's gate maps outcomes to statuses. This file is plumbing between them,
// which is exactly what makes the refund-clock and idempotency rules testable
// without a partner or an HTTP server in the room.
export async function POST(req: Request) {
  const env = phaseSignalEnv();
  if (!phaseSignalConfigured(env)) {
    return NextResponse.json({ error: "phase signal webhook not configured" }, { status: 503 });
  }

  // SECRET BEFORE BODY, deliberately. The 400s below name the offending field —
  // that is the contract, and it is the right answer for the partner. It is the
  // wrong answer for an unauthenticated caller, who would otherwise be able to
  // map our payload schema field by field off the error messages.
  const secret = req.headers.get(PHASE_SIGNAL_HEADER) ?? "";
  if (!verifyPhaseSignalSecret(env.webhookSecret!, secret)) {
    return NextResponse.json({ error: "bad secret" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, applied: false, field: "body", error: "expected JSON body" },
      { status: 400 },
    );
  }

  // The customer has to be resolved before the decider runs, because
  // `customerKnown` is one of its two inputs. Reading the network for an
  // unparseable body would be work thrown away, so this sits after the parse.
  const customerId =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? String((payload as Record<string, unknown>).customerId ?? "")
      : "";
  let customer: { known: boolean; name?: string };
  try {
    const data = await getStore().getNetwork();
    customer = resolveSignalCustomer(data, customerId);
  } catch (e) {
    // A failed network read is NOT "we don't know this customer". Deciding
    // against a swallowed read would answer 200/unknown_customer for a customer
    // we hold, and the partner would never resend it.
    return respond(signalStorageFailure("read", (e as Error).message));
  }

  const db = livePhaseComponentDb();

  // The decision must be made against the SAME row we then write against, so the
  // read happens here and is handed to both `decideSignal` and `rowPatch`.
  let current;
  try {
    const phase = (payload as Record<string, unknown>)?.phase;
    const component = String((payload as Record<string, unknown>)?.componentId ?? "");
    current =
      (phase === 1 || phase === 2 || phase === 3) && component
        ? await db.fetchState(customerId, phase, component)
        : null;
  } catch (e) {
    return respond(signalStorageFailure("read", (e as Error).message));
  }

  const decision = decideSignal(payload, {
    customerKnown: customer.known,
    stored: current
      ? {
          liveAt: current.live_at,
          everLiveAt: current.ever_live_at,
          lastSignalAt: current.last_signal_at,
          seenEventIds: current.seen_event_ids,
        }
      : undefined,
  });

  if (decision.outcome === "applied") {
    try {
      await db.writeState(rowPatch(decision, current), new Date().toISOString());
    } catch (e) {
      // 500 on purpose — see `signalStorageFailure`. The light did not land; we
      // want the retry, and `seenEventIds` makes the retry safe.
      console.error("[phase-signal] WRITE FAILED", decision.eventId, (e as Error).message);
      return respond(signalStorageFailure("write", (e as Error).message));
    }
    console.log(
      "[phase-signal] APPLIED",
      decision.eventId,
      `${customer.name ?? decision.customerId} / P${decision.phase} ${decision.componentId} → ${decision.status}`,
      decision.startsRefundWindow ? "(REFUND WINDOW STARTS)" : "",
      decision.attention ?? "",
    );
  } else if (decision.outcome === "not_applied") {
    console.log("[phase-signal] NOT APPLIED", decision.reason, decision.detail);
  }

  return respond(signalHttp(decision));
}

function respond(r: { status: number; body: Record<string, unknown> }) {
  return NextResponse.json(r.body, { status: r.status });
}
