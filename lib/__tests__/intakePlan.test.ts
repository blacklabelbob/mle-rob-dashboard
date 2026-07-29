// PRD Task 5.1 planner: validated AIDRE/AIVA payload + ledger → exact plan
// (match-or-create person, deal pinned at INTAKE_STAGE, one intake activity).
// Covers: clean create, email/phone matches (normalization), name-only →
// CREATE (never auto-attach), demo exclusion, slug de-collision, contact-only
// fill whitelist (money structurally unreachable), vertical registry mapping,
// and full-plan determinism.
import { describe, expect, it } from "vitest";
import type { Person } from "../types";
import { INTAKE_STAGE, INTAKE_WORKED_EXAMPLES } from "../leads/intakePayload";
import type { LeadIntakePayload } from "../leads/intakePayload";
import { planLeadIntake } from "../leads/intakePlan";

const NOW = "2026-07-22T18:00:00.000Z";
const STAMP = "20260722180000";

const person = (o: Partial<Person> & { id: string; name: string }): Person => ({
  verticalId: "roofing",
  status: "warm",
  signed: false,
  keyDates: {},
  phaseOne: "not-started",
  ...o,
});

const VERTICALS = [
  { id: "roofing", name: "Roofing" },
  { id: "real-estate", name: "Real Estate & Title" },
];

const payload = (o: Partial<LeadIntakePayload> = {}): LeadIntakePayload => ({
  product: "aidre",
  contact: { name: "Dana Storm", email: "dana@stormroof.com", phone: "(941) 555-0101" },
  company: "Storm Roof LLC",
  vertical: "Roofing",
  source_context: INTAKE_WORKED_EXAMPLES.aidre.source_context,
  ...o,
});

describe("planLeadIntake — create path", () => {
  it("new lead → record-number person carrying its handle, deal at INTAKE_STAGE, activity carrying source_context + product", () => {
    const plan = planLeadIntake(payload(), [], VERTICALS, NOW);
    expect(plan.person.action).toBe("create");
    if (plan.person.action !== "create") return;
    const p = plan.person.record;
    // Q70: the id is a record number, and the name-slug survives only as the lookup
    // handle. Both halves asserted — an id alone would pass with the handle dropped
    // on the floor, which is exactly how inc.8's defect stayed invisible.
    expect(p.id).toBe("P-1001");
    expect(p.legacySlug).toBe("dana-storm");
    expect(p.business).toBe("Storm Roof LLC");
    expect(p.verticalId).toBe("roofing"); // free text "Roofing" → registry id
    expect(p.notes).toBe("[lead: aidre]");
    expect(p.signed).toBe(false);
    expect(plan.deal.stage).toBe(INTAKE_STAGE);
    expect(plan.deal.personId).toBe("P-1001");
    expect(plan.deal.id).toBe(`lead-P-1001-${STAMP}`);
    expect(plan.activity.dealId).toBe(plan.deal.id);
    expect(plan.activity.source).toBe("aidre");
    expect(plan.activity.sourceContext.product).toBe("aidre");
    expect(plan.activity.sourceContext.source_type).toBe(
      INTAKE_WORKED_EXAMPLES.aidre.source_context.source_type
    );
    expect(plan.verticalUnmatched).toBeUndefined();
  });

  it("aiva product rides the generic api activity source", () => {
    const plan = planLeadIntake(payload({ product: "aiva" }), [], VERTICALS, NOW);
    expect(plan.activity.source).toBe("api");
    expect(plan.activity.sourceContext.product).toBe("aiva");
  });

  it("a same-named PRE-0031 row collides on the handle only — the id is never a suffix; unmatched vertical reported, never guessed", () => {
    const plan = planLeadIntake(
      payload({ vertical: "Underwater Basketweaving" }),
      [person({ id: "dana-storm", name: "Dana Storm (other)" })],
      VERTICALS,
      NOW
    );
    if (plan.person.action !== "create") throw new Error("expected create");
    // The pre-0031 row carries its handle in its id, so the handle seed sees it and
    // de-collides. The IDENTITY does not: this second Dana is `P-1001`, not
    // `dana-storm-2` — she is no longer permanently labelled a copy of the first.
    expect(plan.person.record.id).toBe("P-1001");
    expect(plan.person.record.legacySlug).toBe("dana-storm-2");
    expect(plan.person.record.verticalId).toBe("");
    expect(plan.verticalUnmatched).toBe("Underwater Basketweaving");
  });

  it("a POST-0031 ledger de-collides the handle against handles, not against record numbers", () => {
    // The half-fix inc.4 caught, in this path: seeding the handle set from `p.id`
    // would compare `dana-storm` against `P-1001` — never equal — so the second
    // Dana would be minted `dana-storm` too and `people_legacy_slug_key` would
    // reject the insert with nothing on screen tying it to naming.
    const plan = planLeadIntake(
      payload(),
      [person({ id: "P-1001", name: "Dana Storm (other)", legacySlug: "dana-storm" })],
      VERTICALS,
      NOW
    );
    if (plan.person.action !== "create") throw new Error("expected create");
    expect(plan.person.record.id).toBe("P-1002");
    expect(plan.person.record.legacySlug).toBe("dana-storm-2");
  });

  it("name-only collision CREATES a new person (never auto-attach)", () => {
    const ledger = [person({ id: "dana-storm", name: "Dana Storm", email: "other@else.com" })];
    const plan = planLeadIntake(payload(), ledger, VERTICALS, NOW);
    expect(plan.person.action).toBe("create");
  });

  it("demo records never match", () => {
    const ledger = [
      person({ id: "demo-dana", name: "Dana Storm (DEMO)", email: "dana@stormroof.com" }),
    ];
    const plan = planLeadIntake(payload(), ledger, VERTICALS, NOW);
    expect(plan.person.action).toBe("create");
  });
});

describe("planLeadIntake — match path", () => {
  it("email match (case-insensitive) attaches; empty contact fields fill, money unreachable", () => {
    const ledger = [
      person({ id: "dana-s", name: "D. Storm", email: "DANA@StormRoof.com", quotedAmount: 7000 }),
    ];
    const plan = planLeadIntake(payload(), ledger, VERTICALS, NOW);
    expect(plan.person.action).toBe("match");
    if (plan.person.action !== "match") return;
    expect(plan.person.match.personId).toBe("dana-s");
    expect(plan.person.match.signals).toContain("email-exact");
    // fills: phone + role/business were empty on the ledger row → filled;
    // whitelist keys only — no money/status key can ever appear.
    expect(plan.person.match.fills.phone).toBe("(941) 555-0101");
    expect(plan.person.match.fills.business).toBe("Storm Roof LLC");
    for (const k of Object.keys(plan.person.match.fills)) {
      expect(["phone", "email", "role", "business"]).toContain(k);
    }
    expect(plan.deal.personId).toBe("dana-s");
  });

  it("phone match across formats attaches; occupied fields NOT overwritten", () => {
    const ledger = [
      person({ id: "d2", name: "Dana", phone: "941-555-0101", business: "Existing Biz" }),
    ];
    const plan = planLeadIntake(payload({ contact: { name: "Dana Storm", phone: "+1 (941) 555-0101" } }), ledger, VERTICALS, NOW);
    if (plan.person.action !== "match") throw new Error("expected match");
    expect(plan.person.match.signals).toContain("phone-exact");
    expect(plan.person.match.fills.business).toBeUndefined(); // occupied stays
    expect(plan.person.match.fills.phone).toBeUndefined(); // occupied stays
  });

  it("multiple candidates pick deterministically (email beats phone, then smallest id)", () => {
    const ledger = [
      person({ id: "zz-phone", name: "Z", phone: "9415550101" }),
      person({ id: "aa-email", name: "A", email: "dana@stormroof.com" }),
    ];
    const plan = planLeadIntake(payload(), ledger, VERTICALS, NOW);
    if (plan.person.action !== "match") throw new Error("expected match");
    expect(plan.person.match.personId).toBe("aa-email");
  });
});

describe("planLeadIntake — determinism", () => {
  it("same input → JSON-identical plan (CR-3)", () => {
    const ledger = [person({ id: "dana-s", name: "D. Storm", email: "dana@stormroof.com" })];
    const a = planLeadIntake(payload(), ledger, VERTICALS, NOW);
    const b = planLeadIntake(payload(), ledger, VERTICALS, NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
