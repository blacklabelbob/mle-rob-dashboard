import { describe, it, expect } from "vitest";
import {
  auditWrapperClocks,
  clockGateBrief,
  BRIEF_MARKER,
  ROB_FACING_SURFACES,
  REPO_STAMP_CALL,
  TRIGGER_CALLS,
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
});
