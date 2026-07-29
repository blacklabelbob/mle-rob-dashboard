import { describe, expect, it } from "vitest";
import {
  mergedPerson,
  personFromNewRow,
  planPeopleForEmail,
} from "../comms/emailPeople";
import { buildGraphIndex } from "../comms/emailGraphIndex";
import { partiesOf, splitAddressList } from "../n8nEmail";
import type { NetworkData, Person } from "../types";

const person = (over: Partial<Person> = {}): Person => ({
  id: "p",
  name: "P",
  verticalId: "roofing",
  status: "unlit",
  signed: false,
  keyDates: {},
  phaseOne: "not-started",
  ...over,
});

const ROOFCO = person({
  id: "roofco",
  name: "RoofCo",
  entityKind: "company",
  website: "https://roofco.com",
  nodeType: "client",
});

const network = (people: Person[]): NetworkData =>
  ({ people, edges: [], verticals: [{ id: "roofing", name: "Roofing", color: "#f00" }] }) as NetworkData;

function plan(people: Person[], parties: { address: string; raw?: string }[], over: Partial<Parameters<typeof planPeopleForEmail>[0]> = {}) {
  const data = network(people);
  return planPeopleForEmail({
    data,
    parties,
    direction: "outbound",
    index: buildGraphIndex(data),
    capturedAtISO: "2026-07-27",
    ...over,
  });
}

describe("planPeopleForEmail — creation", () => {
  it("creates the human behind a company we already know", () => {
    const { writes, skipped } = plan(
      [ROOFCO],
      [{ address: "dana@roofco.com", raw: "Dana Reyes <dana@roofco.com>" }]
    );
    expect(skipped).toEqual([]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      kind: "create",
      address: "dana@roofco.com",
      person: { id: "P-1001", legacySlug: "dana-reyes", name: "Dana Reyes", orgId: "roofco", business: "RoofCo" },
    });
  });

  // Q70: this is the case the id accumulator exists for, and the case that proved the old
  // scheme wrong. Two strangers, one display name. They now get two NUMBERS; only the
  // cosmetic handle still carries the "-2".
  it("never mints two people onto one id — two strangers get two record numbers", () => {
    const { writes } = plan(
      [ROOFCO],
      [
        { address: "dana@roofco.com", raw: "Dana Reyes <dana@roofco.com>" },
        { address: "d.reyes@roofco.com", raw: "Dana Reyes <d.reyes@roofco.com>" },
      ]
    );
    expect(writes.map((w) => w.person.id)).toEqual(["P-1001", "P-1002"]);
    expect(writes.map((w) => w.person.legacySlug)).toEqual(["dana-reyes", "dana-reyes-2"]);
  });

  it("collides with ids already in the CRM, not just with this email's", () => {
    const { writes } = plan(
      [ROOFCO, person({ id: "dana-reyes", name: "Dana Reyes (someone else)" })],
      [{ address: "dana@roofco.com", raw: "Dana Reyes <dana@roofco.com>" }]
    );
    // The existing row is a pre-Q70 slug; it raises no number, so the new row takes the floor.
    expect(writes[0].person.id).toBe("P-1001");
    expect(writes[0].person.legacySlug).toBe("dana-reyes-2");
  });

  it("plans one write for an address repeated across to and cc", () => {
    const { writes } = plan(
      [ROOFCO],
      [
        { address: "dana@roofco.com", raw: "Dana Reyes <dana@roofco.com>" },
        { address: "DANA@roofco.com", raw: "<DANA@roofco.com>" },
      ]
    );
    expect(writes).toHaveLength(1);
  });

  it("a created row carries no money or commitment state", () => {
    const { writes } = plan([ROOFCO], [{ address: "dana@roofco.com", raw: "Dana <dana@roofco.com>" }]);
    const p = writes[0].person;
    expect(p.signed).toBe(false);
    expect(p.quotedAmount).toBeUndefined();
    expect(p.keyDates).toEqual({ met: "2026-07-27" });
    expect(p.phaseOne).toBe("not-started");
    expect(p.nodeType).toBe("lead");
  });

  it("refuses the addresses inc.10 refuses, and says which rung", () => {
    const { writes, skipped } = plan(
      [ROOFCO],
      [
        { address: "billing@roofco.com", raw: "Billing <billing@roofco.com>" },
        { address: "stranger@nowhere-known.com", raw: "S <stranger@nowhere-known.com>" },
      ]
    );
    expect(writes).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(["role-account", "no-anchor"]);
  });
});

describe("planPeopleForEmail — merge", () => {
  const dana = person({
    id: "dana-reyes",
    name: "Dana Reyes",
    email: "dana@roofco.com",
    keyDates: { met: "2026-05-01", signed: "2026-06-01" },
    quotedAmount: 12000,
    signed: true,
  });

  it("fills only the blanks and never touches money or commitment", () => {
    const { writes } = plan(
      [ROOFCO, person({ ...dana, orgId: undefined, business: undefined })],
      [{ address: "dana@roofco.com", raw: "Danielle Reyes-Smith <dana@roofco.com>" }]
    );
    expect(writes).toHaveLength(1);
    const w = writes[0];
    expect(w.kind).toBe("merge");
    expect(w.person).toMatchObject({
      name: "Dana Reyes", // the header name never renames a person Rob typed
      orgId: "roofco",
      business: "RoofCo",
      quotedAmount: 12000,
      signed: true,
    });
    expect(w.person.keyDates).toEqual({ met: "2026-05-01", signed: "2026-06-01" });
  });

  it("moves met backwards on older evidence, never forwards", () => {
    // Fully filled apart from `met`, so the date is the only candidate fill.
    const filled = person({ ...dana, orgId: "roofco", business: "RoofCo" });
    const older = plan([ROOFCO, filled], [{ address: "dana@roofco.com" }], {
      emailDateISO: "2026-02-14T09:00:00Z",
    });
    expect(older.writes[0].fills).toEqual({ met: "2026-02-14" });
    expect(older.writes[0].person.keyDates.met).toBe("2026-02-14");

    const newer = plan([ROOFCO, filled], [{ address: "dana@roofco.com" }], {
      emailDateISO: "2026-07-20T09:00:00Z",
    });
    expect(newer.writes).toEqual([]);
    expect(newer.skipped[0].reason).toBe("nothing-to-merge");
  });

  it("merges a person once even when two of their addresses are on the thread", () => {
    const twoAddresses = person({ ...dana, email: undefined, orgId: undefined });
    const data = network([ROOFCO, twoAddresses]);
    const index = buildGraphIndex(data);
    index.personIdByEmail.set("d.reyes@roofco.com", "dana-reyes");
    index.personIdByEmail.set("dana@roofco.com", "dana-reyes");
    const { writes, skipped } = planPeopleForEmail({
      data,
      parties: [{ address: "dana@roofco.com" }, { address: "d.reyes@roofco.com" }],
      direction: "outbound",
      index,
      capturedAtISO: "2026-07-27",
    });
    expect(writes).toHaveLength(1);
    expect(skipped[0].detail).toContain("already being merged");
  });

  it("never anchors a merge to a contested or generic domain", () => {
    const gmail = person({ ...dana, email: "dana@gmail.com", orgId: undefined, business: undefined });
    const data = network([ROOFCO, gmail]);
    const index = buildGraphIndex(data);
    index.orgIdByDomain.set("gmail.com", "roofco"); // a generic domain that slipped in
    const generic = planPeopleForEmail({
      data,
      parties: [{ address: "dana@gmail.com" }],
      direction: "outbound",
      index,
      capturedAtISO: "2026-07-27",
    });
    expect(generic.writes.find((w) => w.kind === "merge")?.fills.orgId).toBeUndefined();

    const contestedData = network([ROOFCO, person({ ...dana, orgId: undefined, business: undefined })]);
    const contestedIndex = buildGraphIndex(contestedData);
    contestedIndex.contestedDomains.add("roofco.com");
    const contested = planPeopleForEmail({
      data: contestedData,
      parties: [{ address: "dana@roofco.com" }],
      direction: "outbound",
      index: contestedIndex,
      capturedAtISO: "2026-07-27",
    });
    expect(contested.writes.find((w) => w.kind === "merge")?.fills.orgId).toBeUndefined();
  });

  it("does not mutate the snapshot row it merges", () => {
    const row = person({ ...dana, orgId: undefined });
    plan([ROOFCO, row], [{ address: "dana@roofco.com" }], { emailDateISO: "2026-01-01T00:00:00Z" });
    expect(row.orgId).toBeUndefined();
    expect(row.keyDates.met).toBe("2026-05-01");
  });
});

describe("mergedPerson / personFromNewRow", () => {
  it("fills nothing when fills are empty", () => {
    const row = person({ id: "x", email: "x@y.com" });
    expect(mergedPerson(row, {})).toEqual(row);
  });

  it("keeps every field the row already had", () => {
    const row = person({ id: "x", phone: "555", role: "Owner", notes: "typed by Rob" });
    const out = mergedPerson(row, { email: "x@y.com" });
    expect(out).toMatchObject({ phone: "555", role: "Owner", notes: "typed by Rob", email: "x@y.com" });
  });

  it("personFromNewRow sets the empty money state explicitly", () => {
    const p = personFromNewRow({
      id: "a",
      name: "A",
      email: "a@b.com",
      orgId: "b",
      verticalId: "roofing",
      entityKind: "person",
      nodeType: "lead",
      status: "unlit",
      metISO: "2026-07-27",
      notes: "n",
    });
    expect(p).toMatchObject({ signed: false, keyDates: { met: "2026-07-27" }, phaseOne: "not-started" });
    expect("quotedAmount" in p).toBe(false);
  });
});

describe("partiesOf / splitAddressList", () => {
  it("keeps the display name through a comma inside quotes", () => {
    expect(splitAddressList('"Reyes, Dana" <dana@roofco.com>, sam@roofco.com')).toEqual([
      '"Reyes, Dana" <dana@roofco.com>',
      "sam@roofco.com",
    ]);
  });

  it("carries the raw header so the name survives to creation", () => {
    const parties = partiesOf({
      messageId: "m1",
      from: "Rob Acheson <rob@aivoicetech.io>",
      to: "Dana Reyes <dana@roofco.com>",
      cc: ["Sam <sam@roofco.com>"],
    });
    expect(parties).toEqual([
      { address: "rob@aivoicetech.io", raw: "Rob Acheson <rob@aivoicetech.io>" },
      { address: "dana@roofco.com", raw: "Dana Reyes <dana@roofco.com>" },
      { address: "sam@roofco.com", raw: "Sam <sam@roofco.com>" },
    ]);
  });

  it("drops header entries with no address at all", () => {
    expect(partiesOf({ messageId: "m", from: "undisclosed-recipients:;", to: "x@y.com" })).toEqual([
      { address: "x@y.com", raw: "x@y.com" },
    ]);
  });
});
