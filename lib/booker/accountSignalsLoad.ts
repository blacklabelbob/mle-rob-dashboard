/**
 * Q82 inc.2 — the read that feeds inc.1's rule from real CRM rows.
 *
 * inc.1 settled WHAT the three states mean. This settles WHERE each one comes from, and it is
 * the harder half, because two of Rob's three states have no field in this data model:
 *
 *   • "Phase 1 or Beyond" — there is no phase NUMBER on a Person. There is `phaseOne`
 *     (not-started / in-progress / complete) and there are `keyDates`. `phaseNumberFor` is the
 *     one place that turns those into the 0 / 1 / 2 the rule wants, so the screen and any later
 *     consumer cannot disagree about who counts as a customer.
 *
 *   • "an upcoming appointment" — THE CRM HAS NO CALENDAR. There is no appointment entity, no
 *     booking table, no calendar sync. The only evidence a meeting is scheduled is a
 *     future-dated `meeting` activity, so that is what this reads — and when the system holds
 *     ZERO of them, `appointmentEvidence: "none_in_system"` says so out loud. That flag exists
 *     because of the difference between "we looked at the calendar and Acme has nothing on it"
 *     and "there is no calendar" — the rule raises `no_upcoming_appointment` identically in both
 *     cases, so without this the booker screen would light up every account in the book as a
 *     discovered fact about accounts, when it is actually a fact about the CRM. Same posture as
 *     `rm_invoices_ar.synced_at` in `lib/rep/receivableAlertsLoad.ts`: an empty read and a
 *     missing source must never render identically.
 *
 * MLE'S OWN PEOPLE ARE NOT ACCOUNTS. `nodeType: "mle-admin"` rows (Rob, Will, staff) are dropped
 * from the account list and RETURNED AS A COUNT (`internalExcluded`) — excluded and stated, not
 * hidden. Nothing about a booker's job involves calling Rob to stop him going cold, and the
 * no-row-is-hidden invariant inc.1 protects is about ACCOUNTS.
 *
 * Pure: `bookerAccountInputs` takes rows and a `todayISO` and touches no clock, fs or network.
 * Only `loadBookerAccountStates` reaches the store, and it injects the caller's clock (CR-3).
 */

import { getStore } from "@/lib/storage";
import type { Activity, Person } from "@/lib/types";
import {
  buildBookerAccountStates,
  type AccountSignalInput,
  type BookerAccountStates,
} from "./accountSignals";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-07-30T15:04:05Z` → `2026-07-30`. Null for anything that is not a parseable stamp. */
export function dayOf(timestamp: string | null | undefined): string | null {
  if (typeof timestamp !== "string" || timestamp.length < 10) return null;
  const day = timestamp.slice(0, 10);
  return ISO_DATE.test(day) ? day : null;
}

/**
 * The 0 / 1 / 2 the rule wants, derived from the fields this model actually has.
 *
 * 1 = "Phase 1 or Beyond" — Rob's line. A signed or paid account IS in Phase 1 whatever the
 * status field says, because the money moved; `phaseOne: "in-progress"` says the same thing from
 * the delivery side. Either is enough, and neither is required to agree with the other — a
 * record can be paid before anyone touches the status dropdown, and treating that as "not a
 * customer" would send a booker at a client.
 *
 * `null` (unknown, never 0) when `phaseOne` holds a value outside its enum — bad data is
 * reported as unreadable, never defaulted to "not a customer yet".
 */
export function phaseNumberFor(person: Person): number | null {
  const status = person.phaseOne;
  const complete = status === "complete" || Boolean(person.keyDates?.phaseOneComplete);
  if (complete) return 2;

  const customer =
    status === "in-progress" ||
    Boolean(person.keyDates?.paid) ||
    Boolean(person.keyDates?.signed) ||
    person.signed === true;
  if (customer) return 1;

  return status === "not-started" ? 0 : null;
}

/** True when this activity belongs to the account — by person id, or by the org it hangs on. */
function anchorsTo(activity: Activity, person: Person): boolean {
  if (activity.personId && activity.personId === person.id) return true;
  if (activity.orgId && person.orgId && activity.orgId === person.orgId) return true;
  // A company row IS the org, so an org-anchored activity is that account's own activity.
  return Boolean(activity.orgId) && activity.orgId === person.id;
}

export type BookerAccountsRead = {
  states: BookerAccountStates;
  /**
   * Whether the system holds ANY future-dated meeting. `none_in_system` means the
   * `no_upcoming_appointment` signal is unfalsifiable right now — the screen must say the
   * calendar is missing rather than claim every account is unbooked.
   */
  appointmentEvidence: "present" | "none_in_system";
  /** Same distinction for calls: no logged call anywhere means "cold" is not yet a measurement. */
  callEvidence: "present" | "none_in_system";
  /** MLE's own staff rows, dropped from the account list and counted rather than silently gone. */
  internalExcluded: number;
};

/** The pure mapping half: CRM rows in, the rule's inputs out. */
export function bookerAccountInputs(
  people: readonly Person[],
  activities: readonly Activity[],
  todayISO: string
): { inputs: AccountSignalInput[]; read: Omit<BookerAccountsRead, "states"> } {
  const accounts = people.filter((p) => p.nodeType !== "mle-admin");
  const internalExcluded = people.length - accounts.length;

  let anyCall = false;
  let anyFutureMeeting = false;

  const inputs = accounts.map<AccountSignalInput>((person) => {
    let lastCallISO: string | null = null;
    let nextAppointmentISO: string | null = null;

    for (const activity of activities) {
      if (!anchorsTo(activity, person)) continue;
      const day = dayOf(activity.occurredAt);
      if (!day) continue;

      if (activity.type === "call") {
        anyCall = true;
        // Latest wins. A call dated in the future is still the most recent contact evidence
        // we hold, so it counts — inventing a rule that drops it would make an account look
        // colder than the record says.
        if (lastCallISO === null || day > lastCallISO) lastCallISO = day;
      } else if (activity.type === "meeting" && day > todayISO) {
        anyFutureMeeting = true;
        // EARLIEST future meeting — "upcoming" means the next one, not the furthest out.
        if (nextAppointmentISO === null || day < nextAppointmentISO) nextAppointmentISO = day;
      }
    }

    return {
      accountId: person.id,
      name: person.name,
      phase: phaseNumberFor(person),
      lastCallISO,
      nextAppointmentISO,
    };
  });

  return {
    inputs,
    read: {
      appointmentEvidence: anyFutureMeeting ? "present" : "none_in_system",
      callEvidence: anyCall ? "present" : "none_in_system",
      internalExcluded,
    },
  };
}

/** Rows in, states out. Kept separate from the store read so it is testable without a database. */
export function bookerAccountStatesFrom(
  people: readonly Person[],
  activities: readonly Activity[],
  todayISO: string
): BookerAccountsRead {
  const { inputs, read } = bookerAccountInputs(people, activities, todayISO);
  return { states: buildBookerAccountStates(inputs, todayISO), ...read };
}

/** The store read. No rep filter, by design: a booker sees ALL accounts (Rob, §5). */
export async function loadBookerAccountStates(todayISO: string): Promise<BookerAccountsRead> {
  const store = getStore();
  const [data, activities] = await Promise.all([store.getNetwork(), store.listActivities()]);
  return bookerAccountStatesFrom(data.people, activities, todayISO);
}
