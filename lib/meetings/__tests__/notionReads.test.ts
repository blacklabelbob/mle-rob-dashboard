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
import { indexNotionReads, parseDeepReadHeader } from "@/lib/meetings/notionReads";
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
