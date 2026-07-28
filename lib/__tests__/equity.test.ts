import { describe, expect, it } from "vitest";
import {
  equityRegistry,
  isEquityRecord,
  prosePercentConflict,
  readEquitySplit,
  readEquityState,
  type EquityCandidate,
} from "@/lib/equity";

// The two records this was built for, verbatim from data/network.json on 2026-07-27.
const HOMECLONE: EquityCandidate = {
  id: "spinoff-homeclonevault",
  name: "HomeCloneVault (Phase-4 spinoff)",
  description:
    'Phase-4 spinoff with Alex Greenwood: equity venture, 35/65 split AGREED VERBALLY, NOT YET SIGNED (Rob dev-chat #53, 2026-07-27 — corrected from the 40/60 recorded on 7/22: "I told you we have a 40% split, its actully 35%").',
  notes: "OWNERS-ONLY (Rob+Will). Open item = LOI SIGNED (task-homeclonevault-equity-signoff).",
};

const CALEB: EquityCandidate = {
  id: "spinoff-caleb-crm",
  name: "Caleb CRM (Phase-4 spinoff)",
  description:
    "Phase-4 spinoff with Caleb Green: three-way CRM partnership, revenue splits in draft at counsel.",
};

const GULF: EquityCandidate = {
  id: "deal-gulf-coast-equity-phase4",
  name: "Gulf Coast RE equity",
  description: "Phase-4 equity: 30% Gulf Coast RE, PROBABLE, unsigned.",
};

describe("isEquityRecord", () => {
  it("catches spinoffs, splits and explicit equity", () => {
    expect(isEquityRecord(HOMECLONE)).toBe(true);
    expect(isEquityRecord(CALEB)).toBe(true);
    expect(isEquityRecord(GULF)).toBe(true);
  });

  it("leaves ordinary records alone — this panel is not a dumping ground", () => {
    expect(isEquityRecord({ id: "x", name: "The Title Base", description: "Title client, Naples FL." })).toBe(false);
  });

  it("does NOT treat a bare 'split' as equity — the Naples Spine & Joint regression", () => {
    // Verbatim from the live orgs row on 2026-07-28. An enrichment note about
    // review languages put a chiropractic clinic on Rob's equity screen. A stake
    // we do not hold is as wrong as a stake we fail to show.
    expect(
      isEquityRecord({
        id: "naples-spine-joint",
        name: "Naples Spine & Joint",
        description:
          "EN vs Spanish-language review split not verified. No Google Business Profile rating captured either.",
      })
    ).toBe(false);
  });

  it("still counts a split when the thing being split is named", () => {
    expect(isEquityRecord({ id: "a", name: "A", description: "revenue splits in draft" })).toBe(true);
    expect(isEquityRecord({ id: "b", name: "B", description: "ownership split agreed" })).toBe(true);
  });
});

describe("readEquityState", () => {
  it("reads NOT YET SIGNED as verbal, never as signed", () => {
    // The whole point of the field. A bare /signed/ match here would turn a
    // handshake into a contract on Rob's screen.
    expect(readEquityState("35/65 AGREED VERBALLY, NOT YET SIGNED")).toBe("verbal");
    expect(readEquityState("30% Gulf Coast RE, unsigned")).toBe("verbal");
  });

  it("reads draft-at-counsel as draft", () => {
    expect(readEquityState("revenue splits in draft at counsel")).toBe("draft");
  });

  it("reads a genuine signature as signed", () => {
    expect(readEquityState("LOI signed 2026-08-01")).toBe("signed");
  });

  it("says unknown rather than guessing", () => {
    expect(readEquityState("40/60 with Alex")).toBe("unknown");
  });

  it("reads NOTHING SIGNED as verbal — Rob's actual phrasing on the live Gulf Coast row", () => {
    // /not\s+signed/ does NOT match "nothing signed", so before this was pinned the
    // bare /\bsigned\b/ branch caught it and reported a handshake as a contract.
    expect(readEquityState("PROBABLE, terms not final, NOTHING SIGNED.")).toBe("verbal");
    expect(readEquityState("terms agreed, nothing has been signed")).toBe("verbal");
    expect(readEquityState("agreement not executed")).toBe("verbal");
  });
});

describe("readEquitySplit", () => {
  it("reads the two-sided split out of HomeCloneVault's prose — the current, not the corrected-from, number", () => {
    const r = readEquitySplit(HOMECLONE);
    expect(r).toMatchObject({
      counterpartyPct: 35,
      ourPct: 65,
      state: "verbal",
      provenance: "prose",
    });
    // The description also contains "40/60" and "40%". The live split must win.
    expect((r as { counterpartyPct: number }).counterpartyPct).not.toBe(40);
  });

  it("reads a one-sided percentage and derives our remainder", () => {
    expect(readEquitySplit(GULF)).toMatchObject({ counterpartyPct: 30, ourPct: 70, state: "verbal" });
  });

  it("reports an equity record with no readable number instead of dropping it", () => {
    const r = readEquitySplit(CALEB);
    expect(r).toMatchObject({ entityId: "spinoff-caleb-crm" });
    expect(r).toHaveProperty("reason");
  });

  it("refuses a split that does not total 100 rather than rendering it as fact", () => {
    const r = readEquitySplit({ id: "z", name: "Three-way", description: "equity: 40/40 split" });
    expect(r).toHaveProperty("reason");
    expect((r as { reason: string }).reason).toContain("does not total 100");
  });

  it("prefers the structured field over the prose, always", () => {
    const r = readEquitySplit({ ...HOMECLONE, equity: { counterpartyPct: 35, state: "verbal" } });
    expect(r).toMatchObject({ counterpartyPct: 35, ourPct: 65, provenance: "field" });
  });

  it("returns null for records that are not about equity", () => {
    expect(readEquitySplit({ id: "x", name: "Plain client" })).toBeNull();
  });

  it("refuses a stray percentage from a sentence that is not about the stake", () => {
    // The live descriptions are long and carry unrelated numbers. An equity record
    // whose ONLY percentage is a marketing stat must come back UNREADABLE — it is
    // still listed, with its reason, so nothing is hidden; what is refused is
    // printing "97 / 3" as an ownership split next to HomeCloneVault's real 35/65.
    const r = readEquitySplit({
      id: "stray",
      name: "Stray Stat Co",
      description:
        "Phase-4 equity venture with the brokerage, terms still being worked out. Their site converts at 3%, and 97% of visitors leave without calling.",
    });
    expect(r).toHaveProperty("reason");
    expect(r).not.toHaveProperty("counterpartyPct");
  });

  it("still reads a percentage that sits in the same sentence as the equity word", () => {
    // The anchor must not be so tight that it drops the real case it was built for.
    expect(
      readEquitySplit({
        id: "anchored",
        name: "Anchored Co",
        description:
          "Background: their close rate is 22%. Rob 2026-07-22: we are probably going to get 30% equity in Gulf Coast Real Estate, nothing signed.",
      })
    ).toMatchObject({ counterpartyPct: 30, ourPct: 70, state: "verbal" });
  });
});

describe("equityRegistry", () => {
  it("puts unsigned stakes first — those are the ones that can still evaporate", () => {
    const { splits, unreadable } = equityRegistry([
      { id: "s", name: "Signed Co", description: "equity: 10% split, signed 2026-01-01" },
      HOMECLONE,
      CALEB,
      GULF,
    ]);
    // Both unsigned stakes come before the signed one; within a state the order is
    // by name, so the list is stable run-to-run rather than data-order dependent.
    expect(splits.map((s) => s.entityId)).toEqual([
      "deal-gulf-coast-equity-phase4",
      "spinoff-homeclonevault",
      "s",
    ]);
    expect(unreadable.map((u) => u.entityId)).toEqual(["spinoff-caleb-crm"]);
  });
});

describe("a stake carried by a DEAL, not an entity", () => {
  // Verbatim from the live deals row on 2026-07-28. Rob named this stake in
  // dev-chat #55; feeding only people/orgs dropped it off the panel entirely.
  const GULF_DEAL: EquityCandidate = {
    id: "deal-gulf-coast-equity-phase4",
    name: "Gulf Coast RE Group — 30% equity stake (Phase 4)",
    notes:
      'PHASE-4 EQUITY (OWNERS-ONLY, Rob+Will). Rob 2026-07-22: "we are probably going to get 30% equity in Gulf Coast Real Estate" — PROBABLE, terms not final, NOTHING SIGNED. Separate from the paid $19k Phase-1 services deal. Same pattern as HomeCloneVault 40/60 (agreed, unsigned).',
    href: "/deals/deal-gulf-coast-equity-phase4",
  };

  it("reads the 30% off the deal's notes and keeps the deal's own route", () => {
    const r = readEquitySplit(GULF_DEAL);
    expect(r).toMatchObject({
      counterpartyPct: 30,
      ourPct: 70,
      state: "verbal",
      href: "/deals/deal-gulf-coast-equity-phase4",
    });
  });

  it("is not fooled by the stale HomeCloneVault 40/60 quoted inside those notes", () => {
    // The live number is 30 — 40/60 is a comparison to another deal, and it is
    // itself out of date. Neither may become this row's percentage.
    expect((readEquitySplit(GULF_DEAL) as { counterpartyPct: number }).counterpartyPct).toBe(30);
  });

  it("routes an entity with no href to /people, so nothing regressed", () => {
    expect((readEquitySplit(HOMECLONE) as { href?: string }).href).toBeUndefined();
  });
});

describe("prosePercentConflict — the drift guard", () => {
  it("catches the exact defect: a field corrected while the prose still says the old number", () => {
    const stale: EquityCandidate = {
      id: "spinoff-homeclonevault",
      name: "HomeCloneVault",
      description: "equity venture, 40/60 split AGREED VERBALLY",
      equity: { counterpartyPct: 35 },
    };
    expect(prosePercentConflict(stale)).toContain("field says 35%");
  });

  it("is quiet when field and prose agree", () => {
    expect(prosePercentConflict({ ...HOMECLONE, equity: { counterpartyPct: 35 } })).toBeNull();
  });

  it("is quiet when there is no field to compare against", () => {
    expect(prosePercentConflict(HOMECLONE)).toBeNull();
  });
});
