// BUILD-QUEUE Q68 (c) inc.43 — THE REPAIR DOORS, IN THE ARMING REPORT.
//
// inc.21/22 answer one question: how far does a NEW call get right now. Increments 37–42
// built a second thing entirely — two doors that repair calls ALREADY on the timeline (the
// transcript backlog, then the summary-only backlog) — and the arming report cannot see
// either of them. An operator who reads `/api/admin/call-readiness` today, arms all four
// keys, redeploys and then curls the repair door gets a 503 the report never mentioned.
//
// THE ACTUAL DISCOVERY, and the reason this file exists rather than a line in inc.21:
// `CRON_SECRET` gates BOTH spend doors (inc.42's `backfillAuthGate`) and appears in
// NEITHER trigger's required-env list — it is the auth gate, checked before the pass is
// even asked whether it is configured. So it is the one name in this whole feature that no
// existing surface has ever asked Rob for. A report that lists three keys and stays silent
// about the fourth is how the fourth never gets added.
//
// FIVE DECISIONS:
//
//  1. A SEPARATE SECTION, NEVER FOLDED INTO THE CHAIN'S `verdict`/`reached`/`missing`.
//     A repair door is about the PAST; the chain is about the next call. Merging them
//     would let two open doors read as a chain that reaches `summary` — or, worse, make an
//     unset `CRON_SECRET` report the live chain as blocked when a real call would sail
//     through it untouched. Two questions, two answers.
//
//  2. THE ENV LISTS ARE IMPORTED, NEVER RE-DECLARED. `BACKFILL_REQUIRED_ENV` and
//     `SUMMARY_REQUIRED_ENV` are the triggers' own statements of what makes them 503; a
//     copy here would drift on the first change and report a door as `open` that answers
//     503 — the precise lie inc.14's rule exists to prevent, aimed at ourselves again.
//
//  3. `CRON_SECRET` COMES FIRST IN EVERY DOOR'S LIST, because it is checked first: the
//     gate answers 503 before the pass is ever handed its config. Listing it after the
//     provider keys would have a human add Deepgram, redeploy, re-curl, and get the same
//     503 they got before — with the report still pointing at a key they already added.
//
//  4. NO DOOR IS EVER CALLED WORKING. A door is `open` or `inert` — a statement about env
//     presence and nothing else, exactly like `armed`/`dormant` one layer up. Whether a
//     pass actually repairs anything is a thing only a pass that ran can say, and this
//     module never runs one.
//
//  5. NO KEY VALUE REACHES THIS FILE. The input is a SET OF NAMES that are set — names,
//     never values. `repairPresenceFromEnv` does the presence conversion at the edge and
//     returns nothing else, and it derives the names it checks from the imported lists so
//     rule 2 holds through the conversion too.

import { BACKFILL_REQUIRED_ENV } from "./backfillTrigger";
import { SUMMARY_REQUIRED_ENV } from "./summaryTrigger";

/** The shared gate (inc.42). Named once, here, because no other surface asks for it. */
export const REPAIR_AUTH_ENV = "CRON_SECRET";

export type RepairDoorId = "transcript" | "summary";

/** Env presence, by NAME only — rule 5. */
export type RepairPresence = ReadonlySet<string>;

export interface RepairDoorReadiness {
  door: RepairDoorId;
  /** The URL an operator actually curls. GET plans, POST spends (inc.38/42). */
  path: string;
  /** Everything this door needs, gate first — rules 2 and 3. */
  requires: string[];
  /** The unset subset, in the same order. Empty = the door may spend. */
  missing: string[];
  /** Rule 4: env presence, never a claim about outcomes. */
  state: "open" | "inert";
  /** What a request to this door does right now. */
  effect: string;
}

export interface RepairReadiness {
  doors: RepairDoorReadiness[];
  /** Every unset name blocking at least one door, deduped, gate-first order preserved. */
  missing: string[];
  /**
   * Typed as the literal `false` for inc.21's reason: no arrangement of env vars is
   * evidence that a backlog was ever repaired.
   */
  repaired: false;
}

const DOORS: { door: RepairDoorId; path: string; env: readonly string[]; spends: string }[] = [
  {
    door: "transcript",
    path: "/api/admin/call-backfill",
    env: BACKFILL_REQUIRED_ENV,
    spends: "Deepgram plus Twilio media egress, over filed calls that have no words.",
  },
  {
    door: "summary",
    path: "/api/admin/call-backfill/summary",
    env: SUMMARY_REQUIRED_ENV,
    spends: "the model only, over words we already own.",
  },
];

/** Rule 3: the gate is checked first, so it is asked for first. */
function requirements(env: readonly string[]): string[] {
  return [REPAIR_AUTH_ENV, ...env];
}

/** Every env name any door consults — the exact set the edge conversion looks up. */
export const REPAIR_ENV_NAMES: string[] = [
  ...new Set(DOORS.flatMap((d) => requirements(d.env))),
];

/** Rule 5 — presence in, names out, values nowhere. */
export function repairPresenceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RepairPresence {
  return new Set(REPAIR_ENV_NAMES.filter((name) => Boolean(env[name])));
}

export function repairReadiness(present: RepairPresence): RepairReadiness {
  const doors: RepairDoorReadiness[] = DOORS.map(({ door, path, env, spends }) => {
    const requires = requirements(env);
    const missing = requires.filter((name) => !present.has(name));
    const gateShut = !present.has(REPAIR_AUTH_ENV);
    return {
      door,
      path,
      requires,
      missing,
      state: missing.length === 0 ? "open" : "inert",
      effect:
        missing.length === 0
          ? `A bearer-authorised POST may spend ${spends}`
          : gateShut
            ? `Every request answers 503 at the gate — ${REPAIR_AUTH_ENV} is unset, so nothing is triggerable.`
            : `Authorised requests answer 503 not-configured; the pass asks the database nothing.`,
    };
  });

  // Deduped across doors, first-seen order — which is gate-first by construction.
  const missing = [...new Set(doors.flatMap((d) => d.missing))];

  return { doors, missing, repaired: false };
}
