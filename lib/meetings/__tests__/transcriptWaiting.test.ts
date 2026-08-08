/**
 * Q86 inc.46 — asserted against the THREE REAL READS on disk, never fixtures.
 *
 * The whole point of this module is that inc.43, inc.44 and inc.45 wrote three different shapes,
 * so a fixture would be a fourth shape that agrees with the code by construction. These tests
 * read `MLE Internal Meetings/transcript-reads/*.json` and fail loudly if the files move or if a
 * later increment normalises them — because if the shapes converge, half this module's ladder is
 * dead code and should be deleted rather than left green.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  waitingCallFrom,
  waitingCallsFor,
  type TranscriptRead,
} from "../transcriptWaiting";

const DIR = join(process.cwd(), "MLE Internal Meetings", "transcript-reads");

function load(file: string): TranscriptRead {
  return JSON.parse(readFileSync(join(DIR, file), "utf8"));
}

const ALL = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map(load);

describe("the reads this module exists for are actually on disk", () => {
  it("finds all three, and names them so a rename fails here rather than silently", () => {
    const refs = ALL.map((r) => r.transcriptRef).sort();
    expect(refs).toEqual(["david-cates.txt", "john-burns.txt", "joseph-ontime.txt"]);
  });

  it("exactly ONE of the three states its own refusals — the asymmetry the module handles", () => {
    const stated = ALL.filter((r) => r.whyItStillCannotBeFiled?.primary?.refusal);
    expect(stated).toHaveLength(1);
    expect(stated[0].transcriptRef).toBe("david-cates.txt");
  });
});

describe("a read that STATES its refusals is carried verbatim", () => {
  const call = waitingCallFrom(load("david-cates-2026-08-08.json"))!;

  it("carries both refusals, primary first, in the read's own kinds", () => {
    expect(call.blockers.map((b) => b.kind)).toEqual(["no-org", "no-day"]);
    expect(call.refusalsAreStated).toBe(true);
  });

  it("prints the ACTUAL gap, not the module's paraphrase of it", () => {
    expect(call.blockers[0].why).toContain("The Cates Processing Group");
    expect(call.blockers[0].why).toContain("NO company record");
  });

  it("carries the unblock condition the read wrote down", () => {
    expect(call.unblock).toContain("a company record and a date");
  });

  it("hangs on the person the linker resolved, since no org exists to hang it on", () => {
    expect(call.recordIds).toEqual(["P-1020"]);
  });

  it("reads the size out of the read's own sentence", () => {
    expect(call.minutes).toBe(131);
    expect(call.words).toBe(17742);
  });
});

describe("a read that does NOT state its refusals derives exactly one, and says so", () => {
  const call = waitingCallFrom(load("john-burns-2026-08-08.json"))!;

  it("derives no-day from callDate.resolved and nothing else", () => {
    expect(call.blockers).toHaveLength(1);
    expect(call.blockers[0].kind).toBe("no-day");
    expect(call.blockers[0].why).toContain("3 candidate days");
    expect(call.blockers[0].why).toContain("2026-07-09 ceiling");
  });

  it("marks the list as NOT stated so the surface can warn it is partial", () => {
    expect(call.refusalsAreStated).toBe(false);
  });

  it("surfaces on the org AND the person it came through — both are missing the call", () => {
    expect(call.recordIds).toEqual(["C-2013", "P-1015"]);
  });

  it("falls back to whatWouldSettleIt for the unblock", () => {
    expect(call.unblock).toContain("phone call log");
  });
});

describe("the refusal it deliberately does NOT derive", () => {
  const joseph = load("joseph-ontime-2026-08-08.json");
  const call = waitingCallFrom(joseph)!;

  it("joseph-ontime carries a HUMAN ruling the linker is built never to act on", () => {
    const link = joseph.recordLink as Record<string, unknown>;
    expect(String(link.humanRuling ?? "")).toContain("SAME COMPANY");
    expect(JSON.stringify(joseph.recordLink)).toContain("must not");
  });

  it("and the module still emits ONLY no-day — it never converts that ruling into a refusal", () => {
    expect(call.blockers.map((b) => b.kind)).toEqual(["no-day"]);
    expect(call.blockers[0].why).toContain("4 candidate days");
  });
});

describe("waitingCallsFor — what a record page gets", () => {
  it("C-2016 On Time Moving sees the call whose title says ROOFING", () => {
    const calls = waitingCallsFor("C-2016", ALL);
    expect(calls.map((c) => c.transcriptRef)).toEqual(["joseph-ontime.txt"]);
    expect(calls[0].transcriptTitle).toContain("Roofing");
  });

  it("P-1020 David Cates sees a 131-minute call blocked on a company record", () => {
    const calls = waitingCallsFor("P-1020", ALL);
    expect(calls).toHaveLength(1);
    expect(calls[0].minutes).toBe(131);
    expect(calls[0].blockers[0].kind).toBe("no-org");
  });

  it("a record with nothing waiting gets an empty list, never a placeholder", () => {
    expect(waitingCallsFor("C-2018", ALL)).toEqual([]);
  });

  it("a read naming no record at all is dropped rather than hung on nobody", () => {
    expect(waitingCallFrom({ transcriptRef: "x.txt", recordLink: {} })).toBeNull();
  });

  it("a read with no blockers left is NOT waiting on the record — it is waiting on a writer", () => {
    const unblocked: TranscriptRead = {
      transcriptRef: "y.txt",
      recordLink: { record: "C-9999 Somebody" },
      callDate: { resolved: true },
    };
    expect(waitingCallFrom(unblocked)!.blockers).toEqual([]);
    expect(waitingCallsFor("C-9999", [unblocked])).toEqual([]);
  });
});
