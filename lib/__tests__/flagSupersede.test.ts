import { describe, it, expect } from "vitest";
import {
  planFlagWrite,
  planFlagReopen,
  supersededNote,
  supersededBy,
  reopenFailureMessage,
  resolvedFromNote,
  resolvedFrom,
  resolutionNoteBody,
  archiveResolvedFromMark,
} from "../flags/supersede";

describe("planFlagWrite — a recurring finding corrects its own row", () => {
  it("inserts when no dedupe key is given, so unkeyed callers are unchanged", () => {
    const plan = planFlagWrite(undefined, [{ id: 1, status: "open" }]);
    expect(plan.action).toBe("insert");
    expect(plan.supersede).toEqual([]);
  });

  it("treats a blank or whitespace key as no key", () => {
    expect(planFlagWrite("   ", [{ id: 1, status: "open" }]).action).toBe("insert");
    expect(planFlagWrite("", []).action).toBe("insert");
  });

  it("inserts on first sighting", () => {
    const plan = planFlagWrite("meeting-archive/unexplained", []);
    expect(plan.action).toBe("insert");
    expect(plan.reason).toMatch(/first sighting/);
  });

  it("updates the open row instead of stacking a second copy", () => {
    const plan = planFlagWrite("meeting-archive/unexplained", [{ id: 134, status: "open" }]);
    expect(plan).toMatchObject({ action: "update", id: 134, supersede: [] });
  });

  // The exact shape observed on prod: #132 "26 meetings", #134 "25 archived meetings"
  // and #136 all open at once. Newest survives and carries the current number; the
  // older twins are superseded, never deleted.
  it("keeps the NEWEST open row and supersedes the older twins", () => {
    const plan = planFlagWrite("meeting-archive/unexplained", [
      { id: 132, status: "open" },
      { id: 136, status: "open" },
      { id: 134, status: "open" },
    ]);
    expect(plan).toMatchObject({ action: "update", id: 136 });
    expect(plan.supersede).toEqual([134, 132]);
    expect(plan.reason).toMatch(/3 times/);
  });

  it("ignores resolved rows when choosing the survivor", () => {
    const plan = planFlagWrite("k", [
      { id: 10, status: "resolved" },
      { id: 4, status: "open" },
    ]);
    expect(plan).toMatchObject({ action: "update", id: 4, supersede: [] });
  });

  // Reopening would bury Rob's resolution note under a machine-written update.
  it("inserts a NEW row when the finding recurs after being resolved", () => {
    const plan = planFlagWrite("k", [
      { id: 7, status: "resolved" },
      { id: 9, status: "resolved" },
    ]);
    expect(plan.action).toBe("insert");
    expect(plan.supersede).toEqual([]);
    expect(plan.reason).toMatch(/recurred/);
  });

  it("never proposes deleting anything — supersede ids are always ids it also names", () => {
    const plan = planFlagWrite("k", [
      { id: 1, status: "open" },
      { id: 2, status: "open" },
    ]);
    if (plan.action !== "update") throw new Error("expected update");
    expect(plan.supersede).not.toContain(plan.id);
  });

  it("the supersede note names the survivor and stays reversible", () => {
    expect(supersededNote(136)).toMatch(/#136/);
    expect(supersededNote(136)).toMatch(/Reopen/);
  });
});

describe("planFlagReopen — Rob's reopen click never becomes a 500 on his own ledger", () => {
  it("allows an unkeyed reopen, which is every row that existed before 0033", () => {
    expect(planFlagReopen(null, [{ id: 5, status: "open" }]).ok).toBe(true);
    expect(planFlagReopen("  ", [{ id: 5, status: "open" }]).ok).toBe(true);
  });

  it("allows reopen when no sibling holds the finding open", () => {
    expect(planFlagReopen("k", []).ok).toBe(true);
    expect(planFlagReopen("k", [{ id: 5, status: "resolved" }]).ok).toBe(true);
  });

  it("REFUSES when a keyed twin is open — the unique index would 500 instead", () => {
    const plan = planFlagReopen("k", [{ id: 134, status: "open" }]);
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error("expected refusal");
    expect(plan.blockedBy).toBe(134);
    expect(plan.message).toMatch(/#134/);
  });

  it("names the NEWEST open twin, the one carrying current numbers", () => {
    const plan = planFlagReopen("k", [
      { id: 120, status: "open" },
      { id: 134, status: "open" },
      { id: 99, status: "resolved" },
    ]);
    if (plan.ok) throw new Error("expected refusal");
    expect(plan.blockedBy).toBe(134);
  });

  it("refuses instead of auto-resolving the twin — it never proposes closing another row", () => {
    const plan = planFlagReopen("k", [{ id: 134, status: "open" }]);
    if (plan.ok) throw new Error("expected refusal");
    expect(plan.message).toMatch(/resolve it first/i);
    expect(Object.keys(plan)).not.toContain("supersede");
  });
});

// Q84 inc.10 — the control that makes the note's own offer clickable.
describe("supersededBy — telling the machine's closure from Rob's", () => {
  it("reads the survivor id straight back off the note the pass wrote", () => {
    expect(supersededBy(supersededNote(136))).toBe(136);
  });

  it("returns null for a row Rob resolved himself — his judgement gets no undo button", () => {
    expect(supersededBy("Handled on the 7/29 call")).toBeNull();
    expect(supersededBy(null)).toBeNull();
    expect(supersededBy(undefined)).toBeNull();
    expect(supersededBy("")).toBeNull();
  });

  it("does NOT match a note that merely mentions a flag mid-sentence", () => {
    expect(supersededBy("Same thing as flag #134, closing this one")).toBeNull();
    expect(supersededBy("not superseded by flag #134")).toBeNull();
  });
});

describe("reopenFailureMessage — a refusal is an answer, not a dead end", () => {
  it("passes a 409 through verbatim so the blocking row is named", () => {
    const plan = planFlagReopen("k", [{ id: 134, status: "open" }]);
    if (plan.ok) throw new Error("expected refusal");
    const msg = reopenFailureMessage(409, plan.message);
    expect(msg.text).toBe(plan.message);
    expect(msg.text).toMatch(/#134/);
    // The ledger is unchanged and we know it — retrying is not the next move.
    expect(msg.certain).toBe(true);
  });

  it("falls back to a plain sentence when a 409 arrives with no message", () => {
    expect(reopenFailureMessage(409, null).text).toMatch(/nothing changed/i);
    expect(reopenFailureMessage(409, "   ").text).toMatch(/nothing changed/i);
  });

  it("says the row is gone on 404 rather than inviting a retry", () => {
    expect(reopenFailureMessage(404).text).toMatch(/no longer on the ledger/i);
  });

  it("asks for a reload when the request never came back — the state is unknown", () => {
    const msg = reopenFailureMessage(null);
    expect(msg.certain).toBe(false);
    expect(msg.text).toMatch(/reload/i);
  });
});

// Q84 inc.12 — the check is now on a 30-minute timer. Most ticks say exactly what the
// row already says, and re-asserting that would re-date Rob's ledger row every half hour.
describe("planFlagWrite — an unchanged re-run writes nothing", () => {
  const content = { title: "23 archived meetings", detail: "the long detail", severity: "medium" };
  const openRow = { id: 134, status: "open" as const, ...content };

  it("plans 'unchanged' when the open row already says exactly this", () => {
    const plan = planFlagWrite("k", [openRow], content);
    expect(plan.action).toBe("unchanged");
    expect(plan.action !== "insert" && plan.id).toBe(134);
    expect(plan.supersede).toEqual([]);
  });

  it("ignores whitespace-only differences — reformatting is not news", () => {
    const plan = planFlagWrite("k", [openRow], {
      ...content,
      title: "  23 archived meetings  ",
      detail: "the long detail\n",
    });
    expect(plan.action).toBe("unchanged");
  });

  it("updates when the count actually moved", () => {
    const plan = planFlagWrite("k", [openRow], { ...content, title: "22 archived meetings" });
    expect(plan.action).toBe("update");
    expect(plan.action === "update" && plan.id).toBe(134);
  });

  it("updates when only the severity changed", () => {
    const plan = planFlagWrite("k", [openRow], { ...content, severity: "high" });
    expect(plan.action).toBe("update");
  });

  it("never says 'unchanged' for a row whose content the caller did not read", () => {
    const plan = planFlagWrite("k", [{ id: 134, status: "open" }], content);
    expect(plan.action).toBe("update");
  });

  it("keeps the pre-inc.12 behaviour when no incoming content is supplied", () => {
    const plan = planFlagWrite("k", [openRow]);
    expect(plan.action).toBe("update");
  });

  it("still collapses stale twins even when the survivor's text is identical", () => {
    const plan = planFlagWrite("k", [openRow, { id: 130, status: "open", ...content }], content);
    expect(plan.action).toBe("update");
    expect(plan.supersede).toEqual([130]);
  });

  it("still inserts when the finding recurs after Rob resolved it", () => {
    const plan = planFlagWrite("k", [{ id: 134, status: "resolved", ...content }], content);
    expect(plan.action).toBe("insert");
  });
});

// Q84 inc.31 — the resolve write records WHERE a cross-record finding was settled.
describe("resolvedFromNote / archiveResolvedFromMark (inc.31)", () => {
  it("appends the clause when the row names another record", () => {
    expect(resolvedFromNote("same company, kept C-2018", "C-2017", ["C-2018"])).toBe(
      "same company, kept C-2018 Resolved from C-2017."
    );
  });

  it("records the clause alone when the reviewer typed nothing", () => {
    expect(resolvedFromNote("", "C-2017", ["C-2018"])).toBe("Resolved from C-2017.");
  });

  it("writes nothing extra on an ordinary row — it names no other record", () => {
    expect(resolvedFromNote("done", "C-2017", [])).toBe("done");
    expect(resolvedFromNote("", "C-2017", [])).toBe("");
  });

  it("writes nothing off a record page, and nothing for a page id that is not a minted id", () => {
    expect(resolvedFromNote("done", undefined, ["C-2018"])).toBe("done");
    expect(resolvedFromNote("done", "deal-gulf-coast", ["C-2018"])).toBe("done");
  });

  it("is idempotent — a note already carrying the clause gets no second one", () => {
    const once = resolvedFromNote("", "C-2017", ["C-2018"]);
    expect(resolvedFromNote(once, "C-2017", ["C-2018"])).toBe(once);
  });

  it("reads the clause back, and separates the reviewer's words from the ledger's", () => {
    const stored = resolvedFromNote("one company, two rows", "C-2017", ["C-2018"]);
    expect(resolvedFrom(stored)).toBe("C-2017");
    expect(resolutionNoteBody(stored)).toBe("one company, two rows");
    expect(resolutionNoteBody("plain note")).toBe("plain note");
    expect(resolvedFrom("plain note")).toBeNull();
  });

  it("cannot be confused with a superseded note — that grammar is anchored at the start", () => {
    const note = supersededNote(137);
    expect(resolvedFrom(note)).toBeNull();
    expect(resolutionNoteBody(note)).toBe(note);
    expect(supersededBy(resolvedFromNote("", "C-2017", ["C-2018"]))).toBeNull();
  });

  it("marks the OTHER pages and says nothing on the page it was settled from", () => {
    const stored = resolvedFromNote("", "C-2017", ["C-2018"]);
    expect(archiveResolvedFromMark(stored, "C-2018")).toContain("Resolved from C-2017");
    expect(archiveResolvedFromMark(stored, "C-2017")).toBeNull();
    expect(archiveResolvedFromMark("plain note", "C-2018")).toBeNull();
    expect(archiveResolvedFromMark(null, "C-2018")).toBeNull();
  });

  it("says nothing on the Overview — the sentence ends in 'this record' and there is none", () => {
    const stored = resolvedFromNote("", "C-2017", ["C-2018"]);
    expect(archiveResolvedFromMark(stored, undefined)).toBeNull();
    expect(archiveResolvedFromMark(stored, null)).toBeNull();
    expect(archiveResolvedFromMark(stored, "  ")).toBeNull();
  });
});

describe("archiveResolvedFromMark — why the row is on THIS page (inc.32)", () => {
  const stored = resolvedFromNote("", "C-2017", ["C-2018"]);

  const named = ["C-2017", "C-2018"];

  it("claims the finding names this record only when the caller proved it does", () => {
    expect(archiveResolvedFromMark(stored, "C-2018", true, named)).toBe(
      "Resolved from C-2017 — this finding names this record too, so it closed here with it."
    );
  });

  it("never claims a person's page is named — that page is reached through org membership", () => {
    // `/api/admin/flags?person=P-1001` fans out through `org_memberships`, so a finding
    // naming C-2017 renders on every member's page while naming no person at all.
    const mark = archiveResolvedFromMark(stored, "P-1001", false, named);
    expect(mark).toBe("Resolved from C-2017 — it is one finding, so closing it there closed it here.");
    expect(mark).not.toContain("names this record");
  });

  it("treats an unproven caller as unproven, not as proof — the weaker sentence is the true one", () => {
    expect(archiveResolvedFromMark(stored, "P-1001", undefined, named)).toBe(
      archiveResolvedFromMark(stored, "P-1001", false, named)
    );
    expect(archiveResolvedFromMark(stored, "P-1001", undefined, named)).not.toContain(
      "names this record"
    );
  });

  it("still says nothing at all where inc.31 said nothing — page settled from, Overview, no clause", () => {
    expect(archiveResolvedFromMark(stored, "C-2017", true, named)).toBeNull();
    expect(archiveResolvedFromMark(stored, "C-2017", false, named)).toBeNull();
    expect(archiveResolvedFromMark(stored, null, true, named)).toBeNull();
    expect(archiveResolvedFromMark("plain note", "C-2018", true, named)).toBeNull();
  });
});

describe("archiveResolvedFromMark — the id the click came FROM (inc.34)", () => {
  // Prod #137: names C-2017 + C-2018 and no person, yet the person fan-out puts the
  // Resolve button on P-1018/P-1019/P-1022. A click there stores "Resolved from P-1018."
  const fromPerson = resolvedFromNote("", "P-1018", ["C-2017", "C-2018"]);
  const fromCompany = resolvedFromNote("", "C-2017", ["C-2018"]);
  const named = ["C-2017", "C-2018"];

  it("prints the bare id only when the row itself names that record", () => {
    expect(archiveResolvedFromMark(fromCompany, "C-2018", true, named)).toBe(
      "Resolved from C-2017 — this finding names this record too, so it closed here with it."
    );
  });

  it("calls it a PAGE when the finding never names the record the click came from", () => {
    const mark = archiveResolvedFromMark(fromPerson, "C-2017", true, named);
    expect(mark).toBe(
      "Resolved from P-1018's page — this finding names this record too, so it closed here with it."
    );
    // The defect: a bare "Resolved from P-1018" next to "this finding names…" reads as a
    // third record of the finding's. It names two companies and no person.
    expect(mark).not.toContain("Resolved from P-1018 —");
  });

  it("qualifies the id when the caller cannot say — absence of proof is not proof", () => {
    expect(archiveResolvedFromMark(fromCompany, "C-2018", true)).toContain("C-2017's page");
    expect(archiveResolvedFromMark(fromCompany, "C-2018", true, null)).toContain("C-2017's page");
    expect(archiveResolvedFromMark(fromCompany, "C-2018", true, [])).toContain("C-2017's page");
  });

  it("leaves the persisted clause alone — no second grammar, no migration, old rows still read", () => {
    expect(fromPerson).toBe("Resolved from P-1018.");
    expect(resolvedFrom(fromPerson)).toBe("P-1018");
    expect(resolutionNoteBody(fromPerson)).toBe("");
  });

  it("changes nothing about WHERE the sentence appears", () => {
    expect(archiveResolvedFromMark(fromPerson, "P-1018", false, named)).toBeNull();
    expect(archiveResolvedFromMark(fromPerson, null, false, named)).toBeNull();
    expect(archiveResolvedFromMark("plain note", "C-2017", true, named)).toBeNull();
  });
});
