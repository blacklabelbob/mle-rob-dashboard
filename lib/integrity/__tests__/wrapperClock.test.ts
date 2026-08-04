import { describe, it, expect } from "vitest";
import { auditWrapperClocks, ROB_FACING_SURFACES, REPO_STAMP_CALL } from "../wrapperClock";

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
});
