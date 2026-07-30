import { describe, it, expect } from "vitest";
import {
  buildManualLog,
  describeProblem,
  problemsFromRefusal,
  localToIsoInstant,
  MANUAL_LOG_PROBLEM_LABELS,
  STAGE_CHANGE_OPTIONS,
  CHANNEL_LABELS,
  type ManualLogFormState,
} from "../manualLogForm";
import { MANUAL_CHANNELS, validateManualLog } from "../requiredFields";
import { REP_PIPELINE_STAGES } from "@/lib/deals/repPipelineBoard";

const ANCHOR = { personId: "p-1", createdBy: "Jake Torres" };
const ET_SUMMER = 240; // minutes to add to local to reach UTC

const COMPLETE: ManualLogFormState = {
  occurredAtLocal: "2026-07-30T14:30",
  channel: "call",
  referralSource: "none",
  doorOpened: "no",
  nextStep: "Send the Phase 1 quote",
  nextStepDue: "2026-08-03",
  stageChange: "none",
};

describe("localToIsoInstant", () => {
  it("converts a local datetime with the caller's offset (no clock in the module)", () => {
    expect(localToIsoInstant("2026-07-30T14:30", ET_SUMMER)).toBe("2026-07-30T18:30:00.000Z");
    expect(localToIsoInstant("2026-01-15T09:00", 300)).toBe("2026-01-15T14:00:00.000Z");
    expect(localToIsoInstant("2026-07-30T14:30", 0)).toBe("2026-07-30T14:30:00.000Z");
  });

  it("returns undefined rather than an invented instant", () => {
    expect(localToIsoInstant("", ET_SUMMER)).toBeUndefined();
    expect(localToIsoInstant(undefined, ET_SUMMER)).toBeUndefined();
    expect(localToIsoInstant("not a date", ET_SUMMER)).toBeUndefined();
    expect(localToIsoInstant("2026-07-30", ET_SUMMER)).toBeUndefined(); // day only
    expect(localToIsoInstant("2026-07-30T14:30", Number.NaN)).toBeUndefined();
  });

  it("refuses a calendar date that does not exist instead of rolling it forward", () => {
    // Date.UTC(2026, 1, 31) silently becomes March 3 — a rep would see an
    // instant they never picked, on a record that is supposed to be evidence.
    expect(localToIsoInstant("2026-02-31T10:00", ET_SUMMER)).toBeUndefined();
  });
});

describe("buildManualLog — composes the server's rule, never its own", () => {
  it("a complete form passes and produces the route's exact body", () => {
    const { payload, validation, problems } = buildManualLog(COMPLETE, ANCHOR, ET_SUMMER);
    expect(validation.ok).toBe(true);
    expect(problems).toEqual([]);
    expect(payload).toEqual({
      source: "manual",
      personId: "p-1",
      createdBy: "Jake Torres",
      type: "call",
      occurredAt: "2026-07-30T18:30:00.000Z",
      sourceContext: {
        referral_source: "none",
        door_opened: { opened: false },
        next_step: { description: "Send the Phase 1 quote", due_date: "2026-08-03" },
        stage_change: "none",
      },
    });
  });

  it("an empty form is rejected by the SERVER rule, and every refusal is rep-readable", () => {
    const { validation, problems } = buildManualLog({}, ANCHOR, ET_SUMMER);
    expect(validation.ok).toBe(false);
    expect(problems.length).toBe(validation.ok ? 0 : validation.missing.length);
    for (const p of problems) expect(p).not.toMatch(/unlabelled/);
  });

  // THE THIRD STATE. An unanswered door question must not become a "no".
  it("omits door_opened when unanswered, so the save is refused instead of fabricating a no", () => {
    const { payload, validation } = buildManualLog(
      { ...COMPLETE, doorOpened: undefined },
      ANCHOR,
      ET_SUMMER
    );
    expect(payload.sourceContext.door_opened).toBeUndefined();
    expect(validation).toEqual({ ok: false, missing: ["sourceContext.door_opened.opened"] });
  });

  it("distinguishes an answered no from an unanswered question", () => {
    const answered = buildManualLog({ ...COMPLETE, doorOpened: "no" }, ANCHOR, ET_SUMMER);
    const unanswered = buildManualLog({ ...COMPLETE, doorOpened: undefined }, ANCHOR, ET_SUMMER);
    expect(answered.validation.ok).toBe(true);
    expect(unanswered.validation.ok).toBe(false);
  });

  it("a yes without a name is refused; the name only travels with a yes", () => {
    const yesNoName = buildManualLog({ ...COMPLETE, doorOpened: "yes" }, ANCHOR, ET_SUMMER);
    expect(yesNoName.validation).toEqual({
      ok: false,
      missing: ["sourceContext.door_opened.by"],
    });

    const yesNamed = buildManualLog(
      { ...COMPLETE, doorOpened: "yes", doorOpenedBy: "Trent Brands" },
      ANCHOR,
      ET_SUMMER
    );
    expect(yesNamed.validation.ok).toBe(true);
    expect(yesNamed.payload.sourceContext.door_opened).toEqual({
      opened: true,
      by: "Trent Brands",
    });

    // A name left in the box after switching to "no" must not record an opener
    // for a door that did not open.
    const noWithStaleName = buildManualLog(
      { ...COMPLETE, doorOpened: "no", doorOpenedBy: "Trent Brands" },
      ANCHOR,
      ET_SUMMER
    );
    expect(noWithStaleName.payload.sourceContext.door_opened).toEqual({ opened: false });
  });

  it('"none" is an ANSWER for referral source and stage change; blank is not', () => {
    for (const field of ["referralSource", "stageChange"] as const) {
      const blank = buildManualLog({ ...COMPLETE, [field]: "   " }, ANCHOR, ET_SUMMER);
      expect(blank.validation.ok).toBe(false);
      const none = buildManualLog({ ...COMPLETE, [field]: "none" }, ANCHOR, ET_SUMMER);
      expect(none.validation.ok).toBe(true);
    }
  });

  it("trims, and never sends a whitespace-only field as an answer", () => {
    const { payload, validation } = buildManualLog(
      { ...COMPLETE, nextStep: "  Send the quote  ", summary: "   " },
      ANCHOR,
      ET_SUMMER
    );
    expect(validation.ok).toBe(true);
    expect((payload.sourceContext.next_step as { description: string }).description).toBe(
      "Send the quote"
    );
    expect("summary" in payload).toBe(false);
  });

  it("reports a half-filled next step per half, not as one lump", () => {
    const noDue = buildManualLog({ ...COMPLETE, nextStepDue: "" }, ANCHOR, ET_SUMMER);
    expect(noDue.validation).toEqual({
      ok: false,
      missing: ["sourceContext.next_step.due_date"],
    });
    const noDesc = buildManualLog({ ...COMPLETE, nextStep: "" }, ANCHOR, ET_SUMMER);
    expect(noDesc.validation).toEqual({
      ok: false,
      missing: ["sourceContext.next_step.description"],
    });
  });

  it("an unanchored form is refused — a log with no contact is not a log", () => {
    const { validation } = buildManualLog(COMPLETE, {}, ET_SUMMER);
    expect(validation.ok).toBe(false);
    expect(validation.ok === false && validation.missing).toContain("personId|orgId");
  });

  it("pins source=manual so the route cannot bounce it as an automated capture", () => {
    expect(buildManualLog(COMPLETE, ANCHOR, ET_SUMMER).payload.source).toBe("manual");
  });

  // THE DECLARATION / WRITE BOUNDARY.
  it("stage_change is a declaration only — the payload carries no deal-stage write", () => {
    const { payload } = buildManualLog(
      { ...COMPLETE, stageChange: "quote_sent" },
      ANCHOR,
      ET_SUMMER
    );
    expect(payload.sourceContext.stage_change).toBe("quote_sent");
    // Nothing that PATCH /api/admin/deals would act on may appear here.
    for (const forbidden of ["stage", "dealId", "deal_stage", "value", "quotedAmount"]) {
      expect(forbidden in payload).toBe(false);
    }
  });
});

describe("labels cover the rule, and the rule cannot outgrow them silently", () => {
  /**
   * Non-vacuity: drive the validator itself to enumerate every path it can
   * emit, rather than trusting a hand-copied list. A rule added to
   * requiredFields.ts tomorrow lands here, not on a rep's screen as a raw path.
   */
  it("every payload path validateManualLog can emit has a rep-readable label", () => {
    const emitted = new Set<string>();
    const collect = (r: ReturnType<typeof validateManualLog>) => {
      if (!r.ok) r.missing.forEach((m) => emitted.add(m));
    };
    collect(validateManualLog({})); // every absence at once
    collect(
      validateManualLog({
        personId: "p-1",
        type: "call",
        occurredAt: "2026-07-30T18:30:00.000Z",
        sourceContext: {
          referral_source: "none",
          door_opened: { opened: true }, // the `by` branch
          next_step: { description: "x", due_date: "2026-08-03" },
          stage_change: "none",
        },
      })
    );

    expect(emitted.size).toBeGreaterThan(0); // the enumeration must not be empty
    for (const path of emitted) {
      expect(MANUAL_LOG_PROBLEM_LABELS[path], `no label for ${path}`).toBeTruthy();
      expect(describeProblem(path)).not.toMatch(/unlabelled/);
    }
    // And no label describes a path the rule cannot produce (dead fix-it text).
    for (const path of Object.keys(MANUAL_LOG_PROBLEM_LABELS)) {
      expect(emitted.has(path), `label for unreachable path ${path}`).toBe(true);
    }
  });

  it("an unlabelled path is loud, not blank", () => {
    expect(describeProblem("sourceContext.something_new")).toMatch(/unlabelled/);
    expect(describeProblem("sourceContext.something_new")).toContain("sourceContext.something_new");
  });

  it("channel options match the rule's channels exactly, each with a label", () => {
    expect(Object.keys(CHANNEL_LABELS).sort()).toEqual([...MANUAL_CHANNELS].sort());
    for (const c of MANUAL_CHANNELS) expect(CHANNEL_LABELS[c].length).toBeGreaterThan(0);
  });

  it('stage-change options are "none" plus the rep ladder — nothing invented', () => {
    expect(STAGE_CHANGE_OPTIONS[0]).toBe("none");
    expect([...STAGE_CHANGE_OPTIONS].slice(1)).toEqual([...REP_PIPELINE_STAGES]);
    // Every offered stage must be one the rule accepts as a declaration.
    for (const stage of STAGE_CHANGE_OPTIONS) {
      const { validation } = buildManualLog({ ...COMPLETE, stageChange: stage }, ANCHOR, ET_SUMMER);
      expect(validation.ok, `stage option ${stage} rejected`).toBe(true);
    }
  });
});

// Q46 R10 inc.2 — the SERVER's refusal, in the rep's words.
describe("problemsFromRefusal", () => {
  it("translates the route's field list into rep-readable lines", () => {
    const lines = problemsFromRefusal(400, {
      error: "missing required interaction fields (Task 1.9)",
      missing: ["occurredAt", "sourceContext.door_opened.opened"],
    });
    expect(lines).toEqual([
      MANUAL_LOG_PROBLEM_LABELS.occurredAt,
      MANUAL_LOG_PROBLEM_LABELS["sourceContext.door_opened.opened"],
    ]);
    // The raw payload path never reaches the screen for a labelled rule.
    expect(lines.join(" ")).not.toContain("sourceContext.");
  });

  it("never returns an empty list — a silent refusal reads as a save", () => {
    for (const [status, body] of [
      [400, { error: "this route logs manual interactions only" }],
      [500, { error: "save failed" }],
      [500, {}],
      [502, null],
      [400, { missing: [] }],
      [400, { missing: "occurredAt" }],
    ] as [number, unknown][]) {
      const lines = problemsFromRefusal(status, body);
      expect(lines.length, `status ${status} produced no line`).toBeGreaterThan(0);
      expect(lines.every((l) => l.trim().length > 0)).toBe(true);
      expect(lines[0]).toContain("Not saved");
    }
  });

  it("a path the server invents still renders loudly rather than blank", () => {
    const [line] = problemsFromRefusal(400, { missing: ["sourceContext.brand_new_rule"] });
    expect(line).toMatch(/unlabelled/);
    expect(line).toContain("sourceContext.brand_new_rule");
  });
});
