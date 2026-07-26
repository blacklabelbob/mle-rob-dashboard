import { describe, expect, it } from "vitest";
import {
  MAX_ACTION_ITEMS,
  MAX_BUYING_SIGNALS,
  MAX_SUMMARY_CHARS,
  buildSummaryPrompt,
  fitTranscript,
  parseCallSummary,
  summarizable,
} from "@/lib/calls/callSummary";
import type { TranscriptSegment } from "@/lib/calls/transcriptSegments";

function seg(idx: number, text: string, speaker?: string): TranscriptSegment {
  return { idx, startMs: idx * 1000, endMs: idx * 1000 + 900, text, speaker };
}

const CALL: TranscriptSegment[] = [
  seg(0, "Hey Caleb, it's Rob following up on the roof estimate.", "0"),
  seg(1, "Yeah, we're ready to move forward if the price holds.", "1"),
  seg(2, "I'll send the agreement over Monday.", "0"),
];

describe("summarizable", () => {
  it("refuses an empty transcript — silence must not acquire a paragraph", () => {
    expect(summarizable([])).toBe(false);
    expect(summarizable([seg(0, "   ")])).toBe(false);
  });

  it("accepts a transcript with any words", () => {
    expect(summarizable(CALL)).toBe(true);
  });
});

describe("fitTranscript", () => {
  it("leaves a normal call untouched and reports no truncation", () => {
    const out = fitTranscript("short call");
    expect(out).toEqual({ text: "short call", truncated: false });
  });

  it("keeps the TAIL when it truncates — commitments live at the end", () => {
    const text = `${"a".repeat(500)}SIGNING MONDAY`;
    const out = fitTranscript(text, 200);
    expect(out.truncated).toBe(true);
    expect(out.text.endsWith("SIGNING MONDAY")).toBe(true);
    expect(out.text).toContain("elided");
    expect(out.text.length).toBeLessThanOrEqual(200);
  });

  it("keeps some head as well, so the model still sees the framing", () => {
    const text = `OPENING${"b".repeat(500)}CLOSING`;
    const out = fitTranscript(text, 300);
    expect(out.text.startsWith("OPENING")).toBe(true);
    expect(out.text.endsWith("CLOSING")).toBe(true);
  });

  it("a zero/invalid budget yields nothing, still flagged truncated", () => {
    expect(fitTranscript("words", 0)).toEqual({ text: "", truncated: true });
    expect(fitTranscript("", 0)).toEqual({ text: "", truncated: false });
  });
});

describe("buildSummaryPrompt", () => {
  it("renders the model input FROM the segments, speaker-labelled", () => {
    const p = buildSummaryPrompt(CALL);
    expect(p.user).toContain("0: Hey Caleb, it's Rob following up on the roof estimate.");
    expect(p.user).toContain("1: Yeah, we're ready to move forward if the price holds.");
    expect(p.truncated).toBe(false);
    expect(p.system).toContain("quote the transcript verbatim");
  });

  it("propagates truncation instead of hiding it", () => {
    const long = Array.from({ length: 400 }, (_, i) => seg(i, "a lot of talking here"));
    expect(buildSummaryPrompt(long, 500).truncated).toBe(true);
  });
});

describe("parseCallSummary — refusals", () => {
  it("refuses a non-object answer", () => {
    for (const raw of [null, undefined, 42, "not json", [], '["a"]']) {
      expect(parseCallSummary(raw, CALL).kind).toBe("rejected");
    }
  });

  it("refuses an answer with no summary rather than storing half of it", () => {
    const out = parseCallSummary({ action_items: ["Send agreement"] }, CALL);
    expect(out).toEqual({ kind: "rejected", reason: "summary" });
  });

  it("refuses a blank summary — whitespace is not a summary", () => {
    expect(parseCallSummary({ summary: "   " }, CALL)).toEqual({
      kind: "rejected",
      reason: "summary",
    });
  });

  it("never uses the raw model text as a fallback summary", () => {
    const out = parseCallSummary("I'm sorry, I can't help with that.", CALL);
    expect(out.kind).toBe("rejected");
  });
});

describe("parseCallSummary — grounding", () => {
  it("DROPS a buying signal whose quote is not in the transcript", () => {
    const out = parseCallSummary(
      {
        summary: "Rob followed up on the estimate.",
        buying_signals: [
          { label: "Budget approved", quote: "we already have the money wired" },
          { label: "Ready to proceed", quote: "we're ready to move forward if the price holds" },
        ],
      },
      CALL
    );
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.value.buyingSignals).toEqual([
      { label: "Ready to proceed", quote: "we're ready to move forward if the price holds" },
    ]);
  });

  it("drops a signal with no quote at all — unverifiable is not storable", () => {
    const out = parseCallSummary(
      { summary: "s", buying_signals: [{ label: "Seemed keen" }] },
      CALL
    );
    expect(out.kind === "ok" && out.value.buyingSignals).toEqual([]);
  });

  it("matches quotes across whitespace and case differences", () => {
    const out = parseCallSummary(
      {
        summary: "s",
        buying_signals: [{ label: "Timeline", quote: "I'll   SEND the agreement\n over Monday." }],
      },
      CALL
    );
    expect(out.kind === "ok" && out.value.buyingSignals.length).toBe(1);
  });
});

describe("parseCallSummary — shaping", () => {
  it("accepts fenced JSON (a formatting slip, not a content one)", () => {
    const out = parseCallSummary(
      '```json\n{"summary":"Followed up on the estimate.","action_items":["Send the agreement Monday"]}\n```',
      CALL
    );
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.value.summary).toBe("Followed up on the estimate.");
    expect(out.value.actionItems).toEqual(["Send the agreement Monday"]);
  });

  it("accepts camelCase keys too", () => {
    const out = parseCallSummary(
      { summary: "s", actionItems: ["Do it"], buyingSignals: [] },
      CALL
    );
    expect(out.kind === "ok" && out.value.actionItems).toEqual(["Do it"]);
  });

  it("drops blank/non-string action items and de-duplicates", () => {
    const out = parseCallSummary(
      {
        summary: "s",
        action_items: ["Send agreement", "  ", 7, null, "send   AGREEMENT", "Call Tuesday"],
      },
      CALL
    );
    expect(out.kind === "ok" && out.value.actionItems).toEqual(["Send agreement", "Call Tuesday"]);
  });

  it("an empty action_items array is a correct answer, not a rejection", () => {
    const out = parseCallSummary({ summary: "s", action_items: [] }, CALL);
    expect(out.kind === "ok" && out.value.actionItems).toEqual([]);
  });

  it("caps the lists so one bad answer cannot flood a timeline", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Task ${i}`);
    const signals = Array.from({ length: 40 }, (_, i) => ({
      label: `Signal ${i}`,
      quote: "we're ready to move forward if the price holds",
    }));
    const out = parseCallSummary({ summary: "s", action_items: many, buying_signals: signals }, CALL);
    expect(out.kind === "ok" && out.value.actionItems.length).toBe(MAX_ACTION_ITEMS);
    expect(out.kind === "ok" && out.value.buyingSignals.length).toBe(MAX_BUYING_SIGNALS);
  });

  it("truncates an overlong summary instead of rejecting the whole call", () => {
    const out = parseCallSummary({ summary: "x".repeat(MAX_SUMMARY_CHARS + 500) }, CALL);
    expect(out.kind === "ok" && out.value.summary.length).toBe(MAX_SUMMARY_CHARS);
  });

  it("carries the truncation flag through, stated not inferred", () => {
    const out = parseCallSummary({ summary: "s" }, CALL, { truncated: true });
    expect(out.kind === "ok" && out.value.truncated).toBe(true);
    const out2 = parseCallSummary({ summary: "s" }, CALL);
    expect(out2.kind === "ok" && out2.value.truncated).toBe(false);
  });

  it("is deterministic — same answer in, same rows out", () => {
    const answer = {
      summary: "Followed up.",
      action_items: ["Send agreement"],
      buying_signals: [{ label: "Ready", quote: "we're ready to move forward if the price holds" }],
    };
    expect(parseCallSummary(answer, CALL)).toEqual(parseCallSummary(answer, CALL));
  });
});
