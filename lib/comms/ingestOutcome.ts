// Q69 (Email → company graph), increment 22: the webhook's ANSWER stops lying.
//
// inc.19 fixed this defect one layer up — a ledger PATCH that failed rendered as
// nothing, so the only reading was "this button is broken". The same defect
// lives at the machine-facing end of the same pipe, and it is worse there
// because nobody is watching: `/api/webhooks/n8n-email` returns `ok: true` and
// a list of what worked, with THREE distinct failures collapsed into silence:
//
//  1. PERSON WRITES THAT FAILED. The route logs them with console.error and
//     then answers `{ ok: true, ingested: true, peopleCreated: [...] }`. A human
//     the CRM does not have is indistinguishable from one it created.
//  2. THE PROPOSAL QUEUE WRITE THREW. `proposedOrgs: []` — byte-identical to
//     "this message proposed nothing". The new roofing company Rob just emailed
//     is on no ledger, and the response says everything is fine.
//  3. NO LEDGER STORE CONFIGURED. Same empty array again. This is the Q68
//     dormant-key lesson in another costume: a pipe that is wired, running, and
//     quietly storing nothing, reporting success on every message.
//
// n8n is the only caller. Its response body is the ONLY signal it can branch or
// alert on — a Vercel log line is not a signal, it is an archaeology exercise.
// So the body carries the truth: one boolean to branch on (`complete`) and a
// typed `problems` list that says which of the three happened and to whom.
//
// TWO RULES THAT DO NOT CHANGE HERE:
//  • `ok` STAYS TRUE AND THE STATUS STAYS 200. The route's contract (its own
//    header comment) is that n8n never retry-loops; a failed person write must
//    not become an infinite redelivery of the same message. Pinned by test, so
//    a later increment flips it deliberately or not at all.
//  • EVERY KEY IS ALWAYS PRESENT. n8n expressions read a missing field as
//    undefined and carry on, so an omitted `problems` and an empty one must not
//    be distinguishable by accident. Stable schema, empty arrays.
//
// Pure (CR-3): this decides the shape, never performs the writes.

import type { PersonWriteFailure } from "./emailPeopleWrites";

export type IngestProblem =
  | { kind: "person-write"; addresses: string[]; detail: string }
  | { kind: "proposal-queue-failed"; domains: string[]; detail: string }
  | { kind: "proposal-store-unconfigured"; domains: string[]; detail: string };

/** One schema for every 200 this route returns — matched and unmatched alike. */
export interface WebhookOutcome {
  ok: true;
  ingested: boolean;
  /** False when anything we intended to write did not land. The branch key. */
  complete: boolean;
  reason?: string;
  activityId?: string;
  /** Domains queued on the ledger by THIS call. */
  proposedOrgs: string[];
  /** Domains already on the ledger — nothing to do, and NOT a failure. */
  alreadyQueued: string[];
  peopleCreated: string[];
  peopleMerged: string[];
  problems: IngestProblem[];
}

function messageOf(err: unknown): string {
  if (err === undefined || err === null) return "unknown error";
  const text = err instanceof Error ? err.message : String(err);
  return text.trim() || "unknown error";
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * The person-write half, shared by both branches.
 *
 * Reports the ADDRESSES, not the generated person ids: a created-but-failed row
 * has an id that exists nowhere, so quoting it back sends whoever reads this
 * looking for a record that was never written. The address is the thing they
 * can search their own mailbox for.
 */
export function personWriteProblem(
  failures: PersonWriteFailure[]
): IngestProblem | null {
  if (failures.length === 0) return null;
  const addresses = failures.map((f) => f.address);
  const reasons = Array.from(new Set(failures.map((f) => messageOf(f.error))));
  return {
    kind: "person-write",
    addresses,
    detail:
      `${failures.length} ${plural(failures.length, "person", "people")} on this message ` +
      `could not be written to the CRM (${addresses.join(", ")}) — they will not appear ` +
      `on any record. Cause: ${reasons.join("; ")}. The email itself still landed.`,
  };
}

export interface ProposalOutcomeInput {
  /** Every domain rung 6 proposed for this message, before any storing. */
  planned: string[];
  /** Present only when the queue write ran to completion. */
  result?: { created: string[]; duplicate: string[] };
  /** True when a ledger store exists to write to. */
  storeConfigured: boolean;
  /** Set when the queue write threw. */
  error?: unknown;
}

/**
 * The unmatched branch: the ladder anchored nothing, so all that can have
 * happened is org proposals.
 *
 * WHEN THE WRITE THREW WE CLAIM NOTHING. `recordOrgProposals` reads the
 * existing titles BEFORE it inserts, so a throw can come from either half and
 * we do not know which domains were already queued — reporting a partial split
 * would be a guess printed as a fact. Every planned domain goes in the problem.
 */
export function proposalOutcome(input: ProposalOutcomeInput): WebhookOutcome {
  const base: WebhookOutcome = {
    ok: true,
    ingested: false,
    complete: true,
    reason: "no contact match",
    proposedOrgs: [],
    alreadyQueued: [],
    peopleCreated: [],
    peopleMerged: [],
    problems: [],
  };

  if (input.planned.length === 0) return base;

  if (input.error !== undefined) {
    return {
      ...base,
      complete: false,
      problems: [
        {
          kind: "proposal-queue-failed",
          domains: [...input.planned],
          detail:
            `Could not queue ${input.planned.length} new-company ${plural(input.planned.length, "proposal", "proposals")} ` +
            `(${input.planned.join(", ")}) — ${plural(input.planned.length, "it is", "they are")} on no ledger and ` +
            `nobody will be told. Cause: ${messageOf(input.error)}.`,
        },
      ],
    };
  }

  if (!input.storeConfigured) {
    return {
      ...base,
      complete: false,
      problems: [
        {
          kind: "proposal-store-unconfigured",
          domains: [...input.planned],
          detail:
            `No ledger store is configured, so ${input.planned.length} new-company ` +
            `${plural(input.planned.length, "proposal was", "proposals were")} dropped ` +
            `(${input.planned.join(", ")}). The pipe is running and storing nothing.`,
        },
      ],
    };
  }

  return {
    ...base,
    proposedOrgs: [...(input.result?.created ?? [])],
    alreadyQueued: [...(input.result?.duplicate ?? [])],
  };
}

export interface IngestOutcomeInput {
  activityId: string;
  created: string[];
  merged: string[];
  failed: PersonWriteFailure[];
}

/** The matched branch: the message landed on a record; people may not have. */
export function ingestOutcome(input: IngestOutcomeInput): WebhookOutcome {
  const problem = personWriteProblem(input.failed);
  return {
    ok: true,
    ingested: true,
    complete: problem === null,
    activityId: input.activityId,
    proposedOrgs: [],
    alreadyQueued: [],
    peopleCreated: [...input.created],
    peopleMerged: [...input.merged],
    problems: problem ? [problem] : [],
  };
}
