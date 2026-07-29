// Q71 Phase 4 item 1 — the five load-bearing decisions in `firefliesMapping.ts`, each
// tested as the thing that would break if it were decided the other way.
//
// Fixture data is INVENTED, not copied out of the 13 real exports: a suite pasted from the
// meeting files would carry the real names and links this whole queue item exists to keep
// out of git, and `guard:pii` would be right to fail it. The shape is the real shape; the
// content is not real.

import { describe, expect, it } from "vitest";

import {
  FIREFLIES_KEY_PREFIX,
  FIREFLIES_PROVIDER,
  derivedDurationMs,
  firefliesKey,
  mapFirefliesTranscript,
  secondsToMs,
} from "@/lib/calls/firefliesMapping";
import { RECORDING_SID_PATTERN } from "@/lib/calls/transcriptResponse";
import { transcriptRowRejection } from "@/lib/calls/transcriptSegments";

/** The shape of a Fireflies export, with content that could not identify anyone. */
function fixture(over: Record<string, unknown> = {}) {
  return {
    id: "01TESTULID0000000000000000",
    title: "Internal sync",
    dateString: "2026-06-16T17:10:59.000Z",
    duration: 5,
    sentences: [
      { index: 0, speaker_name: "Speaker One", raw_text: "Morning.", start_time: 93.67, end_time: 99.27 },
      { index: 1, speaker_name: "Speaker Two", raw_text: "Morning.", start_time: 99.51, end_time: 99.91 },
      { index: 2, speaker_name: "Speaker One", raw_text: "Last thing.", start_time: 160.2, end_time: 166.95 },
    ],
    ...over,
  };
}

describe("decision 1 — identity is derived and namespaced", () => {
  it("keys on `fireflies-<id>`, so two runs of the load upsert one row", () => {
    expect(firefliesKey("01TESTULID0000000000000000")).toBe(`${FIREFLIES_KEY_PREFIX}01TESTULID0000000000000000`);
    expect(mapFirefliesTranscript(fixture())!.transcript.recordingSid).toBe(
      mapFirefliesTranscript(fixture())!.transcript.recordingSid
    );
  });

  it("refuses a file with no id — no stable key means no idempotent load", () => {
    expect(firefliesKey(undefined)).toBeNull();
    expect(firefliesKey("   ")).toBeNull();
    expect(mapFirefliesTranscript(fixture({ id: "" }))).toBeNull();
    expect(mapFirefliesTranscript(null)).toBeNull();
  });

  // THE SAFETY PROPERTY, not a style check: the only public route into transcript content
  // validates the sid against this pattern. A meeting key must fail it structurally, so
  // internal transcripts stay unreachable there while prod has no login.
  it("produces a sid the public transcript route rejects by shape", () => {
    const sid = mapFirefliesTranscript(fixture())!.transcript.recordingSid;
    expect(RECORDING_SID_PATTERN.test(sid)).toBe(false);
    // Non-vacuity: the pattern does accept the thing it is meant to accept.
    expect(RECORDING_SID_PATTERN.test(`RE${"a".repeat(32)}`)).toBe(true);
  });
});

describe("decision 2 — float seconds become integer milliseconds", () => {
  it("rounds once, at the boundary", () => {
    expect(secondsToMs(93.67)).toBe(93670);
    expect(secondsToMs(99.9994)).toBe(99999);
    expect(secondsToMs(0)).toBe(0);
  });

  it("drops values 0021 could not store rather than coercing them", () => {
    expect(secondsToMs(-1)).toBeUndefined();
    expect(secondsToMs("120")).toBeUndefined();
    expect(secondsToMs(Number.NaN)).toBeUndefined();
  });

  it("every emitted offset is a non-negative integer", () => {
    const { segments } = mapFirefliesTranscript(fixture())!;
    expect(segments.length).toBe(3);
    for (const seg of segments) {
      expect(Number.isInteger(seg.startMs)).toBe(true);
      expect(Number.isInteger(seg.endMs)).toBe(true);
      expect(seg.endMs).toBeGreaterThanOrEqual(seg.startMs);
    }
    expect(segments[0].startMs).toBe(93670);
  });
});

describe("decision 3 — duration comes from the last spoken word, not `duration`", () => {
  it("ignores a `duration` that contradicts the transcript", () => {
    // The real 01KV8PMM… file carries `duration: 5` on a meeting ending at 166.95s.
    const mapped = mapFirefliesTranscript(fixture())!;
    expect(mapped.transcript.durationMs).toBe(166950);
    expect(mapped.transcript.durationMs).not.toBe(5);
    expect(mapped.transcript.durationMs).not.toBe(5000);
  });

  it("takes the maximum end, not the last element — order is not trusted", () => {
    const outOfOrder = fixture({
      sentences: [
        { speaker_name: "A", raw_text: "later", start_time: 160.2, end_time: 166.95 },
        { speaker_name: "B", raw_text: "earlier", start_time: 1, end_time: 2 },
      ],
    });
    expect(mapFirefliesTranscript(outOfOrder)!.transcript.durationMs).toBe(166950);
  });

  it("omits duration entirely when nothing usable was said — 0 would be a claim", () => {
    expect(derivedDurationMs([])).toBeUndefined();
    const silent = mapFirefliesTranscript(fixture({ sentences: [] }))!;
    expect(silent.transcript.durationMs).toBeUndefined();
    expect("durationMs" in silent.transcript).toBe(false);
    expect(silent.segments).toEqual([]);
  });
});

describe("decision 4 — confidence is omitted, never defaulted", () => {
  it("emits no confidence key at all", () => {
    const { segments } = mapFirefliesTranscript(fixture())!;
    for (const seg of segments) expect("confidence" in seg).toBe(false);
  });

  it("ignores a confidence the payload volunteers — Fireflies scores nothing", () => {
    const withScore = fixture({
      sentences: [{ speaker_name: "A", raw_text: "hi", start_time: 1, end_time: 2, confidence: 0.4 }],
    });
    expect("confidence" in mapFirefliesTranscript(withScore)!.segments[0]).toBe(false);
  });
});

describe("decision 5 — status is complete and `error` is absent", () => {
  it("marks a finished export complete with no error key", () => {
    const { transcript } = mapFirefliesTranscript(fixture())!;
    expect(transcript.status).toBe("complete");
    expect("error" in transcript).toBe(false);
    expect(transcript.provider).toBe(FIREFLIES_PROVIDER);
  });

  it("stays complete on an empty meeting — silence is not a failure to retry", () => {
    expect(mapFirefliesTranscript(fixture({ sentences: [] }))!.transcript.status).toBe("complete");
  });

  it("files no activity id — `dialer-…` would point at a call that never happened", () => {
    expect("activityId" in mapFirefliesTranscript(fixture())!.transcript).toBe(false);
  });

  // The end-to-end guarantee: 0021's own CHECK mirror accepts every row we would write.
  it("passes `transcriptRowRejection` for every shape we emit", () => {
    for (const f of [fixture(), fixture({ sentences: [] }), fixture({ duration: null })]) {
      expect(transcriptRowRejection(mapFirefliesTranscript(f)!.transcript)).toBeNull();
    }
  });
});

describe("segments go through normalizeSegments, not around it", () => {
  it("reassigns idx from time order and reports what it dropped", () => {
    const messy = fixture({
      sentences: [
        { index: 9, speaker_name: "A", raw_text: "second", start_time: 20, end_time: 21 },
        { index: 9, speaker_name: "A", raw_text: "   ", start_time: 5, end_time: 6 },
        { index: 3, speaker_name: "B", raw_text: "first", start_time: 1, end_time: 2 },
        { index: 4, speaker_name: "B", raw_text: "no offsets", start_time: null, end_time: null },
      ],
    });
    const { segments, rejected } = mapFirefliesTranscript(messy)!;
    expect(segments.map((s) => s.idx)).toEqual([0, 1]);
    expect(segments.map((s) => s.text)).toEqual(["first", "second"]);
    expect(rejected.map((r) => r.reason).sort()).toEqual(["start_ms", "text"]);
  });

  it("keeps the speaker's name verbatim — no role guessing", () => {
    expect(mapFirefliesTranscript(fixture())!.segments[0].speaker).toBe("Speaker One");
    const unnamed = fixture({ sentences: [{ raw_text: "hi", start_time: 1, end_time: 2 }] });
    expect("speaker" in mapFirefliesTranscript(unnamed)!.segments[0]).toBe(false);
  });

  it("survives a file whose sentences are not an array", () => {
    const broken = mapFirefliesTranscript(fixture({ sentences: "nope" }))!;
    expect(broken.segments).toEqual([]);
    expect(broken.transcript.status).toBe("complete");
  });

  it("is deterministic — two maps of the same input are identical", () => {
    expect(mapFirefliesTranscript(fixture())).toEqual(mapFirefliesTranscript(fixture()));
  });
});
