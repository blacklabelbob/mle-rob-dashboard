// Q84 inc.74 — the writer's guard: how `/api/admin/flags` may persist a payload against a
// prod that does not have the column yet, without breaking the ledger write that works today.
//
// THE STATE THIS IS WRITTEN AGAINST, stated rather than assumed. `0035_flag_payload.sql` is
// PENDING — it rides Rob's one outstanding `supabase db push` with 0032 and 0034. So prod's
// `flags` table has no `payload` column right now, and the finding that computes actions
// (`buildCrmGapFinding`, inc.72) already puts a `payload` key in the body it POSTs. The route
// destructured six fields and silently dropped the seventh, which is why nothing broke — and
// also why the button could never appear. Writing the column naively is the failure the
// migration's own comment names: "wiring the check to write a column prod does not have would
// 400 the ledger write that works today". The CRM-gap finding is prod #133, the
// highest-severity row on Rob's page, re-asserted every 30 minutes. Breaking it is not a
// degraded feature, it is Rob's to-do list going silent.
//
// SO THE RULE IS: try with the payload, and treat ONE specific database answer — "there is no
// such column" — as "this prod is pre-0035", falling back to exactly the write that happens
// today. Every other error stays an error. That distinction is the whole module: a guard that
// swallowed any failure would turn a real outage into a write that reports success, which is
// the absence-read-as-a-fact defect this ladder keeps finding.
//
// Pure per CR-3: no clock, no network, no Supabase. The caller supplies the error it got.

/**
 * PostgREST's two ways of saying "no such column", and they arrive by different doors:
 *
 *  - `PGRST204` — the schema cache has no such column on a WRITE. This is the one prod
 *    answers today for `insert({ payload })`.
 *  - `42703`    — Postgres' own `undefined_column`, surfaced when the statement reaches the
 *    database (a SELECT of a column that is not there).
 *
 * Both are matched, because the read path and the write path do not fail identically and a
 * guard that only knew one of them would half-work.
 */
const MISSING_COLUMN_CODES = new Set(["PGRST204", "42703"]);

/** The shape of a supabase-js error, as much of it as this decision needs. */
export type DbError = { code?: string | null; message?: string | null } | null | undefined;

/**
 * Is this error the specific "this prod has no `payload` column yet" answer?
 *
 * NARROW ON PURPOSE, IN BOTH HALVES. The code alone is not enough: `PGRST204` is raised for
 * ANY unknown column, so a typo in some future field would read as "pre-0035" and be silently
 * dropped forever. The message must also name the column this module is guarding. And the
 * message alone is not enough either — a row whose `detail` prose happens to contain the word
 * payload must never be graded as a schema state.
 *
 * The failure direction is deliberate: an error this does NOT recognise stays an error and
 * reaches the caller as a 500. Rob would rather see a ledger write fail loudly than have a
 * finding quietly stop carrying its actions.
 *
 * @param column the column being guarded — passed in rather than hardcoded so the next
 *   structured column reuses this instead of growing a second, subtly different copy.
 */
export function isMissingColumn(error: DbError, column: string): boolean {
  if (!error) return false;
  const code = typeof error.code === "string" ? error.code : "";
  if (!MISSING_COLUMN_CODES.has(code)) return false;
  const message = typeof error.message === "string" ? error.message : "";
  const name = column.trim();
  if (!name) return false;
  return message.toLowerCase().includes(name.toLowerCase());
}

/**
 * The honest sentence a caller logs about what happened to the payload it sent.
 *
 * `null` when there was no payload to store — silence is right there. A caller that sent no
 * actions gets no line about actions, because a "payload not stored" note on a finding that
 * never carried one reads as a failure that did not happen.
 *
 * @param sent   did this request carry a graded payload worth storing?
 * @param stored did it land?
 */
export function payloadNote(sent: boolean, stored: boolean): string | null {
  if (!sent) return null;
  return stored
    ? "payload stored — the finding carries its confirm actions"
    : "payload NOT stored — this database has no flags.payload column yet (0035 pending); " +
        "the finding landed without its confirm actions and will carry them on the next run after the push";
}
