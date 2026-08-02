import { describe, it, expect } from "vitest";
import { reviewerClauseRefusal, routeClauseRefusal } from "../reviewerClause";
import { resolveNoteFor } from "@/lib/comms/proposalFlag";
import { resolvedFrom, resolutionNoteBody, archiveResolvedFromMark } from "../supersede";

// Q84 inc.97 — the three paths where `resolveNoteFor` writes no stamp, which are exactly the
// paths where a reviewer's own trailing clause survives into the ledger unclaimed.
const ORDINARY = "Blocked domain still held by two records";
const PROPOSAL = "New company domain: acme.com";

describe("reviewerClauseRefusal", () => {
  it("says nothing about the notes the dashboard actually sends today", () => {
    expect(reviewerClauseRefusal(ORDINARY, "", "C-2017", ["C-2018"])).toBeNull();
    expect(reviewerClauseRefusal(ORDINARY, "Rob: same person — merged.", "C-2017", ["C-2018"])).toBeNull();
    expect(reviewerClauseRefusal(ORDINARY, "Checked C-2018 first.", "C-2017", ["C-2018"])).toBeNull();
  });

  it("refuses a typed clause on a row this click will not stamp", () => {
    // Named nothing else, filed where the click happened: `resolvedFromNote` returns the body.
    const message = reviewerClauseRefusal(ORDINARY, "Handled. Resolved from C-2018.", "C-2017", [], "C-2017");
    expect(message).not.toBeNull();
    expect(message).toContain("C-2018");
  });

  it("refuses it off a record page too, where there is no `from` at all", () => {
    expect(reviewerClauseRefusal(ORDINARY, "Handled. Resolved from C-2018.", null, [])).not.toBeNull();
    expect(reviewerClauseRefusal(ORDINARY, "Handled. Resolved from C-2018.", "", ["C-2018"])).not.toBeNull();
  });

  it("refuses it on a proposal, whose note is never stamped by design", () => {
    expect(reviewerClauseRefusal(PROPOSAL, "Not ours. Resolved from C-2018.", "C-2017", ["C-2018"])).not.toBeNull();
  });

  it("stays silent when the writer DOES stamp — inc.91 already owns that case", () => {
    const note = "Handled. Resolved from C-2018.";
    // A row that names another record: the machine appends its own clause, and its clause is
    // the one `resolvedFrom` reads back, so the reviewer's sentence is not mistaken for it.
    expect(reviewerClauseRefusal(ORDINARY, note, "C-2017", ["C-2019"])).toBeNull();
    expect(resolvedFrom(resolveNoteFor(ORDINARY, note, "C-2017", ["C-2019"]))).toBe("C-2017");
  });

  it("stays silent on true idempotence — the exact string the machine would have written", () => {
    expect(reviewerClauseRefusal(ORDINARY, "Resolved from C-2017.", "C-2017", ["C-2018"])).toBeNull();
  });

  it("is silent for every note with no clause in it, whatever else it says", () => {
    for (const note of ["", "   ", "Resolved from here.", "Resolved from C-2018 after a call.", "C-2018"]) {
      expect(reviewerClauseRefusal(ORDINARY, note, "C-2017", [], "C-2017"), note).toBeNull();
    }
  });

  it("names the harm it is preventing, and it is a harm the readers really do cause", () => {
    const typed = "Handled. Resolved from C-2018.";
    const stored = resolveNoteFor(ORDINARY, typed, "C-2017", [], "C-2017");
    expect(stored).toBe(typed); // nothing stamped it — the clause is the reviewer's alone
    // The quote loses the reviewer's own sentence...
    expect(resolutionNoteBody(stored)).toBe("Handled.");
    // ...and the archive prints it as the ledger's record of where the row was closed.
    expect(archiveResolvedFromMark(stored, "C-2017", false, [], ["C-2018"])).toContain("Resolved from C-2018");
    expect(reviewerClauseRefusal(ORDINARY, typed, "C-2017", [], "C-2017")).not.toBeNull();
  });
});

// Q84 inc.98 — the same clause arriving at `PATCH /api/admin/flags`, where there is no
// `fromRecord` and the client has already appended any legitimate stamp. The rule is a strict
// subset of the one above, and these pin BOTH halves: what it closes, and what it lets past
// on purpose rather than by omission.
describe("routeClauseRefusal", () => {
  it("refuses a clause on a proposal row that names a record the row has nothing to do with", () => {
    const message = routeClauseRefusal(PROPOSAL, "acme.com — dismissed", "Not a company. Resolved from C-2018.");
    expect(message).toContain("Resolved from C-2018.");
    expect(message).toContain("provenance nobody recorded");
    // ...and the harm is real: a proposal never stamps, whatever page the click came from.
    expect(resolveNoteFor(PROPOSAL, "Not a company. Resolved from C-2018.", "C-2017", ["C-2019"], "C-2017"))
      .toBe("Not a company. Resolved from C-2018.");
  });

  it("says the same sentence as the button — one message, not two spellings", () => {
    const note = "Not a company. Resolved from C-2018.";
    expect(routeClauseRefusal(PROPOSAL, "acme.com", note)).toBe(
      reviewerClauseRefusal(PROPOSAL, note, "C-2017", [], "C-2017"),
    );
  });

  it("is silent on every ordinary row — the route cannot tell the two authors apart there", () => {
    // The client appends the stamp before sending, so this exact string is what a LEGITIMATE
    // resolve from C-2017 on a row naming C-2019 puts on the wire. Refusing it would delete
    // the provenance inc.34/inc.35 were spent building.
    expect(routeClauseRefusal(ORDINARY, "names C-2019", "Handled. Resolved from C-2017.")).toBeNull();
    expect(routeClauseRefusal(ORDINARY, null, "Handled. Resolved from C-2018.", "C-2017")).toBeNull();
  });

  it("over-approximates the exempt case: an id the row is filed on or names is let past", () => {
    expect(routeClauseRefusal(PROPOSAL, "acme.com", "Resolved from C-2017.", "C-2017")).toBeNull();
    expect(routeClauseRefusal(PROPOSAL, "seen on C-2018's page", "Resolved from C-2018.")).toBeNull();
  });

  it("is silent for every note carrying no clause at all", () => {
    for (const note of ["", "   ", "Not a company.", "Resolved from C-2018 after a call.", "C-2018"]) {
      expect(routeClauseRefusal(PROPOSAL, "acme.com", note), note).toBeNull();
    }
  });

  it("asks the writer whether the row stamps — it does not restate the proposal rule", () => {
    // A title that is not a proposal stamps for the probe `from`; a proposal does not. If
    // `resolveNoteFor` ever starts stamping proposals, this refusal goes quiet with it.
    expect(resolveNoteFor(PROPOSAL, "", "C-0", ["C-1"])).toBe("");
    expect(resolveNoteFor(ORDINARY, "", "C-0", ["C-1"])).toBe("Resolved from C-0.");
  });
});
