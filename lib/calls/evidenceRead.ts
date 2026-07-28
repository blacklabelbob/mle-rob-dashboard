// BUILD-QUEUE Q68 inc.46 — THE HOP: inc.45's evidence module, bound to what the store holds.
//
// inc.45 built `callEvidence` and NOTHING CALLED IT — the same shape inc.22 called out about
// inc.21, and the same reason it matters: a verdict that has to be recomputed by hand in a
// source file is a verdict the next increment will copy from the last one instead. This is
// the read half that makes "has a call ever run" a value the deployment answers.
//
// It is deliberately thin. Every judgement — the furthest rung, the contradictions, what may
// be called `proven` — stays in the pure module (CR-3); this file only fetches, and both of
// its inputs are INJECTED so the fetching can be asserted without Postgres in the room.
//
// TWO DECISIONS THAT ARE NOT OBVIOUS:
//
//  1. `complete` TRANSCRIPTS ONLY. 0021's status is one of pending/complete/failed, and a
//     `failed` row is a transcript that was ATTEMPTED, not words that exist. Counting rows
//     rather than completions would let a call Deepgram rejected advance the report to
//     `words` — announcing that the transcription leg works on the exact evidence that it
//     did not.
//
//  2. THE READ IS PAGED, AND A TRUNCATED READ IS NEVER REPORTED AS A SMALL ONE. PostgREST
//     caps a response (1000 rows by default), so a single unpaged select silently stops
//     counting — and an undercount here reads as "fewer calls have been transcribed", which
//     is the fabricated-evidence direction this feature refuses. The cursor is keyset on
//     `recording_sid` (unique in 0021), so nothing written mid-read can shift a page and
//     skip a row the way an offset would.

import type { Activity } from "@/lib/types";
import {
  callEvidence,
  evidenceCountsFromActivities,
  type CallEvidence,
  type EvidenceSection,
} from "./callEvidence";
import type { TranscriptReadClient } from "./transcriptDb";

/** How many `recording_sid`s travel in one page. Same bound as `transcriptRead.READ_PAGE`. */
export const SID_PAGE = 500;

/**
 * The two reads this needs, named as capabilities rather than as a database.
 *
 * `listCallActivities` is the store's `listActivities` — passed in whole rather than
 * filtered here, because the `source === "dialer" && type === "call"` judgement already
 * lives in `evidenceCountsFromActivities` and a second copy of it is a second thing that
 * can drift.
 */
export type EvidenceSource = {
  listCallActivities(): Promise<Activity[]>;
  /** `recording_sid`s of COMPLETE transcripts at `sid >= fromSid`, in sid order. */
  fetchTranscribedSids(fromSid: string, limit: number): Promise<string[]>;
};

/**
 * A transcript is tied to an activity by a DERIVED id, never a stored foreign key:
 * `recordingActivity.callActivityId` builds `dialer-<recordingSid>` so Twilio's retries
 * upsert one timeline row. Re-deriving it here is what lets the two tables be joined at all
 * — 0021 has no activity column.
 */
export function activityIdsFromSids(sids: readonly string[]): Set<string> {
  const ids = new Set<string>();
  for (const sid of sids) {
    const s = sid.trim();
    if (s) ids.add(`dialer-${s}`);
  }
  return ids;
}

/**
 * Every complete-transcript sid, paged.
 *
 * The cursor is `>=` rather than `>` (the read client exposes `gte`, not `gt`), so each page
 * after the first repeats exactly one row — harmless into a Set, and progress is still
 * guaranteed because `recording_sid` is unique, so a full page can never be one repeated id.
 * The loop stops when a page adds nothing new, which is also the only safe stop condition if
 * the backend ever caps a page below `limit`.
 */
export async function allTranscribedSids(
  source: Pick<EvidenceSource, "fetchTranscribedSids">,
  limit = SID_PAGE,
): Promise<string[]> {
  const seen = new Set<string>();
  let cursor = "";
  // Bounded so a backend that answers the same page forever cannot hang the endpoint. The
  // bound is on ITERATIONS, not on rows kept — nothing already read is thrown away.
  for (let page = 0; page < 1000; page++) {
    const rows = await source.fetchTranscribedSids(cursor, limit);
    if (!rows.length) break;
    const before = seen.size;
    for (const sid of rows) {
      const s = sid.trim();
      if (s) seen.add(s);
    }
    if (seen.size === before) break;
    const last = rows[rows.length - 1]?.trim() ?? "";
    if (!last || last === cursor) break;
    cursor = last;
    if (rows.length < limit) break;
  }
  return [...seen];
}

/**
 * What the deployment can actually say about calls that have happened.
 *
 * Errors are NOT swallowed into `none`. A store that cannot be read and a dashboard nobody
 * has dialled produce the identical zero, and reporting the first as the second is how a
 * broken read gets mistaken for an unused feature — the exact confusion `callEvidence`
 * refuses to make between "no calls" and "why".
 */
export async function readCallEvidence(source: EvidenceSource): Promise<CallEvidence> {
  const [activities, sids] = await Promise.all([
    source.listCallActivities(),
    allTranscribedSids(source),
  ]);
  return callEvidence(evidenceCountsFromActivities(activities, activityIdsFromSids(sids)));
}

/**
 * The same read, as the arming report is allowed to consume it.
 *
 * A THROW BECOMES `unreadable`, NEVER `none` — the whole reason `EvidenceSection` has two
 * shapes. This wrapper is also what keeps the endpoint answering at all on a half-configured
 * prod: the arming report's entire job is to be readable when keys are missing, and an
 * unreadable store must degrade one section rather than 500 the page that explains why.
 *
 * The reason is the error's own message, never a guess at a cause.
 */
export async function evidenceSection(source: EvidenceSource): Promise<EvidenceSection> {
  try {
    return { state: "read", evidence: await readCallEvidence(source) };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      state: "unreadable",
      reason: `Call evidence could not be read, so nothing here says whether a call has ever run: ${reason}`,
    };
  }
}

/**
 * The `EvidenceSource` production runs against.
 *
 * `status = complete` is applied SERVER-SIDE (decision 1 above) and `order` is issued on the
 * server too — the keyset cursor is only sound if pages arrive in sid order, and PostgREST's
 * row order without an explicit `order` is whatever the plan produced.
 */
export function supabaseEvidenceSource(
  /**
   * A FACTORY, not a client. `transcriptClient()` throws when the service key is unset —
   * exactly the deployment this report exists for — and a client built eagerly at the call
   * site would throw OUTSIDE `evidenceSection`'s catch, 500ing the whole arming report on
   * the one configuration it must survive.
   */
  clientFor: () => TranscriptReadClient,
  listActivities: () => Promise<Activity[]>,
): EvidenceSource {
  return {
    listCallActivities: listActivities,
    async fetchTranscribedSids(fromSid: string, limit: number) {
      const { data, error } = await clientFor()
        .from("call_transcripts")
        .select("recording_sid")
        .eq("status", "complete")
        .gte("recording_sid", fromSid)
        .order("recording_sid", { ascending: true })
        .limit(limit);
      // Rethrown, not emptied: an empty result and a failed query are the same value to a
      // caller that swallows this, and one of them means "no call was ever transcribed".
      if (error) throw new Error(`call_transcripts evidence read: ${error.message}`);
      return (data ?? [])
        .map((row) =>
          row && typeof row === "object"
            ? (row as Record<string, unknown>).recording_sid
            : null,
        )
        .filter((sid): sid is string => typeof sid === "string");
    },
  };
}
