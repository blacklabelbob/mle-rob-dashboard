/**
 * Q89 inc.24 — critic-rob punch #8, the COMPANY RECORD half.
 *
 * WHY THIS FILE EXISTS. Punch #8 asks for "one boundary test per surface that asserts the
 * **rendered label string**, driven from the same shape the page builds", and names
 * `publishedRankCarry.test.ts` as the right instinct needing "a sibling for the Overview".
 * The Overview got that sibling in inc.15 (`overviewSourceLabel.test.ts`). The company
 * record never got one — and inc.23 then added a whole layer, `groupIntelItems`, BETWEEN
 * `buildMeetingIntel` and the screen. `omegaMeetingIntel.test.ts` walks the real payload as
 * far as `buildMeetingIntel` and stops there, so every assertion in this repo about the
 * company record stops one hop short of what a reader sees. That hop is exactly the shape
 * of gap punch #8 was written about: #2 was a designed field dead for ten increments in the
 * space between "candidate is correct" and "screen is correct".
 *
 * WHY IT ASSERTS THROUGH THE PURE FUNCTIONS RATHER THAN MOUNTING THE COMPONENT. There is no
 * DOM test library in this project, and adding one to assert four strings would be a large
 * dependency bought for a small check. `MeetingIntelSection` is a server component whose
 * every rendered string comes from a pure call it makes — `groupIntelItems`, `sourceLabel`,
 * `contextExcerpt` — so this suite calls the same functions in the same order with the same
 * inputs and asserts the strings that come out. Same method as `overviewSourceLabel.test.ts`.
 * It is a boundary test, not a render test, and the two rendered literals it reproduces
 * (the group heading and the "Show all" summary) are duplicated from the component on
 * purpose: if someone edits the component's wording, that is a deliberate act, and the
 * duplicate is what makes it show up here rather than sliding out silently.
 *
 * WHY THE OMEGA PAYLOAD AND NOT A FIXTURE. Same reason as `omegaMeetingIntel.test.ts`: a
 * fixture invented by the increment that tests it proves only self-consistency. This is the
 *2026-07-28 Omega meeting as shipped on disk — the record path's real input.
 *
 * WHAT IT DOES NOT PROVE. Not the ordering (`publishedRankCarry.test.ts`), not the Overview's
 * label (`overviewSourceLabel.test.ts`), not the provenance gate (`meetingIntel.test.ts`),
 * and not the grouping module's own algebra (`grouping.test.ts`). It proves only what those
 * three produce TOGETHER on the record surface.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Activity } from "@/lib/types";
import { intelSourceFromActivities } from "../intelSource";
import {
  buildMeetingIntel,
  COMPACT_REF_TITLE_MAX,
  compactSourceLabel,
  contextExcerpt,
  sourceLabel,
} from "../meetingIntel";
import { groupIntelItems, GROUP_CAP } from "../grouping";

const activity: Activity = JSON.parse(
  readFileSync(join(process.cwd(), "data/meetings/2026-07-28-omega.activity.json"), "utf8")
).activity;

/**
 * The company record's exact path, as `app/companies/[id]/page.tsx` walks it:
 * `store.listActivities({ orgId })` — one company's activities, hence the single-element
 * array — then `intelSourceFromActivities`, then `buildMeetingIntel`. Grouping happens
 * per block inside the component, so it stays out of here and is applied per assertion.
 */
function recordIntel() {
  return buildMeetingIntel(intelSourceFromActivities([activity]).candidates);
}

describe("company record — the four blocks as rendered", () => {
  it("renders all four blocks with items, so the rest of this suite is not vacuous", () => {
    const blocks = recordIntel().blocks;
    expect(blocks).toHaveLength(4);
    for (const block of blocks) {
      expect(block.isEmpty, `${block.kind} is empty — assertions below would pass on nothing`).toBe(
        false
      );
      expect(block.items.length).toBeGreaterThan(0);
    }
  });

  /**
   * THE INVARIANT THIS FILE WAS WRITTEN FOR.
   *
   * `ItemGroup` renders an `<h4>` company heading if and only if `group.context` is set.
   * On a single-company surface the context is deliberately absent — `grouping.ts` says a
   * heading there "would be noise" — because the reader is already looking at that company's
   * record. If context ever got stamped on the record path (an easy mistake: the publisher
   * DOES stamp it, correctly, for the cross-company Overview), every block on every company
   * record would grow a heading repeating the name of the company you are already on.
   *
   * Nothing before this test could catch that. `meetingIntel.test.ts` asserts the provenance
   * rules, `grouping.test.ts` asserts that a context becomes a heading — neither asserts
   * which surface is supposed to have one.
   */
  it("prints no company heading on any block — one group, context null, on the record", () => {
    for (const block of recordIntel().blocks) {
      const groups = groupIntelItems(block.items);
      expect(groups, `${block.kind} split into ${groups.length} groups on a single-company surface`)
        .toHaveLength(1);
      expect(groups[0].context, `${block.kind} would render an <h4> repeating the company name`)
        .toBeNull();
    }
  });

  /**
   * The label is the claim's address, and it is the string punch #2 found dead on the other
   * surface. On the record it must be the bare `meetingId · sourceRef` — no context prefix,
   * for the same reason there is no heading — and it must actually resolve to this meeting
   * rather than to an empty or partial address.
   */
  it("renders every item's source label as the bare address of this meeting", () => {
    const meetingId = activity.id;
    for (const block of recordIntel().blocks) {
      for (const item of block.items) {
        const label = sourceLabel(item.provenance);
        expect(label).toBe(`${item.provenance.meetingId} · ${item.provenance.sourceRef}`);
        expect(label).toContain(meetingId);
        expect(label).not.toContain("undefined");
        expect(label.trim()).not.toBe("·");
      }
    }
  });

  /**
   * Q92(b) CORRECTION 2026-08-06 — the case above asserts what `sourceLabel` returns, and
   * the component stopped calling `sourceLabel` for its visible text when Q92(b) landed: it
   * calls `compactSourceLabel`, on BOTH surfaces. So the record was rendering elided titles
   * while this suite stayed green about a string nobody was showing. This case asserts what
   * `ItemRow` actually prints on the record — `compact={false}`, hence `elideTitles: false`
   * and no group heading to omit — and it first proves a real row is over the limit, because
   * an assertion that cannot reach the branch is how the bug survived in the first place.
   */
  it("prints the UNELIDED address on the record — long titles and all", () => {
    const items = recordIntel().blocks.flatMap((b) => b.items);
    const overLimit = items.filter((i) =>
      [...(i.provenance.sourceRef ?? "").matchAll(/«([^»]*)»/g)].some(
        (m) => m[1].trim().length > COMPACT_REF_TITLE_MAX
      )
    );
    expect(overLimit.length, "no row is long enough to elide — this test would prove nothing")
      .toBeGreaterThan(0);

    for (const item of items) {
      // Exactly the arguments `ItemRow` passes on the record surface.
      const rendered = compactSourceLabel(item.provenance, {
        omitContext: false,
        elideTitles: false,
      });
      expect(rendered).toBe(sourceLabel(item.provenance));
      expect(rendered).not.toContain("…");
    }
  });

  /**
   * `ItemRow` prints the rank number only when the block claims `ranked`. The Omega record
   * is `source-order` — a single meeting nobody has scored — so no number may appear. A
   * rank printed beside an unscored item is a false claim of priority, which is punch #1's
   * defect wearing the opposite face.
   */
  it("prints no rank numbers on a source-order block", () => {
    for (const block of recordIntel().blocks) {
      expect(block.ordering).toBe("source-order");
      // The exact condition `ItemRow` branches on.
      const ranked = block.ordering === "ranked";
      for (const item of block.items) {
        expect(ranked && typeof item.rank === "number").toBe(false);
      }
    }
  });

  it("renders an excerpt under an item only when it is not the item's own sentence", () => {
    for (const block of recordIntel().blocks) {
      for (const item of block.items) {
        const source = contextExcerpt(item);
        // `contextExcerpt` returns null rather than "" so the component's `{source && …}`
        // guard cannot render an empty blockquote — a bordered empty box reads as a
        // quotation with nothing in it.
        expect(source === null || source.trim().length > 0).toBe(true);
      }
    }
  });
});

describe("company record — the cap never changes the count", () => {
  /**
   * The Omega record has at most `GROUP_CAP` items in any block, so the shipped data does
   * not exercise the overflow. That is a fact about today's data, not a reason to leave the
   * arithmetic unasserted — the next captured meeting can push a block past five. The cap is
   * driven down to 2 rather than inventing extra items, so the overflow is proven on REAL
   * item shapes.
   *
   * Q89 exists because a meeting's contents must be visible or they did not happen, so a cap
   * that silently truncated would re-create that exact defect in the UI. Hence: the summary
   * prints the TOTAL, never the hidden count.
   */
  it("keeps every item and prints the true total in the 'Show all' summary", () => {
    const blocks = recordIntel().blocks.filter((b) => b.items.length > 2);
    expect(blocks.length, "no block has enough items to overflow a cap of 2").toBeGreaterThan(0);

    for (const block of blocks) {
      const [group] = groupIntelItems(block.items, 2);
      expect(group.shown).toHaveLength(2);
      expect(group.hidden.length).toBe(block.items.length - 2);
      // Nothing dropped: shown + hidden is the whole block, in order.
      expect([...group.shown, ...group.hidden]).toEqual(block.items);
      expect(group.total).toBe(block.items.length);

      // The literal `ItemGroup` renders in its <summary>.
      const summary = `Show all ${group.total} — ${group.hidden.length} more`;
      expect(summary).toBe(`Show all ${block.items.length} — ${block.items.length - 2} more`);
      // The count a reader sees is the total, so the cap can never read as "that's all there is".
      expect(summary).toContain(String(block.items.length));
    }
  });

  it("renders no disclosure at all when a block fits the real cap", () => {
    for (const block of recordIntel().blocks) {
      const [group] = groupIntelItems(block.items);
      expect(block.items.length).toBeLessThanOrEqual(GROUP_CAP);
      // `{group.hidden.length > 0 && …}` — nothing to disclose, so no <details> element.
      expect(group.hidden).toHaveLength(0);
      expect(group.shown).toEqual(block.items);
    }
  });
});
