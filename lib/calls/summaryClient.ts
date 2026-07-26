// BUILD-QUEUE Q68 (c) inc.10 — THE MODEL CALL: the only place in the summarisation
// chain that touches a model provider.
//
// inc.9 decided what we are willing to BELIEVE of an answer (lib/calls/callSummary.ts,
// pure). This file is the request half, and it is deliberately thin: everything it gets
// back — a good answer, a refusal, a timeout, a truncated reply — is handed to that same
// parser, so `activities.summary` / `action_items` / `buying_signals` are shaped by ONE
// code path no matter how the call went.
//
// Env-gated exactly like deepgramClient: with ANTHROPIC_API_KEY unset, summaryConfigured()
// is false, nothing is requested, and nothing anywhere changes.
//
// THE RULE THIS FILE ADDS: **there is no such thing as a partial summary.** Every failure
// mode below returns `rejected` and writes nothing. A missing summary is a call on the
// timeline a rep can still listen to; a wrong one is a false record of what a customer
// said, and nobody re-listens to catch it (inc.9's argument, now with a network in it).

import {
  type CallSummary,
  buildSummaryPrompt,
  parseCallSummary,
  summarizable,
} from "./callSummary";
import type { TranscriptSegment } from "./transcriptSegments";

export interface SummaryEnv {
  apiKey?: string;
}

export function summaryEnv(env: NodeJS.ProcessEnv = process.env): SummaryEnv {
  return { apiKey: env.ANTHROPIC_API_KEY };
}

export function summaryConfigured(env: SummaryEnv): boolean {
  return Boolean(env.apiKey);
}

/**
 * Pinned here, in code, because these decide what the stored rows can be.
 *
 * `SUMMARY_MAX_TOKENS` is generous on purpose: on this model family the cap covers
 * thinking AND the reply, so a tight budget does not produce a shorter summary — it
 * produces a JSON object cut off mid-string, which parses as nothing. Paying for headroom
 * is cheaper than a call whose summary silently never appears.
 */
export const SUMMARY_MODEL = "claude-opus-5";
export const SUMMARY_MAX_TOKENS = 8_000;

/** A summary is not on the webhook's critical path (inc.8 put it in `after()`), but an
 *  unbounded wait would hold a serverless invocation open until the platform kills it —
 *  and a killed invocation leaves no log saying why the call has no summary. */
export const SUMMARY_TIMEOUT_MS = 60_000;

/** The shape we need from a provider: text in, text out. Injectable so the decisions in
 *  this file are testable without a network or a key. */
export type SummaryModelCall = (req: {
  model: string;
  maxTokens: number;
  system: string;
  user: string;
  signal?: AbortSignal;
}) => Promise<SummaryModelReply>;

export type SummaryModelReply = {
  /** Concatenated text of the reply, or "" when the model produced none. */
  text: string;
  /** Provider stop reason, passed through verbatim — never interpreted upstream. */
  stopReason?: string | null;
};

export type SummaryOutcome =
  /** No key configured — not a failure, and deliberately not an error row. */
  | { kind: "disabled" }
  /** Nothing worth asking about (inc.9: an empty transcript must never be summarised). */
  | { kind: "skipped"; reason: string }
  /** We asked and will not store the answer. Reason is specific — it ends up in a log. */
  | { kind: "rejected"; reason: string }
  | { kind: "ok"; value: CallSummary };

export type SummaryRequest = {
  segments: readonly TranscriptSegment[];
  env?: SummaryEnv;
  call?: SummaryModelCall;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
};

/**
 * Stop reasons that mean "the text you are holding is not a complete answer".
 *
 * `refusal` is the one that matters: a refusal arrives as a normal success with prose in
 * it, so a parser that only looked at the body could store an apology as this call's
 * summary. `max_tokens` is checked for the same reason — a truncated JSON object usually
 * fails to parse, but a truncated *array* can parse cleanly and silently drop the last
 * action items, which is a summary that is wrong rather than absent.
 */
const UNUSABLE_STOP_REASONS = new Set(["refusal", "max_tokens", "pause_turn"]);

/**
 * Ask the model to summarise a transcript, and return something the store can write.
 *
 * The prompt is rebuilt from segments every time (never from a cached transcript copy) so
 * a corrected segment changes the summary's input rather than leaving it describing a call
 * that no longer exists in the database.
 *
 * The API key is never echoed into a reason string: these reasons are logged and, later,
 * shown on a screen.
 */
export async function requestCallSummary(req: SummaryRequest): Promise<SummaryOutcome> {
  const env = req.env ?? summaryEnv();
  if (!summaryConfigured(env)) return { kind: "disabled" };

  // Checked BEFORE the request, not after: a silent call is a real, complete transcript
  // with no words, and handing it to a summariser is exactly how an unanswered call
  // acquires a paragraph about what was discussed.
  if (!summarizable(req.segments)) return { kind: "skipped", reason: "no-speech" };

  const prompt = buildSummaryPrompt(req.segments);
  const call = req.call ?? anthropicSummaryCall(env);
  const timeoutMs = req.timeoutMs ?? SUMMARY_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let reply: SummaryModelReply;
  try {
    reply = await call({
      model: req.model ?? SUMMARY_MODEL,
      maxTokens: req.maxTokens ?? SUMMARY_MAX_TOKENS,
      system: prompt.system,
      user: prompt.user,
      signal: controller.signal,
    });
  } catch (err) {
    const aborted =
      (err as { name?: string })?.name === "AbortError" || controller.signal.aborted;
    return {
      kind: "rejected",
      reason: aborted
        ? `summary request timed out after ${timeoutMs}ms`
        : `summary request failed: ${(err as Error)?.message ?? "unknown error"}`,
    };
  } finally {
    clearTimeout(timer);
  }

  const stop = reply.stopReason ?? null;
  if (stop && UNUSABLE_STOP_REASONS.has(stop)) {
    return { kind: "rejected", reason: `unusable stop reason: ${stop}` };
  }

  // The parser owns every remaining judgement — quote containment, caps, de-duplication,
  // and the rule that a missing summary rejects the whole answer.
  const parsed = parseCallSummary(reply.text, req.segments, { truncated: prompt.truncated });
  return parsed.kind === "ok"
    ? { kind: "ok", value: parsed.value }
    : { kind: "rejected", reason: parsed.reason };
}

/**
 * The default provider binding — the official SDK, imported lazily.
 *
 * Lazy because this module is reached from a webhook that is normally disabled: with no
 * key configured we return before this function is ever called, and a dormant branch
 * should not pull a client into the route's cold start.
 *
 * No sampling parameters are sent (they are rejected on this model family) and no
 * assistant prefill is used; the JSON contract is carried by the system prompt that
 * inc.9 pinned, and enforced by the parser rather than by trusting the model.
 */
export function anthropicSummaryCall(env: SummaryEnv): SummaryModelCall {
  return async ({ model, maxTokens, system, user, signal }) => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: env.apiKey });
    const message = await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      },
      { signal }
    );
    return { text: textOf(message.content), stopReason: message.stop_reason };
  };
}

/** Text blocks only. A thinking block is not an answer, and concatenating one into the
 *  body is how reasoning ends up rendered as a customer's summary. */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: "text"; text: string } =>
        Boolean(b) &&
        typeof b === "object" &&
        (b as { type?: unknown }).type === "text" &&
        typeof (b as { text?: unknown }).text === "string"
    )
    .map((b) => b.text)
    .join("\n")
    .trim();
}
