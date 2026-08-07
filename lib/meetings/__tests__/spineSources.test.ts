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
  fromNotion,
  fromTranscriptFiles,
  type ManifestRow,
  type NotionMeetingRow,
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

/**
 * Q86 inc.9 — Notion, the second of the five unwired sources, and DoD (d).
 *
 * The refusals under test are the two ways this source could have lied: believing the human's
 * `Transcript Available` checkbox, and treating a measured page body as a read one.
 *
 * The fixtures are REAL rows, copied out of `MLE Internal Meetings/notion-snapshot-2026-08-07.json`
 * — the checkbox-vs-body contradiction they encode is a live property of Rob's database, and a
 * fixture invented to demonstrate it would prove nothing about the database it is meant to police.
 */
describe("fromNotion", () => {
  const BODY_ROW: NotionMeetingRow = {
    id: "2531de57-0199-8085-a8f5-de3e9a9b4e5a",
    title: "will Devito 2025-12-20T01:43:00.000-05:00",
    day: "2025-12-20",
    url: "https://www.notion.so/will-Devito",
    transcriptAvailable: false,
    bodyChars: 37099,
    bodyBlocks: 6,
  };
  const EMPTY_ROW: NotionMeetingRow = {
    id: "2551de57-0199-81a4-9b1f-f0e6d4b6c111",
    title: "Meeting 2026-08-05",
    transcriptAvailable: false,
    bodyChars: 0,
    bodyBlocks: 1,
  };

  it("NEVER claims a transcript — not from the checkbox, and not from a 37k-character body", () => {
    // Both directions of the lie, in one assertion each. A page with 37,099 characters in it is
    // located, not read; a ticked checkbox is a human's claim about a page nobody opened.
    expect(fromNotion([BODY_ROW]).records[0].hasTranscript).toBe(false);
    expect(fromNotion([{ ...BODY_ROW, transcriptAvailable: true }]).records[0].hasTranscript).toBe(false);
    expect(fromNotion([EMPTY_ROW]).records[0].hasTranscript).toBe(false);
  });

  it("raises the body as a FINDING with the count and the page URL, so a human can go read it", () => {
    const { bodyFindings } = fromNotion([BODY_ROW, EMPTY_ROW]);
    expect(bodyFindings).toHaveLength(1);
    expect(bodyFindings[0].bodyChars).toBe(37099);
    expect(bodyFindings[0].url).toBe("https://www.notion.so/will-Devito");
    expect(bodyFindings[0].contradictsCheckbox).toBe(true);
    expect(bodyFindings[0].why).toContain("37,099 characters");
    expect(bodyFindings[0].why).toContain("INCIDENT-LEDGER #34");
  });

  it("still says 'open it' when the checkbox AGREES — agreement is not a reading", () => {
    const [finding] = fromNotion([{ ...BODY_ROW, transcriptAvailable: true }]).bodyFindings;
    expect(finding.contradictsCheckbox).toBe(false);
    expect(finding.why).toContain("open the page before counting it");
  });

  it("keeps every row as a record, body or not — a row dropped is a row nobody looks for again", () => {
    expect(fromNotion([BODY_ROW, EMPTY_ROW]).records.map((r) => r.id)).toEqual([BODY_ROW.id, EMPTY_ROW.id]);
    expect(fromNotion([BODY_ROW]).records[0].source).toBe("notion");
    expect(fromNotion([BODY_ROW]).records[0].hasVideo).toBe(false);
  });

  it("leaves a meeting OWED A HUMAN even when Notion holds its page and its body", () => {
    // The end-to-end shape of DoD (d): the page is linked to the meeting, the human is pointed at
    // 37k characters — and the row does NOT go green, because nobody has read them yet.
    const meeting: CalendarMeeting = {
      id: "evt-devito",
      title: "will Devito 2025-12-20T01:43:00.000-05:00",
      day: "2025-12-20",
      startsAt: "2025-12-20T01:43:00-05:00",
      isPast: true,
    };
    const out = reconcileCalendarSpine([meeting], fromNotion([BODY_ROW]).records);
    expect(out.rows[0].links.map((l) => l.source)).toEqual(["notion"]);
    expect(out.rows[0].status).toBe("owed-a-human");
    expect(out.counts.withTranscript).toBe(0);
  });
});
