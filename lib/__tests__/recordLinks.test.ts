import { describe, expect, it } from "vitest";
import {
  buildSlugIndex,
  dealEntityHref,
  entityOrFilter,
  expandEntityFilter,
  flagNamedRecordIds,
  selectRecordFlags,
  flagEntityHref,
  flagTitleHref,
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
