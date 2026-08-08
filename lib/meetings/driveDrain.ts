/**
 * Q86 inc.38 — DoD (e): the Drive `/Unprocessed` → `/Processed` drain, as arithmetic.
 *
 * The DoD carries one sentence that is really a refusal, and it is the whole design of this
 * module:
 *
 *   **"moved" may only be claimed after re-listing both folders.**
 *
 * So `drained` is derived from the PROCESSED listing and from nothing else. There is no code path
 * in here by which an intention, an eligibility, a queued job or a hopeful log line can turn into
 * a drained file. If the file is not sitting in `/Processed` when someone looks, it was not moved,
 * and this module will say so however many times it is asked.
 *
 * WHAT IT WILL NOT DO, AND WHY EACH REFUSAL WAS PAID FOR
 *
 * 1. **It does not apply the DoD (f) byte floor to a native Google Doc.** The floor exists because
 *    a 26-byte `.txt` is a filename echoed back, not speech (`spineSources.ts`). A native Doc's
 *    Drive `fileSize` is not the length of its text — two of the docs in this folder report a flat
 *    1024 — so running the floor over them would manufacture a verdict out of a number that does
 *    not mean what the rule needs it to mean. Docs come back `needs-a-read`, which is the honest
 *    answer, and `transcriptionStatus` / the read-confirmation files stay the single place a doc
 *    is ruled. A rule applied to the wrong unit is worse than no rule: it is green.
 *
 * 2. **It does not decide that a meeting was captured.** Nothing here joins a file to a meeting by
 *    title — Q86 forbids welding on a title, and a filename is a weaker signal than the titles that
 *    ban already covers. A file becomes eligible to move only when a ruling names its id, the same
 *    contract `drive-read-confirmations.json` already uses. Unruled means unruled.
 *
 * 3. **Audio is not a transcript and is not a stub either.** Rob asked for videos/recordings "for
 *    most" and transcripts "for All". An `.m4a` sitting here is a real artifact that has not been
 *    through a transcriber — reporting it as a placeholder would lose it, and reporting it as
 *    coverage would be the false-coverage failure. It gets its own class and says what it needs.
 *
 * Pure per CR-3: no clock, no network, no filesystem, no store. Both listings are arguments.
 */

/** One file as a Drive folder listing describes it. Contents are never read here. */
export type DriveFile = {
  id: string;
  title: string;
  mimeType: string;
  /** Drive's own `fileSize`. Absent for some native types — and NOT text length for a Doc. */
  bytes?: number;
};

/** A ruling that a named file has been carried into the CRM, keyed by file id, never by title. */
export type DrainRuling = {
  fileId: string;
  /** Free prose: what the reader did with it. Recorded so the eligibility can be re-checked. */
  note?: string;
};

export type DrainClass =
  /** In `/Processed`. The only class a "moved" claim may come from. */
  | "drained"
  /** Ruled captured by a human, still in `/Unprocessed` — this is the actual move backlog. */
  | "eligible"
  /** Audio/video with no transcript yet: needs a transcriber before it can be captured. */
  | "needs-transcription"
  /** A document nobody has opened and ruled. The byte floor is deliberately not applied. */
  | "needs-a-read";

export type DrainVerdict = {
  file: DriveFile;
  kind: DrainClass;
  /** In words, why this file is in this class — printed beside it, never inferred by a reader. */
  why: string;
};

export type DrainReport = {
  /** Every file measured in `/Unprocessed`, in listing order. */
  verdicts: DrainVerdict[];
  /** Files found in `/Processed`. The drain's only evidence of itself. */
  drained: DriveFile[];
  /** Ruled captured and still sitting in `/Unprocessed` — waiting on a move this repo cannot do. */
  eligible: DrainVerdict[];
  /** Recordings with no transcript. */
  needsTranscription: DrainVerdict[];
  /** Documents owed a human read. */
  needsARead: DrainVerdict[];
  /**
   * Rulings naming a file that is in NEITHER folder. Reported rather than dropped: a ruling with
   * no file behind it means either the file moved somewhere unexpected or the id is wrong, and
   * both are findings.
   */
  orphanedRulings: DrainRuling[];
  /** The sentence a caller may print about progress. Never says "moved" without the evidence. */
  summary: string;
};

const AUDIO_VIDEO = /^(audio|video)\//;
const GOOGLE_NATIVE = /^application\/vnd\.google-apps\./;

/**
 * Rule the drain from two folder listings and the rulings that name captured files.
 *
 * `processed` is authoritative and alone: a file in it is drained even if no ruling exists, and a
 * file absent from it is not drained however confidently anything else claims otherwise.
 */
export function drainReport(
  unprocessed: DriveFile[],
  processed: DriveFile[],
  rulings: DrainRuling[] = [],
): DrainReport {
  const drainedIds = new Set(processed.map((f) => f.id));
  const ruledIds = new Set(rulings.map((r) => r.fileId));

  const verdicts: DrainVerdict[] = unprocessed.map((file) => {
    if (drainedIds.has(file.id)) {
      // Belt and braces: a file listed in BOTH folders is a Drive multi-parent, not a move.
      return {
        file,
        kind: "drained" as const,
        why: "Listed in /Processed as well as /Unprocessed — Drive multi-parenting, so the copy in /Unprocessed still needs unparenting before the drain is genuinely complete.",
      };
    }
    if (ruledIds.has(file.id)) {
      return {
        file,
        kind: "eligible" as const,
        why: "A ruling names this file id as carried into the CRM, and it is still in /Unprocessed. It is owed a move — which this repo cannot perform: the Drive MCP has no move or delete, so it needs the Drive API (addParents/removeParents) or an n8n node.",
      };
    }
    if (AUDIO_VIDEO.test(file.mimeType)) {
      return {
        file,
        kind: "needs-transcription" as const,
        why: `A ${file.mimeType} recording with no transcript beside it. It is an artifact, not a placeholder — it must not be dropped and must not be counted as coverage. It needs a transcriber before its meeting can be captured.`,
      };
    }
    return {
      file,
      kind: "needs-a-read" as const,
      why: GOOGLE_NATIVE.test(file.mimeType)
        ? "A native Google Doc nobody has opened and ruled. The DoD (f) byte floor is deliberately NOT applied here: Drive's fileSize for a native Doc is not the length of its text, so the floor would be a verdict built on a number that does not mean what the rule needs."
        : "A document nobody has opened and ruled. It is not classified by size — a ruling is recorded, never inferred.",
    };
  });

  const orphanedRulings = rulings.filter(
    (r) => !drainedIds.has(r.fileId) && !unprocessed.some((f) => f.id === r.fileId),
  );

  const eligible = verdicts.filter((v) => v.kind === "eligible");
  const needsTranscription = verdicts.filter((v) => v.kind === "needs-transcription");
  const needsARead = verdicts.filter((v) => v.kind === "needs-a-read");

  return {
    verdicts,
    drained: processed,
    eligible,
    needsTranscription,
    needsARead,
    orphanedRulings,
    summary: drainSummary(unprocessed.length, processed.length, eligible.length),
  };
}

/**
 * The one line a report may print about the drain.
 *
 * It states the two counts that were actually re-listed and, when nothing has ever landed in
 * `/Processed`, says that in words rather than letting a bare `0` read as a rounding error.
 */
export function drainSummary(unprocessed: number, processed: number, eligible: number): string {
  const head = `Drive drain: ${unprocessed} in /Unprocessed · ${processed} in /Processed`;
  const never = processed === 0 ? " — the drain has never run once" : "";
  const owed =
    eligible === 0
      ? " · 0 files are ruled ready to move, so the backlog is a reading backlog, not a moving one"
      : ` · ${eligible} ruled captured and still owed a move`;
  return `${head}${never}${owed}.`;
}
