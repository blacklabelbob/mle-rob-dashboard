import { describe, expect, it } from "vitest";

import { classify, render, scanDoc } from "../openQuestions";

const TODAY = "2026-08-05";

describe("open-question staleness gate (INCIDENT-LEDGER #38)", () => {
  // The line that actually caused the incident, verbatim from the 2026-07-08 dossier.
  const THE_LINE =
    "Gary↔Miga tie is publicly UNVERIFIED — dashed edge; ask Rob its nature.";

  it("catches the real line that sat unasked for 28 days", () => {
    const found = scanDoc("waskovich-dececco-miga.md", THE_LINE, TODAY, "2026-07-08");
    expect(found).toHaveLength(1);
    expect(found[0].ageDays).toBe(28);
    const v = classify(found);
    expect(v.stale).toHaveLength(1);
    expect(v.open).toHaveLength(0);
  });

  it("would have failed at the 14-day threshold, twice over", () => {
    const found = scanDoc("d.md", THE_LINE, "2026-07-23", "2026-07-08");
    expect(classify(found).stale).toHaveLength(1);
  });

  it("a question raised this week is open, not stale", () => {
    const found = scanDoc("d.md", "UNRESOLVED — ask Rob which entity signs.", TODAY, "2026-08-01");
    const v = classify(found);
    expect(v.open).toHaveLength(1);
    expect(v.stale).toHaveLength(0);
  });

  it("an ANSWERED question stops counting — this is what lets a doc keep its history", () => {
    const answered =
      "Was UNVERIFIED — Rob confirmed 2026-08-05 that Gary is a co-owner. Do not re-flag.";
    expect(scanDoc("d.md", answered, TODAY, "2026-07-08")).toHaveLength(0);
  });

  it("every ROB-DIRECTED phrase is caught", () => {
    for (const line of [
      "ask Rob its nature",
      "needs Rob",
      "CONFIRM w/ Rob it's Scott's shop",
      "[CONFIRM WITH ROB]",
      "This is Rob's call.",
      "UNRESOLVED — ask Rob which entity signs",
      "needs Rob's confirmation, not a web answer",
    ]) {
      expect(scanDoc("d.md", line, TODAY, "2026-07-01"), line).toHaveLength(1);
    }
  });

  // The first draft fired on these and produced 29 findings on its first real run,
  // most of them correct research notation. A gate that punishes honest sourcing
  // gets switched off, and then it protects nothing.
  it("does NOT fire on honest sourcing notation — nobody is being asked", () => {
    for (const line of [
      "| [UNVERIFIED] | Warm transfer to a browser rep | — |",
      "- 50 — Recording API exists but webhook coverage is unverified.",
      "- 30 — Either feature unconfirmed or effectively unavailable via API.",
      "Records with a phone number | 2 / 34 (one flagged public record — unverified)",
      "Agent roster count: still unresolved — the team publishes no headcount.",
    ]) {
      expect(scanDoc("d.md", line, TODAY, "2026-07-01"), line).toHaveLength(0);
    }
  });

  it("prose that merely mentions Rob is not a question", () => {
    for (const line of [
      "Rob met them on 7/28 in Bonita Springs.",
      "Verified against the FL DFS licensee registry.",
      "Rob quoted $28,000 in the room.",
    ]) {
      expect(scanDoc("d.md", line, TODAY, "2026-07-01"), line).toHaveLength(0);
    }
  });

  it("a line's own date beats the document's", () => {
    const [q] = scanDoc("d.md", "2026-08-04 — UNRESOLVED, ask Rob.", TODAY, "2026-01-01");
    expect(q.raisedOn).toBe("2026-08-04");
    expect(q.ageDays).toBe(1);
  });

  // A licence number issued 2023-01-11 sitting in the same line aged one real question
  // to 1302 days. A question cannot predate the document that contains it.
  it("ignores a stray older date on the line and falls back to the doc's", () => {
    const line = "ask Rob — phone confirmed on the company page (FL licence 2023-01-11).";
    const [q] = scanDoc("d.md", line, TODAY, "2026-07-17");
    expect(q.raisedOn).toBe("2026-07-17");
    expect(q.ageDays).toBe(19);
  });

  it("an undated question is surfaced separately, never silently passed", () => {
    const found = scanDoc("d.md", "UNRESOLVED — ask Rob.", TODAY, null);
    const v = classify(found);
    expect(v.undated).toHaveLength(1);
    expect(v.stale).toHaveLength(0);
    expect(render(v)).toContain("no date");
  });

  it("the report names lines, never just a count", () => {
    const v = classify(scanDoc("f.md", THE_LINE, TODAY, "2026-07-08"));
    const text = render(v);
    expect(text).toContain("f.md:1");
    expect(text).toContain("[28d]");
    expect(text).toContain("reads like a finding");
  });

  it("a clean doc says so", () => {
    expect(render(classify([]))).toContain("ok —");
  });

  it("is deterministic — today is a parameter, never a clock", () => {
    const a = scanDoc("d.md", THE_LINE, TODAY, "2026-07-08");
    const b = scanDoc("d.md", THE_LINE, TODAY, "2026-07-08");
    expect(a).toEqual(b);
    const src = String(scanDoc);
    expect(src).not.toContain("Date.now");
  });
});
