import { describe, expect, it } from "vitest";
import { collectDedupRows, isDemoRecord, pairKey } from "@/lib/dedup/run";

describe("collectDedupRows (Task 3.5 queue shaping)", () => {
  it("matches within people and produces upsertable rows", () => {
    const rows = collectDedupRows({
      people: [
        { id: "a", name: "Jon Polk", email: "Jon@Polk.com" },
        { id: "b", name: "Jonathan Polk", email: "jon@polk.com" },
      ],
      orgs: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pair_key: "person:a:b",
      a_id: "a",
      b_id: "b",
      kind: "person",
      confidence: "high",
    });
    expect(rows[0].signals).toEqual(["email-exact"]);
    expect(rows[0].evidence).toHaveLength(1);
  });

  it("never pairs a person with an org, even on identical phone/email", () => {
    const rows = collectDedupRows({
      people: [{ id: "jon", name: "Jon Polk", phone: "239-555-0100", email: "x@y.com" }],
      orgs: [{ id: "polk-ind", name: "Polk Industries", phone: "(239) 555-0100", email: "x@y.com" }],
    });
    expect(rows).toEqual([]);
  });

  it("matches orgs within orgs with kind=org", () => {
    const rows = collectDedupRows({
      people: [],
      orgs: [
        { id: "prop-1", name: "PropLogix, LLC." },
        { id: "prop-2", name: "proplogix llc" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("org");
    expect(rows[0].pair_key).toBe("org:prop-1:prop-2");
    expect(rows[0].confidence).toBe("review"); // name-only
  });

  it("excludes demo records by id prefix and node_type", () => {
    const rows = collectDedupRows({
      people: [
        { id: "demo-jake", name: "Jake Demo", email: "same@x.com" },
        { id: "real-1", name: "Real One", email: "same@x.com" },
        { id: "real-2", name: "Other Name", email: "same@x.com", node_type: "demo" },
      ],
      orgs: [],
    });
    expect(rows).toEqual([]); // only real-1 survives the filter — no pair
  });

  it("is deterministic and idempotent on re-run (same keys, same order)", () => {
    const input = {
      people: [
        { id: "b", name: "Same Person", phone: "9415550123" },
        { id: "a", name: "Different Name", phone: "1-941-555-0123" },
      ],
      orgs: [],
    };
    const first = collectDedupRows(input);
    const second = collectDedupRows(input);
    expect(first).toEqual(second);
    expect(first[0].pair_key).toBe("person:a:b"); // canonical a<b regardless of input order
  });
});

describe("isDemoRecord / pairKey", () => {
  it("flags demo-* ids and node_type demo only", () => {
    expect(isDemoRecord({ id: "demo-x", name: "" })).toBe(true);
    expect(isDemoRecord({ id: "x", name: "", node_type: "demo" })).toBe(true);
    expect(isDemoRecord({ id: "x", name: "", node_type: "person" })).toBe(false);
  });

  it("namespaces pair keys by kind", () => {
    const pair = { aId: "a", bId: "b", signals: [], confidence: "review" as const, evidence: [] };
    expect(pairKey("person", pair)).not.toBe(pairKey("org", pair));
  });
});
