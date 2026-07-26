import { describe, expect, it } from "vitest";
import {
  MAX_QUERY_LENGTH,
  parseSearchQuery,
  searchQueryError,
  searchSection,
  searchableSegments,
  transcriptSearchLog,
} from "@/lib/calls/transcriptSearchResponse";
import { transcriptView } from "@/lib/calls/transcriptView";
import type { TranscriptSegment } from "@/lib/calls/transcriptSegments";
import type { TranscriptLoad } from "@/lib/calls/transcriptRead";

const CALL: TranscriptSegment[] = [
  { idx: 0, startMs: 0, endMs: 900, speaker: "0", text: "Thanks for calling, this is Rob." },
  { idx: 1, startMs: 1000, endMs: 1900, speaker: "1", text: "I need a quote for a new roof." },
  {
    idx: 2,
    startMs: 2000,
    endMs: 2900,
    speaker: "0",
    text: "We can do fifteen thousand for that roof.",
  },
];

function loaded(segments: TranscriptSegment[], status: "complete" | "pending" = "complete") {
  const load: TranscriptLoad = {
    kind: "loaded",
    transcript: { id: "t1", recordingSid: "RE" + "a".repeat(32), status, provider: "deepgram" },
    segments,
    droppedSegments: 0,
  };
  return { load, view: transcriptView(status, segments) };
}

describe("parseSearchQuery", () => {
  it("absent q is ABSENT, never an empty search", () => {
    expect(parseSearchQuery(null)).toEqual({ kind: "absent" });
    expect(parseSearchQuery(undefined)).toEqual({ kind: "absent" });
  });

  it("present-but-empty q is refused, not treated as no search", () => {
    expect(parseSearchQuery("")).toEqual({ kind: "invalid", reason: "empty" });
    expect(parseSearchQuery("   ")).toEqual({ kind: "invalid", reason: "empty" });
  });

  it("refuses an over-long query rather than truncating it", () => {
    const long = "a".repeat(MAX_QUERY_LENGTH + 1);
    expect(parseSearchQuery(long)).toEqual({ kind: "invalid", reason: "too-long" });
    expect(parseSearchQuery("a".repeat(MAX_QUERY_LENGTH)).kind).toBe("query");
  });

  it("measures the length the MATCHER will see, not the raw string", () => {
    // Whitespace folds, so a padded query at the limit is still a legal question.
    const padded = "  " + "a".repeat(MAX_QUERY_LENGTH) + "  ";
    expect(parseSearchQuery(padded)).toEqual({ kind: "query", query: padded });
  });

  it("carries the query through unmodified — folding is the matcher's job", () => {
    expect(parseSearchQuery("Fifteen  Thousand")).toEqual({
      kind: "query",
      query: "Fifteen  Thousand",
    });
  });

  it("states the limit in the error, never echoes the value", () => {
    expect(searchQueryError("empty")).toBe("q must not be empty");
    expect(searchQueryError("too-long")).toContain(String(MAX_QUERY_LENGTH));
  });
});

describe("searchSection", () => {
  it("returns nothing at all for an absent query", () => {
    const { view, load } = loaded(CALL);
    expect(searchSection(view, load, { kind: "absent" })).toBeNull();
    expect(searchSection(view, load, { kind: "invalid", reason: "empty" })).toBeNull();
  });

  it("finds the moment and carries the seek target", () => {
    const { view, load } = loaded(CALL);
    const result = searchSection(view, load, { kind: "query", query: "fifteen thousand" });
    expect(result?.state).toBe("results");
    if (result?.state !== "results") throw new Error("expected results");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].idx).toBe(2);
    expect(result.matches[0].startMs).toBe(2000);
  });

  it("a pending call is UNSEARCHABLE, never zero matches", () => {
    const { view, load } = loaded([], "pending");
    const result = searchSection(view, load, { kind: "query", query: "refund" });
    expect(result).toEqual({ state: "unsearchable", reason: "pending", matches: [] });
  });

  it("a call whose row cannot be read is unsearchable, not silently empty", () => {
    const load: TranscriptLoad = { kind: "unreadable", reason: "status" };
    const view = { state: "failed" as const, turns: [], speakerCount: 0, endMs: null };
    expect(searchSection(view, load, { kind: "query", query: "roof" })).toEqual({
      state: "unsearchable",
      reason: "failed",
      matches: [],
    });
    expect(searchableSegments(load)).toEqual([]);
  });

  it("searches the segments the VIEW was built from", () => {
    const { view, load } = loaded(CALL);
    expect(searchableSegments(load)).toHaveLength(3);
    const result = searchSection(view, load, { kind: "query", query: "roof" });
    if (result?.state !== "results") throw new Error("expected results");
    // Both turns say "roof" — call order, never ranked.
    expect(result.matches.map((m) => m.idx)).toEqual([1, 2]);
  });
});

describe("transcriptSearchLog", () => {
  it("never carries the query text or a snippet", () => {
    const { view, load } = loaded(CALL);
    const result = searchSection(view, load, { kind: "query", query: "fifteen thousand" });
    if (!result) throw new Error("expected a result");
    const line = JSON.stringify(transcriptSearchLog(result));
    expect(line).not.toContain("fifteen");
    expect(line).not.toContain("roof");
    expect(transcriptSearchLog(result)).toEqual({
      search: "results",
      queryLength: "fifteen thousand".length,
      matches: 1,
    });
  });

  it("reports no match COUNT for a state that produced no verdict", () => {
    const line = transcriptSearchLog({ state: "unsearchable", reason: "pending", matches: [] });
    expect(line).toEqual({ search: "unsearchable", searchReason: "pending" });
    expect(line.matches).toBeUndefined();
  });
});
