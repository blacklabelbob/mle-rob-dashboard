import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs generator, shared with the seed CLI and the drift guard
import {
  BASE_DATE,
  EMAIL_DOMAIN,
  SEED,
  buildEdges,
  buildNetwork,
  buildPeople,
  buildProjects,
  dateOffset,
  makeRng,
  serializeNetwork,
  syntheticPhone,
} from "../../scripts/seed-synthetic.mjs";

type Row = Record<string, unknown> & { id: string; name: string };

// Deliberately broader than the generator's own rules: anything address-shaped
// or phone-shaped, not just the formats we happen to emit. A DoD graded by the
// matcher that produced the data proves nothing.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<![\d.])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-]?(\d{4})(?![\d.])/g;

describe("determinism (Phase 2 DoD: two runs byte-identical)", () => {
  it("serializes identically across two independent builds", () => {
    expect(serializeNetwork(buildNetwork())).toBe(serializeNetwork(buildNetwork()));
  });

  it("is a function of the seed — a different seed gives different data", () => {
    expect(serializeNetwork(buildNetwork("some-other-seed"))).not.toBe(serializeNetwork(buildNetwork(SEED)));
  });

  it("makeRng replays the same stream for the same seed", () => {
    const a = makeRng("x");
    const b = makeRng("x");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("contains no clock-derived value — dates anchor to BASE_DATE", () => {
    expect(BASE_DATE).toBe("2026-07-01");
    expect(dateOffset(0)).toBe("2026-07-01");
    expect(dateOffset(-1)).toBe("2026-06-30");
    expect(dateOffset(31)).toBe("2026-08-01");
  });

  // Comments are stripped first: the header legitimately *says* "no Date.now()",
  // and a guard that a comment can trip gets weakened into uselessness.
  it("the generator's executable source calls neither Date.now() nor fetch (CR-3)", () => {
    const code = readFileSync(join(process.cwd(), "scripts", "seed-synthetic.mjs"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).toMatch(/buildNetwork/); // the strip didn't eat the file
    expect(code).not.toMatch(/Date\.now\(/);
    expect(code).not.toMatch(/\bfetch\(/);
  });
});

describe("zero real contact data by construction", () => {
  const data = buildNetwork();
  const text = serializeNetwork(data);

  it("every email sits on the RFC 2606 reserved domain", () => {
    const found = text.match(EMAIL_RE) ?? [];
    expect(found.length).toBeGreaterThan(0);
    for (const email of found) expect(email.endsWith(EMAIL_DOMAIN)).toBe(true);
  });

  it("every phone-shaped string is a reserved 555 number", () => {
    const found = text.match(PHONE_RE) ?? [];
    expect(found.length).toBeGreaterThan(0);
    for (const phone of found) expect(phone).toMatch(/^\+1 \(555\) 555-01\d{2}$/);
  });

  it("syntheticPhone stays inside the reserved 555-01XX line range", () => {
    for (let i = 0; i < 250; i++) expect(syntheticPhone(i)).toMatch(/^\+1 \(555\) 555-01\d{2}$/);
  });

  it("carries the __synthetic flag the banner and Tier A both read", () => {
    expect(data.__synthetic).toBe(true);
  });

  // The real ledger is still committed at this point in Phase 2. Checking against
  // it is only possible NOW; Phase 3's hashed Tier B denylist is the durable
  // version of this check, which is why this assertion is skipped, not failed,
  // once the file no longer holds real names.
  it("shares no name with the currently committed ledger", () => {
    const committed = JSON.parse(readFileSync(join(process.cwd(), "data", "network.json"), "utf8"));
    if (committed.__synthetic) return; // already replaced — Tier B owns this from here
    const realNames = new Set<string>(
      (committed.people as Row[]).map((p) => String(p.name).toLowerCase().replace(/\s*\(demo\)\s*/i, "").trim()),
    );
    for (const person of data.people as Row[]) {
      expect(realNames.has(String(person.name).toLowerCase())).toBe(false);
    }
  });
});

describe("shape matches NetworkData", () => {
  const data = buildNetwork();

  it("emits all four collections at real-ledger cardinality", () => {
    expect(data.people).toHaveLength(41);
    expect(data.edges).toHaveLength(47);
    expect(data.verticals).toHaveLength(8);
    expect(data.projects).toHaveLength(12);
  });

  it("mints Q70 record-number ids and keeps a legacySlug on every row", () => {
    const people = data.people as Row[];
    const persons = people.filter((p) => p.entityKind === "person");
    const orgs = people.filter((p) => p.entityKind === "company");
    expect(persons).toHaveLength(22);
    expect(orgs).toHaveLength(19);
    for (const p of persons) expect(p.id).toMatch(/^P-\d{4}$/);
    for (const o of orgs) expect(o.id).toMatch(/^C-\d{4}$/);
    for (const p of people) expect(String(p.legacySlug)).toMatch(/^[a-z0-9-]+$/);
  });

  it("has unique ids across people, edges and projects", () => {
    for (const collection of [data.people, data.edges, data.projects] as Row[][]) {
      expect(new Set(collection.map((r) => r.id)).size).toBe(collection.length);
    }
  });

  it("has no dangling edge — every endpoint resolves to a person", () => {
    const ids = new Set((data.people as Row[]).map((p) => p.id));
    for (const edge of data.edges as { fromId: string; toId: string }[]) {
      expect(ids.has(edge.fromId)).toBe(true);
      expect(ids.has(edge.toId)).toBe(true);
      expect(edge.fromId).not.toBe(edge.toId);
    }
  });

  it("points every person at a vertical that exists", () => {
    const verticalIds = new Set((data.verticals as Row[]).map((v) => v.id));
    for (const person of data.people as Row[]) expect(verticalIds.has(String(person.verticalId))).toBe(true);
  });

  it("never claims a signed date on an unsigned record", () => {
    for (const person of data.people as (Row & { signed: boolean; keyDates: { signed?: string } })[]) {
      if (!person.signed) expect(person.keyDates.signed).toBeUndefined();
    }
  });

  it("keeps builders independently callable for the drift guard", () => {
    const rng = makeRng(SEED);
    const people = buildPeople(rng);
    expect(buildEdges(makeRng(SEED), people).length).toBe(47);
    expect(buildProjects(makeRng(SEED)).length).toBe(12);
  });
});
