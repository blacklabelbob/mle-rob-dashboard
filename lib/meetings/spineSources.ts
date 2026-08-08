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
import type { ConfirmedNotionRead } from "@/lib/meetings/notionReads";

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

/**
 * A page the snapshot could not measure — NOT a page that is empty.
 *
 * The distinction is the whole point. `notion-spine-snapshot.mjs` counts top-level blocks only, so
 * a page whose entire body hangs one level down measures **0 characters over ≥1 block**, and 0 is
 * indistinguishable from empty to every consumer downstream. That is the 2026-07-28 Omega shape
 * arrived at by arithmetic (INCIDENT-LEDGER #34) and it is the same rule Q84 already pays for on
 * the recovery worklist — `atMostUnrecoverable = 0`, *a page with blocks may never be called an
 * absence*. This type carries that rule onto the Notion edge.
 */
export type NotionUnmeasuredBody = {
  id: string;
  title: string;
  day?: string;
  url?: string;
  /** Top-level blocks the snapshot DID see. > 0 is what makes this unmeasured rather than empty. */
  bodyBlocks: number;
  why: string;
};

export type NotionHarvest = {
  records: SourceRecord[];
  bodyFindings: NotionBodyFinding[];
  /**
   * Rows the snapshot's own number cannot speak for: below the floor, blocks present, no deep read
   * on disk. Deliberately NOT folded into `bodyFindings` — a finding states how much text is owed a
   * read, and here we do not know that. Reporting an unknown as a quantity is how the depth cap got
   * mistaken for a drained queue in the first place.
   */
  unmeasuredBodies: NotionUnmeasuredBody[];
  /** Page ids whose body was READ off disk and RULED a transcript — the only rows that are coverage. */
  confirmedTranscripts: string[];
  /** Read on disk, opened, and ruled NOT a transcript. Closed work, not open — and not coverage. */
  ruledNotTranscript: string[];
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
export function fromNotion(
  rows: NotionMeetingRow[],
  reads: Map<string, ConfirmedNotionRead> = new Map(),
): NotionHarvest {
  const records: SourceRecord[] = [];
  const bodyFindings: NotionBodyFinding[] = [];
  const unmeasuredBodies: NotionUnmeasuredBody[] = [];
  const confirmedTranscripts: string[] = [];
  const ruledNotTranscript: string[] = [];

  for (const r of rows) {
    const read = reads.get(r.id);
    const verdict = read?.confirmation?.verdict;
    /**
     * THE SNAPSHOT'S MEASUREMENT IS A FLOOR, NOT THE BODY — measured 2026-08-07, inc.10.
     *
     * `notion-spine-snapshot.mjs` counts TOP-LEVEL blocks only, deliberately, to avoid a request
     * per toggle. On this database that cap does not merely understate: **11 pages measure ZERO
     * characters** while their committed deep read walks 5,461 · 11,462 · 19,402 · 21,102 · 25,225
     * · 28,869 · 33,786 · 44,547 · 44,935 · 65,104 · **114,354** characters — every one of them
     * nested one level below the top. Read on the snapshot alone those pages are EMPTY, so they
     * never even reach the finding threshold: a number asserting absence over a 114k-character
     * body is the 2026-07-28 Omega shape exactly (INCIDENT-LEDGER #34), arrived at by arithmetic
     * instead of by a checkbox. So the deeper of the two counts wins, always.
     */
    const bodyChars = Math.max(r.bodyChars ?? 0, read?.chars ?? 0);

    if (verdict === "transcript") confirmedTranscripts.push(r.id);
    else if (verdict) ruledNotTranscript.push(r.id);

    records.push({
      source: "notion" as const,
      id: r.id,
      title: r.title,
      day: r.day,
      // The ONLY thing that turns this true: a body read off disk and RULED a transcript by a
      // named someone. Never the checkbox, never a character count, never the shape of the blocks.
      hasTranscript: verdict === "transcript",
      hasVideo: false,
      url: r.url,
    });

    // A ruled page is settled — either it is coverage above, or it was opened and found to hold no
    // speech. Neither is "text nobody has read", and leaving it on that list is how a finished
    // reading gets done twice while a genuinely unread page waits behind it. Checked BEFORE the
    // floor, because a ruled page is settled whatever its character count says.
    if (verdict) continue;

    if (bodyChars < NOTION_BODY_UNREAD_CHARS) {
      /**
       * BELOW THE FLOOR IS NOT THE SAME AS EMPTY — measured live 2026-08-08, inc.25.
       *
       * Until this branch existed, every row under the floor was `continue`d silently, and the
       * report's unread queue was therefore a statement about *what the snapshot could measure*
       * dressed up as a statement about *what Notion holds*. On the live database that is not a
       * hypothetical margin: **36 of 49 rows measure 0 characters over ≥1 block**, and after the
       * committed deep reads are subtracted **5 remain both unmeasured and unread** — one of them
       * `Meeting 2026-07-28`, the Omega row INCIDENT-LEDGER #34 was opened for. inc.24's headline
       * that the Notion edge was "drained" was computed with those 5 already dropped here.
       *
       * `bodyBlocks === 0` is left out on purpose and is NOT the same claim: there the snapshot
       * looked and saw no blocks at all. Blocks present with no characters under them means the cap
       * stopped the walk — the reader's silence, not the page's.
       */
      if ((r.bodyBlocks ?? 0) > 0 && !read)
        unmeasuredBodies.push({
          id: r.id,
          title: r.title,
          day: r.day,
          url: r.url,
          bodyBlocks: r.bodyBlocks ?? 0,
          why:
            `the snapshot measured ${bodyChars.toLocaleString("en-US")} characters across ` +
            `${(r.bodyBlocks ?? 0).toLocaleString("en-US")} top-level block(s) — it counts the top level ` +
            `only, so this is a statement about OUR read depth, not about the page. A page with blocks ` +
            `may never be called an absence (INCIDENT-LEDGER #34). Re-read it recursively — ` +
            `\`node scripts/notion-body-dump.mjs ${r.id}\` — before anyone concludes there is nothing here.`,
        });
      continue;
    }

    const contradictsCheckbox = r.transcriptAvailable !== true;
    bodyFindings.push({
      id: r.id,
      title: r.title,
      day: r.day,
      url: r.url,
      bodyChars,
      contradictsCheckbox,
      why: read
        ? // READ but UNRULED. inc.9 printed "nothing in this repo has read" over 32 rows whose full
          // body is committed at this exact path. Say where the text is; the reading is what is owed.
          `the body was already pulled to disk at \`${read.path}\`` +
          (read.chars ? ` (${read.chars.toLocaleString("en-US")} characters, read recursively)` : "") +
          ((read.chars ?? 0) > (r.bodyChars ?? 0)
            ? ` — the snapshot measured only ${(r.bodyChars ?? 0).toLocaleString("en-US")} at the top level, so the depth cap was hiding ${((read.chars ?? 0) - (r.bodyChars ?? 0)).toLocaleString("en-US")} characters`
            : "") +
          ` — nobody has RULED it. Open that file and record transcript / summary-only / empty in ` +
          `\`MLE Internal Meetings/notion-read-confirmations.json\`; until then it is not coverage.`
        : `the page body holds ${bodyChars.toLocaleString("en-US")} characters that nothing in this ` +
          `repo has read` +
          (contradictsCheckbox
            ? `, while the row's own "Transcript Available" checkbox says there is none — the 2026-07-28 ` +
              `Omega shape (INCIDENT-LEDGER #34). The body is the evidence; the checkbox is not.`
            : `. The checkbox agrees, but agreement is not a reading — open the page before counting it.`),
    });
  }

  return { records, bodyFindings, unmeasuredBodies, confirmedTranscripts, ruledNotTranscript };
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
