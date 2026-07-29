import { describe, expect, it } from "vitest";
import {
  ALLOWLIST_PATH,
  ALLOWLIST_SALT,
  applyAllowlist,
  applyAllowlistToRun,
  fingerprintFinding,
  formatStale,
  lineTextAt,
  loadAllowlist,
} from "../../scripts/pii-guard-allowlist.mjs";

// Fiction, on purpose — same rule as the denylist suite: this file must not
// become the thing the guard exists to stop. `.invalid` is RFC 2606 (never
// resolvable) and area code 999 is permanently unassignable in the NANP.
const CONTACT = "dana@northgate.invalid";
const PHONE = "999-201-4477";

const SOURCE = ["# notes", `worked example: ${CONTACT}`, `and a number ${PHONE}`, "end"].join("\n");

const finding = (over: Record<string, unknown> = {}) => ({
  file: "docs/example.md",
  line: 2,
  kind: "email",
  value: CONTACT,
  message: "known real contact",
  ...over,
});

const allowlistOf = (...hashes: string[]) => ({
  salt: ALLOWLIST_SALT,
  algorithm: "sha256",
  entries: Object.fromEntries(hashes.map((h) => [h, { reason: "worked example, reviewed" }])),
});

describe("fingerprint composition", () => {
  it("reads the line's content out of the source rather than trusting the caller", () => {
    expect(lineTextAt(SOURCE, 2)).toBe(`worked example: ${CONTACT}`);
    expect(lineTextAt(SOURCE, 99)).toBe("");
  });

  it("ignores indentation but not content", () => {
    const indented = SOURCE.replace("worked example", "    worked example");
    expect(fingerprintFinding(finding(), { sourceText: indented })).toBe(
      fingerprintFinding(finding(), { sourceText: SOURCE }),
    );
  });

  it("separates two findings that share one line", () => {
    const oneLine = `contact ${CONTACT} or ${PHONE}`;
    const asEmail = fingerprintFinding(finding({ line: 1 }), { sourceText: oneLine });
    const asPhone = fingerprintFinding(finding({ line: 1, kind: "phone", value: PHONE }), {
      sourceText: oneLine,
    });
    expect(asEmail).not.toBe(asPhone);
  });

  it("is pinned to the file, so moving the text is a new decision", () => {
    const here = fingerprintFinding(finding(), { sourceText: SOURCE });
    const there = fingerprintFinding(finding({ file: "docs/moved.md" }), { sourceText: SOURCE });
    expect(there).not.toBe(here);
  });

  it("is NOT pinned to the line number — inserting text above must not expire it", () => {
    const shifted = `> a new blockquote\n${SOURCE}`;
    const before = fingerprintFinding(finding({ line: 2 }), { sourceText: SOURCE });
    const after = fingerprintFinding(finding({ line: 3 }), { sourceText: shifted });
    expect(lineTextAt(shifted, 3)).toBe(lineTextAt(SOURCE, 2)); // the mutation landed
    expect(after).toBe(before);
  });
});

describe("applying the allowlist", () => {
  it("excuses a fingerprinted finding and carries its reason", () => {
    const hash = fingerprintFinding(finding(), { sourceText: SOURCE });
    const out = applyAllowlist([finding()], { allowlist: allowlistOf(hash), sourceText: SOURCE });
    expect(out.findings).toHaveLength(0);
    expect(out.allowed).toHaveLength(1);
    expect(out.allowed[0].reason).toBe("worked example, reviewed");
    expect(out.stale).toHaveLength(0);
  });

  it("THE DoD — an allowlisted finding re-fires after its line is edited", () => {
    const hash = fingerprintFinding(finding(), { sourceText: SOURCE });
    const edited = SOURCE.replace("worked example:", "worked example (see below):");
    expect(edited).not.toBe(SOURCE); // the mutation landed

    const clean = applyAllowlist([finding()], { allowlist: allowlistOf(hash), sourceText: SOURCE });
    expect(clean.findings).toHaveLength(0);

    const after = applyAllowlist([finding()], { allowlist: allowlistOf(hash), sourceText: edited });
    expect(after.findings).toHaveLength(1);
    expect(after.allowed).toHaveLength(0);
    expect(after.stale).toHaveLength(1);
    expect(after.stale[0].hash).toBe(hash);
  });

  it("leaves an unlisted finding failing", () => {
    const out = applyAllowlist([finding()], { allowlist: allowlistOf("deadbeef"), sourceText: SOURCE });
    expect(out.findings).toHaveLength(1);
    expect(out.stale.map((s: { hash: string }) => s.hash)).toEqual(["deadbeef"]);
  });

  it("expires when a DIFFERENT contact replaces the one that was excused", () => {
    const hash = fingerprintFinding(finding(), { sourceText: SOURCE });
    const swapped = SOURCE.replace(CONTACT, "erin@southgate.invalid");
    const out = applyAllowlist([finding({ value: "erin@southgate.invalid" })], {
      allowlist: allowlistOf(hash),
      sourceText: swapped,
    });
    expect(out.findings).toHaveLength(1);
  });

  it("a different salt invalidates every entry", () => {
    const hash = fingerprintFinding(finding(), { sourceText: SOURCE });
    const out = applyAllowlist([finding()], {
      allowlist: { ...allowlistOf(hash), salt: "rotated" },
      sourceText: SOURCE,
    });
    expect(out.findings).toHaveLength(1);
  });

  it("no allowlist at all is not an error — everything simply fails", () => {
    const out = applyAllowlist([finding()], {});
    expect(out.findings).toHaveLength(1);
    expect(out.stale).toHaveLength(0);
  });
});

describe("run-level folding", () => {
  const OTHER = "# other\nquote: erin@southgate.invalid";
  const otherFinding = {
    file: "docs/other.md",
    line: 2,
    kind: "email",
    value: "erin@southgate.invalid",
    message: "known real contact",
  };

  it("only calls an entry stale when NO file in the run used it", () => {
    const a = fingerprintFinding(finding(), { sourceText: SOURCE });
    const b = fingerprintFinding(otherFinding, { sourceText: OTHER });
    const out = applyAllowlistToRun(
      [
        { file: "docs/example.md", text: SOURCE, findings: [finding()] },
        { file: "docs/other.md", text: OTHER, findings: [otherFinding] },
      ],
      { allowlist: allowlistOf(a, b) },
    );
    expect(out.findings).toHaveLength(0);
    expect(out.allowed).toHaveLength(2);
    expect(out.stale).toHaveLength(0); // per-file, each entry looks unused by the other file
  });

  it("still reports the entry that no file matched", () => {
    const a = fingerprintFinding(finding(), { sourceText: SOURCE });
    const out = applyAllowlistToRun([{ file: "docs/example.md", text: SOURCE, findings: [finding()] }], {
      allowlist: allowlistOf(a, "neverused"),
    });
    expect(out.stale.map((s: { hash: string }) => s.hash)).toEqual(["neverused"]);
    expect(formatStale(out.stale[0])).toContain(ALLOWLIST_PATH);
  });
});

describe("the committed allowlist", () => {
  it("is empty — every entry would be a contact-shaped value we chose to keep", () => {
    const allowlist = loadAllowlist(ALLOWLIST_PATH);
    expect(allowlist.salt).toBe(ALLOWLIST_SALT);
    expect(Object.keys(allowlist.entries ?? {})).toHaveLength(0);
  });
});
