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

export type ClockAudit = {
  findings: ClockFinding[];
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

  for (const { name, source } of scripts) {
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

  return { findings, usesRepoStamp, skipped, triggeredBy };
}
