// BUILD-QUEUE Q68 (c) inc.9 — THE SUMMARISATION SEAM: what we ask the model, and what we
// are willing to believe of its answer.
//
// inc.3 did this for Deepgram: the HTTP call is the trivial half, the mapping is the half
// that can be wrong invisibly. It is more true here. Deepgram returns words that were
// said; a summariser returns words that were NOT said, about a real customer, into
// `activities.summary` / `action_items` / `buying_signals` (0005) — the three fields a rep
// reads INSTEAD of listening to the call. A hallucination here is not a rendering bug, it
// is a false record of what a customer committed to, and nobody re-listens to catch it.
//
// So this file is pure per CR-3 — no network, no clock, no randomness, no env read — and
// every "we refuse to store that" below is pinned by a test rather than by trusting a
// prompt to be obeyed. The model call itself is the next increment and is deliberately
// not here.

import { transcriptText } from "./deepgram";
import type { TranscriptSegment } from "./transcriptSegments";

/** What lands in `activities.summary` (text) + the two jsonb columns. */
export type CallSummary = {
  summary: string;
  actionItems: string[];
  buyingSignals: BuyingSignal[];
  /** True when the model was shown an elided transcript — stated, never inferred. */
  truncated: boolean;
};

/**
 * A buying signal AND the line that proves it.
 *
 * The quote is not decoration and it is not optional (see `parseCallSummary`): a signal is
 * a claim about a customer's intent, and Rob's standing rule — every stat carries its
 * source — is exactly the right rule for a claim a model invented.
 */
export type BuyingSignal = { label: string; quote: string };

export type SummaryPrompt = { system: string; user: string; truncated: boolean };

/** Refused input, or a refused answer. Reason is what a human reads, so it is specific. */
export type SummaryParse =
  | { kind: "ok"; value: CallSummary }
  | { kind: "rejected"; reason: string };

/**
 * How much transcript the model sees.
 *
 * Not a token count — this file is pure and a tokeniser is a dependency with a version.
 * Characters are a coarse but honest bound, and the budget is deliberately generous: a
 * 30-minute two-party call renders well under it, so truncation is the exception the
 * `truncated` flag exists to mark, not the normal path.
 */
export const TRANSCRIPT_CHAR_BUDGET = 48_000;

/** Bounds on what we will store, so one bad answer cannot flood a timeline. */
export const MAX_ACTION_ITEMS = 12;
export const MAX_BUYING_SIGNALS = 8;
export const MAX_SUMMARY_CHARS = 4_000;
export const MAX_ITEM_CHARS = 400;

const ELISION = "\n[... middle of call elided for length ...]\n";

/**
 * Fit a transcript into the budget by removing the MIDDLE, never the tail.
 *
 * The obvious truncation — keep the first N characters — is the one that systematically
 * destroys the field we most need. Next steps, prices agreed and commitments land in the
 * last minutes of a sales call; a head-only cut would produce summaries that are fluent,
 * confident, and missing every action item, with nothing in the output saying so. Head +
 * tail keeps the framing and the commitments, and the elision marker keeps the model from
 * narrating the gap as if it were a lull in the conversation.
 */
export function fitTranscript(
  text: string,
  budget: number = TRANSCRIPT_CHAR_BUDGET
): { text: string; truncated: boolean } {
  if (!Number.isFinite(budget) || budget <= 0) return { text: "", truncated: text.length > 0 };
  if (text.length <= budget) return { text, truncated: false };

  const keep = budget - ELISION.length;
  if (keep <= 0) return { text: text.slice(0, budget), truncated: true };

  // Tail-weighted: the end of a call carries the commitments.
  const tail = Math.ceil(keep * 0.6);
  const head = keep - tail;
  return { text: `${text.slice(0, head)}${ELISION}${text.slice(text.length - tail)}`, truncated: true };
}

const SYSTEM = [
  "You summarise recorded sales calls for a CRM.",
  "You report only what is in the transcript. You never infer a commitment that was not stated.",
  "Every buying signal must quote the transcript verbatim; if you cannot quote it, omit it.",
  "Reply with JSON only: {\"summary\": string, \"action_items\": string[], \"buying_signals\": [{\"label\": string, \"quote\": string}]}",
  "action_items are things a human must DO next, in the imperative. An empty array is a correct answer.",
].join("\n");

/**
 * Build the model input from segments — never from a stored copy of the transcript.
 *
 * Same rule as `transcriptText`: a second copy of a call drifts from the segments the
 * moment one is corrected, and the summary would then describe a call that no longer
 * exists in the database.
 */
export function buildSummaryPrompt(
  segments: readonly TranscriptSegment[],
  budget: number = TRANSCRIPT_CHAR_BUDGET
): SummaryPrompt {
  const fitted = fitTranscript(transcriptText(segments), budget);
  return {
    system: SYSTEM,
    user: `Transcript:\n${fitted.text}`,
    truncated: fitted.truncated,
  };
}

/**
 * Is there anything here worth asking a model about?
 *
 * **Zero segments is NOT summarised, and that is the whole point of the check.** inc.3
 * decided that silence, a voicemail beep and a hang-up are `complete` transcripts with no
 * words — real, successful, empty. Handing an empty transcript to a summariser is how a
 * call that nobody answered acquires a paragraph describing what was discussed. Refusing
 * costs nothing: the call is already on the timeline with no summary, which is the truth.
 */
export function summarizable(segments: readonly TranscriptSegment[]): boolean {
  return segments.some((s) => s.text.trim().length > 0);
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function cleanString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max).trimEnd() : t;
}

/**
 * Turn the model's answer into rows — or refuse it whole.
 *
 * **THE DECISION THAT MATTERS: a quote that is not in the transcript is DROPPED, not
 * stored.** This is the only defence that does not depend on the model cooperating. A
 * prompt asking for verbatim quotes is a request; checking containment against the
 * transcript we already have is a fact, and it is cheap because both strings are in
 * memory. The cost is stated rather than hidden: a real signal the model paraphrases
 * instead of quoting is lost. That trade is correct — a paraphrased "he said he'd sign
 * Friday" in a CRM is indistinguishable from a real one, and a rep acts on both.
 *
 * **A missing/blank summary rejects the whole answer** rather than storing the items
 * alone: the DoD for Q68 is a call on the timeline WITH a summary, and half an answer
 * stored silently is the state where nobody knows the model failed.
 *
 * **The raw model text is never used as a fallback summary.** A refusal, an apology or a
 * stray "```json" would render as this call's summary and read as fact.
 */
export function parseCallSummary(
  raw: unknown,
  segments: readonly TranscriptSegment[],
  opts: { truncated?: boolean } = {}
): SummaryParse {
  const obj = coerceObject(raw);
  if (!obj) return { kind: "rejected", reason: "not-json-object" };

  const summary = cleanString(obj.summary, MAX_SUMMARY_CHARS);
  if (!summary) return { kind: "rejected", reason: "summary" };

  const haystack = normalizeWhitespace(transcriptText(segments));

  const actionItems: string[] = [];
  const seenItems = new Set<string>();
  for (const entry of asArray(obj.action_items ?? obj.actionItems)) {
    if (actionItems.length >= MAX_ACTION_ITEMS) break;
    const item = cleanString(entry, MAX_ITEM_CHARS);
    if (!item) continue;
    const key = normalizeWhitespace(item);
    if (seenItems.has(key)) continue;
    seenItems.add(key);
    actionItems.push(item);
  }

  const buyingSignals: BuyingSignal[] = [];
  const seenSignals = new Set<string>();
  for (const entry of asArray(obj.buying_signals ?? obj.buyingSignals)) {
    if (buyingSignals.length >= MAX_BUYING_SIGNALS) break;
    const row = coerceObject(entry);
    if (!row) continue;
    const label = cleanString(row.label, MAX_ITEM_CHARS);
    const quote = cleanString(row.quote, MAX_ITEM_CHARS);
    // No quote, or a quote nobody said: not storable. Unquotable ≠ untrue, but it is
    // unverifiable, and this column is read as evidence.
    if (!label || !quote) continue;
    if (!haystack.includes(normalizeWhitespace(quote))) continue;
    const key = normalizeWhitespace(`${label}|${quote}`);
    if (seenSignals.has(key)) continue;
    seenSignals.add(key);
    buyingSignals.push({ label, quote });
  }

  return {
    kind: "ok",
    value: { summary, actionItems, buyingSignals, truncated: opts.truncated === true },
  };
}

/** Accepts an object, or the JSON string a model returns when it ignores response_format. */
function coerceObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    // Fenced JSON is the single most common malformed-but-recoverable answer; a fence is
    // a formatting slip, not a content one, so recovering it is not credulity.
    const stripped = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    if (!stripped) return null;
    try {
      return coerceObject(JSON.parse(stripped));
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
