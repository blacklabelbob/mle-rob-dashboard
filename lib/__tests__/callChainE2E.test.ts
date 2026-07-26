// BUILD-QUEUE Q68 inc.20 — THE DRESS REHEARSAL: one Twilio payload, all the way to the
// words a rep reads.
//
// Every layer of Q68 is unit-tested in isolation and NOTHING has ever proven they compose.
// Nineteen increments each mocked their neighbour, so the seams between them — the column
// names the writer emits versus the ones the reader parses, the segments the pipeline hands
// the summariser, the JSON body the panel is handed off the wire — are the only part of the
// chain with no test at all. That is exactly where a real call would break, and a real call
// cannot be run: all three keys are Rob's (PING-INBOX).
//
// So this is the substitute, and its rules are:
//   * ONE in-memory database backs BOTH the write surface (`TranscriptDb`, 0021's column
//     names) and the read surface (`TranscriptReader`, rows back out). A test that used two
//     fakes would let the writer and the reader disagree about a column forever.
//   * The PROVIDERS are the only things faked, at their HTTP boundary — a Deepgram body and
//     a model reply. Everything between them is the real code, including the mapper, the
//     normaliser, the persist ordering, the summary parse and the panel projection.
//   * The final assertion is a SENTENCE ON A SCREEN, not an internal shape: the customer's
//     own words, in order, as `transcriptPanelFromResponse` hands them to CallTranscript.

import { describe, expect, it } from "vitest";
import { processCallRecording } from "@/lib/calls/callPipeline";
import { buildCallActivity, resolveCallParty } from "@/lib/calls/recordingActivity";
import { summarizeCall } from "@/lib/calls/summarizeCall";
import { transcribeRecording } from "@/lib/calls/transcribeRecording";
import { transcriptPanelFromResponse } from "@/lib/calls/transcriptPanel";
import { readTranscriptView } from "@/lib/calls/transcriptRead";
import { transcriptResponse } from "@/lib/calls/transcriptResponse";
import type { SegmentRow, TranscriptDb, TranscriptRow } from "@/lib/calls/transcriptStore";
import type { Activity, Person } from "@/lib/types";
import { recordingToActivity } from "@/lib/twilio";

const SID = "RE0123456789abcdef0123456789abcdef";
const NOW = "2026-07-26T18:30:00.000Z";
const OUR_LINE = "+15125550100";

/** One store, both directions — the whole point of this file. */
function memoryDb() {
  const transcripts = new Map<string, TranscriptRow & { id: string }>();
  const segments: SegmentRow[] = [];
  let nextId = 1;

  const db: TranscriptDb = {
    async upsertTranscript(row) {
      const existing = transcripts.get(row.recording_sid);
      const id = existing?.id ?? `t-${nextId++}`;
      transcripts.set(row.recording_sid, { ...row, id });
      return id;
    },
    async upsertSegments(rows) {
      for (const row of rows) {
        const at = segments.findIndex(
          (s) => s.transcript_id === row.transcript_id && s.idx === row.idx
        );
        if (at >= 0) segments[at] = row;
        else segments.push(row);
      }
    },
    async pruneSegments(transcriptId, fromIdx) {
      for (let i = segments.length - 1; i >= 0; i--) {
        const s = segments[i];
        if (s.transcript_id === transcriptId && s.idx >= fromIdx) segments.splice(i, 1);
      }
    },
  };

  // The read surface returns ROWS — the same records the writer put in, never the objects
  // it built them from. A reader fed the writer's in-memory shape would never notice a
  // column rename on either side, which is the seam this file exists to hold.
  const reader = {
    async fetchTranscript(recordingSid: string) {
      const row = transcripts.get(recordingSid);
      return row ? ({ ...row } as Record<string, unknown>) : null;
    },
    async fetchSegments(transcriptId: string, fromIdx: number, limit: number) {
      return segments
        .filter((s) => s.transcript_id === transcriptId && s.idx >= fromIdx)
        .sort((a, b) => a.idx - b.idx)
        .slice(0, limit)
        .map((s) => ({ ...s }) as Record<string, unknown>);
    },
  };

  return { db, reader, segments, transcripts };
}

/** Deepgram's prerecorded shape, at the HTTP boundary. Rung 1 of the granularity ladder. */
function deepgramBody() {
  return {
    metadata: { duration: 9.5, models: ["nova-2"], language: "en-US" },
    results: {
      utterances: [
        {
          start: 0.4,
          end: 3.1,
          transcript: "Hey Caleb, it's Rob following up on the roof estimate.",
          speaker: 0,
          confidence: 0.96,
        },
        {
          start: 3.4,
          end: 9.2,
          transcript: "We need it done before the November storms, so send the contract over.",
          speaker: 1,
          confidence: 0.93,
        },
      ],
    },
  };
}

const TWILIO_PARAMS: Record<string, string> = {
  CallSid: "CA0123456789abcdef0123456789abcdef",
  RecordingSid: SID,
  RecordingUrl: "https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/" + SID,
  RecordingDuration: "10",
  From: OUR_LINE,
  To: "+15125550199",
  Timestamp: "Sun, 26 Jul 2026 18:29:00 +0000",
};

const CALEB: Person = {
  id: "person-caleb",
  name: "Caleb Grant",
  phone: "(512) 555-0199",
  status: "warm",
} as Person;

async function runChain() {
  const store = memoryDb();
  const payload = recordingToActivity(TWILIO_PARAMS);

  const resolution = resolveCallParty([CALEB], payload, [OUR_LINE]);
  if (resolution.kind !== "resolved") throw new Error(`unresolved: ${resolution.kind}`);
  const filed = buildCallActivity(payload, resolution, NOW);
  if (!filed) throw new Error("no activity");

  const saved: Activity[] = [];
  const result = await processCallRecording(
    {
      db: store.db,
      saveActivity: async (a) => void saved.push(a),
      // The real halves, with only the two provider calls faked at their own boundary.
      transcribe: (db, input) =>
        transcribeRecording(db, {
          ...input,
          env: { apiKey: "dg-test-key" },
          fetchImpl: async () => ({ ok: true, status: 200, json: async () => deepgramBody() }),
        }),
      summarize: (save, input) =>
        summarizeCall(save, {
          ...input,
          env: { apiKey: "anthropic-test-key" },
          request: async () => ({
            kind: "ok",
            value: {
              summary: "Rob followed up on the roof estimate; Caleb wants it before November.",
              actionItems: ["Send the contract"],
              buyingSignals: [
                { label: "urgency", quote: "before the November storms" },
              ],
              truncated: false,
            },
          }),
        }),
    },
    {
      activity: filed,
      recordingSid: payload.recordingSid,
      recordingUrl: payload.recordingUrl,
    }
  );

  const { view, load } = await readTranscriptView(store.reader, SID);
  const body = transcriptResponse(SID, view, load);
  const panel = transcriptPanelFromResponse(200, JSON.parse(JSON.stringify(body)));

  return { store, filed, saved, result, view, body, panel };
}

describe("Q68 end-to-end: a Twilio recording becomes words on a rep's screen", () => {
  it("files the call on the contact, not on our own line", async () => {
    const { filed } = await runChain();
    expect(filed.personId).toBe("person-caleb");
    expect(filed.id).toContain(SID);
    // The webhook files it EMPTY — a placeholder here is how an un-summarised call
    // looks summarised (inc.1's rule, held at the far end of the chain).
    expect(filed.summary ?? "").toBe("");
  });

  it("stores the transcript and its segments under one recording sid", async () => {
    const { store, result } = await runChain();
    expect(result.transcript.kind).toBe("stored");
    expect(store.transcripts.get(SID)?.status).toBe("complete");
    expect(store.segments).toHaveLength(2);
    expect(store.segments.map((s) => s.idx)).toEqual([0, 1]);
  });

  it("summarises the call onto the row the webhook already filed", async () => {
    const { saved, filed } = await runChain();
    expect(saved).toHaveLength(1);
    const written = saved[0];
    expect(written.id).toBe(filed.id);
    // The summariser never re-matches the contact — a call cannot move timelines in after().
    expect(written.personId).toBe("person-caleb");
    expect(written.summary).toContain("roof estimate");
    expect(written.actionItems).toEqual(["Send the contract"]);
    expect(written.buyingSignals?.[0]?.quote).toBe("before the November storms");
  });

  it("reads back the words that were written, in the order they were said", async () => {
    const { view } = await runChain();
    expect(view.state).toBe("ready");
    expect(view.turns.map((t) => t.text)).toEqual([
      "Hey Caleb, it's Rob following up on the roof estimate.",
      "We need it done before the November storms, so send the contract over.",
    ]);
    // Two diarised speakers survive the round trip; neither is given a human name.
    expect(view.speakerCount).toBe(2);
    expect(view.turns.every((t) => !/rob|caleb/i.test(t.speaker ?? ""))).toBe(true);
  });

  it("hands the panel a clean transcript — no diagnostics on a healthy call", async () => {
    const { body, panel } = await runChain();
    expect(body.diagnostics).toBeUndefined();
    expect(panel.state).toBe("ready");
    // `notice` is explicitly null, not absent — the panel always answers the question.
    expect(panel.notice).toBeNull();
    expect(panel.turns.map((t) => t.text)).toEqual([
      "Hey Caleb, it's Rob following up on the roof estimate.",
      "We need it done before the November storms, so send the contract over.",
    ]);
    // Confidence reaches the reader as a word or not at all — never a percentage.
    expect(panel.turns.every((t) => t.confidence !== "unknown")).toBe(true);
  });

  it("a re-delivered webhook rewrites the same rows instead of stacking a second call", async () => {
    const store = memoryDb();
    const payload = recordingToActivity(TWILIO_PARAMS);
    const resolution = resolveCallParty([CALEB], payload, [OUR_LINE]);
    if (resolution.kind !== "resolved") throw new Error("unresolved");
    const filed = buildCallActivity(payload, resolution, NOW)!;

    const once = () =>
      processCallRecording(
        {
          db: store.db,
          saveActivity: async () => {},
          transcribe: (db, input) =>
            transcribeRecording(db, {
              ...input,
              env: { apiKey: "dg-test-key" },
              fetchImpl: async () => ({ ok: true, status: 200, json: async () => deepgramBody() }),
            }),
          summarize: async () => ({ kind: "skipped", reason: "not under test" }),
        },
        { activity: filed, recordingSid: SID, recordingUrl: payload.recordingUrl }
      );

    await once();
    await once();

    expect(store.transcripts.size).toBe(1);
    expect(store.segments).toHaveLength(2);
    const { view } = await readTranscriptView(store.reader, SID);
    expect(view.turns).toHaveLength(2);
  });

  it("a call nobody has transcribed reads as pending, never as an empty transcript", async () => {
    const store = memoryDb();
    const { view, load } = await readTranscriptView(store.reader, SID);
    expect(load.kind).toBe("missing");
    const panel = transcriptPanelFromResponse(200, transcriptResponse(SID, view, load));
    expect(panel.state).toBe("pending");
    expect(panel.turns).toHaveLength(0);
  });
});
