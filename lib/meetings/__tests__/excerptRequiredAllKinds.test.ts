/**
 * Q89 inc.22 — critic-rob punch #9: the excerpt is required for ALL FOUR block kinds.
 *
 * Before this, only a pain point had to carry the line it stands on, because only a pain
 * point is checked word-for-word. That left three of the four blocks exempt from the
 * module's own first rule — a talking point could cite `block-412` and nothing else, and
 * "block-412" is an address, not evidence: it tells a reader where to go and tells them
 * nothing if the block is gone, renamed, or was never what the writer thought it was.
 *
 * TWO SEPARATE RULES, AND THIS SUITE EXISTS TO KEEP THEM SEPARATE:
 *   - every kind must NAME the line it stands on (excerpt present)  ← new
 *   - only pain points must BE that line (verbatim)                 ← unchanged
 * Collapsing them would delete the other three blocks or push writers to paste a sentence
 * that never supported the point, so the non-verbatim cases are pinned explicitly below.
 *
 * The last block runs the REAL shipped payloads, so the gate cannot be tightened into
 * silently emptying Rob's company pages: if a future edit drops an excerpt from any of the
 * published items, that item disappears from his screen — and this suite goes red first.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Activity } from "@/lib/types";
import { intelSourceFromActivities } from "../intelSource";
import { buildMeetingIntel, INTEL_BLOCK_KINDS, type IntelBlockKind } from "../meetingIntel";

const MEETING = "A-MTG-2026-07-22-GULFCOAST";

/** A claim that does NOT occur in its excerpt — legitimate for three kinds, fatal for one. */
const OUR_WORDING = "Multi-location rollout is the expansion path worth pricing for";
const THEIR_LINE =
  "we've got four yards now and every one of them runs its own scheduling, it's a nightmare to reconcile";

describe("punch #9 — every kind must name the line it stands on", () => {
  for (const kind of INTEL_BLOCK_KINDS) {
    it(`rejects a ${kind} item with no excerpt, by name rather than silently`, () => {
      const intel = buildMeetingIntel([
        { kind, text: "some claim about this account", provenance: { meetingId: MEETING, sourceRef: "line 12" } },
      ]);
      expect(intel.blocks.flatMap((b) => b.items)).toHaveLength(0);
      expect(intel.rejected.map((r) => r.reason)).toEqual(["no-excerpt-to-check"]);
      // The reason must be readable, not just machine-countable — a dropped item Rob cannot
      // account for is the silence this whole module exists to end.
      expect(intel.rejected[0].message).toContain("line 12");
    });

    it(`rejects an empty-string excerpt on ${kind} too — "" is absence wearing a costume`, () => {
      const intel = buildMeetingIntel([
        {
          kind,
          text: "some claim about this account",
          provenance: { meetingId: MEETING, sourceRef: "line 12", excerpt: "   " },
        },
      ]);
      expect(intel.rejected.map((r) => r.reason)).toEqual(["no-excerpt-to-check"]);
    });
  }

  it("says WHY differently for a pain point than for the other three, because the reason differs", () => {
    const reason = (kind: IntelBlockKind) =>
      buildMeetingIntel([{ kind, text: "a claim", provenance: { meetingId: MEETING, sourceRef: "line 9" } }])
        .rejected[0].message;
    expect(reason("pain-points")).toContain("verbatim");
    // The other three are not verbatim-checked, so citing verbatim at their author would be
    // an instruction they cannot follow. They are told the actual problem instead.
    expect(reason("talking-points")).not.toContain("verbatim");
    expect(reason("talking-points")).toContain("An address is not evidence");
  });
});

describe("requiring an excerpt did NOT quietly become requiring verbatim", () => {
  for (const kind of ["action-items", "talking-points", "benefits-us"] as const) {
    it(`keeps a ${kind} item whose wording is OURS, so long as it cites the line it reads`, () => {
      const intel = buildMeetingIntel([
        {
          kind,
          text: OUR_WORDING,
          provenance: { meetingId: MEETING, sourceRef: "line 146", excerpt: THEIR_LINE },
        },
      ]);
      const b = intel.blocks.find((x) => x.kind === kind)!;
      expect(b.items).toHaveLength(1);
      expect(b.items[0].text).toBe(OUR_WORDING);
      expect(intel.rejected).toEqual([]);
    });
  }

  it("still refuses that same paraphrase as a PAIN point — the one kind that must be their words", () => {
    const intel = buildMeetingIntel([
      {
        kind: "pain-points",
        text: OUR_WORDING,
        provenance: { meetingId: MEETING, sourceRef: "line 146", excerpt: THEIR_LINE },
      },
    ]);
    expect(intel.rejected.map((r) => r.reason)).toEqual(["paraphrased-pain"]);
  });
});

describe("the gate did not empty the pages it guards", () => {
  const dir = join(process.cwd(), "data/meetings");
  const activities = readdirSync(dir)
    .filter((f) => f.endsWith(".activity.json"))
    .map((f) => (JSON.parse(readFileSync(join(dir, f), "utf8")) as { activity: Activity }).activity);

  it("loaded the real published meetings, so the counts below cannot pass vacuously", () => {
    expect(activities.length).toBeGreaterThanOrEqual(4);
    expect(activities.every((a) => a.type === "meeting")).toBe(true);
  });

  it("every published item across every meeting survives the tightened gate", () => {
    const source = intelSourceFromActivities(activities);
    const intel = buildMeetingIntel(source.candidates);
    const kept = intel.blocks.flatMap((b) => b.items).length;
    // Measured at inc.22: 73 items, all four kinds, every one carrying an excerpt already.
    expect(source.candidates.length).toBe(73);
    expect(kept).toBe(73);
    expect(intel.rejected).toEqual([]);
  });
});
