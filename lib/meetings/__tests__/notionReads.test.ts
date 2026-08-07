/**
 * Q86 inc.10 — parsing a Q84 deep read's own header.
 *
 * The header format belongs to Q84's archive pass, so it is PARSED, never assumed. A file that
 * cannot name the page it is a read OF is not a read: guessing the id from the filename is how the
 * wrong body gets attached to the wrong meeting, which is the one failure this whole item exists
 * to prevent.
 */

import { describe, expect, it } from "vitest";
import { indexNotionReads, parseDeepReadHeader } from "@/lib/meetings/notionReads";

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
