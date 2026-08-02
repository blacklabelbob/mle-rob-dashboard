/**
 * Q84 inc.96 — the answer to "should the resolve write carry the actor", written in code
 * rather than left in prose so the next caller meets it instead of re-deciding it.
 *
 * THE QUESTION. inc.95 had to retreat the archive header from *"the other 39 you closed
 * yourself"* to *"were closed by a person"*, because the ledger records the PAGE a resolve
 * was clicked from (inc.35/inc.36) and never the human. With Q73's role grants about to put
 * reps in front of the same Resolve button, the obvious next move is to store who clicked.
 *
 * THE ANSWER IS NO, AND IT IS NOT A DEFERRAL. There is no verified actor to store:
 *
 *   - The only identity a browser on this dashboard has is `resolveViewIdentity`'s config,
 *     and Q67b already ruled on what that is: *"a deployment setting, not an authorship
 *     model"* — client-visible, self-asserted, and unset in the normal case.
 *   - Q73's `mle_rep_read` / `mle_booker_read` are POSTGRES read grants, not sessions. The
 *     route writes through the service key, so the database sees one actor for every click
 *     no matter who made it.
 *   - Login was removed on Rob's 7/21 instruction (env var only, re-armable in one command);
 *     Q6/Q64 own the access model that would make an actor real.
 *
 * So an `actor` on the wire could only ever be a claim the caller makes about itself. Writing
 * that into `flags.resolved_by` would be inc.95's defect made DURABLE: inc.95 was a rendering
 * bug that one line fixed, while this would be wrong data on rows that are never deleted, and
 * the archive would print a name with the same confidence whether or not anyone checked it.
 * inc.36 (a machine sentence attributed to Rob), inc.91 (Rob's sentence adopted as the
 * ledger's) and inc.95 (an author the ledger never recorded) are the same defect three times;
 * a self-asserted actor column is the fourth, and the only one that outlives a deploy.
 *
 * WHAT THE ARCHIVE COULD SAY IF THE WRITE DID CARRY IT — the second half of inc.95's handover
 * question, answered so the work is scoped when Q6/Q64 land: with a VERIFIED actor the header
 * regains the sentence inc.95 gave up (*"you closed 31 of these, Dana closed 8"*), the reopen
 * refusal can name whose decision it is declining to undo instead of saying "a person", and
 * `resolvedFromNote`'s clause stops being the only provenance in a field the reviewer also
 * types into. None of that is reachable from a client-supplied string, which is why this file
 * refuses one rather than accepting it as a down payment.
 *
 * THE REFUSAL IS HERE, NOT IN THE ROUTE'S PROSE, BECAUSE THE ROUTE ALREADY IGNORED IT. The
 * PATCH handler destructures `{ id, action, note }` and drops every other key silently, so a
 * caller that started sending `resolvedBy` would get a 200 and believe the ledger recorded it.
 * That is the shape this queue has hit twice (inc.48, inc.93): the UI never offering a thing
 * is not the same as the server refusing it. A silent drop is worse than a refusal — it reads
 * as acceptance.
 */

/**
 * Keys that assert WHO did something. Deliberately the plausible spellings a future caller
 * would reach for, in both the camelCase of this codebase's payloads and the snake_case of
 * its columns — the point is to be met, not to be minimal.
 */
export const ACTOR_CLAIM_FIELDS = [
  "actor",
  "resolvedBy",
  "resolved_by",
  "closedBy",
  "closed_by",
  "reviewer",
  "user",
  "userId",
  "user_id",
] as const;

/**
 * Refuse a resolve/reopen whose payload claims an author, or `null` when it makes no claim.
 *
 * `null` is the normal answer — today nothing sends any of these. This exists so the first
 * caller that does is told why, on the click, instead of being quietly ignored.
 *
 * Empty and null values are NOT a claim: a form that serialises an unset field to `""` is
 * saying it has no actor, which is exactly the honest thing to say, and 400-ing it would
 * punish a caller for agreeing with this file. Same rule inc.48 set — refusing a no-op
 * teaches a caller to fear a button that did nothing wrong.
 *
 * The message NAMES THE ALTERNATIVE rather than only saying no (inc.93's rule): the note the
 * reviewer types is the one authorship the ledger can honestly keep, because the person who
 * typed it is the person whose words they are.
 */
export function unverifiedActorRefusal(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const claimed = ACTOR_CLAIM_FIELDS.filter((field) => {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) return false;
    const value = (payload as Record<string, unknown>)[field];
    if (value === null || value === undefined) return false;
    return typeof value === "string" ? value.trim() !== "" : true;
  });
  if (claimed.length === 0) return null;
  return (
    `This ledger cannot record who resolved a finding, so \`${claimed.join("`, `")}\` ` +
    `would be stored as a claim nobody checked. There is no signed-in user on this dashboard ` +
    `yet — the only identity the browser has is a deployment setting. Put what you know in ` +
    `the resolution note instead; a sentence is kept exactly as its author typed it.`
  );
}
