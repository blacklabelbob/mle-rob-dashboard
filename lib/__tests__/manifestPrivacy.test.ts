import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs helper, shared with scripts/fireflies-ingest.mjs
import { emailDomain, redactAttendees, redactManifest, redactMeeting } from "../../scripts/manifest-privacy.mjs";

const MANIFEST_PATH = join(process.cwd(), "MLE Internal Meetings", "manifest.json");

// Deliberately broad: anything shaped like an address, not just the twelve we know about.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

describe("emailDomain", () => {
  it("lowercases the domain and ignores anything that is not an address", () => {
    expect(emailDomain("Rob@AIVoiceTech.io")).toBe("aivoicetech.io");
    expect(emailDomain("Will DeVito")).toBeNull();
    expect(emailDomain("trailing@")).toBeNull();
    expect(emailDomain("@leading.com")).toBeNull();
    expect(emailDomain(null)).toBeNull();
  });
});

describe("redactAttendees", () => {
  it("returns a count and domains, never an address", () => {
    const out = redactAttendees({
      organizer: "rob@aivoicetech.io",
      participants: ["rob@aivoicetech.io", "someone@gmail.com", "other@gmail.com"],
    });
    expect(out).toEqual({
      organizerDomain: "aivoicetech.io",
      participantCount: 3,
      participantDomains: ["aivoicetech.io", "gmail.com"],
    });
    expect(JSON.stringify(out)).not.toMatch(EMAIL_RE);
  });

  it("counts a non-email attendee — dropping it would understate the room", () => {
    const out = redactAttendees({ organizer: null, participants: ["Will DeVito", "a@b.com"] });
    expect(out.participantCount).toBe(2);
    expect(out.participantDomains).toEqual(["b.com"]);
    expect(out.organizerDomain).toBeNull();
  });

  it("de-duplicates case-insensitively and survives missing input", () => {
    expect(redactAttendees({ participants: ["A@B.com", "a@b.com "] }).participantCount).toBe(1);
    expect(redactAttendees({})).toEqual({ organizerDomain: null, participantCount: 0, participantDomains: [] });
    expect(redactAttendees()).toEqual({ organizerDomain: null, participantCount: 0, participantDomains: [] });
  });
});

describe("redactMeeting", () => {
  const meeting = {
    id: "01KX",
    title: "Joseph, Rob, Will | MLE Partnership",
    date: "2026-07-20T18:00:00.000Z",
    organizer: "rob@aivoicetech.io",
    participants: ["rob@aivoicetech.io", "josephgreen83@gmail.com"],
    sentences: 551,
    fireflies: "https://app.fireflies.ai/view/01KX",
  };

  it("writes the redacted fields where the originals sat, keeping the rest intact", () => {
    const out = redactMeeting(meeting);
    expect(Object.keys(out)).toEqual([
      "id",
      "title",
      "date",
      "organizerDomain",
      "participantCount",
      "participantDomains",
      "sentences",
      "fireflies",
    ]);
    expect(out.title).toBe(meeting.title);
    expect(out.fireflies).toBe(meeting.fireflies);
    expect(JSON.stringify(out)).not.toMatch(EMAIL_RE);
  });

  it("is idempotent — a second pass is a no-op", () => {
    expect(redactMeeting(redactMeeting(meeting))).toEqual(redactMeeting(meeting));
  });

  it("leaves a fetch-failed row (no attendee fields) untouched", () => {
    const failed = { id: "x", title: "t", date: "d", bodyOnDisk: false, error: "fetch-failed" };
    expect(redactMeeting(failed)).toBe(failed);
  });
});

describe("the committed manifest", () => {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(raw);

  it("carries no email address at all", () => {
    expect(raw.match(EMAIL_RE)).toBeNull();
  });

  // The count is read from the manifest's own `count` field, NOT hardcoded. It was
  // pinned at 13 and broke the day the ingest first ran on a schedule (2026-07-30,
  // 13 -> 15). A test that must be hand-edited every time Rob records a call teaches
  // the team to edit the number instead of reading the failure — and this file's real
  // job is the PII assertions below, which a stale count keeps switched off.
  // `count` is still checked against the array, so a manifest that miscounts itself fails.
  it("identifies every meeting in the manifest by title, date and link", () => {
    expect(manifest.meetings.length).toBeGreaterThan(0);
    expect(manifest.count).toBe(manifest.meetings.length);
    for (const m of manifest.meetings) {
      expect(m.title).toBeTruthy();
      expect(m.date).toBeTruthy();
      expect(m.fireflies).toMatch(/^https:\/\/app\.fireflies\.ai\/view\//);
      expect(typeof m.participantCount).toBe("number");
      expect(Array.isArray(m.participantDomains)).toBe(true);
    }
  });

  it("is already fully redacted — re-running the pass changes nothing", () => {
    expect(redactManifest(manifest)).toEqual(manifest);
  });
});
