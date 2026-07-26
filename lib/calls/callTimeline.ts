// BUILD-QUEUE Q68 (c) inc.14 — THE READING END: what a rep actually sees of a call.
//
// Every increment before this one wrote something down; none of it reaches a human. The
// timeline renders `summary` and a date, so a call the chain filed correctly but has not
// summarised yet — Deepgram off, a silent recording, a model failure — has **no summary
// field at all** and is dropped by the component's `normalize` (it returns null without
// one). The activity row exists, the recording exists, and the rep sees nothing. That is
// the worst state in the system: a call that happened, was filed on the right contact, and
// is invisible. This file is the projection that fixes it, kept pure per CR-3 so the rules
// below are tested rather than trusted to JSX.
//
// It takes the RAW row as `/api/admin/activities` returns it (snake_case, `select("*")`),
// not a mapped `Activity` — the component fetches that route directly, and inventing a
// second mapping layer in the client is how the two drift.

export type CallDirection = "inbound" | "outbound";

export type CallSignal = { label: string; quote: string };

/**
 * A call's timeline detail. `null` and `[]` mean different things throughout and are never
 * collapsed — that distinction is the whole point of inc.11's explicit empty arrays, and
 * collapsing it here would throw it away one layer from the reader.
 */
export type CallTimelineDetail = {
  /** "3:24" — null when the payload carried no duration (never "0:00" as a stand-in). */
  duration: string | null;
  direction: CallDirection | null;
  recordingUrl: string | null;
  /** null = never summarised. [] = summarised, nothing to do. */
  actionItems: string[] | null;
  /** null = never summarised. [] = summarised, no signal heard. */
  signals: CallSignal[] | null;
  /** The model saw only part of the transcript (inc.11 stores this in source_context). */
  truncated: boolean;
  /** What the row honestly is: prose written, or a call still awaiting one. */
  state: "summarised" | "awaiting-summary";
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function ctx(row: Record<string, unknown>): Record<string, unknown> {
  const c = row.source_context ?? row.sourceContext;
  return c && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, unknown>) : {};
}

/**
 * Seconds → "m:ss", or "h:mm:ss" past an hour.
 *
 * A zero-second recording is a real thing (Twilio posts them) and reads as "0:00" — but a
 * MISSING duration is not zero, so it stays null. Negative or non-finite input is refused
 * rather than formatted into something that looks measured.
 */
export function formatDuration(seconds: unknown): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function items(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null; // null/absent column — never summarised
  return v.map(str).filter((x): x is string => !!x);
}

function signals(v: unknown): CallSignal[] | null {
  if (!Array.isArray(v)) return null;
  return v
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const label = str(r.label);
      // The quote is the evidence; a labelled signal with no quote is an assertion the rep
      // cannot check, so it is dropped rather than shown bare.
      const quote = str(r.quote);
      return label && quote ? { label, quote } : null;
    })
    .filter((x): x is CallSignal => !!x);
}

/**
 * The call detail for an activity row, or null when the row is not a call.
 *
 * Rows that are calls but carry nothing extra still return a detail — `state` alone is
 * worth rendering, because "awaiting summary" is the honest answer for every call in the
 * system today (all three keys are Rob's) and silence is not.
 */
export function callDetail(row: Record<string, unknown>): CallTimelineDetail | null {
  const type = str(row.type);
  if (type !== "call") return null;
  const c = ctx(row);
  const direction = c.direction === "inbound" || c.direction === "outbound" ? c.direction : null;
  const action = items(row.action_items ?? row.actionItems);
  return {
    duration: formatDuration(c.durationSec),
    direction,
    recordingUrl: str(row.recording_url ?? row.recordingUrl),
    actionItems: action,
    signals: signals(row.buying_signals ?? row.buyingSignals),
    truncated: c.summaryTruncated === true,
    state: str(row.summary) ? "summarised" : "awaiting-summary",
  };
}

/**
 * The one line shown where prose would go when a call has no summary yet.
 *
 * It describes the CALL (what is certain: direction, length, that a recording exists) and
 * never guesses why the summary is missing — the reasons live in `callPipelineLog`, and a
 * UI that says "transcription failed" when the truth is "Deepgram is switched off" teaches
 * a rep to distrust the timeline.
 */
export function awaitingSummaryLine(detail: CallTimelineDetail): string {
  const parts = [detail.direction === "outbound" ? "Outbound call" : detail.direction === "inbound" ? "Inbound call" : "Call"];
  if (detail.duration) parts.push(detail.duration);
  parts.push(detail.recordingUrl ? "recorded — summary not written yet" : "summary not written yet");
  return parts.join(" · ");
}
