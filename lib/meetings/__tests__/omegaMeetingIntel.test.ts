/**
 * Q89 inc.5 — the first REAL meeting through the gate.
 *
 * inc.1–inc.4 were all proven on fixtures the same increment invented. That proves the gate
 * is self-consistent; it does not prove a real meeting survives it. This suite runs the
 * actual 2026-07-28 Omega payload — read out of the Notion page body, not written from
 * memory — through `intelSourceFromActivities` → `buildMeetingIntel`, which is the exact
 * path the company record and the Overview take.
 *
 * The point of asserting on shipped DATA rather than a literal: if someone later edits a
 * pain point in that JSON into a nicer sentence, the verbatim check fails HERE, in CI,
 * instead of on Rob's screen.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Activity } from "@/lib/types";
import { intelSourceFromActivities } from "../intelSource";
import { buildMeetingIntel, isVerbatim, type IntelBlockKind } from "../meetingIntel";

const file = join(process.cwd(), "data/meetings/2026-07-28-omega.activity.json");
const payload = JSON.parse(readFileSync(file, "utf8")) as { activity: Activity };
const activity = payload.activity;

const source = intelSourceFromActivities([activity]);
const intel = buildMeetingIntel(source.candidates);
const block = (k: IntelBlockKind) => intel.blocks.find((b) => b.kind === k)!;

describe("the 2026-07-28 Omega meeting is a well-formed meeting activity", () => {
  it("is a meeting on C-2019, so the company record's seam can find it at all", () => {
    expect(activity.type).toBe("meeting");
    expect(activity.orgId).toBe("C-2019");
    expect(source.meetingCount).toBe(1);
  });

  it("has no unusable entries — every entry names a block it can be judged in", () => {
    expect(source.unusable).toEqual([]);
  });

  it("carries its own read provenance, so nobody has to re-derive where it came from", () => {
    const ctx = activity.sourceContext as Record<string, unknown>;
    expect(ctx.pageId).toBe("3ab1de57-0199-80ef-bf9c-c2b98d7578ed");
    expect(ctx.bodyChars).toBe(104683);
  });
});

describe("all four blocks render, and none of them renders empty", () => {
  it.each<[IntelBlockKind]>([
    ["action-items"],
    ["talking-points"],
    ["pain-points"],
    ["benefits-us"],
  ])("%s has surviving items", (kind) => {
    const b = block(kind);
    expect(b.isEmpty).toBe(false);
    expect(b.items.length).toBeGreaterThan(0);
  });

  it("rejects nothing — a real meeting written correctly loses no item", () => {
    expect(intel.rejected).toEqual([]);
  });

  it("every rendered item addresses a LINE, not just the meeting", () => {
    for (const b of intel.blocks) {
      for (const item of b.items) {
        expect(item.provenance.meetingId).toBe("A-MTG-2026-07-28-OMEGA");
        expect(item.provenance.sourceRef.trim()).not.toBe("");
      }
    }
  });
});

describe("Rob's hard rule holds against the shipped data, not against a fixture", () => {
  it("every pain point occurs verbatim inside the transcript line it cites", () => {
    const pains = block("pain-points").items;
    expect(pains.length).toBeGreaterThanOrEqual(4);
    for (const p of pains) {
      expect(p.provenance.excerpt).toBeTruthy();
      expect(isVerbatim(p.text, p.provenance.excerpt!)).toBe(true);
    }
  });

  it("no pain point cites a summary bullet — pain quotes the room, never the notetaker", () => {
    for (const p of block("pain-points").items) {
      expect(p.provenance.sourceRef).toMatch(/^body ¶\d+$/);
    }
  });

  it("fabricates no deep link anywhere — the Notion page opens the meeting, not the line", () => {
    for (const b of intel.blocks) {
      for (const item of b.items) expect(item.provenance.url).toBeUndefined();
    }
  });

  it("keeps the unresolved fraud allegation OFF the company record", () => {
    const all = JSON.stringify(activity.sourceContext).toLowerCase();
    expect(all).not.toContain("fraud");
    expect(all).not.toContain("stolen money");
  });
});
