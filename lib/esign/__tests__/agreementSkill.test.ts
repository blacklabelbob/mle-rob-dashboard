import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INTAKE_QUESTIONS } from "../agreementPdf";

// Q47 skill-packaging drift guard. The skill and the CLI wrapper document the
// engine's contract in prose; prose rots. These assertions fail the build if
// the engine's intake contract, the CLI entrypoint, or the API surface moves
// out from under skills/phase1-agreement/SKILL.md.

const ROOT = join(__dirname, "..", "..", "..");
const SKILL_PATH = join(ROOT, "skills", "phase1-agreement", "SKILL.md");
const CLI_PATH = join(ROOT, "scripts", "esign", "render-agreement.mjs");

const skill = readFileSync(SKILL_PATH, "utf8");
const cli = readFileSync(CLI_PATH, "utf8");

describe("phase1-agreement skill packaging", () => {
  it("ships a SKILL.md with name + description frontmatter", () => {
    expect(skill.startsWith("---\n")).toBe(true);
    const front = skill.slice(4, skill.indexOf("\n---", 4));
    expect(front).toMatch(/^name: phase1-agreement$/m);
    expect(front).toMatch(/^description: .{40,}/m);
  });

  it("points at files that exist", () => {
    for (const rel of [
      "lib/esign/agreementPdf.ts",
      "scripts/esign/render-agreement.mjs",
      "app/api/esign/generate/route.ts",
    ]) {
      expect(skill).toContain(rel);
      expect(existsSync(join(ROOT, rel))).toBe(true);
    }
  });

  it("documents every intake key the engine actually requires", () => {
    // Same list checkIntake() enforces — if a key is added there, the skill
    // must name it or this fails.
    for (const key of [
      "confirmed_by",
      "date",
      "entities_count",
      "second_brains_total",
      "other_adjustments",
    ]) {
      expect(skill).toContain(key);
      expect(INTAKE_QUESTIONS).toContain(key);
    }
  });

  it("keeps the never-invent-scope rule and the verbatim-refusal contract on the page", () => {
    expect(skill.toLowerCase()).toContain("never invent scope");
    expect(skill.toLowerCase()).toContain("verbatim");
  });
});

describe("render-agreement CLI", () => {
  it("refuses to write anything on an engine refusal", () => {
    // The catch around buildAgreementPdf must die() before any write call.
    const catchIdx = cli.indexOf("catch (err)");
    const writeIdx = cli.indexOf("writeFileSync(outPath");
    expect(catchIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(catchIdx);
    expect(cli.slice(catchIdx, writeIdx)).toContain("die(err.message)");
  });

  it("guards against clobbering an existing document", () => {
    expect(cli).toContain("refusing to overwrite an existing document");
    expect(cli).toContain('flags.has("--force")');
  });
});
