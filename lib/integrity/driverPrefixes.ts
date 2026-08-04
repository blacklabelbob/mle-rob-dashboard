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
// Pure per CR-3: handed the gate texts, returns the composed prompt. Reads no file, no env, no
// clock. The shell keeps only the gathering.

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

export type DriverGates = Partial<Record<DriverGateKey, string | null | undefined>>;

/** Opening words of the line that resolves the collision. Pinned so a reword is a test failure,
 *  not a silent change of meaning in a prompt nobody re-reads. */
export const PRECEDENCE_MARKER = "GATE PRECEDENCE";

/** A gate counts as fired only if it carries text. An empty string is the shell's way of saying
 *  "did not fire", and whitespace is the same thing with a typo. */
function fired(gates: DriverGates) {
  return GATE_ORDER.map((g) => ({ ...g, text: (gates[g.key] ?? "").trim() })).filter(
    (g) => g.text.length > 0,
  );
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

/**
 * Compose the driver's prompt from whichever gates fired plus the standing prompt.
 *
 * The gate texts pass through verbatim — they are Rob-facing sentences that have been read and
 * revised over many increments, and rewriting them here would put two authors on one sentence.
 */
export function composeDriverPrompt(gates: DriverGates, base: string): string {
  const active = fired(gates);
  if (active.length === 0) return base;
  const body = active.map((g) => g.text).join(" ");
  return `${precedenceLine(gates)}${body} ${base}`;
}
