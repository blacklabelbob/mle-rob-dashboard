import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import {
  emailToActivity,
  identityGate,
  matchContact,
  n8nEmailConfigured,
  n8nEmailEnv,
  verifyN8nSecret,
  type EmailPayload,
} from "@/lib/n8nEmail";

export const dynamic = "force-dynamic";

// n8n Gmail capture endpoint (PRD Task 3.2, BUILD-QUEUE Q8). The n8n workflow
// POSTs each rob@aivoicetech.io message here; matched contacts get an
// `activities` row on their timeline. Secret-checked via x-n8n-secret; no
// N8N_EMAIL_WEBHOOK_SECRET set → 503, inert. Rejections return 200 so n8n
// never retry-loops, with the verdict logged for the identity-rule DoD
// ("boostuppayments.com mail never ingested — log-verified").
export async function POST(req: Request) {
  const env = n8nEmailEnv();
  if (!n8nEmailConfigured(env)) {
    return NextResponse.json(
      { error: "n8n email capture not configured" },
      { status: 503 }
    );
  }
  const secret = req.headers.get("x-n8n-secret") ?? "";
  if (!verifyN8nSecret(env.webhookSecret!, secret)) {
    return NextResponse.json({ error: "bad secret" }, { status: 403 });
  }

  let payload: EmailPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  if (!payload?.messageId || !payload?.from) {
    return NextResponse.json(
      { error: "messageId and from are required" },
      { status: 400 }
    );
  }

  const verdict = identityGate(payload);
  if (!verdict.ok) {
    console.log("[n8n-email] REJECTED", payload.messageId, verdict.reason);
    return NextResponse.json({ ok: true, ingested: false, reason: verdict.reason });
  }

  const store = getStore();
  const data = await store.getNetwork();
  const match = matchContact(data, payload);
  if (!match) {
    console.log("[n8n-email] no contact match", payload.messageId);
    return NextResponse.json({
      ok: true,
      ingested: false,
      reason: "no contact match",
    });
  }

  const activity = emailToActivity(payload, match, new Date().toISOString());
  await store.upsertActivity(activity);
  console.log(
    "[n8n-email] ingested",
    payload.messageId,
    "→",
    activity.personId ? `person:${activity.personId}` : `org:${activity.orgId}`
  );
  return NextResponse.json({ ok: true, ingested: true, activityId: activity.id });
}
