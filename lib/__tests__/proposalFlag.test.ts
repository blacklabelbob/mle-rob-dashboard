import { describe, expect, it } from "vitest";
import {
  archiveConsequence,
  createdFromProposalNote,
  addressFromDetail,
  createOutcomeMessage,
  overviewReadControl,
  proposalDomain,
  resolveControlCopy,
  suggestedNameFromDetail,
  verticalPickerState,
  writeFailureMessage,
} from "@/lib/comms/proposalFlag";
import { proposalToFlag, proposalTitle } from "@/lib/comms/orgProposal";

describe("proposalDomain", () => {
  it("round-trips the title inc.3 writes — the two ends of the contract", () => {
    expect(proposalDomain(proposalTitle("the-title-base.com"))).toBe("the-title-base.com");
  });

  it("returns null for an ordinary finding so no create button appears on it", () => {
    expect(proposalDomain("PropLogix — business name mismatch")).toBeNull();
    // A near-miss must NOT parse: a flag Rob wrote by hand about a domain is
    // not a proposal, and offering "create company" on it invents a row.
    expect(proposalDomain("New company domains: a.com")).toBeNull();
  });

  it("treats a title with no domain as not-a-proposal, never as a blank domain", () => {
    expect(proposalDomain("New company domain: ")).toBeNull();
    expect(proposalDomain("New company domain:    ")).toBeNull();
  });
});

describe("suggestedNameFromDetail", () => {
  it("pulls the guess back out of the detail inc.3 wrote", () => {
    const flag = proposalToFlag({
      domain: "the-title-base.com",
      address: "trent@the-title-base.com",
      suggestedName: "The Title Base",
    });
    expect(suggestedNameFromDetail(flag.detail)).toBe("The Title Base");
  });

  it("returns empty when there is no suggestion — the reviewer types the name", () => {
    const flag = proposalToFlag({ domain: "x.com", address: "a@x.com", suggestedName: "" });
    expect(suggestedNameFromDetail(flag.detail)).toBe("");
    expect(suggestedNameFromDetail("some unrelated finding")).toBe("");
  });
});

describe("addressFromDetail", () => {
  const flag = proposalToFlag({
    domain: "the-title-base.com",
    address: "trent@the-title-base.com",
    suggestedName: "The Title Base",
  });

  it("round-trips the address inc.3 wrote — the provenance line's only source", () => {
    expect(addressFromDetail(flag.detail, "the-title-base.com")).toBe("trent@the-title-base.com");
  });

  it("survives a domain the reviewer's flag carries in a different case", () => {
    expect(addressFromDetail(flag.detail, "The-Title-Base.COM ")).toBe("trent@the-title-base.com");
  });

  it("REFUSES an address at another domain — a wrong provenance line is worse than none", () => {
    // A flag is prose on a shared, hand-editable table. Trusting this would
    // write "first outbound contact to someone@rival.com" onto this company's
    // record permanently.
    const tampered = flag.detail.replace("trent@the-title-base.com", "someone@rival.com");
    expect(addressFromDetail(tampered, "the-title-base.com")).toBe("");
  });

  it("reads the domain after the LAST @, so a quoted local part still verifies", () => {
    const odd = proposalToFlag({
      domain: "roofco.com",
      address: '"a@b"@roofco.com',
      suggestedName: "Roofco",
    });
    expect(addressFromDetail(odd.detail, "roofco.com")).toBe('"a@b"@roofco.com');
  });

  it("returns empty for a finding that carries no address, so the note omits the line", () => {
    expect(addressFromDetail("PropLogix — business name mismatch", "proplogix.com")).toBe("");
    expect(addressFromDetail("We sent mail to and roofco.com matches no company", "roofco.com")).toBe("");
  });

  it("returns empty for a malformed address rather than half of one", () => {
    const noAt = flag.detail.replace("trent@the-title-base.com", "the-title-base.com");
    expect(addressFromDetail(noAt, "the-title-base.com")).toBe("");
    const trailing = flag.detail.replace("trent@the-title-base.com", "trent@");
    expect(addressFromDetail(trailing, "the-title-base.com")).toBe("");
  });

  it("does not let a subdomain address claim the proposed domain", () => {
    // Exact membership, never endsWith — mail.roofco.com is not roofco.com,
    // and the ladder's domain match is exact, so these cannot legitimately differ.
    const sub = flag.detail.replace("trent@the-title-base.com", "trent@mail.the-title-base.com");
    expect(addressFromDetail(sub, "the-title-base.com")).toBe("");
  });
});

// Q69 inc.16 — the outcome the route reports and the button used to erase.
//
// The create route writes twice: the org row (guaranteed by the 2xx) and then
// the ledger flag's resolve, which it lets fail on purpose. Before this, the
// component rendered one green "Created X ✓" for every outcome — so the failure
// the route took care to describe was invisible, and the next click on the
// still-open flag answered 409 `domain-already-known`, which reads as a broken
// button on the exact domain that just worked.
describe("createOutcomeMessage", () => {
  it("says done, with the name and the tick, only when the flag actually closed", () => {
    const out = createOutcomeMessage("The Title Base", true);
    expect(out.resolved).toBe(true);
    expect(out.text).toBe("Created The Title Base ✓");
  });

  it("still says CREATED when the resolve failed — the company does exist", () => {
    // The org write is what the 2xx is about. Reporting the create as failed
    // because the second write failed would send Rob to create it again, and
    // inc.9's unique index would refuse him.
    const out = createOutcomeMessage("The Title Base", false);
    expect(out.text.startsWith("Created The Title Base")).toBe(true);
    expect(out.resolved).toBe(false);
    expect(out.text).toContain("stays open");
  });

  it("treats a missing flagResolved as unknown, never as resolved", () => {
    // Reached when the response body fails to parse or the shape drifts. A
    // glance at the ledger costs a second; a flag believed handled outlives
    // the session.
    const out = createOutcomeMessage("The Title Base", undefined);
    expect(out.resolved).toBe(false);
    expect(out.text).toContain("check the ledger");
  });

  it("never renders a name it wasn't given", () => {
    for (const name of [undefined, "", "   "]) {
      const out = createOutcomeMessage(name, true);
      expect(out.text).toBe("Created ✓");
      expect(out.text).not.toContain("undefined");
    }
  });

  it("trims the name the route echoes back rather than printing its padding", () => {
    expect(createOutcomeMessage("  Gulf Coast Roofing  ", true).text).toBe(
      "Created Gulf Coast Roofing ✓"
    );
  });

  it("only the resolved outcome carries the tick — the unresolved ones must not", () => {
    // The colour is chosen off `resolved`, but the text is what gets read back
    // in a screenshot. A ✓ on an unclosed item is the same false 'handled'.
    expect(createOutcomeMessage("Acme", false).text).not.toContain("✓");
    expect(createOutcomeMessage("Acme", undefined).text).not.toContain("✓");
  });

  it("distinguishes 'we know it failed' from 'we don't know' — different sentences", () => {
    // Folding undefined into false would tell Rob the resolve failed when the
    // truth is we never heard. Both keep him on the ledger; only one is honest
    // about why.
    const failed = createOutcomeMessage("Acme", false).text;
    const unknown = createOutcomeMessage("Acme", undefined).text;
    expect(failed).not.toBe(unknown);
  });
});

describe("verticalPickerState (Q69 inc.17 — the dead end, said out loud)", () => {
  it("never blames the reviewer for a list that failed to load", () => {
    // The defect this replaces: tooltip read "name and vertical are both
    // required" while the select was empty because the fetch 500'd.
    const s = verticalPickerState("unreachable", 0, true, false);
    expect(s.canCreate).toBe(false);
    expect(s.blockReason).not.toContain("pick a vertical");
    expect(s.notice).toContain("Couldn't load");
    expect(s.notice).toContain("reopen to retry");
  });

  it("says nothing was created when the list is unreachable", () => {
    // The reviewer's real question after a greyed-out button is "did I half
    // make a company?". The answer has to be on screen.
    expect(verticalPickerState("unreachable", 0, true, true).notice).toContain("nothing was created");
  });

  it("keeps 'unreachable' and 'no verticals exist' as different sentences", () => {
    // One is retryable, one is not. Folding them sends the reviewer into a
    // retry loop against a CRM that has no verticals to offer.
    const unreachable = verticalPickerState("unreachable", 0, true, false).notice;
    const empty = verticalPickerState("ready", 0, true, false).notice;
    expect(unreachable).not.toBe(empty);
    expect(empty).toContain("stays queued");
    expect(empty).not.toContain("retry");
  });

  it("blocks the create on every non-ready list, whatever the fields say", () => {
    // vertical_id is a NOT NULL FK (inc.4) — letting the click through is a
    // Postgres error wearing a broken button.
    for (const st of [
      verticalPickerState("loading", 0, true, true),
      verticalPickerState("unreachable", 3, true, true),
      verticalPickerState("ready", 0, true, true),
    ]) {
      expect(st.canCreate).toBe(false);
      expect(st.blockReason).not.toBe("");
    }
  });

  it("the notice and the button's reason never name different obstacles", () => {
    // A tooltip disagreeing with the line above it is how a reviewer decides
    // the page is broken rather than that the list failed.
    for (const st of [
      verticalPickerState("unreachable", 0, true, true),
      verticalPickerState("ready", 0, true, true),
    ]) {
      expect(st.blockReason).toBe(st.notice);
    }
  });

  it("falls back to the reviewer's own obstacles only once the list is real", () => {
    expect(verticalPickerState("ready", 4, false, false).blockReason).toContain("company name");
    expect(verticalPickerState("ready", 4, true, false).blockReason).toContain("pick a vertical");
    // Those are the reviewer's to clear, so they get no amber line — the empty
    // fields are already visible next to the button.
    expect(verticalPickerState("ready", 4, true, false).notice).toBe("");
  });

  it("allows the create exactly when a real list and both fields are present", () => {
    const ok = verticalPickerState("ready", 1, true, true);
    expect(ok).toEqual({ notice: "", canCreate: true, blockReason: "" });
  });
});

describe("resolveControlCopy (inc.18 — the permanent click, labelled)", () => {
  const proposal = proposalTitle("the-title-base.com");

  it("leaves an ordinary finding's control exactly as it was", () => {
    // 99% of the ledger is not proposals. A permanence warning on a row where
    // nothing is permanent teaches Rob to ignore the line that matters.
    expect(resolveControlCopy("PropLogix — business name mismatch")).toEqual({
      label: "Resolve",
      tooltip: "mark this handled",
      hint: "",
      notePlaceholder: "optional note…",
    });
  });

  it("stops calling the proposal's button a resolve", () => {
    // "Resolve" reads as ledger housekeeping; the click decides the domain is
    // not a company, forever. The label has to be the decision.
    expect(resolveControlCopy(proposal).label).not.toBe("Resolve");
    expect(resolveControlCopy(proposal).label).toBe("Not a company");
  });

  it("names the permanence and the domain it applies to, before the click", () => {
    const copy = resolveControlCopy(proposal);
    expect(copy.hint).toContain("the-title-base.com");
    expect(copy.hint).toContain("permanent");
    expect(copy.hint).toContain("won't be proposed again");
  });

  it("points at the button that does the other thing", () => {
    // A reviewer who reads "permanent" and wants the company must be told,
    // in the same sentence, where the non-destructive click is.
    expect(resolveControlCopy(proposal).hint).toContain("Create company");
  });

  it("never lets the tooltip and the hint claim different things (inc.17 rule)", () => {
    const copy = resolveControlCopy(proposal);
    for (const s of [copy.tooltip, copy.hint]) {
      expect(s).toContain("the-title-base.com");
      expect(s.toLowerCase()).toContain("permanent");
      expect(s).toContain("again");
    }
  });

  it("asks for the reason a domain was shut out, not an optional note", () => {
    // The note is the ONLY record of why this domain can never come back.
    // "optional note…" is an invitation to leave that record blank.
    expect(resolveControlCopy(proposal).notePlaceholder).not.toContain("optional");
    expect(resolveControlCopy(proposal).notePlaceholder).toContain("company");
  });

  it("treats a prefix-only title as an ordinary flag, never a half-written warning", () => {
    // proposalDomain returns null for an empty domain; a hint reading
    // "…: won't be proposed again" would be a warning about nothing.
    expect(resolveControlCopy("New company domain: ").hint).toBe("");
    expect(resolveControlCopy("New company domain: ").label).toBe("Resolve");
  });

  it("warns on exactly the flags whose dismissal is permanent", () => {
    // The dedupe that makes it permanent keys on the title (existingTitles
    // selects any status), so the same title contract must drive the copy.
    const flag = proposalToFlag({ domain: "roofco.com", suggestedName: "Roofco", address: "a@roofco.com" });
    expect(resolveControlCopy(flag.title).hint).not.toBe("");
  });

  // Q84 inc.30 — the same button on a row that is not this record's.
  describe("a finding that spans other records (inc.30)", () => {
    const ordinary = "CG Roofing Group / Gulf Coast RE Group — same phone, two orgs";

    it("names the other pages the click clears, on the control itself", () => {
      // Prod #137 on /companies/C-2017: filed against neither company, sitting on
      // C-2018's page too. The marker says so in the body; the button said nothing.
      const copy = resolveControlCopy(ordinary, { others: ["C-2018"] });
      expect(copy.tooltip).toContain("C-2018");
      expect(copy.hint).toContain("C-2018");
      expect(copy.hint).toContain("not filed here");
    });

    it("keeps the label a Resolve, because that is what the click does", () => {
      // Unlike a proposal, nothing here is permanent — renaming the button would
      // be a warning about the wrong thing.
      expect(resolveControlCopy(ordinary, { others: ["C-2018"] }).label).toBe("Resolve");
    });

    it("never lets the tooltip and the hint claim different things (inc.17 rule)", () => {
      const copy = resolveControlCopy(ordinary, { others: ["C-2018", "P-1010"] });
      for (const s of [copy.tooltip, copy.hint]) {
        expect(s).toContain("C-2018");
        expect(s).toContain("P-1010");
      }
    });

    it("asks the question a cross-record dismissal has to answer, and miscounts nothing", () => {
      // #129 names six records — "both" would be a lie on that row.
      const copy = resolveControlCopy(ordinary, { others: ["C-2018", "P-1010", "C-2006"] });
      expect(copy.notePlaceholder).not.toContain("optional");
      expect(copy.notePlaceholder).not.toContain("both");
      expect(copy.notePlaceholder).toContain("every record it names");
    });

    it("leaves the ordinary copy alone when the row spans no other page", () => {
      // No scope at all (the Overview digest, or a filed row), and the scoped row
      // that names only the page being read: both are ordinary findings here, and a
      // cross-page warning on them is the noise that devalues the real one.
      for (const scope of [null, undefined, { others: [] }]) {
        expect(resolveControlCopy(ordinary, scope)).toEqual({
          label: "Resolve",
          tooltip: "mark this handled",
          hint: "",
          notePlaceholder: "optional note…",
        });
      }
    });

    it("keeps the permanence copy on a scoped proposal row", () => {
      // Both facts are true; the hint has room for one, and a domain shut out of
      // the CRM forever outranks a row also sitting on another page.
      const copy = resolveControlCopy(proposal, { others: ["C-2018"] });
      expect(copy.label).toBe("Not a company");
      expect(copy.hint).toContain("permanent");
      expect(copy.hint).not.toContain("C-2018");
    });
  });

  // Q84 inc.33 — the write side of the question inc.32 answered for the archive.
  describe("a page the finding reaches without naming (inc.33)", () => {
    const ordinary = "CG Roofing Group / Gulf Coast RE Group — same phone, two orgs";

    it('says "too" only where the page is provably one of the records named', () => {
      // On C-2017's page #137 names C-2017, so C-2018 is genuinely the OTHER one.
      const copy = resolveControlCopy(ordinary, { others: ["C-2018"], here: "C-2017" });
      expect(copy.hint).toContain("C-2018");
      expect(copy.hint).toContain("too");
    });

    it("never makes an unnamed page one of the records the finding is about", () => {
      // Measured on prod: #137 is filed against neither C-2017 nor C-2018 and reaches
      // P-1018 / P-1019 / P-1022 through `org_memberships`, naming no person. "clears
      // it from C-2017, C-2018 too" tells that reviewer the finding is partly theirs.
      const copy = resolveControlCopy(ordinary, { others: ["C-2017", "C-2018"], here: null });
      expect(copy.hint).not.toContain("too");
      expect(copy.hint).toContain("C-2017, C-2018");
      expect(copy.hint).toContain("one finding");
    });

    it("treats an absent `here` as unproven, never as proven (flagNamedScope's own rule)", () => {
      // A caller that cannot say which page it is on must not get the stronger claim.
      const absent = resolveControlCopy(ordinary, { others: ["C-2018"] });
      expect(absent.hint).toBe(resolveControlCopy(ordinary, { others: ["C-2018"], here: null }).hint);
      expect(absent.hint).not.toContain("too");
    });

    it("keeps the tooltip and the hint claiming the same thing on both branches (inc.17 rule)", () => {
      for (const here of ["C-2017", null]) {
        const copy = resolveControlCopy(ordinary, { others: ["C-2018", "P-1010"], here });
        for (const s of [copy.tooltip, copy.hint]) {
          expect(s).toContain("C-2018");
          expect(s).toContain("P-1010");
        }
      }
    });

    it("still says the row is not filed here, whichever page it is read on", () => {
      // The `entity_id IS NULL` fact is true on every page this row reaches; only the
      // question of whether the finding NAMES this page changes between them.
      for (const here of ["C-2017", null]) {
        expect(resolveControlCopy(ordinary, { others: ["C-2018"], here }).hint).toContain("not filed here");
      }
    });

    it("leaves a row that spans no other page ordinary, proven or not", () => {
      for (const here of ["C-2017", null, undefined]) {
        expect(resolveControlCopy(ordinary, { others: [], here }).hint).toBe("");
      }
    });
  });
});

describe("writeFailureMessage (inc.19)", () => {
  const proposal = proposalTitle("the-title-base.com");
  const ordinary = "PropLogix — business name mismatch";

  it("says the permanent thing did NOT happen after a refused dismiss", () => {
    // inc.18 just told Rob this click is irreversible. The one sentence worth
    // printing after it fails is that the domain is still proposed — otherwise
    // he must assume the worst and stops clicking, leaving the item stuck.
    const f = writeFailureMessage("resolve", 500, proposal);
    expect(f.text).toContain("the-title-base.com");
    expect(f.text).toContain("NOT dismissed");
    expect(f.text).toContain("still proposed");
    expect(f.certain).toBe(true);
  });

  it("never claims nothing changed when the request never came back", () => {
    // A thrown fetch may have been applied and lost on the way home. Claiming
    // "nothing changed" there is the cheerful-200 failure inverted.
    const f = writeFailureMessage("resolve", null, proposal);
    expect(f.certain).toBe(false);
    expect(f.text).not.toContain("Nothing changed");
    expect(f.text).toContain("may or may not");
  });

  it("asks for a reload before the next click, because the next click is the permanent one", () => {
    expect(writeFailureMessage("resolve", null, proposal).text).toContain("Reload before clicking again");
    expect(writeFailureMessage("resolve", null, ordinary).text).toContain("Reload before clicking again");
  });

  it("carries the status so a 400 and a 500 aren't the same shrug", () => {
    // 400 = the route refused the payload (a bug we own); 500 = the write
    // failed. Same sentence, different number to report.
    expect(writeFailureMessage("resolve", 400, ordinary).text).toContain("400");
    expect(writeFailureMessage("resolve", 500, ordinary).text).toContain("500");
  });

  it("keeps a failed read quieter than a failed dismiss", () => {
    // A row staying on Overview one more minute is not the ledger's permanent
    // click. Identical alarm on both is how the one that matters gets ignored.
    const read = writeFailureMessage("read", 500, proposal);
    const resolve = writeFailureMessage("resolve", 500, proposal);
    expect(read.text).not.toBe(resolve.text);
    expect(read.text).toContain("Still unread");
    expect(read.text).not.toContain("dismissed");
  });

  it("never invents a domain on an ordinary flag", () => {
    // Same rule as inc.18: a warning naming a domain on a row that has none.
    for (const status of [400, 500, null]) {
      const f = writeFailureMessage("resolve", status, ordinary);
      expect(f.text).not.toContain("proposed");
      expect(f.text).not.toContain("undefined");
      expect(f.text).not.toContain("null");
    }
  });

  it("says an ordinary refused resolve left the item open", () => {
    expect(writeFailureMessage("resolve", 500, ordinary).text).toContain("still open");
  });

  it("treats a prefix-only title as ordinary, so no half-written domain sentence", () => {
    expect(writeFailureMessage("resolve", 500, "New company domain: ").text).toContain("still open");
  });
});

describe("overviewReadControl (inc.20 — the checkbox that can't clear its row)", () => {
  const proposal = proposalTitle("the-title-base.com");
  const ordinary = "PropLogix — business name mismatch";

  it("offers no checkbox on a proposal, because the row provably will not clear", () => {
    // inc.6 keeps proposals on the Overview regardless of read_at — the
    // Overview is their only surface. A control whose whole promise is "this
    // disappears" must not be offered where it cannot be kept.
    expect(overviewReadControl(proposal, false).checkbox).toBe(false);
  });

  it("keeps the checkbox on an ordinary finding — 99% of the ledger still works", () => {
    expect(overviewReadControl(ordinary, true).checkbox).toBe(true);
    expect(overviewReadControl(ordinary, false).checkbox).toBe(true);
  });

  it("never claims a proposal clears from Overview or lives on a record", () => {
    const t = overviewReadControl(proposal, false).tooltip;
    expect(t).not.toContain("clears from Overview");
    expect(t).not.toContain("stays on the record");
  });

  it("names both exits, since 'why won't this go away' needs the answer", () => {
    const t = overviewReadControl(proposal, false).tooltip;
    expect(t).toContain("create the company");
    expect(t).toContain("dismiss");
  });

  it("only points at a record page when the flag actually has one", () => {
    expect(overviewReadControl(ordinary, true).tooltip).toContain("stays on the record");
    expect(overviewReadControl(ordinary, false).tooltip).not.toContain("stays on the record");
    expect(overviewReadControl(ordinary, false).tooltip).toContain("no record page");
  });

  it("still marks an entity-less ordinary finding read — the fix is the caption, not the click", () => {
    // Only proposals have the inc.6 filter exception; a record-less ordinary
    // flag does clear from Overview, so taking its checkbox away would remove
    // a working control to fix a wrong sentence.
    expect(overviewReadControl(ordinary, false).checkbox).toBe(true);
  });

  it("ignores a prefix-only title, matching every other inc.16-19 parser", () => {
    expect(overviewReadControl("New company domain: ", true).checkbox).toBe(true);
  });

  it("hands the proposal the same domain rule as the rest of the file", () => {
    // Guard against a second, drifting notion of "is this a proposal".
    expect(overviewReadControl(proposalTitle("roofco.com"), false).checkbox).toBe(false);
  });
});

describe("archiveConsequence (inc.21 — the archive row that never says the door is shut)", () => {
  const proposal = proposalTitle("the-title-base.com");
  const ordinary = "PropLogix — business name mismatch";

  it("says nothing extra on an ordinary resolved finding", () => {
    // 99% of the archive is not proposals; a permanence line where nothing is
    // permanent is the noise that teaches Rob to skim past the real one.
    expect(archiveConsequence(ordinary, "handled on the call")).toBeNull();
    expect(archiveConsequence(ordinary, null)).toBeNull();
  });

  it("names the domain and the standing consequence of a dismissal", () => {
    const line = archiveConsequence(proposal, "vendor, not a customer") as string;
    expect(line).toContain("the-title-base.com");
    expect(line).toContain("no longer proposed");
  });

  it("gives the way out, because a closed door with no handle is the defect", () => {
    expect(archiveConsequence(proposal, null)).toContain("add it by hand");
  });

  it("stays silent on a row the CREATE button resolved — the company exists", () => {
    // Same closure, opposite meaning: telling Rob to add a company he just
    // created by hand is a false instruction, not a warning.
    expect(archiveConsequence(proposal, createdFromProposalNote("the-title-base", "The Title Base"))).toBeNull();
  });

  it("reads the created note through the shared builder, not a copied literal", () => {
    const note = createdFromProposalNote("roofco", "Roof Co");
    expect(note).toBe("Created roofco (Roof Co) from this proposal.");
    expect(archiveConsequence(proposalTitle("roofco.com"), note)).toBeNull();
  });

  it("treats a note that merely mentions creating as a dismissal, not a create", () => {
    // A typed note is prose; only the route's exact shape means "created".
    expect(archiveConsequence(proposal, "Created a task to call them")).toContain("no longer proposed");
  });

  it("survives whitespace around the route's note", () => {
    expect(archiveConsequence(proposal, `  ${createdFromProposalNote("tb", "TB")}  `)).toBeNull();
  });

  it("ignores a prefix-only title, matching every other inc.16-20 parser", () => {
    expect(archiveConsequence("New company domain: ", null)).toBeNull();
  });
});
