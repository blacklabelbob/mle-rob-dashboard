import { NextRequest, NextResponse } from "next/server";
import { readTranscriptView } from "@/lib/calls/transcriptRead";
import { transcriptReader } from "@/lib/calls/transcriptDb";
import {
  parseRecordingSid,
  transcriptReadLog,
  transcriptResponse,
} from "@/lib/calls/transcriptResponse";

/**
 * Q68 (b) inc.17 — the transcript read route. The last hop of the read path:
 *
 *   ?recordingSid=RE…  →  supabaseTranscriptReader  →  loadTranscript  →  transcriptView
 *
 * Store I/O only; every decision lives in lib/calls/* (CR-3). It reads; it never writes.
 *
 * A QUERY PARAMETER, NOT A PATH SEGMENT — same idiom as `/api/views/page`, and it keeps the
 * sid inside a validator (`parseRecordingSid`) that runs before a connection is opened
 * rather than inside a route matcher that would accept anything and hand it to Postgres.
 *
 * NOT DEPLOYED WITH THIS INCREMENT. This route returns verbatim customer speech, and prod
 * is unauthenticated by Rob's 7/21 call (Q64). It ships with Q64's answer, behind the same
 * gate as inc.14's timeline surface — the code lands now so the gate is the only thing left.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const recordingSid = parseRecordingSid(req.nextUrl.searchParams.get("recordingSid"));
  // 400, not 404: an ill-formed sid is a malformed request, and answering "not found" for
  // it would make the endpoint a probe that distinguishes real sids from typos.
  if (!recordingSid) {
    return NextResponse.json({ error: "recordingSid must be a Twilio recording SID" }, { status: 400 });
  }

  let result;
  try {
    result = await readTranscriptView(transcriptReader(), recordingSid);
  } catch (e) {
    // A read failure is 503, never an empty transcript: "the query broke" must not be
    // rendered as "this call was never transcribed" (inc.16's fetchTranscript header).
    console.error("calls.transcript.read failed", {
      recordingSid,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "transcript unavailable" }, { status: 503 });
  }

  const { view, load } = result;
  console.log(JSON.stringify(transcriptReadLog(recordingSid, view, load)));
  return NextResponse.json(transcriptResponse(recordingSid, view, load));
}
