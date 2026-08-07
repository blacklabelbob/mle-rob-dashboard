import { describe, it, expect } from "vitest";
import { planPersonFromArchive, planPeopleFromArchive } from "../personFromArchive";
import type { PersonProposalDecision } from "../personProposal";
import type { CrmPerson } from "../activityPlan";

const PEOPLE: CrmPerson[] = [
  { id: "P-1001", name: "Rob Acheson" },
  { id: "P-1010", name: "Dixith Magadiev" },
  { id: "P-1018", name: "Caleb Green" },
];
const VERTICALS = ["v-roofing", "v-title"];
const DAY = "2026-07-15";

// The live decision for the one name flag #213 says to propose.
const josephGreen: PersonProposalDecision = {
  kind: "propose",
  name: "Joseph Green",
  sharedSurname: [{ id: "P-1018", name: "Caleb Green" }],
  looksLikeHandle: false,
};

// The live decision for the one name flag #213 says must NOT become a record.
const dixHandle: PersonProposalDecision = {
  kind: "withhold",
  name: "Dix thedev08",
  reason: { rung: "display-handle", handleToken: "thedev08", people: [{ id: "P-1010", name: "Dixith Magadiev" }] },
};

const answered = { verticalId: "v-roofing", referredById: "P-1001" };

describe("planPersonFromArchive — the withhold is refused before anything else", () => {
  it("refuses a display handle even when the reviewer filled the form in", () => {
    const plan = planPersonFromArchive(dixHandle, answered, PEOPLE, VERTICALS, DAY);
    expect(plan.kind).toBe("refused");
    if (plan.kind !== "refused") return;
    expect(plan.reason).toBe("withheld");
    // The refusal carries the decision's own sentence, not a new one.
    expect(plan.detail).toContain("Dixith Magadiev [P-1010]");
    expect(plan.detail).toContain("Do NOT create a person");
  });

  it("refuses the handle FIRST — a missing vertical never gets the chance to mask it", () => {
    const plan = planPersonFromArchive(dixHandle, {}, PEOPLE, VERTICALS, DAY);
    expect(plan.kind === "refused" && plan.reason).toBe("withheld");
  });
});

describe("planPersonFromArchive — the two answers only a human has", () => {
  it("refuses without a vertical, and says WHY the row cannot supply one", () => {
    const plan = planPersonFromArchive(josephGreen, { referredById: "P-1001" }, PEOPLE, VERTICALS, DAY);
    expect(plan.kind).toBe("refused");
    if (plan.kind !== "refused") return;
    expect(plan.reason).toBe("vertical-required");
    expect(plan.detail).toContain("company cell is empty");
  });

  it("refuses a vertical this CRM does not have", () => {
    const plan = planPersonFromArchive(
      josephGreen,
      { verticalId: "v-nope", referredById: "P-1001" },
      PEOPLE,
      VERTICALS,
      DAY
    );
    expect(plan.kind === "refused" && plan.reason).toBe("unknown-vertical");
  });

  it("refuses with no referrer rather than defaulting to Rob", () => {
    const plan = planPersonFromArchive(josephGreen, { verticalId: "v-roofing" }, PEOPLE, VERTICALS, DAY);
    expect(plan.kind).toBe("refused");
    if (plan.kind !== "refused") return;
    expect(plan.reason).toBe("referrer-required");
    expect(plan.detail).toContain("orphan");
    // The refusal must not name a referrer — naming one IS the default this refuses to make.
    expect(plan.detail).not.toContain("P-1001");
  });

  it("refuses a referrer who is not a person here", () => {
    const plan = planPersonFromArchive(
      josephGreen,
      { verticalId: "v-roofing", referredById: "P-9999" },
      PEOPLE,
      VERTICALS,
      DAY
    );
    expect(plan.kind === "refused" && plan.reason).toBe("unknown-referrer");
  });

  it("refuses a row with no date rather than inventing a met", () => {
    const plan = planPersonFromArchive(josephGreen, answered, PEOPLE, VERTICALS, "  ");
    expect(plan.kind === "refused" && plan.reason).toBe("met-required");
  });
});

describe("planPersonFromArchive — staleness between the decision and the click", () => {
  it("refuses when that exact person now exists, and points at them", () => {
    const now = [...PEOPLE, { id: "P-1042", name: "joseph  green" }];
    const plan = planPersonFromArchive(josephGreen, answered, now, VERTICALS, DAY);
    expect(plan.kind).toBe("refused");
    if (plan.kind !== "refused") return;
    expect(plan.reason).toBe("already-known");
    expect(plan.detail).toContain("P-1042");
  });

  it("a shared surname is NOT already-known — that is the whole point of the proposal", () => {
    // Caleb Green is in PEOPLE and must not block Joseph Green.
    const plan = planPersonFromArchive(josephGreen, answered, PEOPLE, VERTICALS, DAY);
    expect(plan.kind).toBe("create");
  });
});

describe("planPersonFromArchive — the row it would write", () => {
  it("mints a record number, never a name-derived id", () => {
    const plan = planPersonFromArchive(josephGreen, answered, PEOPLE, VERTICALS, DAY);
    expect(plan.kind).toBe("create");
    if (plan.kind !== "create") return;
    expect(plan.person.id).toMatch(/^P-\d+$/);
    expect(PEOPLE.some((p) => p.id === plan.person.id)).toBe(false);
    expect(plan.person.legacySlug).toBe("joseph-green");
  });

  it("is born unlit, a lead, with met = the meeting day and the reviewer's answers", () => {
    const plan = planPersonFromArchive(josephGreen, answered, PEOPLE, VERTICALS, DAY);
    if (plan.kind !== "create") throw new Error("expected create");
    expect(plan.person).toMatchObject({
      name: "Joseph Green",
      status: "unlit",
      nodeType: "lead",
      entityKind: "person",
      metISO: DAY,
      verticalId: "v-roofing",
      referredById: "P-1001",
    });
  });

  it("carries the surname warning into the record's own notes", () => {
    const plan = planPersonFromArchive(josephGreen, answered, PEOPLE, VERTICALS, DAY);
    if (plan.kind !== "create") throw new Error("expected create");
    expect(plan.person.notes).toContain("Caleb Green [P-1018]");
    expect(plan.person.notes).toContain("DIFFERENT person");
    expect(plan.person.notes).toContain(DAY);
  });

  it("has no money, commitment, org or email field to set — enforced by shape, not by promise", () => {
    const plan = planPersonFromArchive(josephGreen, answered, PEOPLE, VERTICALS, DAY);
    if (plan.kind !== "create") throw new Error("expected create");
    const keys = Object.keys(plan.person);
    for (const forbidden of ["quotedAmount", "signed", "keyDates", "orgId", "email", "phone"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("omits the surname sentence when there is no shared surname to warn about", () => {
    const groth: PersonProposalDecision = {
      kind: "propose",
      name: "Ryan Groth",
      sharedSurname: [],
      looksLikeHandle: false,
    };
    const plan = planPersonFromArchive(groth, answered, PEOPLE, VERTICALS, DAY);
    if (plan.kind !== "create") throw new Error("expected create");
    expect(plan.person.notes).not.toContain("DIFFERENT person");
  });

  it("refuses an empty attendee value", () => {
    const blank: PersonProposalDecision = { kind: "propose", name: "   ", sharedSurname: [], looksLikeHandle: false };
    const plan = planPersonFromArchive(blank, answered, PEOPLE, VERTICALS, DAY);
    expect(plan.kind === "refused" && plan.reason).toBe("name-required");
  });
});

describe("planPeopleFromArchive — two proposals from ONE read", () => {
  const groth: PersonProposalDecision = {
    kind: "propose",
    name: "Ryan Groth",
    sharedSurname: [],
    looksLikeHandle: false,
  };

  it("does NOT hand both proposals the same record number", () => {
    // Measured live on 2026-08-07 BEFORE this existed: both came back P-1023.
    const plans = planPeopleFromArchive([josephGreen, groth], () => answered, PEOPLE, VERTICALS, DAY);
    const ids = plans.map((p) => (p.kind === "create" ? p.person.id : p.reason));
    expect(plans.every((p) => p.kind === "create")).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });

  it("planned separately, they WOULD collide — this is the defect the plural form exists for", () => {
    const a = planPersonFromArchive(josephGreen, answered, PEOPLE, VERTICALS, DAY);
    const b = planPersonFromArchive(groth, answered, PEOPLE, VERTICALS, DAY);
    if (a.kind !== "create" || b.kind !== "create") throw new Error("expected creates");
    expect(a.person.id).toBe(b.person.id);
  });

  it("a refusal reserves nothing — ids are not burned on unanswered questions", () => {
    const plans = planPeopleFromArchive(
      [dixHandle, josephGreen],
      () => answered,
      PEOPLE,
      VERTICALS,
      DAY
    );
    expect(plans[0].kind).toBe("refused");
    const solo = planPersonFromArchive(josephGreen, answered, PEOPLE, VERTICALS, DAY);
    if (plans[1].kind !== "create" || solo.kind !== "create") throw new Error("expected creates");
    expect(plans[1].person.id).toBe(solo.person.id);
  });

  it("two people with the same name-slug get distinct handles as well as distinct ids", () => {
    const twin: PersonProposalDecision = {
      kind: "propose",
      name: "Ryan  Groth",
      sharedSurname: [],
      looksLikeHandle: false,
    };
    // Same slug source, but the CRM holds neither, so both are proposable in one pass.
    const plans = planPeopleFromArchive([groth, twin], () => answered, PEOPLE, VERTICALS, DAY);
    const handles = plans.map((p) => (p.kind === "create" ? p.person.legacySlug : "refused"));
    expect(handles).toEqual(["ryan-groth", "ryan-groth-2"]);
  });

  it("refuses an empty attendee value (plural form)", () => {
    const blank: PersonProposalDecision = { kind: "propose", name: "   ", sharedSurname: [], looksLikeHandle: false };
    const plan = planPersonFromArchive(blank, answered, PEOPLE, VERTICALS, DAY);
    expect(plan.kind === "refused" && plan.reason).toBe("name-required");
  });
});
