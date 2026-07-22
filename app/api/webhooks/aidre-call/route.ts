import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import {
  aidreConfigured,
  aidreEnv,
  callToActivity,
  matchCaller,
  verifyAidreSecret,
  type AidreCallPayload,
} from "@/lib/aidreCall";

export const dynamic = "force-dynamic";

// AIDRE call-outcome receiver (PRD Task 3.3). AIDRE POSTs each finished call
// here; phone-matched contacts get a type=call, source=aidre activity on their
// timeline. Secret-checked via x-aidre-secret; no AIDRE_WEBHOOK_SECRET set →
// 503, inert. Unmatched callers return 200 ingested:false (never an anchorless
// row — 0005 requires ≥1 anchor) so AIDRE doesn't retry-loop.
export async function POST(req: Request) {
  const env = aidreEnv();
  if (!aidreConfigured(env)) {
    return NextResponse.json(
      { error: "AIDRE call capture not configured" },
      { status: 503 }
    );
  }
  const secret = req.headers.get("x-aidre-secret") ?? "";
  if (!verifyAidreSecret(env.webhookSecret!, secret)) {
    return NextResponse.json({ error: "bad secret" }, { status: 403 });
  }

  let payload: AidreCallPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  if (!payload?.callId || !payload?.callerNumber) {
    return NextResponse.json(
      { error: "callId and callerNumber are required" },
      { status: 400 }
    );
  }

  const store = getStore();
  const data = await store.getNetwork();
  const match = matchCaller(data, payload);
  if (!match) {
    console.log("[aidre-call] no caller match", payload.callId, payload.callerNumber);
    return NextResponse.json({
      ok: true,
      ingested: false,
      reason: "no caller match",
    });
  }

  const activity = callToActivity(payload, match, new Date().toISOString());
  await store.upsertActivity(activity);
  console.log(
    "[aidre-call] ingested",
    payload.callId,
    "→",
    activity.personId ? `person:${activity.personId}` : `org:${activity.orgId}`
  );
  return NextResponse.json({ ok: true, ingested: true, activityId: activity.id });
}
