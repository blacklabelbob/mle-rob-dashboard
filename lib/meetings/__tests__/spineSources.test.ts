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
import {
  indexNotionReads,
  type NotionPageRead,
  type NotionReadConfirmation,
} from "@/lib/meetings/notionReads";

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

/**
 * Q86 inc.10 — the reads that were already on disk, and the ruling that makes one count.
 *
 * inc.9 printed *"characters that nothing in this repo has read"* over 32 pages whose full
 * recursive body is committed at `MLE Internal Meetings/archive-reads/*.deepread.txt`. These tests
 * pin the three refusals that fix costs: a read alone is not coverage, a ruling alone is not a
 * read, and the snapshot's top-level character count may never win over a deeper measurement.
 */
describe("fromNotion + deep reads (inc.10)", () => {
  const PAGE_ID = "2cf1de57-0199-8003-9e6d-fd921fbb8a59";
  const ROW: NotionMeetingRow = {
    id: PAGE_ID,
    title: "will Devito 2025-12-20T01:43:00.000-05:00",
    day: "2025-12-20",
    url: "https://www.notion.so/will-Devito",
    transcriptAvailable: false,
    bodyChars: 37099,
    bodyBlocks: 6,
  };
  // Real header numbers from `2025-12-20-will-devito.deepread.txt` — 49 blocks / 77,465 chars.
  const READ: NotionPageRead = {
    pageId: PAGE_ID,
    path: "MLE Internal Meetings/archive-reads/2025-12-20-will-devito.deepread.txt",
    blocks: 49,
    chars: 77465,
  };
  const RULING: NotionReadConfirmation = {
    pageId: PAGE_ID,
    verdict: "transcript",
    note: "verbatim first-person speech in the body tail",
    confirmedAt: "2026-08-07",
    confirmedBy: "max",
  };
  const index = (reads: NotionPageRead[], rulings: NotionReadConfirmation[] = []) =>
    indexNotionReads(reads, rulings).byPageId;

  it("a read WITHOUT a ruling is not coverage — but stops the report saying nobody has read it", () => {
    const { records, bodyFindings, confirmedTranscripts } = fromNotion([ROW], index([READ]));
    expect(records[0].hasTranscript).toBe(false);
    expect(confirmedTranscripts).toEqual([]);
    // The sentence that was false for 32 rows must not survive anywhere in the finding.
    expect(bodyFindings[0].why).not.toContain("nothing in this repo has read");
    expect(bodyFindings[0].why).toContain("2025-12-20-will-devito.deepread.txt");
  });

  it("a read RULED a transcript is coverage, and leaves the unread list", () => {
    const { records, bodyFindings, confirmedTranscripts } = fromNotion([ROW], index([READ], [RULING]));
    expect(records[0].hasTranscript).toBe(true);
    expect(confirmedTranscripts).toEqual([PAGE_ID]);
    expect(bodyFindings).toHaveLength(0);
  });

  it("a ruling of summary-only closes the reading WITHOUT ever becoming coverage", () => {
    const ruled = { ...RULING, verdict: "summary-only" as const };
    const { records, bodyFindings, ruledNotTranscript } = fromNotion([ROW], index([READ], [ruled]));
    expect(records[0].hasTranscript).toBe(false);
    expect(ruledNotTranscript).toEqual([PAGE_ID]);
    expect(bodyFindings).toHaveLength(0);
  });

  it("the DEEPER character count wins — 11 live pages measure ZERO at the top level", () => {
    // The snapshot's depth cap reports absence over bodies of up to 114,354 characters. Read on the
    // snapshot alone those pages never reach the finding threshold at all, which is the Omega shape
    // (INCIDENT-LEDGER #34) reached by arithmetic instead of by a checkbox.
    const capped: NotionMeetingRow = { ...ROW, bodyChars: 0, bodyBlocks: 0 };
    const { bodyFindings } = fromNotion([capped], index([{ ...READ, chars: 114354 }]));
    expect(bodyFindings).toHaveLength(1);
    expect(bodyFindings[0].bodyChars).toBe(114354);
    expect(bodyFindings[0].why).toContain("depth cap was hiding 114,354 characters");
  });

  it("a ruling with no read on disk is DROPPED and reported, never applied", () => {
    const { byPageId, orphanedConfirmations } = indexNotionReads([], [RULING]);
    expect(byPageId.size).toBe(0);
    expect(orphanedConfirmations).toEqual([RULING]);
    expect(fromNotion([ROW], byPageId).records[0].hasTranscript).toBe(false);
  });
});

describe("fromNotion — below the floor is not the same as empty (inc.25)", () => {
  /**
   * The live shape this was found on: `Meeting 2026-07-28` — the Omega row INCIDENT-LEDGER #34 was
   * opened for — measured 0 characters over 1 block in `notion-snapshot-2026-08-07.json`, and was
   * therefore dropped before it could become a finding, an unread row, or anything a human sees.
   */
  const CAPPED: NotionMeetingRow = {
    id: "3ab1de57-0199-80ef-bf9c-c2b98d7578ed",
    title: "Meeting 2026-07-28",
    day: "2026-07-28",
    url: "https://app.notion.com/p/Meeting-3ab1de57019980efbf9cc2b98d7578ed",
    transcriptAvailable: false,
    bodyChars: 0,
    bodyBlocks: 1,
  };

  it("reports a 0-character page WITH blocks as unmeasured — never silently drops it", () => {
    const { unmeasuredBodies, bodyFindings } = fromNotion([CAPPED]);
    expect(unmeasuredBodies).toHaveLength(1);
    expect(unmeasuredBodies[0].id).toBe(CAPPED.id);
    expect(unmeasuredBodies[0].bodyBlocks).toBe(1);
    expect(unmeasuredBodies[0].url).toBe(CAPPED.url);
    // It is NOT a finding: a finding names how much text is owed a read, and that is the one thing
    // this row cannot tell us. Conflating the two is how a depth cap read as a drained queue.
    expect(bodyFindings).toHaveLength(0);
  });

  it("says the number is about OUR read depth, and names the command that settles it", () => {
    const [u] = fromNotion([CAPPED]).unmeasuredBodies;
    expect(u.why).toContain("not about the page");
    expect(u.why).toContain("may never be called an absence");
    expect(u.why).toContain(`node scripts/notion-body-dump.mjs ${CAPPED.id}`);
  });

  it("stays silent about a page the snapshot saw NO blocks on — a different claim entirely", () => {
    // Zero blocks means the reader looked and found nothing there. That is the snapshot speaking
    // about the page; 0 chars over 1 block is the snapshot speaking about itself.
    expect(fromNotion([{ ...CAPPED, bodyBlocks: 0 }]).unmeasuredBodies).toHaveLength(0);
  });

  it("drops off the unmeasured list the moment the body IS read deeply — no double-queueing", () => {
    const read: NotionPageRead = {
      pageId: CAPPED.id,
      // A SYNTHETIC path on purpose, and it must never look like a real archive citation. The
      // draft of this test named `archive-reads/2026-07-28-omega.deepread.txt` — a file that does
      // not exist, because the Omega body has NOT been deep-read yet; that is the open work this
      // whole describe block exists to surface. `citedEvidenceExists` caught it at the push gate,
      // which is the guard doing exactly its job (Q89 inc.26). `fromNotion` never opens the path,
      // so a fixture value that cannot be mistaken for evidence is the honest one.
      path: "(test fixture — no file; the Omega body is unread, which is the point)",
      blocks: 531,
      chars: 104683,
    };
    const { unmeasuredBodies, bodyFindings } = fromNotion([CAPPED], indexNotionReads([read], []).byPageId);
    expect(unmeasuredBodies).toHaveLength(0);
    // …and the deep read carries it over the floor as a real finding, with the real number.
    expect(bodyFindings).toHaveLength(1);
    expect(bodyFindings[0].bodyChars).toBe(104683);
  });

  it("a RULED page is settled and never appears as unmeasured, whatever the snapshot counted", () => {
    const read: NotionPageRead = {
      pageId: CAPPED.id,
      // A SYNTHETIC path on purpose, and it must never look like a real archive citation. The
      // draft of this test named `archive-reads/2026-07-28-omega.deepread.txt` — a file that does
      // not exist, because the Omega body has NOT been deep-read yet; that is the open work this
      // whole describe block exists to surface. `citedEvidenceExists` caught it at the push gate,
      // which is the guard doing exactly its job (Q89 inc.26). `fromNotion` never opens the path,
      // so a fixture value that cannot be mistaken for evidence is the honest one.
      path: "(test fixture — no file; the Omega body is unread, which is the point)",
      blocks: 531,
      chars: 104683,
    };
    const ruling: NotionReadConfirmation = {
      pageId: CAPPED.id,
      verdict: "transcript",
      note: "full transcript beneath the AI summary",
      confirmedAt: "2026-08-05",
      confirmedBy: "max",
    };
    const out = fromNotion([CAPPED], indexNotionReads([read], [ruling]).byPageId);
    expect(out.unmeasuredBodies).toHaveLength(0);
    expect(out.bodyFindings).toHaveLength(0);
    expect(out.confirmedTranscripts).toEqual([CAPPED.id]);
  });
});
