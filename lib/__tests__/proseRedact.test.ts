import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error -- plain .mjs module, no types by design (runs as a CLI too)
import {
  redactProse,
  optionsForPath,
  isRedactableEmail,
  isRedactablePhone,
  ALLOWED_EMAIL_DOMAINS,
} from "../../scripts/prose-redact.mjs";

const REPO = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(REPO, p), "utf8");

const PROSE_FILES = [
  "docs/research/ENRICHMENT-GAP-AUDIT-2026-07-17.md",
  "docs/plans/PRD-mle-crm.md",
  "BUILD-QUEUE.md",
  // The PRD that lists the leaks was itself a leak — 4 phones and a family gmail,
  // quoted while documenting them, and absent from its own inventory. Added here
  // so "the doc about the problem" can never drift back into being the problem.
  "docs/plans/PRD-scaffolding-in-git-data-in-supabase-v1.md",
];

// Broad shapes, deliberately wider than the redactor's own regexes: a DoD that
// reuses the matcher it is grading proves nothing.
const ANY_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

describe("isRedactableEmail", () => {
  it("redacts a stranger's mailbox", () => {
    expect(isRedactableEmail("angela@omegatitlegroup.com")).toBe(true);
    expect(isRedactableEmail("thedevdix@gmail.com")).toBe(true);
  });

  it("leaves Rob's own address and the invented fixture domains alone", () => {
    expect(isRedactableEmail("rob@aivoicetech.io")).toBe(false);
    expect(isRedactableEmail("rob+q8test@aivoicetech.io")).toBe(false);
    expect(isRedactableEmail("dana@roofco.com")).toBe(false);
    expect(isRedactableEmail("demo@example.com")).toBe(false);
    expect(ALLOWED_EMAIL_DOMAINS.has("aivoicetech.io")).toBe(true);
  });

  it("treats a subdomain of an allowed domain as allowed", () => {
    expect(isRedactableEmail("noreply@mail.example.com")).toBe(false);
  });
});

describe("isRedactablePhone", () => {
  it("accepts dialable NANP numbers in every format the docs use", () => {
    for (const n of ["(904) 609-7180", "239-448-8458", "904.609.7180", "1-800-487-3808", "9548033016"]) {
      expect(isRedactablePhone(n), n).toBe(true);
    }
  });

  it("rejects the record ids that live in this repo and look like phones", () => {
    // Invoice/record numbers pulled from PRD-mle-crm.md and the ledger.
    for (const id of ["0001084486", "0001594805", "2100010339", "1700001251", "2400029188"]) {
      expect(isRedactablePhone(id), id).toBe(false);
    }
  });

  it("rejects the 555-01XX block the synthetic seed is built on", () => {
    expect(isRedactablePhone("(555) 555-0134")).toBe(false);
    expect(isRedactablePhone("239-555-0101")).toBe(false);
  });
});

describe("redactProse", () => {
  it("keeps the organisation and drops the mailbox", () => {
    const { text, emails } = redactProse("Omega Title — angela@omegatitlegroup.com, COO.");
    expect(text).toBe("Omega Title — [email redacted @omegatitlegroup.com], COO.");
    expect(emails).toBe(1);
  });

  it("is idempotent — a placeholder is not itself redactable", () => {
    const once = redactProse("call 239-448-8458 or mail a@b.com");
    const twice = redactProse(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.emails + twice.phones).toBe(0);
  });

  it("does not read a decimal coordinate pair as a phone number", () => {
    // The exact string that fooled the first draft, out of the Atlas viewBox.
    const svg = 'viewBox="0 0 2663.84375 634.171875"';
    expect(redactProse(svg, { allowBareDigits: false }).phones).toBe(0);
    expect(redactProse(svg).phones).toBe(0);
  });

  it("still redacts a real number sitting next to punctuation", () => {
    expect(redactProse("(1-800-487-3808).").text).toBe("([phone redacted]).");
  });
});

describe("the committed files", () => {
  it.each(PROSE_FILES)("%s carries no third-party mailbox", (path) => {
    const strays = (read(path).match(ANY_EMAIL) ?? []).filter(isRedactableEmail);
    expect(strays).toEqual([]);
  });

  it.each(PROSE_FILES)("%s carries no dialable phone number", (path) => {
    const { phones } = redactProse(read(path), optionsForPath(path));
    expect(phones).toBe(0);
  });

  it("ARCHITECTURE-ATLAS.html needs no redaction — every digit run in it is geometry", () => {
    const path = "docs/ARCHITECTURE-ATLAS.html";
    const before = read(path);
    const { text, emails, phones } = redactProse(before, optionsForPath(path));
    expect({ emails, phones }).toEqual({ emails: 0, phones: 0 });
    expect(text).toBe(before);
  });
});
