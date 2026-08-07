import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Q91(a) inc.33 — the guard that keeps the three record surfaces from becoming three
// opinions about the same row.
//
// The badge is fed by `driftReport(book)`, never by `statusDrift(record)`, and the
// difference is not stylistic:
//   • `doorsOpened` is an edge count over the WHOLE book — a page calling the ladder on
//     one record silently passes 0 and understates a connector.
//   • the Q91(c) membership guard lives inside `driftReport`. A surface that skips it
//     will badge a company whose members are missing from the book it happens to be
//     reading — the exact split-book lie C-2019 produced.
// Both failures render as a *confident sentence*, not as an error, so no runtime check
// catches them. This one is a source check, because the mistake is made at import time.
//
// It also pins the DoD list itself: the item names three surfaces, and a fourth reader
// added later without this line in it is what quietly drops one.

const SURFACES = [
  "app/companies/[id]/page.tsx",
  "app/people/[id]/page.tsx",
  "app/rep/accounts/[id]/page.tsx",
];

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("Q91(a) — every record surface answers 'why is this unlit' the same way", () => {
  it.each(SURFACES)("%s renders the justification badge", (rel) => {
    const src = read(rel);
    expect(src).toContain('from "@/components/StatusJustification"');
    expect(src).toContain("<StatusJustification");
  });

  it.each(SURFACES)("%s derives drift from the whole book via driftReport", (rel) => {
    const src = read(rel);
    expect(src).toContain("driftReport(");
  });

  it.each(SURFACES)("%s never calls the ladder on a single record", (rel) => {
    const src = read(rel);
    // `statusDrift` as a local const name is fine and is what all three call it; what is
    // banned is CALLING the imported ladder — `statusDrift(` with an argument.
    expect(src).not.toMatch(/\bstatusDrift\s*\(/);
    expect(src).not.toMatch(/import\s*\{[^}]*\bstatusDrift\b[^}]*\}\s*from\s*"@\/lib\/networkStatus"/);
  });
});
