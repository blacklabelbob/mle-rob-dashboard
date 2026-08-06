/**
 * Q89 inc.13 — the rank carry, proved against a PUBLISHED row rather than a fixture.
 *
 * WHY THIS FILE IS SEPARATE FROM `nextStepsAdapter.test.ts`. That suite proves the seam's rules
 * against objects this repo invents. Invented fixtures agree with the code that reads them by
 * construction; they cannot catch the failure where the scorer's real output and the activity
 * schema drift apart. This suite reads the actual on-disk meeting row that inc.11 published and
 * inc.13 ranked, so it fails the day either side changes shape.
 *
 * WHAT IT DOES NOT PROVE. It does not re-run the scorer — `score_next_steps.py` owns its own
 * ladders and its own tests. It proves only the two things this repo is responsible for: that a
 * carried `rank` survives `intelSource` → `meetingIntel`, and that the resulting block declares
 * itself ranked. The ranks asserted below are the scorer's output for `--as-of 2026-08-05`,
 * copied here as a constant so a silent change to the published row is a red test, not a
 * quietly reordered screen.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { candidatesFromActivity } from "@/lib/meetings/intelSource";
import { buildMeetingIntel } from "@/lib/meetings/meetingIntel";

const ACTIVITY_PATH = "data/meetings/2026-06-16-gulfcoast-ai-alex-one.activity.json";

/** The scorer's ranking of the four `to_do` blocks, keyed by the text on the published row. */
const EXPECTED_ORDER = [
  "Research Origin Vault and their hashing technology (Origin Stamp) for HomeCloneVault integration",
  "Fix SEO issues on gulfcoastregroup.com before tomorrow's meeting (meta tags, headers, image alt text, broken links, schema)",
  "Confirm meeting details tonight",
  "Look into Bold Trail pricing for comparison",
];

function actionBlock() {
  const file = JSON.parse(fs.readFileSync(ACTIVITY_PATH, "utf8"));
  const { candidates } = candidatesFromActivity(file.activity);
  const intel = buildMeetingIntel(candidates);
  const block = intel.blocks.find((b) => b.kind === "action-items");
  if (!block) throw new Error("the published Gulf Coast row has no action-items block");
  return block;
}

describe("Q89 inc.13 — ranks carried onto a published meeting row", () => {
  it("renders the action items as ranked, not in source order", () => {
    expect(actionBlock().ordering).toBe("ranked");
  });

  it("orders them exactly as the scorer did", () => {
    expect(actionBlock().items.map((i) => i.text)).toEqual(EXPECTED_ORDER);
  });

  /**
   * UPDATED Q89 inc.19 — this asserted `[1, 2, 3, 4]` and went red the moment the ranking became
   * account-level, which is the correct outcome and not a regression. `1,2,3,4` was the 06-16
   * meeting's own ranking; the row now carries `1,3,4,10`, its four items' positions in ONE
   * ranking over both Gulf Coast meetings (critic-rob punch #1 move 3). Contiguity was never the
   * property worth pinning — it was an artifact of scoring one meeting in isolation, and holding
   * onto it would have made the test demand the exact defect it was written to catch.
   *
   * The properties that DO survive, and are what a reader can be misled by, are asserted instead:
   * every item carries a number (a hole reads as "unranked" while sitting in a ranked list), the
   * numbers strictly ascend (the rendered order IS the score's order), and the gaps land where
   * the other meeting's items were scored — proven by `crossMeetingRank.test.ts`, which owns the
   * account-wide uniqueness check this file deliberately cannot see from one row.
   */
  it("carries a rank on every action item — a partial ranking must not read as complete", () => {
    const ranks = actionBlock().items.map((i) => i.rank);
    expect(ranks.every((r) => typeof r === "number")).toBe(true);
    expect(ranks).toEqual([...ranks].sort((a, b) => (a as number) - (b as number)));
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it("leaves the other three blocks in source order — the scorer does not rank them", () => {
    const file = JSON.parse(fs.readFileSync(ACTIVITY_PATH, "utf8"));
    const { candidates } = candidatesFromActivity(file.activity);
    const intel = buildMeetingIntel(candidates);
    for (const block of intel.blocks) {
      if (block.kind === "action-items") continue;
      expect(block.ordering).toBe("source-order");
    }
  });
});
