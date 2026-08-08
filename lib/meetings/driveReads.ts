/**
 * Q86 inc.15 — the Drive/Gemini source stops being "not wired", and the first doc read proves why
 * SIZE IS NOT A BODY.
 *
 * inc.4 lifted `Notes by Gemini` attachments off the calendar events themselves and stopped there,
 * on purpose: *"Located is the claim. Read is not."* Nothing in this repo could open a Doc, so every
 * one of those records carried `hasTranscript: false` and the row stayed owed. That refusal was
 * right and it is now discharged rather than relaxed — the Drive MCP can read these files, so the
 * ladder gains its next two rungs, exactly as `notionReads.ts` did for Notion:
 *
 *   located (inc.4)  →  MEASURED  →  RULED
 *
 * — measured into `MLE Internal Meetings/drive-snapshot-2026-08-07.json`, ruled in
 * `MLE Internal Meetings/drive-read-confirmations.json`. Both are cited by their real dated names
 * and never as a glob: `citedEvidenceExists.test.ts` opens every archive path named under
 * `lib/meetings/`, and it failed this file's first draft for exactly that — a wildcard is a
 * citation no reader can open.
 *
 * **AND ONLY THE RULING MOVES A ROW.** `hasTranscript` turns true here for one reason and no other:
 * a named someone opened the doc and wrote down `transcript`. Not the byte count, not the word
 * "Notes" in the title, not the fact that Gemini was in the meeting.
 *
 * THE FIRST READ IS THE ARGUMENT FOR THAT RULE, not a hypothetical. `Rob & Austin | MArtin Fierro`
 * (2026-08-03) hangs a 3,186-byte Gemini doc off the event. It is the only artefact that meeting
 * has. Opened on 2026-08-07 it says, verbatim: *"A summary wasn't produced for this meeting because
 * there wasn't enough conversation in a supported language."* — Google boilerplate, an invite line,
 * and a link back to the calendar. A size-keyed or presence-keyed rule would have called that row
 * covered and closed a meeting nobody has any record of. It is ruled `empty`, and the meeting stays
 * OWED A HUMAN. That is INCIDENT-LEDGER #22/#34 caught before it happened rather than after.
 *
 * WHY THIS ENRICHES THE LOCATED RECORDS INSTEAD OF ADDING NEW ONES. The attachment records already
 * carry `calendarEventId` — the rung-1 join, the certain one. Emitting a second record per doc from
 * the snapshot would either duplicate every Gemini row on the board or throw that join away for a
 * day-and-title guess. So the snapshot is a MEASUREMENT LAYERED ONTO the record the calendar
 * already proved, and a doc the snapshot does not know is passed through untouched rather than
 * dropped: an unmeasured located record is still a lead a human can follow.
 *
 * One doc can be attached to SEVERAL events — `1479bPU0…` is on both of Rob's 2026-06-16 CG Roofing
 * events — so the join is by file id and fans out. A ruling on that file therefore rules both rows,
 * which is correct: it is one body, and it says what it says regardless of how many invites point
 * at it.
 *
 * PURE per CR-3: handed already-read JSON; no fs, no network, no clock. The reading and the fetch
 * live in the agent session and in `scripts/calendar-spine.mjs`.
 */

import type { SourceRecord } from "@/lib/meetings/calendarSpine";

/** One row of `MLE Internal Meetings/drive-snapshot-2026-08-07.json` — metadata, never the body. */
export type DriveDoc = {
  id: string;
  title: string;
  /** Local day `YYYY-MM-DD` parsed out of Google's own auto-generated title, when it states one. */
  day?: string;
  /** Google's `fileSize`. A proxy for "there is something in here", never evidence of what. */
  bytes?: number;
  mimeType?: string;
  /** Every calendar event this file is attached to. One doc, many invites, is normal. */
  calendarEventIds?: string[];
};

/** What someone found when they opened the doc. Recorded, never inferred. */
export type DriveReadVerdict = "transcript" | "summary-only" | "empty";

/** A ruling on one doc, carrying the evidence that justifies it. */
export type DriveReadConfirmation = {
  fileId: string;
  verdict: DriveReadVerdict;
  /** What was found, in words — quoted evidence, so a wrong ruling is arguable rather than opaque. */
  note: string;
  /** `YYYY-MM-DD` the ruling was made. A date, not a clock read. */
  confirmedAt: string;
  /** Who ruled. So a wrong ruling has an owner. */
  confirmedBy: string;
};

/** A measured doc joined to its ruling, if it has one. */
export type ConfirmedDriveDoc = DriveDoc & { confirmation?: DriveReadConfirmation };

/**
 * Below this, a Gemini doc is boilerplate rather than notes.
 *
 * The one empty doc measured 3,186 bytes of pure Google chrome, so the floor sits ABOVE it — a
 * threshold that still called that file a body would be a threshold that learned nothing from it.
 * It is deliberately a floor and not a match on Google's wording: the notice will be reworded, and
 * a rule keyed to today's sentence would protect us from exactly the file we have already read.
 * Above the floor the doc is not called coverage either — it is called UNRULED, which is a request
 * for a reader, not a claim about the meeting.
 */
export const DRIVE_BODY_UNREAD_BYTES = 4_000;

/** A measured doc holding enough to be worth opening, that nobody has opened. */
export type DriveBodyFinding = {
  fileId: string;
  title: string;
  day?: string;
  bytes: number;
  /** The events this doc is attached to, so the reader knows which rows it would move. */
  calendarEventIds: string[];
  why: string;
};

export type DriveHarvest = {
  /** The located records, enriched. Same length and same order as the input, always. */
  records: SourceRecord[];
  bodyFindings: DriveBodyFinding[];
  confirmedTranscripts: string[];
  ruledNotTranscript: string[];
  /** Rulings naming a file the snapshot never measured — reported, never silently ignored. */
  orphanedConfirmations: DriveReadConfirmation[];
  /** Located records the snapshot never measured. Still leads; no longer claimed to be measured. */
  unmeasured: string[];
};

/** Docs + rulings → one lookup by file id, with orphaned rulings handed back rather than dropped. */
export function indexDriveDocs(
  docs: DriveDoc[],
  confirmations: DriveReadConfirmation[] = [],
): { byFileId: Map<string, ConfirmedDriveDoc>; orphanedConfirmations: DriveReadConfirmation[] } {
  const byFileId = new Map<string, ConfirmedDriveDoc>();
  for (const d of docs) byFileId.set(d.id, { ...d });

  const orphanedConfirmations: DriveReadConfirmation[] = [];
  for (const c of confirmations) {
    const doc = byFileId.get(c.fileId);
    if (!doc) {
      orphanedConfirmations.push(c);
      continue;
    }
    doc.confirmation = c;
  }

  return { byFileId, orphanedConfirmations };
}

/**
 * Located Gemini/Drive records + measurements + rulings → the same records, told the truth about.
 *
 * A record whose id the snapshot does not know comes back BYTE-FOR-BYTE UNCHANGED and is named in
 * `unmeasured`. Records from other sources are passed through untouched — the caller hands this the
 * whole located list and does not have to pre-filter, because a filter in the caller is a filter
 * nobody tests.
 */
export function fromDrive(
  located: SourceRecord[],
  docs: DriveDoc[],
  confirmations: DriveReadConfirmation[] = [],
): DriveHarvest {
  const { byFileId, orphanedConfirmations } = indexDriveDocs(docs, confirmations);

  const confirmedTranscripts: string[] = [];
  const ruledNotTranscript: string[] = [];
  const unmeasured: string[] = [];
  const seenFindings = new Set<string>();
  const bodyFindings: DriveBodyFinding[] = [];

  const records = located.map((rec) => {
    if (rec.source !== "gemini" && rec.source !== "drive") return rec;

    const doc = byFileId.get(rec.id);
    if (!doc) {
      unmeasured.push(rec.id);
      return rec;
    }

    const verdict = doc.confirmation?.verdict;
    if (verdict === "transcript") confirmedTranscripts.push(rec.id);
    else if (verdict) ruledNotTranscript.push(rec.id);

    // One doc, many events — the finding is about the FILE, so it is emitted once no matter how
    // many rows it would move, and it names every one of them.
    if (!verdict && (doc.bytes ?? 0) >= DRIVE_BODY_UNREAD_BYTES && !seenFindings.has(rec.id)) {
      seenFindings.add(rec.id);
      bodyFindings.push({
        fileId: rec.id,
        title: doc.title,
        day: doc.day,
        bytes: doc.bytes ?? 0,
        calendarEventIds: doc.calendarEventIds ?? [],
        why:
          `the doc holds ${(doc.bytes ?? 0).toLocaleString("en-US")} bytes that nobody in this repo ` +
          `has read. Open it and record transcript / summary-only / empty in ` +
          `\`MLE Internal Meetings/drive-read-confirmations.json\` — a Gemini doc that big is USUALLY ` +
          `notes and is SOMETIMES an apology, and the 3,186-byte one already read was the apology.`,
      });
    }

    return {
      ...rec,
      // The one thing that turns this true, and it is a person's ruling — not the byte count above.
      hasTranscript: verdict === "transcript",
    };
  });

  return {
    records,
    bodyFindings,
    confirmedTranscripts,
    ruledNotTranscript,
    orphanedConfirmations,
    unmeasured,
  };
}
