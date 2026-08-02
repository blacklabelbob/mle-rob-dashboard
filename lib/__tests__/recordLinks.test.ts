import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildSlugIndex,
  dealEntityHref,
  entityOrFilter,
  expandEntityFilter,
  flagHasRecordSurface,
  flagNamedRecordIds,
  flagNamedScope,
  mintedOnly,
  selectRecordFlags,
  flagEntityHref,
  flagTitleHref,
  flagRecordChips,
  linkifyRecordIds,
  resolveFlagEntityId,
} from "@/lib/flags/recordLinks";
import { overviewReadControl } from "@/lib/comms/proposalFlag";

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

  // Q84 inc.29 — the same rule the entity_id arm has always applied, extended to the two
  // links inc.28 put underneath the chips.
  it("drops a chip that links back to the page being read — that is a link to nowhere", () => {
    expect(flagRecordChips(null, F137_DETAIL, ["C-2017"]).map((c) => c.id)).toEqual(["C-2018"]);
  });

  it("drops a chip the scope marker already prints as a link one line below", () => {
    // #137 on C-2017's page: `here` is C-2017 (the chip is a self-link) and `others` is
    // C-2018 (the marker links it). Both go; the header stops repeating the foot of the row.
    const scope = flagNamedScope(null, F137_NAME, F137_DETAIL, "C-2017");
    expect(flagRecordChips(null, F137_DETAIL, ["C-2017", ...(scope?.others ?? [])])).toEqual([]);
  });

  it("suppresses nothing it was not handed — the Overview digest passes no page", () => {
    expect(flagRecordChips(null, F137_DETAIL, null).map((c) => c.id)).toEqual(["C-2017", "C-2018"]);
    expect(flagRecordChips(null, F137_DETAIL, []).map((c) => c.id)).toEqual(["C-2017", "C-2018"]);
    expect(flagRecordChips(null, F137_DETAIL, [""]).map((c) => c.id)).toEqual(["C-2017", "C-2018"]);
  });

  it("keeps every chip on a FILED row, whose marker never renders", () => {
    // A filed row gets no scope marker (inc.28), so nothing below repeats its ids; only the
    // page id itself is dropped, and on prod the entity_id is a slug so the title links nothing.
    const scope = flagNamedScope("cg-roofing-group", F137_NAME, F137_DETAIL, "C-2017");
    expect(scope).toBeNull();
    expect(
      flagRecordChips("cg-roofing-group", F137_DETAIL, ["C-2017", ...(scope?.others ?? [])]).map((c) => c.id),
    ).toEqual(["C-2018"]);
  });

  it("hides no id — every suppressed chip is still a link inside the detail", () => {
    const suppressed = ["C-2017", "C-2018"];
    expect(flagRecordChips(null, F137_DETAIL, suppressed)).toEqual([]);
    const inProse = new Set(linkifyRecordIds(F137_DETAIL).filter((s) => s.href).map((s) => s.text));
    for (const id of suppressed) expect(inProse.has(id)).toBe(true);
  });

  it("leaves a fan-out row's chips alone — `here` is null, so nothing is a self-link", () => {
    // `?person=P-1010` pulls the org's flags too: the row names neither page id, the marker
    // links both, and the chips are the redundant copy. The page id suppresses nothing here.
    const scope = flagNamedScope(null, F137_NAME, F137_DETAIL, "P-1010");
    expect(scope?.here).toBeNull();
    expect(flagRecordChips(null, F137_DETAIL, ["P-1010"]).map((c) => c.id)).toEqual([
      "C-2017",
      "C-2018",
    ]);
    expect(flagRecordChips(null, F137_DETAIL, ["P-1010", ...(scope?.others ?? [])])).toEqual([]);
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

describe("expandEntityFilter (inc.24 — the record page's side of the same lookup)", () => {
  // Read off prod 2026-07-31, the rows the ledger's 16 slug-carrying flags point at.
  const RECORDS = [
    { id: "C-2017", legacy_slug: "cg-roofing-group" },
    { id: "C-2018", legacy_slug: "golf-coast-real-estate-group" },
    { id: "C-2002", legacy_slug: "spinoff-homeclonevault" },
    { id: "P-1018", legacy_slug: "caleb-green" },
    { id: "P-1008", legacy_slug: "will" },
  ];

  it("carries the slug CG Roofing Group was renumbered from — flag #1's entity_id", () => {
    // Before inc.24 the filter was ["C-2017"] and flag #1 (`cg-roofing-group`, open,
    // "Registry conflict: ACTIVE vs dissolved") matched nothing. It is the row Rob asked
    // to see on that company's page in dev_chat #33.
    expect(expandEntityFilter(["C-2017"], RECORDS)).toEqual(["C-2017", "cg-roofing-group"]);
  });

  it("expands every id a person query fans out to — ids first, then slugs as read", () => {
    // `?person=P-1018` becomes [person, ...their orgs] before it reaches here. Slugs
    // follow in the order the caller read the rows, not the order of the ids: the value
    // is a set for Supabase's `.in()`, and pinning the read order keeps it deterministic.
    expect(expandEntityFilter(["P-1018", "C-2017", "C-2018"], RECORDS)).toEqual([
      "P-1018",
      "C-2017",
      "C-2018",
      "cg-roofing-group",
      "golf-coast-real-estate-group",
      "caleb-green",
    ]);
  });

  it("contributes only slugs of records that were asked for", () => {
    // P-1008 ("will") is in the table but not in the query — pulling its flag onto
    // someone else's page is the failure this direction of the lookup must not have.
    expect(expandEntityFilter(["C-2002"], RECORDS)).toEqual(["C-2002", "spinoff-homeclonevault"]);
  });

  it("is a no-op when the records have no legacy slug — the post-Q70 steady state", () => {
    expect(expandEntityFilter(["C-2020"], [{ id: "C-2020", legacy_slug: null }])).toEqual(["C-2020"]);
  });

  it("returns the ids unchanged when nothing was read", () => {
    expect(expandEntityFilter(["C-2017"], [])).toEqual(["C-2017"]);
  });

  it("never duplicates a value the filter already carries", () => {
    // A record whose legacy_slug IS its id, and an id passed twice: Supabase would accept
    // the duplicate, but a filter that grows on every call is how a bug hides.
    expect(expandEntityFilter(["C-2017", "C-2017"], [{ id: "C-2017", legacy_slug: "C-2017" }])).toEqual(["C-2017"]);
  });

  it("surfaces a contested slug on BOTH pages rather than hiding it from both", () => {
    // The deliberate asymmetry with buildSlugIndex, which DROPS a contested slug because
    // guessing a link target sends Rob to the wrong record. Here the finding appears on
    // two pages — visible and self-correcting — instead of on none.
    const contested = [
      { id: "C-2017", legacy_slug: "caleb-green" },
      { id: "P-1018", legacy_slug: "caleb-green" },
    ];
    expect(expandEntityFilter(["C-2017"], contested)).toEqual(["C-2017", "caleb-green"]);
    expect(expandEntityFilter(["P-1018"], contested)).toEqual(["P-1018", "caleb-green"]);
    expect(buildSlugIndex(contested)["caleb-green"]).toBeUndefined();
  });
});

// Q84 inc.25 — the last entity_id on prod that reached nothing: flag #83's
// `deal-gulf-coast-equity-phase4`, which is not a slug of anything — it is a row in `deals`.
describe("dealEntityHref", () => {
  const DEALS = new Set(["deal-gulf-coast-equity-phase4", "deal-cg-roofing-group"]);

  it("links the deal the CRM actually holds — flag #83's row, live on prod", () => {
    expect(dealEntityHref("deal-gulf-coast-equity-phase4", DEALS)).toBe("/deals/deal-gulf-coast-equity-phase4");
  });

  it("REFUSES a `deal-` shaped id the table does not have — the prefix is not evidence", () => {
    // The whole point: a pattern rule would link this straight to a notFound page, which is
    // the "sent Rob to a record that isn't there" failure inc.20 and inc.23 both refused.
    expect(dealEntityHref("deal-invented-by-a-typo", DEALS)).toBeNull();
  });

  it("does not link a legacy org/person slug just because a deal set was passed", () => {
    expect(dealEntityHref("cg-roofing-group", DEALS)).toBeNull();
  });

  it("accepts an array as well as a Set, and is null-safe on both arguments", () => {
    expect(dealEntityHref("deal-jonathan-polk", ["deal-jonathan-polk"])).toBe("/deals/deal-jonathan-polk");
    expect(dealEntityHref("deal-jonathan-polk", null)).toBeNull();
    expect(dealEntityHref(null, DEALS)).toBeNull();
  });
});

describe("flagTitleHref", () => {
  const DEALS = new Set(["deal-gulf-coast-equity-phase4"]);

  it("prefers the minted id the CRM resolved over anything else", () => {
    // entity_ref is inc.23's answer; it outranks a deal lookup because it is the stronger
    // evidence, and the two can never both be true for one row anyway.
    expect(flagTitleHref("C-2017", "cg-roofing-group", DEALS)).toBe("/companies/C-2017");
  });

  it("falls through to the deal page when no org or person claimed the id", () => {
    expect(flagTitleHref(null, "deal-gulf-coast-equity-phase4", DEALS)).toBe("/deals/deal-gulf-coast-equity-phase4");
  });

  it("stays plain text when neither arm resolves — the honest state, not a lost link", () => {
    expect(flagTitleHref(null, "derm-clinic-pilot", DEALS)).toBeNull();
    expect(flagTitleHref(null, null, DEALS)).toBeNull();
  });

  it("degrades to inc.23's behaviour when no deal index is available", () => {
    // A pre-inc.25 response, or a failed deals read: the row renders as it did yesterday.
    expect(flagTitleHref(null, "deal-gulf-coast-equity-phase4", null)).toBeNull();
    expect(flagTitleHref("P-1008", "will", null)).toBe("/people/P-1008");
  });

  // Q84 inc.82 — the title arm gets the deal arm's evidence bar. `P-1043` is the shape prod
  // #101 quotes as an EXAMPLE of saying a record number out loud; people run P-1001..P-1022,
  // so a flag filed on it linked into Next's "This page could not be found."
  const HELD = new Set(["C-2017", "P-1008"]);

  it("refuses a title link for an id the CRM never minted", () => {
    expect(flagTitleHref("P-1043", "P-1043", null, HELD)).toBeNull();
    expect(flagTitleHref("C-9999", "C-9999", null, HELD)).toBeNull();
  });

  it("still links every id the CRM does hold", () => {
    expect(flagTitleHref("C-2017", "cg-roofing-group", DEALS, HELD)).toBe("/companies/C-2017");
    expect(flagTitleHref("P-1008", "will", null, HELD)).toBe("/people/P-1008");
  });

  it("treats an unasked lookup as unasked — a blipped read never de-links the ledger", () => {
    // The non-fatal contract, identical to inc.37's `named_ref`: absence of proof is not
    // proof of absence. Hiding every title link on a hiccup is the worse lie.
    expect(flagTitleHref("P-1043", "P-1043", null, null)).toBe("/people/P-1043");
    expect(flagTitleHref("P-1043", "P-1043", null, undefined)).toBe("/people/P-1043");
  });

  it("confirmed-none suppresses every org/person title link and nothing else", () => {
    expect(flagTitleHref("C-2017", "cg-roofing-group", DEALS, [])).toBeNull();
    // The deal arm is membership-tested on its own index and is untouched by this one.
    expect(flagTitleHref(null, "deal-gulf-coast-equity-phase4", DEALS, [])).toBe("/deals/deal-gulf-coast-equity-phase4");
  });

  it("falls through to the deal arm when the unminted id is also a deal", () => {
    // Refusing the org/person link must not swallow a page that does resolve.
    expect(flagTitleHref("C-9999", "deal-gulf-coast-equity-phase4", DEALS, HELD)).toBe("/deals/deal-gulf-coast-equity-phase4");
  });
});

// Q84 inc.82 — the client's own fallback is the door this fix could have walked back out of.
// `f.entity_href ?? flagEntityHref(entityRef(f))` cannot tell "the field is absent" from "the
// server was asked and said no page", so the refusal above would have been re-derived off the
// id's shape one line later. JSX is unreachable from a unit test, so the source is read — the
// same guard shape inc.81 used, and it was proved by reinstating `??` and watching this fail.
describe("Q84 inc.82 — ThingsToAddress does not resurrect a refused title link", () => {
  it("distinguishes an absent entity_href from a null one", () => {
    const src = readFileSync(new URL("../../components/ThingsToAddress.tsx", import.meta.url), "utf8");
    const line = src.split("\n").find((l) => l.startsWith("const titleHref = "));
    expect(line, "titleHref must stay a single top-level const the guard can read").toBeTruthy();
    expect(line).toContain("f.entity_href !== undefined");
    expect(line).not.toContain("f.entity_href ??");
  });
});

// Q84 inc.26 — every value below is read off prod: 115 of 131 flags carry no `entity_id`,
// and six of them print minted ids in their text while rendering on no record page.
describe("flagNamedRecordIds", () => {
  it("returns the ids a null-entity finding prints, in order, deduped across title+detail", () => {
    // prod #133 (inc.18 wrote it), abridged — names four records, entity_id NULL.
    const detail =
      "\u2192 \u201cDixith\u201d names a person: Dixith Magadiev [P-1010] \u2192 C-2006 \u2014 " +
      "and no org is named exactly \u201cOmega Title\u201d, but C-2019 is the same name plus a qualifier (see C-2018, P-1010)";
    expect(flagNamedRecordIds("Near-miss: Dixith / Omega Title", detail)).toEqual([
      "P-1010",
      "C-2006",
      "C-2019",
      "C-2018",
    ]);
  });

  it("never reads a NAME — #137's title addresses two orgs in prose and yields nothing", () => {
    // The exact string on prod, the reason inc.22 existed. A name is ambiguous by
    // construction; guessing a target is the mistake this whole thread refuses.
    expect(flagNamedRecordIds("CG Roofing Group / Gulf Coast RE Group", "both are in the registry")).toEqual([]);
  });

  it("inherits the boundary rule, so an invoice number is not a record id", () => {
    expect(flagNamedRecordIds(null, "invoice MLE-2026-100123 paid; see C-2017")).toEqual(["C-2017"]);
  });

  it("is null-safe on both fields", () => {
    expect(flagNamedRecordIds(null, null)).toEqual([]);
  });
});

describe("selectRecordFlags", () => {
  // Ordered as the database returns them; the function only drops.
  const ROWS = [
    { id: 137, entity_id: null, title: "CG Roofing Group / Gulf Coast RE Group", detail: "registry conflict \u2014 C-2017 vs C-2018" },
    { id: 26, entity_id: "cg-roofing-group", title: "registry conflict", detail: "filed against the record" },
    { id: 129, entity_id: null, title: "attendees", detail: "P-1002, P-1003, P-1005" },
    { id: 83, entity_id: "deal-gulf-coast-equity-phase4", title: "equity 30%", detail: "verbal only" },
  ];

  it("keeps a finding that NAMES the record alongside the ones filed against it", () => {
    // C-2017's page asked for it; inc.24 widened the filter to its legacy slug.
    const out = selectRecordFlags(ROWS, ["C-2017", "cg-roofing-group"], ["C-2017"]);
    expect(out.map((r) => r.id)).toEqual([137, 26]);
  });

  it("preserves the database ordering rather than re-sorting", () => {
    const out = selectRecordFlags(ROWS, ["C-2017", "cg-roofing-group"], ["C-2017"]);
    expect(out.map((r) => r.id)).toEqual([137, 26]);
  });

  it("matches a filed row EXACTLY \u2014 a slug is not widened a second time here", () => {
    // Ask for the record without inc.24's widening and the slug row drops out; the naming
    // row still lands, because the two arms answer independently.
    expect(selectRecordFlags(ROWS, ["C-2017"], ["C-2017"]).map((r) => r.id)).toEqual([137]);
  });

  it("does not leak a null-entity finding onto a record it never names", () => {
    expect(selectRecordFlags(ROWS, ["P-1014"], ["P-1014"])).toEqual([]);
  });

  it("fans out with the person's orgs, since ?person= asks for both", () => {
    expect(selectRecordFlags(ROWS, ["P-1002"], ["P-1002"]).map((r) => r.id)).toEqual([129]);
  });

  it("leaves a filed deal row reachable only by its own id", () => {
    expect(selectRecordFlags(ROWS, ["deal-gulf-coast-equity-phase4"], []).map((r) => r.id)).toEqual([83]);
  });
});

describe("entityOrFilter", () => {
  it("is a SUPERSET of what selectRecordFlags keeps \u2014 the null arm is always pulled", () => {
    // If the database dropped the null rows, the finding would vanish before reaching the
    // function that documents why, which is the failure mode inc.24 spent an increment on.
    expect(entityOrFilter(["C-2017", "cg-roofing-group"])).toBe(
      'entity_id.in.("C-2017","cg-roofing-group"),entity_id.is.null',
    );
  });

  it("quotes and escapes rather than assuming an id is word-safe", () => {
    // An unquoted comma would silently split one id into two filter terms.
    expect(entityOrFilter(['a,b', 'q"x'])).toBe('entity_id.in.("a,b","q\\"x"),entity_id.is.null');
  });

  it("still pulls the null rows when no record ids survive the widening", () => {
    expect(entityOrFilter([])).toBe("entity_id.in.(),entity_id.is.null");
  });
});

describe("flagHasRecordSurface (inc.27 — the tooltip's question, answered like the filter)", () => {
  it("is true for a row whose title links — the case that already worked", () => {
    expect(flagHasRecordSurface("/companies/C-2017", "registry conflict", "filed here")).toBe(true);
  });

  it("is true for a NULL-entity row that NAMES a minted id — prod #137, which inc.26 put on C-2017", () => {
    // The whole point: no entity_ref, no href, and it still renders on that company's page.
    expect(
      flagHasRecordSurface(null, "CG Roofing Group / Gulf Coast RE Group", "registry conflict — C-2017 vs C-2018"),
    ).toBe(true);
  });

  it("reads the title too, so a finding that puts its id in the header is not called page-less", () => {
    expect(flagHasRecordSurface(null, "P-1010 has no company", "")).toBe(true);
  });

  it("is false when the row names no record at all — the honest 'resolve it here'", () => {
    expect(flagHasRecordSurface(null, "New company domain: roofco.com", "seen in two meetings")).toBe(false);
  });

  it("never reads a NAME — an un-minted entity_name is not a record page", () => {
    // The exact guess inc.19/inc.20 refused twice: "CG Roofing Group" addresses nothing.
    expect(flagHasRecordSurface(null, "CG Roofing Group / Gulf Coast RE Group", "no ids in this sentence")).toBe(false);
  });

  it("agrees with selectRecordFlags on every row — one predicate, not two", () => {
    // The coupling that keeps this from going stale a third time: if a record page would
    // show the row, the tooltip must not tell Rob there is no record page.
    const rows = [
      { id: 137, entity_id: null, title: "CG Roofing Group / Gulf Coast RE Group", detail: "C-2017 vs C-2018" },
      { id: 26, entity_id: "cg-roofing-group", title: "registry conflict", detail: "filed against the record" },
      { id: 55, entity_id: null, title: "New company domain: roofco.com", detail: "seen twice, no ids" },
    ];
    for (const r of rows) {
      const shown = selectRecordFlags(rows, ["C-2017", "cg-roofing-group"], ["C-2017"]).some((k) => k.id === r.id);
      const href = flagTitleHref(resolveFlagEntityId(r.entity_id, { "cg-roofing-group": "C-2017" }), r.entity_id, null);
      if (shown) expect(flagHasRecordSurface(href, r.title, r.detail)).toBe(true);
    }
    // ...and the row no page shows is the one told to resolve on the Overview.
    expect(flagHasRecordSurface(null, rows[2].title, rows[2].detail)).toBe(false);
  });

  // Q84 inc.38 — inc.37 proved a minted-LOOKING id is not a record and confirmed the
  // marker's and the chips' ids against the CRM. This was the last reader still inferring
  // a record page from the pattern alone, and it is the one whose answer decides whether
  // checking a box on the Overview clears a finding's only surface.
  it("inc.38: a phantom id is not a record page — the tooltip stops promising one", () => {
    // #101's real shape, reduced: the CRM holds P-1001 and C-2001; P-1043 is an example
    // inside a quote and no such person exists.
    const detail = 'the id in the address bar is the one to say out loud ("pull up P-1043")';
    expect(flagHasRecordSurface(null, "Say the id, not the name", detail, ["P-1001", "C-2001"])).toBe(false);
    // Unfiltered — a caller that cannot say — keeps today's answer rather than dropping it.
    expect(flagHasRecordSurface(null, "Say the id, not the name", detail)).toBe(true);
  });

  it("inc.38: a row naming a real record keeps its page even when it also names a phantom", () => {
    // Prod #101 itself: the only partial row on the ledger today (all 131 re-read). Its
    // tooltip was right before this change and must stay right after it.
    const detail = "P-1001 at C-2001 — the id to say out loud is the one in the bar (\"pull up P-1043\")";
    expect(flagHasRecordSurface(null, "Say the id, not the name", detail, ["P-1001", "C-2001"])).toBe(true);
  });

  it("inc.38: a title link still wins before any id is confirmed — evidence order unchanged", () => {
    // A filed row reaches its page through `entity_ref`/deals, never through the sentence,
    // so an empty confirmed set must not take the page away from it.
    expect(flagHasRecordSurface("/deals/deal-gulf-coast-equity-phase4", "Gulf Coast equity", "P-1043", [])).toBe(true);
  });

  it("inc.38: agrees with selectRecordFlags on the phantom row too — still one predicate", () => {
    // The same coupling as the test above, extended to the case inc.37 uncovered: a page
    // asked for by minted id can never match a phantom, so the tooltip must not claim one.
    const rows = [{ id: 101, entity_id: null, title: "Say the id", detail: "pull up P-1043" }];
    expect(selectRecordFlags(rows, ["P-1001"], ["P-1001"])).toHaveLength(0);
    expect(flagHasRecordSurface(null, rows[0].title, rows[0].detail, ["P-1001", "C-2001"])).toBe(false);
  });

  // Q84 inc.39 — inc.38's coupling test only ever walked rows a page asked for BY ITS OWN ID.
  // A person's page does not: `/api/admin/flags?person=P-1001` fans out through
  // `org_memberships` and asks with `[P-1001, ...that person's orgs]`, so a row naming only
  // C-2017 renders on P-1001's page without naming P-1001 anywhere. These pin that arm, and
  // the last one pins WHAT the agreement rests on so a future schema change cannot quietly
  // remove it and leave the tests green.
  describe("inc.39: the ?person= org-membership fan-out", () => {
    // The CRM's own set, as `withNamedRefs` reads it out of `orgs` + `people`.
    const HELD = ["P-1001", "C-2017", "C-2018", "C-2001"];
    // Exactly what the route builds: the page's own id, then every org id the membership
    // table returns for that person.
    const wantedForPerson = (personId: string, orgIds: string[]) => [personId, ...orgIds];

    it("keeps a row that names the person's ORG on the person's page — and the tooltip agrees", () => {
      // Prod #137's shape: filed against nothing, names two companies, names no person.
      const rows = [
        { id: 137, entity_id: null, title: "CG Roofing Group / Gulf Coast RE Group", detail: "C-2017 vs C-2018" },
      ];
      const wanted = wantedForPerson("P-1001", ["C-2017"]);
      expect(selectRecordFlags(rows, wanted, wanted)).toHaveLength(1);
      // The row is on a page whose id it never prints — and it still has a record page, so
      // the Overview must not say "resolve it here".
      expect(flagHasRecordSurface(null, rows[0].title, rows[0].detail, HELD)).toBe(true);
    });

    it("agrees on every row the fan-out surfaces — the coupling, extended to the wider ask", () => {
      const rows = [
        { id: 137, entity_id: null, title: "registry conflict", detail: "C-2017 vs C-2018" },
        { id: 101, entity_id: null, title: "Say the id", detail: 'the one in the bar ("pull up P-1043")' },
        { id: 55, entity_id: null, title: "New company domain: roofco.com", detail: "seen twice, no ids" },
      ];
      const wanted = wantedForPerson("P-1001", ["C-2017", "C-2018"]);
      for (const r of rows) {
        const shown = selectRecordFlags(rows, wanted, wanted).some((k) => k.id === r.id);
        if (shown) expect(flagHasRecordSurface(null, r.title, r.detail, HELD)).toBe(true);
      }
      // #101 names a phantom and #55 names nothing: the fan-out puts neither on the page, and
      // the tooltip calls neither page-less-by-mistake.
      expect(selectRecordFlags(rows, wanted, wanted).map((r) => r.id)).toEqual([137]);
    });

    it("a row FILED against the person's org rides the fan-out too, and its title link answers", () => {
      // The other arm of the filter: `entity_id` matched against the widened list, including
      // the pre-Q70 slug the record was renumbered from (inc.24).
      const rows = [{ id: 26, entity_id: "cg-roofing-group", title: "registry conflict", detail: "no ids here" }];
      const wanted = wantedForPerson("P-1001", ["C-2017"]);
      const filed = [...wanted, "cg-roofing-group"];
      expect(selectRecordFlags(rows, filed, wanted)).toHaveLength(1);
      const href = flagTitleHref(resolveFlagEntityId("cg-roofing-group", { "cg-roofing-group": "C-2017" }), "cg-roofing-group", null);
      // Empty `minted` on purpose: a filed row must reach its page through the link, never
      // through the sentence, so no confirmed-id set can take the page away from it.
      expect(flagHasRecordSurface(href, rows[0].title, rows[0].detail, [])).toBe(true);
    });

    it("names what the agreement rests on: an unheld id in `wanted` is what would break it", () => {
      // Not a defect today and not reachable today — `org_memberships_org_id_fkey`
      // (REFERENCES orgs(id) ON UPDATE CASCADE ON DELETE CASCADE, verified on PROD) makes a
      // membership pointing at a non-record impossible, and the person half comes off a
      // record the page already loaded or it called notFound(). This test exists so that if
      // that constraint is ever dropped, the consequence is written down where the next
      // reader will find it: the row is kept, the tooltip says page-less, and the Overview
      // tells Rob to resolve a finding that is sitting on a page he never opened.
      const rows = [{ id: 900, entity_id: null, title: "conflict", detail: "C-9999 vs C-2017" }];
      const wanted = wantedForPerson("P-1001", ["C-9999"]); // a membership the FK forbids
      expect(selectRecordFlags(rows, wanted, wanted)).toHaveLength(1);
      expect(flagHasRecordSurface(null, rows[0].title, rows[0].detail, ["P-1001", "C-9999"])).toBe(true);
      // This one survives the CRM's real set anyway — it also names C-2017, a record — which
      // is why the disagreement needs a row naming ONLY the id the broken membership carries.
      expect(flagHasRecordSurface(null, rows[0].title, rows[0].detail, ["P-1001", "C-2017"])).toBe(true);
      const namesOnlyPhantom = [{ id: 901, entity_id: null, title: "conflict", detail: "C-9999 alone" }];
      expect(selectRecordFlags(namesOnlyPhantom, wanted, wanted)).toHaveLength(1);
      expect(flagHasRecordSurface(null, namesOnlyPhantom[0].title, namesOnlyPhantom[0].detail, ["P-1001"])).toBe(false);
    });
  });

  // Q84 inc.83 — inc.82's named next. `selectRecordFlags`'s two arms are EXCLUSIVE; this
  // predicate's were not. Before inc.82 that could not show, because an id-shaped `entity_id`
  // always produced a link and the name arm was unreachable for a filed row. Now it is.
  describe("inc.83: a FILED row is judged by its filing, never by its sentence", () => {
    const HELD = ["P-1001", "C-2001", "C-2017"];

    it("calls a filed-on-a-phantom row page-less even when its detail names a real record", () => {
      // The defect, exactly: filed on P-1043 (people run P-1001..P-1022 — no such record), and
      // the sentence happens to print C-2001. inc.82 makes the server refuse the title link.
      const row = { id: 902, entity_id: "P-1043", title: "check this", detail: "same as C-2001" };
      // The filter: the filed arm looks up P-1043, which no page's `entityFilter` carries, and
      // the sentence is never read. So the row renders on NO record page.
      const wanted = ["P-1001", "C-2001", "C-2017"];
      expect(selectRecordFlags([row], wanted, wanted)).toHaveLength(0);
      // Therefore the Overview is its only surface, and the tooltip must say so.
      expect(flagHasRecordSurface(null, row.title, row.detail, HELD, row.entity_id)).toBe(false);
      expect(overviewReadControl(row.title, false).tooltip).toContain("no record page");
    });

    it("the server's refusal is what this reads — not the id's shape", () => {
      // `flagTitleHref` with a `held` set that does not contain P-1043 is the null above.
      expect(flagTitleHref("P-1043", "P-1043", null, HELD)).toBeNull();
      // And with `held` NOT ASKED (a blipped lookup) the link survives, so the row keeps its
      // page and this predicate never reaches the filed-arm refusal. Both directions pinned:
      // the fix must not de-page a row because a read failed.
      expect(flagTitleHref("P-1043", "P-1043", null, null)).toBe("/people/P-1043");
      expect(flagHasRecordSurface("/people/P-1043", "check this", "same as C-2001", HELD, "P-1043")).toBe(true);
    });

    it("leaves the NULL-entity rows inc.26/27 fixed exactly as they were", () => {
      // Prod #137: filed against nothing, so the sentence IS how it reaches a page — the arm
      // this increment narrowed must not touch it.
      const row = { id: 137, entity_id: null, title: "registry conflict", detail: "C-2017 vs C-2018" };
      expect(flagHasRecordSurface(null, row.title, row.detail, HELD, row.entity_id)).toBe(true);
      // And a filed row that DOES resolve keeps its page through the link, as inc.39 pinned.
      expect(flagHasRecordSurface("/companies/C-2017", "filed here", "no ids", [], "C-2017")).toBe(true);
    });

    it("omitting the argument keeps the pre-inc.83 answer — unproven by default, like `minted`", () => {
      // A caller that cannot say gets today's behaviour, never a silent drop. This is what
      // keeps every other call site in the repo meaning what it meant.
      expect(flagHasRecordSurface(null, "check this", "same as C-2001", HELD)).toBe(true);
      expect(flagHasRecordSurface(null, "check this", "same as C-2001", HELD, null)).toBe(true);
    });

    it("the read gate's call site passes the filing — the guard, because JSX is untestable", () => {
      // CR-3, and the same reason inc.82 pinned its `!== undefined`: the argument that makes
      // the tooltip honest is one deletion from silently reverting, and the only place it can
      // be checked is the source. Same close-on-the-real-terminator trick as the chips guard
      // below — the earlier arguments contain calls, so `[^)]*` would read a nested paren.
      const src = readFileSync(
        path.join(process.cwd(), "components", "ThingsToAddress.tsx"),
        "utf8",
      );
      const calls = [...src.matchAll(/flagHasRecordSurface\(([\s\S]*?)\)\s*\n\s*\);/g)].map((m) => m[1]);
      expect(calls.length).toBe(1); // one read gate, on the digest
      expect(calls[0]).toContain("f.entity_id");
    });
  });
});

// Q84 inc.28 — the row is on the page (inc.26) and the Overview no longer calls it
// page-less (inc.27). This is what it must SAY once it is there.
describe("flagNamedScope — a finding that is on this page without being filed against it", () => {
  const NAME_137 = "CG Roofing Group / Gulf Coast RE Group";
  const DETAIL_137 = "the registry lists C-2017 and C-2018 under one FEIN — confirm which is the filer";

  it("marks prod #137 on C-2017's page and names the OTHER company it is also sitting on", () => {
    const s = flagNamedScope(null, NAME_137, DETAIL_137, "C-2017");
    expect(s).toEqual({ named: ["C-2017", "C-2018"], here: "C-2017", others: ["C-2018"] });
  });

  it("says nothing about a FILED row — its header already names the record it is filed against", () => {
    expect(flagNamedScope("cg-roofing-group", "registry conflict", DETAIL_137, "C-2017")).toBeNull();
    expect(flagNamedScope("C-2017", "registry conflict", DETAIL_137, "C-2017")).toBeNull();
  });

  it("says nothing when the finding names no minted id — that row got here by being filed", () => {
    expect(flagNamedScope(null, "New company domain: roofco.com", "seen in two meetings", "C-2017")).toBeNull();
  });

  it("never reads a NAME: 'CG Roofing Group' in the header addresses nothing", () => {
    expect(flagNamedScope(null, NAME_137, "no ids in this sentence", "C-2017")).toBeNull();
  });

  it("leaves `here` null rather than guessing when the page id is not one the row names", () => {
    // The fan-out case: `?person=P-1010` also pulls that person's org's flags, so a row can
    // legitimately be on a page whose id it never prints. Naming a record it does not name
    // would be the exact wrong-record mistake this whole thread refuses.
    const s = flagNamedScope(null, NAME_137, DETAIL_137, "P-1010");
    expect(s).toEqual({ named: ["C-2017", "C-2018"], here: null, others: ["C-2017", "C-2018"] });
  });

  it("works with no page id at all — the caller may not know which record it is rendering", () => {
    expect(flagNamedScope(null, NAME_137, DETAIL_137)?.here).toBeNull();
  });

  // inc.37 renamed this case rather than deleting it, because what it proves is still true
  // and what it was READ as saying is what shipped the bug: every id gets a well-formed
  // href. That is the SHAPE of a link, not the existence of the record behind it — see the
  // P-1043 block below for the half this never covered.
  it("every id it prints gets a well-formed href — the marker never renders a raw id", () => {
    const s = flagNamedScope(null, "P-1010 and C-2006 disagree", "see also C-2019", "C-2006");
    for (const id of s?.named ?? []) expect(flagEntityHref(id)).toBeTruthy();
    expect(s?.others).toEqual(["P-1010", "C-2019"]);
  });

  it("marks exactly the rows selectRecordFlags kept for NAMING, and no others", () => {
    // The coupling test, same shape as inc.27's: the page shows two kinds of row, and the
    // marker must appear on precisely the kind that is not filed against this record.
    const rows = [
      { id: 137, entity_id: null, title: NAME_137, detail: DETAIL_137 },
      { id: 26, entity_id: "cg-roofing-group", title: "registry conflict", detail: "filed against C-2017" },
      { id: 55, entity_id: null, title: "New company domain: roofco.com", detail: "seen twice, no ids" },
    ];
    const shown = selectRecordFlags(rows, ["C-2017", "cg-roofing-group"], ["C-2017"]);
    expect(shown.map((r) => r.id)).toEqual([137, 26]);
    const marked = shown.filter((r) => flagNamedScope(r.entity_id, r.title, r.detail, "C-2017"));
    expect(marked.map((r) => r.id)).toEqual([137]);
  });
});

// Q84 inc.37 — an id that MATCHES the pattern is not the same thing as a record.
//
// Prod #101, read live today: its detail quotes Rob's own instruction — `the id you now see
// in the address bar is the one to say out loud ("pull up P-1043")`. `P-1043` is an EXAMPLE
// inside that quote. People on prod run P-1001..P-1022; there is no P-1043. Every sentence
// built off the named set therefore claimed a dead-end page (it answers 200 and renders
// Next's "This page could not be found." screen — checked, not an HTTP 404), and the Resolve
// button offered
// to clear the finding from it.
describe("mintedOnly / flagNamedScope — the CRM confirms which named ids are records", () => {
  const T_101 = "Record numbers are now LIVE on prod";
  const D_101 =
    "P-1001 and C-2001 renumbered. The id in the address bar is the one to say out loud " +
    '("pull up P-1043").';
  // What /api/admin/flags?person=P-1001 confirms it holds, of the three ids #101 prints.
  const HELD = ["P-1001", "C-2001"];

  it("drops the example id: #101 on P-1001's page names C-2001 and nothing else", () => {
    const s = flagNamedScope(null, T_101, D_101, "P-1001", HELD);
    expect(s).toEqual({ named: ["P-1001", "C-2001"], here: "P-1001", others: ["C-2001"] });
  });

  it("without the confirmed set it behaves exactly as it did before — absence is not disproof", () => {
    const s = flagNamedScope(null, T_101, D_101, "P-1001");
    expect(s?.others).toEqual(["C-2001", "P-1043"]);
    expect(flagNamedScope(null, T_101, D_101, "P-1001", null)?.others).toEqual(["C-2001", "P-1043"]);
  });

  it("an empty confirmed set is a real answer: no named record, so no marker at all", () => {
    expect(flagNamedScope(null, T_101, D_101, "P-1001", [])).toBeNull();
  });

  it("the chips take the same set, or the phantom returns the moment the marker stops linking it", () => {
    // The marker suppresses a chip by LINKING that id (inc.29), so P-1043 — no longer named —
    // is no longer in `alreadyLinked`. Only the shared confirmed set keeps it off the row.
    const chips = flagRecordChips(null, D_101, ["P-1001", "C-2001"], HELD);
    expect(chips.map((c) => c.id)).toEqual([]);
    const unfiltered = flagRecordChips(null, D_101, ["P-1001", "C-2001"]);
    expect(unfiltered.map((c) => c.id)).toEqual(["P-1043"]);
  });

  it("mintedOnly keeps print order and never invents an id the row did not print", () => {
    expect(mintedOnly(["C-2017", "C-2018"], ["C-2018", "C-2017", "C-2099"])).toEqual([
      "C-2017",
      "C-2018",
    ]);
    expect(mintedOnly(["C-2017"], undefined)).toEqual(["C-2017"]);
  });

  it("leaves the honest rows untouched — #137's two companies both exist", () => {
    const s = flagNamedScope(
      null,
      "CG Roofing Group / Gulf Coast RE Group",
      "the registry lists C-2017 and C-2018 under one FEIN",
      "C-2017",
      ["C-2017", "C-2018"],
    );
    expect(s).toEqual({ named: ["C-2017", "C-2018"], here: "C-2017", others: ["C-2018"] });
  });
});

// ---------------------------------------------------------------------------
// Q84 inc.81 — the last reader of a printed id that never got the confirmed set.
//
// inc.37 established the rule and stated the cost of breaking it in the source:
// "the chips take the same confirmed set as the marker, and they have to". inc.38
// carried `named_ref` to the Overview for the surface predicate. The chips two
// lines below it were left on the 2-argument call — so on the ONE surface Rob
// scans, an id shape the CRM never minted rendered as a chip linking to a record
// that does not exist, while the full row correctly refused to draw it.
// ---------------------------------------------------------------------------
describe("Q84 inc.81 — the digest's chips take the same confirmed set as the row's", () => {
  // A detail that prints two well-formed ids of which the CRM holds exactly one.
  // This is not hypothetical: `flagNamedRecordIds` reads ids out of PROSE, and
  // prose is written by checks that quote transcripts and pre-renumber records.
  const DETAIL = "Heard as Omega Title [C-2019]; the older note still says [C-1994].";
  const HELD = ["C-2019"];

  it("draws only the id the CRM holds when it is handed the confirmed set", () => {
    expect(flagRecordChips(null, DETAIL, null, HELD).map((c) => c.id)).toEqual(["C-2019"]);
  });

  it("draws the dead link when the set is withheld — the defect, pinned", () => {
    // The 2-argument call the Overview used to make. Kept as a test rather than a
    // comment so that re-introducing it is a failure and not a code review.
    expect(flagRecordChips(null, DETAIL).map((c) => c.id)).toEqual(["C-2019", "C-1994"]);
  });

  it("still degrades open when the server could not confirm — null is not an empty CRM", () => {
    // `withEntityRefs` returns `named_ref: null` when the lookup itself errored. A
    // filter built from that would hide every chip on a database hiccup, which is a
    // worse lie than an occasional dead link. Unfiltered is the honest fallback, and
    // it is the same fallback the full row already had.
    expect(flagRecordChips(null, DETAIL, null, null).map((c) => c.id)).toEqual(["C-2019", "C-1994"]);
    expect(flagRecordChips(null, DETAIL, null, undefined).map((c) => c.id)).toEqual(["C-2019", "C-1994"]);
  });

  it("draws nothing when the CRM confirmed none of them — [] is an answer, null is not", () => {
    expect(flagRecordChips(null, DETAIL, null, [])).toEqual([]);
  });

  it("agrees with the predicate that decides the row even has a record surface", () => {
    // One confirmed set, three readers: the chips, the surface predicate, the scope.
    // If they ever disagree the Overview offers a way into a record it also claims
    // the finding cannot reach.
    expect(flagHasRecordSurface(null, "Two orgs", DETAIL, HELD)).toBe(true);
    expect(mintedOnly(flagNamedRecordIds("Two orgs", DETAIL), HELD)).toEqual(["C-2019"]);
    expect(flagRecordChips(null, DETAIL, null, HELD).map((c) => c.id)).toEqual(
      mintedOnly(flagNamedRecordIds("Two orgs", DETAIL), HELD),
    );
  });

  it("every flagRecordChips call site in the ledger passes the confirmed set", () => {
    // CR-3: the rule lives in a check, not in a comment. Both call sites are JSX and
    // neither is reachable from a unit test, so the source is the artifact under test —
    // the same reason inc.20's digest/row split went unnoticed for eighteen increments.
    const src = readFileSync(
      path.join(process.cwd(), "components", "ThingsToAddress.tsx"),
      "utf8",
    );
    // Closed on `).map(` rather than on the first `)`: the first argument is itself a
    // call (`entityRef(f)`), so a naive `[^)]*` reads one nested paren and asserts against
    // "entityRef(f" — a guard that fails on correct code, which is how guards get deleted.
    const calls = [...src.matchAll(/flagRecordChips\(([\s\S]*?)\)\.map\(/g)].map((m) => m[1]);
    expect(calls.length).toBe(2); // exactly two surfaces: the digest and the full row
    for (const args of calls) expect(args).toContain("f.named_ref");
  });

  it("the archive mark is handed the row's PRINTED ids, not just its spans (inc.84)", () => {
    // CR-3, same reason as the guard above: the call is JSX and unreachable from a unit
    // test, and one deleted argument silently restores the pre-inc.84 answer — a filed
    // row's own printed id qualified as somebody else's page.
    const src = readFileSync(
      path.join(process.cwd(), "components", "ThingsToAddress.tsx"),
      "utf8",
    );
    const call = /archiveResolvedFromMark\(([\s\S]*?)\n\s*\);/.exec(src);
    expect(call).not.toBeNull();
    const args = (call as RegExpExecArray)[1];
    // The spans argument must STAY the scope's — feeding it the printed ids would claim a
    // filed row is closed on records its filing never puts it on.
    expect(args).toContain("archiveScope?.named");
    expect(args).toContain("f.named_ref");
  });
});
