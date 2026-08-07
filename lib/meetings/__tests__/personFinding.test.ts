/**
 * Q85 inc.9 — the person decisions as ONE deduped ledger row.
 *
 * Same discipline as inc.8's suite: every decision is produced by the REAL resolver and the
 * REAL decider against the three names live prod carries, so a change upstream that
 * reclassified `Dix thedev08` as a proposal fails here instead of passing a hand-made shape.
 */

import { describe, expect, it } from "vitest";
import { resolveAttendee } from "../attendeePerson";
import { decidePersonProposal } from "../personProposal";
import {
  ANSWER_HEADING,
  KEY_PERSON_PROPOSALS,
  PROPOSE_HEADING,
  WITHHOLD_HEADING,
  buildPersonProposalFinding,
} from "../personFinding";
import type { CrmPerson } from "../activityPlan";
import type { PersonProposalDecision } from "../personProposal";

const PEOPLE: CrmPerson[] = [
  { id: "P-1010", name: "Dixith Magadiev", orgId: "C-2006" },
  { id: "P-1018", name: "Caleb Green", orgId: "C-2013" },
  { id: "P-1021", name: "Alex Greenwood", orgId: "C-2018" },
];

const decide = (name: string): PersonProposalDecision => {
  const d = decidePersonProposal(
    resolveAttendee(
      { name, side: "counterparty", source: "Non MLE Attendees", identifying: true },
      PEOPLE
    ),
    PEOPLE
  );
  if (!d) throw new Error(`expected a decision for ${name}`);
  return d;
};

// The exact three names inc.7 measured on prod.
const PROD = () => [decide("Joseph Green"), decide("Ryan Groth"), decide("Dix thedev08")];

describe("buildPersonProposalFinding", () => {
  it("returns null when nothing is unresolved — the caller must not close Rob's row", () => {
    expect(buildPersonProposalFinding([])).toBeNull();
  });

  it("rides the person key, never a meeting key", () => {
    const f = buildPersonProposalFinding(PROD());
    expect(f?.dedupeKey).toBe(KEY_PERSON_PROPOSALS);
    expect(f?.dedupeKey).not.toContain("crm-gap");
    expect(f?.dedupeKey).not.toContain("needs-human-account");
  });

  it("splits the prod three into 2 propose · 1 withhold, under two headings", () => {
    const f = buildPersonProposalFinding(PROD());
    expect(f?.title).toContain("2 meeting attendee(s) to propose");
    expect(f?.title).toContain("1 that must NOT become a record");
    expect(f?.detail).toContain(PROPOSE_HEADING);
    expect(f?.detail).toContain(WITHHOLD_HEADING);
    expect(f?.detail).toContain("Joseph Green");
    expect(f?.detail).toContain("Ryan Groth");
    expect(f?.detail).toContain("Dix thedev08");
  });

  it("sends the withheld name's fix to Notion and says do-not-create out loud", () => {
    const f = buildPersonProposalFinding(PROD());
    expect(f?.detail).toContain("Do NOT create a person");
    expect(f?.detail).toContain("Notion");
    // The withheld name must never appear under the propose heading.
    const proposeBlock = f!.detail.split(WITHHOLD_HEADING)[0];
    expect(proposeBlock).not.toContain("Dix thedev08");
  });

  it("keeps the shared-surname note WITH Joseph's proposal — context, never a reason to withhold", () => {
    const f = buildPersonProposalFinding(PROD());
    const proposeBlock = f!.detail.split(WITHHOLD_HEADING)[0];
    expect(proposeBlock).toContain("Caleb Green [P-1018]");
    expect(proposeBlock).toContain("DIFFERENT person");
  });

  it("names a person once no matter how many meetings they attended", () => {
    const f = buildPersonProposalFinding([...PROD(), ...PROD(), ...PROD()]);
    expect(f?.title).toContain("2 meeting attendee(s) to propose");
    // TWICE, and exactly twice, whether the decision arrives once or nine times: once as the
    // bullet naming him, once in the command that would propose him (inc.23). The number that
    // matters is that tripling the input does not triple either — three bullets would read as
    // three humans, and three commands as three records.
    expect(f!.detail.match(/Ryan Groth/g)?.length).toBe(2);
  });

  it("drops the withhold heading entirely when every name is a real proposal", () => {
    const f = buildPersonProposalFinding([decide("Joseph Green"), decide("Ryan Groth")]);
    expect(f?.title).toBe("2 meeting attendee(s) the CRM has never met");
    expect(f?.detail).not.toContain(WITHHOLD_HEADING);
  });

  it("is medium — nothing is wrong, something is waiting", () => {
    expect(buildPersonProposalFinding(PROD())?.severity).toBe("medium");
  });

  /**
   * Q85 inc.23 — the row asked Rob to accept a person and never told him what he had to supply.
   * Both answers are refusals in `planPersonFromArchive`; until now they were visible only in a
   * terminal, and Rob reads the ledger.
   */
  describe("the two answers only Rob can give", () => {
    it("prints the live vertical options, not an invented list", () => {
      const f = buildPersonProposalFinding(PROD(), ["title", "roofing", "moving"]);
      expect(f?.detail).toContain(ANSWER_HEADING);
      expect(f?.detail).toContain("title · roofing · moving");
    });

    it("asks for the list rather than inventing one when it could not be read", () => {
      const f = buildPersonProposalFinding(PROD());
      expect(f?.detail).toContain("ask for the list");
      // The failure mode this guards: a hard-coded option Postgres then rejects on the NOT NULL
      // FK, turning a readable refusal into a 500.
      expect(f?.detail).not.toContain("one of: title");
    });

    it("names BOTH answers — a vertical alone still cannot be written", () => {
      const d = buildPersonProposalFinding(PROD(), ["title"])!.detail;
      expect(d).toContain("VERTICAL");
      expect(d).toContain("WHO INTRODUCED THEM");
      expect(d).toContain("orphan");
    });

    it("gives each proposable name its own runnable command, and the withheld name none", () => {
      const d = buildPersonProposalFinding(PROD(), ["title"])!.detail;
      expect(d).toContain('--name "Joseph Green" --vertical <id> --referred-by P-####');
      expect(d).toContain('--name "Ryan Groth" --vertical <id> --referred-by P-####');
      expect(d).not.toContain('--name "Dix thedev08"');
    });

    it("stays silent when there is nothing to propose — no answers are owed", () => {
      const f = buildPersonProposalFinding([decide("Dix thedev08")], ["title"]);
      expect(f?.detail).not.toContain(ANSWER_HEADING);
      expect(f?.detail).not.toContain("propose:archive-person");
    });
  });
});
