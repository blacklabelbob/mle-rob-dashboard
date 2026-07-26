// BUILD-QUEUE Q68 (b) inc.17 — THE LAST HOP: what a transcript request is allowed to answer.
//
// inc.15 built the projection and inc.16 built the DB read; between them a stored call can
// travel rows -> turns, and NOTHING CALLS EITHER. This is the decision half of the route
// that finally does: which sid is even worth a query, what the response body contains, and
// what may be written to a log line. The route itself is store I/O only (CR-3), the same
// split as `/api/views/page` -> `lib/filters/*`.
//
// FOUR RULES THAT ARE NOT OBVIOUS:
//
//  1. THE SID IS VALIDATED BEFORE A CONNECTION IS OPENED, and against Twilio's actual shape.
//     This is not input hygiene. The route reads verbatim customer speech out of a table
//     with RLS and no policies, using the SERVICE KEY, on a prod that is unauthenticated by
//     Rob's 7/21 call. A free-text parameter is an invitation to walk the table; `RE` + 32
//     hex is not guessable, so the shape check is the difference between "you must already
//     know the recording id" and "you may probe".
//
//  2. THE RESPONSE CARRIES TURNS, NEVER ROWS. `transcriptView`'s output is the contract:
//     ordering by idx, speaker labels that are never role-named, weakest-not-average
//     confidence. Returning raw segments alongside it would hand every future caller a
//     second, unpinned way to render a call — and the first thing a caller would do with
//     raw rows is re-sort them.
//
//  3. `unreadable` IS REPORTED, NOT RENDERED. inc.16 refuses to coerce a row it does not
//     understand; that refusal is worthless if the route quietly shows `failed` and moves
//     on. The reason (a COLUMN NAME, never a value) travels in `diagnostics`, the same
//     shape as `/api/views`'s `broken[]`, so it can be logged and flagged. Same for
//     `droppedSegments`, which 0021's CHECKs make impossible — one appearing is news.
//
//  4. NO TRANSCRIPT TEXT MAY REACH A LOG. Established at inc.13 for the webhook and it
//     holds harder here: this is a read surface anyone with a sid can hit. The log
//     projection is counts and states only, and a test pins that the words are not in it.

import type { TranscriptLoad } from "./transcriptRead";
import type { TranscriptView } from "./transcriptView";

/**
 * Twilio recording SIDs: `RE` + 32 hex, case-insensitive on the hex half.
 *
 * Pinned as a constant so the route and its tests cannot drift apart on what counts as
 * askable.
 */
export const RECORDING_SID_PATTERN = /^RE[0-9a-fA-F]{32}$/;

/** The sid to query, or null when it is not one Twilio could have issued. Never guessed. */
export function parseRecordingSid(raw: string | null | undefined): string | null {
  const sid = (raw ?? "").trim();
  return RECORDING_SID_PATTERN.test(sid) ? sid : null;
}

/** Diagnostics: things a reader does not need and an operator must not miss. */
export type TranscriptDiagnostics = {
  /** The column that made the stored row untrustworthy. Absent when the row was fine. */
  unreadable?: string;
  /** Segment rows 0021's CHECKs should have made impossible. Absent when zero. */
  droppedSegments?: number;
};

export type TranscriptResponse = {
  recordingSid: string;
  view: TranscriptView;
  /** Present only when there is something to report — an empty object is noise. */
  diagnostics?: TranscriptDiagnostics;
};

/**
 * The body for a resolved read.
 *
 * `missing` and `pending` both arrive here as a `pending` view (inc.16 collapses them at
 * that last layer on purpose) and neither is an error: a call recorded thirty seconds ago
 * has no transcript yet, and a 404 would tell the caller the CALL does not exist.
 */
export function transcriptResponse(
  recordingSid: string,
  view: TranscriptView,
  load: TranscriptLoad
): TranscriptResponse {
  const diagnostics: TranscriptDiagnostics = {};
  if (load.kind === "unreadable") diagnostics.unreadable = load.reason;
  if (load.kind === "loaded" && load.droppedSegments > 0) {
    diagnostics.droppedSegments = load.droppedSegments;
  }
  return {
    recordingSid,
    view,
    ...(Object.keys(diagnostics).length ? { diagnostics } : {}),
  };
}

/**
 * What the server may say about a read.
 *
 * Counts, states and column names — no `text`, no speaker content, no error string from the
 * provider (a Deepgram error can quote the audio's metadata). `turns`/`segments` are the
 * numbers that answer "did this return anything", which is the only operational question a
 * log line here needs to answer.
 */
export function transcriptReadLog(
  recordingSid: string,
  view: TranscriptView,
  load: TranscriptLoad
): Record<string, string | number> {
  const line: Record<string, string | number> = {
    at: "calls.transcript.read",
    recordingSid,
    load: load.kind,
    state: view.state,
    turns: view.turns.length,
  };
  if (load.kind === "unreadable") line.unreadable = load.reason;
  if (load.kind === "loaded") {
    line.status = load.transcript.status;
    line.segments = load.segments.length;
    if (load.droppedSegments > 0) line.dropped = load.droppedSegments;
  }
  return line;
}
