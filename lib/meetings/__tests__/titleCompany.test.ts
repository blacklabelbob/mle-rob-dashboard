// Q85 inc.3. Every title in here is a VERBATIM prod archive title, read off
// `npm run check:archive -- --json` on 2026-08-07 — not an invented shape. The whole point of
// this module is that it agrees with the rows that actually exist.

import { describe, expect, it } from "vitest";

import { planMeetingActivities, type CrmOrg } from "../activityPlan";
import { hostsInTitle, titleHostHits } from "../titleCompany";
import type { ArchiveRowDetail } from "../unexplainedRows";

/** The prod orgs that matter to these rows, verbatim from `/rest/v1/orgs` on 2026-08-07. */
const CG: CrmOrg = {
  id: "C-2017",
  name: "CG Roofing Group",
  domain: "cgroofinggroup.com",
  website: "https://www.cgroofinggroup.com/",
};
const GULF: CrmOrg = {
  id: "C-2018",
  name: "Gulf Coast RE Group",
  domain: "gulfcoastregroup.com",
  website: "https://www.gulfcoastregroup.com/",
};

const hostIndexOf = (orgs: CrmOrg[]) => {
  const m = new Map<string, CrmOrg[]>();
  for (const o of orgs) for (const h of [o.domain]) if (h) m.set(h, [o]);
  return m;
};

describe("hostsInTitle", () => {
  it("reads the host out of a real archive title, case-folded", () => {
    expect(hostsInTitle("Caleb, Rob, Will | CGRoofingGroup.com + AI Platform Discovery")).toEqual([
      "cgroofinggroup.com",
    ]);
    expect(hostsInTitle("Rob Will Caleb | CGRoofinggroup.com - Next Steps")).toEqual([
      "cgroofinggroup.com",
    ]);
  });

  it("does not read a date, a year or a bare word as a company address", () => {
    // Every one of these is a real prod title with no host in it. A false positive here is a
    // meeting welded onto a company nobody named.
    expect(hostsInTitle("Speaker 1 — 2026-06-19")).toEqual([]);
    expect(hostsInTitle("MLE TEAM KICKOFF")).toEqual([]);
    expect(hostsInTitle("Rob & Austin | MArtin Fierro")).toEqual([]);
    expect(hostsInTitle("Joseph, Rob, Will | Next Steps - Jul 15, 2026 (Fireflies)")).toEqual([]);
    expect(
      hostsInTitle("Rob, Alex, Will, Chris | Gulf Coast RE + AI Platform - Jun 17, 2026 (Fireflies)")
    ).toEqual([]);
  });

  it("rejects a numeric TLD — a version or a decimal is not an address", () => {
    expect(hostsInTitle("Rob & Will | pricing 1.5 vs 2.0")).toEqual([]);
    expect(hostsInTitle("sync 2026.07 planning")).toEqual([]);
  });

  it("de-duplicates a host stated twice and keeps title order", () => {
    expect(hostsInTitle("cgroofinggroup.com + www.cgroofinggroup.com / qualia.com")).toEqual([
      "cgroofinggroup.com",
      "qualia.com",
    ]);
  });

  it("returns only hosts the index actually holds", () => {
    const index = hostIndexOf([CG, GULF]);
    expect(titleHostHits("Caleb, Rob, Will | CGRoofingGroup.com + AI", index)).toEqual([
      { host: "cgroofinggroup.com", orgs: [CG] },
    ]);
    // Cloudflare is the TOPIC of a real 2026-08-03 call. It must never resolve to anything.
    expect(
      titleHostHits("Robert Acheson, Austin Wilkins | Cloudflare / SEO optimization — 2026-08-03", index)
    ).toEqual([]);
  });
});

const row = (over: Partial<ArchiveRowDetail>): ArchiveRowDetail => ({
  id: "n-1",
  title: "",
  day: "2026-06-16",
  ...over,
});

describe("planMeetingActivities — title-host near miss", () => {
  it("an EMPTY company field no longer claims only someone who was there can say", () => {
    const r = row({
      title: "Caleb, Rob, Will | CGRoofingGroup.com + AI Platform Discovery - Jun 16, 2026 (Fireflies)",
      company: "",
    });
    const plan = planMeetingActivities([r], [CG, GULF]);
    const out = plan.rows[0];
    expect(out.disposition).toBe("unknown-company");
    expect(out.nearMiss).toEqual({
      kind: "title-host",
      hits: [{ host: "cgroofinggroup.com", orgs: [CG] }],
    });
    expect(out.nextStep).toContain("C-2017");
    expect(out.nextStep).not.toContain("only someone who was there");
    expect(plan.counts.noCompany).toBe(0);
  });

  it("a company field naming an UNKNOWN host defers to the title rather than asking for a new org", () => {
    // Live row: field says `cgroofing.net` (no org carries it) while the title says the host
    // C-2017 is actually registered at. The old sentence sent a human to register the wrong one.
    const r = row({
      title: "Rob Will Caleb | CGRoofinggroup.com - Next Steps",
      company: "cgroofing.net",
      day: "2026-06-18",
    });
    const out = planMeetingActivities([r], [CG, GULF]).rows[0];
    expect(out.disposition).toBe("unknown-company");
    expect(out.nearMiss).toEqual({
      kind: "title-host",
      hits: [{ host: "cgroofinggroup.com", orgs: [CG] }],
    });
    expect(out.nextStep).toContain("cgroofing.net");
    expect(out.nextStep).toContain("C-2017");
  });

  it("NEVER attaches on a title alone — the disposition stays a question", () => {
    const r = row({ title: "Rob | cgroofinggroup.com", company: "" });
    const out = planMeetingActivities([r], [CG]).rows[0];
    expect(out.disposition).not.toBe("attachable");
    expect(out.org).toBeUndefined();
  });

  it("leaves a titleless row exactly as it was — no-company still means no-company", () => {
    const out = planMeetingActivities([row({ title: "MLE TEAM KICKOFF", company: "" })], [CG]).rows[0];
    expect(out.disposition).toBe("no-company");
    expect(out.nearMiss).toBeUndefined();
  });

  it("a company field that RESOLVES is untouched — the title is never consulted", () => {
    const out = planMeetingActivities(
      [row({ title: "Rob | cgroofinggroup.com", company: "Gulf Coast RE Group" })],
      [CG, GULF]
    ).rows[0];
    expect(out.disposition).toBe("attachable");
    expect(out.org).toEqual(GULF);
  });
});
