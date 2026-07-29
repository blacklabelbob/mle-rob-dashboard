import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DENYLIST_SALT,
  buildDenylist,
  extractCandidates,
  hashSecret,
  isDeniableContact,
  labelFor,
  loadDenylist,
  normalizeEmail,
  normalizePhone,
  scanDenylist,
} from "../../scripts/pii-guard-denylist.mjs";

// Fiction, on purpose: this suite must not itself become the thing it guards
// against. Every "real" contact below is invented and absent from the committed
// denylist; the tests build their own denylist from these instead.
const FAKE_EMAIL = "dana@northgatetitleco.test";
const FAKE_PHONE = "239-201-4477";
const SOURCE = `contact: ${FAKE_EMAIL}\ndirect: ${FAKE_PHONE}\n`;
const DENY = buildDenylist([SOURCE]);

describe("normalization", () => {
  it("lowercases addresses so a case variant still matches", () => {
    expect(normalizeEmail("Rob@Example.COM")).toBe("rob@example.com");
    expect(normalizeEmail("not an address")).toBeNull();
    expect(normalizeEmail(42 as unknown as string)).toBeNull();
  });

  it("reduces every phone format to the same 10 digits", () => {
    // This is what makes the denylist survive reformatting — a re-paste in a
    // different style is the likely way a redacted number comes back.
    for (const shape of [
      "(239) 201-4477",
      "239.201.4477",
      "239-201-4477",
      "+1 239 201 4477",
      "1-239-201-4477",
    ]) {
      expect(normalizePhone(shape)).toBe("2392014477");
    }
    expect(normalizePhone("2100010339")).toBe("2100010339"); // shape-only; deniability is a separate question
    expect(normalizePhone("12345")).toBeNull();
  });
});

describe("hashing", () => {
  it("separates the two kinds so an email can never wear a phone's label", () => {
    expect(hashSecret("email", "x")).not.toBe(hashSecret("phone", "x"));
  });

  it("changes with the salt", () => {
    expect(hashSecret("email", "a@b.com")).not.toBe(hashSecret("email", "a@b.com", "other"));
  });
});

describe("labels keep the organisation and drop the individual", () => {
  it("labels an email by domain only", () => {
    expect(labelFor("email", "dana@northgatetitleco.test")).toBe(
      "real contact · email @northgatetitleco.test",
    );
  });

  it("labels a phone by area code only", () => {
    expect(labelFor("phone", "2392014477")).toBe("real contact · phone, area 239");
  });

  it("never contains the secret it describes", () => {
    // The labels are committed. If one carried the mailbox or the full number,
    // the denylist would be the plaintext contact list it exists to replace.
    for (const label of Object.values(DENY.entries) as string[]) {
      expect(label).not.toContain("dana@");
      expect(label).not.toContain("201-4477");
      expect(label).not.toContain("2014477");
    }
  });
});

describe("scanDenylist", () => {
  it("fires on a re-pasted known contact and names the line", () => {
    const text = `line one\nline two\nemail: ${FAKE_EMAIL}\n`;
    const { findings } = scanDenylist(text, { denylist: DENY, label: "doc.md" });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: "doc.md", line: 3, kind: "email" });
    expect(findings[0].message).toContain("@northgatetitleco.test");
  });

  it("fires on the SAME number written in a different format", () => {
    const { findings } = scanDenylist(`call (239) 201-4477 today`, { denylist: DENY });
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("phone");
  });

  it("is silent on a contact nobody has written down", () => {
    const { findings, counts } = scanDenylist("reach me at nobody@unknown.test", {
      denylist: DENY,
    });
    expect(findings).toHaveLength(0);
    // Distinguishes "scanned and passed" from "found nothing to scan" — a guard
    // whose extractor silently broke would report zero findings either way.
    expect(counts.candidates).toBe(1);
  });

  it("treats an empty denylist as vacuous rather than as a pass signal", () => {
    const { findings, counts } = scanDenylist(SOURCE, { denylist: { entries: {} } });
    expect(findings).toHaveLength(0);
    expect(counts.candidates).toBe(2);
  });
});

describe("false-positive traps that are actually in this repo", () => {
  it("does not read SVG coordinates as phone numbers", () => {
    // Phase 1 item 7: `viewBox="0 0 2663.84375 634.171875"` contains the
    // NANP-valid, phone-shaped substring "375 634.1718". A match may not sit
    // flush against a digit or a decimal point, so this is impossible by
    // construction rather than by exception list.
    const svg = `<svg viewBox="0 0 2663.84375 634.171875"><path d="M 239.201 4477.5"/></svg>`;
    expect(extractCandidates(svg).filter((c) => c.kind === "phone")).toHaveLength(0);
  });

  it("passes the real ARCHITECTURE-ATLAS.html untouched", () => {
    const atlas = readFileSync("docs/ARCHITECTURE-ATLAS.html", "utf8");
    const { findings } = scanDenylist(atlas, { denylist: loadDenylist(), label: "atlas" });
    expect(findings).toHaveLength(0);
  });

  it("passes the generated data files untouched", () => {
    const denylist = loadDenylist();
    for (const file of ["data/network.json", "data/crm.json"]) {
      const { findings } = scanDenylist(readFileSync(file, "utf8"), { denylist, label: file });
      expect(findings, `${file} should hold no known-real contact`).toHaveLength(0);
    }
  });
});

describe("the build inherits the prose redactor's allowlist", () => {
  it("never denies Rob's own published address", () => {
    // It lives in production code (lib/esign/sender.ts, lib/n8nEmail.ts) and 27
    // other tracked files. Denying it would mean 29 findings clearable only by
    // deleting working code — which is how a guard gets switched off.
    expect(isDeniableContact("email", "rob@aivoicetech.io")).toBe(false);
    const built = buildDenylist(["ping rob@aivoicetech.io"]);
    expect(Object.keys(built.entries)).toHaveLength(0);
  });

  it("never denies the fiction blocks the synthetic seed emits", () => {
    const built = buildDenylist(["p-1001@example.com called +1 (555) 555-0142"]);
    expect(Object.keys(built.entries)).toHaveLength(0);
  });

  it("does deny an ordinary third-party contact", () => {
    expect(isDeniableContact("email", "dana@northgatetitleco.test")).toBe(true);
    expect(isDeniableContact("phone", "2392014477")).toBe(true);
  });
});

describe("the committed denylist", () => {
  const committed = loadDenylist();

  it("contains hashes and labels only — never a plaintext contact", () => {
    const raw = readFileSync("security/pii-denylist.json", "utf8");
    expect(raw).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    // No 10-digit run anywhere: hashes are hex, so any such run would be a leak.
    expect(raw).not.toMatch(/(?<![\d.])\d{3}[-. ]\d{3}[-. ]\d{4}(?![\d.])/);
  });

  it("has real content, so a passing scan is not vacuous", () => {
    expect(Object.keys(committed.entries).length).toBeGreaterThan(20);
    expect(committed.salt).toBe(DENYLIST_SALT);
    expect(committed.algorithm).toBe("sha256");
  });

  it("is byte-stable across rebuilds from the same input", () => {
    // Otherwise every rebuild is an unreviewable reordering diff.
    const a = buildDenylist([SOURCE, "second@northgatetitleco.test"]);
    const b = buildDenylist(["second@northgatetitleco.test", SOURCE]);
    expect(JSON.stringify(a.entries)).toBe(JSON.stringify(b.entries));
  });
});
