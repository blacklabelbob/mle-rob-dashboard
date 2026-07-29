import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error — plain .mjs module, no types (same pattern as proseRedact.test.ts)
import {
  DEFAULT_TARGETS,
  emailDomain,
  isReservedEmail,
  isReservedPhone,
  lineOf,
  profileForPath,
  scanStructural,
  walkStrings,
} from "../../scripts/pii-guard-structural.mjs";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("isReservedEmail", () => {
  it("accepts the RFC 2606 domains and their subdomains", () => {
    for (const v of ["a@example.com", "b@example.org", "c@example.net", "d@mail.example.com"]) {
      expect(isReservedEmail(v)).toBe(true);
    }
  });

  it("rejects every real domain — including ones the PROSE redactor allowlists", () => {
    // prose-redact.mjs keeps aivoicetech.io and the invented fixture domains,
    // because a doc has to stay readable. A DATA file has no such excuse: an
    // address that resolves is an address that can be mailed.
    for (const v of [
      "rob@aivoicetech.io",
      "x@roofco.com",
      "y@gmail.com",
      "z@notexample.com",
      "q@example.com.evil.net",
    ]) {
      expect(isReservedEmail(v)).toBe(false);
    }
  });

  it("emailDomain returns null for non-addresses", () => {
    for (const v of ["", "no-at-sign", "@leading", "trailing@", 42 as unknown as string]) {
      expect(emailDomain(v)).toBeNull();
    }
  });
});

describe("isReservedPhone", () => {
  it("accepts both fiction shapes this repo has used", () => {
    expect(isReservedPhone("+1 (555) 555-0100")).toBe(true); // current generator
    expect(isReservedPhone("+1 (555) 010-3921")).toBe(true); // older demo- rows
    expect(isReservedPhone("(555) 123-4567")).toBe(true);
  });

  it("rejects a real dialable number", () => {
    expect(isReservedPhone("+1 (239) 351-1405")).toBe(false);
    expect(isReservedPhone("415-555-0100")).toBe(false); // 555 in the EXCHANGE is not enough
  });

  it("rejects anything that is not a 10-digit national number", () => {
    for (const v of ["12345", "", "555-0100", "+44 20 7946 0958"]) {
      expect(isReservedPhone(v)).toBe(false);
    }
  });
});

describe("walkStrings", () => {
  it("reaches nested objects and arrays, and ONLY strings", () => {
    const found = walkStrings({ a: "x", b: [{ c: "y" }], n: 42, z: null, t: true });
    expect(found.map((f: { value: string }) => f.value).sort()).toEqual(["x", "y"]);
    expect(found.find((f: { value: string }) => f.value === "y").path).toBe("$.b[0].c");
  });
});

describe("lineOf", () => {
  it("is 1-indexed and null when absent", () => {
    expect(lineOf("a\nb\nneedle", "needle")).toBe(3);
    expect(lineOf("a\nb", "needle")).toBeNull();
  });
});

describe("profileForPath", () => {
  it("maps the known targets and defaults unknown paths to the STRICTER profile", () => {
    expect(profileForPath("data/network.json")).toBe("data");
    expect(profileForPath("MLE Internal Meetings/manifest.json")).toBe("manifest");
    // An unrecognised file must not get the permissive treatment by accident.
    expect(profileForPath("somewhere/else.json")).toBe("manifest");
  });
});

describe("Tier A against the REAL committed files", () => {
  it.each(DEFAULT_TARGETS)("%s is clean", (target: string) => {
    const { findings } = scanStructural(read(target), {
      profile: profileForPath(target),
      label: target,
    });
    expect(findings).toEqual([]);
  });

  it("actually inspected something — a scanner that walks nothing also reports clean", () => {
    const { counts } = scanStructural(read("data/network.json"), { profile: "data" });
    expect(counts.strings).toBeGreaterThan(500);
    expect(counts.emails).toBeGreaterThan(20);
    expect(counts.phones).toBeGreaterThan(20);
  });
});

describe("failure injection — the DoD", () => {
  it("pasting ONE real email into data/network.json fails", () => {
    const text = read("data/network.json").replace(
      '"email": "avery-dunmore@example.com"',
      '"email": "angela@omegatitlegroup.com"',
    );
    expect(text).toContain("omegatitlegroup.com"); // the mutation landed
    const { findings } = scanStructural(text, { profile: "data", label: "data/network.json" });
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("email");
    expect(findings[0].value).toBe("angela@omegatitlegroup.com");
    expect(findings[0].line).toBeGreaterThan(1);
  });

  it("pasting ONE real phone fails, and names the path it was found at", () => {
    const text = read("data/network.json").replace(
      '"phone": "+1 (555) 555-0100"',
      '"phone": "+1 (239) 351-1405"',
    );
    expect(text).toContain("351-1405");
    const { findings } = scanStructural(text, { profile: "data" });
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("phone");
    expect(findings[0].message).toMatch(/\$\.people\[0\]\.phone/);
  });

  it("catches an unformatted real number when the KEY says it is a phone", () => {
    const { findings } = scanStructural(
      JSON.stringify({ __synthetic: true, people: [{ phone: "2393511405" }] }),
      { profile: "data" },
    );
    expect(findings.map((f: { kind: string }) => f.kind)).toEqual(["phone"]);
  });

  it("dropping __synthetic fails the data profile", () => {
    const { findings } = scanStructural(read("data/crm.json").replace('"__synthetic": true', '"__synthetic": false'), {
      profile: "data",
    });
    expect(findings.map((f: { kind: string }) => f.kind)).toEqual(["marker"]);
  });

  it("the manifest profile rejects even a RESERVED address", () => {
    // Phase 1 item 5's promise was domains-only. `@example.com` is harmless but
    // would mean an attendee field came back — which is the shape being banned.
    const { findings } = scanStructural(
      JSON.stringify({ meetings: [{ organizer: "someone@example.com" }] }),
      { profile: "manifest" },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/no address of any kind/);
  });

  it("unparseable input is a finding, not a silent pass", () => {
    const { findings } = scanStructural("{ not json", { profile: "data" });
    expect(findings.map((f: { kind: string }) => f.kind)).toEqual(["unparseable"]);
  });
});

describe("zero false positives by construction", () => {
  it("record ids, money and coordinates are NUMBERS and therefore unreachable", () => {
    const { findings, counts } = scanStructural(
      JSON.stringify({
        __synthetic: true,
        invoiceNumber: 2100010339,
        amount: 2663.84375,
        viewBox: [0, 0, 2663.84375, 634.171875],
      }),
      { profile: "data" },
    );
    expect(findings).toEqual([]);
    expect(counts.phones).toBe(0);
  });

  it("a stringified record id is not mistaken for a phone", () => {
    const { findings } = scanStructural(
      JSON.stringify({ __synthetic: true, deals: [{ id: "2100010339", ref: "0001594805" }] }),
      { profile: "data" },
    );
    expect(findings).toEqual([]);
  });

  it("an ISO timestamp is not mistaken for a phone", () => {
    const { findings } = scanStructural(
      JSON.stringify({ __synthetic: true, at: "2026-07-29T18:00:00.000Z" }),
      { profile: "data" },
    );
    expect(findings).toEqual([]);
  });
});
