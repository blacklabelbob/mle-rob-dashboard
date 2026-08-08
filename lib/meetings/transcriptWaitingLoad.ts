/**
 * Q86 inc.46 — the fs half, kept out of `transcriptWaiting.ts` so the ladder stays pure (CR-3).
 *
 * The reads live in `MLE Internal Meetings/transcript-reads/`, beside the transcripts and the
 * archive, NOT under `data/`. That is deliberate and it is not moved here: those files are the
 * human record of a read, committed where the rest of the meeting archive lives, and relocating
 * them to satisfy a loader would break every citation the last three increments wrote.
 *
 * "COULD NOT READ" IS NOT "NOTHING WAITING", the same distinction `scanPicksLoad` draws. A record
 * page that swallows a read error would print a silent, confident nothing over a 131-minute call.
 * So the failure comes back as `unavailable: true` and the surface states it.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { TranscriptRead } from "./transcriptWaiting";

export const TRANSCRIPT_READS_DIR = join("MLE Internal Meetings", "transcript-reads");

export type TranscriptReadsLoad = {
  reads: TranscriptRead[];
  /** True only when we tried to look and could not — never for "the directory is empty". */
  unavailable: boolean;
};

export function loadTranscriptReads(
  dir: string = join(process.cwd(), TRANSCRIPT_READS_DIR),
): TranscriptReadsLoad {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return { reads: [], unavailable: true };
  }

  const reads: TranscriptRead[] = [];
  let failed = false;
  for (const f of files) {
    try {
      reads.push(JSON.parse(readFileSync(join(dir, f), "utf8")) as TranscriptRead);
    } catch {
      // One unreadable file does not hide the other two — but it is never silent.
      failed = true;
    }
  }
  return { reads, unavailable: failed };
}
