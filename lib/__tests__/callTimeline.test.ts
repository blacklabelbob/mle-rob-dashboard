import { describe, it, expect } from "vitest";
import { awaitingSummaryLine, callDetail, formatDuration } from "@/lib/calls/callTimeline";

const callRow = (over: Record<string, unknown> = {}) => ({
  id: "REbeef",
  type: "call",
  person_id: "p1",
  summary: null,
  action_items: null,
  buying_signals: null,
  recording_url: "https://api.twilio.com/rec/REbeef",
  source_context: { direction: "inbound", durationSec: 204, callSid: "CA1" },
  ...over,
});

describe("formatDuration", () => {
  it("formats m:ss and pads seconds", () => {
    expect(formatDuration(204)).toBe("3:24");
    expect(formatDuration(9)).toBe("0:09");
  });

  it("goes to h:mm:ss past an hour", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("keeps a real zero-second recording but refuses a missing duration", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration("204")).toBeNull();
    expect(formatDuration(-1)).toBeNull();
    expect(formatDuration(NaN)).toBeNull();
  });
});

describe("callDetail", () => {
  it("ignores rows that are not calls", () => {
    expect(callDetail({ type: "email", summary: "hi" })).toBeNull();
    expect(callDetail({ summary: "hi" })).toBeNull();
  });

  it("still returns a detail for a call carrying nothing but its type", () => {
    const d = callDetail({ type: "call" });
    expect(d).not.toBeNull();
    expect(d!.state).toBe("awaiting-summary");
    expect(d!.duration).toBeNull();
    expect(d!.direction).toBeNull();
    expect(d!.recordingUrl).toBeNull();
  });

  it("reads direction, duration and recording out of the filed row", () => {
    const d = callDetail(callRow())!;
    expect(d.direction).toBe("inbound");
    expect(d.duration).toBe("3:24");
    expect(d.recordingUrl).toBe("https://api.twilio.com/rec/REbeef");
    expect(d.truncated).toBe(false);
  });

  // The distinction inc.11 wrote the empty arrays to preserve, one layer from the reader.
  it("keeps null (never summarised) apart from [] (summarised, nothing to do)", () => {
    expect(callDetail(callRow())!.actionItems).toBeNull();
    expect(callDetail(callRow())!.signals).toBeNull();
    const summarised = callDetail(
      callRow({ summary: "Roof leak, wants Tuesday.", action_items: [], buying_signals: [] })
    )!;
    expect(summarised.actionItems).toEqual([]);
    expect(summarised.signals).toEqual([]);
    expect(summarised.state).toBe("summarised");
  });

  it("drops a signal with no quote — evidence a rep cannot check is not shown", () => {
    const d = callDetail(
      callRow({
        summary: "s",
        buying_signals: [
          { label: "budget", quote: "we set aside 20k" },
          { label: "urgency" },
          { label: "", quote: "x" },
          "nope",
        ],
      })
    )!;
    expect(d.signals).toEqual([{ label: "budget", quote: "we set aside 20k" }]);
  });

  it("blank summary prose reads as awaiting, not as summarised", () => {
    expect(callDetail(callRow({ summary: "   " }))!.state).toBe("awaiting-summary");
  });

  it("surfaces the truncation flag from source_context", () => {
    const d = callDetail(callRow({ summary: "s", source_context: { summaryTruncated: true } }))!;
    expect(d.truncated).toBe(true);
  });

  it("accepts the camelCase shape too, so a mapped Activity does not silently blank", () => {
    const d = callDetail({
      type: "call",
      summary: "s",
      actionItems: ["call back"],
      recordingUrl: "https://x/rec",
      sourceContext: { direction: "outbound", durationSec: 61 },
    })!;
    expect(d.actionItems).toEqual(["call back"]);
    expect(d.direction).toBe("outbound");
    expect(d.duration).toBe("1:01");
    expect(d.recordingUrl).toBe("https://x/rec");
  });
});

describe("awaitingSummaryLine", () => {
  it("states only what is certain about the call", () => {
    expect(awaitingSummaryLine(callDetail(callRow())!)).toBe(
      "Inbound call · 3:24 · recorded — summary not written yet"
    );
  });

  it("never claims a recording it does not have, nor guesses the reason", () => {
    const line = awaitingSummaryLine(callDetail({ type: "call" })!);
    expect(line).toBe("Call · summary not written yet");
    expect(line).not.toMatch(/deepgram|failed|error|transcri/i);
  });
});
