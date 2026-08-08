/**
 * Q86 inc.37 — the 20 rows that could not be closed by READING, answered by Notion's own field.
 *
 * inc.36 finished the reading: every Notion body in the archive holding prose is ruled. What was
 * left was 20 rows the harvester measured at 0 characters over >=1 block — the `[transcription]`
 * wrapper with nothing under it. Those rows produced **no finding at all** in `spine:q86`: not a
 * body nobody ruled (there is no body), not ruled, just absent from every list. Rob's bar is DoD
 * (b) — *a transcript, or an explicit NAMED reason there cannot be one* — and silence is neither.
 *
 * `scripts/notion-transcription-scan.mjs` measured all 36 wrapper-bearing rows live on 2026-08-08
 * (20 unruled + 16 already-ruled, kept as controls). This module joins that measurement to the
 * rulings and says, per row, which of three things is true. It holds no ladder of its own —
 * `classifyTranscription` is the single ladder for the status field (Q84 inc.49), and re-deciding
 * `transcription_paused` here would be the second opinion that lets the two disagree.
 *
 * THE CONTROLS ARE THE POINT, and they are why this is evidence rather than a guess: of the 16
 * ruled rows, all **14** that a human read end to end and ruled `transcript` report `notes_ready`,
 * and the two that read as `summary-only` / `empty` report `transcription_not_started` /
 * `transcription_paused`. The field tracks the artifact. That is what earned `notes_ready` its
 * place in the ladder's PRODUCED set — and note the direction: it moves rows toward OWED, never
 * toward closed, so being wrong about it costs a second look and never a false close.
 *
 * A RULED ROW IS NEVER RE-JUDGED HERE. It was measured to check the field, and a body somebody
 * read end to end outranks a status column about it — permanently. If the two ever disagree the
 * reading wins, because one of them is the meeting and the other is a label on it.
 *
 * PURE per CR-3: handed already-read scan rows; no fs, no network, no clock.
 */
import { classifyTranscription } from "./transcriptionStatus";

/** One row as `scripts/notion-transcription-scan.mjs` wrote it. */
export type TranscriptionScanRow = {
  pageId: string;
  title?: string;
  /** Exactly what Notion returned. `null` means no transcription block, or an unmeasured row. */
  status: string | null;
  /** Non-null means the fetch FAILED. Never an absence — the row stays owed. */
  error?: string | null;
};

/** What the scan settles about one row. */
export type NotionAbsenceDisposition =
  /** Notion states no transcript was ever produced. The named reason DoD (b) asks for. */
  | "named-absence"
  /** Notion states a transcript IS there and the reader never recovered it. Owed, and loud. */
  | "owed-transcript"
  /** Not measured, or a status the ladder does not recognise. Owed, unchanged. */
  | "owed-unmeasured";

export type NotionAbsence = {
  pageId: string;
  title: string;
  status: string | null;
  disposition: NotionAbsenceDisposition;
  /** Why, in the words that will be printed to Rob. */
  why: string;
  /** The one action that would close it. Empty for a named absence — nothing is owed. */
  action: string;
};

/** Notion ids appear hyphenated in some payloads and bare in others; the join must not care. */
const norm = (id: string) => id.replace(/-/g, "").toLowerCase();

/**
 * Scan rows → one disposition each, for the rows no ruling covers.
 *
 * Ruled rows are dropped from the result (never re-judged) and counted in `skippedRuled`, so the
 * discard is visible rather than silent — the same rule `indexNotionReads` follows for orphans.
 */
export function notionAbsences(
  scan: readonly TranscriptionScanRow[],
  ruledPageIds: readonly string[],
): { absences: NotionAbsence[]; skippedRuled: number } {
  const ruled = new Set(ruledPageIds.map(norm));
  const absences: NotionAbsence[] = [];
  let skippedRuled = 0;

  for (const row of scan) {
    if (ruled.has(norm(row.pageId))) {
      skippedRuled += 1;
      continue;
    }
    const title = row.title ?? row.pageId;

    if (row.error) {
      absences.push({
        pageId: row.pageId,
        title,
        status: null,
        disposition: "owed-unmeasured",
        why: `the status could not be read: ${row.error}`,
        action:
          "re-run `node scripts/notion-transcription-scan.mjs` — a failed fetch is not an absence, " +
          "and this row keeps whatever it was owed before the scan ran.",
      });
      continue;
    }

    const verdict = classifyTranscription(row.status);
    if (verdict.disposition === "never-produced") {
      absences.push({
        pageId: row.pageId,
        title,
        status: verdict.status,
        disposition: "named-absence",
        why: verdict.why,
        action: "",
      });
    } else if (verdict.disposition === "transcript-exists") {
      absences.push({
        pageId: row.pageId,
        title,
        status: verdict.status,
        disposition: "owed-transcript",
        why: verdict.why,
        action:
          "OPEN THIS PAGE IN NOTION — Notion says the transcript is ready and the harvester " +
          "recovered 0 characters, so the text exists somewhere the API read did not reach.",
      });
    } else {
      absences.push({
        pageId: row.pageId,
        title,
        status: verdict.status,
        disposition: "owed-unmeasured",
        why: verdict.why,
        action: "open the page in Notion; the field does not answer this row either way.",
      });
    }
  }

  return { absences, skippedRuled };
}

/** The subset that is a FINDING: Notion says the transcript is ready and nobody has the text. */
export function unrecoveredReadyTranscripts(absences: readonly NotionAbsence[]): NotionAbsence[] {
  return absences.filter((a) => a.disposition === "owed-transcript");
}
