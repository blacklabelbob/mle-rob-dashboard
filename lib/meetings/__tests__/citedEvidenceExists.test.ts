import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Q89 inc.26 — the gate this increment exists because of.
 *
 * inc.25 shipped a code comment and a test fixture citing an `archive-reads/…deepread.txt`
 * file under the meetings archive as the source of four "verbatim" excerpts. **That file
 * has never existed.** Nothing caught it: a citation inside a comment is invisible to the
 * compiler, to the linter and to every other test.
 *
 * (The dead path is described here rather than written out, because writing it out would
 * trip this very sweep — the sweep does not read comments differently from code, and that
 * is the point.)
 *
 * This is the same family as INCIDENT-LEDGER #37 — a sentence asserting evidence that
 * was never a statement about anything real. #37's fix made the build's exit code get
 * re-proven; this one makes a cited FILE get re-proven. Prose ("cite carefully") is not
 * a fix, so the rule is code: every meeting-archive path named anywhere under
 * `lib/meetings/` must resolve on disk, or this test is red.
 *
 * Scope is deliberately narrow — the `MLE Internal Meetings/` tree — because that is
 * where the evidence for every Q84/Q89 claim lives and where a fabricated citation
 * does real damage. Widen it when a second tree starts carrying evidence.
 */

const ROOT = join(__dirname, "..", "..", "..");
const MEETINGS_DIR = join(__dirname, "..");
const EVIDENCE_PATH = /MLE Internal Meetings\/[A-Za-z0-9._\-/]+/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
  });
}

describe("every archive file cited under lib/meetings/ actually exists (Q89 inc.26)", () => {
  const cited = sourceFiles(MEETINGS_DIR).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return [...new Set(text.match(EVIDENCE_PATH) ?? [])].map((path) => ({ file, path }));
  });

  it("finds citations to check — an empty sweep would pass vacuously", () => {
    expect(cited.length).toBeGreaterThan(0);
  });

  it.each(cited)("$path (cited in $file) resolves on disk", ({ path }) => {
    expect(existsSync(join(ROOT, path))).toBe(true);
  });
});

/**
 * Q89 inc.27 — a file that exists is only half the citation.
 *
 * inc.26 replaced the dead path with a real one and then asserted three numbers about it
 * that do not hold: "62,454 chars" (it is 23,883), "Omega 3" in the body (the transcript
 * body says it twice; the third is in the summary block), and "Martin Fiero 5" (three).
 * The file-exists gate above passed all three, because it only ever asked whether the
 * file was there. So the same failure shape survived the fix built for it — which is the
 * definition of a fix scoped too narrowly (ONE LOG recurrence duty).
 *
 * The numbers are therefore no longer prose. They are computed from the file here, and
 * the comments that quote them are quoting these assertions. Anything restated in a
 * comment and not pinned below is still only prose — pin it or do not write it.
 */
const PRECALL_TRANSCRIPT = "MLE Internal Meetings/transcripts/01KZ4ZNFE9ZKDJ6T9H4508PC9E.json";

describe("the counts cited about the Q89 pre-call row are computed, not asserted (inc.27)", () => {
  const raw = JSON.parse(readFileSync(join(ROOT, PRECALL_TRANSCRIPT), "utf8"));
  const sentences: Array<{ speaker_name: string; raw_text: string }> = raw.sentences;
  const body = sentences.map((s) => `${s.speaker_name}: ${s.raw_text}`).join("\n");
  const count = (re: RegExp) => (body.match(re) ?? []).length;

  it("is the row the comments name: snf-vmxj-dpo, 2026-08-03T23:34Z", () => {
    expect(raw.id).toBe("01KZ4ZNFE9ZKDJ6T9H4508PC9E");
    expect(raw.title).toBe("snf-vmxj-dpo");
    expect(raw.dateString).toBe("2026-08-03T23:34:34.000Z");
  });

  it("holds 446 sentences / 23,883 chars of body — the figures the comments quote", () => {
    expect(sentences.length).toBe(446);
    expect(body.length).toBe(23_883);
  });

  it("names Omega twice and Gulf coast once in the body — the evidence the ruling is read against", () => {
    expect(count(/omega/gi)).toBe(2);
    expect(count(/gulf coast/gi)).toBe(1);
  });

  it("spells the restaurant 'Martin Fiero' 3 times and 'Martin Fierro' never — the near-miss is real", () => {
    expect(count(/Martin Fiero\b/gi)).toBe(3);
    expect(count(/Martin Fierro/gi)).toBe(0);
  });

  it("carries every line the bodyCoherence fixture claims is verbatim", () => {
    const fixture = readFileSync(join(MEETINGS_DIR, "__tests__", "bodyCoherence.test.ts"), "utf8");
    const quoted = [...fixture.matchAll(/^\s*"((?:Robert Acheson|Austin Wilkins): [^"]+)",$/gm)].map(
      (m) => m[1],
    );
    expect(quoted.length).toBeGreaterThan(0);
    for (const line of quoted) expect(body).toContain(line);
  });
});
