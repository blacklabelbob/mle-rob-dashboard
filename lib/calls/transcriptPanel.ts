// BUILD-QUEUE Q68 (b) inc.18 — WHAT THE READER IS TOLD.
//
// inc.17 gave the transcript an HTTP door; the only thing left between a stored call and a
// human is the panel that renders it. That panel has to answer four states, a diagnostic,
// and three transport failures, and every one of those answers is a SENTENCE SHOWN TO ROB —
// so they live here, pure and tested (CR-3), not scattered through JSX where the first
// refactor rewrites them by accident. The component ahead is markup only.
//
// FOUR DECISIONS THAT ARE NOT OBVIOUS:
//
//  1. THE PANEL DROPS TURNS FOR EVERY NON-`ready` STATE. `transcriptView` already promises
//     turns are empty unless `ready`, but this is the last layer before pixels and it is fed
//     by a NETWORK payload — a stale response, a hand-rolled fetch, a future caller. If a
//     `failed` body ever arrives carrying turns, showing them would render words we just
//     told the reader do not exist. Trust nothing that crossed the wire.
//
//  2. CONFIDENCE IS THREE-VALUED, NEVER A PERCENTAGE. Deepgram's number is not an accuracy
//     score and a rep reading "87%" will treat it as one. `low` marks a turn worth
//     re-listening to; `unknown` means the provider measured only part of it (inc.15 nulls
//     `minConfidence` on partial coverage) and is NOT the same claim as `low` — calling an
//     unmeasured turn doubtful slanders a clean one, and calling it fine hides that nothing
//     checked it.
//
//  3. `empty` AND `failed` ARE DIFFERENT SENTENCES, AND NEITHER GUESSES A CAUSE. A silent
//     call is a real outcome, not a broken system; a failure says only that it failed —
//     the reason lives in `callPipelineLog`. inc.14's rule: a UI that says "transcription
//     failed" when the truth is "Deepgram is switched off" teaches a rep to distrust the CRM.
//
//  4. A DIAGNOSTIC IS AN OPERATOR NOTICE, NEVER TRANSCRIPT TEXT. `unreadable` carries a
//     COLUMN NAME out of inc.16's refusal to coerce. It rides beside the transcript so it
//     can be seen and flagged, and it is typed apart from `headline` so no component can
//     render it where the words go.

import { timecode, type TranscriptTurn, type TranscriptView } from "./transcriptView";

/** Below this, a turn is worth re-listening to before it is quoted to anyone. */
export const UNCERTAIN_BELOW = 0.6;

export type TurnConfidence = "ok" | "low" | "unknown";

export type PanelTurn = {
  /** Stable key: the first segment index this turn covers. Never an array position. */
  key: number;
  label: string;
  /** "0:07", or null when the span was unusable — a turn is never faked a start. */
  time: string | null;
  text: string;
  confidence: TurnConfidence;
};

export type TranscriptPanel = {
  state: "ready" | "pending" | "failed" | "empty" | "unavailable";
  /** The one line shown where the transcript would be when there is none. Null when `ready`. */
  headline: string | null;
  turns: PanelTurn[];
  /** Speakers the provider separated — shown only when it separated more than one. */
  speakerCount: number;
  /** Operator-facing. NEVER rendered as transcript text. */
  notice: string | null;
};

function confidenceOf(min: number | null): TurnConfidence {
  if (min === null) return "unknown";
  return min < UNCERTAIN_BELOW ? "low" : "ok";
}

function panelTurn(turn: TranscriptTurn): PanelTurn {
  return {
    key: turn.idx[0] ?? 0,
    label: turn.label,
    time: timecode(turn.startMs),
    text: turn.text,
    confidence: confidenceOf(turn.minConfidence),
  };
}

const HEADLINE: Record<Exclude<TranscriptPanel["state"], "ready">, string> = {
  // Not "no transcript": the call may have ended a minute ago, and the honest answer is
  // that nothing has finished yet.
  pending: "Transcript not ready yet",
  // States the failure and stops. Why is a log line, not a guess shown to a rep.
  failed: "This call could not be transcribed",
  // A silent call is an outcome, not a fault — inc.9's wordless rule, said out loud.
  empty: "Nothing was said on this call",
  // The read broke. Distinct from every state above, because "we could not ask" must never
  // read as "the call has no words".
  unavailable: "Transcript unavailable right now",
};

export type TranscriptPanelInput = {
  view: TranscriptView;
  diagnostics?: { unreadable?: string; droppedSegments?: number };
};

/**
 * The route body → what the panel renders.
 *
 * Everything the reader sees is decided here. The component ahead maps `turns` and prints
 * `headline`/`notice`; it makes no choices of its own.
 */
export function transcriptPanel(body: TranscriptPanelInput): TranscriptPanel {
  const { view, diagnostics } = body;
  const notices: string[] = [];
  if (diagnostics?.unreadable) {
    notices.push(`Stored transcript could not be read (${diagnostics.unreadable})`);
  }
  if (diagnostics?.droppedSegments) {
    notices.push(`${diagnostics.droppedSegments} segment(s) skipped`);
  }
  const notice = notices.length ? notices.join(" · ") : null;
  // Rule 1: turns only exist on the one branch that just told the reader there are words.
  // Written as a narrowing check, not a boolean flag, so the compiler enforces it too.
  if (view.state === "ready") {
    return {
      state: "ready",
      headline: null,
      turns: view.turns.map(panelTurn),
      speakerCount: view.speakerCount,
      notice,
    };
  }
  return {
    state: view.state,
    headline: HEADLINE[view.state],
    turns: [],
    speakerCount: 0,
    notice,
  };
}

/**
 * The panel for a request that never returned a body.
 *
 * A 400 means the caller asked with a sid Twilio could not have issued — that is OUR bug or
 * a hand-edited URL, and it is still not a claim about the call, so it lands on the same
 * `unavailable` line rather than inventing a fifth thing to say. The status rides in
 * `notice` so it is visible without being an accusation about the call.
 */
export function transcriptPanelUnavailable(status?: number): TranscriptPanel {
  return {
    state: "unavailable",
    headline: HEADLINE.unavailable,
    turns: [],
    speakerCount: 0,
    notice: typeof status === "number" ? `Transcript request failed (HTTP ${status})` : null,
  };
}

// ── inc.19: the wire boundary ────────────────────────────────────────────────────────────
//
// `transcriptPanel` takes a TYPED input, and TypeScript only guarantees that shape for
// objects built in our own source. What the component actually holds is `await res.json()`
// — a value typed by whatever answered the request. Casting it would make rule 1 above a
// comment rather than a check, so the parse lives here, pure and tested, exactly as
// `lib/filters/parse.ts` sits in front of `compile()`.

const STATES = new Set(["ready", "pending", "failed", "empty"]);

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * A turn off the wire, or null if any part of it is not what it claims.
 *
 * `text` may be empty-string only in the sense that we do not police its content — but a
 * missing/non-string `text`, a non-numeric span, or a non-array `idx` means the payload is
 * not a transcript, and the caller turns that into `unavailable`.
 */
function wireTurn(raw: unknown): TranscriptTurn | null {
  const t = obj(raw);
  if (!t) return null;
  const { speaker, label, startMs, endMs, text, idx, minConfidence } = t;
  if (typeof label !== "string" || typeof text !== "string") return null;
  if (typeof startMs !== "number" || typeof endMs !== "number") return null;
  if (!Array.isArray(idx) || idx.some((i) => typeof i !== "number")) return null;
  if (minConfidence !== null && typeof minConfidence !== "number") return null;
  if (speaker !== null && typeof speaker !== "string") return null;
  return { speaker, label, startMs, endMs, text, idx: idx as number[], minConfidence };
}

/**
 * `GET /api/calls/transcript`'s answer → what the panel renders.
 *
 * TWO RULES THAT ARE THE REASON THIS FUNCTION EXISTS:
 *
 *  1. A NON-200 IS NEVER A STATEMENT ABOUT THE CALL. 400/503/404 all mean *we could not
 *     ask*; they land on `unavailable` carrying the status, never on `empty` or `failed`.
 *
 *  2. A BODY WE CANNOT FULLY PARSE YIELDS NO TRANSCRIPT AT ALL — never the turns that did
 *     parse. A partly-rendered call reads as a complete one, and the quote a rep pulls out
 *     of it is missing the sentence that changed its meaning. All or nothing, by design.
 */
export function transcriptPanelFromResponse(status: number, body: unknown): TranscriptPanel {
  if (status !== 200) return transcriptPanelUnavailable(status);
  const root = obj(body);
  const view = obj(root?.view);
  const state = view?.state;
  if (!view || typeof state !== "string" || !STATES.has(state) || !Array.isArray(view.turns)) {
    return { ...transcriptPanelUnavailable(), notice: "Transcript response could not be read" };
  }
  const turns = view.turns.map(wireTurn);
  if (turns.some((t) => t === null)) {
    return { ...transcriptPanelUnavailable(), notice: "Transcript response could not be read" };
  }
  const diag = obj(root?.diagnostics);
  return transcriptPanel({
    view: {
      state: state as TranscriptView["state"],
      turns: turns as TranscriptTurn[],
      speakerCount: typeof view.speakerCount === "number" ? view.speakerCount : 0,
      endMs: typeof view.endMs === "number" ? view.endMs : null,
    },
    diagnostics: {
      unreadable: typeof diag?.unreadable === "string" ? diag.unreadable : undefined,
      droppedSegments: typeof diag?.droppedSegments === "number" ? diag.droppedSegments : undefined,
    },
  });
}
