/**
 * Q89 inc.15 — the Overview's BOUNDARY, asserted as the string a reader actually sees.
 *
 * WHY THIS FILE EXISTS. critic-rob (2026-08-05, punch list #8) named a structural blind spot:
 * 265 green tests sat either side of the one seam that eats data — `networkIntel.test.ts:33`
 * asserts `context` on the *candidate*, and line 35 asserts `sourceLabel` *directly*, so the
 * hop between them (`buildMeetingIntel`'s provenance rebuild) was never crossed by a test. A
 * designed field was dead on the Overview for ten increments inside that gap. This suite walks
 * the whole path the page walks — org-name map → `networkIntelFromActivities` → `buildMeetingIntel`
 * → `sourceLabel` — and asserts the rendered label, not an intermediate object.
 *
 * WHY IT ASSERTS "a name, not an id" RATHER THAN A LITERAL NAME. `data/network.json` is Q71
 * synthetic scaffolding; prod's `C-2018` is Gulf Coast Real Estate Group, this repo's is
 * `Ravensmoor Merchant Services`. Hardcoding either would make the test a fixture check that
 * goes red on a reseed and green on the actual defect. The defect is *the id reaching the
 * screen*, so that is what is asserted: the label must lead with the name the same ledger the
 * page reads holds for that org, and that name must not be the id.
 *
 * WHAT IT SETTLES. critic-rob punch list #3 claimed `app/page.tsx:51` builds the map "from the
 * wrong ledger" — that `data.people` is the people ledger, so every `C-####` lookup misses and
 * the Overview prints a raw id. This suite is the check on that claim, and it is why the claim
 * is answered by a test rather than by a code change nobody proved was needed. Post-0003 the
 * orgs split is a STORAGE split, not a read split: `supabaseStore.getNetwork()` returns
 * `[...people, ...orgs.map(toOrgPerson)]`, so `NetworkData.people` carries company rows too.
 *
 * WHAT IT DOES NOT PROVE. Not the ordering (`publishedRankCarry.test.ts`), not the provenance
 * rules (`meetingIntel.test.ts`), and not that prod's own ledger names every org it has meetings
 * for — an org absent from `network.json` still correctly degrades to its id, and that is
 * `networkIntel.ts`'s stated "never a guess" behaviour, asserted below rather than assumed.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { networkIntelFromActivities } from "@/lib/meetings/networkIntel";
import { buildMeetingIntel, sourceLabel } from "@/lib/meetings/meetingIntel";
import type { Activity } from "@/lib/types";
import type { NetworkData } from "@/lib/types";

const MEETINGS_DIR = "data/meetings";

function publishedActivities(): Activity[] {
  return fs
    .readdirSync(MEETINGS_DIR)
    .filter((f) => f.endsWith(".activity.json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(MEETINGS_DIR, f), "utf8")).activity as Activity);
}

/** Built exactly the way `app/page.tsx` builds it, from the same ledger the page reads. */
function orgNameMap(): { map: Record<string, string>; network: NetworkData } {
  const network = JSON.parse(fs.readFileSync("data/network.json", "utf8")) as NetworkData;
  return { map: Object.fromEntries(network.people.map((p) => [p.id, p.name])), network };
}

function labelsFor(activities: Activity[], map: Record<string, string>): string[] {
  const source = networkIntelFromActivities(activities, map);
  const intel = buildMeetingIntel(source.candidates);
  return intel.blocks.flatMap((b) => b.items.map((i) => sourceLabel(i.provenance)));
}

describe("Q89 inc.15 — the Overview label, end to end", () => {
  const activities = publishedActivities();
  const { map } = orgNameMap();

  it("has published meetings to render (a green suite over zero rows proves nothing)", () => {
    expect(activities.length).toBeGreaterThan(0);
    expect(labelsFor(activities, map).length).toBeGreaterThan(0);
  });

  it("leads every label with the COMPANY NAME the ledger holds — never the raw org id", () => {
    for (const activity of activities) {
      const orgId = activity.orgId?.trim();
      if (!orgId) continue;
      const name = map[orgId];
      // If the ledger genuinely has no row for this org, the id is the honest answer and
      // this activity is not evidence either way. Assert the map is not empty instead.
      if (!name) continue;
      expect(name).not.toBe(orgId);
      for (const label of labelsFor([activity], map)) {
        expect(label.startsWith(`${name} · `)).toBe(true);
        expect(label.startsWith(`${orgId} ·`)).toBe(false);
      }
    }
  });

  it("resolves a name for every org the published meetings name (no silent id fallback today)", () => {
    const unresolved = activities
      .map((a) => a.orgId?.trim())
      .filter((id): id is string => Boolean(id))
      .filter((id) => !map[id]);
    expect(unresolved).toEqual([]);
  });

  it("falls back to the id, not to a guess, when the ledger does not know the org", () => {
    const labels = labelsFor(activities, {});
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label).toMatch(/^C-\d+ · A-MTG-/);
    }
  });

  it("keeps a cross-company Overview attributable — labels name more than one company", () => {
    const leads = new Set(labelsFor(activities, map).map((l) => l.split(" · ")[0]));
    expect(leads.size).toBeGreaterThan(1);
  });
});
