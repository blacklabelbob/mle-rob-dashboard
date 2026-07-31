import { describe, it, expect } from "vitest";
import {
  checkArchiveAgainstCrm,
  recordingKey,
  TITLE_MATCH_FLOOR,
  titleOverlap,
  type ArchiveRow,
  type CrmMeeting,
} from "../archiveCheck";

const row = (over: Partial<ArchiveRow> & { id: string }): ArchiveRow => ({
  title: "",
  day: "",
  ...over,
});
const mtg = (over: Partial<CrmMeeting> & { id: string }): CrmMeeting => ({
  summary: "",
  day: "",
  ...over,
});

describe("recordingKey", () => {
  it("reduces two url shapes of the same Fireflies recording to one key", () => {
    expect(recordingKey("https://app.fireflies.ai/view/ABC123")).toBe("abc123");
    expect(recordingKey("https://fireflies.ai/share/ABC123?utm=x")).toBe("abc123");
    expect(recordingKey("")).toBe("");
    expect(recordingKey(undefined)).toBe("");
  });
});

describe("titleOverlap", () => {
  it("ignores short words and is symmetric enough to clear the floor both ways", () => {
    expect(titleOverlap("Gulf Coast roofing intro call", "Intro call with Gulf Coast roofing")).toBeGreaterThanOrEqual(0.6);
    expect(titleOverlap("Gulf Coast intro", "PropLogix pricing review")).toBe(0);
  });

  it("is 0 when either side has nothing significant to compare", () => {
    expect(titleOverlap("", "anything meaningful")).toBe(0);
    expect(titleOverlap("a of to", "a of to")).toBe(0);
  });
});

/**
 * Q84 inc.5 — the floor is one number for three consumers now (this module's CRM check,
 * `unexplainedRows`' duplicate rule, and the sync's recording→recording collapse). Pinning
 * the value here is what makes moving it a deliberate, visible change rather than a silent
 * one: the sync welding two distinct meetings together is unrecoverable, so nobody should be
 * able to loosen the rule for one caller and not notice they loosened it for all three.
 */
describe("TITLE_MATCH_FLOOR", () => {
  it("is the single exported floor every meeting-matching caller compares against", () => {
    expect(TITLE_MATCH_FLOOR).toBe(0.6);
  });

  it("brackets the rule it governs: a real re-title clears it, two unrelated calls do not", () => {
    expect(titleOverlap("Gulf Coast roofing intro call", "Intro call with Gulf Coast roofing")).toBeGreaterThanOrEqual(
      TITLE_MATCH_FLOOR,
    );
    expect(titleOverlap("Gulf Coast intro", "PropLogix pricing review")).toBeLessThan(TITLE_MATCH_FLOOR);
  });
});

describe("checkArchiveAgainstCrm", () => {
  it("matches on recording id even when the url shapes differ and the days disagree", () => {
    const out = checkArchiveAgainstCrm(
      [row({ id: "n1", title: "Whatever", day: "2026-07-10", recording: "https://app.fireflies.ai/view/XYZ" })],
      [mtg({ id: "a1", summary: "different words entirely", day: "2026-07-11", transcriptUrl: "https://fireflies.ai/share/xyz" })],
    );
    expect(out.matched).toHaveLength(1);
    expect(out.matched[0].how).toBe("recording-url");
    expect(out.counts.archiveOnly).toBe(0);
    expect(out.counts.crmOnly).toBe(0);
  });

  it("matches on date+title when there is exactly one strong candidate that day", () => {
    const out = checkArchiveAgainstCrm(
      [row({ id: "n1", title: "PropLogix pricing review", day: "2026-07-12" })],
      [
        mtg({ id: "a1", summary: "Pricing review with PropLogix", day: "2026-07-12" }),
        mtg({ id: "a2", summary: "Gulf Coast storm follow up", day: "2026-07-12" }),
      ],
    );
    expect(out.matched.map((m) => [m.meeting.id, m.how])).toEqual([["a1", "date+title"]]);
    expect(out.crmOnly.map((m) => m.id)).toEqual(["a2"]);
  });

  it("reports ambiguity instead of picking, when two CRM meetings match one row equally", () => {
    const out = checkArchiveAgainstCrm(
      [row({ id: "n1", title: "Gulf Coast roofing sync", day: "2026-07-13" })],
      [
        mtg({ id: "a1", summary: "Gulf Coast roofing sync", day: "2026-07-13" }),
        mtg({ id: "a2", summary: "Gulf Coast roofing sync", day: "2026-07-13" }),
      ],
    );
    expect(out.matched).toHaveLength(0);
    expect(out.ambiguous).toHaveLength(1);
    expect(out.ambiguous[0].candidates.map((c) => c.id)).toEqual(["a1", "a2"]);
    // An ambiguous row is NOT also reported as missing from the CRM — that would be a lie.
    expect(out.archiveOnly).toHaveLength(0);
  });

  it("takes the sole-pair-that-day weak match, but refuses it when either side has a rival", () => {
    const sole = checkArchiveAgainstCrm(
      [row({ id: "n1", title: "Meeting", day: "2026-07-14" })],
      [mtg({ id: "a1", summary: "", day: "2026-07-14" })],
    );
    expect(sole.matched[0].how).toBe("date-only (sole pair that day)");

    const twoRows = checkArchiveAgainstCrm(
      [row({ id: "n1", title: "Meeting", day: "2026-07-14" }), row({ id: "n2", title: "Meeting", day: "2026-07-14" })],
      [mtg({ id: "a1", summary: "", day: "2026-07-14" })],
    );
    expect(twoRows.matched).toHaveLength(0);
    expect(twoRows.counts.archiveOnly).toBe(2);
    expect(twoRows.counts.crmOnly).toBe(1);
  });

  it("never matches a dateless row on inference alone", () => {
    const out = checkArchiveAgainstCrm(
      [row({ id: "n1", title: "Gulf Coast roofing sync", day: "" })],
      [mtg({ id: "a1", summary: "Gulf Coast roofing sync", day: "2026-07-15" })],
    );
    expect(out.matched).toHaveLength(0);
    expect(out.archiveOnly.map((r) => r.id)).toEqual(["n1"]);
    expect(out.crmOnly.map((m) => m.id)).toEqual(["a1"]);
  });

  it("splits the two disagreements in opposite directions", () => {
    const out = checkArchiveAgainstCrm(
      [row({ id: "n1", title: "Omega principals, in person", day: "2026-07-28" })],
      [mtg({ id: "a1", summary: "Cold call, no recorder", day: "2026-07-29" })],
    );
    expect(out.archiveOnly.map((r) => r.id)).toEqual(["n1"]); // CRM is behind the record
    expect(out.crmOnly.map((m) => m.id)).toEqual(["a1"]); // archive has no row for it
  });

  it("does not claim one CRM meeting for two archive rows", () => {
    const out = checkArchiveAgainstCrm(
      [
        row({ id: "n1", title: "Title Base kickoff", day: "2026-07-20", recording: "https://app.fireflies.ai/view/K1" }),
        row({ id: "n2", title: "Title Base kickoff", day: "2026-07-20" }),
      ],
      [mtg({ id: "a1", summary: "Title Base kickoff", day: "2026-07-20", transcriptUrl: "https://app.fireflies.ai/view/K1" })],
    );
    expect(out.matched.map((m) => m.row.id)).toEqual(["n1"]);
    expect(out.archiveOnly.map((r) => r.id)).toEqual(["n2"]);
    expect(out.crmOnly).toHaveLength(0);
  });
});
