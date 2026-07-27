import { NextRequest, NextResponse } from "next/server";
import { runBackfillPass, type BackfillPassDeps } from "@/lib/calls/backfillPass";
import { loadBackfillStates, backfillStateClient } from "@/lib/calls/backfillStateDb";
import {
  backfillAuthGate,
  backfillMissingConfig,
  backfillTriggerResponse,
  parseBackfillRequest,
} from "@/lib/calls/backfillTrigger";
import { processCallRecording } from "@/lib/calls/callPipeline";
import { transcriptDb } from "@/lib/calls/transcriptDb";
import { verifyCronAuth } from "@/lib/dedup/detector";
import { getStore } from "@/lib/storage";

/**
 * Q68 (c) inc.38 — THE OPERATOR TRIGGER: the last unbuilt hop on the backfill branch.
 *
 *   env → backfillMissingConfig ─┐
 *   body → parseBackfillRequest ─┴→ runBackfillPass(deps) → backfillTriggerResponse
 *
 * Every sentence lives in `lib/calls/*` (CR-3). This file holds exactly what a route must:
 * auth, the four bindings, and the status code.
 *
 * GET PLANS, POST SPENDS — the method IS the safety rail. A dry run has to be reachable from
 * a browser bar or a bare curl, and the shape that is trivially reachable must be the one
 * that cannot bill Deepgram and Anthropic for a whole backlog. `runBackfillPass` already
 * demands an explicit `execute`; this is the second lock on the same door, and neither is
 * redundant — a GET here is `execute: false` by construction, not by a field someone could
 * forget.
 *
 * AUTH IS THE CRON BEARER, and the choice is deliberate rather than borrowed. Rob's ACCESS
 * decision (2026-07-27) left prod OPEN — no logins, permanently, for READING the dashboard.
 * That decision was about who may look; this route is not a read. It spends Deepgram and
 * Anthropic money over a backlog and writes verbatim customer speech into 0021, on a host
 * anyone can reach — so it carries the same contract as every cron route: CRON_SECRET unset
 * → 503 inert (nothing is triggerable on a deployment that never set it), wrong bearer → 401.
 * An open dashboard with an open spend endpoint is not what "show the names" asked for.
 *
 * `loadActivity` RE-READS AT RUN TIME, and pays a full list read per run to do it.
 * `runBackfill` states why it refuses a carried copy; the cost is real and named here rather
 * than optimised away with a cache that would reintroduce exactly the staleness that rule
 * exists to prevent. The pass is capped (`limit`) for the same reason.
 */

export const dynamic = "force-dynamic";

function deps(): BackfillPassDeps {
  const store = getStore();
  return {
    listActivities: () => store.listActivities(),
    loadStates: (sids) => loadBackfillStates(backfillStateClient(), sids),
    loadActivity: async (activityId) =>
      (await store.listActivities()).find((a) => a.id === activityId) ?? null,
    runPipeline: (activity, run) =>
      processCallRecording(
        { db: transcriptDb(), saveActivity: (a) => store.upsertActivity(a) },
        {
          activity,
          recordingSid: run.recordingSid,
          recordingUrl: run.recordingUrl,
        }
      ),
  };
}

/**
 * 503 inert / 401 wrong bearer — identical to the cron routes, on purpose, and since inc.42
 * decided ONCE in `backfillAuthGate` for both spend triggers on this branch.
 */
function unauthorized(req: NextRequest): NextResponse | null {
  const denied = backfillAuthGate(
    req.headers.get("authorization"),
    process.env.CRON_SECRET,
    verifyCronAuth
  );
  return denied ? NextResponse.json(denied.body, { status: denied.status }) : null;
}

async function answer(execute: boolean, limit?: number) {
  const result = await runBackfillPass(deps(), {
    missingConfig: backfillMissingConfig(),
    execute,
    limit,
  });
  const res = backfillTriggerResponse(result);
  // The projection, never the result: the plan carries playable recording URLs.
  console.log("[call-backfill]", JSON.stringify({ execute, ...res.body }));
  return NextResponse.json(res.body, {
    status: res.status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** The dry run. Reads the backlog, contacts no provider, writes nothing. */
export async function GET(req: NextRequest) {
  const denied = unauthorized(req);
  if (denied) return denied;
  return answer(false);
}

/** The spend — only when the body says so in a literal boolean. */
export async function POST(req: NextRequest) {
  const denied = unauthorized(req);
  if (denied) return denied;

  // An unparseable body is refused, never defaulted: on this route the safe default and the
  // caller's intent are different amounts of money, and guessing between them is the one
  // thing a trigger must not do.
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
