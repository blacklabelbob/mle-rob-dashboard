import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs helper, shared with scripts/fireflies-ingest.mjs
import { indexPreviousManifest, resolveFailedRow } from "../../scripts/manifest-carryforward.mjs";

// The two rows the 2026-07-31 12:03 cron run actually destroyed, as they stood at 11:33.
const CALEB_LONG = {
  id: "01KV8VGJS6T7Z4P8ATSB4X5NQN",
  title: "Caleb, Rob, Will | CGRoofingGroup.com + AI Platform Discovery",
  date: "2026-06-16T18:36:09.427Z",
  durationMinutes: 12,
  organizerDomain: "aivoicetech.io",
  participantCount: 1,
  participantDomains: ["aivoicetech.io"],
  keywords: ["Roofing CRM", "customer acquisition cost"],
  sentences: 121,
  fireflies: "https://app.fireflies.ai/view/01KV8VGJS6T7Z4P8ATSB4X5NQN",
  bodyOnDisk: true,
};

describe("resolveFailedRow", () => {
  it("carries the last good row forward untouched when a fetch fails", () => {
    const row = resolveFailedRow({
      stub: { id: CALEB_LONG.id, title: CALEB_LONG.title, dateString: CALEB_LONG.date },
      previous: CALEB_LONG,
      bodyOnDisk: true,
    });
    expect(row).toEqual(CALEB_LONG);
  });

  it("does not downgrade bodyOnDisk or drop attendee shape — the exact 07-31 regression", () => {
    const row = resolveFailedRow({
      stub: { id: CALEB_LONG.id, title: CALEB_LONG.title, dateString: CALEB_LONG.date },
      previous: CALEB_LONG,
      bodyOnDisk: true,
    });
    expect(row.bodyOnDisk).toBe(true);
    expect(row.error).toBeUndefined();
    expect(row.sentences).toBe(121);
    expect(row.participantDomains).toEqual(["aivoicetech.io"]);
    expect(row.durationMinutes).toBe(12);
  });

  it("keeps the previous row even when the body has since disappeared from disk", () => {
    // The body is gitignored and rebuildable; the metadata row is the only committed record.
    // Losing the file is not a reason to also lose what we knew about the meeting.
    const row = resolveFailedRow({ stub: { id: CALEB_LONG.id }, previous: CALEB_LONG, bodyOnDisk: false });
    expect(row).toEqual(CALEB_LONG);
  });

  it("reports the disk as it is for a meeting seen for the first time", () => {
    const stub = { id: "01NEW", title: "Never fetched", dateString: "2026-07-31T12:03:00.000Z" };
    expect(resolveFailedRow({ stub, previous: undefined, bodyOnDisk: false })).toEqual({
      id: "01NEW",
      title: "Never fetched",
      date: "2026-07-31T12:03:00.000Z",
      bodyOnDisk: false,
      error: "fetch-failed",
    });
  });

  it("says bodyOnDisk true for a first sighting whose body IS on disk — never asserts false blind", () => {
    // This is the lie itself: the old code hardcoded false while a 24KB body sat next to it.
    const stub = { id: "01NEW", title: "Body landed, detail did not", dateString: "2026-07-31T12:03:00.000Z" };
    expect(resolveFailedRow({ stub, previous: undefined, bodyOnDisk: true }).bodyOnDisk).toBe(true);
  });

  it("tolerates a stub with no title or date rather than inventing them", () => {
    const row = resolveFailedRow({ stub: { id: "01BARE" }, previous: undefined, bodyOnDisk: false });
    expect(row.title).toBeNull();
    expect(row.date).toBeNull();
  });
});

describe("indexPreviousManifest", () => {
  it("indexes a real manifest by meeting id", () => {
    const raw = JSON.stringify({ count: 1, meetings: [CALEB_LONG] });
    const index = indexPreviousManifest(raw);
    expect(index.get(CALEB_LONG.id)).toEqual(CALEB_LONG);
  });

  it("returns an empty index — never throws — when the manifest is missing or unreadable", () => {
    // An unparseable manifest must degrade to "carry nothing forward", not abort the ingest
    // and leave the CRM without the twelve meetings it could have read.
    expect(indexPreviousManifest(null).size).toBe(0);
    expect(indexPreviousManifest("{not json").size).toBe(0);
    expect(indexPreviousManifest("{}").size).toBe(0);
    expect(indexPreviousManifest(JSON.stringify({ meetings: "nope" })).size).toBe(0);
  });

  it("skips rows with no usable id instead of keying them undefined", () => {
    const raw = JSON.stringify({ meetings: [{ title: "no id" }, null, CALEB_LONG] });
    const index = indexPreviousManifest(raw);
    expect(index.size).toBe(1);
    expect(index.has(CALEB_LONG.id)).toBe(true);
  });
});
