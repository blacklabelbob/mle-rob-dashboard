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
 * One row of the Fathom snapshot, as `MLE Internal Meetings/fathom-snapshot-2026-08-07.json` stores
 * it. The file is cited by its real dated name and not as a wildcard: `citedEvidenceExists.test.ts`
 * opens every archive path named under `lib/meetings/`, and a glob is a citation no reader can open.
 */
export type FathomRecording = {
  /** Fathom's `recording_id`, as a string so it can be an id like every other source's. */
  id: string;
  title: string;
  /** Local day `YYYY-MM-DD` as Fathom states it. Fathom lists a day, not an instant. */
  day: string;
  /** The `fathom.video/calls/…` permalink. */
  url?: string;
  /**
   * TRUE only when someone actually fetched this recording's transcript or summary and it came
   * back non-empty. Absent and false both mean "not verified", never "verified absent".
   */
  transcriptConfirmed?: boolean;
};

/**
 * Fathom recordings → source records. Q86 inc.8 — the FIRST of the five unwired sources wired.
 *
 * WHY THIS SOURCE FIRST, and why it matters more than its row count suggests: Rob named Fathom in
 * the sentence this whole item comes from — *"Fireflies has a really dumb tendancy of not joining
 * meetings so sometimes I have gemeni in there just in case, Fathom."* Fathom is the BACKSTOP. The
 * meetings it holds alone are, by construction, exactly the ones the primary recorder missed, so a
 * spine that reads Fireflies and not Fathom is blindest precisely where Rob said it would be.
 *
 * `hasTranscript` FOLLOWS `transcriptConfirmed` AND NOTHING ELSE — not the presence of a URL, not
 * the fact that Fathom is a transcribing product. Fathom transcribes what it records; that is a
 * fact about the tool, not evidence about this meeting, and closing a row on it would be
 * INCIDENT-LEDGER #22/#34 in one field: a reader's expectation substituted for the record's state.
 * Located is the claim. Read is not — the same line `sourceRecordsFromAttachments` holds.
 *
 * `hasVideo` is FALSE on every row, for the same reason `fromManifest` refuses it: a `/calls/…`
 * permalink is a PAGE, and this module has not opened it. Rob's bar is transcripts for all, videos
 * for most — an honest "no video known" leaves the work visible; a guessed "video" closes it wrongly.
 *
 * PURE per CR-3: handed already-read rows, reads no file, no network, no clock. Fathom states a day
 * already, so unlike `fromManifest` there is no instant to convert and no timezone to borrow.
 */
export function fromFathom(recordings: FathomRecording[]): SourceRecord[] {
  return recordings.map((r) => ({
    source: "fathom" as const,
    id: r.id,
    title: r.title,
    day: r.day,
    hasTranscript: r.transcriptConfirmed === true,
    hasVideo: false,
    url: r.url,
  }));
}

/**
 * One row of `MLE Internal Meetings/notion-snapshot-2026-08-07.json`, cited by its real dated name
 * rather than as a glob — `citedEvidenceExists.test.ts` opens every archive path named under
 * `lib/meetings/`, and a wildcard is a citation no reader can open (the guard that caught inc.8).
 */
export type NotionMeetingRow = {
  /** The Notion page id. */
  id: string;
  title: string;
  /** Local day `YYYY-MM-DD` from the `Call Date` property. Notion states a day, not an instant. */
  day?: string;
  /** The `notion.so/…` page URL, so a human sent to look has the address. */
  url?: string;
  /** The human's `Transcript Available` checkbox. A CLAIM — never coverage. See below. */
  transcriptAvailable?: boolean;
  /** Characters of text measured in the page's top-level blocks. A MEASUREMENT. */
  bodyChars?: number;
  /** Block count, carried so a body of 6 huge blocks is distinguishable from 600 empty ones. */
  bodyBlocks?: number;
};

/**
 * Above this, a Notion page body holds real content that nobody in this repo has read.
 *
 * Set to catch content, NOT to tell a summary from a transcript — that distinction requires
 * actually reading the page, and this module refuses to fake it. In the live database the AI
 * summary rows run ~3–5k characters and the one page holding a real transcript runs 37,099; both
 * are over the floor and both are reported the same way, as *text nobody has opened*.
 */
export const NOTION_BODY_UNREAD_CHARS = 2000;

/** A Notion page whose body holds content no pass in this repo has ever read. */
export type NotionBodyFinding = {
  id: string;
  title: string;
  day?: string;
  url?: string;
  bodyChars: number;
  /** TRUE when the row's own checkbox says there is no transcript while the body holds text. */
  contradictsCheckbox: boolean;
  why: string;
};

export type NotionHarvest = {
  records: SourceRecord[];
  bodyFindings: NotionBodyFinding[];
};

/**
 * Notion "📞 Master Meetings Database" rows → source records. Q86 inc.9, and DoD (d) verbatim:
 * *"the Notion-AI transcript that lives in a page BODY is read"*.
 *
 * `hasTranscript` IS FALSE ON EVERY ROW, DELIBERATELY, AND THAT IS NOT THIS MODULE BEING TIMID.
 * Two separate things could have set it true and both are wrong:
 *
 *   1. **The `Transcript Available` checkbox is a claim, never a finding.** This is the rule Q84
 *      exists to enforce and the one INCIDENT-LEDGER #34 was opened for: on 2026-07-28 the Omega
 *      row carried FOUR fields asserting absence while its page body held 531 blocks / 104,683
 *      characters — the full summary *and* the complete transcript — and a daily brief asked Rob
 *      twice to reconstruct from memory a meeting that was sitting in front of it. Trusting that
 *      checkbox is how that happened. Measured live 2026-08-07: the checkbox is ticked on **0 of
 *      49** rows, so believing it would report a database with a 37,099-character transcript in it
 *      as holding nothing at all.
 *   2. **A measured body is LOCATED, not READ.** A page carrying 4,719 characters may hold a
 *      transcript or may hold an AI summary and an action list; the two are indistinguishable
 *      without opening it, and calling a summary a transcript is the false-coverage failure this
 *      whole item keeps killing. So the body raises a FINDING with the character count and the
 *      URL — the human gets sent to the exact page — and the meeting stays `owed-a-human` until
 *      someone actually reads it. Same line `sourceRecordsFromAttachments` and `fromFathom` hold.
 *
 * `hasVideo` is false for the same reason it is false everywhere else: a linked URL is a page this
 * module has not opened.
 *
 * PURE per CR-3: handed already-read rows; no fs, no network, no clock. Notion states a day, so
 * there is no instant to convert and no timezone to borrow.
 */
export function fromNotion(rows: NotionMeetingRow[]): NotionHarvest {
  const records: SourceRecord[] = [];
  const bodyFindings: NotionBodyFinding[] = [];

  for (const r of rows) {
    const bodyChars = r.bodyChars ?? 0;
    records.push({
      source: "notion" as const,
      id: r.id,
      title: r.title,
      day: r.day,
      hasTranscript: false,
      hasVideo: false,
      url: r.url,
    });

    if (bodyChars >= NOTION_BODY_UNREAD_CHARS) {
      const contradictsCheckbox = r.transcriptAvailable !== true;
      bodyFindings.push({
        id: r.id,
        title: r.title,
        day: r.day,
        url: r.url,
        bodyChars,
        contradictsCheckbox,
        why:
          `the page body holds ${bodyChars.toLocaleString("en-US")} characters that nothing in this ` +
          `repo has read` +
          (contradictsCheckbox
            ? `, while the row's own "Transcript Available" checkbox says there is none — the 2026-07-28 ` +
              `Omega shape (INCIDENT-LEDGER #34). The body is the evidence; the checkbox is not.`
            : `. The checkbox agrees, but agreement is not a reading — open the page before counting it.`),
      });
    }
  }

  return { records, bodyFindings };
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
