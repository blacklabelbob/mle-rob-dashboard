// Q84 inc.145 — which "do this FIRST" actually goes first.
//
// WHY THIS EXISTS. The driver builds its prompt by concatenation:
//   PROMPT="${ORPHANED}${CLOCK_GATE}${UNFOLDED}${WATCHDOG_PREFIX}$(cat ...prompt.txt)"
// Four independent gates, each written on a different day, each claiming the front of the run in
// its own words: ORPHANED says "Do this BEFORE picking a queue item", CLOCK GATE says "BEFORE the
// queue item", UNFOLDED says "THIS run's TOP PRIORITY, before any other item", WATCHDOG says
// "land a commit THIS run". When two fire, the model is handed two sentences that both claim to
// be first and no sentence that says which one wins — so the answer comes from the order the
// literals happen to sit in a shell file nobody diffs. That is not a decision; it is an accident
// with a plausible shape.
//
// WHAT CHANGED. The ladder below IS the decision, written down with its reason, and a run where
// two or more gates fire now carries an explicit line naming the order. The gate texts themselves
// are untouched — each still reads correctly on its own, which is what makes them safe to keep
// reusing; the composer only resolves the collision between them.
//
// WHY THIS ORDER (the reasoning, not just the result):
//   1. ORPHANED  — a prior run's uncommitted diff is sitting in the tree. Everything else writes
//      ON TOP of it, and committing it as this run's work corrupts the record of who did what.
//      It is the only gate whose cost grows with every further edit, so it cannot go second.
//   2. UNFOLDED  — Rob's own captured requirements are unextracted. Folding a dump can CHANGE
//      which queue item is top, so doing a queue item first risks doing the wrong one carefully.
//      Rob's words outrank the machine's housekeeping.
//   3. WATCHDOG  — stalled build, or an empty queue. It does not compete for the slot; it tells
//      you how this run must end (a commit lands / the queue gets refilled). And when the queue
//      is empty AND a dump is unfolded, folding the dump IS the refill — so it sits below (2).
//   4. CLOCKGATE — a wrapper is writing an unlabeled stamp. Real, and worth fixing this run, but
//      it is a guard the machine wrote for itself about a formatting rule. inc.144 already
//      refused to halt the build over it; ranking it above Rob's own dump would do by wording
//      what that increment declined to do by mechanism.
//
// Q84 inc.146 — the gate texts keep their absolute claims, and the rank travels WITH each one.
//
// THE QUESTION inc.145 LEFT. Every gate text still says it goes first in its own words, while the
// composer above may rank it second. A sentence that contradicts its own header is the next
// reader's confusion, so either the sentences stop making absolute claims or the header has to
// reach them.
//
// THE ANSWER IS NOT TO REWORD THEM, and the reason is arithmetic. The overwhelmingly common firing
// is ONE gate, and that is exactly the case where the absolute claim is TRUE and load-bearing —
// "folding this dump is THIS run's TOP PRIORITY, before any other item" is what stops a run from
// doing housekeeping while Rob's captured requirements sit unread. There is deliberately no
// precedence line for a single gate, so softening the sentence would weaken the common case in
// order to tidy the rare one. It would also put two authors on one Rob-facing sentence, which is
// the thing inc.145 refused to do.
//
// WHAT CHANGED INSTEAD. When two or more gates fire, each verbatim text is handed over behind its
// own rank tag — "[2 of 3 — UNFOLDED DUMP: ranked here; its own 'first' is overruled]". The
// arbitration stops being a banner the reader passed four hundred words ago and becomes a label
// attached to the sentence it governs, at the moment that sentence is read. The text inside is
// still byte-for-byte the wrapper's. With one gate no tag is emitted (nothing outranks it), and
// with zero the prompt is the base, unchanged.
//
// Q84 inc.147 — a gate nobody ranked must be LOUD, not absent.
//
// THE HOLE inc.146 LEFT. The composer was correct about order and about each gate's standing, but
// nothing connected the four gate texts the wrapper gathers to the four keys ranked here. A fifth
// gate added to `crm-build-driver.sh` was dropped TWICE and silently both times: `driver-prompt.mjs`
// built its gates object from a fixed four-key literal, so a new `DRIVER_*` var was never read at
// all; and `fired()` walks GATE_ORDER, so an unknown key could not have survived even if it were.
// The author would see their gate fire in the shell and never fire in the run.
//
// WHY THE FIX IS NOT AN EXIT CODE. The obvious "fail loudly" is to abort. It is wrong here: the
// wrapper's fallback on failure is `PROMPT="${ORPHANED}${CLOCK_GATE}${UNFOLDED}${WATCHDOG_PREFIX}..."`
// — itself a fixed four-literal — so aborting drops the fifth gate too, and drops inc.145's ladder
// with it. The one place an unknown gate can survive is the composed prompt. So it is PRINTED.
//
// WHAT CHANGED. `gatesFromEnv` reads every `DRIVER_*` variable in the environment instead of four
// named ones, mapping each to its gate key by a DERIVED name (`clockGate` → `DRIVER_CLOCK_GATE`),
// so the wrapper and the ladder cannot drift apart by hand. Anything that does not map to a
// GATE_ORDER key is still carried — placed last, counted in the total, and tagged with the fact
// that nothing ranks it and where to rank it. An unranked gate ALWAYS gets its tag, even when it
// is the only gate that fired, because "this fired and no one ranked it" is the whole message.
//
// Pure per CR-3: handed the gate texts, returns the composed prompt. Reads no file, no clock, and
// no env of its own — `gatesFromEnv` is handed an environment object by the caller.

/** The gates, in the order they are to be worked. The ladder is the contract. */
export const GATE_ORDER = [
  {
    key: "orphaned",
    label: "ORPHANED WORK",
    why: "a prior run's diff is in the tree and every further edit lands on top of it",
  },
  {
    key: "unfolded",
    label: "UNFOLDED DUMP",
    why: "Rob's captured requirements can change which queue item is top",
  },
  {
    key: "watchdog",
    label: "WATCHDOG",
    why: "governs how this run must end, not which item it starts with",
  },
  {
    key: "clockGate",
    label: "CLOCK GATE",
    why: "a self-imposed formatting rule; inc.144 declined to halt the build for it",
  },
] as const;

export type DriverGateKey = (typeof GATE_ORDER)[number]["key"];

/** Keys outside GATE_ORDER are deliberately allowed: that is how an unranked gate reaches the
 *  prompt instead of being dropped by a type that could not represent it. */
export type DriverGates = Record<string, string | null | undefined>;

/** Every gate travels in an env var named after its key. Prefix pinned so the wrapper and the
 *  ladder share one convention rather than two hand-kept lists. */
export const DRIVER_ENV_PREFIX = "DRIVER_";

/** `clockGate` → `DRIVER_CLOCK_GATE`. Derived, never hand-listed — a hand-kept map is exactly the
 *  drift this increment exists to close. */
export function gateEnvVar(key: string): string {
  return DRIVER_ENV_PREFIX + key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

/**
 * Gather gates out of an environment.
 *
 * Reads EVERY `DRIVER_*` variable, not a fixed list, so adding one to the wrapper is enough to
 * make it reach the run. Known names become their gate key; anything else is kept under its own
 * env-var name, which is what the unranked tag then prints back at the author.
 */
export function gatesFromEnv(env: Record<string, string | undefined>): DriverGates {
  const known = new Map(GATE_ORDER.map((g) => [gateEnvVar(g.key), g.key as string]));
  const out: DriverGates = {};
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith(DRIVER_ENV_PREFIX)) continue;
    if (!(value ?? "").trim()) continue;
    out[known.get(name) ?? name] = value;
  }
  return out;
}

/** Opening words of the line that resolves the collision. Pinned so a reword is a test failure,
 *  not a silent change of meaning in a prompt nobody re-reads. */
export const PRECEDENCE_MARKER = "GATE PRECEDENCE";

/** Why an unranked gate sits where it sits. Stated as the gate's own `why` so the precedence line
 *  reads the same for it as for every other gate. */
export const UNRANKED_WHY = "NOT IN GATE_ORDER — nothing ranks it, so it is placed last by default";

/** A gate counts as fired only if it carries text. An empty string is the shell's way of saying
 *  "did not fire", and whitespace is the same thing with a typo.
 *
 *  Ranked gates come out in ladder order; anything the ladder does not know about follows them,
 *  sorted by key so two runs with the same environment compose the same prompt. It is carried
 *  rather than dropped — a gate that fired and vanished is the defect this closes. */
function fired(gates: DriverGates) {
  const ranked = GATE_ORDER.map((g) => ({
    ...g,
    text: (gates[g.key] ?? "").trim(),
    ranked: true,
  })).filter((g) => g.text.length > 0);

  const knownKeys = new Set<string>(GATE_ORDER.map((g) => g.key));
  const unranked = Object.keys(gates)
    .filter((k) => !knownKeys.has(k) && (gates[k] ?? "").trim().length > 0)
    .sort()
    .map((k) => ({
      key: k,
      label: k,
      why: UNRANKED_WHY,
      text: (gates[k] ?? "").trim(),
      ranked: false,
    }));

  return [...ranked, ...unranked];
}

/**
 * The line that exists only when there is an actual conflict.
 *
 * WHY IT IS CONDITIONAL. With one gate there is nothing to resolve, and a precedence banner above
 * a single instruction is noise that trains the reader to skim the banner — which is exactly the
 * habit that would make it useless on the run where it matters. With zero gates the prompt must
 * come back byte-identical to the base, because that is the overwhelmingly common tick.
 */
export function precedenceLine(gates: DriverGates): string {
  const active = fired(gates);
  if (active.length < 2) return "";
  const ranked = active.map((g, i) => `${i + 1}) ${g.label} (${g.why})`).join(", ");
  return (
    `${PRECEDENCE_MARKER}: ${active.length} gates fired this run and each of them says "first". ` +
    `They are ordered here, and this ordering wins over the wording inside them: ${ranked}. ` +
    `Work them in that order, then the queue item. `
  );
}

/** Pinned so a reword is a test failure. The tag has to survive next to sentences that shout, so
 *  it says which slot this is AND what became of the sentence's own claim.
 *
 *  Rank 1's claim is NOT overruled — it won, and telling it otherwise would be the composer
 *  stating something false about its own decision in a prompt Rob reads. The verdict differs by
 *  position for that reason, not for tone. */
export function rankTag(position: number, total: number, label: string): string {
  const verdict = position === 1 ? `its "first" stands` : `its own "first" is overruled`;
  return `[${position} of ${total} — ${label}: ranked here; ${verdict}] `;
}

/** The loud version, for a gate the ladder has never heard of.
 *
 *  It names the env var so the author sees the thing they added, says plainly that nothing ranked
 *  it, and says where to rank it. This tag is emitted even when the unranked gate is the ONLY gate
 *  that fired — with one ranked gate there is nothing to arbitrate, but with one UNRANKED gate the
 *  message is not about order at all, it is "you added this and no one has decided what it beats". */
export function unrankedTag(position: number, total: number, envName: string): string {
  return (
    `[${position} of ${total} — UNRANKED GATE ${envName}: it fired and is printed here so it ` +
    `cannot vanish, but nothing ranks it. Rank it in GATE_ORDER (lib/integrity/driverPrefixes.ts).] `
  );
}

/**
 * Compose the driver's prompt from whichever gates fired plus the standing prompt.
 *
 * The gate texts pass through verbatim — they are Rob-facing sentences that have been read and
 * revised over many increments, and rewriting them here would put two authors on one sentence.
 * When more than one fires, each is tagged with its rank so the arbitration is readable AT the
 * sentence rather than only in a header above all of them.
 */
export function composeDriverPrompt(gates: DriverGates, base: string): string {
  const active = fired(gates);
  if (active.length === 0) return base;
  const body = active
    .map((g, i) => {
      if (!g.ranked) return `${unrankedTag(i + 1, active.length, g.label)}${g.text}`;
      return active.length > 1 ? `${rankTag(i + 1, active.length, g.label)}${g.text}` : g.text;
    })
    .join(" ");
  return `${precedenceLine(gates)}${body} ${base}`;
}
