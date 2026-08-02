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
  reopenNote,
  flagReopenRefusal,
  archiveReopenRuleNote,
  archiveResolvedFromMark,
  qualifiedRecordRef,
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

  // Q84 inc.43 — the OTHER fan-out. `?person=` widens through `org_memberships`, so a row
  // FILED on C-2001 (entity_id set ⇒ no named scope ⇒ `others` empty) is resolvable from a
  // member's page, and until now that click recorded nothing at all.
  it("records provenance for a row filed on another record, resolved from a member's page", () => {
    expect(resolvedFromNote("", "P-1018", [], "C-2001")).toBe("Resolved from P-1018.");
    expect(resolvedFromNote("dup", "P-1018", [], "C-2001")).toBe("dup Resolved from P-1018.");
  });

  it("stays silent on the row's own page — 'resolved from here' is not news", () => {
    expect(resolvedFromNote("done", "C-2001", [], "C-2001")).toBe("done");
  });

  it("a legacy slug home is not proof of a second page, so it earns no clause", () => {
    expect(resolvedFromNote("done", "P-1018", [], "cg-roofing-group")).toBe("done");
    expect(resolvedFromNote("done", "P-1018", [], null)).toBe("done");
  });

  it("the home record never rescues a click that is not off a record page", () => {
    expect(resolvedFromNote("done", undefined, [], "C-2001")).toBe("done");
    expect(resolvedFromNote("done", "deal-gulf-coast", [], "C-2001")).toBe("done");
  });

  it("reads back on the row's own page as a closure made somewhere else", () => {
    const stored = resolvedFromNote("", "P-1018", [], "C-2001");
    // `named` is undefined: a filed row has no named scope, so the id is qualified as a
    // page — it is not one of the finding's records, and the sentence must not imply it.
    expect(archiveResolvedFromMark(stored, "C-2001")).toBe(
      "Resolved from P-1018's page — it is one finding, so closing it there closed it here."
    );
    expect(archiveResolvedFromMark(stored, "P-1018")).toBeNull();
  });

  it("is idempotent — a note already stamped with THIS record gets no second clause", () => {
    const once = resolvedFromNote("", "C-2017", ["C-2018"]);
    expect(resolvedFromNote(once, "C-2017", ["C-2018"])).toBe(once);
    const typed = resolvedFromNote("kept C-2018", "C-2017", ["C-2018"]);
    expect(resolvedFromNote(typed, "C-2017", ["C-2018"])).toBe(typed);
  });

  // Q84 inc.91 — a reviewer's own sentence must not be adopted as the ledger's provenance.
  // Reachable only by typing: `reopen` nulls `resolution_note` and the resolve path is handed
  // fresh text, so a stored stamp never returns here. The clause naming another record is
  // therefore a HUMAN sentence, and the machine still records where the click happened.
  it("does not read a reviewer's typed clause as this click's provenance", () => {
    const typed = "Caleb confirmed. Resolved from C-2017.";
    const stored = resolvedFromNote(typed, "C-2001", [], "C-2010");
    expect(stored).toBe("Caleb confirmed. Resolved from C-2017. Resolved from C-2001.");
    // the page actually clicked is what reads back...
    expect(resolvedFrom(stored)).toBe("C-2001");
    // ...and the reviewer's sentence stays inside the reviewer's quote.
    expect(resolutionNoteBody(stored)).toBe("Caleb confirmed. Resolved from C-2017.");
  });

  // The refusal above must not become a licence to double-stamp: same record, one clause.
  it("still writes exactly one clause when the typed clause names this very record", () => {
    const stored = resolvedFromNote("Resolved from C-2001.", "C-2001", [], "C-2010");
    expect(stored).toBe("Resolved from C-2001.");
    expect(resolutionNoteBody(stored)).toBe("");
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

  it("still says nothing at all where inc.31 said nothing — page settled from, Overview", () => {
    expect(archiveResolvedFromMark(stored, "C-2017", true, named)).toBeNull();
    expect(archiveResolvedFromMark(stored, "C-2017", false, named)).toBeNull();
    expect(archiveResolvedFromMark(stored, null, true, named)).toBeNull();
    // inc.36 amends the fourth case this test used to pin: a clause-less row that names
    // ANOTHER record now says the ledger does not know where it was closed, instead of
    // reading as one closed on the page being read. Silence stays for every other shape.
    expect(archiveResolvedFromMark("plain note", "C-2018", true, named)).not.toBeNull();
  });
});

describe("archiveResolvedFromMark — a row with NO provenance clause (inc.36)", () => {
  // Prod #99, measured 2026-07-31: resolved, `entity_id NULL`, names P-1001 + C-2001,
  // closed 2026-07-29 — two days before inc.31 taught the click to record where it
  // happened. It renders on both records' pages carrying no clause at all.
  const legacy = "Fixed 2026-07-29 (Q70 inc.8, deployed). supabaseStore.fromPerson now persists legacy_slug.";
  const named = ["P-1001", "C-2001"];

  it("says the ledger does not know, and never guesses a page", () => {
    const mark = archiveResolvedFromMark(legacy, "C-2001", false, named);
    expect(mark).toBe(
      "It is one finding, closed once on every record it names — the ledger has no record of where it was closed."
    );
    expect(mark).not.toMatch(/[CP]-\d+/);
    expect(mark).not.toContain("Resolved from");
  });

  it("reads the same on either record — neither page is told it was the one worked on", () => {
    expect(archiveResolvedFromMark(legacy, "P-1001", false, named)).toBe(
      archiveResolvedFromMark(legacy, "C-2001", false, named)
    );
    // `namesThisPage` decides nothing here: there is no click location to qualify.
    expect(archiveResolvedFromMark(legacy, "P-1001", true, named)).toBe(
      archiveResolvedFromMark(legacy, "P-1001", false, named)
    );
  });

  it("stays silent on a row that spans nothing — 'closed here' is not news", () => {
    expect(archiveResolvedFromMark(legacy, "C-2001", true, ["C-2001"])).toBeNull();
    expect(archiveResolvedFromMark(legacy, "C-2001", true, [])).toBeNull();
  });

  it("is unproven-by-default — no `named`, no sentence", () => {
    expect(archiveResolvedFromMark(legacy, "C-2001")).toBeNull();
    expect(archiveResolvedFromMark(legacy, "C-2001", true, null)).toBeNull();
    expect(archiveResolvedFromMark(legacy, null, true, named)).toBeNull();
    // A row closed with NO note at all is the commonest shape of this defect, not an
    // unproven one: nothing was recorded, and the row still names two records.
    expect(archiveResolvedFromMark(null, "C-2001", true, named)).toBe(
      archiveResolvedFromMark(legacy, "C-2001", true, named)
    );
  });

  it("leaves a superseded row to the story it already tells", () => {
    const superseded = "Superseded by flag #142 — reopen if this row still matters on its own.";
    expect(supersededBy(superseded)).toBe(142);
    expect(archiveResolvedFromMark(superseded, "C-2001", true, named)).toBeNull();
  });

  it("does not fire once the clause exists — inc.31's rows are untouched", () => {
    const withClause = resolvedFromNote("", "P-1001", ["C-2001"]);
    expect(archiveResolvedFromMark(withClause, "P-1001", true, named)).toBeNull();
    expect(archiveResolvedFromMark(withClause, "C-2001", false, named)).toContain("Resolved from P-1001");
  });

  // Q84 inc.42 — the plural was written for #99's two records.
  it("says the singular, and WHICH record, when the row names exactly one", () => {
    const mark = archiveResolvedFromMark(legacy, "P-1018", false, ["C-2001"]);
    expect(mark).toBe(
      "It is one finding, and C-2001 is the only record it names — the ledger has no record of where it was closed."
    );
    // The reader is on a page the finding never names; the sentence must not imply a set.
    expect(mark).not.toContain("every record");
  });

  it("counts what the row NAMES, not what is left over — two records keep inc.36's plural", () => {
    // On C-2001's own page a two-record row also leaves exactly one other id, and there
    // "every record it names" is true. `others.length` would have flipped this one too.
    expect(archiveResolvedFromMark(legacy, "C-2001", true, named)).toBe(
      "It is one finding, closed once on every record it names — the ledger has no record of where it was closed."
    );
    expect(archiveResolvedFromMark(legacy, "P-1018", false, named)).toBe(
      archiveResolvedFromMark(legacy, "C-2001", true, named)
    );
  });

  it("still says nothing when the one record it names IS this page", () => {
    expect(archiveResolvedFromMark(legacy, "C-2001", true, ["C-2001"])).toBeNull();
    expect(archiveResolvedFromMark(legacy, "C-2001", false, ["C-2001"])).toBeNull();
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
    // inc.36: a clause-less row spanning other records is no longer silent — but it still
    // prints no id, so nothing here claims a click location it cannot prove.
    expect(archiveResolvedFromMark("plain note", "C-2017", true, named)).not.toMatch(/[CP]-\d+/);
  });
});

describe("archiveResolvedFromMark — a FILED row names ids too (inc.84)", () => {
  // Prod #145: filed on C-2010, and its own sentence prints C-2010, C-2017, C-2018.
  // `flagNamedScope` returns null for it — correctly, for the SPANS question — so before
  // inc.84 the head could only ever qualify `from` as a page, whatever the row printed.
  const printed = ["C-2010", "C-2017", "C-2018"];
  const stored = resolvedFromNote("", "C-2017", [], "C-2010");

  it("writes the clause at all — a filed row resolved somewhere other than its home", () => {
    expect(resolvedFrom(stored)).toBe("C-2017");
  });

  it("prints the id BARE when the row names it, even with no spans list", () => {
    const mark = archiveResolvedFromMark(stored, "C-2010", false, undefined, printed);
    expect(mark).toContain("Resolved from C-2017 —");
    expect(mark).not.toContain("C-2017's page");
  });

  it("was the defect: fed only the spans list, the same row qualified it as a page", () => {
    // The pre-inc.84 call, verbatim. Kept as the record of what changed and why.
    expect(archiveResolvedFromMark(stored, "C-2010", false, undefined)).toContain(
      "Resolved from C-2017's page",
    );
  });

  it("still says PAGE when the row does not name where the click happened", () => {
    const elsewhere = resolvedFromNote("", "P-1010", [], "C-2010");
    expect(archiveResolvedFromMark(elsewhere, "C-2010", false, undefined, printed)).toContain(
      "Resolved from P-1010's page",
    );
  });

  it("REFUSES the spans sentence for a filed row — it is not on every record it names", () => {
    // The load-bearing half. `selectRecordFlags` puts a filed row on the pages its FILING
    // reaches; C-2017's page never shows #145. Handing `printed` to that branch would not
    // be a stale sentence, it would be a new lie, so the branch keeps reading `named`.
    expect(archiveResolvedFromMark("plain note", "C-2010", false, undefined, printed)).toBeNull();
  });

  it("is unproven-by-default — omitted, every existing caller reads exactly as before", () => {
    const spans = ["C-2017", "C-2018"];
    const two = resolvedFromNote("", "C-2017", ["C-2018"]);
    expect(archiveResolvedFromMark(two, "C-2018", true, spans)).toBe(
      archiveResolvedFromMark(two, "C-2018", true, spans, null),
    );
    expect(archiveResolvedFromMark(two, "C-2018", true, spans, undefined)).toContain(
      "Resolved from C-2017 —",
    );
  });
});

describe("archiveResolvedFromMark — the tail clause, for a FILED row (inc.86)", () => {
  // Same prod #145 shape: filed on C-2010, prints C-2010 + C-2017 + C-2018, resolved from
  // C-2017. The org-membership fan-out is what makes this reachable — the row lands on a
  // member's page, and there the question "does this row name this page" is a real one.
  const printed = ["C-2010", "P-1018", "C-2018"];
  const stored = resolvedFromNote("", "C-2017", [], "C-2010");

  it("says the row names this record when it PRINTS it and filing did not put it here", () => {
    // P-1018 is reached through `org_memberships` on the filing C-2010, not by filing.
    expect(archiveResolvedFromMark(stored, "P-1018", false, undefined, printed, "C-2010")).toBe(
      "Resolved from C-2017's page — this finding names this record too, so it closed here with it.",
    );
  });

  it("was the defect: the same row, same evidence, got the weaker sentence by arm", () => {
    // The pre-inc.86 call, verbatim — `namesThisPage` came from `flagNamedScope(...).here`,
    // which is null for every filed row before it looks at what the row prints.
    expect(archiveResolvedFromMark(stored, "P-1018", false, undefined, printed)).toBe(
      "Resolved from C-2017's page — it is one finding, so closing it there closed it here.",
    );
  });

  it("REFUSES it on the filing's OWN page — filing put the row there, not naming", () => {
    // C-2010 is printed AND is the filing. The header already answers "why is this here";
    // crediting the naming would be inc.32's misattribution wearing the other coat.
    const mark = archiveResolvedFromMark(stored, "C-2010", false, undefined, printed, "C-2010");
    expect(mark).toBe(
      "Resolved from C-2017's page — it is one finding, so closing it there closed it here.",
    );
    expect(mark).not.toContain("names this record");
  });

  it("never claims a page the row does not print, filed or not", () => {
    expect(
      archiveResolvedFromMark(stored, "P-1099", false, undefined, printed, "C-2010"),
    ).not.toContain("names this record");
  });

  it("only ever widens — a caller that PROVED the page is named keeps that answer", () => {
    expect(
      archiveResolvedFromMark(stored, "C-2010", true, undefined, printed, "C-2010"),
    ).toContain("names this record too");
  });

  it("is unproven-by-default — omitted or empty, every existing caller is unchanged", () => {
    for (const filing of [undefined, null, "", "   "] as const) {
      expect(archiveResolvedFromMark(stored, "P-1018", false, undefined, printed, filing)).toBe(
        archiveResolvedFromMark(stored, "P-1018", false, undefined, printed),
      );
    }
  });
});

describe("Q84 inc.90 — one wording rule, three renderers, and the predicate they must NOT share", () => {
  it("renders the id bare when the row names it, and 's page when it does not", () => {
    expect(qualifiedRecordRef("C-2017", true)).toBe("C-2017");
    expect(qualifiedRecordRef("C-2017", false)).toBe("C-2017's page");
  });

  it("is the SAME string the archive mark's head renders — the copy that drifted first", () => {
    const stored = "Resolved from C-2017.";
    const printed = ["C-2010", "C-2017", "C-2018"];
    expect(archiveResolvedFromMark(stored, "C-2018", false, undefined, printed, "C-2010")).toContain(
      `Resolved from ${qualifiedRecordRef("C-2017", true)} —`,
    );
    expect(archiveResolvedFromMark(stored, "C-2018", false, undefined, [], "C-2010")).toContain(
      `Resolved from ${qualifiedRecordRef("C-2017", false)} —`,
    );
  });

  it("takes a proven ANSWER, never the evidence — inc.84/inc.86/inc.87 keep three questions", () => {
    // The load-bearing refusal. If this function ever grows a `printed`/`named`/`filedOn`
    // argument it becomes one predicate for three questions again, which is the widening
    // inc.86 refused: a filed row is NOT readable on every record it names, so the spans
    // branch must keep answering from `scope.here` while the head answers from `named_ref`.
    expect(qualifiedRecordRef).toHaveLength(2);
  });
});

describe("Q84 inc.92 — reopen drops the machine's sentence and keeps Rob's", () => {
  it("returns null for the machine's own closure note — the one reopen the UI offers", () => {
    // inc.10 draws the Reopen control ONLY where `supersededBy` is non-null, so this is the
    // live path: it must stay byte-identical to the `resolution_note: null` it wrote before.
    expect(reopenNote(supersededNote(137))).toBeNull();
  });

  it("is why 'keep resolutionNoteBody' was the WRONG fix — that keeps the superseded grammar", () => {
    // The proof the naive handover fix breaks the live click: `resolutionNoteBody` strips only
    // the `Resolved from` clause, so it would carry `Superseded by flag #137 …` onto an OPEN
    // row — and `supersededBy` is the same predicate that renders the marker and the button.
    const machine = supersededNote(137);
    expect(resolutionNoteBody(machine)).toBe(machine);
    expect(supersededBy(resolutionNoteBody(machine))).toBe(137);
    expect(reopenNote(machine)).toBeNull();
  });

  it("keeps a sentence a human typed — reopen must not delete Rob's words", () => {
    expect(reopenNote("Caleb confirmed the split is 35/65.")).toBe("Caleb confirmed the split is 35/65.");
  });

  it("keeps the human half and drops the machine's provenance clause", () => {
    expect(reopenNote("Caleb confirmed. Resolved from C-2017.")).toBe("Caleb confirmed.");
  });

  it("returns null when the clause was the whole note — nothing human to keep", () => {
    expect(reopenNote("Resolved from C-2017.")).toBeNull();
  });

  it("returns null for an empty, blank or absent note", () => {
    expect(reopenNote(null)).toBeNull();
    expect(reopenNote(undefined)).toBeNull();
    expect(reopenNote("")).toBeNull();
    expect(reopenNote("   ")).toBeNull();
  });

  it("is the same stripper the archive quotes with — one rule, not a second copy", () => {
    const stored = "Caleb confirmed. Resolved from C-2017.";
    expect(reopenNote(stored)).toBe(resolutionNoteBody(stored));
  });
});

describe("Q84 inc.93 — the endpoint refuses to undo a close ROB made", () => {
  it("lets the one reopen the UI offers through — the row a pass closed", () => {
    // inc.10's live path. This must stay open or the button becomes a 409 on the only row
    // that draws it.
    expect(flagReopenRefusal("resolved", supersededNote(137))).toBeNull();
  });

  it("refuses a row Rob resolved with his own words", () => {
    const refusal = flagReopenRefusal("resolved", "Rob 7/23: 100% comped, nothing owed.");
    expect(refusal).toContain("you resolved this finding yourself");
  });

  it("refuses a row Rob resolved with NO note — silence is still his judgement", () => {
    // 39 of 40 resolved prod rows are his; the Resolve control's note is optional, so an
    // empty note must not read as "the machine closed it".
    expect(flagReopenRefusal("resolved", null)).not.toBeNull();
    expect(flagReopenRefusal("resolved", "")).not.toBeNull();
  });

  it("refuses a row carrying only the provenance clause — that clause is not a machine CLOSE", () => {
    // `Resolved from C-…` records where the reviewer was standing (inc.31), not who decided.
    expect(flagReopenRefusal("resolved", "Resolved from C-2017.")).not.toBeNull();
  });

  it("does NOT refuse an already-open row — a retried click is a no-op, not an error", () => {
    // inc.48's rule, carried across: 409-ing a no-op teaches a caller to fear a button that
    // did nothing wrong.
    expect(flagReopenRefusal("open", null)).toBeNull();
    expect(flagReopenRefusal("open", "Rob: handled.")).toBeNull();
    expect(flagReopenRefusal(null, null)).toBeNull();
    expect(flagReopenRefusal(undefined, "anything")).toBeNull();
  });

  it("names re-filing as the way back, so the refusal is an answer and not a wall", () => {
    const refusal = flagReopenRefusal("resolved", "Rob: same person, merged by hand.") ?? "";
    expect(refusal).toContain("file it again");
  });

  it("agrees with the control inc.10 draws — one ladder (`supersededBy`), two questions", () => {
    // Where the UI draws the button, the server must accept; everywhere else it refuses. The
    // only permitted disagreement is the already-open row, covered above.
    for (const note of [supersededNote(1), "Rob: done.", "Resolved from C-2017.", null, ""]) {
      const uiDraws = supersededBy(note) !== null;
      expect(flagReopenRefusal("resolved", note) === null).toBe(uiDraws);
    }
  });
});

describe("Q84 inc.94 — the archive says the rule, because the refusal is unreachable from the UI", () => {
  // Live shape: 40 resolved rows, exactly 1 machine-superseded, 39 closed by Rob.
  const prodish = [
    { status: "resolved", resolution_note: supersededNote(137) },
    ...Array.from({ length: 39 }, () => ({ status: "resolved", resolution_note: "Rob: handled." })),
  ];

  it("explains the asymmetry when both kinds are in the archive", () => {
    const note = archiveReopenRuleNote(prodish) ?? "";
    expect(note).toContain("Reopen shows only on the 1 row a pass closed");
    expect(note).toContain("The other 39 were closed by a person");
    expect(note).toContain("file it again");
  });

  // Q84 inc.95 — the sentence may not name an author the ledger never recorded.
  it("never tells the reader HE closed them — the evidence is 'no pass claimed it', not 'Rob'", () => {
    // Resolve provenance records the PAGE, not the human (inc.35/inc.36), and this component
    // renders on rep account pages too. "You closed yourself" attributes a rep's click to Rob.
    const note = archiveReopenRuleNote(prodish) ?? "";
    expect(note).not.toMatch(/\byou\b/i);
    expect(note).not.toMatch(/\byourself\b/i);
  });

  it("prints BOTH counts, so the header sums against the Resolved (N) beside it", () => {
    // inc.94 gave the number on the refused side and hid it on the singular reopenable side,
    // so the arithmetic could only be checked in one direction.
    const note = archiveReopenRuleNote(prodish) ?? "";
    expect(note).toContain("1 row");
    expect(note).toContain("39");
  });

  it("says nothing when no Reopen button is drawn — there is no asymmetry to explain", () => {
    // An archive of nothing but Rob's own closes shows no button to wonder about; a line
    // about a control that is not on the page is noise on every row of it.
    expect(archiveReopenRuleNote([{ status: "resolved", resolution_note: "Rob: done." }])).toBeNull();
  });

  it("says nothing when every row reopens — a uniform list states its own rule", () => {
    expect(
      archiveReopenRuleNote([
        { status: "resolved", resolution_note: supersededNote(1) },
        { status: "resolved", resolution_note: supersededNote(2) },
      ]),
    ).toBeNull();
  });

  it("counts only RESOLVED rows — the archive is what it describes", () => {
    expect(
      archiveReopenRuleNote([
        { status: "open", resolution_note: null },
        { status: "resolved", resolution_note: supersededNote(9) },
      ]),
    ).toBeNull();
  });

  it("cannot drift from the server — every counted row is one the endpoint would refuse", () => {
    // The one ladder. If `flagReopenRefusal` ever changed its mind about a note, the sentence
    // would change with it rather than describing a rule the endpoint no longer enforces.
    const rows = [
      { status: "resolved", resolution_note: supersededNote(5) },
      { status: "resolved", resolution_note: "Resolved from C-2017." },
      { status: "resolved", resolution_note: null },
    ];
    const refused = rows.filter((r) => flagReopenRefusal(r.status, r.resolution_note) !== null).length;
    expect(archiveReopenRuleNote(rows)).toContain(`The other ${refused} were closed by a person`);
  });

  it("is null on an empty or missing archive", () => {
    expect(archiveReopenRuleNote([])).toBeNull();
    expect(archiveReopenRuleNote(null)).toBeNull();
    expect(archiveReopenRuleNote(undefined)).toBeNull();
  });

  it("reads singular on both sides when exactly one row is each kind", () => {
    const note = archiveReopenRuleNote([
      { status: "resolved", resolution_note: supersededNote(1) },
      { status: "resolved", resolution_note: "Rob: comped." },
    ]) ?? "";
    expect(note).toContain("Reopen shows only on the 1 row a pass closed");
    expect(note).toContain("The other 1 was closed by a person");
  });
});
