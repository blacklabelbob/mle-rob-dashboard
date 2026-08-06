/**
 * Q89 inc.19 — ONE ranking per COMPANY, asserted against the payloads prod actually serves.
 *
 * WHY THIS FILE EXISTS. critic-rob punch #1 (docs/reviews/CRITIC-ROB-Q89-meeting-intel-2026-08-05.md)
 * found C-2018 printing a `ranked` header over two meetings' rankings zipped together — a #1 from
 * 06-16 next to a #1 from 07-22. Move 1 (the unique-rank gate) and move 2 (print the number) made
 * the label stop lying by falling back to source order. Move 3 is the actual fix: one account-level
 * scorer run over every meeting's open actions, via `scripts/score-company-next-steps.mjs`.
 *
 * WHAT IT ASSERTS, AND WHY EACH ASSERTION EARNS ITS PLACE:
 *   1. Cross-meeting uniqueness at the SOURCE. The two Gulf Coast files must not both contain a
 *      rank 1. This is the machine-proof the critic named — duplicate ranks across an account's
 *      meetings ARE two rankings merged, regardless of what any header says.
 *   2. The ordering the SURFACE resolves to. Uniqueness in the data is worthless if the block
 *      still degrades; this walks the page's own path and asserts `ordering === "ranked"`, so the
 *      header is true because the gate passed, not because the gate was loosened.
 *   3. The order is the SCORE's order. Rendered rank sequence must be ascending — a list ordered
 *      by anything but its own numbers is the original defect wearing numbers.
 *
 * WHAT IT DOES NOT ASSERT. Not the specific ranks (they move whenever `--as-of` moves or a meeting
 * lands — asserting them would pin a snapshot, not a property), and not the scorer's weights,
 * which are `meeting-next-steps`' own tested contract, not this repo's to re-litigate.
 *
 * IT MUST NOT BE VACUOUS. An account with one meeting cannot fail assertion 1, so the fixture is
 * checked to be genuinely multi-meeting first; if C-2018 ever stops having two published meetings
 * this test fails loudly rather than passing empty.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { networkIntelFromActivities } from "@/lib/meetings/networkIntel";
import { buildMeetingIntel } from "@/lib/meetings/meetingIntel";
import type { Activity } from "@/lib/types";

const MEETINGS_DIR = "data/meetings";
const ACCOUNT = "C-2018";

function publishedActivities(): Activity[] {
  return fs
    .readdirSync(MEETINGS_DIR)
    .filter((f) => f.endsWith(".activity.json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(MEETINGS_DIR, f), "utf8")).activity as Activity);
}

type IntelRow = { kind: string; rank?: number };

function accountActionRanks(): number[] {
  const ranks: number[] = [];
  for (const a of publishedActivities()) {
    if (a.orgId !== ACCOUNT) continue;
    const intel = ((a as unknown as { sourceContext?: { intel?: IntelRow[] } }).sourceContext?.intel ?? [])
      .filter((i) => i.kind === "action-items");
    for (const i of intel) if (typeof i.rank === "number") ranks.push(i.rank);
  }
  return ranks;
}

describe("one ranking per company, not one per meeting", () => {
  it("the fixture is genuinely multi-meeting, so the uniqueness check cannot pass vacuously", () => {
    const meetings = publishedActivities().filter((a) => a.orgId === ACCOUNT);
    expect(meetings.length).toBeGreaterThan(1);
  });

  it("no rank repeats across the account's meetings — a duplicate IS two rankings merged", () => {
    const ranks = accountActionRanks();
    expect(ranks.length).toBeGreaterThan(0);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it("the surface resolves to `ranked`, so the header is true rather than tolerated", () => {
    const activities = publishedActivities().filter((a) => a.orgId === ACCOUNT);
    const intel = buildMeetingIntel(networkIntelFromActivities(activities).candidates);
    const actions = intel.blocks.find((b) => b.kind === "action-items");
    expect(actions).toBeDefined();
    expect(actions!.ordering).toBe("ranked");
  });

  it("the rendered order IS the score's order — ascending, never source position", () => {
    const activities = publishedActivities().filter((a) => a.orgId === ACCOUNT);
    const intel = buildMeetingIntel(networkIntelFromActivities(activities).candidates);
    const actions = intel.blocks.find((b) => b.kind === "action-items");
    const rendered = actions!.items.map((i) => i.rank).filter((r): r is number => typeof r === "number");
    expect(rendered.length).toBe(actions!.items.length);
    expect([...rendered]).toEqual([...rendered].sort((a, b) => a - b));
  });
});
