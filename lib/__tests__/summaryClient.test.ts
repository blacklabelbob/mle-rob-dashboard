import { describe, expect, it } from "vitest";
import {
  SUMMARY_MODEL,
  type SummaryModelCall,
  requestCallSummary,
  summaryConfigured,
  summaryEnv,
} from "../calls/summaryClient";
import type { TranscriptSegment } from "../calls/transcriptSegments";

const KEY = { apiKey: "sk-test-key" };

const seg = (text: string, i = 0): TranscriptSegment => ({
  recording_sid: "RE1",
  segment_index: i,
  start_ms: i * 1000,
  end_ms: i * 1000 + 900,
  speaker: i % 2,
  text,
  confidence: 0.9,
});

const SEGMENTS = [
  seg("Hi, this is Caleb from CG Roofing.", 0),
  seg("We would sign Friday if the price holds.", 1),
];

const answer = {
  summary: "Caleb discussed pricing and timing.",
  action_items: ["Send the revised quote"],
  buying_signals: [{ label: "Ready to sign", quote: "We would sign Friday if the price holds." }],
};

const replying = (text: string, stopReason: string | null = "end_turn"): SummaryModelCall =>
  async () => ({ text, stopReason });

describe("summaryEnv / summaryConfigured", () => {
  it("is off with no key — the unset default, not a failure", () => {
    expect(summaryConfigured(summaryEnv({} as NodeJS.ProcessEnv))).toBe(false);
    expect(summaryConfigured({ apiKey: "" })).toBe(false);
    expect(summaryConfigured(KEY)).toBe(true);
  });

  it("reads ANTHROPIC_API_KEY", () => {
    expect(summaryEnv({ ANTHROPIC_API_KEY: "k" } as NodeJS.ProcessEnv)).toEqual({
      apiKey: "k",
    });
  });
});

describe("requestCallSummary — gates before the network", () => {
  it("is disabled with no key, and asks nothing", async () => {
    let asked = false;
    const call: SummaryModelCall = async () => {
      asked = true;
      return { text: "{}" };
    };
    const out = await requestCallSummary({ segments: SEGMENTS, env: {}, call });
    expect(out).toEqual({ kind: "disabled" });
    expect(asked).toBe(false);
  });

  it("NEVER summarises a wordless transcript — silence must not acquire a paragraph", async () => {
    let asked = false;
    const call: SummaryModelCall = async () => {
      asked = true;
      return { text: JSON.stringify(answer) };
    };
    const out = await requestCallSummary({
      segments: [seg("   "), seg("", 1)],
      env: KEY,
      call,
    });
    expect(out).toEqual({ kind: "skipped", reason: "no-speech" });
    expect(asked).toBe(false);
  });

  it("skips an empty segment list without asking", async () => {
    const out = await requestCallSummary({
      segments: [],
      env: KEY,
      call: replying(JSON.stringify(answer)),
    });
    expect(out.kind).toBe("skipped");
  });
});

describe("requestCallSummary — the request", () => {
  it("sends the pinned model, headroom, and a prompt built from the segments", async () => {
    let seen: { model: string; maxTokens: number; system: string; user: string } | null = null;
    const call: SummaryModelCall = async (req) => {
      seen = { model: req.model, maxTokens: req.maxTokens, system: req.system, user: req.user };
      return { text: JSON.stringify(answer) };
    };
    await requestCallSummary({ segments: SEGMENTS, env: KEY, call });
    expect(seen!.model).toBe(SUMMARY_MODEL);
    expect(seen!.maxTokens).toBeGreaterThanOrEqual(4_000);
    expect(seen!.system).toContain("JSON only");
    expect(seen!.user).toContain("CG Roofing");
    expect(seen!.user).toContain("sign Friday");
  });

  it("passes an abort signal so a hung provider cannot hold the invocation open", async () => {
    let hadSignal = false;
    const call: SummaryModelCall = async (req) => {
      hadSignal = req.signal instanceof AbortSignal;
      return { text: JSON.stringify(answer) };
    };
    await requestCallSummary({ segments: SEGMENTS, env: KEY, call });
    expect(hadSignal).toBe(true);
  });
});

describe("requestCallSummary — what we refuse to store", () => {
  it("stores a good answer, quote intact", async () => {
    const out = await requestCallSummary({
      segments: SEGMENTS,
      env: KEY,
      call: replying(JSON.stringify(answer)),
    });
    expect(out).toEqual({
      kind: "ok",
      value: {
        summary: "Caleb discussed pricing and timing.",
        actionItems: ["Send the revised quote"],
        buyingSignals: [
          { label: "Ready to sign", quote: "We would sign Friday if the price holds." },
        ],
        truncated: false,
      },
    });
  });

  it("REJECTS a refusal — an apology must never render as this call's summary", async () => {
    const out = await requestCallSummary({
      segments: SEGMENTS,
      env: KEY,
      call: replying("I can't help with that.", "refusal"),
    });
    expect(out).toEqual({ kind: "rejected", reason: "unusable stop reason: refusal" });
  });

  it("REJECTS a truncated reply even when the JSON happens to parse", async () => {
    const out = await requestCallSummary({
      segments: SEGMENTS,
      env: KEY,
      call: replying(JSON.stringify(answer), "max_tokens"),
    });
    expect(out).toEqual({ kind: "rejected", reason: "unusable stop reason: max_tokens" });
  });

  it("rejects a paused turn rather than treating a partial answer as final", async () => {
    const out = await requestCallSummary({
      segments: SEGMENTS,
      env: KEY,
      call: replying(JSON.stringify(answer), "pause_turn"),
    });
    expect(out.kind).toBe("rejected");
  });

  it("rejects an empty reply — a summary is optional, an invented one is not", async () => {
    const out = await requestCallSummary({
      segments: SEGMENTS,
      env: KEY,
      call: replying(""),
    });
    expect(out).toEqual({ kind: "rejected", reason: "not-json-object" });
  });

  it("rejects prose, and never falls back to the raw model text", async () => {
    const out = await requestCallSummary({
      segments: SEGMENTS,
      env: KEY,
      call: replying("Sure! Here is a summary of the call: it went well."),
    });
    expect(out.kind).toBe("rejected");
    if (out.kind === "rejected") expect(out.reason).not.toContain("it went well");
  });

  it("drops a signal the transcript does not contain, and keeps the rest", async () => {
    const out = await requestCallSummary({
      segments: SEGMENTS,
      env: KEY,
      call: replying(
        JSON.stringify({
          ...answer,
          buying_signals: [{ label: "Budget approved", quote: "We have the budget approved." }],
        })
      ),
    });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") {
      expect(out.value.buyingSignals).toEqual([]);
      expect(out.value.summary).toBe("Caleb discussed pricing and timing.");
    }
  });

  it("carries `truncated` through from the prompt — stated, never inferred", async () => {
    const long = Array.from({ length: 1_200 }, (_, i) =>
      seg(`Line ${i} of a very long conversation about roofing scope and price.`, i)
    );
    const out = await requestCallSummary({
      segments: long,
      env: KEY,
      call: replying(JSON.stringify({ summary: "Long call.", action_items: [] })),
    });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") expect(out.value.truncated).toBe(true);
  });
});

describe("requestCallSummary — transport failures are stated, never stored", () => {
  it("reports a timeout with its bound, and writes nothing", async () => {
    const call: SummaryModelCall = (req) =>
      new Promise((_resolve, reject) => {
        req.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    const out = await requestCallSummary({
      segments: SEGMENTS,
      env: KEY,
      call,
      timeoutMs: 5,
    });
    expect(out.kind).toBe("rejected");
    if (out.kind === "rejected") expect(out.reason).toContain("timed out after 5ms");
  });

  it("reports a transport error without echoing the api key", async () => {
    const call: SummaryModelCall = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    const out = await requestCallSummary({ segments: SEGMENTS, env: KEY, call });
    expect(out.kind).toBe("rejected");
    if (out.kind === "rejected") {
      expect(out.reason).toContain("ECONNREFUSED");
      expect(out.reason).not.toContain(KEY.apiKey);
    }
  });
});
