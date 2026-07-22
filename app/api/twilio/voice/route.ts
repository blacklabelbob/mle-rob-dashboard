import { NextResponse } from "next/server";
import { outgoingCallTwiml, twilioConfigured, twilioEnv } from "@/lib/twilio";

export const dynamic = "force-dynamic";

// TwiML endpoint the TwiML App points at: Twilio POSTs here when the browser
// device connects; we answer with a <Dial> to the requested number, recording
// enabled, completion reported to /api/webhooks/twilio-recording.
export async function POST(req: Request) {
  const env = twilioEnv();
  if (!twilioConfigured(env)) {
    return new NextResponse("dialer not configured", { status: 503 });
  }
  const form = await req.formData();
  const to = String(form.get("To") ?? "");
  if (!/^\+?[\d\s().-]{7,20}$/.test(to)) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Invalid number</Say></Response>`,
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  }
  const origin = new URL(req.url).origin;
  const twiml = outgoingCallTwiml(env, to, `${origin}/api/webhooks/twilio-recording`);
  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
