// Q84 inc.101 — the THIRD door into a finding, and the only one that arrives already
// machine-readable: `payload`.
//
// inc.98/inc.99/inc.100 spent three increments on the prose a caller sends — a trailing
// `Resolved from C-1234.` in a note, in a title, in a detail. Every one of those was about a
// SENTENCE being read back as an address. This is the same defect with the prose removed: the
// payload names its record in a field, not in a sentence, and nothing has ever asked whether
// that record is one the finding itself names.
//
// WHAT THE CODEC ALREADY DECIDES, AND WHAT IT CANNOT. `readHostConfirmPayload` (inc.71/72/74)
// refuses an unknown kind, a missing field, a host that names no host, and an id that is not
// shaped like a minted org id. All of that is about the ACTION being well-formed. Not one line
// of it relates the action to the row carrying it, because the codec is handed the payload
// alone — it has never seen the title or the detail. So `orgId: "C-9999"` on a finding whose
// text names only C-2017 grades clean today.
//
// WHY THAT IS A DEAD CONTROL AND NOT MERELY AN ODD ONE. inc.73's rule is that an action writes
// only on its OWN org's page and renders as a LINK everywhere else. A row reaches an org's page
// two ways and two only (inc.26): it is FILED on it (`entity_id`), or its title/detail NAMES it.
// A payload's `orgId` is neither. So an out-of-scope action can never be `here` — the button it
// exists for is unreachable by construction — and what Rob is left holding is a link inviting
// him to a page where the finding he clicked from does not appear. That is inc.37/inc.81's
// dead-end again (a control promising a destination that answers nothing), reached through the
// one field on the row nobody had read for scope.
//
// THE REAL PRODUCER IS UNAFFECTED, AND THAT WAS CHECKED BEFORE THIS WAS BUILT rather than
// hoped for. `buildCrmGapFinding` mints its actions from `proposeOrgForHost`, and the prose it
// writes for the very same pick goes through `proposalText`, which prints `${org.name}
// [${org.id}]` — the minted id, in the detail, on the same line. Prod #133's two actions
// (C-2017, C-2018) are named by its own text, which is exactly why that row already renders on
// both companies' pages. A caller whose payload points somewhere its prose never mentions is
// the case with no legitimate author.
//
// IT DROPS, IT DOES NOT REFUSE — deliberately the opposite of inc.100's 400. A malformed
// SENTENCE is the caller's mistake and the caller can fix it; an out-of-scope action is one
// button among several on a finding whose prose may be entirely correct, and inc.71's pinned
// failure direction is "Rob sees the finding without the shortcut", never "Rob loses the
// finding". Per-action, for inc.72's reason: each action is a separate control under a separate
// host line. The caller is TOLD what was dropped (inc.74's rule: never let a caller read `ok`
// and assume its actions landed).
//
// Pure per CR-3: no clock, no network, no Supabase.

import { buildHostConfirmPayload, readHostConfirmPayload, type HostConfirmPayload } from "@/lib/flags/hostConfirm";
import { flagNamedRecordIds } from "@/lib/flags/recordLinks";

export type ScopedPayload = {
  /** The payload as it should be stored, or `null` for "carries no reachable actions". */
  payload: HostConfirmPayload | null;
  /** The org ids of actions dropped for pointing outside the row — reported, never silent. */
  dropped: string[];
};

/**
 * Grade a payload against the row that would carry it, keeping only the actions whose org the
 * finding can actually reach.
 *
 * ONE LADDER, NOT A SECOND COPY (inc.4/inc.5). "Which records does this row name?" is answered
 * by `flagNamedRecordIds` — the same reader the GET path, the record-page filter and inc.98's
 * route refusal all ask — and "is this action well-formed?" stays entirely with the codec. This
 * function adds one question and restates neither.
 *
 * @param title    the title being filed
 * @param detail   the detail being filed
 * @param entityId the record the row is filed on, when it has one
 * @param payload  the raw payload as sent
 */
export function scopeHostConfirmPayload(
  title: string | null | undefined,
  detail: string | null | undefined,
  entityId: string | null | undefined,
  payload: unknown,
): ScopedPayload {
  const graded = readHostConfirmPayload(payload);
  if (!graded) return { payload: null, dropped: [] };

  // The row's reach, exactly as the record pages compute it: what it names, plus where it is
  // filed. A legacy slug in `entity_id` is added as-is and simply never matches a `C-<digits>`
  // org id — the cost is a payload on a slug-filed row losing its actions, and no such row
  // exists on prod. Widening to the slug lookup would mean a database read inside a pure
  // module, which is the trade this tree has refused since inc.4.
  const reachable = new Set(flagNamedRecordIds(title, detail));
  const home = (entityId ?? "").trim();
  if (home) reachable.add(home);

  const kept = graded.actions.filter((a) => reachable.has(a.orgId));
  const dropped = graded.actions.filter((a) => !reachable.has(a.orgId)).map((a) => a.orgId);

  // Re-graded through the builder rather than reassembled here, so the payload that survives a
  // drop obeys the same tie and duplicate rules as one that never lost a member.
  return {
    payload: buildHostConfirmPayload(kept.map((a) => ({ host: a.host, orgId: a.orgId }))),
    dropped: [...new Set(dropped)],
  };
}

/**
 * The honest sentence a caller logs about actions that did not survive the scope check.
 *
 * `null` when nothing was dropped — silence is right there, for `payloadNote`'s reason: a line
 * about actions that were never dropped reads as a failure that did not happen.
 */
export function payloadScopeNote(dropped: readonly string[]): string | null {
  if (!dropped.length) return null;
  const ids = [...dropped].join(", ");
  return (
    `${dropped.length} confirm action${dropped.length === 1 ? "" : "s"} dropped — ${ids} ` +
    `${dropped.length === 1 ? "is" : "are"} not named by this finding's title or detail and it ` +
    `is not filed there, so the row never appears on that page and the button could never be ` +
    `clicked. Name the record in the text — "likely Acme [${dropped[0]}]" — and the action stands.`
  );
}
