import { describe, expect, it } from "vitest";
import {
  dealCandidate,
  equityRegistry,
  isEquityRecord,
  equitySaveOutcome,
  parseEquityCorrection,
  phase4Opportunities,
  prosePercentConflict,
  readEquitySplit,
  readEquityState,
  recordEquityView,
  type EquityCandidate,
  type EquitySplit,
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

// ---------------------------------------------------------------------------
// Q41 inc.2 — the correction door. Every test here is a refusal Rob would
// otherwise have to discover by reading a wrong number off his own screen.
// ---------------------------------------------------------------------------

describe("parseEquityCorrection — the write door", () => {
  const AT = "2026-07-28";

  it("derives our side from the counterparty side — Rob types 35, the screen shows 35 / 65", () => {
    const r = parseEquityCorrection({ counterpartyPct: 35, setAt: AT });
    expect(r).toEqual({ ok: true, value: { counterpartyPct: 35, ourPct: 65, setBy: "rob", setAt: AT } });
  });

  it("accepts the string an HTML number input actually sends", () => {
    const r = parseEquityCorrection({ counterpartyPct: "35", setAt: AT });
    expect(r.ok && r.value.counterpartyPct).toBe(35);
  });

  it("refuses an empty input instead of storing Number('') as a 0/100 stake", () => {
    const r = parseEquityCorrection({ counterpartyPct: "", setAt: AT });
    expect(r).toMatchObject({ ok: false });
  });

  it("refuses a missing field — that is an erased number, not a corrected one", () => {
    expect(parseEquityCorrection({ setAt: AT })).toMatchObject({ ok: false });
  });

  it("accepts an explicit null: we hold a stake, the number is not agreed yet", () => {
    const r = parseEquityCorrection({ counterpartyPct: null, setAt: AT });
    expect(r.ok && r.value).toMatchObject({ counterpartyPct: null, ourPct: null });
  });

  it("refuses out-of-range percentages", () => {
    expect(parseEquityCorrection({ counterpartyPct: 130, setAt: AT })).toMatchObject({ ok: false });
    expect(parseEquityCorrection({ counterpartyPct: -1, setAt: AT })).toMatchObject({ ok: false });
  });

  it("refuses a two-sided split that does not total 100 — the same rule the registry renders by", () => {
    const r = parseEquityCorrection({ counterpartyPct: 35, ourPct: 60, setAt: AT });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.error).toContain("95");
  });

  it("accepts a two-sided split that does total 100", () => {
    const r = parseEquityCorrection({ counterpartyPct: 35, ourPct: 65, setAt: AT });
    expect(r.ok && r.value.ourPct).toBe(65);
  });

  it("refuses our side when the counterparty side is unknown", () => {
    expect(parseEquityCorrection({ counterpartyPct: null, ourPct: 65, setAt: AT })).toMatchObject({ ok: false });
  });

  it("refuses a state the screen cannot colour", () => {
    expect(parseEquityCorrection({ counterpartyPct: 35, state: "handshake", setAt: AT })).toMatchObject({ ok: false });
  });

  it("omits state entirely when none is given, so the prose keeps supplying it", () => {
    const r = parseEquityCorrection({ counterpartyPct: 35, setAt: AT });
    expect(r.ok && "state" in r.value).toBe(false);
  });

  it("stores the state when Rob states it — 35/65 signed is not 35/65 verbal", () => {
    const r = parseEquityCorrection({ counterpartyPct: 35, state: "signed", setAt: AT });
    expect(r.ok && r.value.state).toBe("signed");
  });

  it("what it writes is what readEquitySplit reads back — field wins over stale prose", () => {
    const r = parseEquityCorrection({ counterpartyPct: 35, state: "verbal", setAt: AT });
    if (!r.ok) throw new Error("expected ok");
    const split = readEquitySplit({
      id: "spinoff-homeclonevault",
      name: "HomeCloneVault",
      description: "equity venture, 40/60 split AGREED VERBALLY",
      equity: r.value,
    }) as EquitySplit;
    expect(split.counterpartyPct).toBe(35);
    expect(split.ourPct).toBe(65);
    expect(split.provenance).toBe("field");
  });
});

// Q41 inc.3 — what the SCREEN is allowed to say after a save. These are the
// cases where a wrong sentence would leave Rob believing a bad split is fixed.
describe("equitySaveOutcome", () => {
  const saved = { counterpartyPct: 35, ourPct: 65, setBy: "rob", setAt: "2026-07-28" };

  it("confirms only what the route reported, quoting the saved numbers", () => {
    const o = equitySaveOutcome(200, { ok: true, table: "orgs", equity: saved });
    expect(o.tone).toBe("ok");
    expect(o.message).toContain("35 / 65");
    expect(o.saved).toEqual(saved);
  });

  it("a null stake reads as a recorded stake with no number — never as 0 / 100", () => {
    const o = equitySaveOutcome(200, {
      ok: true,
      equity: { counterpartyPct: null, ourPct: null, setBy: "rob", setAt: "2026-07-28" },
    });
    expect(o.tone).toBe("ok");
    expect(o.message).not.toContain("0 /");
  });

  it("a 200 with no equity in the body is NOT a save — the panel says nothing was confirmed", () => {
    const o = equitySaveOutcome(200, { ok: true });
    expect(o.tone).toBe("error");
    expect(o.saved).toBeUndefined();
    expect(o.message).toContain("did not report");
  });

  it("shows the route's own refusal verbatim, so 35 + 60 explains itself", () => {
    const o = equitySaveOutcome(400, { error: "35 / 60 totals 95, not 100" });
    expect(o.tone).toBe("error");
    expect(o.message).toBe("35 / 60 totals 95, not 100");
  });

  it("never shows a bare status code with no sentence", () => {
    const o = equitySaveOutcome(404, null);
    expect(o.tone).toBe("error");
    expect(o.message).toContain("Not saved");
  });
});

// Q41 inc.4 — the "future Phase-4 opportunities" half of Rob's item.
describe("phase4Opportunities", () => {
  it("surfaces a mention of a future stake as a lead, citing the sentence", () => {
    const out = phase4Opportunities([
      {
        id: "caleb",
        name: "Caleb Nix",
        notes: "Great call. He floated giving us equity in the new install arm if we run their intake.",
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].entityId).toBe("caleb");
    expect(out[0].evidence).toContain("floated giving us equity");
  });

  it("never lists a record that is already a stake on the registry", () => {
    // HomeCloneVault holds a real 35/65. A second row under "opportunities" would
    // make one relationship look like two.
    const out = phase4Opportunities([
      {
        id: "spinoff-homeclonevault",
        name: "HomeCloneVault",
        description: "Phase 4 spinoff. 35/65 split with Alex, agreed verbally, nothing signed.",
      },
    ]);
    expect(out).toEqual([]);
  });

  it("never demotes an unreadable stake to a mention", () => {
    // This record IS about equity and we DO hold something — the registry already
    // shows it under "no readable split". Listing it here would say "maybe".
    const c = {
      id: "dix",
      name: "Dix Healthcare AI",
      description: "We hold an equity stake here; the percentage was never agreed. Rob wants it pinned down eventually.",
    };
    expect(equityRegistry([c]).unreadable).toHaveLength(1);
    expect(phase4Opportunities([c])).toEqual([]);
  });

  it("does not pad the list with records that merely use an ownership word", () => {
    const out = phase4Opportunities([
      { id: "roofco", name: "RoofCo", notes: "Second-generation ownership; Dale bought his brother out in 2019." },
      { id: "naples", name: "Naples Spine & Joint", notes: "EN vs Spanish-language review split not verified." },
    ]);
    expect(out).toEqual([]);
  });

  it("requires the noun and the cue in the SAME sentence", () => {
    // Equity in one sentence, an unrelated "interested" three sentences later.
    const out = phase4Opportunities([
      {
        id: "split-sentences",
        name: "Split Sentences Co",
        notes: "Their cap table has three equity holders. Separately, they are interested in the Phase 1 site.",
      },
    ]);
    expect(out).toEqual([]);
  });

  it("gives one row per record, not one per mention", () => {
    const out = phase4Opportunities([
      {
        id: "chatty",
        name: "Chatty Co",
        notes: "Wants equity someday. Also discussed a revenue share. Could explore a spinoff too.",
      },
    ]);
    expect(out).toHaveLength(1);
  });

  it("carries the record's own route, so a deal-borne lead does not link to /people", () => {
    const out = phase4Opportunities([
      { id: "d1", name: "Gulf Coast Phase 5", notes: "Rob would consider equity on the next build.", href: "/deals/d1" },
    ]);
    expect(out[0].href).toBe("/deals/d1");
  });

  it("sorts alphabetically rather than inventing an urgency order", () => {
    const out = phase4Opportunities([
      { id: "z", name: "Zeta", notes: "Discussed a profit share." },
      { id: "a", name: "Alpha", notes: "Discussed a profit share." },
    ]);
    expect(out.map((o) => o.entityName)).toEqual(["Alpha", "Zeta"]);
  });
});

// Q41 inc.4 — the precedence fix, pinned from the registry's side.
describe("a prospective mention is not a holding", () => {
  const FLOATED: EquityCandidate = {
    id: "caleb",
    name: "Caleb Nix",
    notes: "He floated giving us equity in the new install arm if we run their intake.",
  };

  it("no longer files a maybe as a stake with an unreadable split", () => {
    const { splits, unreadable } = equityRegistry([FLOATED]);
    expect(splits).toEqual([]);
    expect(unreadable).toEqual([]);
    expect(readEquitySplit(FLOATED)).toBeNull();
  });

  it("still reads a real split on a record that also muses about more equity later", () => {
    const both = equityRegistry([
      {
        id: "hcv",
        name: "HomeCloneVault",
        description:
          "Phase-4 spinoff, 35/65 split, agreed verbally, nothing signed. Alex would explore more equity down the road.",
      },
    ]);
    expect(both.splits).toHaveLength(1);
    expect(both.splits[0].counterpartyPct).toBe(35);
  });
});

// Q41 inc.5 — the record page's view of one record. The whole point is that it is
// the REGISTRY's verdict, not a page-local re-read of the prose, so these pin the
// three outcomes as mutually exclusive and identical to the master panel's.
describe("recordEquityView", () => {
  const HCV: EquityCandidate = {
    id: "spinoff-homeclonevault",
    name: "HomeCloneVault",
    description: "Phase-4 spinoff, 35/65 split with Alex, agreed verbally, nothing signed.",
  };
  const FLOATED: EquityCandidate = {
    id: "caleb",
    name: "Caleb Nix",
    notes: "He floated giving us equity in the new install arm if we run their intake.",
  };
  const NOT_EQUITY: EquityCandidate = {
    id: "naples-spine",
    name: "Naples Spine & Joint",
    notes: "EN vs Spanish-language review split not verified.",
  };

  it("gives the record page the same split the master panel shows", () => {
    const view = recordEquityView(HCV);
    const panel = equityRegistry([HCV]).splits[0];
    expect(view.split).toEqual(panel);
    expect(view.split?.counterpartyPct).toBe(35);
    expect(view.split?.state).toBe("verbal");
    // Exclusive: a holding is never also a lead or an unreadable row.
    expect(view.lead).toBeNull();
    expect(view.unreadable).toBeNull();
  });

  it("shows a floated stake as a lead and NEVER as a holding", () => {
    const view = recordEquityView(FLOATED);
    expect(view.split).toBeNull();
    expect(view.unreadable).toBeNull();
    expect(view.lead?.entityId).toBe("caleb");
  });

  it("returns all-null for a record that merely used the word split", () => {
    expect(recordEquityView(NOT_EQUITY)).toEqual({ split: null, unreadable: null, lead: null });
  });

  it("surfaces a stake we hold whose number nothing can read, never as a maybe", () => {
    const view = recordEquityView({
      id: "dix",
      name: "Dix Healthcare AI",
      description: "Phase-4 spinoff. Equity split agreed, terms still being worked out.",
    });
    expect(view.split).toBeNull();
    expect(view.unreadable?.entityId).toBe("dix");
    expect(view.lead).toBeNull();
  });

  it("cannot disagree with the panel it was reached from — one candidate, one verdict", () => {
    const many = [HCV, FLOATED, NOT_EQUITY];
    const panel = equityRegistry(many);
    const leads = phase4Opportunities(many);
    for (const c of many) {
      const view = recordEquityView(c);
      expect(view.split).toEqual(panel.splits.find((s) => s.entityId === c.id) ?? null);
      expect(view.unreadable).toEqual(panel.unreadable.find((u) => u.entityId === c.id) ?? null);
      expect(view.lead).toEqual(leads.find((l) => l.entityId === c.id) ?? null);
    }
  });
});

// Q41 inc.6 — the mapping that dropped the field.
//
// These read like they are testing three lines of object construction, and they are.
// That construction lived inline on the Overview for five increments and silently
// discarded `equity`, so the ONE record Rob named — the Gulf Coast 30%, which is a
// deal — could be corrected in the UI, saved to Supabase, and still render the old
// prose number. Every test below fails against that literal.
describe("dealCandidate (Q41 inc.6)", () => {
  const GULF = {
    id: "deal-gulf-coast-equity-phase4",
    name: "Gulf Coast RE — Phase 4 equity",
    notes: "30% equity split to us. NOTHING SIGNED yet.",
  };

  it("carries the structured field through, so a correction on a deal is visible", () => {
    const corrected = dealCandidate({
      ...GULF,
      equity: { counterpartyPct: 25, ourPct: 75, state: "signed", setBy: "rob", setAt: "2026-07-28" },
    });
    const split = readEquitySplit(corrected) as EquitySplit;
    expect(split.counterpartyPct).toBe(25);
    expect(split.provenance).toBe("field");
    expect(split.state).toBe("signed");
  });

  it("still reads the prose when no correction has been made", () => {
    const split = readEquitySplit(dealCandidate(GULF)) as EquitySplit;
    expect(split.counterpartyPct).toBe(30);
    expect(split.provenance).toBe("prose");
    expect(split.state).toBe("verbal");
  });

  it("routes to the deal, never to /people — a stake is not always an entity", () => {
    expect(dealCandidate(GULF).href).toBe("/deals/deal-gulf-coast-equity-phase4");
  });

  it("keeps the drift guard armed on deals: a corrected field vs stale notes", () => {
    const drifted = dealCandidate({
      ...GULF,
      equity: { counterpartyPct: 25, ourPct: 75, setBy: "rob", setAt: "2026-07-28" },
    });
    expect(prosePercentConflict(drifted)).toMatch(/field says 25%/);
  });
});
