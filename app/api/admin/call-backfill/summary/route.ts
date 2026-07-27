import { NextRequest, NextResponse } from "next/server";
import { backfillAuthGate, parseBackfillRequest } from "@/lib/calls/backfillTrigger";
import { runSummaryPass, type SummaryPassDeps } from "@/lib/calls/summaryPass";
import { loadBackfillStates, backfillStateClient } from "@/lib/calls/backfillStateDb";
import { summarizeCall } from "@/lib/calls/summarizeCall";
import { summaryCandidate } from "@/lib/calls/summaryBackfill";
import { summaryMissingConfig, summaryTriggerResponse } from "@/lib/calls/summaryTrigger";
import { loadTranscript } from "@/lib/calls/transcriptRead";
import { transcriptReader } from "@/lib/calls/transcriptDb";
import { verifyCronAuth } from "@/lib/dedup/detector";
import { getStore } from "@/lib/storage";

/**
 * Q68 (c) inc.42 — THE SUMMARY OPERATOR TRIGGER: the last unbuilt hop on the summary branch.
 *
 *   env → summaryMissingConfig ─┐
 *   body → parseBackfillRequest ┴→ runSummaryPass(deps) → summaryTriggerResponse
 *
 * A SEPARATE PATH FROM `/api/admin/call-backfill`, not a mode field on it — the same reason
 * inc.41 refused to make this a flag on `runBackfillPass`. The two repairs spend different
 * money (transcript = Deepgram + Twilio egress over calls with no words; summary = the model
 * only, over words we already own), and on this branch the URL and the METHOD are the safety
 * rails precisely because they cannot be typo'd into each other the way a body field can.
 *
 * GET PLANS, POST SPENDS — identical to the transcript trigger, deliberately. The shape that
 * is trivially reachable from a browser bar is the one that cannot bill Anthropic for a
 * backlog, and a GET here is `execute: false` by construction rather than by a field someone
 * could forget.
 *
 * AUTH IS THE CRON BEARER, through the SHARED gate: prod is OPEN for reading by Rob's ACCESS
 * decision (2026-07-27), and this is not a read.
 *
 * `loadSegments` THROWS ON AN UNREADABLE TRANSCRIPT AND RETURNS `[]` ONLY FOR A REAL ABSENCE.
 * The distinction is inc.40 rule 4/5 wired to a real database: a vanished transcript is its
 * own outcome (`segments-missing`, no model call), while a store we could not read is a
 * FAILURE — reporting the second as the first sends an operator hunting a pruned transcript
 * that was never pruned. `loadTranscript` already throws on a genuine query failure; the
 * `unreadable` row is the one this file has to refuse to flatten.
 */

export const dynamic = "force-dynamic";

function deps(): SummaryPassDeps {
  const store = getStore();
  return {
    listActivities: () => store.listActivities(),
    loadStates: (sids) => loadBackfillStates(backfillStateClient(), sids),
    loadActivity: async (activityId) =>
      (await store.listActivities()).find((a) => a.id === activityId) ?? null,
    loadSegments: async (recordingSid) => {
      const load = await loadTranscript(transcriptReader(), recordingSid);
      if (load.kind === "unreadable") {
        throw new Error(`call transcript unreadable: ${load.reason}`);
      }
      return load.kind === "loaded" ? load.segments : [];
    },
    // The transcript gate `summarizeCall` needs is ASSERTED FROM WHAT WE JUST PROVED, not
    // invented: inc.39 only plans a call whose 0021 row is `complete` with words, and the
    // runner has just re-read a NON-EMPTY segment list for it (inc.40 rule 5). `summaryOwed`
    // reads the status alone, so the recording sid — taken from `summaryCandidate`, the one
    // place that decides where a call's sid lives — stands in for the transcript id rather
    // than a second 0021 round trip for a field nothing here consults.
    summarize: (activity, segments) =>
      summarizeCall((a) => store.upsertActivity(a), {
        activity,
        transcript: {
          kind: "stored",
          status: "complete",
          transcriptId: summaryCandidate(activity)?.recordingSid ?? "",
          segments: segments.length,
          // The words we just re-read, not a second copy: `summarizeCall` is handed the same
          // list in `segments`, and a `words` that could differ from it is how a summary
          // gets written about one delivery's speech while another's is on the row.
          words: segments,
        },
        segments,
      }),
  };
}

function gate(req: NextRequest): NextResponse | null {
  const denied = backfillAuthGate(
    req.headers.get("authorization"),
    process.env.CRON_SECRET,
    verifyCronAuth
  );
  return denied ? NextResponse.json(denied.body, { status: denied.status }) : null;
}

async function answer(execute: boolean, limit?: number) {
  const result = await runSummaryPass(deps(), {
    missingConfig: summaryMissingConfig(),
    execute,
    limit,
  });
  const res = summaryTriggerResponse(result);
  // The projection, never the result — the plan carries ids, the outcome can carry a
  // provider error.
  console.log("[call-summary-backfill]", JSON.stringify({ execute, ...res.body }));
  return NextResponse.json(res.body, {
    status: res.status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** The dry run. Reads the backlog, contacts no model, writes nothing. */
export async function GET(req: NextRequest) {
  const denied = gate(req);
  if (denied) return denied;
  return answer(false);
}

/** The spend — only when the body says so in a literal boolean. */
export async function POST(req: NextRequest) {
  const denied = gate(req);
  if (denied) return denied;

  // An unparseable body is refused, never defaulted: the safe default and the caller's
  // intent are different amounts of money.
  let raw: unknown;
  try {
    const text = await req.text();
    raw = text.trim() === "" ? undefined : JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "body-must-be-json" }, { status: 400 });
  }

  const parsed = parseBackfillRequest(raw);
  if (parsed.kind === "invalid") {
    return NextResponse.json({ error: parsed.reason }, { status: 400 });
  }
  return answer(parsed.request.execute, parsed.request.limit);
}
