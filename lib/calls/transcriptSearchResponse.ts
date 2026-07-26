// BUILD-QUEUE Q68 (b) inc.24 — MOMENT SEARCH REACHES THE DOOR: `?q=` on the transcript route.
//
// inc.23 collected the promise that shaped the schema (segments over a blob, so a phrase can
// be FOUND and SEEKED to) and, like every pure seam before it, nothing called it. This is the
// decision half that lets a caller ask — what counts as a question, what the body may answer,
// and what a log line may say about it. The route stays store I/O only (CR-3).
//
// FOUR RULES THAT ARE NOT OBVIOUS:
//
//  1. NO `q` IS NOT AN EMPTY SEARCH. A transcript request without a query gets NO `search`
//     key at all — not `{state:"idle", matches:[]}`. A caller that renders "0 results" for a
//     page nobody searched is showing a verdict about a question that was never asked, and
//     `idle` in the body is the shape that invites it. Absent means absent.
//
//  2. `?q=` PRESENT AND EMPTY IS A 400, NOT A SILENT NO-OP. Same call as `browserView`'s
//     present-but-empty view (inc.3): a cleared search box that still sends the parameter is
//     a client bug, and answering it with the full unsearched transcript hides that bug for
//     as long as it exists. A refusal is visible the first time it happens.
//
//  3. THE QUERY AND THE SNIPPETS NEVER REACH A LOG. inc.17's rule (no transcript text in a
//     log line) survives search or it did not exist: `snippet` IS verbatim customer speech,
//     and the query is the phrase a rep believes was said. The log carries the query's
//     LENGTH and the match COUNT — enough to answer "did search run and find anything",
//     which is the only operational question here.
//
//  4. A LONG QUERY IS REFUSED, NOT TRUNCATED. Cutting a needle to fit changes what was asked
//     and then answers it confidently: a rep searching a long quote would get matches for a
//     prefix they never typed. `foldQuery` decides the length so the cap counts the same
//     characters the matcher will.

import { searchTranscript, type TranscriptSearchResult, foldQuery } from "./transcriptSearch";
import type { TranscriptLoad } from "./transcriptRead";
import type { TranscriptView } from "./transcriptView";

/**
 * Longest phrase we will look for, in folded characters.
 *
 * Generous — a rep quoting a whole sentence back at a call is the point — and finite, because
 * the parameter is free text on a route that opens a database connection behind it.
 */
export const MAX_QUERY_LENGTH = 200;

export type ParsedSearchQuery =
  /** No `q` parameter. The caller wants the transcript, not an answer about it. */
  | { kind: "absent" }
  | { kind: "query"; query: string }
  | { kind: "invalid"; reason: "empty" | "too-long" };

/**
 * What the caller asked, or why it is not a question.
 *
 * `null`/`undefined` (the parameter is not there) and `""` (it is there and says nothing) are
 * deliberately DIFFERENT answers — see rules 1 and 2. The raw text is carried through
 * unmodified; folding is the matcher's job, and a query trimmed here would stop matching text
 * that legitimately begins with a space.
 */
export function parseSearchQuery(raw: string | null | undefined): ParsedSearchQuery {
  if (raw === null || raw === undefined) return { kind: "absent" };
  const folded = foldQuery(raw);
  if (!folded) return { kind: "invalid", reason: "empty" };
  if (folded.length > MAX_QUERY_LENGTH) return { kind: "invalid", reason: "too-long" };
  return { kind: "query", query: raw };
}

/** The 400 body for a `q` we refuse. States the limit rather than the value we were given. */
export function searchQueryError(reason: "empty" | "too-long"): string {
  return reason === "empty"
    ? "q must not be empty"
    : `q must be at most ${MAX_QUERY_LENGTH} characters`;
}

/**
 * The segments a search may look at — the ones the VIEW was built from, never a second read.
 *
 * A `missing` or `unreadable` load has none, which is what makes `searchTranscript` answer
 * `unsearchable` for exactly the calls whose words are not on the table.
 */
export function searchableSegments(load: TranscriptLoad) {
  return load.kind === "loaded" ? load.segments : [];
}

/**
 * The `search` section of a transcript response, or nothing at all.
 *
 * Returns `null` for an absent query so the route can spread it away — see rule 1. Every
 * other state (including `unsearchable`) is a real answer and travels.
 */
export function searchSection(
  view: TranscriptView,
  load: TranscriptLoad,
  parsed: ParsedSearchQuery
): TranscriptSearchResult | null {
  if (parsed.kind !== "query") return null;
  return searchTranscript(view, searchableSegments(load), parsed.query);
}

/**
 * What the server may say about a search.
 *
 * Length and count only (rule 3). `queryLength` is the FOLDED length, so it describes what
 * was actually looked for; `matches` is absent for a state that produced no verdict, because
 * `matches: 0` next to `unsearchable` reads as "searched, found nothing".
 */
export function transcriptSearchLog(
  result: TranscriptSearchResult
): Record<string, string | number> {
  const line: Record<string, string | number> = { search: result.state };
  if (result.state === "unsearchable") line.searchReason = result.reason;
  if (result.state === "results") {
    line.queryLength = result.query.length;
    line.matches = result.matches.length;
  }
  return line;
}
