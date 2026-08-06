/**
 * Q92(b) — the Overview's label, shortened without becoming a different address.
 *
 * critic-rob RESCORE 2026-08-06, punch #3: on the grouped Overview the label repeats the
 * company name the `<h4>` directly above it already prints, and the block title inside « »
 * is long enough to push the followable part of the address off the line.
 *
 * The risk this suite exists to pin down is NOT "is it shorter" — it is that a shortened
 * address is still an address. So the assertions are about what may never be touched:
 *  - the meeting id, whole and unelided,
 *  - the kind prefix (`body bullet`, `body to_do 7`) outside the quotes,
 *  - the company record's bare `meetingId · sourceRef`, which `companyRecordRender.test.ts`
 *    pins and which this compaction must not reach.
 *
 * Run against the REAL published activities as well as fixtures, because the long titles
 * that caused the punch are in `data/meetings/*.activity.json`, not in anything invented here.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  COMPACT_REF_TITLE_MAX,
  buildMeetingIntel,
  compactSourceLabel,
  sourceLabel,
  type Provenance,
} from "@/lib/meetings/meetingIntel";
import { groupIntelItems } from "@/lib/meetings/grouping";
import { networkIntelFromActivities } from "@/lib/meetings/networkIntel";
import type { Activity, NetworkData } from "@/lib/types";

const MEETINGS_DIR = "data/meetings";

function publishedActivities(): Activity[] {
  return fs
    .readdirSync(MEETINGS_DIR)
    .filter((f) => f.endsWith(".activity.json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(MEETINGS_DIR, f), "utf8")).activity as Activity);
}

function orgNameMap(): Record<string, string> {
  const network = JSON.parse(fs.readFileSync("data/network.json", "utf8")) as NetworkData;
  return Object.fromEntries(network.people.map((p) => [p.id, p.name]));
}

/** Exactly what `MeetingIntelSection` walks: group → heading → row label. */
function overviewRows(): { groupContext: string | null; p: Provenance }[] {
  const source = networkIntelFromActivities(publishedActivities(), orgNameMap());
  const intel = buildMeetingIntel(source.candidates);
  return intel.blocks.flatMap((b) =>
    groupIntelItems(b.items).flatMap((g) =>
      [...g.shown, ...g.hidden].map((i) => ({ groupContext: g.context, p: i.provenance })),
    ),
  );
}

/** The condition `ItemRow` branches on, kept in one place so the test cannot drift from it. */
function omitFor(row: { groupContext: string | null; p: Provenance }): boolean {
  return row.groupContext !== null && row.groupContext === row.p.context?.trim();
}

describe("Q92(b) — compactSourceLabel", () => {
  const LONG: Provenance = {
    meetingId: "A-MTG-2026-07-28-OMEGA",
    sourceRef: "body bullet «Restaurant Background & Challenges»",
    context: "Ravensmoor Merchant Services",
  };

  it("drops the company name only when the caller says the heading already shows it", () => {
    expect(compactSourceLabel(LONG, { omitContext: true })).not.toContain("Ravensmoor");
    expect(compactSourceLabel(LONG, { omitContext: false })).toContain("Ravensmoor Merchant Services · ");
    // No opts at all must behave like the full label's context handling, not like omit.
    expect(compactSourceLabel(LONG)).toContain("Ravensmoor Merchant Services · ");
  });

  it("never elides the meeting id or the kind prefix — those are what make it followable", () => {
    const label = compactSourceLabel(LONG, { omitContext: true });
    expect(label.startsWith("A-MTG-2026-07-28-OMEGA · body bullet «")).toBe(true);
    expect(label).not.toContain("A-MTG…");
  });

  it("elides only the text inside « », and says so with an ellipsis", () => {
    const label = compactSourceLabel(LONG, { omitContext: true });
    const title = label.match(/«([^»]*)»/)?.[1] ?? "";
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(COMPACT_REF_TITLE_MAX + 1);
    expect(label.endsWith("»")).toBe(true);
  });

  it("returns a short title byte-identical — it shortens, it does not reformat", () => {
    const short: Provenance = { meetingId: "A-MTG-X", sourceRef: "body bullet «Next Steps»" };
    expect(compactSourceLabel(short)).toBe("A-MTG-X · body bullet «Next Steps»");
    const noQuotes: Provenance = { meetingId: "A-MTG-X", sourceRef: "body to_do 7" };
    expect(compactSourceLabel(noQuotes)).toBe("A-MTG-X · body to_do 7");
  });

  it("shortens every quoted title in a ref that carries two of them", () => {
    const two: Provenance = {
      meetingId: "A-MTG-X",
      sourceRef: "body bullet «Meeting Overview» + «Diversification Strategy: New Platforms Being Built»",
    };
    const titles = [...compactSourceLabel(two).matchAll(/«([^»]*)»/g)].map((m) => m[1]);
    expect(titles).toHaveLength(2);
    expect(titles[0]).toBe("Meeting Overview"); // under the max — untouched
    expect(titles[1].endsWith("…")).toBe(true);
  });

  it("leaves a single-company surface alone — the company record keeps the bare full address", () => {
    // No context set is exactly the company-record shape; nothing may be dropped there.
    const bare: Provenance = { meetingId: "A-MTG-X", sourceRef: "body bullet «Next Steps»" };
    expect(compactSourceLabel(bare, { omitContext: false })).toBe(sourceLabel(bare));
  });
});

describe("Q92(b) — against the published Overview, not fixtures", () => {
  const rows = overviewRows();

  it("has grouped rows to check (a green suite over zero rows proves nothing)", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.groupContext !== null)).toBe(true);
  });

  it("prints the company name once per row, never twice, under its own heading", () => {
    for (const row of rows) {
      const label = compactSourceLabel(row.p, { omitContext: omitFor(row) });
      if (omitFor(row)) expect(label).not.toContain(row.groupContext!);
    }
  });

  it("keeps every row's meeting id intact and resolvable to the full label", () => {
    for (const row of rows) {
      const label = compactSourceLabel(row.p, { omitContext: omitFor(row) });
      expect(label).toContain(row.p.meetingId);
      // The full address is what the surface hangs on `title` — it must still be buildable.
      expect(sourceLabel(row.p)).toContain(row.p.sourceRef);
    }
  });

  it("actually shortens the wall — at least one real row was over the limit", () => {
    const shortened = rows.filter(
      (r) => compactSourceLabel(r.p, { omitContext: omitFor(r) }).length < sourceLabel(r.p).length,
    );
    expect(shortened.length).toBeGreaterThan(0);
  });
});
