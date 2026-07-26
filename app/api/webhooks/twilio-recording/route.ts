import { NextResponse } from "next/server";
import {
  buildCallActivity,
  resolveCallParty,
} from "@/lib/calls/recordingActivity";
import { getStore } from "@/lib/storage";
import {
  recordingToActivity,
  twilioEnv,
  validateTwilioSignature,
} from "@/lib/twilio";

export const dynamic = "force-dynamic";

// Recording-completed webhook. Signature-checked when TWILIO_AUTH_TOKEN is set
// (always set it in prod alongside the other creds). Q68 (a): a resolved call
// is now PERSISTED as a `dialer` activity on the contact's timeline; the
// decisions (whose call it is, what id it carries) live in
// lib/calls/recordingActivity.ts per CR-3.
//
// Status codes are chosen around Twilio's retry-on-non-2xx behaviour:
// a permanent condition (unknown number, both sides in the CRM, no recording
// sid) answers 200 with `persisted:false` — no retry will ever make it
// resolvable — while a storage failure answers 500 so the retry is used for
// the one case it can fix.
export async function POST(req: Request) {
  const env = twilioEnv();
  // No auth token → dialer isn't set up; never accept unsigned payloads.
  if (!env.authToken) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  let params: Record<string, string>;
  try {
    const form = await req.formData();
    params = Object.fromEntries(
      [...form.entries()].map(([k, v]) => [k, String(v)]),
    );
  } catch {
    return NextResponse.json({ error: "expected form-encoded body" }, { status: 400 });
  }
  const signature = req.headers.get("x-twilio-signature") ?? "";
  if (!validateTwilioSignature(env.authToken, req.url, params, signature)) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  const payload = recordingToActivity(params);

  let people;
  try {
    people = (await getStore().getNetwork()).people;
  } catch (e) {
    // The CRM is unreadable, not the call unfileable — let Twilio retry.
    console.error("[twilio-recording] network read failed", e);
    return NextResponse.json({ error: "storage unavailable" }, { status: 500 });
  }

  const resolution = resolveCallParty(people, payload, [env.callerId]);
  if (resolution.kind !== "resolved") {
    console.warn(
      "[twilio-recording] not filed",
      JSON.stringify({ resolution, callSid: payload.callSid, recordingSid: payload.recordingSid })
    );
    return NextResponse.json({ ok: true, persisted: false, resolution, activity: payload });
  }

  const activity = buildCallActivity(payload, resolution, new Date().toISOString());
  if (!activity) {
    console.warn("[twilio-recording] no recording sid — refusing an unstable id");
    return NextResponse.json({
      ok: true,
      persisted: false,
      resolution: { kind: "unmatched", reason: "no-recording-sid" },
      activity: payload,
    });
  }

  try {
    await getStore().upsertActivity(activity);
  } catch (e) {
    console.error("[twilio-recording] activity save failed", e);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, persisted: true, id: activity.id, activity });
}
