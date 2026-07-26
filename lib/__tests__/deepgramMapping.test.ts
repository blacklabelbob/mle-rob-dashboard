import { describe, expect, it } from "vitest";
import {
  DEEPGRAM_PROVIDER,
  mapDeepgramResponse,
  secondsToMs,
  speakerLabel,
  transcriptText,
} from "@/lib/calls/deepgram";
import { segmentRejection, transcriptRowRejection } from "@/lib/calls/transcriptSegments";

const SID = "RE0123456789abcdef0123456789abcdef";

function utteranceResponse() {
  return {
    metadata: { duration: 12.34, models: ["nova-3"], language: "en-US" },
    results: {
      utterances: [
        { start: 0.5, end: 2.25, transcript: "Hey Caleb, it's Rob.", speaker: 0, confidence: 0.97 },
        { start: 2.3, end: 5.0, transcript: "Hey Rob, thanks for calling back.", speaker: 1, confidence: 0.95 },
      ],
    },
  };
}

describe("secondsToMs", () => {
  it("rounds fractional seconds to integer milliseconds", () => {
    expect(secondsToMs(1.2345)).toBe(1235);
    expect(secondsToMs(0)).toBe(0);
  });

  it("refuses negatives and non-numbers rather than coercing them", () => {
    expect(secondsToMs(-1)).toBeUndefined();
    expect(secondsToMs("2.5")).toBeUndefined();
    expect(secondsToMs(null)).toBeUndefined();
    expect(secondsToMs(NaN)).toBeUndefined();
  });
});

describe("speakerLabel", () => {
  it("keeps speaker 0 — the falsy-index bug that un-attributes half a two-party call", () => {
    expect(speakerLabel(0)).toBe("speaker-0");
    expect(speakerLabel(1)).toBe("speaker-1");
  });

  it("falls back to the channel when diarisation did not run", () => {
    expect(speakerLabel(undefined, 0)).toBe("channel-0");
    expect(speakerLabel(null, 1)).toBe("channel-1");
  });

  it("is undefined when neither is present, never a made-up name", () => {
    expect(speakerLabel(undefined)).toBeUndefined();
    expect(speakerLabel(-1, -1)).toBeUndefined();
  });
});

describe("mapDeepgramResponse", () => {
  it("maps utterances to speaker-attributed segments the schema accepts", () => {
    const m = mapDeepgramResponse(SID, utteranceResponse())!;
    expect(m.source).toBe("utterances");
    expect(m.transcript.status).toBe("complete");
    expect(m.transcript.provider).toBe(DEEPGRAM_PROVIDER);
    expect(m.transcript.model).toBe("nova-3");
    expect(m.transcript.durationMs).toBe(12340);
    expect(m.segments).toHaveLength(2);
    expect(m.segments[0]).toMatchObject({ idx: 0, startMs: 500, endMs: 2250, speaker: "speaker-0" });
    expect(m.segments[1]).toMatchObject({ idx: 1, speaker: "speaker-1" });
    expect(transcriptRowRejection(m.transcript)).toBeNull();
    for (const s of m.segments) expect(segmentRejection(s)).toBeNull();
  });

  it("ties the transcript to the same activity the webhook filed", () => {
    const m = mapDeepgramResponse(SID, utteranceResponse())!;
    expect(m.transcript.activityId).toBe(`dialer-${SID}`);
    expect(m.transcript.recordingSid).toBe(SID);
  });

  it("refuses to map without a recording sid — identity is never invented", () => {
    expect(mapDeepgramResponse(null, utteranceResponse())).toBeNull();
    expect(mapDeepgramResponse("  ", utteranceResponse())).toBeNull();
  });

  it("reassigns idx from time order, so an out-of-order payload cannot collide", () => {
    const m = mapDeepgramResponse(SID, {
      results: {
        utterances: [
          { start: 9, end: 10, transcript: "later", speaker: 1 },
          { start: 1, end: 2, transcript: "earlier", speaker: 0 },
        ],
      },
    })!;
    expect(m.segments.map((s) => s.text)).toEqual(["earlier", "later"]);
    expect(m.segments.map((s) => s.idx)).toEqual([0, 1]);
  });

  it("falls back to paragraph sentences when utterances are absent", () => {
    const m = mapDeepgramResponse(SID, {
      metadata: { duration: 4 },
      results: {
        channels: [
          {
            alternatives: [
              {
                transcript: "One. Two.",
                paragraphs: {
                  paragraphs: [
                    { speaker: 0, sentences: [{ text: "One.", start: 0, end: 1 }, { text: "Two.", start: 1, end: 2 }] },
                  ],
                },
              },
            ],
          },
        ],
      },
    })!;
    expect(m.source).toBe("paragraphs");
    expect(m.segments).toHaveLength(2);
    expect(m.segments.every((s) => s.speaker === "speaker-0")).toBe(true);
  });

  it("falls back to one call-spanning segment when only a flat transcript exists", () => {
    const m = mapDeepgramResponse(SID, {
      metadata: { duration: 6.5 },
      results: { channels: [{ alternatives: [{ transcript: "whole call", confidence: 0.8 }] }] },
    })!;
    expect(m.source).toBe("alternative");
    expect(m.segments).toEqual([{ idx: 0, startMs: 0, endMs: 6500, text: "whole call", confidence: 0.8 }]);
  });

  it("treats an empty transcript as complete-with-nothing, not failed (silence is not an error)", () => {
    const m = mapDeepgramResponse(SID, {
      metadata: { duration: 3 },
      results: { channels: [{ alternatives: [{ transcript: "" }] }] },
    })!;
    expect(m.transcript.status).toBe("complete");
    expect(m.transcript.error).toBeUndefined();
    expect(m.segments).toHaveLength(0);
    expect(m.source).toBe("none");
    expect(transcriptRowRejection(m.transcript)).toBeNull();
  });

  it("carries Deepgram's own reason on failure instead of a generic message", () => {
    const m = mapDeepgramResponse(SID, {
      err_code: "REMOTE_CONTENT_ERROR",
      err_msg: "could not fetch the remote audio",
    })!;
    expect(m.transcript.status).toBe("failed");
    expect(m.transcript.error).toBe("REMOTE_CONTENT_ERROR: could not fetch the remote audio");
    expect(m.segments).toHaveLength(0);
    expect(transcriptRowRejection(m.transcript)).toBeNull();
  });

  it("drops an unusable confidence but keeps the words", () => {
    const m = mapDeepgramResponse(SID, {
      results: { utterances: [{ start: 0, end: 1, transcript: "kept", speaker: 0, confidence: 1.5 }] },
    })!;
    expect(m.segments).toHaveLength(1);
    expect(m.segments[0].text).toBe("kept");
    expect(m.segments[0].confidence).toBeUndefined();
  });

  it("drops only the broken utterance and reports the constraint it broke", () => {
    const m = mapDeepgramResponse(SID, {
      results: {
        utterances: [
          { start: 0, end: 1, transcript: "good", speaker: 0 },
          { start: 5, end: 2, transcript: "reversed span", speaker: 1 },
          { start: 6, end: 7, transcript: "   ", speaker: 0 },
        ],
      },
    })!;
    expect(m.segments.map((s) => s.text)).toEqual(["good"]);
    expect(m.rejected.map((r) => r.reason).sort()).toEqual(["span", "text"]);
  });

  it("is deterministic — two runs over one payload produce identical rows", () => {
    const a = mapDeepgramResponse(SID, utteranceResponse());
    const b = mapDeepgramResponse(SID, utteranceResponse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("survives a garbage payload without throwing", () => {
    for (const junk of [null, undefined, {}, { results: {} }, { results: { channels: [] } }, { results: { utterances: [null] } }]) {
      const m = mapDeepgramResponse(SID, junk as never)!;
      expect(m.transcript.status).toBe("complete");
      expect(m.segments).toHaveLength(0);
    }
  });
});

describe("transcriptText", () => {
  it("renders speaker-prefixed lines from the segments, not a second stored copy", () => {
    const m = mapDeepgramResponse(SID, utteranceResponse())!;
    expect(transcriptText(m.segments)).toBe(
      "speaker-0: Hey Caleb, it's Rob.\nspeaker-1: Hey Rob, thanks for calling back."
    );
  });

  it("omits the prefix when nothing was attributed", () => {
    expect(transcriptText([{ idx: 0, startMs: 0, endMs: 1, text: "solo" }])).toBe("solo");
  });
});
