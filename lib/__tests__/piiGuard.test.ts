import { describe, expect, it } from "vitest";
import {
  BINARY_EXT_RE,
  TIER_A,
  TIER_B,
  dedupeFindings,
  formatFinding,
  formatReport,
  runGuard,
} from "../../scripts/pii-guard.mjs";
import {
  DENYLIST_SALT,
  hashSecret,
  loadDenylist,
} from "../../scripts/pii-guard-denylist.mjs";
import {
  ALLOWLIST_SALT,
  fingerprintFinding,
  loadAllowlist,
} from "../../scripts/pii-guard-allowlist.mjs";
import { readTextFiles, trackedFiles } from "../../scripts/pii-guard.mjs";

// Fiction, on purpose — same rule as the other guard suites: this file must not
// become the thing the guard exists to stop. `.invalid` is RFC 2606 (never
// resolvable) and area code 999 is permanently unassignable in the NANP.
const REAL_EMAIL = "dana@northgate.invalid";
const REAL_PHONE = "999-201-4477";

const denylist = {
  salt: DENYLIST_SALT,
  algorithm: "sha256",
  entries: {
    [hashSecret("email", REAL_EMAIL, DENYLIST_SALT)]: "Dana at Northgate",
    [hashSecret("phone", "9992014477", DENYLIST_SALT)]: "Dana mobile",
  },
};

const emptyAllowlist = { salt: ALLOWLIST_SALT, algorithm: "sha256", entries: {} };

const cleanData = JSON.stringify({ __synthetic: true, people: [{ email: "a@example.com" }] }, null, 2);
const cleanManifest = JSON.stringify({ meetings: [] }, null, 2);

/** A tracked-file set that passes both tiers, so each test injects exactly one fault. */
const cleanFiles = () => [
  { file: "data/network.json", text: cleanData },
  { file: "data/crm.json", text: cleanData },
  { file: "MLE Internal Meetings/manifest.json", text: cleanManifest },
  { file: "docs/notes.md", text: "# notes\nnothing to see\n" },
];

const run = (files: ReturnType<typeof cleanFiles>, allowlist = emptyAllowlist) =>
  runGuard(files, { denylist, allowlist });

describe("pii-guard — the one command", () => {
  it("exits 0 on a clean tree and says what it actually scanned", () => {
    const verdict = run(cleanFiles());
    expect(verdict.findings).toHaveLength(0);
    const report = formatReport(verdict);
    expect(report.exitCode).toBe(0);
    // Vacuity check: "ok" must be accompanied by non-zero coverage.
    expect(verdict.counts.tierAScanned).toBe(3);
    expect(verdict.counts.tierBScanned).toBe(4);
    expect(report.text).toContain("Tier A 3/3 targets");
  });

  it("Tier A fails on a non-reserved address in a data file", () => {
    const files = cleanFiles();
    files[0].text = JSON.stringify({ __synthetic: true, people: [{ email: "jo@acme.test" }] }, null, 2);
    const verdict = run(files);
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0]).toMatchObject({ file: "data/network.json", tier: TIER_A, kind: "email" });
  });

  it("Tier B fails on a known real contact in ordinary prose", () => {
    const files = cleanFiles();
    files[3].text = `# notes\nping ${REAL_EMAIL} about it\n`;
    const verdict = run(files);
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0]).toMatchObject({ file: "docs/notes.md", tier: TIER_B, line: 2 });
    expect(verdict.findings[0].message).toContain("Dana at Northgate");
  });

  it("the failure report carries file:line, the label, and BOTH fix commands", () => {
    const files = cleanFiles();
    files[3].text = `# notes\nping ${REAL_EMAIL} about it\n`;
    const { text, exitCode } = formatReport(run(files));
    expect(exitCode).toBe(1);
    expect(text).toContain("docs/notes.md:2");
    expect(text).toContain("Dana at Northgate");
    expect(text).toContain("node scripts/prose-redact.mjs");
    expect(text).toContain("node scripts/seed-synthetic.mjs");
    // and the escape hatch, so a false positive has an answer that isn't "disable it"
    expect(text).toContain("--fingerprint");
  });

  it("reports an ABSENT Tier A target instead of passing vacuously", () => {
    const files = cleanFiles().filter((f) => f.file !== "data/crm.json");
    const verdict = run(files);
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0]).toMatchObject({ file: "data/crm.json", kind: "absent", tier: TIER_A });
    expect(formatReport(verdict).exitCode).toBe(1);
    expect(verdict.counts.tierAScanned).toBe(2);
    expect(verdict.counts.tierAExpected).toBe(3);
  });

  it("collapses the same fact seen by both tiers into one finding", () => {
    // A denied real address inside a data file: Tier A (not reserved) AND Tier B (known).
    const files = cleanFiles();
    files[0].text = JSON.stringify({ __synthetic: true, people: [{ email: REAL_EMAIL }] }, null, 2);
    const verdict = run(files);
    expect(verdict.findings).toHaveLength(1);
    // The more severe tier survives, and the agreement is recorded not hidden.
    expect(verdict.findings[0].tier).toBe(TIER_B);
    expect(verdict.findings[0].alsoTier).toBe(TIER_A);
    expect(formatFinding(verdict.findings[0])).toContain("[Tier B (+Tier A)]");
  });

  it("dedupeFindings keeps distinct facts distinct", () => {
    const base = { file: "a.md", line: 1, kind: "email", value: "x@y.invalid", message: "m" };
    const out = dedupeFindings([
      { ...base, tier: TIER_A },
      { ...base, line: 2, tier: TIER_B },
      { ...base, value: "z@y.invalid", tier: TIER_B },
    ]);
    expect(out).toHaveLength(3);
  });

  // --- the allowlist seam: ONE pass over both tiers, not one per tier ---

  it("an allowlist entry excuses a Tier B finding without marking the Tier A run stale", () => {
    const files = cleanFiles();
    files[3].text = `# notes\nping ${REAL_EMAIL} about it\n`;
    const hash = fingerprintFinding(
      { file: "docs/notes.md", line: 2, kind: "email", value: REAL_EMAIL },
      { sourceText: files[3].text },
    );
    const verdict = run(files, {
      salt: ALLOWLIST_SALT,
      algorithm: "sha256",
      entries: { [hash]: { reason: "worked example in the runbook" } },
    });
    expect(verdict.findings).toHaveLength(0);
    expect(verdict.allowed).toHaveLength(1);
    // The regression this test exists for: applying the allowlist per-tier would
    // report this live entry as stale, because Tier A never saw docs/notes.md.
    expect(verdict.stale).toHaveLength(0);
    expect(formatReport(verdict).exitCode).toBe(0);
  });

  it("the exception expires the moment its line is edited, and says so", () => {
    const files = cleanFiles();
    files[3].text = `# notes\nping ${REAL_EMAIL} about it\n`;
    const hash = fingerprintFinding(
      { file: "docs/notes.md", line: 2, kind: "email", value: REAL_EMAIL },
      { sourceText: files[3].text },
    );
    const allowlist = {
      salt: ALLOWLIST_SALT,
      algorithm: "sha256",
      entries: { [hash]: { reason: "worked example in the runbook" } },
    };
    expect(run(files, allowlist).findings).toHaveLength(0);

    const edited = cleanFiles();
    edited[3].text = `# notes\nplease ping ${REAL_EMAIL} about it today\n`;
    expect(edited[3].text).not.toBe(files[3].text); // the mutation actually landed
    const after = run(edited, allowlist);
    expect(after.findings).toHaveLength(1);
    expect(after.stale).toHaveLength(1);
    expect(formatReport(after).exitCode).toBe(1);
  });

  it("a stale entry alone WARNS but does not fail the build", () => {
    const verdict = run(cleanFiles(), {
      salt: ALLOWLIST_SALT,
      algorithm: "sha256",
      entries: { ["f".repeat(64)]: { reason: "long gone" } },
    });
    const report = formatReport(verdict);
    expect(verdict.stale).toHaveLength(1);
    expect(report.exitCode).toBe(0);
    expect(report.text).toContain("not a failure, but dead weight");
  });

  it("states the skipped count on a PASS, so coverage is never silently partial", () => {
    const verdict = runGuard(cleanFiles(), { denylist, allowlist: emptyAllowlist, skipped: 11 });
    const { text, exitCode } = formatReport(verdict);
    expect(exitCode).toBe(0);
    expect(text).toContain("11 binaries skipped");
    // and 0 is printed too — an unstated zero is indistinguishable from no check
    expect(formatReport(run(cleanFiles())).text).toContain("0 binaries skipped");
  });

  it("skips binaries in Tier B — they carry no prose, only noise", () => {
    expect(BINARY_EXT_RE.test("public/logo.png")).toBe(true);
    expect(BINARY_EXT_RE.test("docs/deck.pdf")).toBe(true);
    expect(BINARY_EXT_RE.test("lib/store.ts")).toBe(false);
    expect(BINARY_EXT_RE.test("data/network.json")).toBe(false);
  });
});

/**
 * The gate itself.
 *
 * Everything above proves the guard CAN fail; this proves it is WIRED. The
 * synthetic cases would all stay green on a repo full of real customer phones —
 * a guard nothing runs is documentation. This is the one test that reads the
 * actual tracked tree, so `.githooks/pre-push` and the CI vitest step enforce
 * `npm run guard:pii` with no new wiring, which is Phase 3's stated premise.
 */
describe("pii-guard — the real tree", () => {
  it("this repo passes both tiers, and the run was not vacuous", () => {
    const { files, skipped } = readTextFiles(trackedFiles());
    const verdict = runGuard(files, {
      denylist: loadDenylist(),
      allowlist: loadAllowlist(),
      skipped,
    });
    const report = formatReport(verdict);

    // Non-vacuity first: a pass over zero files, zero targets or an empty
    // denylist is the failure this assertion exists to catch.
    expect(files.length).toBeGreaterThan(500);
    expect(verdict.counts.tierAScanned).toBe(verdict.counts.tierAExpected);
    expect(verdict.counts.denied).toBeGreaterThan(20);

    expect(report.exitCode, `guard:pii failed:\n${report.text}`).toBe(0);
    expect(verdict.findings).toHaveLength(0);
  });
});
