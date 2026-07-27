import { describe, expect, it } from "vitest";
import { momentSeekSeconds, seekBlockedNotice, seekPlan } from "@/lib/calls/playbackSeek";
import { momentRows } from "@/lib/calls/momentList";
import type { PanelMoment } from "@/lib/calls/searchPanel";

// BUILD-QUEUE Q68 inc.32 — the jump list reaches the player.

function moment(over: Partial<PanelMoment> = {}): PanelMoment {
  return {
    turnKey: 3,
    idx: 7,
    time: "0:07",
    startMs: 7480,
    label: "Speaker 1",
    snippet: "about the refund",
    snippetStart: 0,
    snippetEnd: 16,
    truncatedStart: false,
    truncatedEnd: false,
    ...over,
  };
}

describe("momentSeekSeconds", () => {
  it("converts wire milliseconds to player seconds", () => {
    expect(momentSeekSeconds(7480)).toBe(7.48);
  });

  it("keeps the fraction — rounding moves the seek off the clicked sentence", () => {
    expect(momentSeekSeconds(1500)).toBe(1.5);
  });

  it("takes the very start of a call at face value", () => {
    // 0 is a REAL time here: it is a measured startMs, not a missing one.
    expect(momentSeekSeconds(0)).toBe(0);
  });

  it("refuses a missing time rather than yielding 0 (rule 1)", () => {
    // `null / 1000 === 0` is the whole reason this lives in one function.
    expect(momentSeekSeconds(null)).toBeNull();
    expect(momentSeekSeconds(undefined)).toBeNull();
  });

  it("refuses non-numeric, non-finite and negative offsets", () => {
    expect(momentSeekSeconds("7480")).toBeNull();
    expect(momentSeekSeconds(NaN)).toBeNull();
    expect(momentSeekSeconds(Infinity)).toBeNull();
    expect(momentSeekSeconds(-1)).toBeNull();
  });
});

describe("seekPlan", () => {
  it("seeks when there is a time and a player", () => {
    expect(seekPlan({ seekSeconds: 7.48, hasPlayer: true })).toEqual({ kind: "seek", seconds: 7.48 });
  });

  it("plans no seek for a moment with no known time — even with a player (rule 1)", () => {
    expect(seekPlan({ seekSeconds: null, hasPlayer: true })).toEqual({ kind: "no-time" });
  });

  it("blames the missing time, not the missing player, when BOTH are missing", () => {
    // Order matters: reporting `no-player` here would point a rep at the recording when the
    // transcript is what lacks a usable span.
    expect(seekPlan({ seekSeconds: null, hasPlayer: false })).toEqual({ kind: "no-time" });
  });

  it("plans no seek when nothing is mounted to seek (rule 2)", () => {
    expect(seekPlan({ seekSeconds: 7.48, hasPlayer: false })).toEqual({ kind: "no-player" });
  });

  it("never returns a seek without a finite seconds value", () => {
    for (const s of [null, NaN, -1] as unknown[]) {
      const plan = seekPlan({ seekSeconds: s as number | null, hasPlayer: true });
      if (plan.kind === "seek") expect(Number.isFinite(plan.seconds) && plan.seconds >= 0).toBe(true);
    }
  });
});

describe("seekBlockedNotice", () => {
  it("never names a cause the evidence does not carry (inc.31's rule, held)", () => {
    const notice = seekBlockedNotice();
    expect(notice).not.toMatch(/format|codec|unsupported|network|permission/i);
  });

  it("tells the rep what to do instead, and does not claim the transcript is affected", () => {
    expect(seekBlockedNotice()).toMatch(/press play/i);
  });
});

describe("momentRows carries the seek position", () => {
  it("gives a timed moment a seek position that matches its printed time", () => {
    const [row] = momentRows([moment()]);
    expect(row.time).toBe("0:07");
    expect(row.seekSeconds).toBe(7.48);
  });

  it("a row with no time has no seek position, and vice versa — one condition, not two", () => {
    // Both come off the same `startMs`, so a row can never print a time it will not seek to.
    for (const startMs of [-1, NaN] as number[]) {
      const [row] = momentRows([moment({ startMs, time: null })]);
      expect(row.time).toBeNull();
      expect(row.seekSeconds).toBeNull();
    }
  });

  it("keeps the segment index alongside the seconds", () => {
    // `idx` remains the segment identity; the seconds are what an `<audio>` element takes.
    const [row] = momentRows([moment()]);
    expect(row.idx).toBe(7);
  });
});
