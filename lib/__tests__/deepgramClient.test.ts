import { describe, expect, it } from "vitest";
import {
  DEEPGRAM_ENDPOINT,
  type DeepgramFetch,
  deepgramConfigured,
  deepgramEnv,
  deepgramUrl,
  requestDeepgramTranscript,
  usableRecordingUrl,
} from "../calls/deepgramClient";

const KEY = { apiKey: "dg-test-key" };
const REC = "https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1.mp3";

const ok = (body: unknown, status = 200): DeepgramFetch =>
  async () => ({ ok: true, status, json: async () => body });

const bad = (body: unknown, status: number): DeepgramFetch =>
  async () => ({ ok: false, status, json: async () => body });

const successBody = {
  metadata: { duration: 12.5, models: ["nova-2"] },
  results: {
    utterances: [
      { start: 0, end: 2, transcript: "Hi, this is Caleb.", speaker: 0, confidence: 0.9 },
      { start: 2, end: 5, transcript: "Hey Caleb.", speaker: 1, confidence: 0.8 },
    ],
  },
};

describe("deepgramEnv / deepgramConfigured", () => {
  it("is off with no key — the unset default, not a failure", () => {
    expect(deepgramConfigured(deepgramEnv({} as NodeJS.ProcessEnv))).toBe(false);
    expect(deepgramConfigured({ apiKey: "" })).toBe(false);
    expect(deepgramConfigured(KEY)).toBe(true);
  });

  it("reads DEEPGRAM_API_KEY", () => {
    expect(deepgramEnv({ DEEPGRAM_API_KEY: "k" } as NodeJS.ProcessEnv)).toEqual({
      apiKey: "k",
    });
  });
});

describe("deepgramUrl", () => {
  it("pins the request shape that decides the granularity ladder", () => {
    const u = new URL(deepgramUrl(REC));
    expect(u.origin + u.pathname).toBe(DEEPGRAM_ENDPOINT);
    expect(u.searchParams.get("utterances")).toBe("true");
    expect(u.searchParams.get("diarize")).toBe("true");
    expect(u.searchParams.get("smart_format")).toBe("true");
    expect(u.searchParams.get("punctuate")).toBe("true");
    expect(u.searchParams.get("model")).toBe("nova-2");
  });

  it("passes the recording url encoded, not concatenated", () => {
    const withQuery = "https://ex.com/a.mp3?token=a&b=c";
    const u = new URL(deepgramUrl(withQuery));
    expect(u.searchParams.get("url")).toBe(withQuery);
  });
});

describe("usableRecordingUrl", () => {
  it("accepts https", () => {
    expect(usableRecordingUrl(REC)).toBe(REC);
  });

  it("refuses anything Deepgram should not be asked to fetch", () => {
    // Deepgram fetches this itself — an unvalidated value is someone else's egress.
    for (const bad of [
      "http://ex.com/a.mp3",
      "file:///etc/passwd",
      "ftp://ex.com/a.mp3",
      "not a url",
      "",
      "   ",
      null,
      undefined,
      42,
    ]) {
      expect(usableRecordingUrl(bad)).toBeNull();
    }
  });
});

describe("requestDeepgramTranscript", () => {
  it("does nothing at all with no key — disabled, never a failed row", async () => {
    let called = false;
    const res = await requestDeepgramTranscript({
      recordingSid: "RE1",
      recordingUrl: REC,
      env: {},
      fetchImpl: (async () => {
        called = true;
        return { ok: true, status: 200, json: async () => ({}) };
      }) as DeepgramFetch,
    });
    expect(res).toEqual({ kind: "disabled" });
    expect(called).toBe(false);
  });

  it("refuses an unusable recording url before making the request", async () => {
    let called = false;
    const res = await requestDeepgramTranscript({
      recordingSid: "RE1",
      recordingUrl: "http://ex.com/a.mp3",
      env: KEY,
      fetchImpl: (async () => {
        called = true;
        return { ok: true, status: 200, json: async () => ({}) };
      }) as DeepgramFetch,
    });
    expect(res).toEqual({ kind: "invalid", reason: "unusable recording url" });
    expect(called).toBe(false);
  });

  it("refuses a missing recording sid — identity is derived, never invented", async () => {
    const res = await requestDeepgramTranscript({
      recordingSid: "  ",
      recordingUrl: REC,
      env: KEY,
      fetchImpl: ok(successBody),
    });
    expect(res).toEqual({ kind: "invalid", reason: "missing recording sid" });
  });

  it("sends the key as a Token header and never in the url", async () => {
    let seenUrl = "";
    let seenHeaders: Record<string, string> = {};
    const fetchImpl: DeepgramFetch = async (input, init) => {
      seenUrl = input;
      seenHeaders = init.headers;
      return { ok: true, status: 200, json: async () => successBody };
    };
    await requestDeepgramTranscript({
      recordingSid: "RE1",
      recordingUrl: REC,
      env: KEY,
      fetchImpl,
    });
    expect(seenHeaders.Authorization).toBe("Token dg-test-key");
    expect(seenUrl).not.toContain("dg-test-key");
  });

  it("maps a success through the same mapper as everything else", async () => {
    const res = await requestDeepgramTranscript({
      recordingSid: "RE1",
      recordingUrl: REC,
      env: KEY,
      fetchImpl: ok(successBody),
    });
    expect(res.kind).toBe("mapped");
    if (res.kind !== "mapped") return;
    expect(res.httpStatus).toBe(200);
    expect(res.mapping.transcript.status).toBe("complete");
    expect(res.mapping.transcript.recordingSid).toBe("RE1");
    expect(res.mapping.segments).toHaveLength(2);
    // Speaker 0 is a real speaker (inc.3's pin) — it must survive the round trip.
    expect(res.mapping.segments[0].speaker).toBe("speaker-0");
  });

  it("carries Deepgram's own error on a non-2xx, not a generic one", async () => {
    const res = await requestDeepgramTranscript({
      recordingSid: "RE1",
      recordingUrl: REC,
      env: KEY,
      fetchImpl: bad({ err_code: "Bad Request", err_msg: "failed to fetch audio" }, 400),
    });
    expect(res.kind).toBe("mapped");
    if (res.kind !== "mapped") return;
    expect(res.httpStatus).toBe(400);
    expect(res.mapping.transcript.status).toBe("failed");
    expect(res.mapping.transcript.error).toBe("Bad Request: failed to fetch audio");
  });

  it("falls back to the status only when the body carries no reason", async () => {
    const res = await requestDeepgramTranscript({
      recordingSid: "RE1",
      recordingUrl: REC,
      env: KEY,
      fetchImpl: bad("<html>502</html>", 502),
    });
    expect(res.kind).toBe("mapped");
    if (res.kind !== "mapped") return;
    expect(res.mapping.transcript.status).toBe("failed");
    expect(res.mapping.transcript.error).toBe("deepgram http 502");
  });

  it("survives a non-JSON body on a 200 rather than throwing", async () => {
    const res = await requestDeepgramTranscript({
      recordingSid: "RE1",
      recordingUrl: REC,
      env: KEY,
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("Unexpected token <");
        },
      })) as DeepgramFetch,
    });
    // An empty transcript is `complete` with zero segments, never `failed` (inc.3).
    expect(res.kind).toBe("mapped");
    if (res.kind !== "mapped") return;
    expect(res.mapping.transcript.status).toBe("complete");
    expect(res.mapping.segments).toEqual([]);
  });

  it("turns a transport failure into a visibly failed row, not a missing one", async () => {
    const res = await requestDeepgramTranscript({
      recordingSid: "RE1",
      recordingUrl: REC,
      env: KEY,
      fetchImpl: (async () => {
        throw new Error("ECONNRESET");
      }) as DeepgramFetch,
    });
    expect(res.kind).toBe("mapped");
    if (res.kind !== "mapped") return;
    expect(res.mapping.transcript.status).toBe("failed");
    expect(res.mapping.transcript.error).toContain("ECONNRESET");
    expect(res.httpStatus).toBeUndefined();
  });

  it("aborts a hung provider instead of holding the webhook open", async () => {
    const hang: DeepgramFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    const res = await requestDeepgramTranscript({
      recordingSid: "RE1",
      recordingUrl: REC,
      env: KEY,
      fetchImpl: hang,
      timeoutMs: 5,
    });
    expect(res.kind).toBe("mapped");
    if (res.kind !== "mapped") return;
    expect(res.mapping.transcript.status).toBe("failed");
    expect(res.mapping.transcript.error).toContain("timed out after 5ms");
  });

  it("never leaks the api key into an error string", async () => {
    const res = await requestDeepgramTranscript({
      recordingSid: "RE1",
      recordingUrl: REC,
      env: KEY,
      fetchImpl: (async () => {
        throw new Error("connect failed to https://api.deepgram.com");
      }) as DeepgramFetch,
    });
    if (res.kind !== "mapped") throw new Error("expected mapped");
    expect(res.mapping.transcript.error).not.toContain("dg-test-key");
  });
});
