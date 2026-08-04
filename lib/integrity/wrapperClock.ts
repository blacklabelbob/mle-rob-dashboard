// Q84 inc.142 — the rule that stops the NEXT wrapper from inventing a private clock.
//
// WHY THIS EXISTS. inc.139 → inc.141 chased one defect through three files: a stamp written for
// Rob that does not say whose clock produced it. `fireflies-quota.mjs` said "since 2026-08-03
// 13:40 EDT", `meeting-intake.sh` said "FAILED 2026-08-03 22:10:04", and `crm-build-driver.sh`
// said "STALLED 24 ticks (08-03 19:28)" — one file, three shapes of time, two of them unreadable
// as instants. Each was fixed by hand. Nothing stopped a fourth wrapper from doing it again,
// because the rule lived only in two shell files' comments.
//
// WHY IT SCANS BY SURFACE AND NOT BY A LIST OF FILENAMES. A hand-kept registry of "wrappers we
// own" would miss precisely the case it exists for: a script nobody thought to add. So the
// question asked here is behavioural — does this script write into something Rob READS? If it
// does, every human-readable stamp it prints must name its zone.
//
// WHAT IS DELIBERATELY NOT A FINDING:
//   • `date +%s` and friends — an epoch is not a sentence; nobody reads it and it carries no zone
//     ambiguity. Flagging arithmetic would train the reader to ignore this gate.
//   • `date -j -f ...` / `date -d ...` — these PARSE a stamp someone else wrote. Demanding a zone
//     here would break the machine-readable contract between session-start-briefing.sh (writes
//     the activity log) and daily-driver.sh (parses it back to count silent days).
//   • Any script that WRITES to none of Rob's surfaces — its stamps are its own business. Merely
//     naming one is not enough: session-start-briefing.sh only PRINTS the ping inbox, while its
//     own stamp goes to an activity log that daily-driver.sh parses back with `date -j -f` to
//     count silent days. Demanding a zone there would have broken that contract — the first live
//     run of this gate asked for exactly that, which is why "written" replaced "mentioned".
//   • A calendar-only format (`%Y-%m-%d`, no clock field). A day is not an instant, and Rob's
//     ledger already prints days without a zone (`due 2026-08-04`, judged by todayInET). The
//     defect being guarded is an unreadable INSTANT, so that is what it flags.
//
// Pure per CR-3: it is handed sources and returns findings. It reads no file and no clock.

import { GATE_ORDER, gateEnvVar, DRIVER_ENV_PREFIX } from "./driverPrefixes";

/** The files Rob actually opens and reads sentences out of. A stamp that lands in one of these is
 *  a stamp a human has to interpret. */
export const ROB_FACING_SURFACES = ["PING-INBOX.md", "crm-driver.log", "meeting-intake.log"] as const;

/** The one in-repo formatter every wrapper this build owns is supposed to ask for its time
 *  (`node scripts/intake-silence.mjs stamp`, Q84 inc.140/141). */
export const REPO_STAMP_CALL = "intake-silence.mjs stamp";

/**
 * How a wrapper invokes this gate (Q84 inc.143).
 *
 * BOTH spellings are needed and the first live run is why: the draft carried only the file name,
 * and the driver line I had just written — `npm run audit:clocks -- --brief` — went undetected,
 * so the gate reported itself untriggered while its trigger sat three lines above. A needle that
 * only matches the spelling the author happened to use is not a check.
 */
export const TRIGGER_CALLS = ["audit-wrapper-clocks", "audit:clocks"] as const;

/**
 * The prompt composer, spelled as it appears on the wrapper's invocation line (Q84 inc.150).
 *
 * Declared once here rather than grepped for at each site for the same reason `BRIEF_MARKER` is:
 * the needle and the sentence that explains the finding have to be the same string, or the check
 * goes quietly blind while both halves still read correctly on their own.
 */
export const COMPOSER_CALL = "driver-prompt.mjs";

/**
 * The prefix every `--brief` sentence carries, and the ONLY thing the caller may match on
 * (Q84 inc.144).
 *
 * The driver filters this gate's stderr with `grep '^CLOCK GATE'` because node prints an unrelated
 * MODULE_TYPELESS warning down the same pipe. That filter is a contract between a shell file no
 * diff sees and three string literals in a script — reword any one of them and the driver goes
 * quietly blind while both halves still look correct in isolation. So the marker is declared once,
 * here, every brief line is built from it, and a test asserts it.
 */
export const BRIEF_MARKER = "CLOCK GATE";

/** What `--brief` should say and exit with. `line` is null only when there is nothing to act on. */
export type ClockGateBrief = { code: 0 | 1 | 3 | 4; line: string | null };

/**
 * The `--brief` verdict for an audit — the one line that gets prefixed onto the driver's prompt.
 *
 * Pure and tested rather than inlined at the print site, because this text IS the enforcement:
 * it is the whole of what the next increment is told, and inc.143's own first live run proved a
 * gate's wording can be wrong in a way nothing catches (the trigger needle matched one spelling
 * of two). What the shell may still decide on its own is only whether this ran at all.
 */
export function clockGateBrief(audit: ClockAudit): ClockGateBrief {
  // Q84 inc.148 — the unranked-gate sentence is a SUFFIX, never a competitor. The driver greps
  // `^CLOCK GATE`, so exactly one line is heard per tick; ranking this finding against the stamp
  // findings would mean the loser vanishes, which is the precise disease inc.147 spent an
  // increment killing (a gate that fired must not disappear between shell and prompt). So it
  // rides whichever verdict wins, and only decides the exit code when nothing else is wrong.
  //
  // Q84 inc.149 adds the second gate sentence on the same terms and for the same reason: it is
  // appended, never ranked against the first. Stranded is stated BEFORE unranked because a gate
  // that never arrives outranks a gate that arrives unplaced — but that is ordering inside one
  // line, which costs nobody anything, not a contest for the line.
  //
  // Q84 inc.150 appends the third on the same terms, and LAST on purpose. The other two are
  // proven defects in what the wrapper DOES; this one is a defect in what the wrapper can TELL
  // you, and it only costs anything on the tick something else breaks. Stating it after them is
  // that difference written down, not a judgement that it is small.
  const unranked =
    strandedGateSentence(audit) + unrankedGateSentence(audit) + silencedComposerSentence(audit);

  if (audit.findings.length > 0) {
    const worst = audit.findings[0];
    const n = audit.findings.length;
    return {
      code: 1,
      line:
        `${BRIEF_MARKER} IS RED — ${n} unlabeled stamp${n === 1 ? " reaches" : "s reach"} a file ` +
        `Rob reads (first: ${worst.script}:${worst.line}, '+${worst.format}' → ` +
        `${worst.surfaces.join(", ")}). Fix this BEFORE the queue item: run ` +
        "`npm run audit:clocks` for the full report. Q84 inc.142." +
        unranked,
    };
  }
  if (audit.triggeredBy.length === 0) {
    return {
      code: 3,
      line:
        `${BRIEF_MARKER} HAS NO TRIGGER — no wrapper in the scanned set invokes ` +
        `\`${TRIGGER_CALLS[0]}\`, so the rule is only enforced when a human remembers to type it. ` +
        `Re-wire the driver tick (Q84 inc.143) before the queue item.` +
        unranked,
    };
  }
  if (unranked) {
    return { code: 4, line: `${BRIEF_MARKER} IS CLEAN, BUT${unranked.replace(/^ /, " ")}` };
  }
  return { code: 0, line: null };
}

/** The suffix sentence for unranked `DRIVER_*` gates — empty when there are none, so callers can
 *  concatenate it unconditionally. Named once here because it is the same words in both the brief
 *  and the full report, and a second copy is how the two would drift. */
function unrankedGateSentence(audit: ClockAudit): string {
  const vars = audit.unrankedGateVars;
  if (vars.length === 0) return "";
  const named = vars.map((v) => `${v.envVar} (${v.script}:${v.line})`).join(", ");
  return (
    ` ${vars.length} gate${vars.length === 1 ? "" : "s"} the wrapper hands the driver ` +
    `${vars.length === 1 ? "has" : "have"} NO RANK in GATE_ORDER — ${named}. It fires and is ` +
    `printed, but nothing decides what it beats: rank it in \`lib/integrity/driverPrefixes.ts\` ` +
    `(Q84 inc.148).`
  );
}

/**
 * The suffix sentence for ranked gates the wrapper computes but never hands over (Q84 inc.149).
 *
 * The sibling of the unranked gate and the worse of the two: an unranked gate at least ARRIVES.
 * This one is ranked, sits in `GATE_ORDER` with a sentence explaining what it beats, fires in the
 * shell — and the composer never sees it, because the assignment is a plain local. Nothing
 * anywhere reports a gate that is silently absent: `gatesFromEnv` reads the environment it was
 * given, and an env var that was never put there is indistinguishable from a gate that did not
 * fire. So the only place this is visible is the wrapper's own text, which is exactly what this
 * audit already reads.
 */
function strandedGateSentence(audit: ClockAudit): string {
  const vars = audit.strandedGateVars;
  if (vars.length === 0) return "";
  const named = vars.map((v) => `${v.envVar} (${v.script}:${v.line})`).join(", ");
  return (
    ` ${vars.length} RANKED gate${vars.length === 1 ? "" : "s"} NEVER REACH${vars.length === 1 ? "ES" : ""} ` +
    `THE DRIVER — ${named}. The value is computed and then dropped: a plain local assignment is ` +
    `not in the child's environment, so the composer cannot read it and the gate is silently ` +
    `absent, not merely unranked. \`export\` it, or put it on the invocation line as a prefix ` +
    `(Q84 inc.149).`
  );
}

/**
 * The suffix sentence for a wrapper that asks the composer for a prompt and throws away its
 * answer to the question "did that work?" (Q84 inc.150).
 *
 * The wrapper falls back to plain concatenation whenever the composer's stdout is empty — which is
 * correct, and is why this is not a red: running with an unresolved gate tie beats running with no
 * standing prompt. What is wrong is that the fallback is the ONLY observable, and it looks the
 * same whether node is missing, the loader threw, or `GATE_ORDER` has a syntax error. A composer
 * that has failed on every tick for a week is indistinguishable from one that has worked on every
 * tick for a week, and the difference is which gate the next increment is told to obey first.
 */
function silencedComposerSentence(audit: ClockAudit): string {
  const vars = audit.silencedComposers;
  if (vars.length === 0) return "";
  const named = vars.map((v) => `${v.script}:${v.line}`).join(", ");
  return (
    ` The composer's own diagnostics are DISCARDED — ${named} runs \`${COMPOSER_CALL}\` with ` +
    `\`2>/dev/null\`. The wrapper still falls back to concatenation, so nothing breaks loudly; it ` +
    `breaks silently, and a composer failing every tick reads exactly like one that works. Keep ` +
    `the fallback, keep the stderr: write it to the driver log on the failing path (Q84 inc.150).`
  );
}

export type ClockFinding = {
  /** Script name as given (a bare basename is enough — the caller knows the directory). */
  script: string;
  /** 1-indexed line of the offending `date` invocation. */
  line: number;
  /** The strftime format string exactly as written, so the fix is obvious from the report. */
  format: string;
  /** Which of Rob's surfaces this script writes into — i.e. why the stamp matters. */
  surfaces: string[];
};

/** A `DRIVER_*` gate a wrapper actually hands to the driver that `GATE_ORDER` does not rank. */
export type GateRankFinding = {
  script: string;
  /** 1-indexed line of the assignment, counting the wrapper's PHYSICAL lines. */
  line: number;
  /** The env var exactly as the wrapper spells it — what the author greps for. */
  envVar: string;
};

/** A wrapper that runs the prompt composer with its diagnostics thrown away (Q84 inc.150). */
export type SilencedComposerFinding = {
  script: string;
  /** 1-indexed PHYSICAL line the composer call is written on — where the author goes to fix it. */
  line: number;
};

export type ClockAudit = {
  findings: ClockFinding[];
  /**
   * Gates the wrapper sets that nothing ranks (Q84 inc.148).
   *
   * inc.147 made an unranked gate loud IN THE PROMPT — but only the model reading that prompt
   * ever learns of it. The human who added the gate sees nothing, because the wrapper still
   * spells its `DRIVER_*` assignments by hand and this repo never looked at them. This audit
   * already parses these wrappers and already owns an exit code for "the rule is unenforced",
   * so it is the one place the assertion can live without inventing a second scanner.
   */
  unrankedGateVars: GateRankFinding[];
  /**
   * Ranked gates a wrapper sets but never hands to any child (Q84 inc.149).
   *
   * Only RANKED names qualify, and the asymmetry with `unrankedGateVars` is deliberate rather
   * than an oversight: a local `DRIVER_*` that nothing ranks is unjudgeable — `daily-driver.sh`
   * and `daily-email.sh` each hold a local `DRIVER_LOG` that is a log path, not a gate, and no
   * parse can tell those apart from a gate somebody forgot to export. A name that IS in
   * `GATE_ORDER` has already been declared a gate by this repo, so a local assignment of it is a
   * fact, not a guess.
   */
  strandedGateVars: GateRankFinding[];
  /**
   * Wrappers that invoke the prompt composer with its stderr sent to `/dev/null` (Q84 inc.150).
   *
   * inc.148 and inc.149 both ask whether a gate reaches the composer. Neither asks whether the
   * composer is ever consulted at all — and it is invoked inside a `$( )` whose failure mode is an
   * empty string, which the wrapper handles by concatenating. That fallback is right and stays;
   * discarding the reason is what makes the failure unobservable.
   */
  silencedComposers: SilencedComposerFinding[];
  /** Scripts that write to a surface AND ask the repo for their stamp — the compliant shape. */
  usesRepoStamp: string[];
  /** Scripts scanned but skipped because they touch none of Rob's surfaces. */
  skipped: string[];
  /**
   * Wrappers that actually RUN this gate. Empty means the rule is unenforced (Q84 inc.143).
   *
   * The trigger has to live in a machine-local shell file that no diff ever sees — the same
   * undiffed place the original defect grew. So the repo does not trust that the wiring is
   * still there: it looks, every run, and says so when it is gone.
   */
  triggeredBy: string[];
};

/** `date '+%F %T'`, `date "+%s"`, `date +%s` — quoted and bare, one line may hold several. */
const QUOTED_FORMAT = /['"]\+([^'"]*)['"]/g;
const BARE_FORMAT = /(?:^|\s)\+(%[^\s'"|)]*)/g;

/** A line that converts an existing stamp rather than minting a new one. */
const isParseInvocation = (line: string) => /\bdate\b[^\n]*(-j\s+-f|\s-d\s)/.test(line);

/** Only a format carrying a CLOCK field states an instant; `%s` is arithmetic and `%Y-%m-%d` is a
 *  day. Both are readable without knowing the zone; a time of day is not. */
const statesAnInstant = (format: string) => /%[HIMSRTXc]/.test(format);

/** %Z (name) or %z (offset) — either one lets the reader recover the instant. */
const namesItsZone = (format: string) => /%[Zz]/.test(format);

/**
 * The tokens a line actually redirects INTO, plus any `tee` argument.
 *
 * Quote state is tracked because a `>` inside an echoed sentence is prose, not a redirect —
 * session-start-briefing.sh prints the literal help text `(clear with: > ~/…/PING-INBOX.md)`,
 * which read as a write to Rob's inbox on this gate's second live run and demanded a zone on a
 * stamp that never lands there. It is the only script in the tree that only READS that file.
 */
function redirectTargets(line: string): string[] {
  const out: string[] = [];
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") {
      while (line[i + 1] === ">") i++;
      out.push(line.slice(i + 1).trim().split(/\s/)[0] ?? "");
    }
  }
  const tee = /\btee\b\s+(?:-a\s+)?(\S+)/.exec(line);
  if (tee) out.push(tee[1]);
  return out.filter(Boolean);
}

/**
 * Which of Rob's surfaces this script WRITES to.
 *
 * A redirect (`>>`/`>`) or a `tee` on the same line as the surface name. Reading a surface —
 * `cat "$PING_INBOX"` — proves nothing about whose clock the script keeps.
 */
function surfacesWritten(source: string): string[] {
  const lines = codeLines(source);
  return ROB_FACING_SURFACES.filter((surface) => {
    // The path is almost always held in a variable — `PING_INBOX="$MEM/PING-INBOX.md"` — and the
    // redirect that uses it sits fifty lines away, so the literal name alone would miss every
    // real write. Resolve one level of indirection: which names hold this path?
    const held = new Set<string>();
    for (const line of lines) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
      if (m && line.includes(surface)) held.add(m[1]);
    }
    const targets = [surface, ...[...held].flatMap((v) => [`$${v}`, `\${${v}}`])];
    return lines.some((line) => redirectTargets(line).some((t) => targets.some((want) => t.includes(want))));
  });
}

/**
 * The `DRIVER_*` assignments in a wrapper that actually TRAVEL into a child process — and only
 * those (Q84 inc.148).
 *
 * WHY THE DISTINCTION IS LOAD-BEARING AND NOT A CONVENIENCE. `daily-driver.sh` and
 * `daily-email.sh` both hold `DRIVER_LOG="$MEM/daily-driver.log"` — a plain local variable that
 * is not exported and is not a gate. `gatesFromEnv` reads the composer's OWN environment, so a
 * local assignment never reaches it and flagging one would put a permanent false red in front of
 * every increment. What reaches the composer is exactly what shell puts in a child's environment:
 * an `export`, or an assignment sitting as a PREFIX on a command word.
 *
 * So the remainder after each assignment is scanned for a command word, and the scan stops at the
 * first unquoted `&&`, `||`, `;`, `|` or `&` — after one of those a NEW command begins and the
 * assignment does not travel to it. That is shell's own rule, not an approximation of it.
 */
function driverVarAssignments(source: string): { envVar: string; line: number; travels: boolean }[] {
  const out: { envVar: string; line: number; travels: boolean }[] = [];
  const physical = codeLines(source);
  // Q84 inc.149 — a bare `export DRIVER_X` (no `=`) on any later line makes an earlier local
  // assignment travel after all. It is ordinary shell and omitting it would put a permanent false
  // red in front of a wrapper that is correct, which is the one failure this gate cannot afford.
  const bareExported = new Set<string>();
  for (const line of physical) {
    const m = /^\s*export\s+([A-Za-z_][A-Za-z0-9_ ]*)$/.exec(line.replace(/\s+$/, ""));
    if (!m) continue;
    for (const name of m[1].split(/\s+/)) {
      if (name.startsWith(DRIVER_ENV_PREFIX)) bareExported.add(name);
    }
  }

  for (const { text, lineOf } of logicalLines(source)) {
    const assign = new RegExp(`(export\\s+)?(${DRIVER_ENV_PREFIX}[A-Za-z0-9_]+)=`, "g");
    for (const m of text.matchAll(assign)) {
      const exported = Boolean(m[1]) || bareExported.has(m[2]);
      const travels = exported || isCommandPrefix(text, m.index + m[0].length);
      out.push({ envVar: m[2], line: lineOf(m.index), travels });
    }
  }
  return out;
}

/**
 * A wrapper's LOGICAL lines — backslash continuations joined — each able to map an offset back to
 * the PHYSICAL line it is written on.
 *
 * Joining matters because the wrapper spreads one command over three lines: the gates are prefixes
 * on the first two and the command word (`node …`) is on the third, so neither the assignments nor
 * the composer's redirect can be judged until they are one string.
 *
 * EXTRACTED at inc.150 rather than copied for the new check. Two things this join got wrong on
 * inc.148's first live run against the real `crm-build-driver.sh` — consumed lines rescanned as
 * their own logical line (one gate reported as two), and the line number reported as the start of
 * the joined command instead of where the text is actually written — and a second copy is how both
 * would come back on their own schedule.
 */
function logicalLines(source: string): { text: string; lineOf: (index: number) => number }[] {
  const physical = codeLines(source);
  const out: { text: string; lineOf: (index: number) => number }[] = [];
  for (let i = 0; i < physical.length; i++) {
    if (physical[i].trim() === "") continue;
    // `offsets[n]` = index in the joined string at which physical line i+n begins.
    const offsets = [0];
    let text = physical[i];
    while (/\\\s*$/.test(text) && i + offsets.length < physical.length) {
      text = text.replace(/\\\s*$/, " ");
      offsets.push(text.length);
      text += physical[i + offsets.length - 1];
    }
    const first = i;
    out.push({
      text,
      lineOf: (index: number) => {
        let n = 0;
        while (n + 1 < offsets.length && offsets[n + 1] <= index) n++;
        return first + n + 1;
      },
    });
    i += offsets.length - 1;
  }
  return out;
}

/**
 * A wrapper's lines with every comment removed — leading AND trailing (Q84 inc.151).
 *
 * Position is preserved (one entry per physical line, a whole-line comment becomes ""), because
 * every finding this file emits is reported at the line it is written on and an index shift would
 * point Rob at the wrong line of a file he then has to edit by hand.
 *
 * WHY THIS EXISTS AT ALL. Up to inc.150 each scan here filtered `/^\s*#/` — a comment on its OWN
 * line — and read everything else as code. Six scans then looked for six needles (`DRIVER_*=`,
 * `driver-prompt.mjs`, `2>/dev/null`, `audit:clocks`, `date`, `>>` at a Rob-facing surface), and a
 * trailing `# …` note carrying any of them is read as the thing it is a note ABOUT. Both directions
 * are live defects: `node … driver-prompt.mjs "$B"  # was 2>/dev/null` is a permanent false red in
 * front of every increment, and `# see: npm run audit:clocks` on a live line makes the UNWIRED gate
 * (exit 3) report itself as wired — a false green on the rule that enforces all the others.
 *
 * MEASURED BEFORE BUILT, and the honest number is stated: all 31 wrappers in `~/.claude/scripts`
 * were scanned for this shape and NONE has it today. So this hardens against a defect that has not
 * fired yet — bought because a comment is the one edit a human makes without thinking, the failure
 * is silent in both directions, and the fix is a strip the six scans already need to share.
 *
 * `#` ONLY OPENS A COMMENT AT A WORD START, which is shell's rule and not a nicety: `${VAR#pre}`,
 * `$#`, `${#ARR[@]}` and `file#1` all carry a `#` mid-word, and a naive cut at the first one would
 * silently truncate real code — turning this guard into the source of the false readings it exists
 * to prevent. Quote state is tracked for the same reason `redirectTargets` tracks it: a `#` inside
 * an echoed sentence is prose.
 *
 * NOT A SHELL PARSER: a `#` inside a heredoc body is stripped as if it were code. That is inert
 * here — every needle above is a command, and no wrapper in the tree heredocs one — and a real
 * parser would be a far larger surface than the six greps it serves.
 */
function codeLines(source: string): string[] {
  // Quote state RUNS from line to line, because the wrapper's own composer call opens `PROMPT="`
  // on one line and closes it three lines later: judging line 171 alone counts three quotes, calls
  // the note that follows them "quoted", and leaves it in the code. That is not a hypothetical —
  // it is what the first live run of this strip did to the real `crm-build-driver.sh`.
  //
  // Carrying state is safe in the one way that matters: a comment is only ever recognised while
  // UNQUOTED, and its text is dropped before the scan continues, so the apostrophe in
  // `# the council's rules` can never leak into the next line's state.
  const out: string[] = [];
  let state = FRESH;
  for (const line of source.split("\n")) {
    const { code, next } = stripComment(line, state);
    out.push(code);
    state = next;
  }
  return out;
}

/** Quote/substitution state carried between physical lines. `stack` is the `$( … )` nesting. */
type ShellState = { quote: string | null; stack: (string | null)[] };
const FRESH: ShellState = { quote: null, stack: [] };

/**
 * One line with its comment removed, respecting quotes, `$( … )` nesting and shell's word-start
 * rule — returning the state the NEXT line starts in.
 *
 * `$( … )` is a nested context with its OWN quote state, which is shell's actual rule and is
 * load-bearing here rather than pedantry: the composer call is a command substitution written
 * inside a double-quoted assignment, and every quote in it belongs to the inner context. Without
 * the stack the outer `"` never closes and nothing after it is ever seen as code again.
 */
function stripComment(line: string, from: ShellState): { code: string; next: ShellState } {
  let { quote } = from;
  const stack = [...from.stack];
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    // A backslash escapes the next character anywhere except inside single quotes.
    if (ch === "\\" && quote !== "'") {
      i++;
      continue;
    }
    if (quote !== "'" && ch === "$" && line[i + 1] === "(") {
      stack.push(quote);
      quote = null;
      i++;
      continue;
    }
    if (quote === null && ch === ")" && stack.length > 0) {
      quote = stack.pop() ?? null;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    // A word start: the beginning of the line, or preceded by unquoted whitespace.
    if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return { code: line.slice(0, i), next: { quote, stack } };
    }
  }
  return { code: line, next: { quote, stack } };
}

/**
 * Does this command send its stderr to `/dev/null`? (Q84 inc.150)
 *
 * Deliberately narrow: `2>` and `2>>` at `/dev/null`, and `2>&1` only when stdout is ALSO going
 * there — because in the wrapper's actual shape (`PROMPT="$(… )"`) stdout is a capture, and
 * `2>&1` there merges stderr into the captured VALUE rather than discarding it. That is a
 * different defect (a warning line becomes the prompt) and calling it this one would be a guess
 * wearing a finding's clothes.
 */
const discardsStderr = (command: string) =>
  /(?:^|\s)2>>?\s*\/dev\/null/.test(command) ||
  (/(?:^|\s)2>&1/.test(command) && /(?:^|\s)>>?\s*\/dev\/null/.test(command));

/** Does a command word follow this assignment's value, before the next command separator? */
function isCommandPrefix(logical: string, from: number): boolean {
  let quote: string | null = null;
  let token = "";
  const tokens: string[] = [];
  for (let i = from; i < logical.length; i++) {
    const ch = logical[i];
    if (quote) {
      token += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      token += ch;
      continue;
    }
    // A new command starts here, so nothing after it inherits this assignment.
    if (ch === ";" || ch === "&" || ch === "|") break;
    if (/\s/.test(ch)) {
      if (token) tokens.push(token);
      token = "";
      continue;
    }
    token += ch;
  }
  if (token) tokens.push(token);
  // The value itself is tokens[0]; anything after it that is not another assignment is the command.
  return tokens.slice(1).some((t) => t && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(t));
}

function formatsOn(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(QUOTED_FORMAT)) out.push(m[1]);
  for (const m of line.matchAll(BARE_FORMAT)) out.push(m[1]);
  return out;
}

/**
 * Audit shell wrappers for stamps that reach Rob without naming their clock.
 *
 * @param scripts each `{ name, source }`; sources are read by the caller so this stays pure.
 */
export function auditWrapperClocks(scripts: { name: string; source: string }[]): ClockAudit {
  const findings: ClockFinding[] = [];
  const usesRepoStamp: string[] = [];
  const skipped: string[] = [];
  const triggeredBy: string[] = [];
  const unrankedGateVars: GateRankFinding[] = [];
  const strandedGateVars: GateRankFinding[] = [];
  const silencedComposers: SilencedComposerFinding[] = [];
  // Derived from GATE_ORDER through the same `gateEnvVar` the composer uses — a second hand-kept
  // list of names here would be the very drift inc.147 closed, reintroduced by its own check.
  const ranked = new Set(GATE_ORDER.map((g) => gateEnvVar(g.key)));

  for (const { name, source } of scripts) {
    const assignments = driverVarAssignments(source);
    for (const { envVar, line, travels } of assignments) {
      if (travels && !ranked.has(envVar)) unrankedGateVars.push({ script: name, line, envVar });
    }
    // Q84 inc.149 — judged per NAME, not per assignment. A wrapper that computes the value on its
    // own line (`DRIVER_CLOCK_GATE="$(…)"`) and then hands it over on the invocation line is the
    // shape the real driver uses, and it is correct; only a name with NO travelling assignment
    // anywhere in the file is actually stranded. The line reported is the first place it is set,
    // because that is where the author goes to add the export.
    const seen = new Set<string>();
    for (const { envVar, line } of assignments) {
      if (seen.has(envVar) || !ranked.has(envVar)) continue;
      seen.add(envVar);
      if (assignments.some((a) => a.envVar === envVar && a.travels)) continue;
      strandedGateVars.push({ script: name, line, envVar });
    }

    // Q84 inc.150 — the composer call is judged on the JOINED command, because in the real wrapper
    // the redirect and the script name sit on the third physical line of a three-line command
    // while `PROMPT="$(` opens on the first. `logicalLines` already skips comments, so a
    // commented-out invocation cannot be flagged — same rule as the trigger scan below.
    for (const { text, lineOf } of logicalLines(source)) {
      const at = text.indexOf(COMPOSER_CALL);
      if (at === -1 || !discardsStderr(text)) continue;
      silencedComposers.push({ script: name, line: lineOf(at) });
    }

    // A commented-out invocation is not a trigger — it is a note about one, and the whole point
    // of inc.142 was that a rule living in a comment lives nowhere. Since inc.151 that holds for a
    // note at the END of a live line too: this is the one scan whose false reading is a false
    // GREEN — a `# run npm run audit:clocks by hand` would report the unwired gate as wired.
    const code = codeLines(source);
    const invokes = (l: string) => TRIGGER_CALLS.some((needle) => l.includes(needle));
    if (code.some(invokes)) {
      triggeredBy.push(name);
    }

    const surfaces = surfacesWritten(source);
    if (surfaces.length === 0) {
      skipped.push(name);
      continue;
    }
    if (code.some((l) => l.includes(REPO_STAMP_CALL))) usesRepoStamp.push(name);

    code.forEach((line, i) => {
      // A commented-out `date` is documentation of the old defect — inc.140 and inc.141 both left
      // one in place on purpose. Flagging it would punish the comment that explains the fix.
      if (!/\bdate\b/.test(line)) return;
      if (isParseInvocation(line)) return;

      for (const format of formatsOn(line)) {
        if (!statesAnInstant(format) || namesItsZone(format)) continue;
        findings.push({ script: name, line: i + 1, format, surfaces: [...surfaces] });
      }
    });
  }

  return {
    findings,
    usesRepoStamp,
    skipped,
    triggeredBy,
    unrankedGateVars,
    strandedGateVars,
    silencedComposers,
  };
}
