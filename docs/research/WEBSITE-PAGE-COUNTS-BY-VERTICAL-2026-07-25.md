# How many pages does a website actually have — by vertical

**Asked by Rob, 2026-07-25** (scoping the Phase 1 page-count cap). **Method: measured, not surveyed.**

Every number in the first table is a **live count of URLs in the site's own XML sitemap**, pulled 2026-07-25
(`robots.txt` → `sitemap_index.xml` → child maps, recursed one level). Sitemap count ≈ what the site publishes
for indexing; it can undercount (pages omitted from the sitemap) or overcount (URLs not yet indexed). It is a
**small sample (n = 21 attempted, 15 returned)**, not a survey — but it is first-party and reproducible,
which the published "average pages" figures are not (see §3).

---

## 1. Measured — title companies (Rob's second vertical)

| Company | Pages in sitemap |
|---|---|
| [hbwtitle.com](https://hbwtitle.com/) (Access Title, 4 SW-FL offices) | **147** |
| [mvptitleagency.com](https://mvptitleagency.com/) | **169** |
| [heightstitle.com](https://heightstitle.com/) | **113** |
| [florida-title.net](https://florida-title.net/) | **61** |
| [titlepluspros.com](https://titlepluspros.com/) | **40** |
| [lutgerttitle.com](https://lutgerttitle.com/) | **8** |
| **[thetitlebase.com](https://www.thetitlebase.com/) — our own client** | **3** |
| naplesfltitleagency.com | no sitemap / blocked |

**Answer: a typical title company runs 3–170 pages, and most sit under 150.** The median of the seven measured
is **61**. Nothing in this vertical is naturally large — a title agency has services, a team, a few counties,
and a contact page.

**The number that matters for the pitch:** The Title Base publishes **three pages**. A 500-page Phase 1 site is
not "their site, bigger" — it is a programmatic service × county × property-type build they could never staff.
That gap *is* the product, and it's worth saying out loud on the call.

## 2. Measured — everything else

| Site | Vertical | Pages | What generates them |
|---|---|---|---|
| [johnrwood.com](https://www.johnrwood.com/) | Real-estate brokerage (IDX/MLS) | **106,817** | one page per listing, per community, per agent |
| [mathnasium.com](https://www.mathnasium.com/) | Multi-location franchise | **32,851** | location × service matrix |
| [rotorooter.com](https://www.rotorooter.com/) | Multi-location home services | **12,281** | location × service matrix |
| [misen.com](https://misen.com/) | DTC e-commerce (small catalogue) | **782** | SKU × variant × collection |
| [kellyroofing.com](https://www.kellyroofing.com/) | Roofing — the SEO-invested end | **315** | service × city landing pages |
| [dcroofingfl.com](https://dcroofingfl.com/) | Roofing — typical local | **20** | hand-built pages |
| [naplesgrande.com](https://www.naplesgrande.com/) | Hotel / hospitality | **26** | hand-built pages |
| hondaofnaples.com · aspendental.com · premiersothebysrealty.com · woodwardpires.com · atlantisroofingnaples.com · cmrconstruction.com | auto dealer, dental, brokerage, law, roofing | **blocked** | — |

## 3. Published figures — quoted with their weakness stated

Excluding publishers/blogs/portfolios per Rob's framing, the circulating figures are **agency blog posts, not
studies** — no methodology, no sample, no attribution. Directionally consistent with the measurements above,
so recorded, but **not banked as evidence**:

- *"The average business website has 16–65 pages"*; local service 5–15, restaurants 4–10, professional
  services 10–40 — [scalify.ai](https://www.scalify.ai/blog/average-number-of-pages-business-website-2026-data)
- *"E-commerce sites average 227–423 pages"*; B2B "14 to 20" — [acumenstudio.com](https://acumenstudio.com/blog/how-many-pages-should-a-website-have/)

## 4. The answer, in ranges

**Most pages — the database-driven verticals** (a template × a dataset, not a writer):

| Vertical | Typical range |
|---|---|
| Real estate w/ IDX-MLS · auto dealers (a page per VIN) · job boards · classifieds/marketplaces | **10,000 – 250,000+** |
| Multi-location & franchise (location × service) · large e-commerce catalogues | **5,000 – 50,000** |
| Mid e-commerce · directories · travel/hospitality booking | **500 – 5,000** |

**Fewest pages — single-location, single-story businesses:**

| Vertical | Typical range |
|---|---|
| Title agencies · restaurants · salons/med-spas · single-office law & accounting · single-location contractors | **5 – 60** |
| The same businesses *after* an SEO/GEO build (service × city pages) | **150 – 500** |

**The dividing line is not the industry, it's whether pages come from a database or from a human.** Everything
that stays small is written by a person; everything that gets large is generated from inventory, listings,
locations, or SKUs.

## 5. What this means for Phase 1 scope

**500 pages is the right cap for essentially every MLE client.** It sits above the top of the
"SEO-invested local business" band (kellyroofing = 315, our largest measured non-database site), so it is
generous without being unbounded.

**The exception Rob already named is the only real one: IDX/MLS real estate.** Gulf Coast RE Group is scoped at
2,000 pages for exactly this reason, and johnrwood.com at 106,817 shows why even 2,000 is a floor if listings
are syndicated page-per-listing. **Same structural exception, unasked-for but coming:** an auto dealer
(page per vehicle) or a client with a real product catalogue would break the cap the same way.

---

*Method note: counts pulled with a sitemap crawler on 2026-07-25; six domains returned no readable sitemap
(bot-blocked or none published) and are reported as blocked rather than estimated.*
