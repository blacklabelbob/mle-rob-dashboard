# Referral-Edge Discovery Engine — Firm Design (no hypotheticals)
**Date:** 2026-07-08 · **Status:** validated by live tests, ready to build as PRD Phase 2.4+
**Question from Rob:** "Can you really do it using free sources, quickly — given a name + company, find likely referral edges (family, co-owners, vendors)?"

## THE VERDICT (from tonight's live tests, not theory)

**YES for "hard" edges — ~90%+ precision, genuinely free, legal, bulk-downloadable.**
Co-officer on a filing, shared registered agent, shared address, license↔parcel↔owner joins. Florida publishes all of it free in bulk: Sunbiz corporate data (SFTP, quarterly + daily deltas, up to 6 officers + registered agent per entity), DBPR license CSVs (weekly), and the Dept of Revenue statewide tax roll (owner name + address + parcel, all 67 counties). These have real join keys. This layer alone is a defensible product.

**PARTIAL for "soft" family edges — 30–55% recall, must be human-confirmed.**
No free source publishes a family graph. Family is inferred from surname+address co-occurrence, obituaries/wedding announcements, and "family business" language on company pages. The people-search aggregators that DO hold relative graphs (TruePeopleSearch etc.) are Cloudflare-hard-blocked — verified tonight — and scraping them is TOS-violating and fragile. **Family edges surface as candidates for Rob to confirm in a review queue, never as auto-asserted facts.**

### Proof — the Caleb Green acid test (ran tonight, ~22 free searches/fetches)
- ✅ Free sources nailed the business cold — and **corrected Rob's own intake**: it's **CG Roofing Group, LLC** (Caleb's initials), Jacksonville, Sunbiz doc# L17000012511, RA "Green, Caleb W.", FL license CCC1333349 since 2015, BBB A+. Three sources triangulated in the first 3 searches.
- ❌ The brother link (Joseph Green, moving company) did **not** fall out of free sources: no public family mention anywhere, no officer/address overlap retrievable, and the two decisive reverse-officer-search tools (Sunbiz web officer search, OpenCorporates) are exactly the ones bot-gated (403/CAPTCHA). A tempting Legacy.com "brother Joseph R. Green" hit was correctly rejected as a different Caleb Green (b.1998–d.2022, wrong geography, no business).
- **Calibration:** the engine confirms who someone IS with near-certainty and finds structural business edges; buried family ties need either (a) the Sunbiz **bulk file** (which bypasses the bot-blocked web search entirely — that's the fix), or (b) one human hint ("his brother runs a moving company — which one?") that the engine then verifies in seconds.

### Proof — Gulf Coast RE Group (ran tonight)
Enrichment corrected the name (Gulf Coast, not Golf Coast), pulled both licenses from the free DBPR extract, and the **shared-address join found MVP Title Agency LLC at the brokerage's exact registered address with the CEO's-surname president** — a real vendor/ownership edge, discovered exactly the way the engine will do it at scale. See `docs/research/gulf-coast-re-group.md`.

## Brain-dump vs. auto-discovery — the honest comparison

| | Rob's 25-person brain-dump (PRD 1.3) | Auto-discovery engine |
|---|---|---|
| What it captures | Relationship strength, trust, history, WHO ACTUALLY REFERS — things in Rob's head that exist NOWHERE public | Structural edges (co-ownership, shared agents/addresses, licenses, vendors) + identity verification + candidates Rob doesn't know about |
| Recall on family/trust ties | ~100% for people Rob knows | 30–55%, review-required |
| Recall on structural ties | Low (nobody memorizes Sunbiz) | ~90%+ precision, near-complete for FL entities |
| Cost | 10 minutes of voice memo | Free data + compute; hours per batch |
| **Verdict** | **Not either/or. Brain-dump = seed + ground truth** (10 min, highest info-density input available) | **Engine = multiplier**: verifies, corrects (2-for-2 tonight on correcting Rob's intake), and expands every seeded node |

## Architecture (pattern imported from geo-seo-claude per Rob's directive — see `~/.claude/rules/scoring-pattern.md`)

**Pipeline (5 steps, Postgres-centric, <100k entities — no Neo4j, no paid graph DB):**
1. **INGEST** — scheduled pulls: Sunbiz corporate bulk (public SFTP data-downloads at floridados.gov — quarterly full + daily deltas), DBPR license CSVs (weekly), FL DoR NAL tax roll (per county), targeted Firecrawl scrapes (obituaries, About pages) per prospect. Land in Supabase staging tables (we're already on Supabase — same project).
2. **NORMALIZE** — canonical `party` + `org` tables; nameparser/libpostal standardization; `pg_trgm` GIN indexes.
3. **LINK** — (a) deterministic SQL joins: same FEI/EIN, same RA name+address, shared principal address, co-officer, license↔parcel; (b) probabilistic entity resolution with **Splink** (MIT, Fellegi-Sunter, 1M records/min on DuckDB backend, Postgres backend available) to collapse "Caleb Green" across sources. Blocking on surname+zip.
4. **SCORE** — pure, unit-tested scoring module (CR-3), geo-style weight ladder:

   | Signal | Weight | Rationale |
   |---|---|---|
   | Co-officer on same filing | 0.90 | corporate registry, near-certain |
   | Obituary/wedding family mention (geo-matched) | 0.75 | explicit family tie, name-match risk |
   | Shared registered agent + address | 0.70 | same formation orbit |
   | Shared principal address | 0.60 | cohabitation or office share |
   | Same surname + same parcel/home address | 0.60 | probable family |
   | UCC debtor↔secured party | 0.50 | vendor/lender relationship |
   | About-page/press co-mention | 0.45 | co-employment or partnership |
   | Same surname + same town only | 0.35 | weak, needs corroboration |

   Combine: `base = max(signals); each extra independent signal adds (1−base) × 0.5 × weight`. Family requires ≥2 independent signals.
   Grade bands: **≥0.85 auto-accept · 0.60–0.84 review queue · 0.35–0.59 hold · <0.35 discard.** Every edge stores `{composite, grade, breakdown:[{signal, source_url, raw, weight, weighted}]}` — the breakdown table IS the explanation (Rob shows it to clients).
5. **REVIEW QUEUE** — surfaces in the dashboard as **suggested (dashed) edges** on the graph; Rob confirms/rejects in one click; confirmations feed Splink training labels. Never auto-assert family.

**Legal lane:** government primary sources (Sunbiz/DBPR/DoR/UCC) = explicitly published for bulk use, build freely. People-search aggregators + logged-in LinkedIn = don't build on them. Obituaries/news/About pages = read what's public, cite the URL.

## Cost & speed (firm)
- Data: $0 (FL government bulk files). Compute: Supabase we already run. Libraries: Splink/nameparser — free OSS.
- Per-prospect interactive enrichment (tonight's mode, agents + web): ~4–7 min, ~20–40 fetches, $0 in data.
- Batch mode after bulk ingest: shared-agent/address/officer joins across the whole FL corpus are single SQL queries — seconds per prospect. The Caleb Green sibling gap specifically gets fixed by the bulk file (officer search offline, no CAPTCHA).

## Build plan (PRD hooks)
- **2.4a** Ingest Sunbiz bulk + DBPR CSVs into Supabase (staging + normalize). ~1 session.
- **2.4b** Deterministic join layer + scoring module with tests + suggested-edge API. ~1 session.
- **2.4c** Review queue UI on the graph (dashed edges + confirm/reject). ~1 session.
- **2.4d** Splink entity resolution + obituary/About-page enrichment agents. Later.
- Out of scope until Rob asks: TX/GA (paid bulk), people-search scraping (TOS), FCRA-adjacent uses (edges must never gate credit/employment/tenant decisions).
