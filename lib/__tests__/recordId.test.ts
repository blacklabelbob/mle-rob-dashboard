import { describe, expect, it } from "vitest";
import {
  handleFor,
  idOrHandle,
  isOrgId,
  isPersonId,
  isRecordId,
  nextOrgId,
  nextPersonId,
  slugifyHandle,
} from "../recordId";

// Q70 inc.2 — the identity rule, tested at the seam that mints it.
//
// The case that matters most is the one the OLD scheme got wrong in production: two people
// with the same name. Under name-slugs the second became `dana-reyes-2`, which encodes
// arrival order as identity. Under record numbers they are simply two rows.

describe("record ids are numbers, never names", () => {
  it("mints from the sequence floor when nothing is taken", () => {
    expect(nextPersonId([])).toBe("P-1001");
    expect(nextOrgId([])).toBe("C-2001");
  });

  it("continues from the highest number already taken, not the count", () => {
    // Gaps are normal — rows get deleted. Counting would reissue a live id.
    expect(nextPersonId(["P-1001", "P-1005"])).toBe("P-1006");
    expect(nextOrgId(["C-2001", "C-2009", "C-2003"])).toBe("C-2010");
  });

  it("keeps people and orgs in separate number spaces", () => {
    // They meet in `edges`; one shared space would let an edge point at either table.
    expect(nextPersonId(["C-2999"])).toBe("P-1001");
    expect(nextOrgId(["P-1999"])).toBe("C-2001");
  });

  it("ignores pre-0031 slugs sitting in the taken set during cutover", () => {
    expect(nextPersonId(["caleb-green", "dana-reyes", "dana-reyes-2", "P-1004"])).toBe("P-1005");
    expect(nextPersonId(["caleb-green", "dana-reyes"])).toBe("P-1001");
  });

  it("THE DEFECT THIS REPLACES: two people with one name get two identities", () => {
    const taken = new Set<string>();
    const first = nextPersonId(taken);
    taken.add(first);
    const second = nextPersonId(taken);
    taken.add(second);

    expect(first).toBe("P-1001");
    expect(second).toBe("P-1002");
    expect(first).not.toBe(second);
    // Neither id contains any part of the name, so neither can be confused for the other
    // by anything reading it — which is the property entity resolution needs.
    for (const id of [first, second]) expect(id).not.toMatch(/dana|reyes/i);
    // And crucially: no "-2" suffix. Nothing marks the second person as a copy of the first.
    expect(second).not.toMatch(/-2$/);
  });

  it("is stable: minting over the same taken set twice gives the same answer", () => {
    const taken = ["P-1001", "P-1002"];
    expect(nextPersonId(taken)).toBe(nextPersonId(taken));
  });

  it("survives junk in the taken set without skipping or throwing", () => {
    expect(nextPersonId(["P-", "P-abc", "P-1002", "", "P"])).toBe("P-1003");
  });
});

describe("recognising an id", () => {
  it("tells a record id from a legacy slug", () => {
    expect(isPersonId("P-1001")).toBe(true);
    expect(isOrgId("C-2001")).toBe(true);
    expect(isRecordId("P-1001")).toBe(true);
    expect(isRecordId("C-2001")).toBe(true);

    for (const slug of ["caleb-green", "dana-reyes-2", "P-", "1001", "p-1001", "C_2001"]) {
      expect(isRecordId(slug), `${slug} must not read as a record id`).toBe(false);
    }
  });

  it("does not accept a person id as an org id, or the reverse", () => {
    expect(isOrgId("P-1001")).toBe(false);
    expect(isPersonId("C-2001")).toBe(false);
  });
});

describe("the human handle keeps old links alive", () => {
  it("reproduces the pre-0031 slug shape exactly", () => {
    expect(slugifyHandle("Caleb Green")).toBe("caleb-green");
    expect(slugifyHandle("The Title Base")).toBe("the-title-base");
    expect(slugifyHandle("O'Brien & Sons, Inc.")).toBe("o-brien-sons-inc");
  });

  it("falls back rather than ever producing an empty handle", () => {
    // A name of pure punctuation slugs to "" — an empty handle would collide with itself.
    expect(handleFor("!!!", "roofco", [])).toBe("roofco");
    expect(handleFor("", "", [])).toBe("record");
  });

  it("suffixes a COLLIDING HANDLE — which is now cosmetic, not identity", () => {
    // The "-2" still exists here, and that is fine: this string is a look-up key, and the
    // two rows already have distinct ids. Nothing keys a foreign key on this.
    expect(handleFor("Dana Reyes", "dana", new Set(["dana-reyes"]))).toBe("dana-reyes-2");
  });
});

describe("resolving what arrived off a URL", () => {
  it("routes a record id to `id` and anything else to `legacy_slug`", () => {
    expect(idOrHandle("P-1001")).toEqual({ column: "id", value: "P-1001" });
    expect(idOrHandle("C-2001")).toEqual({ column: "id", value: "C-2001" });
    // The old bookmark. It has to keep working forever.
    expect(idOrHandle("caleb-green")).toEqual({ column: "legacy_slug", value: "caleb-green" });
  });
});
