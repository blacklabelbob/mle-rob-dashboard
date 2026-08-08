import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { notionAbsences, unrecoveredReadyTranscripts } from "../notionTranscriptionScan";

const SCAN = join(process.cwd(), "MLE Internal Meetings", "notion-transcription-status.json");
const CONFIRMATIONS = join(process.cwd(), "MLE Internal Meetings", "notion-read-confirmations.json");

const readScan = () => JSON.parse(readFileSync(SCAN, "utf8"));
const readRuledIds = (): string[] => {
  const raw = JSON.parse(readFileSync(CONFIRMATIONS, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.confirmations;
  return list.map((c: { pageId: string }) => c.pageId);
};

describe("notionAbsences", () => {
  it("names the absence when Notion says no transcript was ever produced", () => {
    const { absences } = notionAbsences(
      [{ pageId: "abc", title: "Weekly Review", status: "transcription_not_started" }],
      [],
    );
    expect(absences).toHaveLength(1);
    expect(absences[0].disposition).toBe("named-absence");
    expect(absences[0].action).toBe("");
    expect(absences[0].why).toContain("transcription_not_started");
  });

  it("keeps a row OWED when Notion says the transcript is ready", () => {
    const { absences } = notionAbsences([{ pageId: "abc", status: "notes_ready" }], []);
    expect(absences[0].disposition).toBe("owed-transcript");
    expect(absences[0].action).toContain("OPEN THIS PAGE IN NOTION");
    // A row with no title still names itself, so it can be found.
    expect(absences[0].title).toBe("abc");
  });

  it("never turns a failed fetch into an absence", () => {
    const { absences } = notionAbsences(
      [{ pageId: "abc", status: null, error: "HTTP 502" }],
      [],
    );
    expect(absences[0].disposition).toBe("owed-unmeasured");
    expect(absences[0].why).toContain("HTTP 502");
  });

  it("claims nothing from a status the ladder does not recognise", () => {
    const { absences } = notionAbsences([{ pageId: "abc", status: "transcription_wat" }], []);
    expect(absences[0].disposition).toBe("owed-unmeasured");
    expect(absences[0].status).toBe("transcription_wat");
  });

  it("never re-judges a row a human already ruled, and counts the skip", () => {
    const { absences, skippedRuled } = notionAbsences(
      [
        { pageId: "3b31de57-0199-80ea-9171-cd12c228e3d7", status: "transcription_not_started" },
        { pageId: "other", status: "transcription_not_started" },
      ],
      ["3b31de5701998 0ea9171cd12c228e3d7".replace(/\s/g, "")],
    );
    expect(skippedRuled).toBe(1);
    expect(absences.map((a) => a.pageId)).toEqual(["other"]);
  });
});

describe("the live 2026-08-08 scan on disk", () => {
  it("answers every unruled wrapper row with a named reason or a named debt", () => {
    const { absences } = notionAbsences(readScan().measured, readRuledIds());
    expect(absences).toHaveLength(20);
    const named = absences.filter((a) => a.disposition === "named-absence");
    const owed = unrecoveredReadyTranscripts(absences);
    // 18 answered by Notion's own field; 2 rows say the transcript is READY and nobody has it.
    expect(named).toHaveLength(18);
    expect(owed).toHaveLength(2);
    // No row is left without a disposition — that is the whole point of the increment.
    expect(absences.filter((a) => a.disposition === "owed-unmeasured")).toHaveLength(0);
  });

  it("keeps the 16 already-ruled control rows out of the result", () => {
    const { skippedRuled } = notionAbsences(readScan().measured, readRuledIds());
    expect(skippedRuled).toBe(16);
  });

  it("pins the control that earned notes_ready its place in the ladder", () => {
    const scan = readScan().measured as { pageId: string; status: string | null }[];
    const raw = JSON.parse(readFileSync(CONFIRMATIONS, "utf8"));
    const list = (Array.isArray(raw) ? raw : raw.confirmations) as {
      pageId: string;
      verdict: string;
    }[];
    const norm = (id: string) => id.replace(/-/g, "").toLowerCase();
    const verdictOf = new Map(list.map((c) => [norm(c.pageId), c.verdict]));
    const ruledTranscripts = scan.filter((r) => verdictOf.get(norm(r.pageId)) === "transcript");
    expect(ruledTranscripts).toHaveLength(14);
    // Every body a human read end to end and ruled a transcript reports notes_ready.
    expect(ruledTranscripts.every((r) => r.status === "notes_ready")).toBe(true);
  });
});
