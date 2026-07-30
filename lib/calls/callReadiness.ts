// BUILD-QUEUE Q68 inc.21 — THE ARMING REPORT: how far a real call gets right now.
//
// Increments 1–20 built the chain and proved it composes (callChainE2E). What no
// layer can answer is the question that actually blocks the DoD: *a real call has
// never run, and why not.* Three keys are Rob's, they land at three different
// moments, and each one changes what a call DOES in a way the previous layers were
// careful to keep distinct. This module states that, in the chain's own vocabulary.
//
// It exists because the alternative is a human reading four files and remembering
// which env var 503s the door versus which one merely leaves a call wordless — and
// that recollection is exactly what produces "transcription is broken" when the
// truth is "Deepgram is switched off" (inc.14's rule, applied to ourselves).
//
// THE KEYS THEMSELVES NEVER REACH THIS FILE. The input is four booleans; a module
// that is never handed key material cannot leak it into a report, a log or a
// screen. `callChainConfigFromEnv` does the presence conversion at the edge and
// returns nothing else.

export interface CallChainConfig {
  /** `TWILIO_AUTH_TOKEN` — the webhook 503s without it. Nothing downstream runs. */
  twilioAuthToken: boolean;
  /** `TWILIO_CALLER_ID` — our own line, subtracted before matching (inc.1). */
  twilioCallerId: boolean;
  /** `DEEPGRAM_API_KEY` — words. */
  deepgramKey: boolean;
  /** `ANTHROPIC_API_KEY`, on the DASHBOARD Vercel project — what the words meant. */
  anthropicKey: boolean;
}

export type StageId = "webhook" | "filing" | "transcription" | "summary";

/**
 * Deliberately factual and NOT cascaded: `armed` means the key is present, full
 * stop. How far a call actually travels is `reached`, below. Collapsing the two
 * would force a lie in one direction or the other — either a key that is set but
 * unreachable reads as `dormant` (and Rob adds it twice), or an unreachable key
 * reads as working (and we claim a chain nobody can enter is ready).
 */
export type StageState = "armed" | "dormant";

export interface StageReadiness {
  stage: StageId;
  /** The ask, verbatim — this string is what Rob types after `vercel env add`. */
  env: string;
  state: StageState;
  /** What a real call does at this stage right now, in the chain's own words. */
  effect: string;
}

/**
 * The furthest a real recorded call gets. FOUR STATES THAT NEVER COLLAPSE, because
 * they are four different things to a rep looking at a contact:
 *   nothing  — no activity at all; the webhook refused the payload
 *   timeline — the call is filed and listenable, with no words
 *   words    — a transcript exists, with nothing said about what it meant
 *   summary  — the DoD's shape
 */
export type ChainReach = "nothing" | "timeline" | "words" | "summary";

export interface CallChainReadiness {
  /** `configured` is about ENV ONLY and never about evidence — see `proven`. */
  verdict: "closed" | "partial" | "configured";
  reached: ChainReach;
  stages: StageReadiness[];
  /**
   * Missing env vars in the order that adding them changes what a call does:
   * the door first, then words, then meaning. Adding them out of order buys
   * nothing observable, which is how a key gets added and declared ineffective.
   */
  missing: string[];
  /** Correctness hazards that do NOT stop a call and must not be read as blockers. */
  warnings: string[];
  /**
   * Typed as the literal `false`, not `boolean`. No arrangement of env vars is
   * evidence that a call has ever succeeded — only a real call is — and a field
   * that could ever be `true` here would eventually be set from config and read
   * as proof. The DoD stays untickable from this module by construction.
   */
  proven: false;
  headline: string;
}

export function callChainConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CallChainConfig {
  return {
    twilioAuthToken: Boolean(env.TWILIO_AUTH_TOKEN),
    twilioCallerId: Boolean(env.TWILIO_CALLER_ID),
    deepgramKey: Boolean(env.DEEPGRAM_API_KEY),
    anthropicKey: Boolean(env.ANTHROPIC_API_KEY),
  };
}

const HEADLINES: Record<ChainReach, string> = {
  nothing: "No call can arrive — the recording webhook answers 503.",
  timeline: "A call would reach the timeline and stay wordless.",
  words: "A call would be transcribed, with nothing said about what it meant.",
  summary: "Every stage is armed. No call has run through it yet.",
};

export function callChainReadiness(config: CallChainConfig): CallChainReadiness {
  const stages: StageReadiness[] = [
    {
      stage: "webhook",
      env: "TWILIO_AUTH_TOKEN",
      state: config.twilioAuthToken ? "armed" : "dormant",
      effect: config.twilioAuthToken
        ? "Signed payloads are accepted."
        : "The route answers 503 before reading the body; nothing downstream runs.",
    },
    {
      stage: "filing",
      env: "TWILIO_CALLER_ID",
      state: config.twilioCallerId ? "armed" : "dormant",
      effect: config.twilioCallerId
        ? "Our own line is subtracted before matching; the remaining side is the contact."
        : "Nothing can be subtracted before matching, so no call files — the resolver refuses (`our-lines-unknown`) rather than file on whoever holds our own number.",
    },
    {
      stage: "transcription",
      env: "DEEPGRAM_API_KEY",
      state: config.deepgramKey ? "armed" : "dormant",
      effect: config.deepgramKey
        ? "A filed call is sent for transcription after the response."
        : "Every call plans `skipped:disabled` — filed and listenable, with no transcript row owed.",
    },
    {
      stage: "summary",
      env: "ANTHROPIC_API_KEY",
      state: config.anthropicKey ? "armed" : "dormant",
      effect: config.anthropicKey
        ? "A transcript with words is summarised onto the activity."
        : "`summary`/`action_items`/`buying_signals` stay empty — never a placeholder.",
    },
  ];

  // The cascade lives here and only here. Each rung requires the one before it,
  // which is why a set Deepgram key behind a closed webhook still reaches nothing.
  const reached: ChainReach = !config.twilioAuthToken
    ? "nothing"
    : !config.deepgramKey
      ? "timeline"
      : !config.anthropicKey
        ? "words"
        : "summary";

  // Ordered by the moment each key first changes an observable outcome.
  const missing: string[] = [];
  if (!config.twilioAuthToken) missing.push("TWILIO_AUTH_TOKEN");
  if (!config.deepgramKey) missing.push("DEEPGRAM_API_KEY");
  if (!config.anthropicKey) missing.push("ANTHROPIC_API_KEY");

  // Not a blocker to the chain OPENING — a call still arrives and is still
  // answered 2xx — so it stays out of `missing`, which orders the keys that stop
  // a call reaching us at all. It IS a blocker to filing: since inc.15 the
  // resolver refuses to file when it cannot tell our line from the contact's
  // (`our-lines-unknown`), so this warning states the refusal, not the old
  // wrong-contact filing it used to describe.
  const warnings = config.twilioCallerId
    ? []
    : [
        "TWILIO_CALLER_ID unset: our own line cannot be subtracted before matching, so no call files at all — the resolver refuses rather than risk filing on a rep whose own number is a person row.",
      ];

  const verdict: CallChainReadiness["verdict"] = !config.twilioAuthToken
    ? "closed"
    : missing.length > 0
      ? "partial"
      : "configured";

  return {
    verdict,
    reached,
    stages,
    missing,
    warnings,
    proven: false,
    headline: HEADLINES[reached],
  };
}
