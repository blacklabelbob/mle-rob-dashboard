import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  resolveNoteInstructionGap,
  resolveInstructionSubjects,
  CLAUSE_CAUTION,
  FLEET_RESOLVE_GUARD,
} from "../fleetResolveDoc";
import { vacuousGuardNotice } from "../scanPerimeter";

// Q84 inc.99 — the judgement is pure and unit-tested below; this file also walks the real
// `.claude/agents/` tree, because a rule that only ever sees synthetic strings is a rule the
// fleet can drift out from under. Reading bytes is the caller's job (CR-3) and here the caller
// is the test.
const AGENT_DIR = path.resolve(import.meta.dirname, "../../../.claude/agents");

const RESOLVE_DOC = 'resolve the flag with `PATCH /api/admin/flags {id, action:"resolve", note}`';

describe("resolveNoteInstructionGap", () => {
  it("says nothing about a file that never resolves a flag", () => {
    expect(resolveNoteInstructionGap("a.md", "POST /api/admin/flags with entityName…")).toBeNull();
    expect(resolveNoteInstructionGap("a.md", "")).toBeNull();
  });

  it("names the gap when a resolve instruction carries no clause rule", () => {
    const finding = resolveNoteInstructionGap("a.md", RESOLVE_DOC);
    expect(finding).not.toBeNull();
    expect(finding).toContain("a.md");
  });

  it("goes quiet once the file states the rule", () => {
    const fixed = `${RESOLVE_DOC}\n\nThe note ${CLAUSE_CAUTION} C-1234." — reword it.`;
    expect(resolveNoteInstructionGap("a.md", fixed)).toBeNull();
  });

  it("catches the instruction however the file spaces or quotes it", () => {
    for (const spelling of [
      'PATCH /api/admin/flags {id, action:"resolve"}',
      'PATCH `/api/admin/flags` with `{ id, action: "resolve", note }`',
    ]) {
      expect(resolveNoteInstructionGap("a.md", spelling), spelling).not.toBeNull();
    }
  });
});

describe("the live agent fleet", () => {
  const files = readdirSync(AGENT_DIR).filter((f) => f.endsWith(".md"));
  const docs = files.map((f) => ({
    path: `.claude/agents/${f}`,
    content: readFileSync(path.join(AGENT_DIR, f), "utf8"),
  }));

  it("has agent files to check at all — an empty sweep must not read as clean", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // Q84 inc.121 — the pin above proves the sweep REACHED files; this one proves the rule was
  // ABOUT one. They are a pair on purpose: without the first, an empty directory reads as a blind
  // recogniser; without this, a recogniser that matches nothing is green for a reason
  // indistinguishable from a fleet that simply never resolves a flag (inc.120's shape). This
  // guard's whole subject set today is a single file, so that is one edit away, not hypothetical.
  it("still recognises a resolve instruction somewhere on the live fleet", () => {
    const subjects = resolveInstructionSubjects(docs);
    expect(vacuousGuardNotice(subjects, FLEET_RESOLVE_GUARD, "resolve instruction")).toBeNull();
    expect(subjects).toContain(".claude/agents/meeting-scribe.md");
  });

  it("names the guard, not the module, when the fleet stops instructing resolves", () => {
    const notice = vacuousGuardNotice([], FLEET_RESOLVE_GUARD, "resolve instruction");
    expect(notice).toContain(FLEET_RESOLVE_GUARD);
    expect(notice).toContain("Fix the recogniser, or delete the guard");
    // Coverage's promise is not borrowed here: this names a rule that stopped meaning anything.
    expect(notice).not.toContain("Nothing below is wrong");
  });

  it("subjects and judgement ask the same question — a gap file is always a subject", () => {
    const gapDoc = { path: "a.md", content: RESOLVE_DOC };
    expect(resolveInstructionSubjects([gapDoc])).toEqual(["a.md"]);
    expect(resolveNoteInstructionGap(gapDoc.path, gapDoc.content)).not.toBeNull();
    // …and a file that states the rule stays a subject: it is judged and passes, not skipped.
    const fixed = `${RESOLVE_DOC}\nThe note ${CLAUSE_CAUTION} <id>."`;
    expect(resolveInstructionSubjects([{ path: "b.md", content: fixed }])).toEqual(["b.md"]);
    expect(resolveNoteInstructionGap("b.md", fixed)).toBeNull();
  });

  it("has no agent telling the fleet to resolve a flag without the clause rule", () => {
    const gaps = docs
      .map((d) => resolveNoteInstructionGap(d.path, d.content))
      .filter((g): g is string => g !== null);
    expect(gaps).toEqual([]);
  });
});
