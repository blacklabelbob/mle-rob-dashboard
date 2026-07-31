import { describe, expect, it } from "vitest";
import { extractHost, planMeetingActivities, type CrmOrg } from "@/lib/meetings/activityPlan";
import type { ArchiveRowDetail } from "@/lib/meetings/unexplainedRows";

const row = (over: Partial<ArchiveRowDetail> = {}): ArchiveRowDetail => ({
  id: "n1",
  title: "Kickoff",
  day: "2026-07-22",
  ...over,
});

const ORGS: CrmOrg[] = [
  { id: "C-0001", name: "PropLogix, LLC." },
  { id: "C-0002", name: "Gulf Coast Roofing" },
];

describe("planMeetingActivities", () => {
  it("attaches when exactly one org matches after normalization", () => {
    const plan = planMeetingActivities([row({ company: "proplogix llc" })], ORGS);
    expect(plan.rows[0].disposition).toBe("attachable");
    expect(plan.rows[0].org?.id).toBe("C-0001");
    expect(plan.counts).toMatchObject({ considered: 1, attachable: 1 });
  });

  it("reports a company the CRM does not have rather than guessing the nearest", () => {
    const plan = planMeetingActivities([row({ company: "Gulf Coast Roofin" })], ORGS);
    expect(plan.rows[0].disposition).toBe("unknown-company");
    expect(plan.rows[0].org).toBeUndefined();
    expect(plan.counts.unknownCompany).toBe(1);
  });

  it("never picks between two orgs sharing a name — it lists both", () => {
    const twins: CrmOrg[] = [...ORGS, { id: "C-0009", name: "proplogix llc" }];
    const plan = planMeetingActivities([row({ company: "PropLogix, LLC." })], twins);
    expect(plan.rows[0].disposition).toBe("ambiguous-company");
    expect(plan.rows[0].candidates?.map((c) => c.id)).toEqual(["C-0001", "C-0009"]);
    expect(plan.rows[0].org).toBeUndefined();
  });

  it("does not split a company field that names two companies", () => {
    const plan = planMeetingActivities([row({ company: "PropLogix, LLC. & Gulf Coast Roofing" })], ORGS);
    expect(plan.rows[0].disposition).toBe("unknown-company");
  });

  it("separates 'nobody said who this was with' from a matching failure", () => {
    const plan = planMeetingActivities([row({ company: "   " }), row({ id: "n2" })], ORGS);
    expect(plan.rows.map((r) => r.disposition)).toEqual(["no-company", "no-company"]);
    expect(plan.counts).toMatchObject({ considered: 2, noCompany: 2, attachable: 0 });
  });

  it("ignores an unnamed CRM org instead of matching an unnamed archive row to it", () => {
    const plan = planMeetingActivities([row({ company: "  " })], [...ORGS, { id: "C-0000", name: "" }]);
    expect(plan.rows[0].disposition).toBe("no-company");
  });

  it("will not call a dateless row attachable even when the company is known", () => {
    const plan = planMeetingActivities([row({ company: "Gulf Coast Roofing", day: "" })], ORGS);
    expect(plan.rows[0].disposition).toBe("no-date");
    // The org IS reported — the human only has to supply the missing day, not re-find the company.
    expect(plan.rows[0].org?.id).toBe("C-0002");
    expect(plan.counts).toMatchObject({ attachable: 0, noDate: 1 });
  });

  it("carries the whole archive row through so a report needs no second lookup", () => {
    const plan = planMeetingActivities([row({ company: "Gulf Coast Roofing", url: "https://notion/x" })], ORGS);
    expect(plan.rows[0].row.day).toBe("2026-07-22");
    expect(plan.rows[0].row.url).toBe("https://notion/x");
  });

  it("is empty-safe on both sides", () => {
    expect(planMeetingActivities([], ORGS).counts.considered).toBe(0);
    expect(planMeetingActivities([row({ company: "PropLogix, LLC." })], []).rows[0].disposition).toBe("unknown-company");
  });
});

// ── Q84 inc.17 — the archive names some companies by domain, and the CRM stores domains ──
describe("planMeetingActivities · domain matching", () => {
  const DOMAIN_ORGS: CrmOrg[] = [
    { id: "C-0001", name: "PropLogix, LLC.", domain: "proplogix.com" },
    { id: "C-0002", name: "Gulf Coast Roofing", website: "https://www.gulfcoastroofing.com/contact" },
    { id: "C-0003", name: "CG Roofing Group", website: "https://www.cgroofinggroup.com/" },
  ];

  it("attaches on the org's website host when the archive names a domain", () => {
    const plan = planMeetingActivities([row({ company: "gulfcoastroofing.com" })], DOMAIN_ORGS);
    expect(plan.rows[0].disposition).toBe("attachable");
    expect(plan.rows[0].org?.id).toBe("C-0002");
    expect(plan.rows[0].matchedBy).toBe("domain");
    expect(plan.rows[0].nextStep).toContain("gulfcoastroofing.com");
  });

  it("reads a bare domain field as well as a website URL", () => {
    const plan = planMeetingActivities([row({ company: "https://PropLogix.com/team" })], DOMAIN_ORGS);
    expect(plan.rows[0].org?.id).toBe("C-0001");
    expect(plan.rows[0].matchedBy).toBe("domain");
  });

  // The live case, and the reason inc.16's premise needed correcting: the archive says
  // cgroofing.net, the CRM says cgroofinggroup.com. Look-alike is not the same company.
  it("refuses to equate a look-alike host with a CRM org's host", () => {
    const plan = planMeetingActivities([row({ company: "cgroofing.net" })], DOMAIN_ORGS);
    expect(plan.rows[0].disposition).toBe("unknown-company");
    expect(plan.rows[0].org).toBeUndefined();
    // The ask is the one-field CRM fix, not "fix the spelling".
    expect(plan.rows[0].nextStep).toContain("Domain field");
    expect(plan.rows[0].nextStep).not.toContain("spelling differs");
  });

  it("keeps the name match ahead of the host match", () => {
    const plan = planMeetingActivities([row({ company: "proplogix llc" })], DOMAIN_ORGS);
    expect(plan.rows[0].matchedBy).toBe("name");
    expect(plan.rows[0].org?.id).toBe("C-0001");
  });

  it("does not read a plain company name as a host", () => {
    const plan = planMeetingActivities([row({ company: "Gulf Coast Roofing" })], DOMAIN_ORGS);
    expect(plan.rows[0].disposition).toBe("attachable");
    expect(plan.rows[0].matchedBy).toBe("name");
  });

  it("reports two orgs on one host as ambiguous rather than picking the first", () => {
    const twins: CrmOrg[] = [
      { id: "C-1", name: "Alpha", domain: "shared.com" },
      { id: "C-2", name: "Beta", website: "https://shared.com" },
    ];
    const plan = planMeetingActivities([row({ company: "shared.com" })], twins);
    expect(plan.rows[0].disposition).toBe("ambiguous-company");
    expect(plan.rows[0].candidates?.map((o) => o.id)).toEqual(["C-1", "C-2"]);
    expect(plan.counts.ambiguousCompany).toBe(1);
  });

  it("counts one org stating one host once, not as an ambiguity", () => {
    const one: CrmOrg[] = [{ id: "C-9", name: "Solo", domain: "solo.com", website: "https://www.solo.com/x" }];
    const plan = planMeetingActivities([row({ company: "solo.com" })], one);
    expect(plan.rows[0].disposition).toBe("attachable");
    expect(plan.rows[0].org?.id).toBe("C-9");
  });

  it("still needs a day even when the host matched", () => {
    const plan = planMeetingActivities([row({ company: "proplogix.com", day: "" })], DOMAIN_ORGS);
    expect(plan.rows[0].disposition).toBe("no-date");
    expect(plan.rows[0].matchedBy).toBe("domain");
  });
});

describe("extractHost", () => {
  it("strips scheme, www, port, path and a trailing dot", () => {
    expect(extractHost("HTTPS://WWW.Example.com:8443/a/b?c=1#d")).toBe("example.com");
    expect(extractHost("example.com.")).toBe("example.com");
  });

  it("returns nothing for values that are not hosts", () => {
    for (const v of ["", "   ", "Gulf Coast RE Group", "localhost", "two words.com", null, undefined]) {
      expect(extractHost(v)).toBe("");
    }
  });

  it("takes the host out of an address pasted into a website field", () => {
    expect(extractHost("rob@aivoicetech.io")).toBe("aivoicetech.io");
  });
});
