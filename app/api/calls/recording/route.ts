import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import { callActivityId } from "@/lib/calls/recordingActivity";
import { parseRecordingSid } from "@/lib/calls/transcriptResponse";
import { mediaCredential, proxyResponse, upstreamRequest } from "@/lib/calls/recordingProxy";

/**
 * Q68 inc.30 — THE MEDIA PROXY, WIRED. The route inc.28 pointed the player at and inc.29
 * built the seam for:
 *
 *   ?sid=RE…  →  activities row  →  upstreamRequest  →  api.twilio.com  →  proxyResponse  →  bytes
 *
 * Every decision already lives in `lib/calls/recordingProxy.ts` (CR-3). What is left here is
 * I/O and the three things only a handler can get wrong:
 *
 *  1. THE URL IS READ FROM THE ROW, NEVER FROM THE REQUEST. inc.28 rule 2: `?url=` is an
 *     SSRF primitive with our Twilio credential attached. The sid names a row we already
 *     wrote; the row names the host; `upstreamRequest` re-checks it anyway.
 *
 *  2. THE BODY IS STREAMED, NEVER BUFFERED. `await res.arrayBuffer()` would hold an entire
 *     call in function memory and defeat rule 3's ranges at the same time — the rep would
 *     wait for the whole recording before the first second played, on every seek.
 *
 *  3. NOTHING ABOUT THE CREDENTIAL IS LOGGED. The log line carries the sid, the upstream
 *     status and our answer; the built headers never go near it.
 *
 * NOT DEPLOYED WITH THIS INCREMENT. These bytes are verbatim customer speech and prod is
 * unauthenticated by Rob's 7/21 call (Q64). It ships with Q64's answer, behind the same gate
 * as the transcript route and the timeline surface.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 400, not 404: an ill-formed sid is a malformed request, and answering "not found" would
  // make this endpoint a probe that distinguishes real recording sids from typos.
  const sid = parseRecordingSid(req.nextUrl.searchParams.get("sid"));
  if (!sid) {
    return NextResponse.json({ error: "sid must be a Twilio recording SID" }, { status: 400 });
  }

  const id = callActivityId({ recordingSid: sid });
  if (!id) {
    return NextResponse.json({ error: "no recording for this call" }, { status: 404 });
  }

  let recordingUrl: string | null = null;
  try {
    const activities = await getStore().listActivities();
    recordingUrl = activities.find((a) => a.id === id)?.recordingUrl ?? null;
  } catch (e) {
    // 503, never 404: a failed read must not be rendered as "this call has no recording"
    // (inc.28 rule 4 — unplayable is not absent — one layer down).
    console.error("calls.recording.lookup failed", {
      sid,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "recording unavailable" }, { status: 503 });
  }

  const upstream = upstreamRequest({
    storedUrl: recordingUrl,
    credential: mediaCredential(process.env),
    // Verbatim. A Range we re-derive is a Range that can disagree with the one the player
    // measures the response against (inc.29 rule 3).
    range: req.headers.get("range"),
  });
  if (upstream.kind === "refused") {
    console.warn(JSON.stringify({ at: "calls.recording", sid, refused: upstream.reason, status: upstream.status }));
    return NextResponse.json({ error: upstream.reason }, { status: upstream.status });
  }

  let res: Response;
  try {
    res = await fetch(upstream.url, { headers: upstream.headers, cache: "no-store" });
  } catch (e) {
    // Their outage is our 502 — not our 401 and not a silent empty body.
    console.error("calls.recording.fetch failed", {
      sid,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "twilio media unreachable" }, { status: 502 });
  }

  const mapped = proxyResponse({ status: res.status, header: (n) => res.headers.get(n) });
  console.log(JSON.stringify({ at: "calls.recording", sid, upstream: res.status, answer: mapped.status }));
  if (mapped.kind === "error") {
    // The upstream body is discarded on purpose: a Twilio error page piped into an <audio>
    // element is a player that loads "successfully" and is silent forever.
    return NextResponse.json({ error: mapped.reason }, { status: mapped.status });
  }

  return new NextResponse(res.body, { status: mapped.status, headers: mapped.headers });
}
