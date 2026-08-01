import { describe, expect, it } from "vitest";
import { buildCrmGapFinding, KEY_CRM_GAP } from "../crmGapFinding";
import type { ArchiveCheck, ArchiveRow } from "../archiveCheck";
import { planMeetingActivities } from "../activityPlan";

function row(id: string, day: string, title: string, company?: string): ArchiveRow {
  return { id, day, title, ...(company ? { company } : {}) } as ArchiveRow;
}

function check(over: Partial<ArchiveCheck["counts"]>, archiveOnly: ArchiveRow[] = []): ArchiveCheck {
  return {
    matched: [],
    archiveOnly,
    crmOnly: [],
    ambiguous: [],
    counts: {
      archiveRows: 0,
      crmMeetings: 0,
      matched: 0,
      archiveOnly: archiveOnly.length,
      crmOnly: 0,
      ambiguous: 0,
      ...over,
    },
  };
}

describe("buildCrmGapFinding", () => {
  it("files nothing when every archived meeting has a CRM activity", () => {
    expect(buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 40, matched: 40 }))).toBeNull();
  });

  it("carries the stable key so it corrects its own row instead of stacking a new one", () => {
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 0 }, [row("a", "2026-07-28", "Omega")]));
    expect(f?.dedupeKey).toBe(KEY_CRM_GAP);
    expect(f?.entityName).toBe("CRM meeting record");
  });

  it("counts the LIVE archive rather than a number a human typed once", () => {
    const grown = buildCrmGapFinding(check({ archiveRows: 47, crmMeetings: 0 }, [row("a", "2026-07-28", "Omega")]));
    expect(grown?.title).toContain("47 recorded meetings");
    expect(grown?.title).not.toContain("40");
  });

  it("an empty CRM is HIGH and says the pipeline is absent, not that matching failed", () => {
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 0 }, [row("a", "2026-07-28", "Omega")]))!;
    expect(f.severity).toBe("high");
    expect(f.title).toContain("the CRM has NO meeting activities");
    expect(f.detail).toContain("no path writes");
    expect(f.detail).toContain("not because the reconciliation disagreed");
  });

  it("with no plan it states the gap and never claims one pipeline closes them", () => {
    const rows = [row("a", "2026-07-28", "Omega"), row("b", "2026-07-22", "Gulf Coast")];
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 0 }, rows))!;
    expect(f.detail).not.toContain("• 2026-07-28");
    expect(f.detail).not.toContain("closes all");
    expect(f.detail).not.toContain("could be filed unattended");
  });

  it("with a plan it says what the pipeline would NOT close, per bucket", () => {
    const rows = [
      row("a", "2026-07-28", "Omega sit-down", "Omega Title"),
      row("b", "2026-07-22", "Gulf Coast kickoff", "Gulf Coast RE"),
      row("c", "2026-07-20", "weekly"),
    ];
    const plan = planMeetingActivities(rows, [{ id: "C-1", name: "Gulf Coast RE" }]);
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 0 }, rows), plan)!;
    expect(f.detail).toContain("necessary and NOT sufficient");
    expect(f.detail).toContain("1 could be filed unattended today");
    expect(f.detail).toContain("1 name a company the CRM does not match");
    expect(f.detail).toContain("1 never said who the meeting was with at all");
    // The one row a human has to move is named; the wall is counted, not printed.
    expect(f.detail).toContain("UNKNOWN-COMPANY");
    expect(f.detail).toContain("• 2026-07-28 — Omega sit-down");
    expect(f.detail).toContain("no CRM org is named “Omega Title”");
    expect(f.detail).not.toContain("• 2026-07-20 — weekly");
  });

  it("prints no dangling list when every orphan is in the no-company wall", () => {
    const rows = [row("a", "2026-07-28", "Omega"), row("b", "2026-07-22", "Gulf Coast")];
    const plan = planMeetingActivities(rows, [{ id: "C-1", name: "Gulf Coast RE" }]);
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 0 }, rows), plan)!;
    expect(f.detail).toContain("2 never said who the meeting was with at all");
    expect(f.detail).not.toContain("•");
  });

  it("a partial gap keeps its own uncapped row list even when a plan is passed", () => {
    const rows = [row("b", "2026-07-22", "Gulf Coast kickoff"), row("a", "2026-07-28", "Omega sit-down")];
    const plan = planMeetingActivities(rows, []);
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 38, matched: 38 }, rows), plan)!;
    const list = f.detail.slice(f.detail.indexOf("•"));
    expect(list).toBe("• 2026-07-28 — Omega sit-down\n• 2026-07-22 — Gulf Coast kickoff");
    expect(f.detail).toContain("necessary and NOT sufficient");
  });

  it("a partial gap is MEDIUM and the rows ARE the ask — listed, newest first", () => {
    const rows = [row("b", "2026-07-22", "Gulf Coast kickoff"), row("a", "2026-07-28", "Omega sit-down")];
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 38, matched: 38 }, rows))!;
    expect(f.severity).toBe("medium");
    expect(f.title).toBe("2 archived meetings never reached the CRM");
    const list = f.detail.slice(f.detail.indexOf("•"));
    expect(list).toBe("• 2026-07-28 — Omega sit-down\n• 2026-07-22 — Gulf Coast kickoff");
  });

  it("strips the calendar sync's machine timestamp off a listed title", () => {
    const rows = [row("a", "2026-07-17", "📊 Weekly Review 2026-07-17T16:00:00.000-04:00")];
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 38 }, rows))!;
    expect(f.detail).toContain("• 2026-07-17 — 📊 Weekly Review");
    expect(f.detail).not.toContain("T16:00:00");
  });

  it("reports crmOnly and ambiguous when they exist, and stays silent when they do not", () => {
    const rows = [row("a", "2026-07-28", "Omega")];
    const both = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 5, crmOnly: 4, ambiguous: 2 }, rows))!;
    expect(both.detail).toContain("4 CRM meeting(s) have no archive row");
    expect(both.detail).toContain("2 row(s) could honestly be more than one");
    const neither = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 5 }, rows))!;
    expect(neither.detail).not.toContain("no archive row");
    expect(neither.detail).not.toContain("could honestly be");
  });

  it("never shares a key with the needs-human-account finding", async () => {
    const { KEY_NEEDS_HUMAN_ACCOUNT } = await import("../archiveFinding");
    expect(KEY_CRM_GAP).not.toBe(KEY_NEEDS_HUMAN_ACCOUNT);
  });
});

// Q84 inc.18 — the sentence that sent a reader to create a duplicate org.
describe("near-miss wording in the gap finding", () => {
  it("says confirm-don't-create when the plan found a close record", () => {
    const check = {
      matched: [],
      archiveOnly: [{ id: "n1", title: "Meeting", day: "2026-07-28", company: "Omega Title" }],
      crmOnly: [],
      ambiguous: [],
      counts: { archiveRows: 1, crmMeetings: 3, matched: 0, archiveOnly: 1, crmOnly: 0, ambiguous: 0 },
    } as unknown as Parameters<typeof buildCrmGapFinding>[0];
    const plan = planMeetingActivities(check.archiveOnly, [{ id: "C-2019", name: "Omega Title (FL)" }]);
    const f = buildCrmGapFinding(check, plan);
    expect(f?.detail).toContain("1 of those DO have a close record in the CRM already");
    expect(f?.detail).not.toContain("name a company the CRM does not have");
  });
});

// Q84 inc.66 — the attendance evidence on the ledger row. inc.64 filed this by HAND with no
// dedupeKey; these pin that it now rides the deduped row AND that it is stated in the unit Rob
// acts in (fields to fill), not the unit the data arrived in (rows to read).
describe("attendance evidence on the gap finding", () => {
  const gap = (attendance: Parameters<typeof buildCrmGapFinding>[2]) =>
    buildCrmGapFinding(
      check({ archiveRows: 3, crmMeetings: 0 }, [row("a", "2026-06-18", "Caleb sync")]),
      undefined,
      attendance,
    )!;

  it("groups unknown hosts by HOST, not by row — two meetings on one host is ONE field to fill", () => {
    const f = gap([
      { row: row("a", "2026-06-18", "Caleb sync"), resolution: { kind: "unknown-hosts", hosts: ["cgroofing.net"] } },
      { row: row("b", "2026-06-16", "Caleb again"), resolution: { kind: "unknown-hosts", hosts: ["cgroofing.net"] } },
    ]);
    expect(f.detail).toContain("1 FIELD(S) TO FILL IN THE CRM");
    expect(f.detail).toContain("2 row(s) answer themselves unattended");
    expect(f.detail).toContain("cgroofing.net");
    // both meetings hang UNDER the single host line rather than each asking for its own fix
    expect(f.detail.match(/• cgroofing\.net/g)).toHaveLength(1);
  });

  // Q84 inc.67 — the host line names the org Rob should confirm, when the CRM holds one close.
  it("proposes the likely owner of an unknown host, and stays byte-identical when it cannot", () => {
    const attendance: Parameters<typeof buildCrmGapFinding>[2] = [
      { row: row("a", "2026-06-18", "Caleb sync"), resolution: { kind: "unknown-hosts", hosts: ["cgroofing.net"] } },
    ];
    const base = check({ archiveRows: 3, crmMeetings: 0 }, [row("a", "2026-06-18", "Caleb sync")]);
    const withOrgs = buildCrmGapFinding(base, undefined, attendance, [
      { id: "C-0001", name: "CG Roofing Group", domain: "cgroofinggroup.com" },
    ])!;
    expect(withOrgs.detail).toContain("likely CG Roofing Group [C-0001]");
    expect(withOrgs.detail).toContain("without the word “group”");

    // An org list with nothing close must not add a sentence — the fallback ask is unchanged.
    const noneClose = buildCrmGapFinding(base, undefined, attendance, [{ id: "C-9", name: "PropLogix", domain: "proplogix.com" }])!;
    expect(noneClose.detail).toBe(buildCrmGapFinding(base, undefined, attendance)!.detail);
  });

  it("says no-external out loud instead of burying rows that can never name a company", () => {
    const f = gap([
      { row: row("a", "2026-06-18", "Caleb sync"), resolution: { kind: "unknown-hosts", hosts: ["cgroofing.net"] } },
      { row: row("c", "2026-06-05", "Internal"), resolution: { kind: "no-external" } },
      { row: row("d", "2026-06-04", "Internal 2"), resolution: { kind: "no-external" } },
    ]);
    expect(f.detail).toContain("2 carried only our own domains or free mailboxes and can never name");
  });

  it("reports two companies in the room and never picks one", () => {
    const f = gap([
      {
        row: row("e", "2026-07-01", "Joint call"),
        resolution: {
          kind: "ambiguous-orgs",
          orgs: [{ id: "C-1", name: "Alpha" }, { id: "C-2", name: "Beta" }],
          hosts: ["alpha.com", "beta.com"],
        },
      },
    ]);
    expect(f.detail).toContain("TWO COMPANIES IN THE ROOM — never auto-picked");
    expect(f.detail).toContain("Alpha, Beta");
    expect(f.detail).not.toContain("FIELD(S) TO FILL");
  });

  it("adds nothing at all when no planned row has a recording here", () => {
    const withOut = buildCrmGapFinding(check({ archiveRows: 3, crmMeetings: 0 }, [row("a", "2026-06-18", "Caleb sync")]))!;
    expect(withOut.detail).not.toContain("have a recording on this machine");
    expect(gap([]).detail).toBe(withOut.detail);
  });

  it("keeps the one deduped key — it corrects its own row instead of opening a second", () => {
    expect(gap([{ row: row("a", "2026-06-18", "x"), resolution: { kind: "no-external" } }]).dedupeKey).toBe(KEY_CRM_GAP);
  });
});

// Q84 inc.72 — the finding now carries the machine-readable half beside the prose half.
// The live shape: the stored host is on `website`, `domain` is null, so the slot is free.
describe("buildCrmGapFinding — the confirm payload", () => {
  const CG = { id: "C-2017", name: "CG Roofing Group", website: "cgroofinggroup.com" };
  const GULF = { id: "C-2018", name: "Gulf Coast RE Group", website: "gulfcoastregroup.com" };
  const base = check({ archiveRows: 3, crmMeetings: 0 }, [row("a", "2026-06-18", "Caleb sync")]);
  const heard = (hosts: string[]): Parameters<typeof buildCrmGapFinding>[2] =>
    hosts.map((h, i) => ({ row: row(`r${i}`, "2026-06-18", "Caleb sync"), resolution: { kind: "unknown-hosts", hosts: [h] } }));

  it("mints one action per confirmable host — both of Rob's live cases on one row", () => {
    const f = buildCrmGapFinding(base, undefined, heard(["cgroofing.net", "gulfregroup.com"]), [CG, GULF])!;
    expect(f.payload).toEqual({
      kind: "host-confirm",
      actions: [
        { kind: "host-confirm", host: "cgroofing.net", orgId: "C-2017" },
        { kind: "host-confirm", host: "gulfregroup.com", orgId: "C-2018" },
      ],
    });
  });

  it("mints exactly what the prose offers — no payload where the line withholds the instruction", () => {
    // domain already full (inc.68 `occupied`) → prose drops the write verb, so no button either
    const full = buildCrmGapFinding(base, undefined, heard(["cgroofing.net"]), [{ ...CG, domain: "cgroofinggroup.com" }])!;
    expect(full.detail).toContain("not a field to fill");
    expect(full.payload).toBeUndefined();
    const writable = buildCrmGapFinding(base, undefined, heard(["cgroofing.net"]), [CG])!;
    expect(writable.detail).toContain("Confirm it and put the host on that org");
    expect(writable.payload?.actions).toHaveLength(1);
  });

  it("mints nothing when the prose proposes no org at all", () => {
    // a tie says "say which one"; nothing close says nothing — neither has a click
    expect(buildCrmGapFinding(base, undefined, heard(["cgroofing.net"]), [CG, { ...CG, id: "C-2019" }])!.payload).toBeUndefined();
    expect(buildCrmGapFinding(base, undefined, heard(["cgroofing.net"]), [{ id: "C-9", name: "PropLogix", website: "proplogix.com" }])!.payload).toBeUndefined();
    expect(buildCrmGapFinding(base, undefined, heard(["cgroofing.net"]))!.payload).toBeUndefined();
  });

  // Q84 inc.77 — the read-time heading swap, pinned to the string the BUILDER emits rather than a
  // hand-typed approximation of it. hostConfirmProse.test.ts owns the swap's rules; this owns the
  // one fact that test cannot know: that the heading it targets is the heading prod actually
  // writes, mid-sentence suffix and all. If `attendanceBlock` re-words that line, this fails here
  // instead of the swap silently never firing on the ledger.
  it("emits a heading the read-time swap can find, and grades it in place", async () => {
    const { retargetConfirmProse } = await import("@/lib/flags/hostConfirmProse");
    const { hostConfirmControls } = await import("@/lib/flags/hostConfirmView");

    const f = buildCrmGapFinding(base, undefined, heard(["cgroofing.net", "gulfregroup.com"]), [CG, GULF])!;
    const heading = f.detail.split("\n").find((l) => l.includes("FIELD(S) TO FILL IN THE CRM"))!;
    // The real line carries a second clause after the heading — the swap must land BEFORE it.
    expect(heading).toBe("2 FIELD(S) TO FILL IN THE CRM, and then 2 row(s) answer themselves unattended, permanently:");

    const out = retargetConfirmProse(f.detail, hostConfirmControls(f.payload, CG.id));
    expect(out.split("\n").find((l) => l.includes("FIELD(S) TO FILL IN THE CRM"))).toBe(
      "2 FIELD(S) TO FILL IN THE CRM (1 one click away right here · 1 one click away on the company's own page), " +
        "and then 2 row(s) answer themselves unattended, permanently:",
    );
  });

  it("is absent, not empty, on a finding with no attendance evidence at all", () => {
    expect("payload" in buildCrmGapFinding(base)!).toBe(false);
  });
});
