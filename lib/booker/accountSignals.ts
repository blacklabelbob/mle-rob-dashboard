/**
 * Q82 — booker account-state signals. The pure rule, per CR-3.
 *
 * Rob, ROB-ANSWERS-2026-07-29-night.md §5: *"The can see all accounts, there just neds to be
 * sonething where you can easily tell if They can see all accounts excep thos that are already
 * in Phase 1 or Beyond or acounts that dont have an upcoming appointment set up or the sales rep
 * hasnt called in 2 weeks."*
 *
 * SETTLED: bookers see ALL accounts. Nothing in this module hides a row — every input account
 * comes back out, exactly once. What it produces is EMPHASIS, so the three states Rob named are
 * obvious at a glance and filterable.
 *
 * THE ONE AMBIGUITY, TAKEN NOT GUESSED (written into the PRD's open-questions table). Read
 * literally, "all accounts *except* those…" would hide the accounts a booker exists to work —
 * an account with nothing on the calendar is the booker's TARGET, not a thing to conceal. So:
 *   • Phase 1+ → de-emphasised (already a customer; hands off) but still listed.
 *   • no upcoming appointment / rep gone quiet → NEEDS ACTION, highlighted and filterable.
 * If Rob meant literal exclusion, that is a default-filter flip at the render layer, not a
 * change here.
 *
 * PHASE 1+ SUPPRESSES THE OTHER TWO, ON PURPOSE. "Except those already in Phase 1 or Beyond" is
 * Rob excluding existing customers from the booker's working set; telling a booker to chase a
 * paying client because no call is logged this fortnight would be the exclusion he asked for,
 * inverted.
 *
 * TRUTH POSTURE, inherited from `lib/rep/receivableAlerts.ts`: a signal is an assertion, so it is
 * only ever raised on evidence. An account whose phase we cannot read is NOT quietly treated as
 * "not a customer" — it is returned with `phaseKnown: false` and counted, because a booker
 * shown nine of ten states is worse off than one told "nine, and one I can't answer."
 *
 * Pure: no clock, no fs, no network — `todayISO` is passed in.
 */

import { daysBetweenISO } from "@/lib/readModel/invoiceLedger";

/** Rob's "2 weeks", named once so the screen and the filter cannot disagree about it. */
export const COLD_CALL_DAYS = 14;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type AccountSignal =
  /** Already a customer — Phase 1 or beyond. De-emphasised, never hidden. */
  | "phase_1_plus"
  /** Nothing on the calendar. The booker's core target. */
  | "no_upcoming_appointment"
  /** The rep has not called in COLD_CALL_DAYS — or has never called at all. */
  | "cold_call";

export type AccountEmphasis = "needs_action" | "normal" | "de_emphasised";

/**
 * What a caller must supply per account. Deliberately narrow: no money, no PII beyond the name
 * a booker already sees, so this module cannot become a second door onto withheld columns.
 */
export type AccountSignalInput = {
  accountId: string;
  name: string;
  /**
   * Phase reached: 0 = not a customer yet, >= 1 = Phase 1 or beyond. `null` means the loader
   * could not determine it — asserted as unknown, never as 0.
   */
  phase: number | null;
  /** ISO date (YYYY-MM-DD) of the most recent logged call; `null` when never called. */
  lastCallISO: string | null;
  /** ISO date of the earliest FUTURE appointment; `null` when nothing is booked. */
  nextAppointmentISO: string | null;
};

export type AccountState = {
  accountId: string;
  name: string;
  signals: AccountSignal[];
  emphasis: AccountEmphasis;
  /** Whole days since the last logged call; `null` when the account has never been called. */
  daysSinceLastCall: number | null;
  nextAppointmentISO: string | null;
  /** False when `phase` was unreadable — the row says so rather than guessing. */
  phaseKnown: boolean;
  /** One line a booker reads without opening anything. */
  headline: string;
};

export type BookerAccountStates = {
  /** Every input account, needs-action first. Nothing is dropped. */
  accounts: AccountState[];
  counts: Record<AccountSignal, number>;
  /** Accounts whose phase could not be read — counted, not assumed. */
  phaseUnknownCount: number;
};

function validISODate(value: string | null): value is string {
  return typeof value === "string" && ISO_DATE.test(value);
}

export function headlineFor(state: {
  signals: readonly AccountSignal[];
  daysSinceLastCall: number | null;
}): string {
  if (state.signals.includes("phase_1_plus")) return "Phase 1+ — already a customer";
  const parts: string[] = [];
  if (state.signals.includes("no_upcoming_appointment")) parts.push("no appointment booked");
  if (state.signals.includes("cold_call")) {
    parts.push(
      state.daysSinceLastCall === null
        ? "never called"
        : `no call in ${state.daysSinceLastCall} days`
    );
  }
  return parts.length ? parts.join(" · ") : "on track";
}

/** The rule for one account. Exported so a row can be re-derived without the whole list. */
export function stateForAccount(
  input: AccountSignalInput,
  todayISO: string
): AccountState {
  const phaseKnown = typeof input.phase === "number" && Number.isFinite(input.phase);
  const isCustomer = phaseKnown && (input.phase as number) >= 1;

  const daysSinceLastCall = validISODate(input.lastCallISO)
    ? daysBetweenISO(input.lastCallISO, todayISO)
    : null;

  const signals: AccountSignal[] = [];
  if (isCustomer) {
    signals.push("phase_1_plus");
  } else {
    if (!validISODate(input.nextAppointmentISO)) signals.push("no_upcoming_appointment");
    if (daysSinceLastCall === null || daysSinceLastCall >= COLD_CALL_DAYS) {
      signals.push("cold_call");
    }
  }

  const emphasis: AccountEmphasis = isCustomer
    ? "de_emphasised"
    : signals.length > 0
      ? "needs_action"
      : "normal";

  return {
    accountId: input.accountId,
    name: input.name,
    signals,
    emphasis,
    daysSinceLastCall,
    nextAppointmentISO: validISODate(input.nextAppointmentISO)
      ? input.nextAppointmentISO
      : null,
    phaseKnown,
    headline: headlineFor({ signals, daysSinceLastCall }),
  };
}

const EMPHASIS_ORDER: Record<AccountEmphasis, number> = {
  needs_action: 0,
  normal: 1,
  de_emphasised: 2,
};

/** Coldest first inside needs-action: never-called sorts above any dated staleness. */
function coldnessRank(state: AccountState): number {
  if (!state.signals.includes("cold_call")) return -1;
  return state.daysSinceLastCall === null ? Number.MAX_SAFE_INTEGER : state.daysSinceLastCall;
}

export function buildBookerAccountStates(
  inputs: readonly AccountSignalInput[],
  todayISO: string
): BookerAccountStates {
  const accounts = inputs.map((input) => stateForAccount(input, todayISO));

  accounts.sort(
    (a, b) =>
      EMPHASIS_ORDER[a.emphasis] - EMPHASIS_ORDER[b.emphasis] ||
      coldnessRank(b) - coldnessRank(a) ||
      a.name.localeCompare(b.name) ||
      a.accountId.localeCompare(b.accountId)
  );

  const counts: Record<AccountSignal, number> = {
    phase_1_plus: 0,
    no_upcoming_appointment: 0,
    cold_call: 0,
  };
  let phaseUnknownCount = 0;
  for (const account of accounts) {
    for (const signal of account.signals) counts[signal] += 1;
    if (!account.phaseKnown) phaseUnknownCount += 1;
  }

  return { accounts, counts, phaseUnknownCount };
}

/** The filter half of the DoD: one signal in, the accounts carrying it out. Never mutates. */
export function filterBySignal(
  accounts: readonly AccountState[],
  signal: AccountSignal
): AccountState[] {
  return accounts.filter((a) => a.signals.includes(signal));
}
