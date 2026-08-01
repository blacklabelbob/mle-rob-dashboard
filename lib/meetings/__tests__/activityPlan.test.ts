import { describe, expect, it } from "vitest";
import {
  extractHost,
  planMeetingActivities,
  stripQualifier,
  type CrmOrg,
  type CrmPerson,
} from "@/lib/meetings/activityPlan";
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

  // Q84 inc.63 — the live row this closes is `Meeting 2026-07-30` / Martin Fierro Restaurant,
  // which was being told to type in a date it was already stating.
  it("attaches a row whose own title states the day, and says the day came from the title", () => {
    const plan = planMeetingActivities(
      [row({ company: "Gulf Coast Roofing", day: "", title: "Meeting 2026-07-30" })],
      ORGS,
    );
    expect(plan.rows[0].disposition).toBe("attachable");
    expect(plan.rows[0].occursOn).toBe("2026-07-30");
    expect(plan.rows[0].dayFrom).toBe("title");
    expect(plan.rows[0].nextStep).toContain("read from the row's own title");
    expect(plan.counts).toMatchObject({ attachable: 1, noDate: 0 });
  });

  it("never reads a day out of a human-chosen title that merely contains one", () => {
    const plan = planMeetingActivities(
      [row({ company: "Gulf Coast Roofing", day: "", title: "Gulf Coast RE KICKOFF 2026-07-22" })],
      ORGS,
    );
    // Scanning inside a real title is how a wrong day gets welded onto a real meeting.
    expect(plan.rows[0].disposition).toBe("no-date");
    expect(plan.rows[0].occursOn).toBeUndefined();
  });

  it("prefers the day a human typed over the stamp in the title, and never overwrites it", () => {
    const plan = planMeetingActivities(
      [row({ company: "Gulf Coast Roofing", day: "2026-07-22", title: "Meeting 2026-07-30" })],
      ORGS,
    );
    expect(plan.rows[0].occursOn).toBe("2026-07-22");
    expect(plan.rows[0].dayFrom).toBe("call-date");
    expect(plan.rows[0].nextStep).not.toContain("read from the row's own title");
  });

  it("does not let a recovered day rescue a row whose company is still unknown", () => {
    const plan = planMeetingActivities(
      [row({ company: "Some Co The CRM Lacks", day: "", title: "Meeting 2026-07-30" })],
      ORGS,
    );
    expect(plan.rows[0].disposition).toBe("unknown-company");
    expect(plan.rows[0].occursOn).toBeUndefined();
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

// Q84 inc.18 — the two rows inc.17 called "companies the CRM genuinely does not have" are
// both in the CRM. These pin the behaviour that stopped a duplicate org from being created.
describe("near misses on unknown-company rows", () => {
  const QUALIFIED: CrmOrg[] = [{ id: "C-2019", name: "Omega Title (FL)" }];
  const PEOPLE: CrmPerson[] = [
    { id: "P-1010", name: "Dixith Magadiev", orgId: "C-2006" },
    { id: "P-1016", name: "George Guest Genie", orgId: "" },
  ];

  it("names the qualified org instead of calling the company missing", () => {
    const plan = planMeetingActivities([row({ company: "Omega Title" })], QUALIFIED);
    const r = plan.rows[0];
    expect(r.disposition).toBe("unknown-company"); // still NOT a match
    expect(r.nearMiss).toEqual({ kind: "org-qualifier", orgs: QUALIFIED });
    expect(r.nextStep).toContain("Omega Title (FL) [C-2019]");
    expect(r.nextStep).not.toContain("missing from the CRM");
  });

  it("never lets the stripped index shadow an exact match", () => {
    const both: CrmOrg[] = [...QUALIFIED, { id: "C-3000", name: "Omega Title" }];
    const plan = planMeetingActivities([row({ company: "Omega Title" })], both);
    expect(plan.rows[0].disposition).toBe("attachable");
    expect(plan.rows[0].org?.id).toBe("C-3000");
  });

  it("reports a person's first name in a company field as a person, with their org", () => {
    const plan = planMeetingActivities([row({ company: "Dixith" })], ORGS, PEOPLE);
    const r = plan.rows[0];
    expect(r.disposition).toBe("unknown-company");
    expect(r.nearMiss).toEqual({ kind: "person-not-company", people: [PEOPLE[0]] });
    expect(r.nextStep).toContain("Dixith Magadiev [P-1010] → C-2006");
    expect(r.nextStep).toContain("do NOT create a new org");
  });

  it("says the company is the missing record when the matched person has none", () => {
    const plan = planMeetingActivities([row({ company: "George" })], ORGS, PEOPLE);
    expect(plan.rows[0].nextStep).toContain("that person has no company in the CRM yet");
    expect(plan.rows[0].nextStep).not.toContain("do NOT create a new org");
  });

  it("falls back to the plain unknown sentence when the CRM holds nothing close", () => {
    const plan = planMeetingActivities([row({ company: "Nowhere Inc" })], ORGS, PEOPLE);
    expect(plan.rows[0].nearMiss).toBeUndefined();
    expect(plan.rows[0].nextStep).toContain("either the company is missing from the CRM");
  });

  it("leaves the domain ask alone — a host is not a near miss", () => {
    const plan = planMeetingActivities([row({ company: "cgroofing.net" })], QUALIFIED, PEOPLE);
    expect(plan.rows[0].nearMiss).toBeUndefined();
    expect(plan.rows[0].nextStep).toContain("names this meeting by domain");
  });
});

describe("stripQualifier", () => {
  it("removes only a trailing parenthetical", () => {
    expect(stripQualifier("Omega Title (FL)")).toBe("Omega Title");
    expect(stripQualifier("Dix Healthcare AI (7 models)")).toBe("Dix Healthcare AI");
    expect(stripQualifier("(FL) Omega Title")).toBe("(FL) Omega Title");
    expect(stripQualifier("Omega Title")).toBe("Omega Title");
  });
});
