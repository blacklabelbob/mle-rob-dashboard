// Master View 2.0 §3.1 — the Phase 1 refund-window state machine.
//
// Rob, 7.22.26-3 (verbatim): "Phase 1 has a 30 day Full Refund... the 30 day
// period begins as soon as the Website is live with AEO-SEO... if they do chose
// to move on from Phase 1 to Phase 2 prior to the 30 day period then the refund
// associated with Phase 1 is considered voided".
//
//   NOT_STARTED --(website-aeo-seo goes live)--> ACTIVE (day 0..30)
//   ACTIVE      --(30 days elapse)------------> EXPIRED
//   ACTIVE      --(P2 signed OR P2 paid)------> VOIDED_BY_ADVANCE
//
// CR-3 / scoring-pattern rule: pure, stateless, NO Date.now() — `asOf` is a
// parameter. A clock read inside here would make the tracker untestable and
// would make two renders of the same record disagree.

export type RefundState = "NOT_STARTED" | "ACTIVE" | "EXPIRED" | "VOIDED_BY_ADVANCE";

export const REFUND_WINDOW_DAYS = 30;

export interface RefundInput {
  /** ISO date the refund-trigger component went live. Absent = never started. */
  startedAt?: string;
  /** ISO date the customer advanced to Phase 2 (agreement signed or invoice paid). */
  advancedAt?: string;
  /** Evaluation time, ISO. Always passed in — never read from the clock here. */
  asOf: string;
}

export interface RefundStatus {
  state: RefundState;
  /** Days left in the window; only meaningful in ACTIVE. Never negative. */
  daysLeft: number;
  /** Day index into the window (0 = the day it started). ACTIVE/EXPIRED only. */
  dayIndex: number;
  startedAt?: string;
  advancedAt?: string;
  /** Plain-language line the tracker renders; never assembled in the component. */
  line: string;
}

const MS_PER_DAY = 86_400_000;

/** Whole days from a → b, calendar-date based so a timestamp cannot skew a day. */
function daysBetween(a: string, b: string): number | null {
  const from = Date.parse(dateOnly(a));
  const to = Date.parse(dateOnly(b));
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / MS_PER_DAY);
}

function dateOnly(iso: string): string {
  // Accepts "2026-07-10" and "2026-07-10T12:00:00Z" alike, and normalises to
  // UTC midnight so a late-evening signal does not read as a day earlier.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim());
  return m ? `${m[1]}T00:00:00Z` : iso;
}

export function refundStatus({ startedAt, advancedAt, asOf }: RefundInput): RefundStatus {
  // Advancing voids the refund whenever it happened — but only if the window
  // ever started. Voiding a window that never opened would state a consequence
  // that never existed.
  if (!startedAt) {
    return {
      state: "NOT_STARTED",
      daysLeft: REFUND_WINDOW_DAYS,
      dayIndex: 0,
      advancedAt,
      line: "30-day refund window — not started (begins when the website goes live with AEO-SEO)",
    };
  }

  if (advancedAt) {
    const elapsedAtAdvance = daysBetween(startedAt, advancedAt);
    // Advancing AFTER the window already closed voids nothing — the refund had
    // already expired on its own, and calling that "voided by advance" would
    // blame the customer for a deadline they beat.
    if (elapsedAtAdvance !== null && elapsedAtAdvance < REFUND_WINDOW_DAYS) {
      return {
        state: "VOIDED_BY_ADVANCE",
        daysLeft: 0,
        dayIndex: elapsedAtAdvance,
        startedAt,
        advancedAt,
        line: `30-day refund window — VOIDED: advanced to Phase 2 on ${dayLabel(advancedAt)}, ${elapsedAtAdvance} ${plural(elapsedAtAdvance, "day")} into the window`,
      };
    }
  }

  const elapsed = daysBetween(startedAt, asOf);
  if (elapsed === null) {
    return {
      state: "NOT_STARTED",
      daysLeft: REFUND_WINDOW_DAYS,
      dayIndex: 0,
      startedAt,
      advancedAt,
      line: "30-day refund window — start date unreadable, state unknown",
    };
  }

  if (elapsed >= REFUND_WINDOW_DAYS) {
    return {
      state: "EXPIRED",
      daysLeft: 0,
      dayIndex: elapsed,
      startedAt,
      advancedAt,
      line: `30-day refund window — CLOSED (started ${dayLabel(startedAt)}, survived the full ${REFUND_WINDOW_DAYS} days)`,
    };
  }

  const daysLeft = REFUND_WINDOW_DAYS - elapsed;
  return {
    state: "ACTIVE",
    daysLeft,
    dayIndex: elapsed,
    startedAt,
    advancedAt,
    line: `30-day refund window — ACTIVE, ${daysLeft} ${plural(daysLeft, "day")} left (started ${dayLabel(startedAt)}, website live with AEO-SEO)`,
  };
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function dayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  return `${Number(m[2])}/${Number(m[3])}`;
}

/**
 * The FSM emits typed events on transition (§3.1 "Phase lifecycle triggers").
 * Returned rather than fired: the trigger runner (increment 13) owns firing and
 * idempotency, and a pure function must not have side effects.
 */
export type PhaseEvent = "refund_window_complete" | "early_advance";

export function refundEvents(status: RefundStatus): PhaseEvent[] {
  if (status.state === "EXPIRED") return ["refund_window_complete"];
  if (status.state === "VOIDED_BY_ADVANCE") return ["early_advance"];
  return [];
}
