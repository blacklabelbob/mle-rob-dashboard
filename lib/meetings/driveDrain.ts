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
  /** Opened and ruled by a reader, and NOT filed — the ruling names what still blocks it. */
  | "read-not-filed"
  /** Audio/video whose transcript already exists on disk (inc.39). Owed a link, not a transcriber. */
  | "transcribed-elsewhere"
  /** Audio/video with no transcript yet: needs a transcriber before it can be captured. */
  | "needs-transcription"
  /** A document nobody has opened and ruled. The byte floor is deliberately not applied. */
  | "needs-a-read";

/**
 * A recording this run was shown to already have a transcript sitting somewhere else.
 *
 * Passed IN, never decided here: the two-signal rule that earns one lives in
 * `driveTranscriptLink.ts` and is tested there. Only `linked` verdicts belong in this list — an
 * `uncertain` one is a near-miss for a human to read, not a reason to stop calling a file
 * untranscribed.
 */
export type TranscribedElsewhere = {
  fileId: string;
  /** How a reader opens the transcript. */
  transcriptRef: string;
  /** The sentence the linker wrote about what was and was not established. Carried verbatim. */
  why: string;
};

/**
 * A doc somebody actually OPENED, together with the reason it still is not filed.
 *
 * This exists because `needs-a-read` and `eligible` were the only two doors, and the three docs in
 * `/Unprocessed` fit neither: they have now been read end to end (inc.47), and reading them did not
 * make any of them filable. Leaving them in `needs-a-read` sends the next reader to redo the read —
 * the same waste `transcribed-elsewhere` was added to stop for audio (inc.39). Promoting them to
 * `eligible` would be worse: `eligible` means *ruled carried into the CRM*, and none of them were.
 *
 * `blockedBy` is REQUIRED, and that is the invariant. A read with nothing blocking it is a capture
 * ruling and belongs in `DrainRuling`; if this type let `blockedBy` go empty, a file could sit here
 * forever looking accounted-for while nobody could say what it was waiting on — which is exactly
 * how the drain reached "never run once" without anyone noticing.
 */
export type DocRead = {
  fileId: string;
  /** What the read established. Carried verbatim into the report; never summarised here. */
  found: string;
  /** The named condition that still blocks filing. Never a mood — a thing someone can do. */
  blockedBy: string;
};

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
  /** Recordings whose transcript already exists elsewhere — owed a link and a move, not a rerun. */
  transcribedElsewhere: DrainVerdict[];
  /** Recordings with no transcript. */
  needsTranscription: DrainVerdict[];
  /** Documents owed a human read. */
  needsARead: DrainVerdict[];
  /** Documents a human HAS read, still unfilable — each carrying the condition that blocks it. */
  readNotFiled: DrainVerdict[];
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
  transcribed: TranscribedElsewhere[] = [],
  reads: DocRead[] = [],
): DrainReport {
  const drainedIds = new Set(processed.map((f) => f.id));
  const ruledIds = new Set(rulings.map((r) => r.fileId));
  const transcribedById = new Map(transcribed.map((t) => [t.fileId, t]));
  // A read with no stated blocker is dropped rather than trusted: the whole value of this class is
  // that every file in it names what is holding it, and an empty `blockedBy` would print a file as
  // handled with a blank where the reason goes. Dropped means it falls back to `needs-a-read`,
  // which overstates the work left — the safe direction.
  const readById = new Map(
    reads.filter((r) => r.blockedBy.trim().length > 0).map((r) => [r.fileId, r]),
  );

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
      // Ordered BEFORE the untranscribed class on purpose: inc.38 shipped the opposite reading and
      // filed a debt that did not exist. A recording with a transcript on disk is not waiting on a
      // transcriber, and must never be counted as if it were.
      const link = transcribedById.get(file.id);
      if (link) {
        return {
          file,
          kind: "transcribed-elsewhere" as const,
          why: `${link.why} It is still owed a LINK into the CRM and a move out of /Unprocessed — but it is NOT owed a transcriber, and reporting it as untranscribed sends a human to redo work already done.`,
        };
      }
      return {
        file,
        kind: "needs-transcription" as const,
        why: `A ${file.mimeType} recording with no transcript beside it. It is an artifact, not a placeholder — it must not be dropped and must not be counted as coverage. It needs a transcriber before its meeting can be captured.`,
      };
    }
    // Deliberately BELOW the audio branch, not above it. A read could in principle name an .m4a,
    // and if it did, letting it win here would suppress the `transcribed-elsewhere` sentence that
    // inc.39 added specifically to stop a human re-running a transcription that already exists.
    // The audio classes protect work; this class only replaces `needs-a-read`, so it sits where
    // `needs-a-read` sits and nowhere earlier.
    const read = readById.get(file.id);
    if (read) {
      return {
        file,
        kind: "read-not-filed" as const,
        why: `${read.found} STILL NOT FILED — ${read.blockedBy} Reading it did not capture it, and this line exists so the next reader does not open it again to learn that.`,
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
  const transcribedElsewhere = verdicts.filter((v) => v.kind === "transcribed-elsewhere");
  const needsTranscription = verdicts.filter((v) => v.kind === "needs-transcription");
  const needsARead = verdicts.filter((v) => v.kind === "needs-a-read");
  const readNotFiled = verdicts.filter((v) => v.kind === "read-not-filed");

  return {
    verdicts,
    drained: processed,
    eligible,
    transcribedElsewhere,
    needsTranscription,
    needsARead,
    readNotFiled,
    orphanedRulings,
    summary: drainSummary(unprocessed.length, processed.length, eligible.length, readNotFiled.length),
  };
}

/**
 * The one line a report may print about the drain.
 *
 * It states the two counts that were actually re-listed and, when nothing has ever landed in
 * `/Processed`, says that in words rather than letting a bare `0` read as a rounding error.
 */
export function drainSummary(
  unprocessed: number,
  processed: number,
  eligible: number,
  readNotFiled = 0,
): string {
  const head = `Drive drain: ${unprocessed} in /Unprocessed · ${processed} in /Processed`;
  const never = processed === 0 ? " — the drain has never run once" : "";
  const owed =
    eligible === 0
      ? " · 0 files are ruled ready to move, so the backlog is a reading backlog, not a moving one"
      : ` · ${eligible} ruled captured and still owed a move`;
  // Stated separately rather than folded into the reading backlog. A read file is NOT reading work
  // left, and it is NOT a move either — it is a third thing, and the sentence that hid it inside
  // "a reading backlog" would send someone to re-read files that have already been read.
  const read =
    readNotFiled === 0 ? "" : ` · ${readNotFiled} read and still unfilable, each naming its blocker`;
  return `${head}${never}${owed}${read}.`;
}
