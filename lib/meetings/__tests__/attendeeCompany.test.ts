// Q84 inc.64 — pins the rules that decide whether a recording's attendee list is allowed to
// name the company a meeting belongs to. The dangerous direction is a false RESOLVE (a meeting
// welded onto the wrong company record, unrecoverable), so most of these pin a refusal.

import { describe, it, expect } from "vitest";
import {
  OWN_MEETING_HOSTS,
  externalGuestHosts,
  resolveCompanyFromAttendance,
  attendanceNextStep,
  indexRecordingsByKey,
  attendanceForRow,
  type MeetingRecording,
} from "../attendeeCompany";
import type { CrmOrg } from "../activityPlan";

const ORGS: CrmOrg[] = [
  { id: "C-2001", name: "PropLogix, LLC.", domain: "proplogix.com" },
  { id: "C-2002", name: "CG Roofing Group", website: "https://www.cgroofinggroup.com/about" },
  { id: "C-2003", name: "Gulf Coast RE Group", domain: "gulfcoastregroup.com" },
  { id: "C-2004", name: "No Domain Co", domain: null, website: null },
];

describe("externalGuestHosts", () => {
  it("parses emails and bare domains alike, deduped", () => {
    expect(externalGuestHosts(["dana@proplogix.com", "proplogix.com", "ops@cgroofinggroup.com"])).toEqual([
      "proplogix.com",
      "cgroofinggroup.com",
    ]);
  });

  it("drops Rob's own hosts — they are on both sides of every meeting", () => {
    for (const own of OWN_MEETING_HOSTS) {
      expect(externalGuestHosts([`rob@${own}`])).toEqual([]);
    }
  });

  it("drops free/consumer mailboxes — a gmail address names no company", () => {
    expect(externalGuestHosts(["someone@gmail.com", "x@yahoo.com", "y@icloud.com"])).toEqual([]);
  });

  it("keeps a real counterparty host that merely looks unfamiliar", () => {
    expect(externalGuestHosts(["a@thetitlebase.com"])).toEqual(["thetitlebase.com"]);
  });

  it("ignores junk that is not a host at all", () => {
    expect(externalGuestHosts(["", null, undefined, "Gulf Coast RE Group", "no-at-sign"])).toEqual([]);
  });
});

describe("resolveCompanyFromAttendance", () => {
  it("resolves when one CRM org owns every external host in the room", () => {
    const r = resolveCompanyFromAttendance(["rob@aivoicetech.io", "dana@proplogix.com"], ORGS);
    expect(r).toEqual({ kind: "resolved", org: ORGS[0], hosts: ["proplogix.com"] });
  });

  it("matches a host stored only as a website URL", () => {
    const r = resolveCompanyFromAttendance(["ops@cgroofinggroup.com"], ORGS);
    expect(r.kind).toBe("resolved");
    expect(r.kind === "resolved" && r.org.id).toBe("C-2002");
  });

  it("resolves when two hosts land on the SAME org — one company, two domains", () => {
    const orgs: CrmOrg[] = [{ id: "C-2005", name: "Two Host Co", domain: "one.com", website: "https://two.com" }];
    const r = resolveCompanyFromAttendance(["a@one.com", "b@two.com"], orgs);
    expect(r).toEqual({ kind: "resolved", org: orgs[0], hosts: ["one.com", "two.com"] });
  });

  it("NEVER picks when two distinct CRM orgs were in the room", () => {
    const r = resolveCompanyFromAttendance(["dana@proplogix.com", "ops@cgroofinggroup.com"], ORGS);
    expect(r.kind).toBe("ambiguous-orgs");
    expect(r.kind === "ambiguous-orgs" && r.orgs.map((o) => o.id)).toEqual(["C-2001", "C-2002"]);
  });

  it("treats one host sitting on two org rows as ambiguous, not decided", () => {
    const orgs: CrmOrg[] = [
      { id: "C-1", name: "Dup A", domain: "dup.com" },
      { id: "C-2", name: "Dup B", domain: "dup.com" },
    ];
    expect(resolveCompanyFromAttendance(["x@dup.com"], orgs).kind).toBe("ambiguous-orgs");
  });

  it("never equates a look-alike host with a real one (inc.17's finding, pinned)", () => {
    const r = resolveCompanyFromAttendance(["ops@cgroofing.net"], ORGS);
    expect(r).toEqual({ kind: "unknown-hosts", hosts: ["cgroofing.net"] });
  });

  it("reports no-external when only our side and free mailboxes were present", () => {
    expect(resolveCompanyFromAttendance(["rob@aivoicetech.io", "guest@gmail.com"], ORGS).kind).toBe(
      "no-external"
    );
  });

  it("reports no-external for an empty attendee list rather than inventing a company", () => {
    expect(resolveCompanyFromAttendance([], ORGS).kind).toBe("no-external");
  });

  it("cannot resolve against an org that carries no host", () => {
    expect(resolveCompanyFromAttendance(["a@nodomainco.com"], ORGS).kind).toBe("unknown-hosts");
  });
});

describe("attendanceNextStep", () => {
  it("names the org and its id on a resolve, and says nothing was written", () => {
    const step = attendanceNextStep(resolveCompanyFromAttendance(["dana@proplogix.com"], ORGS));
    expect(step).toContain("PropLogix, LLC. [C-2001]");
    expect(step).toContain("nothing is written");
  });

  it("sends an unknown host to the CRM Domain field, not to a retype in Notion", () => {
    const step = attendanceNextStep(resolveCompanyFromAttendance(["ops@cgroofing.net"], ORGS));
    expect(step).toContain("cgroofing.net");
    expect(step).toContain("Domain field");
  });

  it("asks a human to choose when two companies were in the room", () => {
    const step = attendanceNextStep(
      resolveCompanyFromAttendance(["dana@proplogix.com", "ops@cgroofinggroup.com"], ORGS)
    );
    expect(step).toContain("Company Meeting with");
    expect(step).toContain("coin flip");
  });
});

// Q84 inc.65 — the join. An archive row carries a Call Recording url, not an attendee list;
// these pin that the two meet on the Fireflies id and NOWHERE else, and that a row with no
// recording gets a null rather than a company.
describe("attendanceForRow", () => {
  const RECORDINGS: MeetingRecording[] = [
    { id: "01ABCDEF", title: "PropLogix intro", attendeeDomains: ["rob@aivoicetech.io", "dana@proplogix.com"] },
    { id: "https://app.fireflies.ai/view/01ZZZZZZ", title: "Caleb", attendeeDomains: ["ops@cgroofing.net"] },
  ];
  const index = indexRecordingsByKey(RECORDINGS);

  it("joins a share-shaped url on the row to a bare id in the manifest", () => {
    const hit = attendanceForRow({ recording: "https://app.fireflies.ai/view/01abcdef?tab=summary" }, index, ORGS);
    expect(hit?.resolution).toEqual({ kind: "resolved", org: ORGS[0], hosts: ["proplogix.com"] });
  });

  it("joins a bare id on the row to a url-shaped id in the manifest", () => {
    expect(attendanceForRow({ recording: "01zzzzzz" }, index, ORGS)?.resolution.kind).toBe("unknown-hosts");
  });

  it("returns null for a row with no recording — the in-person rows stay unanswered", () => {
    expect(attendanceForRow({}, index, ORGS)).toBeNull();
    expect(attendanceForRow({ recording: "" }, index, ORGS)).toBeNull();
  });

  it("returns null for a recording this machine does not hold, rather than guessing", () => {
    expect(attendanceForRow({ recording: "01NEVERDOWNLOADED" }, index, ORGS)).toBeNull();
  });

  it("keeps the first entry on a duplicated id instead of merging two rooms into one", () => {
    const dupe = indexRecordingsByKey([
      ...RECORDINGS,
      { id: "01ABCDEF", attendeeDomains: ["ops@cgroofinggroup.com"] },
    ]);
    const hit = attendanceForRow({ recording: "01abcdef" }, dupe, ORGS);
    expect(hit?.resolution).toEqual({ kind: "resolved", org: ORGS[0], hosts: ["proplogix.com"] });
  });
});
