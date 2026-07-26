import { after, NextResponse } from "next/server";
import {
  buildCallActivity,
  resolveCallParty,
} from "@/lib/calls/recordingActivity";
import { deepgramConfigured, deepgramEnv } from "@/lib/calls/deepgramClient";
import {
  planTranscription,
  transcriptionLabel,
  type TranscriptionPlan,
} from "@/lib/calls/recordingTranscription";
import { transcribeRecording } from "@/lib/calls/transcribeRecording";
import { transcriptDb } from "@/lib/calls/transcriptDb";
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
//
// Q68 (c) inc.8: this route is now the ENTRY POINT to the transcription chain
// (deepgramClient → transcribeRecording → transcriptStore → transcriptDb → 0021).
// TRANSCRIPTION RUNS IN `after()`, NEVER INLINE, and that is a correctness choice
// rather than a latency one: Twilio gives a webhook ~15s and treats anything slower
// as a failure, while Deepgram is allowed 20s (deepgramClient). Awaiting it would
// let a *successful* filing time out, and Twilio's re-POST would re-bill Deepgram
// for a recording already being transcribed. The response contract is about the
// activity, which is durable before we answer.
//
// The cost of `after()` is stated, not hidden: nothing retries what happens in
// there. A database failure during the transcript write leaves NO transcript row
// (inc.7's stated trade) and Twilio will never ask again — so it is logged loudly
// rather than swallowed.
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

  // `filed` is threaded into the plan rather than assumed: an unfiled call is not
  // transcribed, because its transcript would carry a derived activity_id pointing at
  // an activity that does not exist (lib/calls/recordingTranscription.ts states why).
  const plan = (filed: boolean): TranscriptionPlan =>
    planTranscription({
      configured: deepgramConfigured(deepgramEnv()),
      filed,
      recordingSid: payload.recordingSid,
      recordingUrl: payload.recordingUrl,
    });

  const resolution = resolveCallParty(people, payload, [env.callerId]);
  if (resolution.kind !== "resolved") {
    console.warn(
      "[twilio-recording] not filed",
      JSON.stringify({ resolution, callSid: payload.callSid, recordingSid: payload.recordingSid })
    );
    return NextResponse.json({
      ok: true,
      persisted: false,
      resolution,
      transcription: transcriptionLabel(plan(false)),
      activity: payload,
    });
  }

  const activity = buildCallActivity(payload, resolution, new Date().toISOString());
  if (!activity) {
    console.warn("[twilio-recording] no recording sid — refusing an unstable id");
    return NextResponse.json({
      ok: true,
      persisted: false,
      resolution: { kind: "unmatched", reason: "no-recording-sid" },
      transcription: transcriptionLabel(plan(false)),
      activity: payload,
    });
  }

  try {
    await getStore().upsertActivity(activity);
  } catch (e) {
    console.error("[twilio-recording] activity save failed", e);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }

  // The call is on the timeline. Words come after the response — see the header note.
  const transcription = plan(true);
  if (transcription.kind === "transcribe") {
    after(async () => {
      try {
        const result = await transcribeRecording(transcriptDb(), {
          recordingSid: transcription.recordingSid,
          recordingUrl: transcription.recordingUrl,
        });
        console.log(
          "[twilio-recording] transcription",
          JSON.stringify({ recordingSid: transcription.recordingSid, result })
        );
      } catch (e) {
        // Nothing will ask again — this log is the only trace the call ever had words.
        console.error(
          "[twilio-recording] transcription failed",
          transcription.recordingSid,
          e
        );
      }
    });
  }

  return NextResponse.json({
    ok: true,
    persisted: true,
    id: activity.id,
    transcription: transcriptionLabel(transcription),
    activity,
  });
}
