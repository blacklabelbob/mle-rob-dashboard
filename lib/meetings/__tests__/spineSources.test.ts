/**
 * Q86 inc.2 — the adapters that feed the spine.
 *
 * The tests that matter are the refusals again: a stub never counts as a transcript, a stub is
 * never silently dropped either, a Fireflies URL never becomes a video claim, and the local day is
 * never derived here.
 */

import { describe, expect, it } from "vitest";
import {
  TRANSCRIPT_MIN_BYTES,
  fromFathom,
  fromManifest,
  fromTranscriptFiles,
  type ManifestRow,
  type TranscriptFile,
} from "@/lib/meetings/spineSources";
import { reconcileCalendarSpine, type CalendarMeeting } from "@/lib/meetings/calendarSpine";

const ROW: ManifestRow = {
  id: "01KZ5077XC5JW5P57VHK0HNRJJ",
  title: "Rob & Austin | MArtin Fierro",
  date: "2026-08-03T23:45:00.000Z",
  fireflies: "https://app.fireflies.ai/view/01KZ5077XC5JW5P57VHK0HNRJJ",
  bodyOnDisk: true,
};

/** A fixed stand-in for the caller's zone conversion — never a real one, and never a clock. */
const utcDay = (iso: string) => iso.slice(0, 10);

describe("fromManifest", () => {
  it("carries the archive's own transcript claim through, and nothing more", () => {
    const [rec] = fromManifest([ROW], { toLocalDay: utcDay });
    expect(rec.source).toBe("fireflies");
    expect(rec.id).toBe(ROW.id);
    expect(rec.hasTranscript).toBe(true);
    expect(rec.url).toBe(ROW.fireflies);
  });

  it("never turns a Fireflies permalink into a video claim", () => {
    const [rec] = fromManifest([ROW], { toLocalDay: utcDay });
    expect(rec.hasVideo).toBe(false);
  });

  it("treats a row with no body on disk as no transcript, not as absent", () => {
    const [rec] = fromManifest([{ ...ROW, bodyOnDisk: false }], { toLocalDay: utcDay });
    expect(rec.hasTranscript).toBe(false);
    expect(rec.id).toBe(ROW.id);
  });

  it("delegates the local day to the caller and never converts a zone itself", () => {
    // The same instant is 8/3 in ET and 8/4 in UTC. The module must return whichever the caller says.
    const et = fromManifest([ROW], { toLocalDay: () => "2026-08-03" })[0];
    const utc = fromManifest([ROW], { toLocalDay: utcDay })[0];
    expect(et.day).toBe("2026-08-03");
    expect(utc.day).toBe("2026-08-03");
    const shifted = fromManifest([{ ...ROW, date: "2026-08-04T00:45:00.000Z" }], {
      toLocalDay: utcDay,
    })[0];
    expect(shifted.day).toBe("2026-08-04");
  });
});

describe("fromTranscriptFiles — the stub rule (Q86 DoD (f))", () => {
  const stub: TranscriptFile = { path: "/u/Unprocessed/omega.txt", title: "omega", bytes: 26 };
  const real: TranscriptFile = { path: "/t/omega-7-28.txt", title: "omega 7 28", bytes: 48_000 };

  it("does not count a 26-byte stub as a transcript", () => {
    const { records } = fromTranscriptFiles([stub]);
    expect(records[0].hasTranscript).toBe(false);
  });

  it("does not silently drop the stub either — it is reported with the byte count", () => {
    const { records, stubs } = fromTranscriptFiles([stub]);
    expect(records).toHaveLength(1);
    expect(stubs).toHaveLength(1);
    expect(stubs[0].bytes).toBe(26);
    expect(stubs[0].why).toContain("placeholder");
  });

  it("accepts a real transcript and raises no finding for it", () => {
    const { records, stubs } = fromTranscriptFiles([real]);
    expect(records[0].hasTranscript).toBe(true);
    expect(stubs).toHaveLength(0);
  });

  it("puts the floor at the boundary, not one side of it by accident", () => {
    const at = fromTranscriptFiles([{ ...stub, bytes: TRANSCRIPT_MIN_BYTES }]);
    const below = fromTranscriptFiles([{ ...stub, bytes: TRANSCRIPT_MIN_BYTES - 1 }]);
    expect(at.records[0].hasTranscript).toBe(true);
    expect(at.stubs).toHaveLength(0);
    expect(below.records[0].hasTranscript).toBe(false);
    expect(below.stubs).toHaveLength(1);
  });

  it("leaves the meeting OWED A HUMAN when its only file is a stub — the whole point", () => {
    const meeting: CalendarMeeting = {
      id: "evt-omega",
      title: "omega",
      day: "2026-07-28",
      hasConferenceLink: true,
    };
    const { records } = fromTranscriptFiles([{ ...stub, day: "2026-07-28" }]);
    const out = reconcileCalendarSpine([meeting], records);
    expect(out.rows[0].status).toBe("owed-a-human");
    expect(out.counts.withTranscript).toBe(0);
    // ...and the file is still visibly linked, so the human is told which one lied to them.
    expect(out.rows[0].links.map((l) => l.id)).toContain(stub.path);
  });
});

/**
 * Q86 inc.8 — Fathom, the first of the five sources that were only ever listed as NOT wired.
 *
 * The refusals under test are the ones that would quietly close a meeting: a permalink is not a
 * video, and "Fathom transcribes what it records" is not evidence about THIS recording.
 */
describe("fromFathom", () => {
  const REC = {
    id: "162399934",
    title: "Impromptu Google Meet Meeting",
    day: "2026-07-09",
    url: "https://fathom.video/calls/741525127",
  };

  it("claims a transcript ONLY when the row says someone confirmed one", () => {
    const [unconfirmed] = fromFathom([REC]);
    expect(unconfirmed.hasTranscript).toBe(false);

    const [confirmed] = fromFathom([{ ...REC, transcriptConfirmed: true }]);
    expect(confirmed.hasTranscript).toBe(true);

    // Explicit false and absent must be indistinguishable — neither is "verified absent".
    expect(fromFathom([{ ...REC, transcriptConfirmed: false }])[0].hasTranscript).toBe(false);
  });

  it("never turns a /calls/ permalink into a video claim, even on a confirmed row", () => {
    const [r] = fromFathom([{ ...REC, transcriptConfirmed: true }]);
    expect(r.url).toBe("https://fathom.video/calls/741525127");
    expect(r.hasVideo).toBe(false);
  });

  it("carries the day through untouched and tags every row to the fathom source", () => {
    const rows = fromFathom([REC, { ...REC, id: "36208821", day: "2021-09-16" }]);
    expect(rows.map((r) => r.source)).toEqual(["fathom", "fathom"]);
    expect(rows.map((r) => r.day)).toEqual(["2026-07-09", "2021-09-16"]);
  });

  it("lets a confirmed Fathom recording COVER a meeting Fireflies never claimed", () => {
    // The live finding this increment opened on: a real internal meeting whose only transcript is
    // in the backstop recorder. Before Fathom was wired the spine had nothing to link here.
    const meeting: CalendarMeeting = {
      id: "evt-kickoff",
      title: "Impromptu Google Meet Meeting",
      day: "2026-07-09",
      startsAt: "2026-07-09T14:00:00-04:00",
      isPast: true,
    };
    const out = reconcileCalendarSpine(
      [meeting],
      fromFathom([{ ...REC, transcriptConfirmed: true }]),
    );
    expect(out.rows[0].transcriptSources).toEqual(["fathom"]);
    expect(out.counts.withTranscript).toBe(1);
  });
});
