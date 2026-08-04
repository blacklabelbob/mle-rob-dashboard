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
import { keySurvivesTransport } from "../flags/ledgerRead";

/** The files Rob actually opens and reads sentences out of. A stamp that lands in one of these is
 *  a stamp a human has to interpret. */
export const ROB_FACING_SURFACES = [
  "PING-INBOX.md",
  "crm-driver.log",
  "meeting-intake.log",
  // Q84 inc.156 — the two the daily brief tells Rob are his source of truth for ranks
  // ("Live ranks: PROJECT-TRACKER.md (synced daily) · Diffs: PROJECT-CHANGELOG.md"). They were
  // absent from this list for one reason: nothing that writes them is a `.sh` file, so listing
  // them would have changed no verdict. That is the blindness, not a justification for it.
  "PROJECT-TRACKER.md",
  "PROJECT-CHANGELOG.md",
] as const;

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
export type ClockGateBrief = { code: 0 | 1 | 2 | 3 | 4; line: string | null };

/**
 * The `--brief` verdict for an audit — the one line that gets prefixed onto the driver's prompt.
 *
 * Pure and tested rather than inlined at the print site, because this text IS the enforcement:
 * it is the whole of what the next increment is told, and inc.143's own first live run proved a
 * gate's wording can be wrong in a way nothing catches (the trigger needle matched one spelling
 * of two). What the shell may still decide on its own is only whether this ran at all.
 */
export function clockGateBrief(
  audit: ClockAudit,
  /**
   * Wrappers the last committed census held that this scan did not see (Q84 inc.159). Defaults to
   * none so every existing caller keeps its exact behaviour; it is a parameter rather than a field
   * on `ClockAudit` because it is not something the audit measured — it comes from disk, and the
   * audit only knows what it was handed.
   */
  departures: CensusDeparture[] = [],
  /**
   * The reason the run REFUSED to write the census this tick, or null when it wrote (Q84 inc.175).
   * Same argument as `departures` for why it is a parameter and not an audit field: it is a fact
   * about a file on disk, not about anything the scan measured.
   */
  censusRefusal: string | null = null,
): ClockGateBrief {
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
  // Q84 inc.155 appends the fourth on the same terms, and after the other three. Those are
  // defects in wrappers this gate READ; this one says the ✓ line does not cover the whole
  // directory. It rides rather than competes for the same reason as its three siblings — the
  // driver hears exactly one `^CLOCK GATE` line per tick, so a ranked loser vanishes.
  // Q84 inc.159 appends the fifth on the same terms, and FIRST among the appended five. Its
  // siblings all describe the scanned set; this one describes a wrapper that is no longer IN the
  // scanned set, which means no other sentence on this line — and no count in the report — can
  // mention it at all. It is also the only one of the five that will never be said twice: the
  // census is rewritten on the same tick, so if this line is dropped the fact is gone for good.
  // Q84 inc.175 appends the sixth on the same terms, and BEFORE the departure sentence — which is
  // the whole point of it. On a refused tick `departures` is empty for a reason that has nothing to
  // do with the tree: the gate could not read what it is supposed to compare against, so the
  // SILENCE of inc.159's sentence stops meaning "no wrapper left" and starts meaning "not measured".
  // Said first because it is the sentence that reinterprets the ones after it.
  //
  // It RIDES rather than taking the line, and that is a measured decision, not deference to
  // precedent. inc.153 takes the line because an unterminated heredoc means the scan itself is
  // incomplete and its ✓ are meaningless. A refused census costs the scan nothing — every wrapper
  // was still read and judged — so taking the line here would delete a real `IS RED` stamp finding
  // to announce a bookkeeping failure, which is exactly the vanishing-finding disease inc.147/148
  // spent two increments killing. What it must NOT do is leave the tick silent, and appending
  // already fixes that: an otherwise-clean run stops returning `{code: 0, line: null}` and speaks.
  const unranked =
    censusRefusalSentence(censusRefusal) +
    departureSentence(departures) +
    strandedGateSentence(audit) +
    unrankedGateSentence(audit) +
    silencedComposerSentence(audit) +
    unjudgedSiblingSentence(audit);

  // Q84 inc.154 — outranks even inc.153's, because it is the case where there was nothing to read
  // AT ALL. inc.153 predicted a false green here (four ✓ over a zero-wrapper scan); measured, that
  // is not what happens — `triggeredBy` is empty too, so it lands on the HAS NO TRIGGER verdict
  // below and goes red. The defect is the DIAGNOSIS, not the colour: that sentence sends the next
  // increment to re-wire a driver tick that is already wired (crm-build-driver.sh:97), and the
  // wrapper it would be told to edit is precisely the one the scan never saw. "I scanned nothing"
  // and "I scanned 31 wrappers and none wires me" are different facts with different fixes.
  if (audit.scriptsSeen === 0) {
    return {
      code: 2,
      line:
        `${BRIEF_MARKER} SCANNED NOTHING — 0 wrappers were handed to it, so the wrapper-clock rule ` +
        "was NOT checked this tick. This is not a finding about any wrapper and not a missing " +
        "trigger: the path it was pointed at holds no `.sh` files. Treat it as unchecked, not as " +
        "clean — find where the wrappers went BEFORE the queue item. Q84 inc.154." +
        unranked,
    };
  }

  // Q84 inc.153 — the ONE finding that takes the line instead of riding it. Every other verdict
  // below reports what the scans SAW; this one says the scans saw a blank file and any ✓ they
  // produced for it is meaningless. Reporting "clean" first and appending this as a suffix would
  // be the false green the increment exists to remove.
  if (audit.unreadable.length > 0) {
    const first = audit.unreadable[0];
    const n = audit.unreadable.length;
    return {
      code: 1,
      line:
        `${BRIEF_MARKER} COULD NOT READ ${n} wrapper${n === 1 ? "" : "s"} — ` +
        `${first.script}:${first.line} opens a heredoc \`${first.word}\` that never terminates, so ` +
        "every line below it was read as body and NOTHING in that file was judged. Any ✓ for it is " +
        "meaningless. Fix the delimiter, then re-run `npm run audit:clocks`. Q84 inc.153." +
        unranked,
    };
  }

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

/**
 * The suffix sentence for executable siblings the gate never opened (Q84 inc.155).
 *
 * Says "not judged", never "wrong": the detector below reads `date '+FMT'`, so it has no opinion
 * about a Python or Ruby stamp and must not imply one. What it does state is that the ✓ lines are
 * scoped to `*.sh` — which, measured on the live tree, is the difference between a clean report
 * and an unlabeled `%Y-%m-%d %H:%M` reaching PROJECT-TRACKER.md every day.
 */
function unjudgedSiblingSentence(audit: ClockAudit): string {
  const files = audit.unjudged;
  if (files.length === 0) return "";
  return (
    ` ${files.length} executable sibling${files.length === 1 ? "" : "s"} in the scanned directory ` +
    `${files.length === 1 ? "was" : "were"} NOT JUDGED — ${files.join(", ")}. This gate reads ` +
    "`*.sh` only, so the ✓ above covers the shell wrappers and nothing else; these run on the " +
    "same machine, at the same cadence, into the same files Rob reads. Not a claim that they are " +
    "wrong — a statement that nobody looked (Q84 inc.155)."
  );
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
  /**
   * Why this format is unreadable when the format itself LOOKS compliant (Q84 inc.156).
   *
   * Only Python sets it, and only for the trap that would otherwise make the obvious fix a false
   * green: `datetime.now()` is naive, so `%Z` on it renders the EMPTY STRING. A stamp that passes
   * `namesItsZone` and prints nothing is worse than one that never claimed a zone, so the finding
   * has to say which of the two it is.
   */
  note?: string;
};

/** A `DRIVER_*` gate a wrapper actually hands to the driver that `GATE_ORDER` does not rank. */
export type GateRankFinding = {
  script: string;
  /** 1-indexed line of the assignment, counting the wrapper's PHYSICAL lines. */
  line: number;
  /** The env var exactly as the wrapper spells it — what the author greps for. */
  envVar: string;
};

/**
 * A wrapper this parse could not finish reading (Q84 inc.153).
 *
 * The heredoc opened on `line` with delimiter `word` never terminates, so every line below it was
 * read as body. This is the ONE finding that invalidates the other scans for that file rather than
 * adding to them: they were handed blanks, and blanks look exactly like a compliant wrapper.
 */
export type UnreadableScriptFinding = {
  script: string;
  /** 1-indexed PHYSICAL line the unterminated heredoc was opened on. */
  line: number;
  /** The delimiter shell is still waiting for — usually one character off from the one written. */
  word: string;
  /**
   * WHICH construct swallowed the rest of the file (Q84 inc.156).
   *
   * Carried because the fix sentence is language-specific and a report that tells a Python author
   * to close a heredoc is a report they will not act on. The two are the same defect — everything
   * below the opener read as body — so they share an array and an exit code, not a wording.
   */
  kind: "heredoc" | "triple-quote";
};

/** A wrapper that runs the prompt composer with its diagnostics thrown away (Q84 inc.150). */
export type SilencedComposerFinding = {
  script: string;
  /** 1-indexed PHYSICAL line the composer call is written on — where the author goes to fix it. */
  line: number;
};

export type ClockAudit = {
  /**
   * How many wrappers this audit was handed, before any of them were judged (Q84 inc.154).
   *
   * Every other count here is derived from what the scans SAW; this one records whether there was
   * anything to see. Zero is the one input that makes all of them agree with a healthy tree —
   * no findings, no unranked gates, nothing unreadable — while having checked nothing at all.
   */
  scriptsSeen: number;
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
  /**
   * Wrappers this parse could not finish reading (Q84 inc.153).
   *
   * Unlike every other array here, a non-empty `unreadable` does not mean "these wrappers are
   * wrong" — it means the rest of THIS REPORT is not trustworthy for those files. So it outranks
   * the clean verdict rather than riding it as a suffix.
   */
  unreadable: UnreadableScriptFinding[];
  /**
   * Executable siblings in the scanned directory that this gate cannot judge (Q84 inc.155).
   *
   * `unreadable` is a file this parse STARTED and could not finish. This is the file it never
   * opened: `collect()` takes `*.sh`, and every ✓ below is then printed over a directory that
   * also holds executables in other languages. Measured on the live tree, that silence is not
   * theoretical — `project-tracker.py:88` mints `datetime.now().strftime("%Y-%m-%d %H:%M")`,
   * no zone, and writes it into `PROJECT-TRACKER.md` and `PROJECT-CHANGELOG.md`, both files the
   * daily brief points Rob at. That is the exact defect inc.139/140/141 fixed by hand and inc.142
   * built this gate to stop, sitting one filename extension outside its reach.
   *
   * Named rather than judged, deliberately: the finding detector reads `date '+FMT'`, which is
   * shell. Reporting a Python stamp as compliant because no `date` call appears in it would be a
   * worse lie than the current silence. So the honest output is the file name and "not judged".
   */
  unjudged: string[];
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
  const lines = codeLines(source).code;
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
  const physical = codeLines(source).code;
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
  const physical = codeLines(source).code;
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
 * HEREDOC BODIES ARE DATA, AND THE STATE IS BOUNDED AT THE TERMINATOR (Q84 inc.152). inc.151 wrote
 * that a `#` in a heredoc body is stripped as if it were code and called the case inert because
 * "no wrapper in the tree heredocs one." MEASURED: 7 of the 31 wrappers heredoc — and the leak is
 * live, not hypothetical. `hold-signal.sh` heredocs the hold text, whose line 48 reads
 * `(Rob rule #2: listen in pieces …)` — cut at `#2` as a comment — and whose line 49 says
 * `Rob's next message`, an apostrophe that opens a single quote **the rest of the file never
 * closes**. Every line after that terminator is then read as quoted, so no comment is stripped
 * again: inc.151's fix silently stops applying halfway down a real wrapper.
 *
 * SO A BODY NEITHER CUTS NOR CARRIES. Its `#` is not a comment and its `'` is not a quote, and the
 * state resumes at the terminator exactly as it entered — which is shell's rule.
 *
 * THE BODY TEXT IS STILL RETURNED, DELIBERATELY. Skipping bodies would be the easier change and it
 * would be a FALSE GREEN: `mission-control-reporter.sh` writes `"$(date -u …)"` from inside an
 * UNQUOTED heredoc into a file, so that stamp genuinely reaches disk and must stay judged. Bodies
 * are data for the purpose of comments and quotes, not for the purpose of what they write.
 *
 * STILL NOT A SHELL PARSER: `<<` inside a body-that-is-itself-data, or a delimiter built by
 * expansion (`<<$X`), is not modelled. Neither shape exists in the tree, and both would fail
 * toward the pre-inc.152 behaviour rather than toward a new blind spot — and as of inc.153 they no
 * longer fail SILENTLY: an opener whose terminator never arrives is reported, not swallowed.
 *
 * MEASURED, inc.152's named next answered: a line that opens a heredoc AND opens a multi-line
 * quote would be missed by the `state.quote === null` guard below. Across all 31 wrappers there
 * are 7 heredoc openers and ZERO write that shape — `daily-driver.sh:178` is the near miss, and it
 * CLOSES a carried quote before its `<<'APPLESCRIPT'` rather than opening one. So the guard stays
 * as written (misreading a quoted `<<` swallows a file, which is the worse direction), and the
 * increment went to the swallow that IS reachable today.
 */
function codeLines(source: string): { code: string[]; unterminated: { word: string; line: number } | null } {
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
  // Delimiters still awaiting their terminator, in the order shell will close them: one command
  // may open several (`cmd <<A <<B`), and each body ends at its own word.
  let pending: HeredocOpener[] = [];
  let openedAt = 0; // 1-indexed line the still-open heredoc was opened on
  let depth = 0; // `$( … )` nesting carried across the body lines of one heredoc
  const lines = source.split("\n");
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (pending.length > 0) {
      const [open, ...rest] = pending;
      const candidate = open.stripTabs ? line.replace(/^\t+/, "") : line;
      if (candidate === open.word) {
        pending = rest;
        depth = 0;
        out.push(line);
        continue;
      }
      // The body neither cuts nor carries state. What survives is exactly what shell EXECUTES:
      // the command substitutions in an unquoted body, and nothing at all in a quoted one.
      const kept = open.expands ? substitutionsOnly(line, depth) : { code: "", depth: 0 };
      out.push(kept.code);
      depth = kept.depth;
      continue;
    }
    const { code, next } = stripComment(line, state);
    out.push(code);
    state = next;
    // Only a line that ENDS outside every quote can have opened a heredoc: `echo "a << b"` is a
    // string, and treating it as an opener would swallow the rest of the file as a body — the
    // worst failure available here, since a swallowed line is never judged at all.
    pending = state.quote === null && state.stack.length === 0 ? heredocOpeners(code) : [];
    if (pending.length > 0) openedAt = n + 1;
  }
  // A heredoc whose terminator never arrives means every line below it was read as body and
  // blanked — so the scans below judge NOTHING from here down and report a clean ✓ (Q84 inc.153).
  // PROVEN on a copy of the real `crm-build-driver.sh`: insert one `cat <<NOTES_END` at line 12
  // and a live unranked-gate finding goes 1 → 0 while `usesRepoStamp` flips true → false, all at
  // exit 0. The cause is ordinary — a delimiter typo, or a shape this file does not model
  // (`<<END-OF-TEXT` matches only `END`, `<<$X` not at all) — and both fail in this same direction.
  // It is NOT re-scanned as code: that would resurrect the false reds inc.151/inc.152 removed. The
  // parse says what it could not read and lets the caller refuse to go green on it.
  return { code: out, unterminated: pending.length > 0 ? { word: pending[0].word, line: openedAt } : null };
}

/**
 * The heredocs a code line opens, in the order shell closes them (Q84 inc.152).
 *
 * `<<<` IS NOT ONE — it is a here-STRING, entirely on its own line, and two wrappers use it
 * (`prd-autosave.sh`, `prd-realtime.sh` both end a loop with `done <<< "$MATCHED"`). Reading one
 * as a heredoc would leave a body open with no terminator and blind the scans to every line below
 * it, so the `<` that follows is rejected rather than tolerated.
 *
 * `<<-WORD` strips LEADING TABS from the terminator (not spaces — shell's rule, and the
 * difference is why the flag is carried rather than assumed). A quoted delimiter (`<<'EOF'`) only
 * changes whether the BODY expands, which this file does not model, so both forms end the same way.
 */
function heredocOpeners(code: string): HeredocOpener[] {
  const out: HeredocOpener[] = [];
  const opener = /<<(-?)\s*(?:'([^']+)'|"([^"]+)"|(\\?)([A-Za-z_][A-Za-z0-9_]*))/g;
  for (const m of code.matchAll(opener)) {
    // `<<<` is a here-STRING, and it must be rejected from BOTH sides: the scan also finds the
    // second and third `<` as a pair, which is how `done <<< "$MATCHED"` read as a heredoc named
    // `$MATCHED` — an opener with no terminator, blinding every line below it.
    if (code[m.index + 2] === "<" || code[m.index - 1] === "<") continue;
    const word = m[2] ?? m[3] ?? m[5];
    if (!word) continue;
    // ANY quoting of the delimiter — `'EOF'`, `"EOF"` or `\EOF` — turns the body into literal
    // text shell never expands. That is the whole difference between `hold-signal.sh`'s prose and
    // `mission-control-reporter.sh`'s `$(date …)`, so it is read off the delimiter, not guessed.
    out.push({ word, stripTabs: m[1] === "-", expands: m[2] === undefined && m[3] === undefined && m[4] !== "\\" });
  }
  return out;
}

type HeredocOpener = { word: string; stripTabs: boolean; expands: boolean };

/**
 * A heredoc body line reduced to the command substitutions inside it, position preserved.
 *
 * An unquoted body is data with holes: `{ "at": "$(date '+%F')" }` writes prose AND runs `date`.
 * Blanking the whole line would be a false green on a stamp that genuinely reaches disk; keeping
 * the whole line reads the prose as commands. Only what runs is kept, and non-substitution text
 * becomes spaces so every column — and therefore every reported line — still lines up.
 */
function substitutionsOnly(line: string, from: number): { code: string; depth: number } {
  let depth = from;
  let code = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "$" && line[i + 1] === "(") {
      depth++;
      code += "  ";
      i++;
      continue;
    }
    if (ch === ")" && depth > 0) {
      depth--;
      code += " ";
      continue;
    }
    code += depth > 0 ? ch : " ";
  }
  return { code, depth };
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

/**
 * Which reader can judge a file (Q84 inc.156).
 *
 * Dispatch is by SHEBANG first, extension second — the reverse of what `collect()` used to do, and
 * the reason inc.155 had three files to name. `daily-driver.sh.bak-2026-07-17` is shell that no
 * extension test matches; `judge-cover.py` is Python that an extension test matches and the shell
 * parser would then read wrongly. The line that says how the kernel will run the file is the only
 * one that answers "what language is this".
 */
export type ScriptLanguage = "shell" | "python" | "unknown";
export function languageOf(name: string, source: string): ScriptLanguage {
  const shebang = source.startsWith("#!") ? source.slice(0, source.indexOf("\n") + 1 || undefined) : "";
  if (shebang) {
    if (/\bpython[0-9.]*\b/.test(shebang)) return "python";
    if (/\b(ba|z|k|da)?sh\b/.test(shebang)) return "shell";
    return "unknown";
  }
  if (name.endsWith(".py")) return "python";
  if (name.endsWith(".sh")) return "shell";
  return "unknown";
}

/**
 * Python source with its comments removed, one output line per physical line.
 *
 * Deliberately NOT the shell reader with different needles. Three of Python's rules differ in ways
 * that decide findings: a triple-quoted block runs nothing and must be blanked (shell's unquoted
 * heredoc still executes `$( )`, which inc.152 had to preserve); an unclosed single-quote is a
 * syntax error that cannot carry to the next line, so state is reset at every newline (carrying it
 * is exactly the bug inc.152 found in the shell path); and `#` is a comment in both, which is the
 * only rule that survives being borrowed.
 *
 * String CONTENT is kept, unlike the surface scan's needs — the format being judged lives inside a
 * string literal, so stripping literals would delete the evidence.
 */
export function pythonCodeLines(source: string): {
  code: string[];
  unterminated: { word: string; line: number } | null;
} {
  const out: string[] = [];
  let triple: string | null = null;
  let tripleLine = 0;
  const raws = source.split("\n");
  for (let n = 0; n < raws.length; n++) {
    const raw = raws[n];
    let kept = "";
    let i = 0;
    while (i < raw.length) {
      if (triple) {
        const end = raw.indexOf(triple, i);
        if (end === -1) {
          i = raw.length;
          break;
        }
        i = end + 3;
        triple = null;
        continue;
      }
      const three = raw.slice(i, i + 3);
      if (three === '"""' || three === "'''") {
        triple = three;
        tripleLine = n + 1;
        kept += three;
        i += 3;
        continue;
      }
      const ch = raw[i];
      if (ch === "#") break; // comment — and a `#` inside a literal never reaches here
      kept += ch;
      i++;
      if (ch === '"' || ch === "'") {
        // Consume the literal whole, so a `#` or a quote inside it decides nothing.
        while (i < raw.length && raw[i] !== ch) {
          if (raw[i] === "\\") {
            kept += raw[i];
            i++;
          }
          if (i < raw.length) {
            kept += raw[i];
            i++;
          }
        }
        if (i < raw.length) {
          kept += raw[i];
          i++;
        }
      }
    }
    out.push(kept);
  }
  return { code: out, unterminated: triple ? { word: triple, line: tripleLine } : null };
}

/** `strftime("%Y-%m-%d %H:%M")` — the format is a literal argument, quoted either way. */
const PY_STRFTIME = /strftime\(\s*(['"])((?:[^'"\\]|\\.)*)\1/g;

/**
 * A clock read with no zone attached — `datetime.now()` / `datetime.utcnow()` bare.
 *
 * `.astimezone()` and any `tz=`/`timezone` argument make it aware, and an aware object is the ONLY
 * one whose `%Z` prints anything. Python renders `%Z` on a naive datetime as the empty string —
 * silently, with no error — so this is the difference between a fix and a fix-shaped no-op.
 */
const PY_NAIVE_CLOCK = /datetime\.(?:utcnow\(\s*\)|now\(\s*\))(?!\s*\.astimezone)/;
const PY_AWARE_HINT = /\.astimezone\(|\btz\s*=|\btimezone\b|\bZoneInfo\b/;

/**
 * Which of Rob's surfaces a Python script WRITES to.
 *
 * Same shape as the shell scan and the same one level of indirection — `TRACKER_MD = MEM /
 * "PROJECT-TRACKER.md"` fifty lines above `TRACKER_MD.write_text(...)`. What differs is what counts
 * as a write: `open(PATH)` defaults to READ, so a mode argument is required before it counts, or
 * the same "reading a surface proves nothing" rule inc.142 wrote would be broken by its own port.
 */
function pythonSurfacesWritten(source: string): string[] {
  const lines = pythonCodeLines(source).code;
  return ROB_FACING_SURFACES.filter((surface) => {
    const held = new Set<string>();
    for (const line of lines) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
      if (m && line.includes(surface)) held.add(m[1]);
    }
    const names = [...held];
    return lines.some((line) => {
      const namesTarget =
        line.includes(surface) || names.some((v) => new RegExp(`\\b${v}\\b`).test(line));
      if (!namesTarget) return false;
      if (/\.write_text\(|\.write_bytes\(/.test(line)) return true;
      return /\bopen\([^)]*["'][aw]/.test(line);
    });
  });
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
 * @param unjudged names of executable siblings this gate cannot read (Q84 inc.155). Carried
 *   through rather than computed here for the same reason `scripts` is: deciding which files
 *   exist is I/O, and this function is the part that must stay testable without a filesystem.
 */
export function auditWrapperClocks(
  scripts: { name: string; source: string }[],
  unjudged: string[] = [],
): ClockAudit {
  const findings: ClockFinding[] = [];
  const usesRepoStamp: string[] = [];
  const skipped: string[] = [];
  const triggeredBy: string[] = [];
  const unrankedGateVars: GateRankFinding[] = [];
  const strandedGateVars: GateRankFinding[] = [];
  const silencedComposers: SilencedComposerFinding[] = [];
  const unreadable: UnreadableScriptFinding[] = [];
  // Copied, not mutated in place: a caller's array is its own, and this list now grows from two
  // sources — files the caller could not read, and files this function has no reader for.
  const unjudgedNames = [...unjudged];
  // Derived from GATE_ORDER through the same `gateEnvVar` the composer uses — a second hand-kept
  // list of names here would be the very drift inc.147 closed, reintroduced by its own check.
  const ranked = new Set(GATE_ORDER.map((g) => gateEnvVar(g.key)));

  for (const { name, source } of scripts) {
    const language = languageOf(name, source);
    if (language === "unknown") {
      // Handed to this gate but in a language it has no reader for. Named, never counted clean —
      // inc.155's whole finding was that silence here reads as coverage.
      if (!unjudgedNames.includes(name)) unjudgedNames.push(name);
      continue;
    }
    if (language === "python") {
      const parsed = pythonCodeLines(source);
      if (parsed.unterminated) {
        unreadable.push({
          script: name,
          line: parsed.unterminated.line,
          word: parsed.unterminated.word,
          kind: "triple-quote",
        });
      }
      const code = parsed.code;
      if (code.some((l) => TRIGGER_CALLS.some((needle) => l.includes(needle)))) triggeredBy.push(name);

      const surfaces = pythonSurfacesWritten(source);
      if (surfaces.length === 0) {
        skipped.push(name);
        continue;
      }
      if (code.some((l) => l.includes(REPO_STAMP_CALL))) usesRepoStamp.push(name);

      code.forEach((line, i) => {
        for (const m of line.matchAll(PY_STRFTIME)) {
          const format = m[2];
          if (!statesAnInstant(format)) continue;
          const naive = PY_NAIVE_CLOCK.test(line) && !PY_AWARE_HINT.test(line);
          if (namesItsZone(format) && !naive) continue;
          findings.push({
            script: name,
            line: i + 1,
            format,
            surfaces: [...surfaces],
            note: namesItsZone(format)
              ? "names %Z, but reads a NAIVE datetime — Python renders %Z on it as the empty " +
                "string, so this prints no zone at all. Fix the clock, not the format: " +
                "datetime.now().astimezone()."
              : undefined,
          });
        }
      });
      continue;
    }

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
    const parsed = codeLines(source);
    // Q84 inc.153 — say so BEFORE using the parse. Every scan below this line reads `code`, and a
    // swallowed file hands them blanks that look exactly like a clean wrapper.
    if (parsed.unterminated) {
      unreadable.push({
        script: name,
        line: parsed.unterminated.line,
        word: parsed.unterminated.word,
        kind: "heredoc",
      });
    }
    const code = parsed.code;
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
    scriptsSeen: scripts.length,
    findings,
    usesRepoStamp,
    skipped,
    triggeredBy,
    unrankedGateVars,
    strandedGateVars,
    silencedComposers,
    unreadable,
    unjudged: unjudgedNames,
  };
}

/**
 * What this gate saw, in a shape that can be committed (Q84 inc.158).
 *
 * WHY THIS IS AN INVENTORY AND NOT A FINGERPRINT OF THE STAMPS. The obvious version of "commit
 * what the gate passed" is the stamp lines themselves. That version is worth nothing and costs
 * noise: the gate RE-READS and RE-JUDGES every wrapper on every driver tick, so a stamp that
 * regresses is already caught live and loudly — while a recorded copy of those lines would churn
 * on every unrelated edit near them until the diff is muted as routine.
 *
 * What the live gate genuinely cannot notice is a wrapper that stops being SEEN. Every count it
 * prints is derived from what `collect()` found, so a wrapper that is deleted, renamed, or loses
 * the exec bit that got it collected simply drops out of the total and the run still prints four
 * ✓. `project-tracker.py` is the live example: it is not `*.sh`, so its exec bit is the entire
 * reason it is judged at all — `chmod -x` on it silently ends both its clock coverage and Rob's
 * daily-brief refresh, and nothing in this repo or that directory would say a word. Those
 * wrappers are machine-local and untracked, so git cannot see the change either.
 *
 * So the census records ROLE, not content: who exists, what language they are read as, whether
 * they are executable, and what this gate does with each. It changes when the SET of wrappers or
 * one wrapper's relationship to Rob's surfaces changes — which is exactly the event that has no
 * other witness.
 *
 * DELIBERATELY NO TIMESTAMP. A generated-at line would make every tick a diff, which would defeat
 * the one property that makes this readable: a diff here means something actually changed.
 */
export type WrapperCensusRow = {
  name: string;
  /** As `languageOf` read it — `unknown` is why a row can be `unjudged`. */
  language: ScriptLanguage;
  executable: boolean;
  /**
   * What the gate did with it. `judged` = read and held to the clock rule; `skipped` = read, but
   * writes to none of Rob's surfaces; `unjudged` = never read (no reader for its language).
   */
  role: "judged" | "skipped" | "unjudged";
  /** Asks the repo for its stamp — the compliant shape, and a thing worth noticing the loss of. */
  repoStamp: boolean;
  /** Runs this gate. If every `true` here disappears, the rule is unenforced (inc.143). */
  triggersGate: boolean;
};

export type WrapperCensus = {
  wrappers: WrapperCensusRow[];
  /**
   * Departures already filed to Rob's ledger, carried so the gate can CORRECT a row it wrote
   * (Q84 inc.162). Absent on a census written before inc.162, which reads as "none recorded" —
   * the gate then corrects nothing until the next departure files a key it can vouch for.
   */
  openDepartures?: OpenDeparture[];
};

export function wrapperCensus(
  audit: ClockAudit,
  entries: { name: string; source: string; executable: boolean }[],
): WrapperCensus {
  const skipped = new Set(audit.skipped);
  const unjudged = new Set(audit.unjudged);
  const repoStamp = new Set(audit.usesRepoStamp);
  const triggers = new Set(audit.triggeredBy);

  const wrappers = entries
    .map(({ name, source, executable }) => ({
      name,
      language: languageOf(name, source),
      executable,
      // Order matters: a file with no reader is never "skipped" — skipping is a judgement that it
      // touches none of Rob's surfaces, and that judgement was never made for an unread file.
      role: unjudged.has(name) ? "unjudged" : skipped.has(name) ? "skipped" : "judged",
      repoStamp: repoStamp.has(name),
      triggersGate: triggers.has(name),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return { wrappers } as WrapperCensus;
}

/**
 * A wrapper the last committed census held that this scan never saw (Q84 inc.159).
 *
 * The role it USED to have, not a role it has now — there is nothing to measure any more. That is
 * the whole point: every number this gate prints is derived from what `collect()` found, so a
 * wrapper that stops being collected leaves the totals silently smaller and the run still prints
 * four ✓. inc.157 did exactly that to `daily-driver.sh.bak-2026-07-17` with a `chmod -x` and
 * nothing said a word; inc.158 wrote the census so the change would at least be IN a diff.
 */
export type CensusDeparture = {
  name: string;
  wasRole: WrapperCensusRow["role"];
  /** It ran this gate. If it was the last one, the rule is unenforced from this tick onward. */
  wasTrigger: boolean;
  /** It asked the repo for its stamp — the compliant shape, and the loss is worth naming. */
  wasRepoStamp: boolean;
};

/**
 * Q84 inc.159 — what the last census holds that this scan does not.
 *
 * DEPARTURES ONLY, DELIBERATELY. A wrapper whose role CHANGED is still in the set: this gate
 * re-reads and re-judges it on every tick, so a regression in what it does is already caught live
 * (inc.158's reasoning for not storing stamp text). A wrapper that is GONE is the case no live
 * judgement can reach, because there is nothing left to judge.
 *
 * ARRIVALS ARE NOT REPORTED. A new wrapper is judged by this gate on the very tick it appears —
 * it lands in `scanned`, `skipped` or `unjudged` and every existing sentence already covers it.
 * Saying "new file" on top of that would be noise on the one event that is already loud.
 *
 * `previous` is null on the first run after the census exists — no record is not a departure, and
 * inventing one would make this gate's own arrival look like a loss.
 */
export function censusDepartures(
  previous: WrapperCensus | null,
  current: WrapperCensus,
): CensusDeparture[] {
  if (!previous) return [];
  const present = new Set(current.wrappers.map((w) => w.name));
  return previous.wrappers
    .filter((w) => !present.has(w.name))
    .map((w) => ({
      name: w.name,
      wasRole: w.role,
      wasTrigger: w.triggersGate,
      wasRepoStamp: w.repoStamp,
    }));
}

/**
 * The suffix sentence for departed wrappers (Q84 inc.159).
 *
 * It states the loss and REFUSES to state a cause. A wrapper leaves the scanned set by being
 * deleted, renamed, or stripped of the exec bit that got it collected, and from here those three
 * are indistinguishable — the file this gate would have to stat is, by definition, not there under
 * that name. Naming one of the three would be a guess, and the queue's own rule is to report what
 * cannot be explained rather than guess it.
 *
 * A departure that was `judged` or that ran this gate is called out by name, because those two are
 * the losses that change what is enforced from this tick onward rather than merely what is
 * counted.
 */
/**
 * Q84 inc.175 — the tick where this gate knowingly tracked nothing, said in the one place the
 * driver listens.
 *
 * inc.174 made a corrupt census refuse to be overwritten, and reported that on a `→ census:` stderr
 * line. The driver filters this gate's stderr with `grep '^CLOCK GATE'`, so that line is dropped
 * before it reaches any prompt: the next increment was told the gate was CLEAN on the exact tick
 * the gate had stopped tracking every departure row it is still correcting on Rob's ledger. The
 * refusal is the right disposition; being unheard is not part of it.
 */
function censusRefusalSentence(reason: string | null): string {
  if (!reason) return "";
  return (
    ` THE WRAPPER CENSUS WAS NOT WRITTEN — it is present and unreadable (${reason}), so ` +
    `it was left exactly as found rather than overwritten with a record carrying zero open rows ` +
    `(Q84 inc.174). Two things follow and neither is visible anywhere else: no departure can be ` +
    `detected this tick, so the absence of a departure line above means NOT MEASURED, not "nothing ` +
    `left"; and every departure key this gate has filed on Rob's ledger is going uncorrected until ` +
    `the file is repaired. The stamp findings on this line were still measured normally. Repair ` +
    `\`docs/integrity/wrapper-census.json\` BEFORE trusting a clean verdict from this gate ` +
    `(Q84 inc.175).`
  );
}

function departureSentence(departures: CensusDeparture[]): string {
  if (departures.length === 0) return "";
  const named = departures
    .map((d) => `${d.name} (was ${d.wasRole}${d.wasTrigger ? ", ran this gate" : ""})`)
    .join(", ");
  const n = departures.length;
  const lost = departures.filter((d) => d.wasRole === "judged" || d.wasTrigger);
  return (
    ` ${n} wrapper${n === 1 ? "" : "s"} the last census held ${n === 1 ? "is" : "are"} GONE FROM ` +
    `THE SCAN — ${named}. Deleted, renamed, or stripped of the exec bit that got it collected: ` +
    `this gate cannot tell which, and does not guess. ` +
    (lost.length > 0
      ? `${lost.length} of them ${lost.length === 1 ? "was" : "were"} covered by the ✓ lines ` +
        `until this tick, so that coverage is now smaller and no other number here says so. `
      : "") +
    `Confirm it was meant, or find where it went — the census is rewritten this same run, so this ` +
    `is the only tick that will say it (Q84 inc.159).`
  );
}

/**
 * What a read of the committed census MEANS, before anything is written back (Q84 inc.174).
 *
 * WHY THIS IS A DISPOSITION AND NOT A BOOLEAN. inc.159's seam collapses three different facts into
 * one `previous = null`: the file has never existed, the file exists and cannot be parsed, and the
 * file parses into a shape this gate does not recognise. That collapse is defensible for the
 * DEPARTURE count — the comment there is right that a bad parse must not become 33 false findings —
 * and it is exactly wrong for what happens next: the run then OVERWRITES the file it could not
 * read. Every row in `openDepartures` is a key this gate filed to Rob's ledger and is still
 * correcting, and a null previous means the rewrite carries none of them. That is inc.163's harm —
 * dropping a key is the harm — applied to the whole file at once, and silently.
 *
 * SO THE FIRST RUN IS SEPARATED FROM THE CORRUPT ONE, because they are opposite. An absent file
 * has nothing to lose and writing it is the first record. A PRESENT file that cannot be read is
 * the only evidence of what the gate has published, and overwriting it destroys that evidence for
 * good — the census is rewritten on the same tick that reads it, so there is no second chance.
 *
 * WHICH FIELDS DECIDE THIS, MEASURED THE SAME WAY inc.173 MEASURED ITS OWN (can it change what the
 * gate does or publishes?):
 *   • `wrappers` not an array — every departure is computed from it, so a wrong shape here silently
 *     reports no departures at all.
 *   • `openDepartures` PRESENT and not an array — read downstream with an `Array.isArray` guard
 *     that falls back to `[]`, i.e. every tracked row is forgotten and the rewrite makes that
 *     permanent. Its ABSENCE is legitimate and stays legitimate: a census written before inc.162
 *     has no such key, and treating that as corruption would freeze this gate on a real tree.
 *   • Anything else in the file is not read here and does not get a vote.
 *
 * Pure per CR-3: it is handed bytes and returns a verdict. The caller does the I/O and owns the
 * refusal.
 */
export type CensusRead =
  | { disposition: "first-run"; census: null }
  | { disposition: "readable"; census: WrapperCensus }
  | { disposition: "corrupt"; census: null; reason: string };

export function classifyCensusRead(file: { missing: boolean; text: string | null }): CensusRead {
  if (file.missing) return { disposition: "first-run", census: null };
  const text = file.text ?? "";
  // A zero-byte file is the signature of a truncated write, which is the loss this exists for —
  // it is present, so it is not a first run, and it says nothing, so it cannot be trusted.
  if (text.trim() === "") {
    return { disposition: "corrupt", census: null, reason: "the file is present but empty (0 bytes of JSON)" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      disposition: "corrupt",
      census: null,
      reason: `it is not JSON (${err instanceof Error ? err.message : String(err)})`,
    };
  }
  const record = parsed as { wrappers?: unknown; openDepartures?: unknown } | null;
  if (!Array.isArray(record?.wrappers)) {
    return {
      disposition: "corrupt",
      census: null,
      reason: `\`wrappers\` is ${JSON.stringify(record?.wrappers)}, not an array`,
    };
  }
  if (record.openDepartures !== undefined && !Array.isArray(record.openDepartures)) {
    return {
      disposition: "corrupt",
      census: null,
      reason: `\`openDepartures\` is ${JSON.stringify(record.openDepartures)}, not an array — every row this gate is still correcting lives there`,
    };
  }
  return { disposition: "readable", census: record as WrapperCensus };
}

/**
 * The two departures that change what is ENFORCED rather than what is counted (Q84 inc.160), and
 * therefore the only two that reach Rob's ledger. Shared so a correction can never be filed for a
 * key the departure pass would not have filed in the first place.
 */
const isFiled = (d: CensusDeparture): boolean => d.wasRole === "judged" || d.wasTrigger;

/**
 * Who runs this gate, excluding one name.
 *
 * A departed wrapper cannot count as its own replacement even if a stale caller passed the
 * pre-departure list — and a wrapper whose NAME has come back cannot either, because inc.161
 * established the gate cannot prove it is the same wrapper.
 */
const enforcersOtherThan = (name: string, triggeredBy: string[]): string[] =>
  triggeredBy.filter((n) => n !== name);

/** The shape `POST /api/admin/flags` takes. `dedupeKey` makes a re-file CORRECT its row, not stack. */
export type DepartureFinding = {
  entityName: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  dedupeKey: string;
};

/**
 * Q84 inc.160 — the departures that get a durable row on Rob's page, and the ones that stay in
 * stderr.
 *
 * inc.159 named the open question and it is answered YES, narrowly. The objection was real —
 * `/api/admin/flags` is Rob's CRM ledger and an exec bit on a shell script is machine-local
 * bookkeeping — but it does not survive the one property that makes this finding different from
 * every other line this gate prints. Every other finding is RE-DERIVED from the current tree on
 * every tick: unfix it and it comes back, so stderr is a sufficient home for it. The departure is
 * the opposite. `writeCensus()` rewrites the census in the same run that reports the loss, so the
 * next tick has nothing to compare against and exits 0 — the finding is structurally unrepeatable,
 * and a finding that is said once and nowhere else is a finding that depends on a human happening
 * to read one tick's stderr. That is the exact failure inc.157 demonstrated in this very file: the
 * increment that stripped a wrapper's exec bit was the party best placed to notice, and did not.
 *
 * NARROWLY, because the objection is right about everything else. Only a departure that was
 * `judged` or that RAN this gate is filed: those two change what is ENFORCED from this tick onward.
 * A `skipped` or `unjudged` wrapper leaving changes a count and nothing else, and putting that on
 * the page Rob reads for money and meeting conflicts is how a ledger becomes a log nobody reads.
 *
 * ONE ROW PER WRAPPER, keyed by name. Two wrappers leaving in one tick are two separate things to
 * confirm; the same wrapper leaving, being restored, and leaving again is ONE row corrected twice.
 *
 * SEVERITY IS NOT A GUESS. A wrapper that ran this gate is `high` — if it was the last one, the
 * clock rule is unenforced from this tick and nothing else will say so. Anything else judged is
 * `medium`: coverage shrank, enforcement did not stop.
 *
 * PURE per CR-3 — no clock, no network, no `process.env`. The caller does the POST and decides what
 * a failed POST costs.
 *
 * Q84 inc.161 answers the two things inc.160 left standing.
 *
 * FIRST, THE `high` WAS SPECULATION THIS GATE DID NOT HAVE TO MAKE. inc.160 filed every trigger
 * departure as `high` on the words *"if it was the last wrapper that did"* — but the same tick that
 * notices the loss already re-derived `triggeredBy` from the current tree, so whether ANOTHER
 * wrapper still runs this gate is a measured fact, not a conditional. `stillTriggeredBy` is that
 * fact. If a sibling remains, the clock rule is still enforced, the row says which wrapper enforces
 * it, and the severity is `medium` — coverage shrank, enforcement did not stop. Only a departure
 * that leaves NOBODY running the gate is `high`, and then the row states it flatly instead of
 * hedging. A `high` row on Rob's page that says enforcement may have stopped when it demonstrably
 * has not is the same defect as a stale line in the PRD.
 *
 * SECOND, NOTHING HERE WILL EVER CLOSE THE ROW, AND THE ROW NOW SAYS SO. The tempting fix was to
 * PATCH the dedupeKey to resolved when a name comes back, and it loses on three counts. (1) The
 * gate cannot verify sameness: inc.159 established that deleted, renamed and un-exec'd are
 * indistinguishable from here, so a file reappearing under this name is not proven to be the wrapper
 * that left — auto-closing on a name match would close a real loss on the strength of a coincidence.
 * (2) The ledger has no verified actor (`unverifiedActorRefusal`, inc.96 — Q73's roles are Postgres
 * read grants behind the service key), so a machine closure and Rob's closure are the same row
 * afterwards; the page would stop being a record of what HE decided. (3) `notion-crm-check.mjs`
 * already refuses to close what it files, and inc.93 already ruled that a row Rob closed is not the
 * endpoint's to undo — the symmetric case needs the symmetric answer. So the row is his, and the
 * detail spends one sentence telling him that rather than leaving him to infer it.
 */
export function departureFindings(
  departures: CensusDeparture[],
  stillTriggeredBy: string[] = [],
): DepartureFinding[] {
  return departures
    .filter(isFiled)
    .map((d) => {
      const remaining = enforcersOtherThan(d.name, stillTriggeredBy);
      const orphaned = d.wasTrigger && remaining.length === 0;
      const key = departureKey(d.name);
      return {
        entityName: "Wrapper clock gate",
        title: `${d.name} left the audited set — ${d.wasTrigger ? "it ran the clock gate" : "it was judged by the clock gate"}`,
        detail:
          `The last committed wrapper census held \`${d.name}\` (role: ${d.wasRole}` +
          `${d.wasTrigger ? ", ran the clock gate" : ""}` +
          `${d.wasRepoStamp ? `, asked the repo for its stamp via \`${REPO_STAMP_CALL}\`` : ""}) and ` +
          `the scan no longer sees it. Deleted, renamed, or stripped of the exec bit that got it ` +
          `collected — the gate cannot tell which and does not guess. ` +
          (d.wasTrigger
            ? orphaned
              ? `It RAN this gate and NO wrapper runs it now — the clock rule is unenforced from ` +
                `this tick and no green ✓ will say so. `
              : `It RAN this gate, but ${remaining.join(", ")} still ${remaining.length === 1 ? "does" : "do"} — ` +
                `the clock rule is still enforced; only this caller is gone. `
            : `It was held to the clock rule until this tick; that coverage is now smaller and no ` +
              `count in the report says so. `) +
          `Confirm the removal was meant, or find where it went. Filed because the census is ` +
          `rewritten in the same run that noticed, so the gate itself will never say this again ` +
          `(Q84 inc.160). Nothing will close this row for you: if this name comes back the gate ` +
          `cannot prove it is the same wrapper, and the ledger records no actor for a machine's ` +
          `closure — closing it is yours (Q84 inc.161).` +
          unaskableKeyNote(key),
        severity: orphaned ? ("high" as const) : ("medium" as const),
        dedupeKey: key,
      };
    });
}

/**
 * A departure this gate has already filed to Rob's ledger, plus the enforcement claim the row was
 * filed with (Q84 inc.162).
 *
 * `orphaned` is the only mutable part, and it is the only part that can go stale: it is the claim
 * "no wrapper runs this gate now", which was measured against the tree as it stood on the tick that
 * filed. The row itself — what left, that it left, that Rob has to confirm it — is history and
 * never changes.
 */
export type OpenDeparture = CensusDeparture & {
  orphaned: boolean;
  /**
   * Rob's ledger row for this key is resolved, as read on the last tick that could read it
   * (Q84 inc.164). Absent on a census written before inc.164 and on every row the ledger has not
   * closed — absent reads as "not closed", which is the pre-inc.164 behaviour and the safe one.
   *
   * NOT A RECORD OF WHAT ROB DECIDED. It is a mirror of a state his ledger owns, re-read from that
   * ledger every tick exactly like `orphaned` is re-measured from the tree, and it is authoritative
   * for nothing: the row it points at carries the actor, the date and the note. Keeping it here buys
   * one thing only — the gate still knows the key exists, so it can resume correcting the row if
   * Rob REOPENS it (`action: "reopen"` on `/api/admin/flags`, which restores the same `dedupe_key`
   * to `open`). inc.163 dropped the key outright, which forgot a state that is reversible.
   */
  closed?: boolean;
};

/**
 * Q84 inc.173 — inc.172 validated ONE field and asked whether to widen to the whole row. The answer
 * is NEITHER, and the boundary is measured rather than argued: a carried row is unreadable when a
 * field that **decides what the gate does, or appears in what it publishes to Rob**, is not the
 * shape it was written in.
 *
 * WHY NOT PER-FIELD-AS-NEEDED. inc.172 caught `orphaned`; the field one over is worse. `closed` is
 * read with `= false` defaulting, which only fires on `undefined` — a corrupted `closed: "yes"` is
 * TRUTHY, so the row is treated as one Rob resolved: frozen, no correction, and **no stderr line at
 * all**. A row he never closed goes quiet on his page and nothing anywhere says so. Fixing that one
 * field and stopping would leave the same hole in `name`, which is worse again: it becomes the
 * ledger `dedupeKey` and the subject of the sentence, so a corrupt name POSTs a correction at a
 * garbage key on the page he reads for money.
 *
 * WHY NOT THE WHOLE ROW EITHER — REJECTING COSTS SOMETHING. The disposition is withholding, and a
 * withheld correction means a stale enforcement claim stays on Rob's page (the defect inc.162
 * exists to kill). Paying that price over a field the gate never reads would be strictly worse than
 * ignoring it. So the set was measured against this function rather than assumed:
 *
 *   `closed`       → decides freeze-vs-correct, and freezing is silent. IN.
 *   `orphaned`     → the claim the correction compares and quotes back (inc.172). IN.
 *   `name`         → becomes `departureKey()` — the ledger key — and the row's subject. IN.
 *   `wasTrigger`   → feeds `orphanedNow()`, so it decides the claim, the severity and the title. IN.
 *   `wasRole`      → published verbatim in the correction sentence Rob reads. IN (published, not
 *                    decisive — a garbage role is still garbage on his page).
 *   `wasRepoStamp` → read NOWHERE in `reconcileOpenDepartures`; carried through untouched. OUT, and
 *                    deliberately: rejecting a row over it would suppress a true correction to
 *                    protect a field that changes nothing.
 *
 * It NEVER repairs. A row it rejects is kept exactly as found (inc.163: dropping a key is the harm),
 * unrepaired (inc.170: a state the gate did not publish must not be recorded as published), and
 * reported on stderr. PURE per CR-3.
 */
export function unreadableCarriedField(row: OpenDeparture): string | null {
  if (typeof row.name !== "string" || row.name === "") return "name";
  if (row.wasRole !== "judged" && row.wasRole !== "skipped" && row.wasRole !== "unjudged")
    return "wasRole";
  if (typeof row.wasTrigger !== "boolean") return "wasTrigger";
  if (typeof row.orphaned !== "boolean") return "orphaned";
  if (row.closed !== undefined && typeof row.closed !== "boolean") return "closed";
  return null;
}

/**
 * The ledger key a departure row is filed under. One definition, because Q84 inc.163 now matches
 * these keys against what Rob has RESOLVED — a second spelling of this string would silently mean
 * "he has closed nothing" forever.
 */
export function departureKey(name: string): string {
  return `wrapper-census-departure:${name}`;
}

/**
 * Q84 inc.169 — inc.168's drop is safe and it is INVISIBLE to Rob. This makes the affected row say so.
 *
 * inc.168 stopped sending a key the read query cannot carry back unchanged, and said it on stderr,
 * on a tick nobody reads. The row that key belongs to sits on the page Rob reads for money with no
 * hint that the gate has gone deaf about it.
 *
 * THE OBJECTION inc.160 RAISED IS THE RIGHT ONE, AND THIS SURVIVES IT. "Putting the gate's plumbing
 * on Rob's money page is how a ledger becomes a log nobody reads" — true, and this is not plumbing.
 * The row ALREADY ends by telling him closing it is his (inc.161). For an unaskable key that sentence
 * is incomplete in a way that costs him something concrete: the gate never sees the closure, so
 * `closed` never latches, and the FIRST time this row's enforcement claim changes, the correction is
 * POSTed on a key whose only row is resolved — `planFlagWrite` inserts rather than corrects
 * ("recurred after being resolved"), and a row he closed is back on his page. That is a statement
 * about what THIS ROW will do to him, not about how the gate is wired.
 *
 * NARROW BY CONSTRUCTION. An askable key adds not one word — the note is the empty string, so the
 * ordinary row (every row today: no wrapper name in the live census carries such a character) is
 * byte-identical to what inc.161/162 wrote. It is also deliberately silent about a remedy: the
 * wrapper is gone, the key is history, and inventing "just rename it" would be advice about a file
 * that no longer exists.
 *
 * PURE per CR-3 — it asks `keySurvivesTransport`, which asks the route's own parser.
 */
export function unaskableKeyNote(key: string): string {
  if (keySurvivesTransport(key)) return "";
  return (
    ` One thing about THIS row in particular: its ledger key \`${key}\` holds a character the ` +
    `read query cannot hand back unchanged, so this gate never asks your ledger about it (Q84 ` +
    `inc.168) and will not see you resolve it. Resolving works and holds here. What does not ` +
    `happen is the gate noticing — so it will not re-file this row either: it cannot tell whether ` +
    `an edit would land on your open row or insert a new one on top of a decision you already ` +
    `made, and it will not guess with your page (Q84 inc.170). Read the enforcement claim above ` +
    `as true on the day it was filed and not re-checked since. Closing it is still yours.`
  );
}

/**
 * Q84 inc.162 — the row is right when it is written and can be wrong a week later. This corrects
 * it, and does not close it.
 *
 * inc.161 ruled that nothing here may CLOSE a row: the gate cannot prove a returning name is the
 * same wrapper, and the ledger records no actor for a machine's closure, so a closure would erase
 * the distinction between what Rob decided and what a script decided. That ruling stands and this
 * does not touch it. Every row this function corrects stays open, at the same key, still Rob's to
 * confirm.
 *
 * THE STALENESS IS REAL, NOT HYPOTHETICAL, AND IT RUNS BOTH WAYS. Say `A` and `B` both run this
 * gate. `A` leaves: `medium`, and the row says *"B still does — the clock rule is still enforced"*.
 * `B` leaves next month: `B` gets its own `high` row, and `A`'s row still tells Rob that `B`
 * enforces the rule, which is now false on the page he reads for money. The reverse is the same
 * defect: the LAST gate-runner leaves (`high`, *"no green ✓ will say so"*), a replacement is wired
 * next week, and the row keeps asserting the rule is unenforced. Both are a claim about the CURRENT
 * tree stated in the present tense and never revisited — the same defect inc.161 fixed at filing
 * time, surviving one tick later.
 *
 * A CORRECTION IS NOT A CLOSURE, and the difference is what the gate can prove. A closure asserts
 * the loss is accounted for — a judgement about intent, about a file the gate can no longer see,
 * and about which no machine here has standing. A correction asserts only *who runs this gate right
 * now*, which is `triggeredBy`, re-derived from the current tree on every single tick exactly like
 * every other line this gate prints. The gate is not being trusted with anything new; it is being
 * required to keep saying the same measured thing it already says everywhere else.
 *
 * IT CANNOT INVENT A FINDING, WHICH IS THE OBJECTION inc.161 RAISED. The only keys it may re-POST
 * are keys recorded in `openDepartures` — written by this gate at the moment it filed them. With no
 * record it corrects nothing. It never adds a key, never removes one, and never emits a correction
 * for a row whose enforcement claim has not actually flipped, so a quiet tick stays a quiet tick.
 *
 * A DEPARTURE FILED THIS TICK IS NOT ALSO CORRECTED. `departureFindings()` already POSTs that key
 * with today's facts; a second body on the same key in the same run would be the gate arguing with
 * itself.
 *
 * Q84 inc.164 — A CLOSED ROW IS REMEMBERED, NOT FORGOTTEN, AND STILL NEVER RE-POSTED. inc.163 was
 * right that a resolved key must stop being corrected, and wrong to drop it: `resolve` has an
 * inverse. `/api/admin/flags` takes `action: "reopen"`, which puts the SAME `dedupe_key` back to
 * `open` carrying the enforcement claim it was filed with. Dropped, the gate no longer knows the key
 * exists, so a reopened row is never corrected again — it sits on Rob's page asserting "no wrapper
 * runs this gate now" while a replacement runs it, permanently. That is precisely the staleness
 * inc.162 exists to kill, reachable one resolve-then-reopen later.
 *
 * SO THE ROW IS KEPT AND FLAGGED `closed`, WHICH IS NOT A SECOND LEDGER. A `closedDepartures`
 * tombstone would be one: a durable claim about what Rob decided, written once by a machine and
 * never re-checked, competing with the row that actually holds the actor and the note. `closed` is
 * the opposite shape — re-read from his ledger on every tick, believed for exactly one tick, and
 * authoritative for nothing. It answers only "does this gate still owe this key a correction".
 *
 * WHILE CLOSED, `orphaned` IS FROZEN ON PURPOSE. It records what the FILED ROW claims, not what the
 * tree is; corrections fire off the gap between the two. Re-measuring it while the row is closed
 * would quietly close that gap, and the reopened row would then be judged already-correct and left
 * stale — the same bug wearing the fix's clothes.
 *
 * Q84 inc.165 — A REOPEN NEEDS THE SAME POSITIVE EVIDENCE A CLOSURE NEEDS. inc.165 was handed the
 * question "can Rob DELETE a row instead of resolving it, and would the gate then re-INSERT it?".
 * Measured first: he cannot. `app/api/admin/flags/route.ts` exposes GET/PATCH/POST and no DELETE;
 * PATCH takes `resolve|reopen|read|unread`; the file's own header states the design — *"resolve with
 * optional note, never deleted, archive keeps both dates"* (Rob 2026-07-22). Nothing in the app
 * deletes a flag, so DELETION IS OUTSIDE WHAT THIS GATE MAY INFER — reading an absence as Rob's
 * decision would be a machine deciding what he decided, which inc.161 already ruled out.
 *
 * BUT ABSENCE HAS A SECOND CAUSE inc.164 DID NOT NAME, AND IT IS REACHABLE TODAY: a PARTIAL read.
 * `resolvedDepartureKeys()` returns a non-null list — "believe this ledger" — for any 200 carrying an
 * array, including an array that is missing rows (PostgREST's max-rows cap as the ledger grows, an
 * entity-filtered base URL, a truncated page). Before this increment a `closed` row that was merely
 * ABSENT from that array was read as reopened: the gate un-froze `orphaned`, told Rob's console
 * *"you reopened …"* when he had done nothing, and could emit a correction re-POSTing a row he
 * closed — the exact inc.163 harm, arriving through a short read instead of a deletion.
 *
 * SO CLOSURE AND REOPEN ARE NOW SYMMETRIC: a row closes only when the ledger is SEEN to hold it
 * resolved, and reopens only when the ledger is SEEN to hold it open (`ledgerOpenKeys`). Absence is
 * evidence of nothing in either direction, at key granularity — the same rule `null` already applies
 * to the whole read. A closed row missing from a short read simply stays closed and silent; it is
 * still on Rob's page, where he can see it, and the gate re-POSTs nothing on a guess.
 *
 * Q84 inc.170 — A CORRECTION THE GATE CANNOT AIM IS NOT EMITTED. inc.169 put a sentence on the row
 * whose key inc.168 refuses to send, and left the gate doing the thing that sentence warned about.
 * The question it handed on: emit the correction and explain it, or withhold it?
 *
 * WITHHOLD, because the gate cannot tell the two outcomes apart and one of them overturns Rob. On an
 * unaskable key `resolved` and `ledgerOpen` never mention it, so `closed` never latches. If his row
 * is still open, a correction edits it — right. If he resolved it, `planFlagWrite` INSERTS
 * ("recurred after being resolved") and a row he closed is back on his money page. The gate has no
 * evidence which case it is in, and that is the exact shape inc.165 already ruled on: closure and
 * reopen each need the state SEEN, absence is evidence of nothing, and the gate re-POSTs nothing on
 * a guess. A correction here would be that guess, made against a decision Rob owns.
 *
 * THE COST IS REAL AND IT IS THE SMALLER ONE. Withheld, a claim about which wrapper enforces the
 * clock rule can go stale on the page — the defect inc.162 exists to kill. It is smaller because it
 * is DISCLOSED where it happens: `unaskableKeyNote()` now tells Rob, in that row, that its
 * enforcement claim was true the day it was filed and is not being re-checked. A resurrected row
 * discloses nothing until after it has already contradicted him.
 *
 * NARROW AND LATENT, LIKE THE NOTE. The predicate is `keySurvivesTransport()` — the route's own
 * parser, never a character list — so every key on the live tree corrects exactly as inc.162 wrote.
 * Withheld rows are RETURNED, not swallowed: the caller prints them, so a silent gate is not the
 * failure mode.
 *
 * PURE per CR-3 — no clock, no network, no `process.env`. The caller POSTs and persists.
 */
export function reconcileOpenDepartures(
  previousOpen: OpenDeparture[],
  departures: CensusDeparture[],
  stillTriggeredBy: string[] = [],
  resolvedKeys: string[] | null = null,
  ledgerOpenKeys: string[] | null = null,
): {
  corrections: DepartureFinding[];
  open: OpenDeparture[];
  closed: OpenDeparture[];
  reopened: OpenDeparture[];
  withheld: OpenDeparture[];
  unreadableClaims: OpenDeparture[];
} {
  const orphanedNow = (d: CensusDeparture): boolean =>
    d.wasTrigger && enforcersOtherThan(d.name, stillTriggeredBy).length === 0;

  const resolved = resolvedKeys === null ? null : new Set(resolvedKeys);
  const ledgerOpen = ledgerOpenKeys === null ? null : new Set(ledgerOpenKeys);
  const filedThisTick = new Map(departures.filter(isFiled).map((d) => [d.name, d]));
  const corrections: DepartureFinding[] = [];
  const open: OpenDeparture[] = [];
  const closed: OpenDeparture[] = [];
  const reopened: OpenDeparture[] = [];
  const withheld: OpenDeparture[] = [];
  const unreadableClaims: OpenDeparture[] = [];

  for (const row of previousOpen) {
    const refiled = filedThisTick.get(row.name);
    if (refiled) continue; // departureFindings() owns this key this tick.

    // Q84 inc.173 — a carried row whose decisive or published fields are not the shape they were
    // written in is unreadable history, and is kept EXACTLY as found: not repaired, not dropped,
    // no correction, reported on stderr. Checked before `closed` is read, because `closed` is one of
    // the fields that can be corrupt and reading it is what goes silently wrong. See
    // `unreadableCarriedField()` for the measured field set and why `wasRepoStamp` is not in it.
    const unreadable = unreadableCarriedField(row);
    if (unreadable !== null) {
      open.push({ ...row });
      unreadableClaims.push(row);
      continue;
    }

    const { closed: wasClosed = false, ...history } = row;
    const key = departureKey(row.name);
    // An unread ledger changes nothing in either direction: it neither closes a row nor reopens one.
    // Nor does a read that simply does not mention this key (inc.165): closing needs to SEE it
    // resolved, reopening needs to SEE it open, and a short read is evidence of neither.
    const closedNow =
      resolved === null ? wasClosed : wasClosed ? !(ledgerOpen?.has(key) ?? false) : resolved.has(key);

    if (closedNow) {
      // Rob closed this row. Emit NO correction: a POST on a key with no open row INSERTS a new one
      // (`planFlagWrite`, "recurred after being resolved"), which would put a row he closed back on
      // his page (inc.163). Keep it, frozen, so a reopen can be seen (inc.164).
      open.push({ ...history, closed: true });
      if (!wasClosed) closed.push(row);
      continue;
    }
    if (wasClosed) reopened.push(row);

    /**
     * Q84 inc.172 — inc.171 asked whether `writeCensus()` should read its own file back and check the
     * frozen `orphaned` survived, because a census written without it erases the divergence and the
     * withhold stops recurring with nothing noticing. READING BACK IS THE WRONG SHAPE, on the facts:
     * the write is a single `writeFile` that throws on failure, so a read-back can only re-observe a
     * write that already succeeded — while every loss inc.171 actually named (a hand-edit, a schema
     * migration, a truncated file from another process) happens BETWEEN ticks, where no write-time
     * check is looking. It would be the gate auditing its own disk (inc.160's plumbing) and it would
     * not catch the thing it was proposed for.
     *
     * THE LOSS IS REAL; IT IS CAUGHT ON THE WAY IN, at inc.159's seam. And measured before fixing,
     * the symptom was the opposite of "silently stops recurring": a row whose `orphaned` was lost
     * reads as `undefined`, `undefined !== false` makes the claim look FLIPPED, and the correction
     * that fires branches on `row.orphaned` — so the gate posts a sentence to Rob's ledger about
     * what the row "was filed saying" that it never filed. A published claim invented out of a
     * missing field is worse than a stale one.
     *
     * So a non-boolean claim is not read as `false`. It is unreadable history — the same disposition
     * inc.159 gives an unparseable census — and it WITHHOLDS: no correction, row kept and unchanged
     * (so it stays tracked and recurs identically every tick per inc.171), reported on stderr. The
     * gate does not adopt `orphanedNow()` as the filed claim either: a state it did not publish must
     * not be recorded as published, which is inc.170's rule and the reason this row exists at all.
     */
    // (The `orphaned` shape check inc.172 wrote inline lives in `unreadableCarriedField()` as of
    // inc.173, run above — before `closed` is read rather than after, since `closed` corrupts silently.)
    const orphaned = orphanedNow(history);
    if (orphaned === history.orphaned) {
      open.push({ ...history, orphaned });
      continue;
    }
    // Q84 inc.170 — the claim flipped and this key cannot be read. WITHHOLD the correction, and
    // freeze `orphaned` with it: a state the gate did not publish must not be recorded as published,
    // or the gap the correction fires off is closed silently and the row is stale forever.
    //
    // Q84 inc.171 — inc.170 asked whether the census row should also carry a durable `withheldClaim`,
    // so a later tick (or Rob) can see this row was measured wrong at least once. The answer is NO,
    // and not on inc.164's "second ledger" grounds alone: WITHHOLDING IS NOT AN EVENT THAT CAN BE
    // LOST. It is a standing condition, re-derived from scratch on every tick out of two things the
    // census and the tree already hold — the frozen `orphaned` above, and `orphanedNow()` measured
    // now. The freeze is exactly what keeps the divergence alive, so the next tick withholds again,
    // and the one after that, for as long as the claim is wrong. A stored flag would be a SECOND
    // COPY of a fact this function recomputes anyway — the two-copies disease inc.164 collapsed and
    // inc.167 refused to re-introduce one file over — and it could disagree with the tree the moment
    // the claim flips back, at which point there is genuinely nothing to remember: the row is correct
    // again, was never published wrong, and a lingering "measured wrong once" flag would be the only
    // untrue thing on it. Durability for this already exists in the right place: the ROW on Rob's
    // ledger says the claim is not re-checked (inc.169), and that row is his, not the gate's.
    if (!keySurvivesTransport(key)) {
      open.push({ ...history });
      withheld.push(row);
      continue;
    }
    open.push({ ...history, orphaned });
    const remaining = enforcersOtherThan(row.name, stillTriggeredBy);
    corrections.push({
      entityName: "Wrapper clock gate",
      title: `${row.name} left the audited set — ${row.wasTrigger ? "it ran the clock gate" : "it was judged by the clock gate"}`,
      detail:
        `CORRECTION, not a closure — this row is still open and still yours to confirm. The last ` +
        `committed wrapper census held \`${row.name}\` (role: ${row.wasRole}` +
        `${row.wasTrigger ? ", ran the clock gate" : ""}) and the scan has not seen it since. That ` +
        `has not changed. What changed is what the row said about ENFORCEMENT: it was filed saying ` +
        (row.orphaned
          ? `no wrapper ran this gate at all, and ${remaining.join(", ")} ` +
            `${remaining.length === 1 ? "does" : "do"} now — the clock rule is enforced again. `
          : `the rule was still enforced by another wrapper, and NO wrapper runs this gate now — ` +
            `the clock rule is unenforced and no green ✓ will say so. `) +
        `Re-filed on the same key because that claim is re-measured from the current tree every ` +
        `tick, so leaving it stale would be the defect it was written to prevent. The gate still ` +
        `will not close this for you — it cannot prove a returning name is the same wrapper, and ` +
        `the ledger records no actor for a machine's closure (Q84 inc.161/162).`,
      // No `unaskableKeyNote` here, and that is not an omission: inc.170 withholds the correction
      // outright on an unaskable key, so every correction that reaches this line has a readable key
      // and the note would be the empty string. The note rides the FILING (`departureFindings`),
      // which is the row that has to carry it.
      severity: orphaned ? "high" : "medium",
      dedupeKey: key,
    });
  }

  for (const d of filedThisTick.values()) {
    open.push({ ...d, orphaned: orphanedNow(d) });
  }

  return {
    corrections,
    open: open.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    closed,
    reopened,
    withheld,
    unreadableClaims,
  };
}
