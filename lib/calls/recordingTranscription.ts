// BUILD-QUEUE Q68 (c) inc.8 — THE ROUTE EDGE's one decision, kept out of the route.
//
// inc.7 answers "which outcomes are owed a row". This file answers the question that comes
// one step earlier and can only be asked at the webhook: **should this recording be sent to
// a transcription provider at all?** It is pure per CR-3 — no network, no clock, no env
// read of its own — so the three refusals below are pinned by tests rather than by reading
// the route.
//
// Everything it does NOT decide is deliberate: a missing/unusable recording URL is passed
// straight through, because inc.7 already decided that case writes a VISIBLE `failed` row
// carrying our reason. Pre-empting it here would turn a stated failure back into an absence.

import { transcriptKey } from "./transcriptSegments";

export type TranscriptionSkip =
  /** Nothing to key a transcript on. 0021 would reject the row anyway. */
  | "no-recording-sid"
  /** The call could not be filed on anyone's timeline — see `planTranscription`. */
  | "unfiled"
  /** No `DEEPGRAM_API_KEY`. No job was ever requested, so nothing is owed a row. */
  | "disabled";

export type TranscriptionPlan =
  | { kind: "transcribe"; recordingSid: string; recordingUrl: string }
  | { kind: "skipped"; reason: TranscriptionSkip };

/**
 * Decide whether a completed recording gets transcribed.
 *
 * **`filed: false` skips — and this is the decision worth arguing with.** A transcript is
 * keyed by `recording_sid` and carries a *derived* `activity_id` (`dialer-<sid>`), so when
 * the call never became an activity (unknown number, or both sides in the CRM), the row
 * would point at an activity that does not exist and never will: verbatim customer speech
 * sitting in the most sensitive table in the database, reachable by nothing in the UI and
 * known to no one. Nothing retries it into existence either — an unmatched number is a
 * permanent condition (inc.1), so the orphan would be permanent too. Storing less is the
 * right trade here; the cost is stated, not hidden: if a contact is created later, that
 * call's words are not waiting for them.
 *
 * The skip reasons are ordered most-fundamental first, because the reason is what a human
 * reads six months later asking why a call has no transcript. A missing sid outranks
 * `unfiled` (there is nothing to store *or* file), and both outrank `disabled` (a key would
 * not have helped).
 */
export function planTranscription(args: {
  configured: boolean;
  filed: boolean;
  recordingSid: string | null | undefined;
  recordingUrl: string | null | undefined;
}): TranscriptionPlan {
  const sid = transcriptKey(args.recordingSid);
  if (!sid) return { kind: "skipped", reason: "no-recording-sid" };
  if (!args.filed) return { kind: "skipped", reason: "unfiled" };
  if (!args.configured) return { kind: "skipped", reason: "disabled" };

  return { kind: "transcribe", recordingSid: sid, recordingUrl: (args.recordingUrl ?? "").trim() };
}

/** What the webhook reports back about transcription. One string, so a log line reads. */
export function transcriptionLabel(plan: TranscriptionPlan): string {
  return plan.kind === "transcribe" ? "queued" : `skipped:${plan.reason}`;
}
