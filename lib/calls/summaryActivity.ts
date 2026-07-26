// BUILD-QUEUE Q68 (c) inc.11 — THE ACTIVITY UPDATE: which columns a summary occupies on
// the row a rep actually reads.
//
// inc.9 decided what an answer may become, inc.10 got the answer. This is where it lands.
// The file is pure per CR-3 — no network, no clock, no store — because the danger here is
// not the write mechanics, it is the SHAPE of the write: `fromActivity` (lib/crm.ts) maps
// every `undefined` field to a SQL `null`, and `upsertActivity` is a whole-row upsert. So a
// caller that rebuilt an activity from the webhook payload and added a summary would silently
// null every column it did not happen to know about. That is why this returns a
// field-scoped PATCH instead of a row: the summariser's reach is stated in the type, not
// left to the discipline of whoever wires it up next.

import type { Activity } from "@/lib/types";
import type { BuyingSignal, CallSummary, SummaryParse } from "./callSummary";

/**
 * Exactly the fields a summary is allowed to touch.
 *
 * `sourceContext` is here because the truncation disclosure lives in it (see below); it is
 * always the MERGED object, never a fresh one — inc.1 put the match provenance (`callSid`,
 * `recordingSid`, `direction`, `matchedOn`, `durationSec`) in there and it is the only
 * record of whose timeline this call was filed on and why.
 */
export type CallSummaryPatch = {
  summary: string;
  actionItems: string[];
  buyingSignals: BuyingSignal[];
  sourceContext: Record<string, unknown>;
};

/**
 * Build the patch for a summarised call.
 *
 * **The empty arrays are written, never omitted.** `fromActivity` turns an absent
 * `actionItems` into `null`, and `null` in that column already means something: *this call
 * was never summarised*. An explicit `[]` means *we summarised it and there was nothing to
 * do* — a correct and common answer for a short call (inc.9). Omitting them would collapse
 * the two states that a reader, and any future re-run sweep, most needs to tell apart. This
 * is inc.2's two-tables argument at column granularity.
 *
 * **The truncation flag goes in `sourceContext`, structured — never appended to the summary
 * prose.** `summary` is the text a rep reads, pastes into an email and quotes back to a
 * customer; a bracketed "[based on a partial transcript]" inside it would travel wherever
 * the summary travels, and it would sit inside the field as if it were part of what was
 * said. It is metadata about how the summary was produced, so it is stored as metadata.
 *
 * **`summaryTruncated: false` is written explicitly too**, for the same reason as the empty
 * arrays: an absent flag cannot distinguish "the model saw the whole call" from "nobody
 * recorded whether it did".
 */
export function callSummaryPatch(
  activity: Pick<Activity, "sourceContext">,
  summary: CallSummary
): CallSummaryPatch | null {
  const text = summary.summary.trim();
  // Defensive: inc.9's parser cannot emit a blank summary, but a row carrying `summary: ""`
  // is the worst of the states — it reads as summarised and says nothing — so it is refused
  // here as well rather than trusted to be impossible upstream.
  if (!text) return null;

  return {
    summary: text,
    actionItems: [...summary.actionItems],
    buyingSignals: summary.buyingSignals.map((s) => ({ ...s })),
    sourceContext: {
      ...(activity.sourceContext ?? {}),
      summaryTruncated: summary.truncated === true,
    },
  };
}

/**
 * The patch for a parse outcome, or `null` when there is nothing to write.
 *
 * inc.10's rule — **there is no partial summary** — is enforced here as an absence: a
 * `rejected` parse yields no patch at all, so a caller cannot accidentally blank an
 * existing summary by writing the failure. A call with no summary is one a rep can still
 * listen to; a call whose summary was replaced by a refusal is a false record.
 */
export function patchFromParse(
  activity: Pick<Activity, "sourceContext">,
  parse: SummaryParse
): CallSummaryPatch | null {
  return parse.kind === "ok" ? callSummaryPatch(activity, parse.value) : null;
}

/**
 * Apply a patch to the activity row we hold, returning a new row.
 *
 * Only for callers that hold the activity they themselves just wrote (the webhook does).
 * Everything outside the patch is carried through untouched — **`id`, `personId`, `orgId`,
 * `dealId`, `occurredAt`, `recordingUrl`, `bookProtected` and `createdAt` are not the
 * summariser's business** and are test-pinned as such. `personId` in particular: the
 * transcription runs in `after()`, and a summary step that re-derived the contact could
 * move a filed call onto a different person's timeline long after the response went out.
 */
export function applyCallSummary(activity: Activity, patch: CallSummaryPatch): Activity {
  return {
    ...activity,
    summary: patch.summary,
    actionItems: patch.actionItems,
    buyingSignals: patch.buyingSignals,
    sourceContext: patch.sourceContext,
  };
}
