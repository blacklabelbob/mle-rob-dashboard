import { describe, it, expect } from "vitest";
// Q84 inc.178 — the recovery row is asserted against the REAL superseded-row predicate, not a
// regex copied into this file. A second copy is how the two would drift (inc.4/inc.5).
import { supersededBy } from "@/lib/flags/supersede";
import {
  auditWrapperClocks,
  censusDepartures,
  censusRecoveryFinding,
  censusUnreadableRowsRow,
  censusRefusalFinding,
  CENSUS_BLINDNESS_CLAIM,
  CENSUS_REFUSAL_KEY,
  CENSUS_UNREADABLE_ROWS_KEY,
  classifyCensusRead,
  clockGateBrief,
  departureFindings,
  departureKey,
  reconcileOpenDepartures,
  unreadableCarriedField,
  unaskableKeyNote,
  type OpenDeparture,
  BRIEF_MARKER,
  ROB_FACING_SURFACES,
  REPO_STAMP_CALL,
  TRIGGER_CALLS,
  wrapperCensus,
} from "../wrapperClock";

const script = (source: string, name = "some-wrapper.sh") => [{ name, source }];

describe("auditWrapperClocks", () => {
  it("flags an unlabeled human stamp in a script that writes to PING-INBOX", () => {
    const { findings } = auditWrapperClocks(
      script(`NOW="$(date '+%Y-%m-%d %H:%M')"\necho "## $NOW" >> "$HOME/.claude/memory/PING-INBOX.md"`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 1, format: "%Y-%m-%d %H:%M", surfaces: ["PING-INBOX.md"] });
  });

  it("accepts a stamp that names its zone", () => {
    const { findings } = auditWrapperClocks(
      script(`NOW="$(date '+%Y-%m-%d %H:%M:%S %Z')"\necho "$NOW" >> crm-driver.log`),
    );
    expect(findings).toEqual([]);
  });

  it("accepts a numeric offset as a zone label", () => {
    const { findings } = auditWrapperClocks(script(`date '+%Y-%m-%d %H:%M %z' >> meeting-intake.log`));
    expect(findings).toEqual([]);
  });

  it("ignores epoch arithmetic — an epoch is not a sentence for a human", () => {
    const { findings } = auditWrapperClocks(
      script(`NOW_S=$(date "+%s")\nAGE=$(( NOW_S - OLD ))\necho "$AGE" >> "$PING/PING-INBOX.md"`),
    );
    expect(findings).toEqual([]);
  });

  it("ignores a parse invocation — demanding a zone there would break the log it reads back", () => {
    const { findings } = auditWrapperClocks(
      script(`LAST=$(date -j -f "%Y-%m-%d %H:%M" "$LAST_TS" "+%s")\necho x >> PING-INBOX.md`),
    );
    expect(findings).toEqual([]);
  });

  it("ignores GNU-style date -d parsing too", () => {
    const { findings } = auditWrapperClocks(script(`date -d "$WHEN" '+%Y-%m-%d'\necho x >> crm-driver.log`));
    expect(findings).toEqual([]);
  });

  it("resolves the path through a variable — the redirect is never on the line that names the file", () => {
    const { findings } = auditWrapperClocks(
      script(`PING_INBOX="$MEM/PING-INBOX.md"\nNOW="$(date '+%Y-%m-%d %H:%M')"\n{ echo "## $NOW"; } >> "$PING_INBOX"`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 2, surfaces: ["PING-INBOX.md"] });
  });

  it("skips a script that only READS a surface — its own stamp is not landing there", () => {
    // session-start-briefing.sh: prints the ping inbox, but stamps a machine-parsed activity log.
    const { findings, skipped } = auditWrapperClocks(
      script(`PING_INBOX="$HOME/.claude/memory/PING-INBOX.md"\nTS=$(date '+%Y-%m-%d %H:%M')\necho "$TS" >> "$ACTIVITY_LOG"\ncat "$PING_INBOX"`),
    );
    expect(findings).toEqual([]);
    expect(skipped).toEqual(["some-wrapper.sh"]);
  });

  it("does not read a '>' inside an echoed sentence as a redirect", () => {
    // The live line: `echo "📨 PINGS ... (clear with: > ~/.claude/memory/PING-INBOX.md)"`.
    const { findings, skipped } = auditWrapperClocks(
      script(`TS=$(date '+%H:%M')\necho "pings (clear with: > $HOME/.claude/memory/PING-INBOX.md)"`),
    );
    expect(findings).toEqual([]);
    expect(skipped).toEqual(["some-wrapper.sh"]);
  });

  it("counts a tee as a write", () => {
    const { findings } = auditWrapperClocks(script(`date '+%H:%M' | tee -a "$MEM/PING-INBOX.md"`));
    expect(findings).toHaveLength(1);
  });

  it("ignores a calendar-only stamp — a day is not an instant", () => {
    const { findings } = auditWrapperClocks(script(`TODAY="$(date '+%Y-%m-%d')"\necho "$TODAY" >> PING-INBOX.md`));
    expect(findings).toEqual([]);
  });

  it("skips scripts that write to none of Rob's surfaces", () => {
    const { findings, skipped } = auditWrapperClocks(script(`date '+%Y-%m-%d %H:%M' > /tmp/scratch`, "private.sh"));
    expect(findings).toEqual([]);
    expect(skipped).toEqual(["private.sh"]);
  });

  it("does not flag a commented-out date — the comment explaining the old defect is not the defect", () => {
    const { findings } = auditWrapperClocks(
      script(`# What it replaces: the prefix was date '+%Y-%m-%d %H:%M:%S' (no zone)\necho x >> crm-driver.log`),
    );
    expect(findings).toEqual([]);
  });

  it("reports which surface-writing scripts ask the repo for their stamp", () => {
    const { usesRepoStamp, findings } = auditWrapperClocks(
      script(`STAMP="$(node scripts/${REPO_STAMP_CALL} 2>/dev/null)"\necho "$STAMP" >> meeting-intake.log`),
    );
    expect(usesRepoStamp).toEqual(["some-wrapper.sh"]);
    expect(findings).toEqual([]);
  });

  it("still flags a private clock in a script that also uses the repo stamp — a fallback must be labeled", () => {
    const { findings, usesRepoStamp } = auditWrapperClocks(
      script(
        `REPO_STAMP="$(node scripts/${REPO_STAMP_CALL})"\nNOW="$(date '+%Y-%m-%d %H:%M:%S')"\necho x >> crm-driver.log`,
      ),
    );
    expect(usesRepoStamp).toEqual(["some-wrapper.sh"]);
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(2);
  });

  it("catches every unlabeled format on one line, not just the first", () => {
    const { findings } = auditWrapperClocks(
      script(`printf '%s %s' "$(date '+%H:%M')" "$(date '+%T')" >> PING-INBOX.md`),
    );
    expect(findings.map((f) => f.format)).toEqual(["%H:%M", "%T"]);
  });

  it("names every Rob-facing surface the script writes, so the report says why the stamp matters", () => {
    const { findings } = auditWrapperClocks(
      script(`date '+%H:%M'\necho a >> crm-driver.log\necho b >> "$MEM/PING-INBOX.md"`),
    );
    expect(findings[0].surfaces).toEqual(["PING-INBOX.md", "crm-driver.log"]);
  });

  it("keeps the surface list and the repo-stamp call as the single declared contract", () => {
    expect(ROB_FACING_SURFACES).toContain("PING-INBOX.md");
    expect(REPO_STAMP_CALL).toBe("intake-silence.mjs stamp");
  });

  // Q84 inc.143 — the trigger lives in a shell file outside this repo, where no diff sees it.
  // The only way the repo can know the wiring survives is to look for it every run.
  describe("its own trigger", () => {
    it("sees the driver's npm invocation — the spelling the first live run missed", () => {
      const { triggeredBy } = auditWrapperClocks(
        script(`npm run audit:clocks -- --brief`, "crm-build-driver.sh"),
      );
      expect(triggeredBy).toEqual(["crm-build-driver.sh"]);
    });

    it("sees a direct call to the script by path", () => {
      const { triggeredBy } = auditWrapperClocks(
        script(`node --import ./scripts/ts-loader.mjs scripts/audit-wrapper-clocks.mjs --brief`),
      );
      expect(triggeredBy).toEqual(["some-wrapper.sh"]);
    });

    it("does not count a commented-out invocation — that was inc.142's whole disease", () => {
      const { triggeredBy } = auditWrapperClocks(
        script(`# npm run audit:clocks -- --brief   (disabled while noisy)`),
      );
      expect(triggeredBy).toEqual([]);
    });

    it("reports empty when nothing in the tree runs the gate", () => {
      const { triggeredBy } = auditWrapperClocks(script(`echo hi >> crm-driver.log`));
      expect(triggeredBy).toEqual([]);
    });

    it("counts a wrapper that runs the gate even though it writes to none of Rob's surfaces", () => {
      // A dedicated cron wrapper is the likeliest future trigger and it has no reason to write
      // anywhere Rob reads — skipping it for clock findings must not skip it for the trigger.
      const { triggeredBy, skipped } = auditWrapperClocks(
        script(`node scripts/${TRIGGER_CALLS[0]}.mjs --brief`, "clock-cron.sh"),
      );
      expect(triggeredBy).toEqual(["clock-cron.sh"]);
      expect(skipped).toEqual(["clock-cron.sh"]);
    });
  });

  // Q84 inc.144 — the driver reads this gate through `grep '^CLOCK GATE'`, so the marker is the
  // whole contract. A reworded sentence would not fail anything; it would just stop being heard.
  describe("the --brief line the driver reads", () => {
    const red = auditWrapperClocks(script(`date '+%H:%M' >> crm-driver.log`));
    const noTrigger = auditWrapperClocks(script(`echo hi >> crm-driver.log`));
    const clean = auditWrapperClocks(
      script(`npm run audit:clocks -- --brief\ndate '+%T %Z' >> crm-driver.log`),
    );

    it("prefixes every sentence it emits with the marker the driver greps for", () => {
      for (const audit of [red, noTrigger]) {
        expect(clockGateBrief(audit).line?.startsWith(BRIEF_MARKER)).toBe(true);
      }
    });

    it("says nothing and exits 0 when the tree is clean and the gate is wired", () => {
      expect(clockGateBrief(clean)).toEqual({ code: 0, line: null });
    });

    it("reports a finding as code 1, naming the script, line, format and surface", () => {
      const { code, line } = clockGateBrief(red);
      expect(code).toBe(1);
      expect(line).toContain("some-wrapper.sh:1");
      expect(line).toContain("'+%H:%M'");
      expect(line).toContain("crm-driver.log");
    });

    it("reports an unwired gate as code 3 even though nothing is wrong with the stamps", () => {
      const { code, line } = clockGateBrief(noTrigger);
      expect(code).toBe(3);
      expect(line).toContain("NO TRIGGER");
    });

    // Q84 inc.154 — a zero-wrapper scan agrees with a healthy tree on every array in the audit.
    // What separates them is that one of them looked at nothing, so that fact is recorded and
    // reported on its own terms rather than being inferred from the emptiness it shares.
    it("says it scanned nothing rather than blaming a missing trigger, when handed 0 wrappers", () => {
      const empty = auditWrapperClocks([]);
      expect(empty.scriptsSeen).toBe(0);
      const { code, line } = clockGateBrief(empty);
      expect(code).toBe(2);
      expect(line).toContain("SCANNED NOTHING");
      // The wrong sentence is the whole defect: it would send the reader to re-wire a tick that
      // is already wired, and to edit the wrapper the scan never saw.
      expect(line).not.toContain("NO TRIGGER");
    });

    it("still blames the missing trigger when wrappers WERE scanned and none wires the gate", () => {
      expect(noTrigger.scriptsSeen).toBeGreaterThan(0);
      expect(clockGateBrief(noTrigger).line).toContain("NO TRIGGER");
    });

    it("ranks a red stamp above a missing trigger — a live defect outranks an unenforced rule", () => {
      const both = auditWrapperClocks(script(`date '+%H:%M' >> crm-driver.log`));
      expect(both.triggeredBy).toEqual([]);
      expect(clockGateBrief(both).code).toBe(1);
    });
  });

  // Q84 inc.148 — inc.147 made an unranked gate loud in the PROMPT; nothing told a human. The
  // wrapper still spells its `DRIVER_*` assignments by hand, so this is where that hand is read.
  describe("DRIVER_* gates the wrapper hands the driver", () => {
    const wired = "npm run audit:clocks -- --brief\ndate '+%T %Z' >> crm-driver.log\n";

    it("flags a gate the wrapper passes that GATE_ORDER does not rank", () => {
      const { unrankedGateVars } = auditWrapperClocks(
        script(`${wired}DRIVER_NEW_GATE="$NEW" node scripts/driver-prompt.mjs "$BASE"`),
      );
      expect(unrankedGateVars).toEqual([{ script: "some-wrapper.sh", line: 3, envVar: "DRIVER_NEW_GATE" }]);
    });

    it("says nothing about the four gates that ARE ranked, spelled as the live wrapper spells them", () => {
      const { unrankedGateVars } = auditWrapperClocks(
        script(
          `${wired}PROMPT="$(cd "$REPO" && DRIVER_ORPHANED="$ORPHANED" DRIVER_UNFOLDED="$UNFOLDED" \\\n` +
            `  DRIVER_WATCHDOG="$WATCHDOG_PREFIX" DRIVER_CLOCK_GATE="$CLOCK_GATE" \\\n` +
            `  node --import ./scripts/ts-loader.mjs scripts/driver-prompt.mjs "$BASE" 2>/dev/null)"`,
        ),
      );
      expect(unrankedGateVars).toEqual([]);
    });

    // The false positive that would put a permanent red in front of every increment: daily-driver.sh
    // and daily-email.sh both hold `DRIVER_LOG=`, a local variable that never reaches a child.
    it("ignores a local DRIVER_* variable that is never exported and prefixes no command", () => {
      const { unrankedGateVars } = auditWrapperClocks(
        script(`${wired}DRIVER_LOG="$MEM/daily-driver.log"\necho hi >> "$DRIVER_LOG"`),
      );
      expect(unrankedGateVars).toEqual([]);
    });

    it("does flag it once it is exported — an export reaches every child", () => {
      const { unrankedGateVars } = auditWrapperClocks(script(`${wired}export DRIVER_LOG="$MEM/x.log"`));
      expect(unrankedGateVars).toHaveLength(1);
      expect(unrankedGateVars[0].envVar).toBe("DRIVER_LOG");
    });

    it("does not treat a command after && as inheriting the assignment", () => {
      const { unrankedGateVars } = auditWrapperClocks(script(`${wired}DRIVER_LOG="x" && echo started`));
      expect(unrankedGateVars).toEqual([]);
    });

    // Found by this gate's own first live run against the real crm-build-driver.sh: one added gate
    // was reported as "2 unranked gates", because the continuation line was scanned twice — once
    // joined onto the line above and once as a logical line of its own.
    it("reports a gate on a continuation line ONCE, at the line it is written on", () => {
      const { unrankedGateVars } = auditWrapperClocks(
        script(
          `${wired}PROMPT="$(DRIVER_ORPHANED="$O" \\\n` +
            `  DRIVER_NEW_GATE="$NEW" \\\n` +
            `  node scripts/driver-prompt.mjs "$BASE")"`,
        ),
      );
      expect(unrankedGateVars).toEqual([{ script: "some-wrapper.sh", line: 4, envVar: "DRIVER_NEW_GATE" }]);
    });

    it("reports an unranked gate as code 4 when nothing else is wrong, naming var and line", () => {
      const { code, line } = clockGateBrief(
        auditWrapperClocks(script(`${wired}DRIVER_NEW_GATE="$NEW" node driver-prompt.mjs`)),
      );
      expect(code).toBe(4);
      expect(line?.startsWith(BRIEF_MARKER)).toBe(true);
      expect(line).toContain("DRIVER_NEW_GATE (some-wrapper.sh:3)");
      expect(line).toContain("GATE_ORDER");
    });

    // The whole reason this rides as a suffix: the driver hears ONE `^CLOCK GATE` line per tick,
    // so ranking these against each other would make the loser vanish — inc.147's exact disease.
    it("rides along with a red stamp instead of being shadowed by it", () => {
      const { code, line } = clockGateBrief(
        auditWrapperClocks(
          script(`${wired}date '+%H:%M' >> crm-driver.log\nDRIVER_NEW_GATE="$NEW" node driver-prompt.mjs`),
        ),
      );
      expect(code).toBe(1);
      expect(line).toContain("IS RED");
      expect(line).toContain("DRIVER_NEW_GATE");
    });

    it("rides along with a missing trigger too", () => {
      const { code, line } = clockGateBrief(
        auditWrapperClocks(script(`echo hi >> crm-driver.log\nexport DRIVER_NEW_GATE="$NEW"`)),
      );
      expect(code).toBe(3);
      expect(line).toContain("NO TRIGGER");
      expect(line).toContain("DRIVER_NEW_GATE");
    });

    it("stays silent — and code 0 — when every handed gate is ranked", () => {
      const clean = auditWrapperClocks(script(`${wired}DRIVER_WATCHDOG="$W" node driver-prompt.mjs`));
      expect(clockGateBrief(clean)).toEqual({ code: 0, line: null });
    });
  });

  // Q84 inc.149 — the sibling inc.148 deliberately did not chase: a gate that is RANKED and never
  // travels. It is not unranked, it is absent, and absence is the one state `gatesFromEnv` cannot
  // tell from "did not fire".
  describe("ranked gates that never leave the wrapper", () => {
    const wired = "npm run audit:clocks -- --brief\ndate '+%T %Z' >> crm-driver.log\n";

    it("flags a ranked gate set as a plain local", () => {
      const { strandedGateVars, unrankedGateVars } = auditWrapperClocks(
        script(`${wired}DRIVER_CLOCK_GATE="$CLOCK_GATE"\nnode scripts/driver-prompt.mjs "$BASE"`),
      );
      expect(strandedGateVars).toEqual([
        { script: "some-wrapper.sh", line: 3, envVar: "DRIVER_CLOCK_GATE" },
      ]);
      // Ranked, so it is never ALSO reported as unranked — one defect, one sentence.
      expect(unrankedGateVars).toEqual([]);
    });

    it("says nothing when the value is computed on its own line and handed over later", () => {
      // The shape the real crm-build-driver.sh uses. Judged per name, not per assignment.
      const { strandedGateVars } = auditWrapperClocks(
        script(
          `${wired}CLOCK_GATE="$(npm run --silent audit:clocks -- --brief)"\n` +
            `DRIVER_CLOCK_GATE="$CLOCK_GATE" node scripts/driver-prompt.mjs "$BASE"`,
        ),
      );
      expect(strandedGateVars).toEqual([]);
    });

    it("says nothing when a later bare `export` makes the local travel after all", () => {
      const { strandedGateVars } = auditWrapperClocks(
        script(`${wired}DRIVER_WATCHDOG="$W"\nexport DRIVER_WATCHDOG\nnode driver-prompt.mjs`),
      );
      expect(strandedGateVars).toEqual([]);
    });

    // The asymmetry with unrankedGateVars, pinned: daily-driver.sh and daily-email.sh each hold a
    // local DRIVER_LOG that is a log path, not a gate. Flagging it would be a permanent false red.
    it("says nothing about an UNRANKED local — a log path is not a forgotten gate", () => {
      const { strandedGateVars, unrankedGateVars } = auditWrapperClocks(
        script(`${wired}DRIVER_LOG="$MEM/daily-driver.log"\necho hi >> "$DRIVER_LOG"`),
      );
      expect(strandedGateVars).toEqual([]);
      expect(unrankedGateVars).toEqual([]);
    });

    it("reports the line the assignment is written on, not the line the command starts at", () => {
      const { strandedGateVars } = auditWrapperClocks(
        script(`${wired}echo one \\\n  DRIVER_UNFOLDED="$U"\nnode driver-prompt.mjs`),
      );
      expect(strandedGateVars).toEqual([{ script: "some-wrapper.sh", line: 4, envVar: "DRIVER_UNFOLDED" }]);
    });

    it("names it in --brief and exits 4 when the stamps are clean", () => {
      const { code, line } = clockGateBrief(
        auditWrapperClocks(script(`${wired}DRIVER_CLOCK_GATE="$C"\nnode driver-prompt.mjs`)),
      );
      expect(code).toBe(4);
      expect(line).toContain("NEVER REACHES THE DRIVER");
      expect(line).toContain("DRIVER_CLOCK_GATE");
    });

    it("rides along with a red stamp rather than being shadowed by it", () => {
      const { code, line } = clockGateBrief(
        auditWrapperClocks(
          script(`${wired}date '+%H:%M' >> crm-driver.log\nDRIVER_CLOCK_GATE="$C"\nnode driver-prompt.mjs`),
        ),
      );
      expect(code).toBe(1);
      expect(line).toContain("IS RED");
      expect(line).toContain("NEVER REACHES THE DRIVER");
    });

    it("states the stranded gate before the unranked one when both fired", () => {
      const { line } = clockGateBrief(
        auditWrapperClocks(
          script(
            `${wired}DRIVER_CLOCK_GATE="$C"\nDRIVER_NEW_GATE="$N" node scripts/driver-prompt.mjs`,
          ),
        ),
      );
      expect(line).toContain("NEVER REACHES THE DRIVER");
      expect(line).toContain("NO RANK in GATE_ORDER");
      expect(line!.indexOf("NEVER REACHES")).toBeLessThan(line!.indexOf("NO RANK"));
    });
  });

  describe("a composer invoked with its diagnostics discarded (Q84 inc.150)", () => {
    const wired = "npm run audit:clocks -- --brief\ndate '+%T %Z' >> crm-driver.log\n";

    it("flags the real wrapper's shape — the redirect on the third line of one command", () => {
      const { silencedComposers } = auditWrapperClocks(
        script(
          `${wired}PROMPT="$(cd "$REPO" && DRIVER_ORPHANED="$O" \\
  DRIVER_CLOCK_GATE="$C" \\
  node --import ./scripts/ts-loader.mjs scripts/driver-prompt.mjs "$BASE" 2>/dev/null)"`,
        ),
      );
      expect(silencedComposers).toEqual([{ script: "some-wrapper.sh", line: 5 }]);
    });

    it("says nothing when the composer's stderr is kept", () => {
      const { silencedComposers, ...rest } = auditWrapperClocks(
        script(`${wired}PROMPT="$(node scripts/driver-prompt.mjs "$BASE" 2>"$ERR")"`),
      );
      expect(silencedComposers).toEqual([]);
      expect(clockGateBrief({ silencedComposers, ...rest }).code).toBe(0);
    });

    it("does not flag a commented-out invocation", () => {
      const { silencedComposers } = auditWrapperClocks(
        script(`${wired}# node scripts/driver-prompt.mjs "$BASE" 2>/dev/null`),
      );
      expect(silencedComposers).toEqual([]);
    });

    it("leaves `2>&1` inside a capture alone — that merges, it does not discard", () => {
      const { silencedComposers } = auditWrapperClocks(
        script(`${wired}PROMPT="$(node scripts/driver-prompt.mjs "$BASE" 2>&1)"`),
      );
      expect(silencedComposers).toEqual([]);
    });

    it("names it in --brief and exits 4 when everything else is clean", () => {
      const { code, line } = clockGateBrief(
        auditWrapperClocks(script(`${wired}node scripts/driver-prompt.mjs "$BASE" 2>/dev/null`)),
      );
      expect(code).toBe(4);
      expect(line).toContain("diagnostics are DISCARDED");
      expect(line).toContain("some-wrapper.sh:3");
    });

    it("does not flag a redirect that only survives in a trailing note (Q84 inc.151)", () => {
      const { silencedComposers } = auditWrapperClocks(
        script(`${wired}node scripts/driver-prompt.mjs "$B" 2>"$ERR"  # was 2>/dev/null until 08-04`),
      );
      expect(silencedComposers).toEqual([]);
    });

    it("still flags the real redirect when a note follows it on the same line", () => {
      const { silencedComposers } = auditWrapperClocks(
        script(`${wired}node scripts/driver-prompt.mjs "$B" 2>/dev/null  # quiet on purpose`),
      );
      expect(silencedComposers).toEqual([{ script: "some-wrapper.sh", line: 3 }]);
    });

    it("is stated after both gate findings, never instead of them", () => {
      const { line } = clockGateBrief(
        auditWrapperClocks(
          script(
            `${wired}DRIVER_CLOCK_GATE="$C"\nDRIVER_NEW_GATE="$N" node scripts/driver-prompt.mjs "$B" 2>/dev/null`,
          ),
        ),
      );
      expect(line!.indexOf("NEVER REACHES")).toBeLessThan(line!.indexOf("NO RANK"));
      expect(line!.indexOf("NO RANK")).toBeLessThan(line!.indexOf("diagnostics are DISCARDED"));
    });
  });

  // Q84 inc.151 — every scan above looks for a needle in wrapper text, and until now "comment"
  // meant a comment on its OWN line. A note at the end of a live line was read as the thing it is
  // a note about — in one direction a permanent false red, in the other a false GREEN on the gate
  // that enforces the rest.
  describe("a note at the end of a live line", () => {
    const wired = "npm run audit:clocks -- --brief\ndate '+%T %Z' >> crm-driver.log\n";

    it("does not make an UNWIRED gate report itself as wired — the false-green direction", () => {
      const audit = auditWrapperClocks(
        script(`date '+%T %Z' >> crm-driver.log  # check by hand: npm run audit:clocks`),
      );
      expect(audit.triggeredBy).toEqual([]);
      expect(clockGateBrief(audit).code).toBe(3);
    });

    it("does not demand a zone for a stamp that only appears in a note", () => {
      const { findings } = auditWrapperClocks(
        script(`${wired}printf '%s\\n' "$STAMP" >> crm-driver.log  # was date '+%H:%M'`),
      );
      expect(findings).toEqual([]);
    });

    it("does not read a gate name out of a note", () => {
      const { unrankedGateVars } = auditWrapperClocks(
        script(`${wired}node scripts/driver-prompt.mjs "$B"  # add DRIVER_NEW_GATE="$N" here later`),
      );
      expect(unrankedGateVars).toEqual([]);
    });

    it("leaves a mid-word `#` alone — `${VAR#pre}` is code, not a comment", () => {
      const { unrankedGateVars } = auditWrapperClocks(
        script(`${wired}DRIVER_NEW_GATE="\${RAW#prefix}" node scripts/driver-prompt.mjs "$B"`),
      );
      expect(unrankedGateVars).toEqual([
        { script: "some-wrapper.sh", line: 3, envVar: "DRIVER_NEW_GATE" },
      ]);
    });

    it("leaves a `#` inside quotes alone — an echoed sentence is prose, not a comment", () => {
      const audit = auditWrapperClocks(
        script(`echo "see # below and run npm run audit:clocks"\ndate '+%T %Z' >> crm-driver.log`),
      );
      expect(audit.triggeredBy).toEqual(["some-wrapper.sh"]);
    });
  });

  describe("a heredoc body (Q84 inc.152)", () => {
    const wired = "npm run audit:clocks -- --brief\ndate '+%T %Z' >> crm-driver.log\n";

    it("does not leak an apostrophe past its terminator — hold-signal.sh's live shape", () => {
      // The body is `hold-signal.sh` almost verbatim: a `#` shell would never read as a comment,
      // and `Rob's` — one unmatched quote. Before inc.152 that quote stayed open for the rest of
      // the file, so the trailing note below was never stripped and read as a real gate.
      const audit = auditWrapperClocks(
        script(
          `${wired}cat <<'EOF'\n🛑 HOLD (Rob rule #2: listen in pieces).\nBLOCKED until Rob's next message.\nEOF\n` +
            `node scripts/driver-prompt.mjs "$B"  # add DRIVER_NEW_GATE="$N" here later`,
        ),
      );
      expect(audit.unrankedGateVars).toEqual([]);
      expect(audit.findings).toEqual([]);
    });

    it("refuses to go green on a heredoc whose terminator never arrives (Q84 inc.153)", () => {
      // Proven on a copy of the real crm-build-driver.sh: one `cat <<NOTES_END` inserted at line
      // 12 took a live unranked-gate finding from 1 to 0 and flipped usesRepoStamp false, at
      // exit 0. A delimiter typo is the everyday cause, and it always fails in this direction.
      const audit = auditWrapperClocks(
        script(`${wired}cat <<NOTES_END\n  a note\nDRIVER_NEW_GATE="1"\nexport DRIVER_NEW_GATE`),
      );
      expect(audit.unreadable).toEqual([
        { script: "some-wrapper.sh", line: 3, word: "NOTES_END", kind: "heredoc" },
      ]);
      // It takes the brief line rather than riding it as a suffix: an unranked-gate ✓ computed
      // from a blanked file is not a smaller finding, it is a wrong one.
      const brief = clockGateBrief(audit);
      expect(brief.code).toBe(1);
      expect(brief.line).toContain("COULD NOT READ");
      expect(brief.line).toContain("some-wrapper.sh:3");
      expect(brief.line).toContain("NOTES_END");
    });

    it("says nothing when every heredoc closes — the honest green stays green", () => {
      const audit = auditWrapperClocks(
        script(`${wired}cat <<'EOF'\n  a note\nEOF\ncat <<-\tTAIL\n\tmore\n\tTAIL`),
      );
      expect(audit.unreadable).toEqual([]);
      expect(clockGateBrief(audit).code).toBe(0);
    });

    it("still judges a stamp the body actually writes — bodies are data, not invisible", () => {
      // `mission-control-reporter.sh` writes `"$(date …)"` from inside an UNQUOTED heredoc, so the
      // stamp reaches disk. Skipping bodies wholesale would be the easy change and a false green.
      const { findings } = auditWrapperClocks(
        script(`cat > "$HOME/.claude/memory/PING-INBOX.md" <<EOF\n{ "at": "$(date '+%Y-%m-%d %H:%M')" }\nEOF`),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ line: 2, format: "%Y-%m-%d %H:%M" });
    });

    it("does not read a needle out of a body as if it were a command", () => {
      const audit = auditWrapperClocks(
        script(`date '+%T %Z' >> crm-driver.log\ncat <<'EOF'\nnpm run audit:clocks\nEOF`),
      );
      expect(audit.triggeredBy).toEqual([]);
      expect(clockGateBrief(audit).code).toBe(3);
    });

    it("ends a `<<-` body at a tab-indented terminator", () => {
      const audit = auditWrapperClocks(
        script(`${wired}cat <<-EOF\n\tRob's text\n\tEOF\nDRIVER_NEW_GATE="$N" node scripts/driver-prompt.mjs "$B"`),
      );
      expect(audit.unrankedGateVars).toEqual([
        { script: "some-wrapper.sh", line: 6, envVar: "DRIVER_NEW_GATE" },
      ]);
    });

    it("treats `<<<` as a here-string, not an opener that swallows the rest of the file", () => {
      const audit = auditWrapperClocks(
        script(`while read -r l; do :; done <<< "$MATCHED"\n${wired}`),
      );
      expect(audit.triggeredBy).toEqual(["some-wrapper.sh"]);
    });
  });

  // Q84 inc.155 — the sibling this gate never opened. Measured, not hypothesised: the live
  // wrapper directory holds `project-tracker.py`, executable, which mints an unlabeled
  // `%Y-%m-%d %H:%M` into PROJECT-TRACKER.md and PROJECT-CHANGELOG.md while the report said ✓.
  describe("executables the gate reads past", () => {
    const wired = "npm run audit:clocks -- --brief\ndate '+%T %Z' >> crm-driver.log\n";
    const clean = () => auditWrapperClocks(script(wired), ["project-tracker.py"]);

    it("does not let a clean *.sh scan report ✓ over an unjudged executable", () => {
      const { code, line } = clockGateBrief(clean());
      expect(code).toBe(4);
      expect(line).toContain("NOT JUDGED");
      expect(line).toContain("project-tracker.py");
    });

    it("stays silent — and exits 0 — when there are no unjudged siblings", () => {
      expect(clockGateBrief(auditWrapperClocks(script(wired)))).toEqual({ code: 0, line: null });
    });

    it("rides the verdict instead of replacing it, so a red stamp is still the headline", () => {
      const { code, line } = clockGateBrief(
        auditWrapperClocks(script(`${wired}date '+%H:%M' >> crm-driver.log`), ["project-tracker.py"]),
      );
      expect(code).toBe(1);
      expect(line?.startsWith(`${BRIEF_MARKER} IS RED`)).toBe(true);
      expect(line).toContain("project-tracker.py");
    });

    it("says NOT JUDGED, never that the sibling is wrong — nothing read it", () => {
      expect(clockGateBrief(clean()).line).not.toContain("unlabeled");
    });

    it("keeps every ^CLOCK GATE line matchable by the driver's grep", () => {
      expect(clockGateBrief(clean()).line?.startsWith(BRIEF_MARKER)).toBe(true);
    });
  });
});

// Q84 inc.156 — the Python reader. inc.155 could only NAME `project-tracker.py`; these pin what it
// now says about it, and pin the two ways a port of the shell rules would have lied.
describe("python siblings (Q84 inc.156)", () => {
  const py = (source: string, name = "tracker.py") => [{ name, source: `#!/usr/bin/env python3\n${source}` }];

  it("flags the live defect: a zoneless strftime reaching PROJECT-TRACKER.md", () => {
    const { findings } = auditWrapperClocks(
      py(`TRACKER = MEM / "PROJECT-TRACKER.md"\nnow = datetime.now().strftime("%Y-%m-%d %H:%M")\nTRACKER.write_text(f"synced {now}")`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ format: "%Y-%m-%d %H:%M", surfaces: ["PROJECT-TRACKER.md"] });
  });

  it("resolves the name through an `open(PATH, \"a\")` write, not just write_text", () => {
    const { findings } = auditWrapperClocks(
      py(`CHANGELOG = MEM / "PROJECT-CHANGELOG.md"\nnow = datetime.now().strftime("%H:%M")\nwith open(CHANGELOG, "a") as f:\n    f.write(now)`),
    );
    expect(findings[0].surfaces).toEqual(["PROJECT-CHANGELOG.md"]);
  });

  it("does NOT count a read — `open(PATH)` defaults to 'r', and reading proves nothing", () => {
    const { findings, skipped } = auditWrapperClocks(
      py(`TRACKER = MEM / "PROJECT-TRACKER.md"\nprint(open(TRACKER).read(), datetime.now().strftime("%H:%M"))`),
    );
    expect(findings).toEqual([]);
    expect(skipped).toEqual(["tracker.py"]);
  });

  it("still flags %Z when the datetime is NAIVE — python renders it as the empty string", () => {
    const { findings } = auditWrapperClocks(
      py(`T = MEM / "PROJECT-TRACKER.md"\nT.write_text(datetime.now().strftime("%Y-%m-%d %H:%M %Z"))`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].note).toContain("NAIVE");
  });

  it("accepts %Z once the clock is made aware", () => {
    const { findings } = auditWrapperClocks(
      py(`T = MEM / "PROJECT-TRACKER.md"\nT.write_text(datetime.now().astimezone().strftime("%Y-%m-%d %H:%M %Z"))`),
    );
    expect(findings).toEqual([]);
  });

  it("ignores a stamp inside a `#` comment, and one inside a docstring", () => {
    const { findings } = auditWrapperClocks(
      py(`T = MEM / "PROJECT-TRACKER.md"\n"""was: datetime.now().strftime("%H:%M")"""\nT.write_text("x")  # datetime.now().strftime("%H:%M")`),
    );
    expect(findings).toEqual([]);
  });

  it("does not carry an unclosed single quote to the next line the way shell does", () => {
    // In python that is a syntax error confined to its line; carrying it would blind every line
    // below, which is the shape of inc.152's bug reintroduced by a careless port.
    const { findings } = auditWrapperClocks(
      py(`T = MEM / "PROJECT-TRACKER.md"\nlabel = "Rob's note\nT.write_text(datetime.now().strftime("%H:%M"))`),
    );
    expect(findings).toHaveLength(1);
  });

  it("reports an unterminated docstring as unreadable, worded for python", () => {
    const { unreadable } = auditWrapperClocks(py(`"""never closed\nT.write_text("x")`));
    expect(unreadable[0]).toMatchObject({ line: 2, kind: "triple-quote" });
  });

  it("judges by shebang, so an executable .sh.bak is read as the shell it is", () => {
    const { findings } = auditWrapperClocks([
      {
        name: "daily-driver.sh.bak",
        source: `#!/bin/bash\nNOW="$(date '+%H:%M')"\necho "$NOW" >> "$MEM/PING-INBOX.md"`,
      },
    ]);
    expect(findings).toHaveLength(1);
  });

  it("names a language it has no reader for instead of counting it clean", () => {
    const { unjudged, findings } = auditWrapperClocks([
      { name: "thing.rb", source: `#!/usr/bin/env ruby\nputs Time.now` },
    ]);
    expect(unjudged).toEqual(["thing.rb"]);
    expect(findings).toEqual([]);
  });
});

describe("wrapperCensus", () => {
  const entry = (name: string, source: string, executable = true) => ({ name, source, executable });

  it("records the role of each wrapper the gate saw", () => {
    const entries = [
      entry("b-writes.sh", `date '+%F %T %Z' >> "$HOME/.claude/memory/crm-driver.log"`),
      entry("a-quiet.sh", `echo hello`),
    ];
    const census = wrapperCensus(auditWrapperClocks(entries), entries);
    // Sorted by name, so a census diff shows the change and not a reordering of the directory.
    expect(census.wrappers.map((w) => w.name)).toEqual(["a-quiet.sh", "b-writes.sh"]);
    expect(census.wrappers[0]).toMatchObject({ role: "skipped", language: "shell" });
    expect(census.wrappers[1]).toMatchObject({ role: "judged", language: "shell" });
  });

  it("marks a language it has no reader for as unjudged, never as skipped", () => {
    const entries = [entry("thing.rb", `#!/usr/bin/env ruby\nputs Time.now`)];
    const census = wrapperCensus(auditWrapperClocks(entries), entries);
    expect(census.wrappers[0]).toMatchObject({ role: "unjudged", language: "unknown" });
  });

  it("carries the exec bit, which is the only reason a non-.sh wrapper is collected at all", () => {
    const entries = [entry("tracker.py", `#!/usr/bin/env python3\nT.write_text("x")`, false)];
    const census = wrapperCensus(auditWrapperClocks(entries), entries);
    expect(census.wrappers[0]).toMatchObject({ name: "tracker.py", executable: false });
  });

  it("records who asks the repo for its stamp and who runs this gate", () => {
    const entries = [
      entry(
        "driver.sh",
        `STAMP="$(node scripts/${REPO_STAMP_CALL})"\n` +
          `npm run ${TRIGGER_CALLS[1]} -- --brief\n` +
          `echo "$STAMP" >> "$HOME/.claude/memory/crm-driver.log"`,
      ),
    ];
    const census = wrapperCensus(auditWrapperClocks(entries), entries);
    expect(census.wrappers[0]).toMatchObject({ repoStamp: true, triggersGate: true });
  });

  it("emits no timestamp, so an unchanged directory produces an unchanged file", () => {
    const entries = [entry("a.sh", `echo hi`)];
    const first = wrapperCensus(auditWrapperClocks(entries), entries);
    const second = wrapperCensus(auditWrapperClocks(entries), entries);
    expect(JSON.stringify(first)).toEqual(JSON.stringify(second));
    expect(JSON.stringify(first)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("classifyCensusRead (Q84 inc.174)", () => {
  const row = { name: "a.sh", language: "shell", executable: true, role: "judged", repoStamp: true, triggersGate: false };

  it("calls an absent file a first run — nothing was there, so nothing can be lost", () => {
    expect(classifyCensusRead({ missing: true, text: null })).toEqual({ disposition: "first-run", census: null });
  });

  it("reads a well-formed census back, openDepartures and all", () => {
    const text = JSON.stringify({ wrappers: [row], openDepartures: [{ name: "gone.sh" }] });
    const read = classifyCensusRead({ missing: false, text });
    expect(read.disposition).toBe("readable");
    expect(read.census?.openDepartures).toEqual([{ name: "gone.sh" }]);
  });

  it("accepts a pre-inc.162 census with NO openDepartures key — absence is legitimate", () => {
    const read = classifyCensusRead({ missing: false, text: JSON.stringify({ wrappers: [row] }) });
    expect(read.disposition).toBe("readable");
  });

  it("calls a present-but-empty file corrupt, not a first run — that is a truncated write", () => {
    const read = classifyCensusRead({ missing: false, text: "   \n" });
    expect(read.disposition).toBe("corrupt");
    expect(read.reason).toMatch(/empty/);
  });

  it("calls unparseable bytes corrupt rather than 'no previous record'", () => {
    const read = classifyCensusRead({ missing: false, text: "{ wrappers: [" });
    expect(read.disposition).toBe("corrupt");
    expect(read.reason).toMatch(/not JSON/);
  });

  it("calls a wrong-shaped `wrappers` corrupt and names what it found", () => {
    const read = classifyCensusRead({ missing: false, text: JSON.stringify({ wrappers: "all of them" }) });
    expect(read.disposition).toBe("corrupt");
    expect(read.reason).toContain("`wrappers`");
    expect(read.reason).toContain('"all of them"');
  });

  it("calls a PRESENT non-array `openDepartures` corrupt — that field is every row still corrected", () => {
    const text = JSON.stringify({ wrappers: [row], openDepartures: { "gone.sh": true } });
    const read = classifyCensusRead({ missing: false, text });
    expect(read.disposition).toBe("corrupt");
    expect(read.reason).toContain("`openDepartures`");
  });
});

describe("censusDepartures (Q84 inc.159)", () => {
  const entry = (name: string, source: string, executable = true) => ({ name, source, executable });
  const censusOf = (entries: { name: string; source: string; executable: boolean }[]) =>
    wrapperCensus(auditWrapperClocks(entries), entries);

  const writer = (name: string) =>
    entry(name, `date '+%F %T %Z' >> "$HOME/.claude/memory/crm-driver.log"`);

  it("names a wrapper the last census held that this scan never saw", () => {
    const before = censusOf([writer("a.sh"), entry("gone.sh", `echo hi`)]);
    const after = censusOf([writer("a.sh")]);
    expect(censusDepartures(before, after)).toEqual([
      { name: "gone.sh", wasRole: "skipped", wasTrigger: false, wasRepoStamp: false },
    ]);
  });

  it("carries the role it used to have, because there is nothing left to measure", () => {
    const before = censusOf([
      entry(
        "driver.sh",
        `STAMP="$(node scripts/${REPO_STAMP_CALL})"\n` +
          `npm run ${TRIGGER_CALLS[1]} -- --brief\n` +
          `echo "$STAMP" >> "$HOME/.claude/memory/crm-driver.log"`,
      ),
    ]);
    const after = censusOf([writer("other.sh")]);
    expect(censusDepartures(before, after)).toEqual([
      { name: "driver.sh", wasRole: "judged", wasTrigger: true, wasRepoStamp: true },
    ]);
  });

  it("reports nothing for an arrival — a new wrapper is judged on the tick it appears", () => {
    const before = censusOf([writer("a.sh")]);
    const after = censusOf([writer("a.sh"), entry("new.sh", `echo hi`)]);
    expect(censusDepartures(before, after)).toEqual([]);
  });

  it("reports nothing when there is no previous record — no record is not a loss", () => {
    expect(censusDepartures(null, censusOf([writer("a.sh")]))).toEqual([]);
  });

  it("catches the exact silent shrink inc.157 caused: a wrapper stripped of its exec bit", () => {
    // `daily-driver.sh.bak-2026-07-17` matches neither `*.sh` nor exec-bit+shebang once chmod -x
    // lands, so it simply stops being collected — 34 → 33 with four ✓ still printed.
    const bak = "daily-driver.sh.bak-2026-07-17";
    const before = censusOf([writer("a.sh"), entry(bak, `#!/bin/bash\necho hi`)]);
    const after = censusOf([writer("a.sh")]);
    const departures = censusDepartures(before, after);
    expect(departures.map((d) => d.name)).toEqual([bak]);
  });

  it("rides the brief line and turns a clean run into exit 4", () => {
    const audit = auditWrapperClocks([
      entry("driver.sh", `npm run ${TRIGGER_CALLS[1]} -- --brief`),
    ]);
    expect(clockGateBrief(audit).code).toBe(0);
    const brief = clockGateBrief(audit, [
      { name: "gone.sh", wasRole: "judged", wasTrigger: false, wasRepoStamp: false },
    ]);
    expect(brief.code).toBe(4);
    expect(brief.line).toContain(BRIEF_MARKER);
    expect(brief.line).toContain("gone.sh");
    expect(brief.line).toContain("GONE FROM THE SCAN");
  });

  it("rides a red verdict rather than competing with it — a departure must never be the loser", () => {
    const audit = auditWrapperClocks([
      entry("bad.sh", `date '+%F %T' >> "$HOME/.claude/memory/crm-driver.log"`),
      entry("driver.sh", `npm run ${TRIGGER_CALLS[1]} -- --brief`),
    ]);
    const brief = clockGateBrief(audit, [
      { name: "gone.sh", wasRole: "judged", wasTrigger: true, wasRepoStamp: false },
    ]);
    expect(brief.code).toBe(1);
    expect(brief.line).toContain("IS RED");
    expect(brief.line).toContain("gone.sh");
  });

  it("says the coverage shrank only when what left was actually covered", () => {
    const covered = clockGateBrief(auditWrapperClocks([]), [
      { name: "gone.sh", wasRole: "judged", wasTrigger: false, wasRepoStamp: false },
    ]);
    expect(covered.line).toContain("covered by the ✓ lines");
    const quiet = clockGateBrief(auditWrapperClocks([]), [
      { name: "gone.sh", wasRole: "skipped", wasTrigger: false, wasRepoStamp: false },
    ]);
    expect(quiet.line).not.toContain("covered by the ✓ lines");
  });
});

// Q84 inc.175 — inc.174 made a corrupt census refuse to be overwritten and said so on a `→ census:`
// stderr line. The driver greps `^CLOCK GATE`, so that line reached no prompt: the next increment
// was told the gate was CLEAN on the tick it stopped tracking every open row on Rob's ledger.
describe("a census the gate refused to write (Q84 inc.175)", () => {
  const entry = (name: string, source: string, executable = true) => ({ name, source, executable });
  const wired = () =>
    auditWrapperClocks([entry("driver.sh", `npm run ${TRIGGER_CALLS[1]} -- --brief`)]);
  const REASON = "`openDepartures` is present and is not an array";

  it("turns the silent clean verdict into a spoken one the driver can hear", () => {
    expect(clockGateBrief(wired())).toEqual({ code: 0, line: null });
    const brief = clockGateBrief(wired(), [], REASON);
    expect(brief.code).toBe(4);
    expect(brief.line?.startsWith(BRIEF_MARKER)).toBe(true);
    expect(brief.line).toContain("CENSUS WAS NOT WRITTEN");
    expect(brief.line).toContain(REASON);
  });

  // The defect is not that the gate went quiet about the file — it is that an EMPTY departure list
  // reads as "nothing left" on a tick where nothing could have been detected at all.
  it("says the missing departure line means NOT MEASURED rather than nothing left", () => {
    const brief = clockGateBrief(wired(), [], REASON);
    expect(brief.line).toContain("NOT MEASURED");
    expect(brief.line).not.toContain("GONE FROM THE SCAN");
  });

  it("rides a red stamp finding instead of taking the line from it", () => {
    const audit = auditWrapperClocks([
      entry("bad.sh", `date '+%F %T' >> "$HOME/.claude/memory/crm-driver.log"`),
      entry("driver.sh", `npm run ${TRIGGER_CALLS[1]} -- --brief`),
    ]);
    const brief = clockGateBrief(audit, [], REASON);
    expect(brief.code).toBe(1);
    expect(brief.line).toContain("IS RED");
    expect(brief.line).toContain("CENSUS WAS NOT WRITTEN");
  });

  // It is stated FIRST among the appended sentences because it reinterprets the ones after it.
  it("is stated before the departure sentence when both somehow apply", () => {
    const brief = clockGateBrief(wired(), [{ name: "gone.sh", wasRole: "judged", wasTrigger: false, wasRepoStamp: false }], REASON);
    expect(brief.line!.indexOf("CENSUS WAS NOT WRITTEN")).toBeLessThan(
      brief.line!.indexOf("GONE FROM THE SCAN"),
    );
  });

  it("says nothing at all on a tick the census was written", () => {
    for (const written of [null, undefined]) {
      expect(clockGateBrief(wired(), [], written as string | null)).toEqual({ code: 0, line: null });
    }
  });
});

describe("departureFindings (Q84 inc.160)", () => {
  const dep = (over: Partial<Parameters<typeof departureFindings>[0][number]> = {}) => ({
    name: "gone.sh",
    wasRole: "judged" as const,
    wasTrigger: false,
    wasRepoStamp: false,
    ...over,
  });

  it("files a judged departure as one deduped row", () => {
    const [f] = departureFindings([dep()]);
    expect(f.entityName).toBe("Wrapper clock gate");
    expect(f.dedupeKey).toBe("wrapper-census-departure:gone.sh");
    expect(f.severity).toBe("medium");
    expect(f.title).toContain("gone.sh");
    expect(f.detail).toContain("does not guess");
  });

  // Q84 inc.169 — the row whose key inc.168 refuses to send says so, and no other row changes.
  it("says nothing extra on an ordinary key — the note is empty, not merely short", () => {
    expect(unaskableKeyNote(departureKey("gone.sh"))).toBe("");
    const [f] = departureFindings([dep()]);
    expect(f.detail).not.toContain("inc.170");
    expect(f.detail.endsWith("(Q84 inc.161).")).toBe(true);
  });

  it("tells Rob, in the row itself, when the gate cannot ask his ledger about it", () => {
    const [f] = departureFindings([dep({ name: "run,thing.sh" })]);
    expect(f.dedupeKey).toBe("wrapper-census-departure:run,thing.sh");
    expect(f.detail).toContain("will not see you resolve it");
    expect(f.detail).toContain("will not re-file this row");
    expect(f.detail).toContain("inc.170");
  });

  it("the note is decided by the route's own parser, not by a character blacklist", () => {
    // A trailing space does not survive `parseLedgerKeys`' trim either — no comma involved.
    expect(unaskableKeyNote("wrapper-census-departure:gone.sh ")).not.toBe("");
    // Characters that merely look dangerous survive untouched and must stay silent.
    for (const n of ["a&b.sh", "a#b.sh", "a+b.sh", "a=b.sh", "a?b.sh", "a b.sh", "café.sh"]) {
      expect(unaskableKeyNote(departureKey(n))).toBe("");
    }
  });

  it("raises a gate-runner's departure to high — it is enforcement, not coverage", () => {
    const [f] = departureFindings([dep({ wasTrigger: true })]);
    expect(f.severity).toBe("high");
    expect(f.title).toContain("it ran the clock gate");
    expect(f.detail).toContain("the clock rule is unenforced");
  });

  it("files a gate-runner even when it was never judged", () => {
    expect(departureFindings([dep({ wasRole: "skipped", wasTrigger: true })])).toHaveLength(1);
  });

  it("stays out of Rob's ledger for a skipped or unjudged departure", () => {
    expect(departureFindings([dep({ wasRole: "skipped" })])).toEqual([]);
    expect(departureFindings([dep({ wasRole: "unjudged" })])).toEqual([]);
  });

  // Q84 inc.161 — the tick that notices the loss already knows who still runs the gate, so the
  // row states it. A `high` claiming enforcement may have stopped when it demonstrably has not is
  // a false alarm on the page Rob reads for money.
  it("drops a gate-runner's departure to medium when a sibling still runs the gate, and names it", () => {
    const [f] = departureFindings([dep({ wasTrigger: true })], ["crm-build-driver.sh"]);
    expect(f.severity).toBe("medium");
    expect(f.detail).toContain("crm-build-driver.sh still does");
    expect(f.detail).toContain("the clock rule is still enforced");
    expect(f.detail).not.toContain("unenforced");
  });

  it("keeps high when the departing wrapper is the only name in the trigger list", () => {
    // A caller handing over the PRE-departure list must not let the leaver vouch for itself.
    const [f] = departureFindings([dep({ name: "only.sh", wasTrigger: true })], ["only.sh"]);
    expect(f.severity).toBe("high");
    expect(f.detail).toContain("NO wrapper runs it now");
  });

  it("leaves a judged (non-trigger) departure at medium regardless of who runs the gate", () => {
    expect(departureFindings([dep()], ["crm-build-driver.sh"])[0].severity).toBe("medium");
    expect(departureFindings([dep()], [])[0].severity).toBe("medium");
  });

  // The gate files; Rob closes. It cannot prove a returning name is the same wrapper, and the
  // ledger records no actor for a machine's closure — so the row says so rather than going stale.
  it("tells Rob nothing will close the row for him", () => {
    for (const f of departureFindings([dep(), dep({ name: "b.sh", wasTrigger: true })], ["x.sh"])) {
      expect(f.detail).toContain("Nothing will close this row for you");
      expect(f.detail).toContain("closing it is yours");
    }
  });

  it("names the lost repo stamp only when there was one", () => {
    expect(departureFindings([dep({ wasRepoStamp: true })])[0].detail).toContain(REPO_STAMP_CALL);
    expect(departureFindings([dep()])[0].detail).not.toContain(REPO_STAMP_CALL);
  });

  it("gives two wrappers two rows and never merges them into one", () => {
    const rows = departureFindings([dep(), dep({ name: "other.sh", wasTrigger: true })]);
    expect(rows.map((r) => r.dedupeKey)).toEqual([
      "wrapper-census-departure:gone.sh",
      "wrapper-census-departure:other.sh",
    ]);
  });

  it("has nothing to file on a clean tick", () => {
    expect(departureFindings([])).toEqual([]);
  });
});

describe("reconcileOpenDepartures (Q84 inc.162)", () => {
  const open = (over: Partial<OpenDeparture> = {}): OpenDeparture => ({
    name: "gone.sh",
    wasRole: "judged",
    wasTrigger: true,
    wasRepoStamp: false,
    orphaned: true,
    ...over,
  });

  it("corrects a stale `high` when a replacement now runs the gate — and does NOT close it", () => {
    const { corrections, open: next } = reconcileOpenDepartures([open()], [], ["new-driver.sh"]);
    expect(corrections).toHaveLength(1);
    expect(corrections[0].dedupeKey).toBe("wrapper-census-departure:gone.sh");
    expect(corrections[0].severity).toBe("medium");
    expect(corrections[0].detail).toContain("CORRECTION, not a closure");
    expect(corrections[0].detail).toContain("new-driver.sh");
    // The row stays in the open set: a correction changes what it says, never that it is open.
    expect(next).toEqual([open({ orphaned: false })]);
  });

  it("corrects the other direction — the sibling it named has since left too", () => {
    const [c] = reconcileOpenDepartures([open({ orphaned: false })], [], []).corrections;
    expect(c.severity).toBe("high");
    expect(c.detail).toContain("NO wrapper runs this gate now");
  });

  it("says nothing when the enforcement claim has not changed", () => {
    expect(reconcileOpenDepartures([open()], [], []).corrections).toEqual([]);
    expect(reconcileOpenDepartures([open({ orphaned: false })], [], ["b.sh"]).corrections).toEqual([]);
  });

  it("cannot invent a row: with no recorded departure it corrects nothing", () => {
    expect(reconcileOpenDepartures([], [], ["b.sh"])).toEqual({
      corrections: [],
      open: [],
      closed: [],
      reopened: [],
      withheld: [],
      unreadableClaims: [],
    });
  });

  // Q84 inc.170 — the correction the gate cannot aim is withheld, not emitted and explained.
  describe("a claim that flips on a key the ledger query cannot read back (inc.170)", () => {
    const unaskable = (over: Partial<OpenDeparture> = {}) => open({ name: "run,thing.sh", ...over });

    it("withholds the correction — it cannot tell an edit from a re-insert over Rob's decision", () => {
      const { corrections, withheld } = reconcileOpenDepartures([unaskable()], [], ["new-driver.sh"]);
      expect(corrections).toEqual([]);
      expect(withheld.map((r) => r.name)).toEqual(["run,thing.sh"]);
    });

    it("freezes `orphaned` with it — an unpublished state is never recorded as published", () => {
      // Were it updated, the gap the correction fires off would close silently and the row on Rob's
      // page would assert the wrong enforcer forever, with nothing left to notice it.
      const { open: next } = reconcileOpenDepartures([unaskable()], [], ["new-driver.sh"]);
      expect(next).toEqual([unaskable()]);
      expect(next[0].orphaned).toBe(true);
    });

    it("withholds in the other direction too — the last enforcer leaving is not special", () => {
      const { corrections, withheld } = reconcileOpenDepartures([unaskable({ orphaned: false })], [], []);
      expect(corrections).toEqual([]);
      expect(withheld).toHaveLength(1);
    });

    it("withholds nothing when the claim did not change — a quiet tick stays quiet", () => {
      expect(reconcileOpenDepartures([unaskable()], [], []).withheld).toEqual([]);
    });

    // Q84 inc.171 — inc.170 asked whether a withheld correction needs a durable `withheldClaim` on
    // the census row. These two pin the answer NO: it is re-derived every tick, and when it stops
    // being true there is nothing left to remember.
    it("recurs every tick — the census fed back in withholds again, so nothing needs storing", () => {
      let rows: OpenDeparture[] = [unaskable()];
      for (let tick = 1; tick <= 3; tick++) {
        const r = reconcileOpenDepartures(rows, [], ["new-driver.sh"]);
        expect(r.corrections, `tick ${tick}`).toEqual([]);
        expect(r.withheld.map((x) => x.name), `tick ${tick}`).toEqual(["run,thing.sh"]);
        expect(r.open, `tick ${tick}`).toEqual([unaskable()]);
        rows = r.open;
      }
    });

    it("stops when the claim flips back — the row is correct again and nothing was ever published wrong", () => {
      const first = reconcileOpenDepartures([unaskable()], [], ["new-driver.sh"]);
      expect(first.withheld).toHaveLength(1);
      // The replacement leaves too, so the tree matches the frozen claim once more.
      const second = reconcileOpenDepartures(first.open, [], []);
      expect(second.withheld).toEqual([]);
      expect(second.corrections).toEqual([]);
      expect(second.open).toEqual([unaskable()]);
    });

    // Q84 inc.172 — inc.171 asked whether `writeCensus()` should read its own write back. It should
    // not; the loss it feared arrives BETWEEN ticks, and it is caught on the way in. These pin the
    // disposition: unreadable claim ⇒ no correction, row kept, recurs, and never repaired in place.
    it("files no correction when the frozen claim is unreadable — it would invent what the row said", () => {
      // `undefined !== false` reads as a flip, and the correction's text branches on `row.orphaned`,
      // so the pre-inc.172 gate posted a claim to Rob's ledger the row was never filed with.
      const lost = { ...open(), orphaned: undefined } as unknown as OpenDeparture;
      const { corrections, unreadableClaims, withheld } = reconcileOpenDepartures([lost], [], []);
      expect(corrections).toEqual([]);
      expect(withheld).toEqual([]);
      expect(unreadableClaims.map((r) => r.name)).toEqual([open().name]);
    });

    it("keeps the row unrepaired and recurring — measuring the claim now would publish it retroactively", () => {
      const lost = { ...open(), orphaned: undefined } as unknown as OpenDeparture;
      let rows: OpenDeparture[] = [lost];
      for (let tick = 1; tick <= 3; tick++) {
        const r = reconcileOpenDepartures(rows, [], []);
        expect(r.corrections, `tick ${tick}`).toEqual([]);
        expect(r.unreadableClaims.map((x) => x.name), `tick ${tick}`).toEqual([open().name]);
        expect(typeof r.open[0].orphaned, `tick ${tick}`).not.toBe("boolean");
        rows = r.open;
      }
    });

    // Q84 inc.173 — inc.172 validated `orphaned` and asked whether to widen. The field one over is
    // WORSE than the one it fixed: `closed` is read with `= false` defaulting, so only `undefined`
    // is caught and a truthy corruption freezes a row Rob never closed — silently, with no stderr
    // line at all. These pin the measured boundary: decisive-or-published fields in, `wasRepoStamp`
    // (read nowhere here) deliberately out, because rejecting a row suppresses a TRUE correction.
    it("does not freeze a row Rob never closed because `closed` corrupted to a truthy non-boolean", () => {
      const bad = { ...open(), closed: "yes" } as unknown as OpenDeparture;
      const r = reconcileOpenDepartures([bad], [], ["new-driver.sh"]);
      expect(r.closed).toEqual([]); // pre-inc.173 this froze the row and said nothing.
      expect(r.corrections).toEqual([]); // and it is not corrected either — the row is unreadable.
      expect(r.unreadableClaims.map((x) => x.name)).toEqual([open().name]);
      expect(r.open).toEqual([bad]); // kept exactly as found: not repaired, not dropped.
    });

    it("refuses a row whose `name` is corrupt — it would become the ledger key of a real POST", () => {
      const bad = { ...open(), name: 42 } as unknown as OpenDeparture;
      const r = reconcileOpenDepartures([bad], [], ["new-driver.sh"]);
      expect(r.corrections).toEqual([]);
      expect(r.unreadableClaims).toHaveLength(1);
    });

    it("refuses a row whose `wasTrigger` is corrupt — it decides the claim, severity and title", () => {
      const bad = { ...open(), wasTrigger: "true" } as unknown as OpenDeparture;
      expect(reconcileOpenDepartures([bad], [], []).corrections).toEqual([]);
      expect(reconcileOpenDepartures([bad], [], []).unreadableClaims).toHaveLength(1);
    });

    it("still corrects when only `wasRepoStamp` is corrupt — this gate never reads it", () => {
      const odd = { ...open(), wasRepoStamp: "no" } as unknown as OpenDeparture;
      const r = reconcileOpenDepartures([odd], [], ["new-driver.sh"]);
      expect(r.unreadableClaims).toEqual([]);
      expect(r.corrections).toHaveLength(1);
    });

    it("names the offending field, so a reader can repair the census", () => {
      expect(unreadableCarriedField(open())).toBeNull();
      expect(unreadableCarriedField({ ...open(), closed: true })).toBeNull();
      expect(unreadableCarriedField({ ...open(), closed: 1 } as unknown as OpenDeparture)).toBe("closed");
      expect(unreadableCarriedField({ ...open(), wasRole: "boss" } as unknown as OpenDeparture)).toBe(
        "wasRole",
      );
    });

    it("leaves every readable key correcting exactly as inc.162 wrote it", () => {
      const { corrections, withheld } = reconcileOpenDepartures([open()], [], ["new-driver.sh"]);
      expect(withheld).toEqual([]);
      expect(corrections).toHaveLength(1);
      expect(corrections[0].detail.endsWith("(Q84 inc.161/162).")).toBe(true);
    });
  });

  it("a name coming back never vouches for its own row (inc.161 sameness)", () => {
    // `gone.sh` present in triggeredBy is not proof the same wrapper returned.
    expect(reconcileOpenDepartures([open()], [], ["gone.sh"]).corrections).toEqual([]);
  });

  it("leaves this tick's own departure to departureFindings — no second body on one key", () => {
    const dep = { name: "gone.sh", wasRole: "judged" as const, wasTrigger: true, wasRepoStamp: false };
    const { corrections, open: next } = reconcileOpenDepartures([open()], [dep], ["b.sh"]);
    expect(corrections).toEqual([]);
    expect(next).toEqual([open({ orphaned: false })]);
  });

  it("records a newly filed departure, and only the two kinds that reach the ledger", () => {
    const filed = { name: "a.sh", wasRole: "judged" as const, wasTrigger: false, wasRepoStamp: false };
    const ignored = { name: "b.sh", wasRole: "skipped" as const, wasTrigger: false, wasRepoStamp: false };
    const { open: next } = reconcileOpenDepartures([], [filed, ignored], []);
    expect(next.map((r) => r.name)).toEqual(["a.sh"]);
  });

  // Q84 inc.163 — correction stops on exactly one piece of evidence: Rob closed the row.
  // Q84 inc.164 — and it RESUMES on its inverse, so the key is kept, not dropped.
  describe("closing and reopening a key (inc.163/164)", () => {
    const KEY = departureKey("gone.sh");
    const closedRow = (over: Partial<OpenDeparture> = {}) => open({ closed: true, ...over });

    it("stops correcting a key Rob resolved, and files NO correction for it", () => {
      // Without this, the correction POSTs a key with no open row, and `planFlagWrite` INSERTS —
      // putting a row he closed back on his page.
      const { corrections, open: next, closed } = reconcileOpenDepartures([open()], [], ["new-driver.sh"], [KEY]);
      expect(corrections).toEqual([]);
      expect(closed.map((r) => r.name)).toEqual(["gone.sh"]);
      // Kept, flagged, and with the filed claim untouched — see the reopen case for why.
      expect(next).toEqual([closedRow({ orphaned: true })]);
    });

    it("keeps saying nothing while it stays closed, and reports the transition only once", () => {
      const { corrections, open: next, closed } = reconcileOpenDepartures(
        [closedRow()],
        [],
        ["new-driver.sh"],
        [KEY],
      );
      expect(corrections).toEqual([]);
      expect(closed).toEqual([]);
      expect(next).toEqual([closedRow()]);
    });

    it("corrects a REOPENED row — the defect inc.163's drop created", () => {
      // He resolved it, then reopened it. The row on his page still claims no wrapper runs this
      // gate; `new-driver.sh` does. Dropped, the gate would never know the key existed.
      const { corrections, open: next, reopened } = reconcileOpenDepartures(
        [closedRow({ orphaned: true })],
        [],
        ["new-driver.sh"],
        [],
        [KEY], // inc.165 — SEEN open on the ledger, not merely absent from it.
      );
      expect(reopened.map((r) => r.name)).toEqual(["gone.sh"]);
      expect(corrections).toHaveLength(1);
      expect(corrections[0].dedupeKey).toBe(KEY);
      expect(corrections[0].severity).toBe("medium");
      expect(corrections[0].detail).toContain("new-driver.sh");
      expect(next).toEqual([open({ orphaned: false })]);
    });

    it("freezes the filed claim while closed, so the reopen is still judged against what the row says", () => {
      // The replacement is wired WHILE the row is closed. If `orphaned` were re-measured then, the
      // gap the correction fires on would close silently and the reopened row would stay stale.
      const afterClosedTick = reconcileOpenDepartures([open()], [], ["new-driver.sh"], [KEY]).open;
      expect(afterClosedTick).toEqual([closedRow({ orphaned: true })]);
      const { corrections } = reconcileOpenDepartures(afterClosedTick, [], ["new-driver.sh"], [], [KEY]);
      expect(corrections).toHaveLength(1);
    });

    // Q84 inc.165 — a reopen needs the same positive evidence a closure needs.
    it("does NOT reopen a closed row that the read simply never mentioned", () => {
      // The reachable cause is a SHORT read, not a deletion: `/api/admin/flags` has no DELETE and
      // never deletes (route header, Rob 2026-07-22), but the GET can come back missing rows
      // (max-rows cap, filtered base URL). Read as a reopen, that un-freezes `orphaned`, prints
      // "you reopened …" to Rob's console for something he never did, and re-POSTs a row he closed.
      const { corrections, open: next, reopened } = reconcileOpenDepartures(
        [closedRow({ orphaned: true })],
        [],
        ["new-driver.sh"],
        [], // read the ledger; this key appears in neither list
        [],
      );
      expect(reopened).toEqual([]);
      expect(corrections).toEqual([]);
      expect(next).toEqual([closedRow({ orphaned: true })]); // still frozen, still closed, still silent
    });

    it("a key seen open that was never closed is untouched by the open list", () => {
      // The new evidence only decides REOPENS. An already-open row is governed by `resolvedKeys`
      // exactly as before, so seeing it open changes nothing about it.
      const { open: next, corrections } = reconcileOpenDepartures([open()], [], ["b.sh"], [], [KEY]);
      expect(next).toEqual([open({ orphaned: false })]);
      expect(corrections).toHaveLength(1);
    });

    it("an unread ledger (null) changes nothing in either direction", () => {
      expect(reconcileOpenDepartures([open()], [], [], null).open).toEqual([open()]);
      // And it does not reopen a closed row on silence, which would re-POST a row Rob closed.
      const { open: next, corrections } = reconcileOpenDepartures([closedRow()], [], ["b.sh"], null);
      expect(next).toEqual([closedRow()]);
      expect(corrections).toEqual([]);
    });

    it("a read ledger holding no resolution keeps the row open", () => {
      expect(reconcileOpenDepartures([open()], [], [], []).open).toEqual([open()]);
    });

    it("never closes on some other finding's key", () => {
      const { open: next } = reconcileOpenDepartures([open()], [], [], ["wrapper-census-departure:other.sh"]);
      expect(next).toEqual([open()]);
    });

    it("a departure filed THIS tick is tracked afresh even if an older row on that key was resolved", () => {
      // It left again. That is a new event, `departureFindings()` files it, and the ledger opens a
      // fresh row — so the census must track it as open rather than carry last month's closure.
      const dep = { name: "gone.sh", wasRole: "judged" as const, wasTrigger: true, wasRepoStamp: false };
      const { open: next, closed } = reconcileOpenDepartures([closedRow()], [dep], [], [KEY]);
      expect(next).toEqual([open({ orphaned: true })]);
      expect(closed).toEqual([]);
    });
  });
});

// Q84 inc.176 — inc.175 got the refusal to the driver; this gets it to Rob. The tick where the gate
// stops tracking his open rows must not leave his page looking current.
describe("what a refused census tells Rob's ledger (Q84 inc.176)", () => {
  const REASON = "it is not valid JSON (Unexpected end of JSON input)";

  it("files exactly ONE row, not one per open departure", () => {
    // The point of the increment: the gate cannot name the rows it has filed on a refused tick —
    // their keys live in `openDepartures`, inside the file that failed to parse. One file-level
    // row is the whole honest output.
    const findings = censusRefusalFinding(REASON);
    expect(findings).toHaveLength(1);
    expect(findings[0].dedupeKey).toBe(CENSUS_REFUSAL_KEY);
    expect(findings[0].dedupeKey).not.toContain("departure:"); // never impersonates a per-wrapper row
  });

  it("says nothing at all when the census read fine", () => {
    expect(censusRefusalFinding(null)).toEqual([]);
    expect(censusRefusalFinding("")).toEqual([]);
  });

  it("carries the parse reason, so the row is repairable without re-running the gate", () => {
    expect(censusRefusalFinding(REASON)[0].detail).toContain(REASON);
    expect(censusRefusalFinding(REASON)[0].detail).toContain("docs/integrity/wrapper-census.json");
  });

  it("is high severity unconditionally — a blind gate has no medium version", () => {
    expect(censusRefusalFinding(REASON)[0].severity).toBe("high");
  });

  it("tells Rob the OTHER rows on his page are frozen, and admits it cannot name them", () => {
    // Without both halves the row is a lie by omission: either his open departure rows read as
    // current, or the silence about which ones implies the set is empty.
    const { detail } = censusRefusalFinding(REASON)[0];
    expect(detail).toMatch(/not re-checked since/);
    expect(detail).toMatch(/cannot name those rows/);
  });

  it("states that a green verdict from this gate no longer covers departures", () => {
    expect(censusRefusalFinding(REASON)[0].detail).toMatch(/NOT "nothing\s+left the audited set"/);
  });

  it("keeps the same key every tick, so it updates in place instead of stacking up", () => {
    expect(censusRefusalFinding("reason A")[0].dedupeKey).toBe(censusRefusalFinding("reason B")[0].dedupeKey);
  });

  it("is shaped like every other finding this gate files", () => {
    // It rides `fileDepartures` unchanged — same POST body contract as `departureFindings`.
    expect(Object.keys(censusRefusalFinding(REASON)[0]).sort()).toEqual(
      Object.keys(
        departureFindings([{ name: "gone.sh", wasRole: "judged", wasTrigger: true, wasRepoStamp: false }], [])[0],
      ).sort(),
    );
  });
});

describe("what a RECOVERED census tells Rob's ledger (Q84 inc.177)", () => {
  it("files nothing when the ledger was never read — absence moves nothing (inc.163/165)", () => {
    expect(censusRecoveryFinding(null)).toEqual([]);
  });

  it("files nothing when Rob already resolved the row — re-filing a closed key INSERTS (inc.169)", () => {
    // `planFlagWrite` treats a POST on a resolved key as "recurred after being resolved" and
    // inserts. A correction aimed at a row he has closed puts that row back on his page.
    expect(censusRecoveryFinding(false)).toEqual([]);
  });

  it("corrects the SAME key, so it edits inc.176's row instead of stacking a second one", () => {
    const findings = censusRecoveryFinding(true);
    expect(findings).toHaveLength(1);
    expect(findings[0].dedupeKey).toBe(CENSUS_REFUSAL_KEY);
    expect(findings[0].dedupeKey).toBe(censusRefusalFinding("some parse reason")[0].dedupeKey);
  });

  it("drops the severity, because the sentence that earned `high` is no longer true", () => {
    expect(censusRefusalFinding("r")[0].severity).toBe("high");
    expect(censusRecoveryFinding(true)[0].severity).toBe("low");
  });

  it("does NOT claim to close the row, and says whose job that is", () => {
    // inc.161's actor leg still stands: a machine's closure lands with nobody's name on it.
    const { detail } = censusRecoveryFinding(true)[0];
    expect(detail).toMatch(/Closing it is yours/);
    expect(detail).toMatch(/rather than closing it/);
  });

  it("admits it cannot say what left the audited set during the blind period", () => {
    // The whole harm of the blindness is that nothing recorded it. A recovery row that only said
    // "all clear" would imply the gap cost nothing.
    expect(censusRecoveryFinding(true)[0].detail).toMatch(/cannot tell you how many ticks/);
  });

  it("is shaped like every other finding this gate files", () => {
    expect(Object.keys(censusRecoveryFinding(true)[0]).sort()).toEqual(
      Object.keys(censusRefusalFinding("r")[0]).sort(),
    );
  });

  it("STATES the claim it replaced instead of pointing at text the correction destroyed (inc.178)", () => {
    // The correction is an in-place UPDATE on the same key, so the `high` sentence is gone the
    // moment this row lands. "Read the warning this row carried before" was a reference to text
    // that exists nowhere — for a Rob who arrives after the repairing tick, the whole content of
    // the alarm. So the two facts that earned `high` are restated here in this row's own words.
    const { detail } = censusRecoveryFinding(true)[0];
    expect(detail).not.toMatch(/warning this row carried before/);
    expect(detail).toContain(CENSUS_BLINDNESS_CLAIM);
    expect(detail).toMatch(/NOT "nothing left the audited set"/);
    // And it says WHY it is carrying them, so the sentence does not read as padding.
    expect(detail).toMatch(/you may never have seen it/);
  });

  it("QUOTES the refusal row's claim from one source instead of restating it (inc.179)", () => {
    // inc.178 left the same claim in two hand-maintained strings, and the recovery row introduces
    // its copy as what this row SAID — so a lone edit to the refusal text would not make this row
    // stale, it would make it a false quotation. Both rows now read the same constant, byte for
    // byte, which is the only shape in which "here is the warning itself" can stay true.
    expect(censusRefusalFinding("r")[0].detail).toContain(CENSUS_BLINDNESS_CLAIM);
    expect(censusRecoveryFinding(true)[0].detail).toContain(CENSUS_BLINDNESS_CLAIM);
  });

  it("carries the shared claim exactly once per row — quoted, not duplicated alongside a paraphrase", () => {
    // A second copy inside either row would reintroduce the drift the constant exists to remove,
    // and on the recovery row would put a paraphrase next to the quotation it contradicts.
    for (const detail of [censusRefusalFinding("r")[0].detail, censusRecoveryFinding(true)[0].detail]) {
      expect(detail.split(CENSUS_BLINDNESS_CLAIM)).toHaveLength(2);
    }
  });

  it("keeps the refusal row's tense-bound and parameterised text OUT of the quote", () => {
    // The remedy and the "updates in place every tick until then" promise are false once the file
    // parses, and the parse reason has no meaning on a recovered tick. Quoting the refusal row
    // whole would ship instructions that no longer apply — only the claim is shared.
    expect(CENSUS_BLINDNESS_CLAIM).not.toMatch(/Repair the file/);
    expect(CENSUS_BLINDNESS_CLAIM).not.toMatch(/updates in place/);
    expect(censusRecoveryFinding(true)[0].detail).not.toMatch(/Repair the file/);
  });

  it("never carries the superseded grammar, so this correction can never grow a Reopen control", () => {
    // `supersededNote`/`supersededBy` is the machinery inc.177 asked about, and it is structurally
    // wrong here: it is written into `resolution_note` on rows the pass RESOLVES, and `supersededBy`
    // is the same anchored predicate that draws Reopen (inc.10). On an OPEN row it would describe
    // itself as superseded and offer to be reopened — inc.92's defect verbatim.
    const finding = censusRecoveryFinding(true)[0];
    expect(supersededBy(finding.detail)).toBeNull();
    expect(supersededBy(finding.title)).toBeNull();
  });

  it("does not grow: the correction is one bounded clause, not an appended history", () => {
    // A row re-asserted on a 30-minute timer that appends each superseded claim becomes the
    // changelog inc.177 named as the failure mode of the other answer. Same input, same bytes.
    expect(censusRecoveryFinding(true)[0].detail).toBe(censusRecoveryFinding(true)[0].detail);
    expect(censusRecoveryFinding(true)).toHaveLength(1);
  });
});

describe("the withheld-because-unreadable rows reach Rob's page (Q84 inc.180)", () => {
  const readable = { name: "gone.sh", wasRole: "judged", wasTrigger: true, orphaned: false } as never;
  const badClosed = { ...(readable as object), closed: "yes" } as never;
  const badName = { name: "", wasRole: "judged", wasTrigger: true, orphaned: false } as never;

  it("says nothing when every carried claim is readable and the key is not open", () => {
    expect(censusUnreadableRowsRow([], null)).toEqual([]);
  });

  it("files ONE file-level row, never one PATCH per affected row (inc.172/173)", () => {
    // Per-row would mean PATCHing title+detail+severity together — republishing the very claim the
    // gate has just declared unreadable, which inc.172/173 refuse outright.
    const findings = censusUnreadableRowsRow([badClosed, badName], null);
    expect(findings).toHaveLength(1);
    expect(findings[0].dedupeKey).toBe(CENSUS_UNREADABLE_ROWS_KEY);
    expect(findings[0].severity).toBe("medium");
  });

  it("names the affected rows and the field, so the census can actually be repaired", () => {
    const detail = censusUnreadableRowsRow([badClosed], null)[0].detail;
    expect(detail).toContain(departureKey("gone.sh"));
    expect(detail).toContain("`closed`");
  });

  it("a row whose own `name` is unreadable is described, not quoted as a key", () => {
    const detail = censusUnreadableRowsRow([badName], null)[0].detail;
    expect(detail).toContain("no key to quote");
    expect(detail).not.toContain(departureKey(""));
  });

  it("does NOT reuse CENSUS_REFUSAL_KEY — a bounded frozen subset is not a blind file", () => {
    expect(CENSUS_UNREADABLE_ROWS_KEY).not.toBe(CENSUS_REFUSAL_KEY);
  });

  it("the retraction obeys the same ledger evidence rule as inc.177's", () => {
    expect(censusUnreadableRowsRow([], null)).toEqual([]);
    expect(censusUnreadableRowsRow([], false)).toEqual([]);
    const recovery = censusUnreadableRowsRow([], true);
    expect(recovery).toHaveLength(1);
    expect(recovery[0].dedupeKey).toBe(CENSUS_UNREADABLE_ROWS_KEY);
    expect(recovery[0].severity).toBe("low");
  });

  it("does not claim to know how long the rows were frozen — nothing recorded it", () => {
    expect(censusUnreadableRowsRow([], true)[0].detail).toContain("cannot tell you how many ticks");
  });

  it("is shaped like every other finding this gate files", () => {
    expect(Object.keys(censusUnreadableRowsRow([badClosed], null)[0]).sort()).toEqual(
      Object.keys(censusRefusalFinding("some reason")[0]).sort(),
    );
  });

  // Q84 inc.181 — the exclusivity is IN the pair, not in a caller that remembers to check.
  it("an open key NEVER retracts an alarm that is still true (inc.181)", () => {
    // The dangerous tick: rows unreadable AND the key open from a previous tick's alarm. Both
    // builders stamp the same dedupeKey, and `fileDepartures` POSTs in array order against a route
    // that corrects in place — so emitting both would overwrite the alarm with its own retraction
    // and tell Rob every row is readable on the tick they are not.
    const findings = censusUnreadableRowsRow([badClosed], true);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].detail).not.toContain("readable again");
  });

  it("never returns two rows for one key, on any combination of inputs (inc.181)", () => {
    for (const rows of [[], [badClosed], [badClosed, badName]] as OpenDeparture[][]) {
      for (const keyOpen of [true, false, null]) {
        const findings = censusUnreadableRowsRow(rows, keyOpen);
        expect(findings.length).toBeLessThanOrEqual(1);
        expect(new Set(findings.map((f) => f.dedupeKey)).size).toBe(findings.length);
      }
    }
  });
});
