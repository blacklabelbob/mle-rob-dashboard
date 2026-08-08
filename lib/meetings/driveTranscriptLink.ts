/**
 * Q86 inc.39 — DoD (b): does a recording sitting in Drive already have a transcript on disk?
 *
 * WHY THIS MODULE EXISTS AT ALL
 *
 * inc.38 measured Drive `/Unprocessed` and reported three `.m4a` files as recordings **nobody has
 * ever transcribed**, and filed that to the flags ledger as a high finding asking for "a
 * transcriber pointed at three files". It was wrong. All three were transcribed on 2026-07-28 via
 * Deepgram nova-3 and have been sitting at `~/Projects/MyLocalEverything/transcripts/` ever since —
 * a fact **Q86's own DoD (f) already stated in writing** ("the real transcripts are already at
 * ~/Projects/MyLocalEverything/transcripts/"). A run measured one folder, found audio, and turned
 * its own silence about a second folder into a claim about the world.
 *
 * That is INCIDENT-LEDGER #22/#34 — the Omega shape — pointing the other way. #34 reported a
 * transcript as absent because our reader did not look in the right place; this reported a
 * transcript as absent because our reader did not look in the *other* place. A debt invented is not
 * the harmless direction of that error: it sends a human to re-transcribe 300 MB of audio that was
 * already done, and it leaves the real defect (three transcripts that exist and are not linked to
 * anything) invisible behind a task that looks like it is being handled.
 *
 * HOW A LINK IS EARNED — AND WHY TITLE ALONE IS NOT ENOUGH
 *
 * `driveDrain.ts` refusal #2 says nothing here joins a file to a meeting by title, and Q86 forbids
 * welding on a title generally. A filename is no stronger. So a link needs **two independent
 * signals that agree**, and it is reported `uncertain` — never `linked` — when only one does:
 *
 *   1. **The normalized titles match.** Drive's `Call with John Burns.m4a` against the transcript
 *      header `Call with John Burns`, extension and punctuation removed. This is the identifying
 *      signal, and by itself it is exactly the weld Q86 bans.
 *   2. **The implied bitrate is physically plausible.** Drive's `fileSize` divided by the duration
 *      the transcriber measured of the audio it was actually given. If the transcript is OF this
 *      recording, that quotient must land in the range real voice audio occupies.
 *
 * BE HONEST ABOUT WHAT (2) PROVES. It is a **corroboration, not an identification**. It rejects
 * gross mismatches — pairing the 209 MB file with a 31-minute transcript implies ~900 kbps and is
 * refused — but two genuinely different recordings of similar length and bitrate would both pass
 * it. It is here to catch the case where a title matched and the audio could not possibly be that
 * long, which is the realistic failure (a re-used filename, a truncated upload, a wrong export).
 * Neither signal is proof on its own; the claim this module makes is that both agreeing is enough
 * to stop calling the file untranscribed, and never more than that.
 *
 * THE CHECK THAT WOULD SETTLE IT IS NAMED AND DELIBERATELY NOT CLAIMED. Deepgram records a SHA-256
 * of the audio it was handed, and it is carried in the snapshot. Hashing the Drive file and
 * comparing would end the argument. It cannot be run from here — node holds no Drive credential and
 * the largest file is 209 MB — so **no verdict in this module rests on it**, and `why` says so, so
 * that a reader is never left thinking a hash was checked when it was not.
 *
 * Pure per CR-3: no clock, no network, no filesystem, no store. Both sides are arguments.
 */

/** A transcript already written to disk, as its own header and transcriber metadata describe it. */
export type LocalTranscript = {
  /** How a reader opens it — the filename under the transcripts directory. */
  ref: string;
  /** The title the transcriber wrote at the top of the file. */
  title: string;
  /** The transcriber's measured duration OF THE AUDIO IT WAS GIVEN, in seconds. */
  durationSeconds: number | null;
  /** SHA-256 of that audio, when the transcriber recorded one. Never verified here. */
  audioSha256?: string | null;
  transcribedOn?: string | null;
  engine?: string | null;
};

/** The recording side of the question: a Drive listing entry. Contents are never read. */
export type RecordingFile = {
  id: string;
  title: string;
  mimeType: string;
  /** Drive's own `fileSize` in bytes. */
  bytes?: number;
};

export type RecordingLinkStatus =
  /** Both signals agree: this recording already has a transcript on disk. */
  | "linked"
  /** One signal fired and the other did not, or could not be evaluated. Reported, never counted. */
  | "uncertain"
  /** No transcript on disk answers to this recording. It genuinely needs a transcriber. */
  | "none";

export type RecordingLink = {
  file: RecordingFile;
  status: RecordingLinkStatus;
  /** The transcript the signals point at. Present for `linked` and for `uncertain`. */
  transcript?: LocalTranscript;
  /** `bytes * 8 / durationSeconds / 1000`, rounded — null when either side is missing. */
  impliedKbps: number | null;
  /** In words, what was and was not established. Printed beside the verdict, never inferred. */
  why: string;
};

/**
 * The band an implied bitrate must land in for a transcript to corroborate a recording.
 *
 * Set as a WIDE plausibility band for compressed voice audio, deliberately not fitted to the three
 * files in front of us (which imply 208–219 kbps). A range drawn tightly around the samples on hand
 * is a fingerprint of those samples, and the next recorder — a different phone, a different export
 * preset, a mono 32 kbps voice memo — would be refused for no reason. The band's job is to reject
 * the impossible, not to recognise the familiar.
 */
export const PLAUSIBLE_AUDIO_KBPS = { min: 8, max: 512 } as const;

/**
 * Reduce a recording or transcript title to the form the two sides can be compared in.
 *
 * Drops a trailing media extension, lowercases, and collapses everything that is not a letter or a
 * digit to a single space. It does NOT stem, drop stop-words or score similarity: an edit distance
 * turns "close enough" into a number nobody re-reads, which is the reason `calendarSpine.ts`
 * refused one and the reason this refuses one too. Titles match exactly after normalization, or
 * they do not match.
 */
export function normalizeRecordingTitle(title: string): string {
  return title
    .replace(/\.(m4a|mp3|mp4|wav|aac|mov|webm|ogg|flac)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** `bytes * 8 / seconds / 1000`, or null when either side is unknown. Never guesses a default. */
export function impliedKbps(bytes?: number, durationSeconds?: number | null): number | null {
  if (!bytes || !durationSeconds || durationSeconds <= 0) return null;
  return Math.round((bytes * 8) / durationSeconds / 1000);
}

/**
 * Rule one recording against every transcript on disk.
 *
 * The title is what selects a candidate; the bitrate is what confirms or refuses it. A candidate
 * selected but not confirmed comes back `uncertain` WITH the transcript attached, because the
 * reader needs to see the pair that nearly matched — dropping it would hide the near-miss, which is
 * the same information loss as dropping a stub.
 */
export function linkRecording(
  file: RecordingFile,
  transcripts: LocalTranscript[],
): RecordingLink {
  const key = normalizeRecordingTitle(file.title);
  const candidate = transcripts.find((t) => normalizeRecordingTitle(t.title) === key);

  if (!candidate) {
    return {
      file,
      status: "none",
      impliedKbps: null,
      why: `No transcript on disk carries the title "${file.title}". This is a statement about the transcripts this run was handed, not proof that none exists anywhere — it needs a transcriber, or a wider look.`,
    };
  }

  const kbps = impliedKbps(file.bytes, candidate.durationSeconds);

  if (kbps === null) {
    return {
      file,
      status: "uncertain",
      transcript: candidate,
      impliedKbps: null,
      why: `Title matches "${candidate.ref}", but the second signal could not be evaluated: ${
        file.bytes ? "the transcript records no duration" : "Drive reports no file size"
      }. One signal is the title weld Q86 bans, so this is left uncertain rather than linked.`,
    };
  }

  if (kbps < PLAUSIBLE_AUDIO_KBPS.min || kbps > PLAUSIBLE_AUDIO_KBPS.max) {
    return {
      file,
      status: "uncertain",
      transcript: candidate,
      impliedKbps: kbps,
      why: `Title matches "${candidate.ref}", but ${file.bytes} bytes over ${candidate.durationSeconds}s implies ${kbps} kbps — outside the ${PLAUSIBLE_AUDIO_KBPS.min}–${PLAUSIBLE_AUDIO_KBPS.max} kbps band real voice audio occupies. The two signals disagree, so nothing is claimed: same title, and it cannot be the same audio.`,
    };
  }

  return {
    file,
    status: "linked",
    transcript: candidate,
    impliedKbps: kbps,
    why: `Already transcribed: "${candidate.ref}"${
      candidate.transcribedOn ? ` (${candidate.transcribedOn}` : ""
    }${candidate.engine ? `, ${candidate.engine})` : candidate.transcribedOn ? ")" : ""}. Title matches and ${file.bytes} bytes over ${candidate.durationSeconds}s implies ${kbps} kbps, which is plausible voice audio — two independent signals agreeing. NOT hash-verified: ${
      candidate.audioSha256
        ? "the transcriber's audio SHA-256 is on file and would settle it, but hashing the Drive file needs a credential this repo does not hold."
        : "the transcriber recorded no audio hash."
    }`,
  };
}

/** Rule every recording in a listing. Non-audio/video files are not this module's question. */
export function linkRecordings(
  files: RecordingFile[],
  transcripts: LocalTranscript[],
): RecordingLink[] {
  return files
    .filter((f) => /^(audio|video)\//.test(f.mimeType))
    .map((f) => linkRecording(f, transcripts));
}
