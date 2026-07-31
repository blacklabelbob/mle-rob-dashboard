import { describe, expect, it } from "vitest";
import {
  buildSlugIndex,
  flagEntityHref,
  flagRecordChips,
  linkifyRecordIds,
  resolveFlagEntityId,
} from "@/lib/flags/recordLinks";

/** The invariant that makes this safe to drop into a paragraph Rob reads. */
function rejoin(detail: string) {
  return linkifyRecordIds(detail)
    .map((s) => s.text)
    .join("");
}

describe("linkifyRecordIds", () => {
  it("returns nothing for empty input rather than an empty segment", () => {
    expect(linkifyRecordIds("")).toEqual([]);
  });

  it("leaves prose with no record id as one plain segment", () => {
    const text = "33 never said who the meeting was with at all.";
    expect(linkifyRecordIds(text)).toEqual([{ text }]);
  });

  it("links a bracketed org id — the exact shape inc.18 writes", () => {
    const segs = linkifyRecordIds("one is the same name plus a qualifier: Omega Title (FL) [C-2019] — confirm it");
    expect(segs).toContainEqual({ text: "C-2019", href: "/companies/C-2019" });
    expect(rejoin("one is the same name plus a qualifier: Omega Title (FL) [C-2019] — confirm it")).toBe(
      "one is the same name plus a qualifier: Omega Title (FL) [C-2019] — confirm it"
    );
  });

  it("links a person id and the org id that follows the arrow, in order", () => {
    const detail = "it names a person: Dixith Magadiev [P-1010] → C-2006 — put that person's company in Notion";
    const linked = linkifyRecordIds(detail).filter((s) => s.href);
    expect(linked).toEqual([
      { text: "P-1010", href: "/people/P-1010" },
      { text: "C-2006", href: "/companies/C-2006" },
    ]);
    expect(rejoin(detail)).toBe(detail);
  });

  it("never rewrites the prose it splits, on the full multi-line finding body", () => {
    const detail = [
      "The other 39 need a person first — 5 name a company the CRM does not match.",
      "",
      "• 2026-07-29 — Rob & Dix | MLE & Skin Cancer Detection AI Model",
      "    → “Dixith” is not a company: Dixith Magadiev [P-1010] → C-2006; do NOT create a new org",
      "• 2026-07-28 — Meeting",
      "    → Omega Title (FL) [C-2019] — confirm it is the same company",
    ].join("\n");
    expect(rejoin(detail)).toBe(detail);
    expect(linkifyRecordIds(detail).filter((s) => s.href)).toHaveLength(3);
  });

  it("does NOT link an id embedded in a longer code — an invoice number is not a company", () => {
    // MLE-2026-100123 is a real invoice number on this CRM (Gulf Coast, paid 7/16).
    const detail = "inv MLE-2026-100123 was paid; see also ABC-2019 and C-2019-draft";
    expect(linkifyRecordIds(detail).filter((s) => s.href)).toEqual([]);
    expect(rejoin(detail)).toBe(detail);
  });

  it("links an id sitting at the very start and the very end of the string", () => {
    expect(linkifyRecordIds("C-2019")).toEqual([{ text: "C-2019", href: "/companies/C-2019" }]);
    expect(linkifyRecordIds("confirm C-2019")).toEqual([
      { text: "confirm " },
      { text: "C-2019", href: "/companies/C-2019" },
    ]);
  });

  it("is not stateful across calls — the second call links the same as the first", () => {
    const detail = "Omega Title (FL) [C-2019] and Dix [C-2006]";
    expect(linkifyRecordIds(detail)).toEqual(linkifyRecordIds(detail));
    expect(linkifyRecordIds(detail).filter((s) => s.href)).toHaveLength(2);
  });

  it("leaves a lowercase or malformed id alone — an id is unambiguous or it is not a link", () => {
    const detail = "c-2019 and C- and C-abc are not record ids";
    expect(linkifyRecordIds(detail).filter((s) => s.href)).toEqual([]);
    expect(rejoin(detail)).toBe(detail);
  });
});

describe("flagEntityHref", () => {
  it("is null for a flag with no entity at all", () => {
    expect(flagEntityHref(null)).toBeNull();
    expect(flagEntityHref(undefined)).toBeNull();
    expect(flagEntityHref("")).toBeNull();
  });

  it("addresses the two record families the CRM mints", () => {
    expect(flagEntityHref("P-1010")).toBe("/people/P-1010");
    expect(flagEntityHref("C-2019")).toBe("/companies/C-2019");
  });

  it.each([
    "cg-roofing-group",
    "will",
    "david-cates",
    "derm-clinic-pilot",
    "spinoff-homeclonevault",
    "deal-gulf-coast-equity-phase4",
    "the-title-base",
    "naples-spine-joint",
  ])("refuses the slug %s — every entity_id on prod is one of these", (slug) => {
    // Before inc.20 each of these rendered as href="/people/<slug>", which is Next's
    // notFound page. A name that is not a link beats a link to the wrong place.
    expect(flagEntityHref(slug)).toBeNull();
  });

  it("is anchored, so an id buried in a longer slug never half-matches", () => {
    expect(flagEntityHref("cg-C-2019")).toBeNull();
    expect(flagEntityHref("C-2019-draft")).toBeNull();
    expect(flagEntityHref("MLE-2026-100123")).toBeNull();
    expect(flagEntityHref(" C-2019")).toBeNull();
  });

  it("agrees with the detail linkifier about where a record lives", () => {
    const inDetail = linkifyRecordIds("see C-2019 now").find((s) => s.href);
    expect(flagEntityHref("C-2019")).toBe(inDetail?.href);
  });
});

describe("flagRecordChips", () => {
  // The row that started Q84's link thread, verbatim off prod 2026-07-31: entity_id is
  // NULL and the entity_name names two orgs in one string, so the title reaches neither.
  const F137_NAME = "CG Roofing Group / Gulf Coast RE Group";
  const F137_DETAIL =
    "CG Roofing Group [C-2017] holds cgroofinggroup.com; the three orphaned meetings " +
    "resolve to cgroofing.net. Gulf Coast RE Group [C-2018] is the same shape.";

  it("makes prod flag #137's two orgs reachable from the row header", () => {
    expect(flagEntityHref(null)).toBeNull(); // the title is plain text — this is the only way in
    expect(F137_NAME).toContain("/"); // one string, two companies: no single href can be right
    expect(flagRecordChips(null, F137_DETAIL)).toEqual([
      { id: "C-2017", href: "/companies/C-2017" },
      { id: "C-2018", href: "/companies/C-2018" },
    ]);
  });

  it("carries prod flag #133's four records, people and companies alike", () => {
    const detail =
      "Dixith Magadiev [P-1010] → C-2006 — put that person's company in Notion. " +
      "No CRM org is named exactly “Omega Title”: C-2019 is the near miss, C-2018 is not.";
    expect(flagRecordChips(null, detail).map((c) => c.id)).toEqual([
      "P-1010",
      "C-2006",
      "C-2019",
      "C-2018",
    ]);
  });

  it("names each record once, in the order the flag names them", () => {
    expect(flagRecordChips(null, "C-2018 then C-2017 then C-2018 again").map((c) => c.id)).toEqual([
      "C-2018",
      "C-2017",
    ]);
  });

  it("drops the entity id when the title already links it — a repeat is noise", () => {
    expect(flagRecordChips("C-2017", "C-2017 and C-2018").map((c) => c.id)).toEqual(["C-2018"]);
  });

  it("keeps a detail id when the entity_id is a slug, because the title is NOT a link", () => {
    // Every entity_id on prod is a slug, so this is the live case, not the edge case.
    expect(flagEntityHref("cg-roofing-group")).toBeNull();
    expect(flagRecordChips("cg-roofing-group", "see C-2017").map((c) => c.id)).toEqual(["C-2017"]);
  });

  it("adds nothing to a row that names no record", () => {
    expect(flagRecordChips(null, "Deploy pipeline went red twice.")).toEqual([]);
    expect(flagRecordChips(null, "")).toEqual([]);
    expect(flagRecordChips(null, null)).toEqual([]);
    expect(flagRecordChips(undefined, undefined)).toEqual([]);
  });

  it("inherits the linkifier's boundaries — an invoice number is not a record", () => {
    expect(flagRecordChips(null, "invoice MLE-2026-100123 and C-2019-draft")).toEqual([]);
  });

  it("points exactly where the same id points inside the detail below it", () => {
    const detail = "Dixith Magadiev [P-1010] and Gulf Coast RE Group [C-2018]";
    const inProse = linkifyRecordIds(detail).filter((s) => s.href);
    expect(flagRecordChips(null, detail)).toEqual(
      inProse.map((s) => ({ id: s.text, href: s.href })),
    );
  });
});

// Q84 inc.23 — the slug entity_ids that inc.20 correctly refused to guess at, resolved
// through the key the CRM itself recorded at the Q70 renumber. Values below are the real
// `legacy_slug` rows read off prod 2026-07-31.
describe("buildSlugIndex / resolveFlagEntityId — the renumber's own mapping", () => {
  const PROD = [
    { id: "C-2017", legacy_slug: "cg-roofing-group" },
    { id: "C-2002", legacy_slug: "spinoff-homeclonevault" },
    { id: "C-2010", legacy_slug: "the-title-base" },
    { id: "P-1008", legacy_slug: "will" },
    { id: "P-1014", legacy_slug: "jonathan-polk" },
  ];

  it("resolves a legacy slug to the record the CRM renumbered it to", () => {
    const ix = buildSlugIndex(PROD);
    expect(resolveFlagEntityId("cg-roofing-group", ix)).toBe("C-2017");
    expect(resolveFlagEntityId("will", ix)).toBe("P-1008");
    // The two equity rows Rob asked about in dev_chat #53.
    expect(flagEntityHref(resolveFlagEntityId("spinoff-homeclonevault", ix))).toBe("/companies/C-2002");
  });

  it("leaves a minted id exactly as it is — no index needed, none consulted", () => {
    expect(resolveFlagEntityId("C-2019", {})).toBe("C-2019");
    expect(resolveFlagEntityId("P-1010", null)).toBe("P-1010");
  });

  it("resolves a slug NO record claims to nothing — a deal slug stays plain text", () => {
    // Live on prod flag #83. No org and no person carries it; sending Rob to a guessed
    // record would be worse than sending him nowhere, which is inc.20's rule intact.
    expect(resolveFlagEntityId("deal-gulf-coast-equity-phase4", buildSlugIndex(PROD))).toBeNull();
    expect(resolveFlagEntityId(null, buildSlugIndex(PROD))).toBeNull();
    expect(resolveFlagEntityId("cg-roofing-group", null)).toBeNull();
  });

  it("REFUSES a slug two different records claim, rather than picking one", () => {
    // Nothing constrains `legacy_slug` across the orgs and people tables. Both targets
    // render a real page, so guessing would fail silently — the one failure mode this
    // whole thread exists to prevent.
    const ix = buildSlugIndex([
      { id: "C-2018", legacy_slug: "caleb-green" },
      { id: "P-1018", legacy_slug: "caleb-green" },
    ]);
    expect(ix["caleb-green"]).toBeUndefined();
    expect(resolveFlagEntityId("caleb-green", ix)).toBeNull();
  });

  it("does not treat the same row read twice as a conflict", () => {
    const ix = buildSlugIndex([
      { id: "C-2017", legacy_slug: "cg-roofing-group" },
      { id: "C-2017", legacy_slug: "cg-roofing-group" },
    ]);
    expect(ix["cg-roofing-group"]).toBe("C-2017");
  });

  it("ignores rows with no slug and never resolves to a malformed id", () => {
    const ix = buildSlugIndex([
      { id: "C-2020", legacy_slug: null },
      { id: "not-an-id", legacy_slug: "broken" },
    ]);
    expect(ix["broken"]).toBe("not-an-id");
    // The index may hold it; the resolver must not hand it to a router.
    expect(resolveFlagEntityId("broken", ix)).toBeNull();
  });

  it("chips drop the entity id once the slug resolves it into the title link", () => {
    // Before inc.23 a slug entity_id was never a link, so an id repeated in the detail
    // was the only way in and had to stay. Now the title carries it — printing it twice
    // is the noise that gets a real finding scrolled past.
    const rid = resolveFlagEntityId("cg-roofing-group", buildSlugIndex(PROD)) as string;
    expect(flagRecordChips(rid, "C-2017 and C-2018 share a host")).toEqual([
      { id: "C-2018", href: "/companies/C-2018" },
    ]);
  });
});
