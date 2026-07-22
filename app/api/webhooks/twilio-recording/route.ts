import { NextResponse } from "next/server";
import {
  recordingToActivity,
  twilioEnv,
  validateTwilioSignature,
} from "@/lib/twilio";

export const dynamic = "force-dynamic";

// Recording-completed webhook. Signature-checked when TWILIO_AUTH_TOKEN is set
// (always set it in prod alongside the other creds). Produces the
// activities-ready payload; persistence to the activities table arrives with
// Q9 (0004_crm_core) — until then the payload is logged so end-to-end wiring
// is verifiable from Vercel logs.
export async function POST(req: Request) {
  const env = twilioEnv();
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  // No auth token → dialer isn't set up; never accept unsigned payloads.
  if (!env.authToken) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }
  const signature = req.headers.get("x-twilio-signature") ?? "";
  if (!validateTwilioSignature(env.authToken, req.url, params, signature)) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  const activity = recordingToActivity(params);
  console.log("[twilio-recording] activity-ready payload", JSON.stringify(activity));
  return NextResponse.json({ ok: true, activity });
}
