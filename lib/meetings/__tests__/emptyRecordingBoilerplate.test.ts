import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectEmptyRecordingBoilerplate } from "../emptyRecordingBoilerplate";

/**
 * The row that produced the module, read from the ARCHIVED DUMP rather than retyped.
 *
 * Q92's lesson, in a new column: a guard test whose fixture cannot reach the branch is
 * green about nothing. So the shipped file is the fixture, and the first test below FAILS
 * LOUDLY if that file ever stops carrying the template — a fixture that quietly rots into
 * a pass is the failure mode being avoided here.
 */
const ARCHIVED_READ = fileURLToPath(
  new URL(
    "../../../MLE Internal Meetings/archive-reads/2026-06-05-empty-recording-boilerplate.deepread.txt",
    import.meta.url,
  ),
);

const archivedDump = readFileSync(ARCHIVED_READ, "utf8");

/** Just the body section of that dump — what a publisher would actually be handed. */
const REAL_BODY = archivedDump.slice(archivedDump.indexOf("FULL BODY"));

describe("the real 2026-06-05 row — fields right, body a lie", () => {
  it("the archived dump still carries the template this module exists for", () => {
    // If this fails, the fixture rotted and every assertion below is meaningless.
    expect(REAL_BODY).toContain("very short (or empty) recording");
    expect(REAL_BODY.length).toBeGreaterThan(500);
  });

  it("calls a 1,300-char, 20-block page what it is: no meeting", () => {
    const check = detectEmptyRecordingBoilerplate(REAL_BODY);

    expect(check.verdict).toBe("boilerplate-only");
    expect(check.matched.length).toBeGreaterThanOrEqual(2);
    expect(check.why).toContain("no meeting on this page");
  });

  it("says out loud that the row's empty fields are CORRECT here", () => {
    // The whole point. Q84's standing rule is "trust the body, not the field"; on this
    // row class it is inverted, and the verdict has to carry that or a reader re-applies
    // the rule that has been right ten times running.
    expect(detectEmptyRecordingBoilerplate(REAL_BODY).why).toContain("CORRECT");
  });
});

describe("it does not outvote real text", () => {
  const realMeeting = `[paragraph] Rob: The recording came out empty on our end, can you resend it?
[paragraph] Trent: Yeah, the whole first half didn't capture. I'll try recording again after this.
[paragraph] Rob: Between four and eight hundred dollars per file is what you said last time, right?
[paragraph] Trent: Per file, yeah. Hours and hours and hours of work, every home has to get it.
[paragraph] Rob: That's the number I want on the record before we price anything.`;

  it("leaves a genuine conversation about recordings alone", () => {
    // "try recording again" appears verbatim in this transcript. One marker is a
    // coincidence, and suppressing this page would lose a real pricing anchor.
    const check = detectEmptyRecordingBoilerplate(realMeeting);

    expect(check.verdict).toBe("no-boilerplate");
    expect(check.matched).toEqual(["try recording again"]);
    expect(check.why).toContain("One marker is a coincidence");
  });

  it("returns `mixed`, never `boilerplate-only`, when the apology is stapled to a meeting", () => {
    const check = detectEmptyRecordingBoilerplate(`${REAL_BODY}\n${realMeeting}`);

    expect(check.verdict).toBe("mixed");
    expect(check.substantiveChars).toBeGreaterThanOrEqual(120);
    expect(check.why).toContain("a human reads");
  });
});

describe("absence of the template is not a clean bill of health", () => {
  it("makes no claim that a non-matching body is a meeting", () => {
    const check = detectEmptyRecordingBoilerplate("[paragraph] \n[paragraph] \n[paragraph] ");

    expect(check.verdict).toBe("no-boilerplate");
    expect(check.substantiveChars).toBe(0);
    // An empty page must not read as "checked and fine" — that is the exact inversion
    // (`not detected` ⇒ `fine`) Q84 exists to kill.
    expect(check.why).toContain("not a finding about");
  });

  it("does not count the reader's own block tags as content", () => {
    // 20 empty containers are how "916 chars of readable text" got onto the work-list.
    expect(detectEmptyRecordingBoilerplate("[heading_2] \n[transcription] ").substantiveChars).toBe(0);
  });
});
