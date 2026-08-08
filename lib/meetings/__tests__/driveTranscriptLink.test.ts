import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PLAUSIBLE_AUDIO_KBPS,
  impliedKbps,
  linkRecording,
  linkRecordings,
  normalizeRecordingTitle,
  type LocalTranscript,
  type RecordingFile,
} from "../driveTranscriptLink";
import { drainReport, type TranscribedElsewhere } from "../driveDrain";

/**
 * Asserted against the REAL measured snapshots, not fixtures.
 *
 * The defect this module exists for lived in the actual Drive listing and the actual transcripts
 * directory: inc.38 read one and not the other and reported a debt that was not there. A fixture
 * would go green on a hand-written pair and prove nothing about the files that caused it, which is
 * the `activities.transcript_url` failure (Q73 inc.28) and the `«Next Steps»` fixture that could
 * not reach its own branch (Q92). So the snapshots are read off disk and the first assertions are
 * that they still contain the shapes under test — if the data moves, these fail loudly rather than
 * passing about nothing.
 */
const REPO = join(__dirname, "..", "..", "..");
const drive = JSON.parse(
  readFileSync(join(REPO, "MLE Internal Meetings", "drive-drain-2026-08-08.json"), "utf8"),
) as { unprocessed: RecordingFile[]; processed: RecordingFile[] };
const local = JSON.parse(
  readFileSync(join(REPO, "MLE Internal Meetings", "local-transcripts-2026-08-08.json"), "utf8"),
) as { transcripts: LocalTranscript[] };

const recordings = drive.unprocessed.filter((f) => /^(audio|video)\//.test(f.mimeType));

describe("the snapshots still hold the shapes these tests are about", () => {
  it("Drive /Unprocessed still holds audio recordings with a byte size", () => {
    expect(recordings.length).toBeGreaterThan(0);
    for (const r of recordings) expect(r.bytes).toBeGreaterThan(0);
  });

  it("the transcripts on disk still record a transcriber-measured duration", () => {
    expect(local.transcripts.length).toBeGreaterThan(0);
    for (const t of local.transcripts) expect(t.durationSeconds).toBeGreaterThan(0);
  });
});

describe("the inc.38 claim, re-ruled against both folders", () => {
  it("EVERY recording inc.38 called untranscribed already has a transcript on disk", () => {
    const links = linkRecordings(drive.unprocessed, local.transcripts);
    expect(links.length).toBe(recordings.length);
    expect(links.every((l) => l.status === "linked")).toBe(true);
    // The finding stated as arithmetic: zero of them are owed a transcriber.
    expect(links.filter((l) => l.status === "none")).toHaveLength(0);
  });

  it("each link is corroborated by a plausible bitrate, not by the title alone", () => {
    for (const link of linkRecordings(drive.unprocessed, local.transcripts)) {
      expect(link.impliedKbps).not.toBeNull();
      expect(link.impliedKbps!).toBeGreaterThanOrEqual(PLAUSIBLE_AUDIO_KBPS.min);
      expect(link.impliedKbps!).toBeLessThanOrEqual(PLAUSIBLE_AUDIO_KBPS.max);
    }
  });

  it("says in words that no hash was checked, so nobody reads the link as proof", () => {
    for (const link of linkRecordings(drive.unprocessed, local.transcripts)) {
      expect(link.why).toContain("NOT hash-verified");
    }
  });
});

describe("what it refuses", () => {
  const transcript = local.transcripts[0]!;

  it("refuses a title match whose audio could not possibly be that long", () => {
    // A real cross-pair from the measured data: the largest file against the shortest transcript.
    const biggest = [...recordings].sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))[0]!;
    const shortest = [...local.transcripts].sort(
      (a, b) => (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0),
    )[0]!;
    const impossible = impliedKbps(biggest.bytes, shortest.durationSeconds)!;
    expect(impossible).toBeGreaterThan(PLAUSIBLE_AUDIO_KBPS.max);

    const verdict = linkRecording({ ...biggest, title: shortest.title }, [shortest]);
    expect(verdict.status).toBe("uncertain");
    expect(verdict.transcript).toBe(shortest); // the near-miss is shown, never dropped
    expect(verdict.why).toContain("cannot be the same audio");
  });

  it("refuses to link on a title when the second signal cannot be evaluated", () => {
    const noBytes = linkRecording(
      { id: "x", title: transcript.title, mimeType: "audio/x-m4a" },
      [transcript],
    );
    expect(noBytes.status).toBe("uncertain");
    expect(noBytes.why).toContain("Drive reports no file size");

    const noDuration = linkRecording(
      { id: "x", title: transcript.title, mimeType: "audio/x-m4a", bytes: 1_000_000 },
      [{ ...transcript, durationSeconds: null }],
    );
    expect(noDuration.status).toBe("uncertain");
    expect(noDuration.why).toContain("records no duration");
  });

  it("calls an unmatched recording `none` and describes it as OUR silence, not absence", () => {
    const verdict = linkRecording(
      { id: "x", title: "Call with Nobody.m4a", mimeType: "audio/x-m4a", bytes: 1_000_000 },
      local.transcripts,
    );
    expect(verdict.status).toBe("none");
    expect(verdict.why).toContain("statement about the transcripts this run was handed");
  });

  it("does not stem, score or partially match a title", () => {
    expect(normalizeRecordingTitle("Call with John Burns.m4a")).toBe("call with john burns");
    const partial = linkRecording(
      { id: "x", title: "Call with John Burns (part 2).m4a", mimeType: "audio/x-m4a", bytes: 1e6 },
      local.transcripts,
    );
    expect(partial.status).toBe("none");
  });

  it("is not asked about documents at all", () => {
    const docs = drive.unprocessed.filter((f) => !/^(audio|video)\//.test(f.mimeType));
    expect(docs.length).toBeGreaterThan(0);
    expect(linkRecordings(docs, local.transcripts)).toHaveLength(0);
  });
});

describe("the drain report stops reporting a debt that does not exist", () => {
  const confirmed: TranscribedElsewhere[] = linkRecordings(drive.unprocessed, local.transcripts)
    .filter((l) => l.status === "linked")
    .map((l) => ({ fileId: l.file.id, transcriptRef: l.transcript!.ref, why: l.why }));

  it("classifies the real recordings as transcribed-elsewhere, not needs-transcription", () => {
    const report = drainReport(drive.unprocessed, drive.processed, [], confirmed);
    expect(report.transcribedElsewhere).toHaveLength(recordings.length);
    expect(report.needsTranscription).toHaveLength(0);
    for (const v of report.transcribedElsewhere) expect(v.why).toContain("NOT owed a transcriber");
  });

  it("without the links it reports exactly what inc.38 reported — the class is the whole fix", () => {
    const report = drainReport(drive.unprocessed, drive.processed, []);
    expect(report.needsTranscription).toHaveLength(recordings.length);
    expect(report.transcribedElsewhere).toHaveLength(0);
  });

  it("still claims nothing about the move: /Processed remains the only evidence", () => {
    const report = drainReport(drive.unprocessed, drive.processed, [], confirmed);
    expect(report.drained).toHaveLength(0);
    expect(report.eligible).toHaveLength(0);
    expect(report.summary).toContain("never run once");
  });
});
