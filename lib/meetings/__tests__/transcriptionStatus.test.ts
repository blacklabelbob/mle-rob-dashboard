import { describe, expect, it } from "vitest";
import {
  classifyTranscription,
  pageTranscriptionStatus,
  transcriptionStatusOf,
} from "../transcriptionStatus";

/**
 * The fixture is the REAL block, copied out of the live API response for
 * `3b21de57-0199-80e8-95b6-ca602d7129c6` (`Meeting 2026-08-04`) on 2026-08-07 — one of the 18
 * rows Q84 inc.49 handed to a human. Its `children` ids and `title` are kept because their
 * presence is part of the finding: the block advertises a `transcript_block_id` AND reports
 * that no transcription ever ran, so a caller that chased the id would find nothing under it.
 */
const REAL_TRANSCRIPTION_BLOCK = {
  type: "transcription",
  has_children: true,
  transcription: {
    title: [{ type: "text", plain_text: "Meeting " }],
    status: "transcription_not_started",
    children: {
      notes_block_id: "3b21de57-0199-8057-9120-f0556a66b83d",
      transcript_block_id: "3b21de57-0199-8099-849f-f5f6a2d68989",
    },
  },
};

describe("transcriptionStatusOf", () => {
  it("reads the status off the real block that started this", () => {
    expect(transcriptionStatusOf(REAL_TRANSCRIPTION_BLOCK)).toBe("transcription_not_started");
  });

  it("returns null for any block that is not a transcription block", () => {
    expect(transcriptionStatusOf({ type: "paragraph", paragraph: { rich_text: [] } })).toBeNull();
  });

  it("returns null rather than throwing when the shape is not what we saw", () => {
    expect(transcriptionStatusOf(null)).toBeNull();
    expect(transcriptionStatusOf("transcription")).toBeNull();
    expect(transcriptionStatusOf({ type: "transcription" })).toBeNull();
    expect(transcriptionStatusOf({ type: "transcription", transcription: null })).toBeNull();
    expect(transcriptionStatusOf({ type: "transcription", transcription: { status: 7 } })).toBeNull();
  });
});

describe("pageTranscriptionStatus", () => {
  it("finds the transcription block among the paragraphs that surround it", () => {
    // The measured shape of a container-only row: 5 blocks, 1 transcription + 4 empty paragraphs.
    const page = [
      { type: "paragraph", paragraph: { rich_text: [] } },
      REAL_TRANSCRIPTION_BLOCK,
      { type: "paragraph", paragraph: { rich_text: [] } },
    ];
    expect(pageTranscriptionStatus(page)).toBe("transcription_not_started");
  });

  it("returns null on a page with no transcription block at all", () => {
    expect(pageTranscriptionStatus([{ type: "paragraph", paragraph: { rich_text: [] } }])).toBeNull();
  });
});

describe("classifyTranscription", () => {
  it("calls the 14 not-started rows never-produced, and says so in Notion's own word", () => {
    const v = classifyTranscription("transcription_not_started");
    expect(v.disposition).toBe("never-produced");
    expect(v.status).toBe("transcription_not_started");
    expect(v.why).toContain("transcription_not_started");
  });

  it("calls the 4 paused rows never-produced WITHOUT collapsing them into the not-started ones", () => {
    const paused = classifyTranscription("transcription_paused");
    const notStarted = classifyTranscription("transcription_not_started");
    expect(paused.disposition).toBe("never-produced");
    // Same disposition, different verbatim status — a caller can always tell the two apart.
    expect(paused.status).toBe("transcription_paused");
    expect(paused.status).not.toBe(notStarted.status);
    expect(paused.why).not.toBe(notStarted.why);
  });

  it("does NOT retire a row whose transcript Notion says exists", () => {
    expect(classifyTranscription("transcription_completed").disposition).toBe("transcript-exists");
  });

  /**
   * The safety property. An unrecognised status must never be read as an absence — that is the
   * `Call Recording`-is-empty failure that Q84 exists to stop, and the reason this ladder is a
   * closed allow-list in both directions rather than "anything that isn't completed".
   */
  it("claims NOTHING from a status it does not recognise", () => {
    for (const s of ["transcription_in_progress", "transcription_failed", "", "completed"]) {
      const v = classifyTranscription(s);
      expect(v.disposition).toBe("unknown");
    }
  });

  it("treats a missing transcription block as unknown, never as never-produced", () => {
    expect(classifyTranscription(null).disposition).toBe("unknown");
    expect(classifyTranscription(undefined).disposition).toBe("unknown");
    expect(classifyTranscription(null).why).toContain("says nothing either way");
  });
});
