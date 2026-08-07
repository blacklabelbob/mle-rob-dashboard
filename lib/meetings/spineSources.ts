/**
 * Q86 inc.2 — turning what is actually ON DISK into spine input.
 *
 * `calendarSpine.ts` takes `SourceRecord[]` as an argument and refuses to know how to fetch one.
 * This module is the other half: it converts the two source shapes this repo already holds — the
 * Fireflies archive manifest (`MLE Internal Meetings/manifest.json`) and the transcript files at
 * `~/Projects/MyLocalEverything/transcripts/` — into that argument. It is equally pure: it is
 * handed already-read data and never reads a file, a network, a clock or a timezone itself.
 *
 * THE RULE THIS MODULE EXISTS TO ENCODE — Q86 DoD (f):
 *
 *   **A 26-byte .txt stub is not a transcript.**
 *
 * Three such stubs sit in Drive `/Unprocessed` while the real transcripts are already on disk
 * elsewhere. Counting a stub as coverage is the false-coverage failure this repo keeps killing:
 * the row goes green, the meeting looks captured, and nobody ever looks again. So a file below
 * the floor comes back with `hasTranscript: false` — and it comes back, rather than being dropped,
 * carrying the reason in words. A silently discarded file is indistinguishable from a file that
 * was never there, and the whole point of Q86 is that nothing goes missing quietly.
 *
 * THE TIMEZONE IS THE CALLER'S, HERE TOO. The manifest states an instant (`2026-08-03T23:45:00Z`);
 * which local DAY that is depends on a zone this module is not entitled to choose — an 8pm ET
 * meeting is already tomorrow in UTC, and getting that wrong silently un-links a meeting from its
 * own calendar row. So the caller passes `toLocalDay`. Same discipline as the spine itself.
 */

import type { MeetingSource, SourceRecord } from "@/lib/meetings/calendarSpine";

/**
 * Below this, a `.txt` is a placeholder rather than a transcript.
 *
 * The observed stubs are 26 bytes — a filename echoed back, no speech. The floor is set well above
 * that and well below any real transcript: the shortest meeting in the archive runs 762 sentences,
 * and even a one-minute exchange transcribes to several hundred bytes. It is deliberately a FLOOR
 * and not a fingerprint of the known stub text: the next placeholder a tool writes will say
 * something else, and a rule that only catches the exact string we have already seen protects us
 * from precisely nothing.
 */
export const TRANSCRIPT_MIN_BYTES = 512;

/** One row of `MLE Internal Meetings/manifest.json`, as that file actually stores it. */
export type ManifestRow = {
  id: string;
  title: string;
  /** An INSTANT, not a day — ISO 8601, typically UTC. The local day is the caller's to decide. */
  date: string;
  /** Present when the transcript body was written to disk beside the manifest. */
  bodyOnDisk?: boolean;
  /** The Fireflies permalink, when the row came from Fireflies. */
  fireflies?: string;
  /** Carried through when a row knows the calendar event it came from. Rare, and precious. */
  calendarEventId?: string;
};

/** One transcript file as a directory listing describes it. Contents are never read here. */
export type TranscriptFile = {
  /** Full path, used as the record id so a reader can go straight to it. */
  path: string;
  /** The human title — usually the filename without its extension. */
  title: string;
  /** Local day `YYYY-MM-DD` when the filename or its folder states one. Absent is normal. */
  day?: string;
  /** Size on disk. The stub rule turns on this and nothing else. */
  bytes: number;
};

/**
 * A file that LOOKS like coverage and is not. Returned rather than filtered away, so the count of
 * things we chose not to believe is visible next to the count of things we did.
 */
export type StubFinding = {
  source: MeetingSource;
  id: string;
  title: string;
  bytes: number;
  why: string;
};

export type SourceHarvest = {
  records: SourceRecord[];
  stubs: StubFinding[];
};

/**
 * Manifest rows → source records.
 *
 * `bodyOnDisk` is the archive's own statement that it holds the text, and it is the only transcript
 * claim made here — the module does not open the body to check, because a caller that has the bytes
 * should pass them through `fromTranscriptFiles` instead of asking this function to guess.
 *
 * `hasVideo` is FALSE for every manifest row, and that is not an oversight. A Fireflies permalink is
 * a page which may or may not have a recording behind it; asserting video from the presence of a URL
 * would put a claim on the report that nobody verified. Rob's bar is transcripts for all, videos for
 * most — an honest "no video known" leaves work visible, a guessed "video" closes it wrongly.
 */
export function fromManifest(
  rows: ManifestRow[],
  opts: { source?: MeetingSource; toLocalDay: (iso: string) => string },
): SourceRecord[] {
  const source = opts.source ?? "fireflies";
  return rows.map((r) => ({
    source,
    id: r.id,
    title: r.title,
    day: opts.toLocalDay(r.date),
    calendarEventId: r.calendarEventId,
    hasTranscript: r.bodyOnDisk === true,
    hasVideo: false,
    url: r.fireflies,
  }));
}

/**
 * Transcript files → source records, with the stub rule applied.
 *
 * A file at or above the floor is a transcript. A file below it is returned in `stubs` AND as a
 * record with `hasTranscript: false`, so the spine still sees that something exists at that path
 * without ever counting it as coverage. That combination is the point: the meeting stays `owed-a-
 * human`, and the human is told exactly which file lied to them.
 */
export function fromTranscriptFiles(
  files: TranscriptFile[],
  opts: { source?: MeetingSource } = {},
): SourceHarvest {
  const source = opts.source ?? "local-repo";
  const records: SourceRecord[] = [];
  const stubs: StubFinding[] = [];

  for (const f of files) {
    const isStub = f.bytes < TRANSCRIPT_MIN_BYTES;
    if (isStub) {
      stubs.push({
        source,
        id: f.path,
        title: f.title,
        bytes: f.bytes,
        why:
          `${f.bytes} bytes is below the ${TRANSCRIPT_MIN_BYTES}-byte floor — this is a placeholder, ` +
          `not a transcript. It is reported rather than dropped so the file is not mistaken for one ` +
          `that was never there, and it does NOT count as coverage: the meeting stays owed a human.`,
      });
    }
    records.push({
      source,
      id: f.path,
      title: f.title,
      day: f.day,
      hasTranscript: !isStub,
      hasVideo: false,
    });
  }

  return { records, stubs };
}
