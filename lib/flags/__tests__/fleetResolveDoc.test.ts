import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveNoteInstructionGap, CLAUSE_CAUTION } from "../fleetResolveDoc";

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

  it("has agent files to check at all — an empty sweep must not read as clean", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("has no agent telling the fleet to resolve a flag without the clause rule", () => {
    const gaps = files
      .map((f) => resolveNoteInstructionGap(`.claude/agents/${f}`, readFileSync(path.join(AGENT_DIR, f), "utf8")))
      .filter((g): g is string => g !== null);
    expect(gaps).toEqual([]);
  });
});
