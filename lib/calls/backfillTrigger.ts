// BUILD-QUEUE Q68 (c) inc.38 — THE TRIGGER'S DECISIONS: what an operator asked for, and
// what the answer is allowed to say.
//
// inc.37 reduced the whole branch to one await (`runBackfillPass`). The remaining hop is the
// surface an operator touches, and it is the one hop that spends money on a BACKLOG. Every
// decision it makes lives here, not in the route (CR-3): what the request means, what the
// HTTP status is, and — the part a route would get wrong quietly — what the body may carry.
//
// THE RULES, EACH ONE A REFUSED LIE:
//
//  1. A SPEND IS TYPED `true`, NEVER TRUTHY. `execute: "false"` is a non-empty string, and
//     under a `Boolean(...)` coercion that dry-run request bills Deepgram and Anthropic for
//     the entire backlog. Only the literal boolean `true` executes; anything else in that
//     field is REFUSED rather than read as "no", because a caller who sent `execute: 1`
//     meant to spend and deserves to be told the request was not understood.
//
//  2. A MALFORMED CAP IS NEVER AN UNCAPPED PASS. `limit` omitted means "run everything" —
//     so a typo'd `limit: "20"`, a `NaN`, or a `-5` must not fall through into that default.
//     Uncapped has to be asked for by omission, deliberately; every other shape is refused.
//     `limit: 0` is refused too: it plans nothing, which is what `execute: false` already
//     says honestly.
//
//  3. THE BODY IS THE LOG PROJECTION, NEVER THE PLAN. A `BackfillPlan` carries every
//     candidate's `recordingUrl` — a playable Twilio media URL for a real customer call. Prod
//     is OPEN by Rob's standing order (ACCESS closed 2026-07-27), which makes this rule
//     permanent rather than interim: a response body is the least controlled surface the
//     branch has. The answer carries counts, reasons and the cap, exactly like the log; the
//     ids and URLs stay server-side. An operator asking "did it run" is answered; an operator
//     asking "read me the call" is not.
//
//  4. AN UNCONFIGURED PASS IS 503, NOT 200. Every other env-gated route in this codebase
//     answers 503 when its keys are unset, and today — Rob's three keys still unset — that
//     is the ONLY state this trigger runs in. A 200 saying `not-configured` reads, in any
//     dashboard or curl loop, as a pass that ran and found nothing to do.
//
//  5. NOTHING HERE READS ENV, A CLOCK, OR A DATABASE. `backfillMissingConfig` is handed the
//     env; the pass is handed its deps. That is what lets rule 1 and rule 2 be tested with
//     no provider, no key and no Postgres in the room.

import { backfillPassLog, type BackfillPassResult } from "./backfillPass";

/**
 * The env a backfill pass genuinely needs, in the order a human should fix them.
 *
 * Both provider keys AND both Supabase halves: the transcript write and the 0021 evidence
 * read are service-role or nothing (inc.36), and a pass that reaches them unset would read
 * an empty evidence map as "no call was ever transcribed" and re-run the whole backlog
 * through two paid providers. `TWILIO_*` is deliberately absent — the recordings are
 * already filed; this pass never talks to Twilio's API, only fetches media URLs already on
 * the activities.
 */
export const BACKFILL_REQUIRED_ENV = [
  "DEEPGRAM_API_KEY",
  "ANTHROPIC_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/** The unset names, in declaration order. Empty = the pass may spend. */
export function backfillMissingConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  return BACKFILL_REQUIRED_ENV.filter((name) => !env[name]);
}

export type BackfillRequest = { execute: boolean; limit?: number };

export type BackfillRequestParse =
  | { kind: "ok"; request: BackfillRequest }
  | { kind: "invalid"; reason: string };

/**
 * What the operator asked for — rules 1 and 2.
 *
 * A body that is absent or `{}` is a valid DRY RUN: the safe reading of silence is the one
 * that does not spend. Every other misunderstanding is refused by name.
 */
export function parseBackfillRequest(raw: unknown): BackfillRequestParse {
  if (raw === undefined || raw === null) return { kind: "ok", request: { execute: false } };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { kind: "invalid", reason: "body-must-be-an-object" };
  }
  const body = raw as Record<string, unknown>;

  // Rule 1.
  const rawExecute = body.execute;
  if (rawExecute !== undefined && typeof rawExecute !== "boolean") {
    return { kind: "invalid", reason: "execute-must-be-a-boolean" };
  }
  const execute = rawExecute === true;

  // Rule 2.
  const rawLimit = body.limit;
  if (rawLimit === undefined || rawLimit === null) return { kind: "ok", request: { execute } };
  if (typeof rawLimit !== "number" || !Number.isInteger(rawLimit) || rawLimit < 1) {
    return { kind: "invalid", reason: "limit-must-be-a-positive-integer" };
  }
  return { kind: "ok", request: { execute, limit: rawLimit } };
}

export type BackfillTriggerResponse = { status: number; body: Record<string, unknown> };

/** The answer an operator is allowed to see — rules 3 and 4. */
export function backfillTriggerResponse(result: BackfillPassResult): BackfillTriggerResponse {
  const body = backfillPassLog(result);
  return { status: result.kind === "not-configured" ? 503 : 200, body };
}

/**
 * inc.42 — WHO MAY SPEND, decided once for every trigger on this branch.
 *
 * Both spend triggers (transcript repair, summary repair) sit on an OPEN prod host by Rob's
 * standing ACCESS order, and they answer to the same contract as the cron routes: no
 * `CRON_SECRET` on the deployment → 503 inert (nothing is triggerable on a deployment that
 * never armed it), wrong bearer → 401. Returning `null` means the caller may proceed.
 *
 * It lives here rather than in either route because two spend doors that drift apart is how
 * one of them ends up open: the second route is written by copying the first, and the copy
 * is what stops getting the fix.
 */
export function backfillAuthGate(
  authorization: string | null,
  secret: string | undefined,
  verify: (header: string | null, secret: string) => boolean
): BackfillTriggerResponse | null {
  if (!secret) {
    return { status: 503, body: { error: "backfill disabled: CRON_SECRET not set" } };
  }
  if (!verify(authorization, secret)) {
    return { status: 401, body: { error: "unauthorized" } };
  }
  return null;
}
