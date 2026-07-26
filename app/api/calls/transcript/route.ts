import { NextRequest, NextResponse } from "next/server";
import { readTranscriptView } from "@/lib/calls/transcriptRead";
import { transcriptReader } from "@/lib/calls/transcriptDb";
import {
  parseRecordingSid,
  transcriptReadLog,
  transcriptResponse,
} from "@/lib/calls/transcriptResponse";
import {
  parseSearchQuery,
  searchQueryError,
  searchSection,
  transcriptSearchLog,
} from "@/lib/calls/transcriptSearchResponse";

/**
 * Q68 (b) inc.17 — the transcript read route. The last hop of the read path:
 *
 *   ?recordingSid=RE…  →  supabaseTranscriptReader  →  loadTranscript  →  transcriptView
 *
 * inc.24 adds the optional `&q=` — moment search over the SAME load, never a second read, so
 * the moments a caller is shown are moments of the transcript it was handed in the same body.
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

  // Refused BEFORE the read: an unanswerable question must not cost a database query, and a
  // 400 that arrives after a successful transcript read is a 400 nobody can distinguish from
  // "the call is missing".
  const query = parseSearchQuery(req.nextUrl.searchParams.get("q"));
  if (query.kind === "invalid") {
    return NextResponse.json({ error: searchQueryError(query.reason) }, { status: 400 });
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
  const search = searchSection(view, load, query);
  console.log(
    JSON.stringify({
      ...transcriptReadLog(recordingSid, view, load),
      ...(search ? transcriptSearchLog(search) : {}),
    })
  );
  return NextResponse.json({
    ...transcriptResponse(recordingSid, view, load),
    // Absent `q` means no `search` key — a caller must not render "0 results" for a question
    // nobody asked (transcriptSearchResponse rule 1).
    ...(search ? { search } : {}),
  });
}
