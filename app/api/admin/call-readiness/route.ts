import { NextResponse } from "next/server";
import { callChainConfigFromEnv, callChainReadiness } from "@/lib/calls/callReadiness";
import { callReadinessLog, callReadinessResponse } from "@/lib/calls/readinessResponse";
import { repairPresenceFromEnv, repairReadiness } from "@/lib/calls/repairReadiness";

/**
 * Q68 inc.22 — the arming report, over HTTP.
 *
 *   process.env  ->  callChainConfigFromEnv  ->  callChainReadiness  ->  callReadinessResponse
 *
 * Env and clock only; every sentence lives in lib/calls/* (CR-3).
 *
 * `force-dynamic` + `no-store` ARE THE POINT, not boilerplate. A cached arming report is a
 * stale claim about live configuration — it would keep answering `dormant` after the
 * redeploy that armed the key, which is the exact confusion `DEPLOY_SNAPSHOT_NOTE` exists
 * to prevent.
 *
 * NO AUTH AND NO SECRETS: the body is four env var NAMES and four booleans. It reads no
 * table, touches no customer data, and is unaffected by Q64 — deliberately, so that Rob can
 * check his own keys without waiting on the ACCESS decision.
 *
 * NOT DEPLOYED WITH THIS INCREMENT, for a reason outside itself: prod is currently behind
 * inc.14/17/19 (verified — `/api/calls/transcript` 404s there), and those surfaces read
 * verbatim customer speech on an unauthenticated prod. A deploy to ship this would ship
 * them too. It goes out with Q64's answer, like the rest of Q68.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  // inc.43: the second half of the report — the two repair doors. Still env and clock only;
  // `repairPresenceFromEnv` hands the pure module a set of NAMES, never a value.
  const res = callReadinessResponse(
    callChainReadiness(callChainConfigFromEnv()),
    new Date().toISOString(),
    repairReadiness(repairPresenceFromEnv()),
  );
  console.log(JSON.stringify(callReadinessLog(res)));
  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
}
