/**
 * Q85 inc.8 — the person proposal, and the FIRST thing it does is refuse to propose.
 *
 * inc.6 gave every unknown attendee the same next step: *"Propose the person — do not attach
 * this meeting to a similar name."* On prod that sentence is printed for three names, and one
 * of them is **`Dix thedev08`** — which is not a person the CRM is missing. It is Dixith
 * Magadiev's [P-1010] Notion display handle, and acting on inc.6's instruction would create a
 * SECOND record for a human the CRM already holds. The refusal that protects a meeting from
 * landing on a stranger (inc.6) does nothing about the opposite failure: proposing a stranger
 * who is already here under a different label.
 *
 * So `unknown` is not one answer, it is two, and only a human can be asked the right question:
 *
 *   - **propose**  — the CRM genuinely holds nobody like this. `Joseph Green`, `Ryan Groth`.
 *   - **withhold** — the value is a display handle for someone the CRM already has. Do not
 *                    create a record; confirm the handle and fix it at source, in Notion.
 *
 * THE HANDLE RULE IS TWO EXACT TESTS, NOT A SIMILARITY SCORE, and it is deliberately narrow:
 *
 *   1. the second token **contains a digit** (`thedev08`). No human surname on Rob's network
 *      carries one; a screen handle routinely does. This is the test that makes the rung safe —
 *      without it, "first token is a prefix of a CRM first name" would match `Dan Fischer`
 *      against `Daniel Ortiz` and propose nothing where a proposal was owed.
 *   2. the first token is a **prefix of** a CRM person's first name (`dix` → `dixith`), compared
 *      after `normalizeName`, character for character.
 *
 * NO EDIT DISTANCE, SAME AS inc.4 AND inc.6, and the surname case is why. `Joseph Green` shares
 * a surname with **Caleb Green [P-1018]** exactly. A ladder that scored on shared surnames would
 * withhold Joseph's proposal and quietly file a real human's meeting under a man he is not. A
 * shared surname is therefore carried as CONTEXT on a proposal that still goes ahead — never as
 * a reason to withhold, never as a candidate.
 *
 * TIES ARE NOT BROKEN. Two CRM people whose first names both start with the handle's first token
 * is a question with two ids on it, exactly as `ambiguous` and `hostProposal` already do.
 *
 * NOTHING IS WRITTEN. This returns what a human would confirm; no record is created, edited or
 * attached here, and no caller of this module may create one without that yes.
 *
 * PURE (CR-3): no clock, no network, no Supabase, no Notion. Callers supply the people.
 */

import { normalizeName } from "@/lib/dedup/match";
import type { CrmPerson } from "./activityPlan";
import type { AttendeeResolution } from "./attendeePerson";

/** The tokens of a name, normalized. "Dix thedev08" → ["dix", "thedev08"]. */
function tokens(name: string): string[] {
  return normalizeName(name || "").split(" ").filter(Boolean);
}

/** A token that carries a digit is a handle, not a surname. The one test the rung rests on. */
function hasDigit(token: string): boolean {
  return /[0-9]/.test(token);
}

/**
 * Why a proposal is being withheld. One rung today, and it stays one until a second one can be
 * stated as an exact comparison a human can re-run — a list of rungs is where fuzziness hides.
 */
export type PersonWithholdReason = {
  rung: "display-handle";
  /** The token that proved this is a handle — printed so the reader sees the evidence, not a verdict. */
  handleToken: string;
  /** Every CRM person whose first name this handle's first token opens. One is an answer; more is a question. */
  people: CrmPerson[];
};

export type PersonProposalDecision =
  | {
      kind: "propose";
      name: string;
      /**
       * CRM people who share this attendee's exact surname and are NOT this person. Context for a
       * human about to create a record, never a candidate and never a reason to withhold.
       */
      sharedSurname: CrmPerson[];
      /**
       * The name looks like a handle (digit in the last token) but opens no CRM first name. Worth
       * saying before a record is created FROM a handle — the fix would be in Notion, not the CRM.
       */
      looksLikeHandle: boolean;
    }
  | { kind: "withhold"; name: string; reason: PersonWithholdReason };

/**
 * What to do about ONE unknown attendee: propose the person, or refuse and ask about a handle.
 *
 * Returns `null` for any resolution that is not `unknown` — `matched` attaches, `ambiguous` and
 * `not-identifying` are already questions with their own next steps, and re-answering them here
 * would put two ladders on one row.
 */
export function decidePersonProposal(
  resolution: AttendeeResolution,
  people: CrmPerson[]
): PersonProposalDecision | null {
  if (resolution.outcome !== "unknown") return null;

  const name = resolution.attendee.name;
  const parts = tokens(name);
  const last = parts[parts.length - 1] ?? "";
  const first = parts[0] ?? "";

  // Rung 1: the handle. Exactly two tokens — a three-token value with a digit in it is not a
  // "first name + handle" shape and is not covered by anything this module can prove.
  if (parts.length === 2 && hasDigit(last) && first) {
    const opens = people.filter((person) => {
      const theirFirst = tokens(person.name)[0] ?? "";
      return theirFirst.length > 0 && theirFirst.startsWith(first);
    });
    if (opens.length > 0) {
      return { kind: "withhold", name, reason: { rung: "display-handle", handleToken: last, people: opens } };
    }
  }

  // Propose. The surname note is exact-match only, and only against a DIFFERENT first name —
  // a person whose full name matched would never have reached `unknown` in the first place.
  const sharedSurname =
    last && !hasDigit(last)
      ? people.filter((person) => {
          const theirs = tokens(person.name);
          if (theirs.length < 2) return false;
          return theirs[theirs.length - 1] === last && theirs[0] !== first;
        })
      : [];

  return { kind: "propose", name, sharedSurname, looksLikeHandle: hasDigit(last) };
}

/** The line a human reads. Ends in what they would go do, never in a record this module created. */
export function personProposalText(decision: PersonProposalDecision): string {
  if (decision.kind === "withhold") {
    const { handleToken, people } = decision.reason;
    const listed = people.map((p) => `${p.name} [${p.id}]`).join(", ");
    const head =
      `“${decision.name}” is a display handle, not a missing person — “${handleToken}” carries a digit, ` +
      `and “${tokens(decision.name)[0]}” opens `;
    if (people.length === 1) {
      return (
        head +
        `${listed}. Do NOT create a person: confirm the handle and fix the name at source, in Notion.`
      );
    }
    return (
      head +
      `${people.length} CRM names — ${listed} — so none is picked. Say which, and fix the name in Notion; ` +
      `do NOT create a person.`
    );
  }

  const parts: string[] = [`The CRM holds nobody named “${decision.name}” — propose the person.`];
  if (decision.sharedSurname.length) {
    const listed = decision.sharedSurname.map((p) => `${p.name} [${p.id}]`).join(", ");
    parts.push(
      `${listed} shares the surname and is a DIFFERENT person — a shared surname is never a match here.`
    );
  }
  if (decision.looksLikeHandle) {
    parts.push(
      "The last token carries a digit, so this may be a display handle no CRM name opens — check Notion before creating a record."
    );
  }
  return parts.join(" ");
}
