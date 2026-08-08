/**
 * Q86 inc.10 — parsing a Q84 deep read's own header.
 *
 * The header format belongs to Q84's archive pass, so it is PARSED, never assumed. A file that
 * cannot name the page it is a read OF is not a read: guessing the id from the filename is how the
 * wrong body gets attached to the wrong meeting, which is the one failure this whole item exists
 * to prevent.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  indexNotionReads,
  parseDeepReadHeader,
  rulingAttachments,
  strandedTranscriptRulings,
} from "@/lib/meetings/notionReads";
import type { NotionReadConfirmation } from "@/lib/meetings/notionReads";

// Copied verbatim from `MLE Internal Meetings/archive-reads/2025-12-20-will-devito.deepread.txt`.
const HEADER = `==============================================================================
TITLE (do not trust): will Devito 2025-12-20T01:43:00.000-05:00
URL: https://app.notion.com/p/will-Devito-2cf1de57019980039e6dfd921fbb8a59
id : 2cf1de57-0199-8003-9e6d-fd921fbb8a59
------------------------------------------------------------------------------
BODY: 49 blocks, 77465 chars — bulleted_list_item×34, paragraph×9, heading_3×5, transcription×1
`;

describe("parseDeepReadHeader", () => {
  it("reads the page id and the body measurements out of a real header", () => {
    const read = parseDeepReadHeader("a/b.deepread.txt", HEADER);
    expect(read).toEqual({
      pageId: "2cf1de57-0199-8003-9e6d-fd921fbb8a59",
      path: "a/b.deepread.txt",
      blocks: 49,
      chars: 77465,
    });
  });

  it("returns null rather than inventing an id when the header carries none", () => {
    expect(parseDeepReadHeader("a/b.deepread.txt", "TITLE: something\nBODY: 3 blocks, 46 chars")).toBeNull();
  });

  it("keeps a read whose BODY line is missing — the id is what joins, the counts are extra", () => {
    const read = parseDeepReadHeader("a/b.deepread.txt", "id : 2cf1de57-0199-8003-9e6d-fd921fbb8a59\n");
    expect(read?.pageId).toBe("2cf1de57-0199-8003-9e6d-fd921fbb8a59");
    expect(read?.chars).toBeUndefined();
  });
});

describe("indexNotionReads", () => {
  it("joins a ruling onto its read by page id", () => {
    const read = parseDeepReadHeader("a/b.deepread.txt", HEADER)!;
    const { byPageId, orphanedConfirmations } = indexNotionReads(
      [read],
      [{ pageId: read.pageId, verdict: "transcript", note: "n", confirmedAt: "2026-08-07", confirmedBy: "max" }],
    );
    expect(byPageId.get(read.pageId)?.confirmation?.verdict).toBe("transcript");
    expect(orphanedConfirmations).toHaveLength(0);
  });
});

/**
 * Q86 inc.11 — these read the COMMITTED files, not fixtures.
 *
 * inc.10 justified refusing a block-shape heuristic in a doc comment, and got its own example
 * backwards: it called `2026-06-16-gulfcoast-ai-alex-one` "a pure AI summary". Reading it end to
 * end ruled it `transcript`. A fixture would have stayed green through that mistake, because the
 * mistake was about what is on disk. So the claim is now made against the disk.
 */
describe("the committed reads and rulings", () => {
  const root = join(__dirname, "..", "..", "..", "MLE Internal Meetings");
  const confirmations: NotionReadConfirmation[] = JSON.parse(
    readFileSync(join(root, "notion-read-confirmations.json"), "utf8"),
  ).confirmations;
  const reads = readdirSync(join(root, "archive-reads"))
    .filter((f) => f.endsWith(".deepread.txt"))
    .map((f) => parseDeepReadHeader(f, readFileSync(join(root, "archive-reads", f), "utf8")))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  it("rules on files that exist — no confirmation names a read nobody can open", () => {
    expect(indexNotionReads(reads, confirmations).orphanedConfirmations).toEqual([]);
  });

  it("kills the shape heuristic with the corpus itself: two transcripts, 9 paragraphs vs 228", () => {
    const { byPageId } = indexNotionReads(reads, confirmations);
    // will Devito — 74k of its 77k chars sit in FOUR paragraph blocks, so the census reads 9.
    const devito = byPageId.get("2cf1de57-0199-8003-9e6d-fd921fbb8a59");
    // Gulf Coast / AI Alex — the same kind of verbatim speech, chunked into ~200 blocks.
    const alex = byPageId.get("3811de57-0199-8099-9137-ef10c8fd0efe");
    expect(devito?.confirmation?.verdict).toBe("transcript");
    expect(alex?.confirmation?.verdict).toBe("transcript");

    const census = (path: string) =>
      /^BODY:.*paragraph×(\d+)/m.exec(readFileSync(join(root, "archive-reads", path), "utf8"))?.[1];
    expect(census(devito!.path)).toBe("9");
    expect(census(alex!.path)).toBe("228");
    // Same verdict, 25× apart on the axis a heuristic would key off. Shape measures how Notion
    // recorded the page, not what the page holds. If this ever goes red because a verdict moved,
    // the doc comment in notionReads.ts is what has to change with it.
  });
});

/**
 * Q86 inc.12 — a ruling that no calendar meeting claims.
 *
 * These assert against the LIVE rulings file and the real spine window, not fixtures: the finding
 * is that both rulings this repo has actually earned are stranded, and a fixture would go green
 * while the real board still showed 9-with-transcript and neither of them in it.
 */
describe("rulingAttachments", () => {
  const titleOf = (id: string) => `title:${id}`;
  const ruling = (pageId: string, verdict: NotionReadConfirmation["verdict"] = "transcript") => ({
    pageId,
    verdict,
    note: "read end to end",
    confirmedAt: "2026-08-07",
    confirmedBy: "max",
  });

  it("says nothing is owed when a meeting links the ruled page", () => {
    const [a] = rulingAttachments(
      [ruling("p1")],
      [
        {
          meetingId: "evt-1",
          title: "Gulf Coast RE KICKOFF",
          day: "2026-07-22",
          links: [{ source: "notion", id: "p1" }],
        },
      ],
      [],
      titleOf,
    );
    expect(a.placement).toBe("linked");
    expect(a.meeting?.meetingId).toBe("evt-1");
    expect(strandedTranscriptRulings([a])).toEqual([]);
  });

  it("does NOT count a link from another source as this ruling's link", () => {
    // The join is (source === notion AND id === pageId). A fireflies record that happens to carry
    // the same id string must not close a Notion ruling — that is a mis-join wearing a green tick.
    const [a] = rulingAttachments(
      [ruling("p1")],
      [{ meetingId: "evt-1", title: "m", day: "2026-07-22", links: [{ source: "fireflies", id: "p1" }] }],
      [{ id: "p1", title: "t", day: "2026-07-22", placement: "in-window-day-busy", sameDayMeetings: [{ id: "evt-1", title: "m" }] }],
      titleOf,
    );
    expect(a.placement).toBe("in-window-day-busy");
  });

  it("names the day's candidate events rather than picking one", () => {
    const [a] = rulingAttachments(
      [ruling("p1")],
      [],
      [
        {
          id: "p1",
          title: "t",
          day: "2026-06-16",
          placement: "in-window-day-busy",
          sameDayMeetings: [
            { id: "e1", title: "Caleb, Rob, Will | CGRoofingGroup.com" },
            { id: "e2", title: "Rob, Alex | Gulf Coast RE" },
          ],
        },
      ],
      titleOf,
    );
    expect(a.action).toContain("A HUMAN RULES");
    expect(a.action).toContain("CGRoofingGroup.com");
    expect(a.action).toContain("Gulf Coast RE");
    // The one thing it must never do: choose.
    expect(a.meeting).toBeUndefined();
  });

  it("tells the reader to widen the window, not to re-read the body, when the day was never scanned", () => {
    const [a] = rulingAttachments(
      [ruling("p1")],
      [],
      [{ id: "p1", title: "t", day: "2025-12-20", placement: "outside-window", sameDayMeetings: [] }],
      titleOf,
    );
    expect(a.action).toContain("WIDEN THE WINDOW past 2025-12-20");
  });

  it("treats a summary-only ruling as settled, never as a stranded transcript", () => {
    const attachments = rulingAttachments(
      [ruling("p1", "summary-only"), ruling("p2", "empty")],
      [],
      [
        { id: "p1", title: "t", day: "2026-06-16", placement: "in-window-day-busy", sameDayMeetings: [] },
        { id: "p2", title: "t", day: "2026-06-16", placement: "in-window-day-busy", sameDayMeetings: [] },
      ],
      titleOf,
    );
    expect(strandedTranscriptRulings(attachments)).toEqual([]);
    for (const a of attachments) expect(a.action).toContain("nothing owed");
  });

  it("flags a ruling on a page the spine never harvested", () => {
    const [a] = rulingAttachments([ruling("ghost")], [], [], titleOf);
    expect(a.placement).toBe("not-in-spine");
  });

  it("THE LIVE FINDING: all three rulings this repo has earned are stranded, so the board is unmoved", () => {
    const live: NotionReadConfirmation[] = JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "..", "MLE Internal Meetings", "notion-read-confirmations.json"),
        "utf8",
      ),
    ).confirmations;
    // Guard first — if a ruling is ever added, this test must be re-read, not silently widened.
    // Re-read 2026-08-07 (Q86 inc.21): a THIRD transcript ruling was added, so this number
    // moved 2 -> 3 by hand after checking the new row is genuinely stranded too. It is: the
    // 11:05 EDT Rob/Connor call is not on the calendar at all, and the only 2026-06-16 event
    // is the 13:00 CGRoofing meeting, which the body rules out on time AND subject.
    // Re-read 2026-08-08 (Q86 inc.25, catching up inc.24): a FOURTH transcript ruling was added by
    // inc.24 — `3a51de57…` (Gulf Coast RE KICKOFF 2026-07-22, 114,354 chars). This moved 3 -> 4 by
    // hand after confirming the new row is stranded too, off the live `spine:q86` run rather than
    // off the ruling note: its day holds exactly ONE event ("10 am - meet with Rob and Will; Kick
    // off meeting.") and the spine still refuses to weld a body to an event, so it attaches as a
    // near-match and stays stranded. NOTE inc.24 did not update this pin — it verified with
    // `vitest lib/__tests__`, a path that excludes this file, so the guard sat red until push.
    expect(live.filter((c) => c.verdict === "transcript")).toHaveLength(4);
    const attachments = rulingAttachments(
      live,
      [],
      [
        { id: "2cf1de57-0199-8003-9e6d-fd921fbb8a59", title: "will Devito", day: "2025-12-20", placement: "outside-window", sameDayMeetings: [] },
        { id: "3811de57-0199-8099-9137-ef10c8fd0efe", title: "Gulf Coast Realty, AI Alex meeting one", day: "2026-06-16", placement: "in-window-day-busy", sameDayMeetings: [{ id: "e1", title: "Caleb, Rob, Will | CGRoofingGroup.com + AI Platform Discovery" }] },
        { id: "3811de57-0199-80d4-b8e5-c0a7c8465085", title: "Meeting 2026-06-16T11:05:00.000-04:00", day: "2026-06-16", placement: "in-window-day-busy", sameDayMeetings: [{ id: "e1", title: "Caleb, Rob, Will | CGRoofingGroup.com + AI Platform Discovery" }] },
        { id: "3a51de57-0199-802b-b9f8-f59fa153a013", title: "Gulf Coast RE KICKOFF 2026-07-22", day: "2026-07-22", placement: "in-window-day-busy", sameDayMeetings: [{ id: "e2", title: "10 am - meet with Rob and Will; Kick off meeting." }] },
      ],
      titleOf,
    );
    expect(strandedTranscriptRulings(attachments)).toHaveLength(4);
  });

  it("THE LIVE FINDING, second half: a summary-only ruling is recorded and is NOT counted as a transcript", () => {
    const live: NotionReadConfirmation[] = JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "..", "MLE Internal Meetings", "notion-read-confirmations.json"),
        "utf8",
      ),
    ).confirmations;
    // Q86 inc.22 added the FOURTH ruling and the first non-transcript one. It is pinned here for a
    // reason the test above cannot cover: that guard counts `transcript` verdicts, so a row ruled
    // `summary-only` leaves it at 3 and passes without anyone noticing the file changed. A ruling
    // nothing asserts is a ruling that can be deleted or flipped in a later edit with a green suite
    // — the same "green about nothing" shape Q89 inc.22 and Q86 inc.17 both had to correct.
    // Re-read 2026-08-08 (Q86 inc.23): a FIFTH ruling landed, also `summary-only`, so this number
    // moved 4 -> 5 by hand after reading the new body end to end. Both non-transcript rulings are
    // asserted below by page id, not by count, so a later edit cannot swap one for the other.
    // Re-read 2026-08-08 (Q86 inc.23c): a SIXTH ruling landed, again `summary-only`, moving this
    // 5 -> 6 by hand after reading that body end to end too. It is the LAST Notion body above the
    // 512-byte floor, so absent a new snapshot this count should now stop moving — a later bump
    // without a new deepread beside it is the thing to be suspicious of.
    // Re-read 2026-08-08 (Q86 inc.25, catching up inc.24): a SEVENTH ruling landed, moving this
    // 6 -> 7 — and it is exactly the bump the line above says to be suspicious of, so it was
    // checked rather than waved through. It holds up: the deepread IS beside it
    // (`archive-reads/2026-07-22-gulfcoast.deepread.txt`, on disk and tracked), and the reason the
    // "should stop moving" prediction was wrong is inc.25's own finding — "the last body above the
    // floor" was measured on a depth-capped number, so there was never a reason for it to stop.
    // The prediction is left standing above rather than edited out: it was the belief at the time,
    // and what falsified it is the point.
    expect(live).toHaveLength(7);
    for (const pageId of [
      "79dbbdf5-61fe-441c-8324-1d3f75c8a6a9",
      "3c349f70-08dd-48c6-89c6-e0d71fd93d82",
      "1ce2ff0c-e5cc-4756-8d48-28e37f66a2f1",
    ]) {
      expect(live.find((c) => c.pageId === pageId)?.verdict).toBe("summary-only");
      // The whole point of the ruling: it may never become coverage. `fromNotion()` turns
      // hasTranscript true on a `transcript` verdict only, so this asserts the boundary rather than
      // trusting the note prose to be read.
      expect(live.filter((c) => c.verdict === "transcript").map((c) => c.pageId)).not.toContain(
        pageId,
      );
    }
  });

  // Q86 inc.23. Two of the five rulings are now Fireflies MIRRORS — a Notion row whose own url
  // properties point at a Fireflies id the spine already holds. That is the finding the counts hide:
  // `notion (49 rows)` printed beside `fireflies (17 records)` reads as the larger, more diverse
  // source, and an unknown share of the 49 are derivatives of the 17. This pins the two proven
  // mirrors against the live manifest so the claim stays measured rather than remembered.
  it("THE LIVE FINDING, third part: ruled Notion bodies that mirror a Fireflies record the spine already holds", () => {
    const read = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "..", ...p), "utf8");
    const manifest: { count: number; meetings: Array<{ id: string }> } = JSON.parse(
      read("MLE Internal Meetings", "manifest.json"),
    );
    const onSpine = new Set(manifest.meetings.map((m) => m.id));

    // slug -> the Fireflies id its OWN properties point at. Read off the deepread, not inferred.
    const mirrors: Record<string, string> = {
      "2026-07-15-joseph-rob-will-next-steps": "01KXK86RCXFEJ3AHCXDA6JC4KH",
      "2026-06-17-gulfcoast-re-ai-platform-notion": "01KV97D83V9WKJKS0HS1NFW0N7",
      // Q86 inc.23c — the THIRD mirror, which makes it the rule rather than the exception:
      // all three `summary-only` rulings are Fireflies mirrors, all three `transcript` rulings
      // are not. Shape now predicts provenance, so the count `notion (49)` is even less a
      // measure of source diversity than inc.22 and inc.23 each said in turn.
      "2026-06-16-cgroofing-ai-platform-discovery-notion": "01KV8VGJS6T7Z4P8ATSB4X5NQN",
    };
    for (const [slug, firefliesId] of Object.entries(mirrors)) {
      const body = read("MLE Internal Meetings", "archive-reads", `${slug}.deepread.txt`);
      expect(body).toContain(firefliesId); // the mirror edge is in the row itself
      expect(body).toContain("Imported from Fireflies straggler");
      expect(onSpine.has(firefliesId)).toBe(true); // ...and it lands on a record already counted
    }
    // Neither may be counted as an independent source: both are summary-only, so neither can ever
    // turn hasTranscript true, and the meetings behind them were covered before they were opened.
    expect(manifest.meetings).toHaveLength(17);
  });
});
