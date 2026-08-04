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
  const unranked = strandedGateSentence(audit) + unrankedGateSentence(audit);

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
  const lines = source.split("\n").filter((l) => !/^\s*#/.test(l));
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
  const physical = source.split("\n");
  // Q84 inc.149 — a bare `export DRIVER_X` (no `=`) on any later line makes an earlier local
  // assignment travel after all. It is ordinary shell and omitting it would put a permanent false
  // red in front of a wrapper that is correct, which is the one failure this gate cannot afford.
  const bareExported = new Set<string>();
  for (const line of physical) {
    if (/^\s*#/.test(line)) continue;
    const m = /^\s*export\s+([A-Za-z_][A-Za-z0-9_ ]*)$/.exec(line.replace(/\s+$/, ""));
    if (!m) continue;
    for (const name of m[1].split(/\s+/)) {
      if (name.startsWith(DRIVER_ENV_PREFIX)) bareExported.add(name);
    }
  }

  // Join backslash continuations: the wrapper spreads one logical command over two lines and the
  // command word (`node …`) sits on the second, so an assignment on the first only looks like a
  // prefix once they are one string. Two things this got wrong on its first live run against the
  // real `crm-build-driver.sh`, and both are why the physical line is tracked rather than assumed:
  //   • the consumed lines must be SKIPPED, or the continuation is scanned a second time as its
  //     own logical line and one gate is reported twice ("2 unranked gates" when there is one);
  //   • the reported line must be the line the assignment is actually WRITTEN on — the author is
  //     going there to fix it — not the line the joined command happens to start at.
  for (let i = 0; i < physical.length; i++) {
    if (/^\s*#/.test(physical[i])) continue;
    // `offsets[n]` = index in `logical` at which physical line i+n begins.
    const offsets = [0];
    let logical = physical[i];
    while (/\\\s*$/.test(logical) && i + offsets.length < physical.length) {
      logical = logical.replace(/\\\s*$/, " ");
      offsets.push(logical.length);
      logical += physical[i + offsets.length - 1];
    }
    const lineOf = (index: number) => {
      let n = 0;
      while (n + 1 < offsets.length && offsets[n + 1] <= index) n++;
      return i + n + 1;
    };

    const assign = new RegExp(`(export\\s+)?(${DRIVER_ENV_PREFIX}[A-Za-z0-9_]+)=`, "g");
    for (const m of logical.matchAll(assign)) {
      const exported = Boolean(m[1]) || bareExported.has(m[2]);
      const travels = exported || isCommandPrefix(logical, m.index + m[0].length);
      out.push({ envVar: m[2], line: lineOf(m.index), travels });
    }
    i += offsets.length - 1;
  }
  return out;
}

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

    // A commented-out invocation is not a trigger — it is a note about one, and the whole point
    // of inc.142 was that a rule living in a comment lives nowhere.
    const invokes = (l: string) => TRIGGER_CALLS.some((needle) => l.includes(needle));
    if (source.split("\n").some((l) => !/^\s*#/.test(l) && invokes(l))) {
      triggeredBy.push(name);
    }

    const surfaces = surfacesWritten(source);
    if (surfaces.length === 0) {
      skipped.push(name);
      continue;
    }
    if (source.includes(REPO_STAMP_CALL)) usesRepoStamp.push(name);

    source.split("\n").forEach((line, i) => {
      // A commented-out `date` is documentation of the old defect — inc.140 and inc.141 both left
      // one in place on purpose. Flagging it would punish the comment that explains the fix.
      if (/^\s*#/.test(line)) return;
      if (!/\bdate\b/.test(line)) return;
      if (isParseInvocation(line)) return;

      for (const format of formatsOn(line)) {
        if (!statesAnInstant(format) || namesItsZone(format)) continue;
        findings.push({ script: name, line: i + 1, format, surfaces: [...surfaces] });
      }
    });
  }

  return { findings, usesRepoStamp, skipped, triggeredBy, unrankedGateVars, strandedGateVars };
}
