import { NextResponse } from "next/server";
import { mintVoiceToken, twilioConfigured, twilioEnv } from "@/lib/twilio";

export const dynamic = "force-dynamic";

// Voice access token for twilio-voice.js in the rep cockpit. Env-gated:
// without TWILIO_* creds this 503s and the UI never asks for it.
export async function GET() {
  const env = twilioEnv();
  if (!twilioConfigured(env)) {
    return NextResponse.json({ error: "dialer not configured" }, { status: 503 });
  }
  const token = mintVoiceToken(env, "rep", Math.floor(Date.now() / 1000));
  return NextResponse.json({ token, identity: "rep" });
}
