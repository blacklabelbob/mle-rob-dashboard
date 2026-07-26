// Q68 (b) inc.17 — the transcript read route: sid validation, response shape, log projection,
// and the real GET handler over a fake reader (leadsRoute/needsActionRoute precedent).
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseRecordingSid,
  transcriptReadLog,
  transcriptResponse,
} from "../calls/transcriptResponse";
import type { TranscriptLoad, TranscriptReader } from "../calls/transcriptRead";
import type { TranscriptView } from "../calls/transcriptView";

const SID = `RE${"a".repeat(32)}`;

// The route resolves its reader through transcriptDb; swap that for a fake so the handler
// runs for real without Postgres or env.
const h = vi.hoisted(() => ({ reader: null as TranscriptReader | null, thrown: null as Error | null }));
vi.mock("../calls/transcriptDb", () => ({
  transcriptReader: () => {
    if (h.thrown) throw h.thrown;
    return h.reader as TranscriptReader;
  },
}));

import { GET } from "../../app/api/calls/transcript/route";

const reader = (
  transcript: Record<string, unknown> | null,
  segments: Record<string, unknown>[] = []
): TranscriptReader => ({
  fetchTranscript: async () => transcript,
  fetchSegments: async (_id, fromIdx, limit) =>
    segments.filter((s) => (s.idx as number) >= fromIdx).slice(0, limit),
});

const row = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  recording_sid: SID,
  status: "complete",
  provider: "deepgram",
  ...over,
});

const seg = (idx: number, text: string, speaker = "0") => ({
  idx,
  start_ms: idx * 1000,
  end_ms: idx * 1000 + 900,
  speaker,
  text,
  confidence: 0.9,
});

const call = async (url: string) =>
  GET({ nextUrl: new URL(url) } as unknown as Parameters<typeof GET>[0]);

beforeEach(() => {
  h.thrown = null;
  h.reader = reader(null);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("parseRecordingSid", () => {
  it("accepts a Twilio recording SID, either hex case", () => {
    expect(parseRecordingSid(SID)).toBe(SID);
    expect(parseRecordingSid(`RE${"A1B2C3D4".repeat(4)}`)).toBe(`RE${"A1B2C3D4".repeat(4)}`);
  });

  it("trims surrounding whitespace before judging it", () => {
    expect(parseRecordingSid(`  ${SID}\n`)).toBe(SID);
  });

  // The shape check is the access control on a table read with the service key: a
  // free-text parameter would let a stranger walk the transcripts.
  it("rejects anything that is not RE + 32 hex", () => {
    expect(parseRecordingSid(null)).toBeNull();
    expect(parseRecordingSid("")).toBeNull();
    expect(parseRecordingSid("CA" + "a".repeat(32))).toBeNull(); // a CALL sid, not a recording
    expect(parseRecordingSid(`RE${"a".repeat(31)}`)).toBeNull();
    expect(parseRecordingSid(`RE${"a".repeat(33)}`)).toBeNull();
    expect(parseRecordingSid(`RE${"z".repeat(32)}`)).toBeNull(); // not hex
    expect(parseRecordingSid(`RE${"a".repeat(32)} or 1=1`)).toBeNull();
  });
});

describe("transcriptResponse", () => {
  const view: TranscriptView = { state: "ready", turns: [], speakerCount: 0, endMs: null };

  it("omits diagnostics entirely when there is nothing to report", () => {
    const load: TranscriptLoad = {
      kind: "loaded",
      transcript: { id: "t1", recordingSid: SID, status: "complete", provider: "deepgram" },
      segments: [],
      droppedSegments: 0,
    };
    expect(transcriptResponse(SID, view, load)).toEqual({ recordingSid: SID, view });
  });

  // inc.16 refuses to coerce a row it cannot read; that refusal is only worth something if
  // the route reports it instead of quietly rendering `failed`.
  it("carries the unreadable column, never a value", () => {
    const body = transcriptResponse(SID, view, { kind: "unreadable", reason: "status" });
    expect(body.diagnostics).toEqual({ unreadable: "status" });
  });

  it("reports dropped segments, which 0021's CHECKs make impossible", () => {
    const body = transcriptResponse(SID, view, {
      kind: "loaded",
      transcript: { id: "t1", recordingSid: SID, status: "complete", provider: "deepgram" },
      segments: [],
      droppedSegments: 2,
    });
    expect(body.diagnostics).toEqual({ droppedSegments: 2 });
  });
});

describe("transcriptReadLog", () => {
  // Established at inc.13 for the webhook and it holds harder on a read surface: a log is
  // the least access-controlled place in the system.
  it("never carries transcript text", () => {
    const load: TranscriptLoad = {
      kind: "loaded",
      transcript: { id: "t1", recordingSid: SID, status: "complete", provider: "deepgram" },
      segments: [{ idx: 0, startMs: 0, endMs: 900, text: "my card number is 4111", speaker: "0" }],
      droppedSegments: 0,
    };
    const view: TranscriptView = {
      state: "ready",
      turns: [
        {
          speaker: "0",
          label: "Speaker 1",
          startMs: 0,
          endMs: 900,
          text: "my card number is 4111",
          idx: [0],
          minConfidence: null,
        },
      ],
      speakerCount: 1,
      endMs: 900,
    };
    const line = JSON.stringify(transcriptReadLog(SID, view, load));
    expect(line).not.toContain("card number");
    expect(line).not.toContain("4111");
    expect(JSON.parse(line)).toMatchObject({ state: "ready", turns: 1, segments: 1 });
  });
});

describe("GET /api/calls/transcript", () => {
  it("400s an ill-formed sid without opening a connection", async () => {
    h.reader = null; // any DB touch would throw
    const res = await call("http://x/api/calls/transcript?recordingSid=nope");
    expect(res.status).toBe(400);
  });

  it("returns turns for a stored call", async () => {
    h.reader = reader(row(), [seg(0, "hello there"), seg(1, "can you hear me")]);
    const res = await call(`http://x/api/calls/transcript?recordingSid=${SID}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recordingSid).toBe(SID);
    expect(body.view.state).toBe("ready");
    expect(body.view.turns).toHaveLength(1); // one speaker, consecutive → one turn
    expect(body.view.turns[0].text).toBe("hello there can you hear me");
    // Rows never travel alongside the projection — one way to render a call, not two.
    expect(body.segments).toBeUndefined();
  });

  // A call recorded thirty seconds ago has no row yet. 404 would say the CALL doesn't exist.
  it("200s a never-transcribed call as pending, not 404", async () => {
    h.reader = reader(null);
    const res = await call(`http://x/api/calls/transcript?recordingSid=${SID}`);
    expect(res.status).toBe(200);
    expect((await res.json()).view).toMatchObject({ state: "pending", turns: [] });
  });

  it("shows no words for a pending row", async () => {
    h.reader = reader(row({ status: "pending" }), [seg(0, "stale words")]);
    const body = await (await call(`http://x/api/calls/transcript?recordingSid=${SID}`)).json();
    expect(body.view).toMatchObject({ state: "pending", turns: [] });
    expect(JSON.stringify(body)).not.toContain("stale words");
  });

  it("reports an unreadable row as failed with its column", async () => {
    h.reader = reader(row({ status: "half-done" }));
    const body = await (await call(`http://x/api/calls/transcript?recordingSid=${SID}`)).json();
    expect(body.view.state).toBe("failed");
    expect(body.diagnostics).toEqual({ unreadable: "status" });
  });

  // "The query broke" must never be rendered as "this call was never transcribed".
  it("503s a read failure instead of returning an empty transcript", async () => {
    h.reader = {
      fetchTranscript: async () => {
        throw new Error("call_transcripts read: timeout");
      },
      fetchSegments: async () => [],
    };
    const res = await call(`http://x/api/calls/transcript?recordingSid=${SID}`);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("transcript unavailable");
  });

  it("503s when the service-role client cannot be built", async () => {
    h.thrown = new Error("call transcripts: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    const res = await call(`http://x/api/calls/transcript?recordingSid=${SID}`);
    expect(res.status).toBe(503);
  });
});
