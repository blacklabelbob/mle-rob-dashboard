/**
 * Q81 inc.3 — the join between the CRM and the invoice ledger.
 *
 * These tests are written against the REAL pairs on prod (`CG Roofing Group` → `cg_roofing`,
 * `Gulf Coast RE Group` → `gulf_coast`) plus the org names that sit next to them in the same
 * table, because the failure that matters is not "no match" — it is **the wrong client's
 * overdue money appearing on a record a rep is about to call.**
 */

import { describe, expect, it } from "vitest";
import {
  distinctClientSlugs,
  isLeadingTokenRun,
  resolveLedgerClientSlug,
  tokenize,
} from "@/lib/rep/ledgerClientMatch";

/** The slugs actually in `rm_invoices_ar` on 2026-07-30. */
const LIVE_SLUGS = ["cg_roofing", "gulf_coast"];

describe("tokenize", () => {
  it("splits slugs and names into the same shape", () => {
    expect(tokenize("cg_roofing")).toEqual(["cg", "roofing"]);
    expect(tokenize("CG Roofing Group")).toEqual(["cg", "roofing", "group"]);
    expect(tokenize("Gulf Coast RE Group")).toEqual(["gulf", "coast", "re", "group"]);
    expect(tokenize("Red Rock Roofing (UT)")).toEqual(["red", "rock", "roofing", "ut"]);
  });

  it("is empty for a nameless record", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   —  ")).toEqual([]);
  });
});

describe("isLeadingTokenRun", () => {
  it("matches whole tokens from the start only", () => {
    expect(isLeadingTokenRun(["cg", "roofing"], ["cg", "roofing", "group"])).toBe(true);
    expect(isLeadingTokenRun(["roofing"], ["cg", "roofing", "group"])).toBe(false);
  });

  it("never matches a partial token — `gulf` does not lead `gulfstream`", () => {
    expect(isLeadingTokenRun(["gulf"], ["gulfstream", "title"])).toBe(false);
  });

  it("an empty prefix matches nothing (a nameless ledger client claims no org)", () => {
    expect(isLeadingTokenRun([], ["cg", "roofing"])).toBe(false);
  });
});

describe("resolveLedgerClientSlug — the live pairs", () => {
  it("resolves CG Roofing Group to cg_roofing", () => {
    expect(resolveLedgerClientSlug("CG Roofing Group", LIVE_SLUGS)).toEqual({
      state: "matched",
      slug: "cg_roofing",
    });
  });

  it("resolves Gulf Coast RE Group to gulf_coast", () => {
    expect(resolveLedgerClientSlug("Gulf Coast RE Group", LIVE_SLUGS)).toEqual({
      state: "matched",
      slug: "gulf_coast",
    });
  });

  it("refuses every other org on the board rather than reaching for the nearest slug", () => {
    // Red Rock Roofing shares the word "roofing" with cg_roofing; PropLogix and The Title
    // Base share nothing. All three must come back `none` — an unmatched org is the normal
    // case (most accounts have never been invoiced), and it must never borrow a match.
    for (const name of [
      "Red Rock Roofing (UT)",
      "PropLogix",
      "The Title Base",
      "Omega Title (FL)",
      "On Time Moving and Storage",
    ]) {
      expect(resolveLedgerClientSlug(name, LIVE_SLUGS)).toEqual({ state: "none" });
    }
  });

  it("a deal with no linked company resolves to none, not to the first slug", () => {
    expect(resolveLedgerClientSlug(null, LIVE_SLUGS)).toEqual({ state: "none" });
    expect(resolveLedgerClientSlug(undefined, LIVE_SLUGS)).toEqual({ state: "none" });
    expect(resolveLedgerClientSlug("", LIVE_SLUGS)).toEqual({ state: "none" });
  });

  it("an empty ledger matches nothing at all", () => {
    expect(resolveLedgerClientSlug("CG Roofing Group", [])).toEqual({ state: "none" });
  });
});

describe("resolveLedgerClientSlug — refusing to guess", () => {
  it("reports both candidates when two ledger clients lead the same org name", () => {
    // The day someone adds `cg` alongside `cg_roofing`, this org has two possible owners of
    // the money. Reporting beats picking: a rep told "we can't tell" makes a phone call; a
    // rep shown the wrong invoice makes a wrong one.
    const match = resolveLedgerClientSlug("CG Roofing Group", ["cg", "cg_roofing"]);
    expect(match).toEqual({ state: "ambiguous", candidates: ["cg", "cg_roofing"] });
  });

  it("is case- and separator-insensitive on both sides", () => {
    expect(resolveLedgerClientSlug("cg-roofing-group", ["CG_ROOFING"])).toEqual({
      state: "matched",
      slug: "CG_ROOFING",
    });
  });

  it("an exact-length match still matches (ledger slug == full org name)", () => {
    expect(resolveLedgerClientSlug("Naples Spine & Joint", ["naples_spine_joint"])).toEqual({
      state: "matched",
      slug: "naples_spine_joint",
    });
  });
});

describe("distinctClientSlugs", () => {
  it("dedupes and sorts, ignoring blanks", () => {
    expect(
      distinctClientSlugs([
        { clientSlug: "gulf_coast" },
        { clientSlug: "cg_roofing" },
        { clientSlug: "gulf_coast" },
        { clientSlug: "  " },
        { clientSlug: "" },
      ])
    ).toEqual(["cg_roofing", "gulf_coast"]);
  });

  it("trims, so a stray space cannot create a second client", () => {
    expect(distinctClientSlugs([{ clientSlug: " cg_roofing" }, { clientSlug: "cg_roofing" }]))
      .toEqual(["cg_roofing"]);
  });
});

describe("the whole live board — how loud is this panel going to be?", () => {
  // The real reason this block exists: on 2026-07-30 every one of the 8 deals on prod has a
  // linked company, and only TWO of the seven companies have ever been invoiced. So five deal
  // records resolve to `none`. If `none` renders as a warning, the panel cries wolf on the
  // majority of deal records — and a panel a rep learns to skip is how the CG Roofing invoice
  // gets missed, which is the failure Q81 exists to prevent. This test states the ratio out
  // loud so a future change that makes `none` alarming has to argue with a number.
  const BOARD = [
    "PropLogix",
    "The Title Base",
    "Naples Spine & Joint",
    "Gulf Coast RE Group",
    "De Cecco USA",
    "On Time Moving and Storage",
    "CG Roofing Group",
  ];

  it("exactly two companies on the board are in the ledger; five are simply unbilled", () => {
    const states = BOARD.map((n) => resolveLedgerClientSlug(n, LIVE_SLUGS).state);
    expect(states.filter((s) => s === "matched")).toHaveLength(2);
    expect(states.filter((s) => s === "none")).toHaveLength(5);
    // Nothing on the live board is ambiguous — every warning the deal panel raises today is
    // a real one.
    expect(states.filter((s) => s === "ambiguous")).toHaveLength(0);
  });

  it("the two that match are the two the ledger actually bills", () => {
    const matched = BOARD.filter(
      (n) => resolveLedgerClientSlug(n, LIVE_SLUGS).state === "matched"
    );
    expect(matched).toEqual(["Gulf Coast RE Group", "CG Roofing Group"]);
  });
});
