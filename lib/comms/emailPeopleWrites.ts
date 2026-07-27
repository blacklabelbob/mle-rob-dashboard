// Q69 (Email → company graph), increment 12: the execution seam — the planned
// person writes actually reach the store.
//
// inc.11 planned every person write one email implies and nothing called it.
// Executing them inline in the route would put two decisions inside a request
// handler that neither belongs there nor can be tested there: what a partial
// failure means, and whether a failed person write is allowed to cost us the
// email itself.
//
// Both answers are here, and both are deliberate:
//  • ONE FAILED WRITE NEVER TAKES THE OTHERS DOWN. The writes are independent
//    rows; aborting the batch on the first error would drop people we could
//    have created because an unrelated row failed.
//  • A FAILURE IS REPORTED, NEVER SWALLOWED. Every error is collected and
//    returned, so the caller logs a person we failed to create instead of a
//    cheerful 200 that says the CRM captured a human it does not have.
//
// Nothing here retries or reconstructs a row: the planner is deterministic, so
// the next email from the same address re-plans the same write.

import type { PersonWrite } from "./emailPeople";
import type { Person } from "../types";

/** The one method of the store this needs — a fake in tests, the real store in the route. */
export interface PersonWriteSink {
  upsertPerson(person: Person): Promise<void>;
}

export interface PersonWriteFailure {
  address: string;
  personId: string;
  kind: PersonWrite["kind"];
  error: string;
}

export interface PersonWriteResult {
  created: string[];
  merged: string[];
  failed: PersonWriteFailure[];
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Execute planned person writes in order, one row at a time.
 *
 * Sequential on purpose: inc.11's id accumulator hands out ids assuming the
 * writes land, and firing them concurrently would let two creates for the same
 * company race each other's slug into the store in an order the plan never saw.
 */
export async function applyPeopleWrites(
  writes: PersonWrite[],
  sink: PersonWriteSink
): Promise<PersonWriteResult> {
  const result: PersonWriteResult = { created: [], merged: [], failed: [] };
  for (const write of writes) {
    const personId = write.kind === "create" ? write.person.id : write.personId;
    try {
      await sink.upsertPerson(write.person);
    } catch (err) {
      result.failed.push({
        address: write.address,
        personId,
        kind: write.kind,
        error: messageOf(err),
      });
      continue;
    }
    if (write.kind === "create") result.created.push(personId);
    else result.merged.push(personId);
  }
  return result;
}
