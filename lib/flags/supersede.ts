// Q84 inc.8 — deciding whether a recurring finding CORRECTS its own ledger row or
// opens a new one. Pure per CR-3: no clock, no network, no Supabase. The caller
// supplies the rows it already read and applies the plan.
//
// Why this exists, in one observed failure: `/api/admin/flags` POST only ever
// inserted, so the meeting-archive finding reached Rob's ledger three times with
// three different numbers — #132 "26 meetings", #134 "25 archived meetings", #136 the
// Omega row — all three OPEN at once. Two of those numbers are wrong today. Rob named
// this exact disease on the equity split: a ledger number nobody corrects is how
// 40/60 stayed wrong for five days. A findings channel that accumulates contradictions
// is worse than none, because the reader cannot tell which row is current.
//
// The rule is deliberately narrow, because these rows are Rob's to-do list:
//   - no key            → insert, exactly as before. Unkeyed callers are untouched.
//   - key, nothing held → insert. First sighting.
//   - key, one open row → UPDATE it. Same finding, newer count.
//   - key, several open → update the newest, supersede the rest (resolved with a note
//                         naming the survivor — never deleted, and `reopen` undoes it).
//   - key, only resolved→ INSERT. A finding that comes back after Rob closed it is
//                         news; silently reopening would bury his resolution note.

export type FlagStatus = "open" | "resolved";

export type ExistingFlag = {
  id: number;
  status: FlagStatus;
  /** Q84 inc.12 — present only when the caller read the row's content too. */
  title?: string | null;
  detail?: string | null;
  severity?: string | null;
};

/** The content a re-run is asserting, when the caller wants an unchanged run to write nothing. */
export type FlagContent = {
  title: string;
  detail: string;
  severity: string;
};

export type FlagWritePlan =
  | { action: "insert"; supersede: number[]; reason: string }
  | { action: "update"; id: number; supersede: number[]; reason: string }
  | { action: "unchanged"; id: number; supersede: number[]; reason: string };

/**
 * Is the open row already saying exactly what this run is saying?
 *
 * A row the caller read WITHOUT its content (no title/detail/severity selected) can never
 * match — silence is not agreement, and guessing "probably the same" is how a stale count
 * would survive a re-run. Compared trimmed, because whitespace is not news.
 */
function isSameContent(existing: ExistingFlag, incoming: FlagContent): boolean {
  if (typeof existing.title !== "string" || typeof existing.detail !== "string") return false;
  if (typeof existing.severity !== "string") return false;
  return (
    existing.title.trim() === incoming.title.trim() &&
    existing.detail.trim() === incoming.detail.trim() &&
    existing.severity === incoming.severity
  );
}

/**
 * Decide how a finding should land on the ledger.
 *
 * @param dedupeKey the finding's stable identity, or null/undefined for a one-off
 * @param existing  every flag already carrying that key (any status, any order)
 * @param incoming  the content this run asserts; omit to keep the pre-inc.12 behaviour
 *                  (every keyed re-run rewrites the row and re-dates it)
 */
export function planFlagWrite(
  dedupeKey: string | null | undefined,
  existing: ExistingFlag[],
  incoming?: FlagContent,
): FlagWritePlan {
  const key = typeof dedupeKey === "string" ? dedupeKey.trim() : "";
  if (!key) {
    return { action: "insert", supersede: [], reason: "no dedupe key — one-off finding" };
  }

  const open = existing.filter((f) => f.status === "open").sort((a, b) => b.id - a.id);

  if (open.length === 0) {
    // Either nothing at all, or Rob has resolved every prior sighting. Both are inserts,
    // and the second one is the interesting case: it came back.
    return existing.length === 0
      ? { action: "insert", supersede: [], reason: "first sighting of this finding" }
      : {
          action: "insert",
          supersede: [],
          reason: "finding recurred after being resolved — a new row, so the resolution note survives",
        };
  }

  const [survivor, ...stale] = open;

  // Q84 inc.12 — a finding on a 30-minute timer re-asserts the SAME sentence most ticks.
  // The update branch below moves `notified_at` to today, so an unconditional re-assert
  // would re-date Rob's row every half hour and float it back to the top of Things to
  // Address as if it were news. The comment on that branch says a stale date "reads as
  // nobody has looked at this since" — a date that moves on a timer is the same lie with
  // the sign flipped. Nothing changed, so nothing is written.
  //
  // Deliberately NOT applied when there are stale twins to supersede: collapsing three
  // rows into one is a real change to the ledger even if the survivor's text is identical.
  if (incoming && stale.length === 0 && isSameContent(survivor, incoming)) {
    return {
      action: "unchanged",
      id: survivor.id,
      supersede: [],
      reason: "same finding, same numbers — row left as it stands, date not moved",
    };
  }

  return {
    action: "update",
    id: survivor.id,
    supersede: stale.map((f) => f.id),
    reason:
      stale.length === 0
        ? "same finding already open — corrected in place rather than stacked"
        : `same finding open ${open.length} times — newest corrected, ${stale.length} superseded`,
  };
}

/** The note left on a row this pass supersedes. Never a deletion. */
export function supersededNote(survivorId: number): string {
  return `Superseded by flag #${survivorId} — same finding, re-run with current numbers. Reopen if this row still matters on its own.`;
}

/**
 * Q84 inc.10 — read `supersededNote` back off an archive row.
 *
 * The note is not decoration: it is the ONE row on the ledger that Rob did not close
 * himself. A row he resolved carries his own judgement and his own note; a superseded
 * row carries a sentence the machine wrote, inviting a click. Telling the two apart is
 * what decides where the Reopen control may appear — offering it on Rob's own
 * resolutions would be the ledger second-guessing him, which is the opposite defect.
 *
 * Deliberately anchored (`^Superseded by flag #N`) rather than a loose search: a
 * resolution note Rob typed that merely mentions another flag must not grow a button.
 *
 * @returns the survivor's flag id, or null if this row was not superseded by a pass
 */
export function supersededBy(note: string | null | undefined): number | null {
  if (typeof note !== "string") return null;
  const m = /^Superseded by flag #(\d+)\b/.exec(note.trim());
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export type ReopenFailure = { text: string; certain: boolean };

/**
 * Q84 inc.10 — what Rob reads when a Reopen click does not land.
 *
 * The 409 case is the whole reason this is not a generic failure line. `planFlagReopen`
 * already composes a sentence naming the row that blocks this one (`This finding is
 * already open as flag #N…`) — flattening that into "nothing changed, try again" would
 * turn an answer into a dead end, and trying again is exactly what cannot work. So a
 * refusal is passed THROUGH verbatim, and it is `certain`: the ledger is unchanged and
 * we know it.
 *
 * `status === null` means the request never came back — the state is unknown, so the
 * next instruction is reload, not re-click.
 */
export function reopenFailureMessage(
  status: number | null,
  serverMessage?: string | null,
): ReopenFailure {
  if (status === null) {
    return {
      text: "Couldn't reach the server — this may or may not have reopened. Reload before clicking again.",
      certain: false,
    };
  }
  if (status === 409 && typeof serverMessage === "string" && serverMessage.trim()) {
    return { text: serverMessage.trim(), certain: true };
  }
  if (status === 404) {
    return { text: "That row is no longer on the ledger — nothing reopened.", certain: true };
  }
  return { text: `Still resolved — nothing changed (server said ${status}). Try again.`, certain: true };
}

export type FlagReopenPlan =
  | { ok: true; reason: string }
  | { ok: false; blockedBy: number; message: string };

/**
 * Decide whether Rob's `reopen` click can land.
 *
 * The hole this closes, stated by the increment that opened it (Q84 inc.8): `supersededNote`
 * invites Rob to reopen a superseded row, but `0033_flag_dedupe_key.sql` holds a partial
 * unique index over OPEN rows sharing a key. So reopening a resolved keyed row whose twin is
 * open violates the index, and Postgres surfaces that to Rob as a 500 on his own ledger —
 * a database error where he expected a to-do list.
 *
 * It REFUSES rather than auto-resolving the twin. Reopen is Rob's judgement about one row;
 * quietly closing a different one to make room is the machine picking which of his rows
 * survives, and he would find out only by noticing something missing. The refusal names the
 * open row so the next click is obvious.
 *
 * @param dedupeKey the key on the row being reopened (null for the ordinary case)
 * @param openSiblings every OPEN flag already carrying that key, excluding this row
 */
export function planFlagReopen(
  dedupeKey: string | null | undefined,
  openSiblings: ExistingFlag[],
): FlagReopenPlan {
  const key = typeof dedupeKey === "string" ? dedupeKey.trim() : "";
  if (!key) return { ok: true, reason: "unkeyed row — reopen is unconstrained" };

  const blocker = openSiblings.filter((f) => f.status === "open").sort((a, b) => b.id - a.id)[0];
  if (!blocker) return { ok: true, reason: "no open row holds this finding — safe to reopen" };

  return {
    ok: false,
    blockedBy: blocker.id,
    message:
      `This finding is already open as flag #${blocker.id}, which carries the current numbers. ` +
      `Reopening this older copy would put the same finding on your list twice. ` +
      `Work #${blocker.id} instead, or resolve it first if this older row is the one you want back.`,
  };
}
