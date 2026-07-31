// What the manifest says about a meeting whose full fetch just failed.
//
// THE FAILURE THIS FIXES (2026-07-31, caught as an orphaned working tree): the 30-minute
// meeting-intake cron rebuilds the manifest from scratch every run. When Fireflies failed to
// return two 2026-06-16 Caleb/Rob/Will transcripts, the run replaced their finished rows —
// duration, participant domains, keywords, sentence count, the Fireflies link — with
// `{ bodyOnDisk: false, error: "fetch-failed" }`. Both bodies were sitting on disk, written
// 30 minutes earlier by the run before it. So one transient API blip did two things:
//
//   1. LIED. `bodyOnDisk: false` was written without ever looking at the disk, next to a
//      24KB body file the same script had written.
//   2. DESTROYED. Everything already learned about those two calls was overwritten with a
//      stub, and the cron would have committed it. The only surviving copy of "who was in
//      the room" was the row it just erased.
//
// The header of fireflies-ingest.mjs had claimed for two days that "the manifest is rebuilt
// from what is actually on disk". It was not — nothing on the failure path had ever consulted
// the disk. That sentence is now true rather than aspirational.
//
// THE RULE: a fetch that fails may never subtract. It reports, it does not overwrite.

/**
 * The manifest row for a meeting whose detail fetch failed this run.
 *
 * @param {object}  args
 * @param {object}  args.stub        - what the LIST query gave us (id, title, date).
 * @param {object=} args.previous    - this meeting's row from the manifest on disk, if any.
 * @param {boolean} args.bodyOnDisk  - whether the body file ACTUALLY exists, checked by the caller.
 * @returns {object} the row to write.
 */
export function resolveFailedRow({ stub, previous, bodyOnDisk }) {
  // Last known good wins. A previous run already answered these questions correctly; a
  // network blip is not new information about the meeting, so it gets to say nothing.
  if (previous) return previous;

  // Nothing known before — this is the first time we have seen the meeting and we still
  // could not read it. Keep the little the LIST query gave us, and report the disk as it
  // is rather than as we assume it to be.
  return {
    id: stub.id,
    title: stub.title ?? null,
    date: stub.dateString ?? stub.date ?? null,
    bodyOnDisk,
    error: "fetch-failed",
  };
}

/**
 * Index an on-disk manifest by meeting id, so a failed fetch can find what we already knew.
 * Tolerates a missing, empty, or malformed file — a manifest we cannot parse must not stop
 * the ingest, it just means no row is carried forward.
 *
 * @param {string|null} raw - the manifest file contents, or null if it does not exist.
 * @returns {Map<string, object>}
 */
export function indexPreviousManifest(raw) {
  if (!raw) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Map();
  }
  const meetings = Array.isArray(parsed?.meetings) ? parsed.meetings : [];
  return new Map(meetings.filter((m) => m && typeof m.id === "string").map((m) => [m.id, m]));
}
