# CRM Enrichment Gap Audit
**Date:** 2026-07-17 · **Source:** Supabase `people` table (read-only audit) · **Trigger:** Rob 2026-07-17 — "you should be bringing in phone #s and hard data about the company as well as connections thru social media"

## Headline numbers

| Metric | Value |
|---|---|
| Live records audited | **34** (task brief said 36; 2 contact rows were folded into notes on 2026-07-17 per CG Roofing note — "admins are notes on the lead, not rows") |
| Average completeness score | **1.94 / 6** |
| Records with a phone number | **2 / 34** (one flagged "public record — unverified") |
| Records with an email | **1 / 34** (info@ generic) |
| Records with a company/personal website | **2 / 34** |
| Records with any social link | **5 / 34** (mostly source citations buried in description text, not usable fields) |
| Records with a role/title | 32 / 34 |
| Records with substantive description (>100 chars) | 24 / 34 |

**Diagnosis:** the narrative layer (role, description, deal context) is strong; the *contact layer* (phone, email, website, socials) is nearly empty — including on the **signed clients**. Rob's complaint is verified.

## Gap Matrix (score 0–6: Phone / Email / Website / Role / Description / Social)

Sorted worst-first. ✅ = present, — = missing.

| # | Record | Kind | Node type | Status | $ | P | E | W | R | D | S | Score |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | De Cecco USA | company | (none) | unlit | — | — | — | — | — | — | — | **0** |
| 2 | Atlanta roofing contractor (TBD) | company | lead | unlit | — | — | — | — | ✅ | — | — | **1** |
| 3 | David Cates | person | rep-candidate | warm | — | — | — | — | — | ✅ | — | **1** |
| 4 | Dermatology clinic (pilot #1) | company | lead | unlit | — | — | — | — | ✅ | — | — | **1** |
| 5 | George (Dix's EU contact) / Guest Genie | person | lead | unlit | — | — | — | — | ✅ | — | — | **1** |
| 6 | LandTech | company | lead | unlit | — | — | — | — | ✅ | — | — | **1** |
| 7 | PropLogic | company | lead | unlit | — | — | — | — | ✅ | — | — | **1** |
| 8 | Qualia | company | lead | unlit | — | — | — | — | ✅ | — | — | **1** |
| 9 | Rob Acheson | person | mle-admin | lit | — | — | — | — | ✅ | — | — | **1** (internal) |
| 10 | Will | person | mle-admin | lit | — | — | — | — | ✅ | — | — | **1** (internal) |
| 11 | Will's Big-Network Contact A | person | connector | warm | — | — | — | — | ✅ | — | — | **1** (placeholder) |
| 12 | Alex Greenwood | person | connector | warm | $18k unsigned | — | — | — | ✅ | ✅ | — | **2** |
| 13 | CG Roofing Group | company | vertical-anchor | lit | **$10k SIGNED** | — | — | — | ✅ | ✅ | — | **2** |
| 14 | Caleb Green | person | client | lit | **$10k SIGNED** | — | — | — | ✅ | ✅ | — | **2** |
| 15 | Chris Acheson | person | connector | warm | — | — | — | — | ✅ | ✅ | — | **2** |
| 16 | Dix Healthcare AI (7 models) | company | partner | warm | — | — | — | — | ✅ | ✅ | — | **2** |
| 17 | Dixith (thedevdix) | person | partner | warm | — | — | — | — | ✅ | ✅ | — | **2** (email exists in description: [email redacted @gmail.com] — not in email field!) |
| 18 | Gulf Coast RE Group | company | vertical-anchor | lit | **$19k (signed flag ⚠️)** | — | — | — | ✅ | ✅ | — | **2** |
| 19 | Joe Fleming | person | lead | unlit | — | — | — | — | ✅ | ✅ | — | **2** |
| 20 | Jonathan (John) Burns | person | connector | warm | — | — | — | — | ✅ | ✅ | — | **2** |
| 21 | Jonathan Polk | person | connector | lit | $0 (free LinkedIn work) | — | — | — | ✅ | ✅ | — | **2** |
| 22 | Miga Food Manufacturing | company | lead | warm | — | — | — | — | ✅ | ✅ | — | **2** |
| 23 | Naples Spine & Joint | company | client | lit | **$5k SIGNED** | — | — | — | ✅ | ✅ | — | **2** |
| 24 | Oasis The Kitchen Lounge | company | (none) | unlit | — | — | — | — | ✅ | ✅ | — | **2** |
| 25 | Omega Title (FL) | company | vertical-anchor | unlit | — | — | — | — | ✅ | ✅ | — | **2** |
| 26 | Red Rock Roofing (UT) | company | lead | warm | — | — | — | — | ✅ | ✅ | — | **2** |
| 27 | Vive Health | company | vertical-anchor | warm | — | — | — | — | ✅ | ✅ | — | **2** |
| 28 | Daniella Roach | person | connector | unlit | — | — | — | — | ✅ | ✅ | ✅ | **3** (LinkedIn URL parked in `website` field) |
| 29 | Gary Waskovich | person | lead | warm | — | — | — | — | ✅ | ✅ | ✅ | **3** (LinkedIn only as citation text) |
| 30 | Giovanni Spazioso | person | connector | warm | — | — | — | — | ✅ | ✅ | ✅ | **3** (LinkedIn only as citation text) |
| 31 | On Time Moving and Storage | company | lead | unlit | $7k quoted | — | — | ✅ | ✅ | ✅ | — | **3** |
| 32 | Trent Brands | person | vertical-anchor | warm | — | — | — | — | ✅ | ✅ | ✅ | **3** (LinkedIn only as citation text) |
| 33 | Michael Jaenvega | person | (none) | unlit | — | ✅* | — | — | ✅ | ✅ | ✅ | **4** (*phone unverified public record; LinkedIn in `website` field) |
| 34 | Martin Fierro Restaurant | company | (none) | unlit | — | ✅ | ✅ | ✅ | ✅ | ✅ | — | **5** — the only properly enriched record; use as the template |

**Worst offenders relative to value:** Caleb Green + CG Roofing Group (SIGNED $10k client — zero phone/email/website), Gulf Coast RE Group ($19k — zero contact data), Naples Spine & Joint (signed $5k — zero contact data), De Cecco USA (score 0, completely empty shell).

## Top-10 Priority Enrichment List (weighted: signed/quoted $ → lead heat → connector value)

Each line is a concrete hunt an enrichment agent can execute. Rule from the Martin Fierro template: phone + email + website into their **dedicated columns**, socials as URLs, Sunbiz/registry entity + officers, review/traffic counts, all with source URLs.

### 1. Caleb Green — SIGNED client, $10k (roofing)
- Direct cell + email: **ask Rob/Will first** (they text him — this is a 30-second internal ask, not a web hunt).
- cgroofinggroup.com (or actual domain — find via Google "CG Roofing Group Jacksonville"): office phone, email, service area.
- LinkedIn: linkedin.com/search "Caleb Green CG Roofing Jacksonville"; Facebook/Instagram of CG Roofing Group.
- FL Sunbiz: "CG ROOFING GROUP, LLC" — officers, FEI/EIN, principal address, registered agent (confirms legal entity for the 3-way CRM partnership contracts now with counsel).
- FL DBPR: roofing contractor license number (CCC#) under Caleb Green / CG Roofing Group.
- Utah entity search: Red Rock Roofing registration status (gates the partnership timeline).
- CFO Kelly: full name + email (Rob owes her a technical brief; Caleb owes the email — chase it).

### 2. CG Roofing Group — SIGNED company record, $10k (roofing)
- Company phone, address, website → dedicated fields (share hunt #1's findings; keep both rows in sync).
- Google Business Profile: review count + rating, categories (baseline for the Phase 1 before/after case study).
- Yelp/BBB/Angi listings + review counts; ADA-risk note on old site says capture current site URL before replacement.
- Social: company Facebook, Instagram, LinkedIn company page + follower counts.

### 3. Gulf Coast RE Group — $19k agreement, signature stalled ⚠️ (title/RE)
- ⚠️ Resolve data conflict first: row says `signed=true, quoted=19000` while relationship text says "$18k SENT 6/19 … NOT SIGNED (stalled ~3 weeks)". Ask Rob which is true; fix the flag or the note.
- Team site URL (Gulf Coast RE Group under Realty ONE Group MVP — find the live domain; Alex mentioned localhomes.com vs hyperlocalhomes.com, CONFIRM which).
- Office phone + address (Realty ONE Group MVP, Collier County).
- Agent roster count (contract says "up to 60 individual websites" — verify actual headcount, 50 vs 56 vs 60 appears in three places).
- MVP Title Agency LLC (shares registered address) — Sunbiz pull: officers, status. This is the adjacent title-vertical door.

### 4. Alex Greenwood — KDM for #3, connector (title/RE)
- Cell + direct email: Rob/Will have met him repeatedly (6/16, 6/17, 6/20 calls) — internal ask first, then gulfcoast site / DBPR license record (SL3227669 already on file).
- LinkedIn profile URL + Facebook; realtor.com / Zillow agent profiles (review counts = his "site = 85% of revenue" claim's public face).
- Sunbiz: ROG MVP Collier County LLC officers (his brokerage entity) + any HyperLocal / HomeCloneVault / Website Factory entity registrations (validates the 4-venture story).
- Boomtown replacement timeline evidence: any public job posts / Upwork postings for his internal 60-agent app.

### 5. Naples Spine & Joint — SIGNED client, $5k (medical)
- Website URL, office phone, booking line → fields (they're a live client; this is inexcusable to be missing).
- Monica: full name, role (co-owner?), email, phone — she's named in description but has no data anywhere.
- Google Business Profile + Yelp: review counts EN + any Spanish-language reviews (they funded Spanish-audience changes — baseline it).
- FL DOH practitioner license for the treating chiropractor(s); Sunbiz entity for the practice.
- Instagram/Facebook of the clinic + follower counts (med-spa adjacency pitch needs these).

### 6. Jonathan Polk — lit connector, referral machine (medical)
- Phone + email: Rob runs his LinkedIn automation — **the LinkedIn login/profile URL is already in MLE's hands**; copy profile URL into the record now.
- His company/role: what does Polk actually do? Record has no employer. Resolve via LinkedIn.
- Named contacts at PropLogic, LandTech, Qualia ("their reps say he is their #1") — get the three rep names from Polk; those become new edges.

### 7. On Time Moving and Storage — $7k quoted (home-services)
- Phone from ontimemovingandstorage.com (site already in record) + email.
- Owner Joseph Green: cell via Caleb (brother — internal ask), LinkedIn/Facebook.
- FL Sunbiz: legal entity name, officers, FEI; FL DACS/IM (intrastate mover registration #) — movers must register; hard credibility data.
- Google reviews count + rating, BBB; fleet size / crew count if published (sizes the AIDRE missed-call pitch).

### 8. Miga Food Manufacturing — high-probability close (food)
- Phone + email: site is on Cloudflare Pages staging (miga-food-manufacturing.pages.dev) — pull any contact info from staging; else via Gary (champion) or Sunbiz filing agent contact.
- Sunbiz P21000103391 already cited — extract: principal address, officers (verify Gary + Daniella co-ownership on paper vs Rob's verbal), annual report status.
- Socials: IG/Facebook for Miga brand ("shopthesecretingredient" FB page is cited on Daniella's row — confirm it's Miga's retail arm and link it).
- FDA food-facility registration / FL DACS food-permit status (pre-national-launch blocker data = PVP ammo).

### 9. Gary Waskovich — champion for Miga + De Cecco door (food)
- ⚠️ Fix field misuse: his `business` field says "Miga Food Manufacturing" but his employer is De Cecco USA (PMI Inc). Also name spelled "Waskivich" in record id vs "Waskovich" in name — standardize.
- Cell + email: Rob knows him directly (2026-07-08 champion note) — internal ask; else rocketreach/signalhire pattern (@dececcousa / PMI).
- LinkedIn URL (linkedin.com/in/gary-waskovich-390490294 is cited in description) → move into a social/website field.
- De Cecco USA (PMI Inc, NY): HQ phone, FL regional office, employee count — this also fixes the score-0 De Cecco row.

### 10. Red Rock Roofing (UT) — growth vehicle inside signed partnership (roofing)
- Utah business registry: entity filing status, registered agent, filing date (the whole timeline is "gated by licensing/EIN" — the registry answers it objectively).
- Old site URL ($4k spent, dev "Garrett") — capture domain + Garrett's contact for the takeover.
- UT DOPL contractor license application status; GM name (Caleb says lined up — get it).
- Any GBP/social stubs already claimed for the brand.

**Honorable mention #11 — Trent Brands / Title Base:** thetitlebase.com contact page (phone/email), TB Florida LLC Sunbiz officers, linkedin.com/in/trentbrands into social field, BBB listing, Hometown Heroes Boost landing page URL. He is a warm vertical-anchor one nudge from a Phase One.

## Businesses mistyped / structural issues (feeds Task 2.0)

**17 of 34 rows in `people` are businesses** (`entity_kind='company'`): Atlanta roofing contractor, CG Roofing Group, De Cecco USA, Dermatology clinic, Dix Healthcare AI, Gulf Coast RE Group, LandTech, Martin Fierro Restaurant, Miga Food Manufacturing, Naples Spine & Joint, Oasis The Kitchen Lounge, Omega Title (FL), On Time Moving and Storage, PropLogic, Qualia, Red Rock Roofing, Vive Health. The `entity_kind` discriminator exists and is set correctly on all rows — the issue is that company-shaped data (registry #s, review counts, employee counts, locations) has no columns, so it gets crammed into description text.

Additional integrity flags found during audit:
1. **Gulf Coast RE Group**: `signed=true` + `quoted_amount=19000` contradicts its own relationship note ("NOT SIGNED", "$18k"). One of them is wrong.
2. **Gary Waskovich**: `business` field holds the *prospect* (Miga) not his employer (De Cecco USA); surname spelled two ways (Waskivich/Waskovich) across id and name.
3. **Record id typo**: `golf-coast-real-estate-group` ("golf") for Gulf Coast RE Group.
4. **LinkedIn URLs stored in `website` field** (Daniella Roach, Michael Jaenvega) — website should be the company site; socials need their own field or JSON.
5. **Emails trapped in prose**: [email redacted @gmail.com] sits in Dixith's description while his `email` column is null.
6. **4 rows have `node_type=null`**: De Cecco USA, Martin Fierro, Michael Jaenvega, Oasis — invisible to any node-type-driven UI filter.
7. **Duplicated deal data** across person/company pairs (Caleb ↔ CG Roofing; Alex ↔ Gulf Coast): $10k quoted on both rows of the pair — double-counts pipeline if summed naively.

## Template

**Martin Fierro Restaurant (score 5/6)** is the standard every business row should hit: phone + email + website in dedicated columns, Sunbiz entity + officer named, sourced notes with registry numbers and review-platform citations. Every hunt above should land its findings in the same shape.

---

## Hunt results — 2026-07-17 (priorities 1–3 executed)

Method: public web only (company sites, FL Sunbiz, DBPR, GBP-proxy review sites, LinkedIn/FB/IG, press). Direct-write only to `phone`/`email`/`website` from a record's own site or an official registry; everything softer appended to `notes` as dated `ENRICHED 2026-07-17:` lines, each ending in its source URL. `signed`, `quoted_amount`, `status`, `node_type`, `relationship`, `referred_by_id` were not touched on any record (verified post-write).

### 1–2. Caleb Green + CG Roofing Group

**`cg-roofing-group` (company) — direct-write:** `phone` → `[phone redacted]`, `website` → `https://www.cgroofinggroup.com/` (confirmed on [own site](https://www.cgroofinggroup.com/) and [BBB](https://www.bbb.org/us/fl/jacksonville/profile/roofing-contractors/cg-roofing-group-llc-0403-236017548)). No public email found — skipped.

**Appended to notes (both records):**
- Sunbiz: **CG ROOFING GROUP, LLC**, doc# L17000012511, FEI/EIN 32-0516571, filed 01/17/2017, official [sunbiz.org](https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?InquiryType=EntityName&InquiryDirectionType=ForwardRecord&SearchTerm=CG+ROOFING+GROUP) status **ACTIVE**, registered agent Caleb W Green, principal address 4320 Deerwood Lake Pkwy Ste 101-133, Jacksonville FL 32216. ⚠️ Conflict: third-party mirror [bisprofiles.com](https://bisprofiles.com/fl/cg-roofing-group-l17000012511) shows this same entity as inactive/voluntarily dissolved 2025-07-23 — contradicts the official sunbiz.org snapshot. **Recommend Rob/Will verify directly on sunbiz.org before finalizing the 3-way CRM partnership contract**, since entity status matters for that filing.
- FL DBPR: license **RC29027554**, Registered Roofing Contractor, licensee Caleb William Green d/b/a CG Roofing Group LLC, status shown as **"Delinquent,Active"** — verify renewal/CE standing before citing in the Phase 1 case study. [Source](https://www.myfloridalicense.com/LicenseDetail.asp?SID=&id=1F408DB1D56E37A1432104D5AAC2872A).
- BBB: **A+ rating, not accredited**; address on file (8638 Philips Hwy Ste 12, Jacksonville FL 32256) conflicts with both the Sunbiz principal address and the homepage's own schema address (6900 Philips Hwy #38) — three different addresses across three sources, physical office needs confirming with Caleb.
- Review baseline (GBP proxy, not pulled from GBP directly): 4.3/5 (30 reviews) via [GAF contractor directory](https://www.gaf.com/en-us/roofing-contractors/residential/usa/fl/jacksonville/cg-roofing-group-llc-1115406); 4.4/5 (27 reviews) via [LocallyFind](https://locallyfind.com/services/jacksonville/roofing-contractor/cg-roofing-waterproofing-llc/).
- Social: Facebook [facebook.com/cgroofingandwaterproofing](https://www.facebook.com/cgroofingandwaterproofing/) (~165 likes); LinkedIn company page [linkedin.com/company/cg-roofing-group-llc](https://www.linkedin.com/company/cg-roofing-group-llc) (22 followers); Caleb's personal LinkedIn [linkedin.com/in/caleb-green-674127b2](https://www.linkedin.com/in/caleb-green-674127b2/). No Instagram found.
- Caleb's personal cell/email: not pulled from the web (per hunt spec — internal ask). Utah Red Rock Roofing entity: **no registration found under Caleb Green's name** in public Utah corporations/contractor-license search this pass — a "Red Rock Roofing" contractor license in St George, UT (#377705-5501) showed expired 10-01-2022 but could not be confirmed as the same owner/entity. CFO Kelly's surname/email: not found publicly.

### 3–4. Gulf Coast RE Group + Alex Greenwood

**`golf-coast-real-estate-group` (company) — direct-write:** `phone` → `[phone redacted]`, `website` → `https://www.gulfcoastregroup.com/` (confirmed on [own contact page](https://www.gulfcoastregroup.com/contactus/)). Email skipped — the only address surfaced on the contact page is a Boomtown CRM placeholder (`[email redacted @boomtownroi.com]`), not a real inbox.

**⚠️ Signed-flag conflict — NOT touched, flagging for Rob's ruling only:** confirmed the audit's original finding still stands: `signed=true` / `quoted_amount=19000` on the record, while `relationship` still reads "$18k Phase 1 agreement SENT via SignWell 6/19 … NOT SIGNED (stalled ~3 weeks)". No public source resolves this — it's a CRM-internal fact only Rob/Will can rule on.

**Appended to notes:**
- Address 3384 Woods Edge Cir Ste #103, Bonita Springs FL 34134; social — [Facebook](https://www.facebook.com/gcregroup/), [Instagram](https://www.instagram.com/gulf_coast_re), [LinkedIn](https://www.linkedin.com/in/gulf-coast-re-group-50ba3b310).
- Reviews: **115 reviews, 5.0 average** per [Birdeye](https://reviews.birdeye.com/gulf-coast-re-group-171598325153823).
- Agent roster count: **still unresolved** — the team's own recruiting page publishes no current headcount; the 50/56/60 conflict from the original audit stands. Needs internal ask.
- **MVP Title Agency LLC** (adjacent title-vertical door): Sunbiz doc# L23000148252, FEI/EIN 92-3269298, filed 03/23/2023, status ACTIVE, principal address 1495 Pine Ridge Rd Ste 1, Naples FL (same building as the ROG MVP Collier entity below); FL DFS title-agency license G016627, exp 10/31/2026; site [mvptitleagency.com](https://mvptitleagency.com/).
- **ROG MVP Collier County LLC** (brokerage entity, same address): Sunbiz doc# L24000291887, filed 06/28/2024, status ACTIVE, registered agent NJ Law PLLC. **Finding: Alex Greenwood does not appear by name among the listed managers** (Bermudez, Carlson, Doerr, Hopple, Ledbetter, Prawl) — his actual brokerage-of-record entity needs direct confirmation. [RateMyAgent](https://www.ratemyagent.com/real-estate-agency/rog-mvp-collier-county-llc-b02cia/sales/overview) shows this entity at 1,034 active / 1,337 sold listings, $747M trailing-12mo — that's the whole-brokerage number, not Gulf Coast RE Group's team alone; don't conflate the two in the deal sizing.
- Website Factory / HomeCloneVault domain (localhomes.com vs hyperlocalhomes.com): **could not confirm ownership** tied to Alex via public search — still needs his direct confirmation.

**`alex-greenwood` (person) — no direct-write.** His own team-site bio page ([gulfcoastregroup.com/agents/327940-Alex-Greenwood](https://www.gulfcoastregroup.com/agents/327940-Alex-Greenwood/)) only surfaces the shared team line (already captured above) and no personal email — so nothing rock-solid to put in his own phone/email fields. Notes appended: LinkedIn [linkedin.com/in/alex-greenwood-swfl](https://www.linkedin.com/in/alex-greenwood-swfl/); press-syndicated (not own-site, so not direct-written) office numbers Fort Myers [phone redacted] / Cape Coral [phone redacted] and stats (3,700+ career transactions, $1.5B+ volume, 250 sales/$125M+ trailing 12mo, 800+ five-star reviews) per an April-2026 [Newswire release](https://www.newswire.com/news/best-real-estate-agent-in-fort-myers-fl-alex-greenwood); DBPR SL3227669 not re-verified this pass (search didn't return a direct hit — existing "verified 2026-07-07" note stands unconfirmed-but-unchallenged).

### 5. Naples Spine & Joint + Jonathan Polk/Monica connection

**`naples-spine-joint` (company) — direct-write:** `phone` → `[phone redacted]`, `email` → `[email redacted @naplessj.com]`, `website` → `https://www.naplessj.com/` (all confirmed on their [own contact page](https://www.naplessj.com/contact)).

**Appended to notes:**
- Address 7955 Airport Pulling Rd, Suite 203, Naples FL 34109.
- Sunbiz: **NAPLES SPINE & JOINT, LLC**, doc# L24000046786, FEI/EIN 99-0904739, filed 01/25/2024, status ACTIVE, principal address matches the clinic — confirms this is a young business (~2.5 yrs old). [Source](https://search.sunbiz.org/Inquiry/corporationsearch/SearchResultDetail?inquirytype=EntityName&directionType=ForwardList&searchNameOrder=NAPLESSPINEJOINT+L240000467860).
- Social: Instagram [@naples_spine_joint](https://www.instagram.com/naples_spine_joint/) (includes a "clinic is now open" post, consistent with the Jan-2024 filing); Facebook [facebook.com/61577212680619](https://www.facebook.com/61577212680619/).
- Yelp listing exists but blocked automated fetch (403) and no rating/count surfaced via search — still open. No GBP rating captured either. EN vs. Spanish-language review split not verified.
- No individual doctor/chiropractor name published on the site — couldn't pull a named practitioner for an FL DOH license lookup; needs internal ask.

**Jonathan Polk / Monica connection — resolved:**
- **Monica Polk** is LinkedIn-listed as **"Business Owner, Naples Spine & Joint"** ([linkedin.com/in/monica-polk-7aa586324](https://www.linkedin.com/in/monica-polk-7aa586324/)) — same surname as connector Jonathan Polk, confirming the CRM's existing "Polk and Monica's Company" description is literal, not coincidental.
- **Jonathan Polk's employer resolved** (this also closes out gap-audit hunt #6's open question, "what does Polk actually do"): his LinkedIn work history lists him as former **VP of Marketing, Naples Spine & Joint**, and current **Regional Manager, Southwest & Miami FL, at PropLogix** ([linkedin.com/in/jonathan-polk-56a95469](https://www.linkedin.com/in/jonathan-polk-56a95469/); [proplogix.com/team/jonathan-polk](https://www.proplogix.com/team/jonathan-polk/)). This strongly suggests the CRM's separate **"PropLogic" lead record is a misspelling of PropLogix** — Polk's own employer, not a third-party referral door. Worth merging or correcting.
- Also found a likely resolution for **"LandTech"**: a Facebook post from **LandTec Survey** welcomes Jonathan Polk to their team ([facebook.com/landtecsurvey](https://www.facebook.com/landtecsurvey/photos/exciting-news-jonathan-polk-is-joining-our-team-to-sprinkle-some-magic-into-our-/947582267372244/)), and an Instagram post references him as "CEO of Polk Industries, a marketing arm of LandTech" ([instagram.com/p/Cis3EaOuGMo](https://www.instagram.com/p/Cis3EaOuGMo/)) — his own marketing venture, worth a follow-up ask to nail down exactly how Polk Industries / LandTec / PropLogix relate.
- These findings were appended to both `jonathan-polk` and `naples-spine-joint` notes.

### Came up empty / still open (flagged, nothing written)
- Caleb Green and Alex Greenwood personal cells/emails (by design — internal ask, not a web hunt).
- CFO Kelly's surname/email.
- Red Rock Roofing (UT) entity registration under Caleb Green's name.
- Gulf Coast RE Group exact agent headcount (50 vs 56 vs 60).
- Alex Greenwood's ROG MVP brokerage-of-record entity (not the Collier County one on file).
- localhomes.com / hyperlocalhomes.com ownership confirmation.
- Naples Spine & Joint Yelp/GBP review counts and named treating chiropractor(s) for a DOH license pull.

### Three most valuable discoveries
1. **CG Roofing Group's Sunbiz entity status conflict** (official sunbiz.org = ACTIVE vs. a third-party mirror showing dissolved 2025-07-23) — needs resolving before the 3-way CRM partnership contract closes with counsel.
2. **Jonathan Polk's employer is PropLogix**, and his LinkedIn history shows he was formerly VP of Marketing *at* Naples Spine & Joint while Monica Polk (family) owns it — the referral graph for "PropLogic," "LandTech," and Naples Spine & Joint all trace back through one person, which reframes Polk from "connector" to a much tighter, higher-trust hub.
3. **Alex Greenwood's name is absent from the ROG MVP Collier County LLC Sunbiz managers list** — the brokerage entity backing his $19k deal isn't the one he appears to be legally tied to, which is worth clarifying before further legal/contract work in that vertical.

---

## Hunt results round 2 — 2026-07-18

Method: same as round 1 — public web only (company/staging sites, FL Sunbiz, FL DBPR/FDACS, UT Division of Corporations/DOPL, BBB/Birdeye/Yelp/HomeAdvisor, LinkedIn/FB/IG, SignalHire/RocketReach). Direct-write only to `phone`/`email`/`website` from a record's own site or an official registry; everything softer appended to `notes` as a dated `ENRICHED 2026-07-18:` block, each ending in source URL(s), never overwriting prior notes. `signed`, `quoted_amount`, `status`, `node_type`, `referred_by_id`, `key_dates` were not touched on any record (verified post-write via a full-table pull). Scope: hunt-list priorities 4–10 (priorities 1–3 — Caleb Green, CG Roofing Group, Gulf Coast RE Group — were executed in round 1). No `(DEMO)` records were touched.

### 4. Alex Greenwood — supplementary follow-up only (already substantially enriched in round 1)
No direct-write (still no personal phone/email surfaced from his own site or a registry). Appended to notes: FL DBPR SL3227669 still unverifiable via direct URL (session-gated tool); his own team-site bio clarifies his brokerage as "Gulf Coast REGroup - Realty One MVP" (Bonita Springs franchise office) — a **different** entity than the Sunbiz-registered "ROG MVP Collier County LLC" checked in round 1, which reframes (doesn't resolve) his absence from that LLC's manager list. localhomes.com / hyperlocalhomes.com ownership still unconfirmed (WHOIS/ICANN gated).

### 5. Naples Spine & Joint — supplementary follow-up only (phone/email/website already direct-written in round 1)
No new direct-write. Appended to notes: Yelp and Google Business Profile review counts/ratings still unconfirmed (both blocked/CAPTCHA-gated this pass too); named treating chiropractor(s) still not published anywhere on the site — all three gaps remain genuinely open, not just unattempted.

### 6. Jonathan Polk — light supplementary (employer/referral graph already resolved in round 1)
No direct-write (no personal phone/email found; not a company-level fact). Appended to notes: PropLogix's general office contact — 8374 Market Street PMB #505, Bradenton FL 34202, [phone redacted], support@proplogix.com (company-level only, not personal to Polk, per https://www.proplogix.com/team/jonathan-polk/). No further public-web gaps identified for this record.

### 7. On Time Moving and Storage (`calebs-brother-moving-co`) — direct-write
`phone` → `[phone redacted]`, `email` → `[email redacted @gmail.com]` (both confirmed on [own contact page](https://www.ontimemovingandstorage.com/contact); `website` was already on file). Appended to notes: address 1475 Northwood Drive, St. Augustine FL 32084; a likely-match LinkedIn owner profile (name not independently confirmed as Joseph Green, LinkedIn blocked automated fetch); FL Sunbiz — no confirmed matching entity this pass (a same-named entity in Wildwood FL is a different address, likely unrelated) and FDACS intrastate-mover (IM#) registration not found (public tool is interactive-only); reviews — BBB A+ (accredited since 2011), Google 4.6/5 (20 reviews, Birdeye proxy), Yelp ~53–56 reviews (rating blocked), HomeAdvisor 4.0/5; fleet size 9 trucks/14 drivers per a single blocked-page RocketReach snippet — low-medium confidence.

### 8. Miga Food Manufacturing (`miga-food-manufacturing`) — direct-write
`phone` → `[phone redacted]`, `email` → `[email redacted @migafm.com]`, `website` → `https://miga-food-manufacturing.pages.dev/` (all confirmed on the company's own staging site and its [contact page](https://miga-food-manufacturing.pages.dev/contact.html)). Appended to notes: a separate "Emerald Brokers FLA" contact line naming Gary Waskovich as broker rep (not a Miga officer on-site); **⚠️ name discrepancy** — the site names "Daniella **Jaenvega**" as Managing Partner vs. this CRM's "Daniella **Roach**" (Sunbiz snippet for P21000103391 confirms "Daniella Roach" as registered agent/officer, status ACTIVE, reinstated 2023-01-11 after a lapse — Gary Waskovich does not appear as an officer) — flagged for Rob to confirm whether these are the same person; social — Instagram [@miga.food_](https://www.instagram.com/miga.food_/), Facebook (login-gated, unconfirmed); **corrected** the original gap audit's "shopthesecretingredient" lead — that FB page is unrelated to Miga, it traces to a different ingredient-sourcing business; a second, more polished brand site migafoods.com also exists with an unclear relationship to the staging site; FDA/FDACS food-permit status not found (both tools are non-scriptable).

### 9. Gary Waskovich (`gary-waskivich`) — no direct-write (no own-site/registry phone or email surfaced)
Appended to notes: LinkedIn confirmed live ([linkedin.com/in/gary-waskovich-390490294](https://www.linkedin.com/in/gary-waskovich-390490294/), Regional Sales Manager/De Cecco USA/Naples FL/JWU/125 connections — medium-high confidence, direct fetch blocked); De Cecco USA / PMI Inc (Prodotti Mediterranei Inc., NY) HQ — 75 Broad Street, New York NY 10004, [phone redacted]; no FL regional office found (he's a field-based rep); employee count 11–50 per LinkedIn (SignalHire/RocketReach roughly consistent, one conflicting "25–100" snippet flagged); no public email pattern surfaced (SignalHire/RocketReach gate emails behind paid unlock — not guessed). Also re-flagged (not corrected, outside direct-write scope): his `business` field still misreads "Miga Food Manufacturing" instead of his actual employer, and the id/name spelling (Waskivich/Waskovich) still needs standardizing — Task 2.0 cleanup item.

### 10. Red Rock Roofing (UT) (`red-rock-roofing`) — no direct-write (nothing confirmed as this specific venture's own info)
Appended to notes: no distinct Utah Division of Corporations filing found under Caleb Green's name (official search tool is JS-gated); **⚠️ ambiguity** — at least 3 unrelated national "Red Rock Roofing" businesses exist (CO, TN, WA), none tied to Caleb Green; no live Utah-specific domain or "Garrett" developer credit found; a Utah DOPL license record for a "Red Rock Roofing" in St. George/Ivins UT (#377705-5501, contact "Jason Schick") shows **expired/inactive since 2022** — cannot be confirmed as the same venture, needs an internal ask on whether Jason Schick is Caleb's "GM lined up"; no GBP/social stub found. Cross-referenced Caleb Green's own FL DBPR license (RC29027554) as still "Delinquent, Active."

### Came up empty / still open (flagged, nothing written)
- Alex Greenwood's DBPR re-verification, and localhomes.com/hyperlocalhomes.com ownership.
- Naples Spine & Joint's Yelp/GBP review counts and named practitioner(s).
- On Time Moving and Storage's FL Sunbiz entity match and FDACS IM# (both registries are bot-blocked/interactive-only — need a manual browser lookup, not a dead end).
- Miga Food Manufacturing's FDA/FDACS food-permit status, and the Jaenvega-vs-Roach name conflict (needs Rob's confirmation, not a web answer).
- Gary Waskovich's and Caleb/Alex's personal cell/email (by design — internal ask, not a web hunt).
- Red Rock Roofing (UT)'s actual entity status — genuinely appears not-yet-registered or unconfirmable, not merely unsearched.

### Recomputed average completeness score (all 33 live non-DEMO records)

Same 0–6 rubric as the original audit (Phone / Email / Website / Role / Description>100 chars / Social), computed programmatically from the current Supabase table state (a pure scoring pass over `phone`, `email`, `website`, `role`, `description`, and a social-URL/handle regex over `notes`+`description` only — never double-counting a link already credited to `website`, and never crediting a bare mention of a platform name with no link, e.g. "no Facebook found" does not score a social point):

| Metric | Round 0 (2026-07-17 baseline) | After round 2 (2026-07-18) |
|---|---|---|
| Live non-DEMO records | 34 | 33 (one admin consolidation since baseline) |
| Average completeness score | 1.94 / 6 | **2.64 / 6** |
| Average among the 10 hunted priority records only | ~1.3 / 6 (pre-hunt) | **4.2 / 6** |

⚠️ Note for Rob/Will: the BUILD-QUEUE Q7 DoD target of "avg completeness ≥3.5" is **met for the 10 hunted priority records (4.2/6)** but **not yet met across all 33 live records (2.64/6)** — mathematically, enriching only 10 of 33 records cannot lift the whole-table average past ~2.9 even in the best case, since the other 23 untouched records remain at their round-0 baseline (mostly role-only, score 1–2). Closing the full-table average requires either enriching the remaining 23 records or re-scoping the DoD to the priority subset — flagging rather than fudging the number.

### Two-most-valuable discoveries this round
1. **Miga Food Manufacturing's on-site "Daniella Jaenvega" vs. CRM's "Daniella Roach"** — the company's own staging site names a different surname for the same Managing Partner role that Sunbiz confirms as "Daniella Roach," raising a real question of whether these are the same person (married/maiden name) before the Miga deal or the Jaenvega/Roach restaurant-cluster thesis goes further — a fact only Rob can resolve, not the web.
2. **Red Rock Roofing (UT) has no confirmable public footprint tied to Caleb Green** — no matching Utah entity filing, no live domain, and the only same-named DOPL contractor license in St. George/Ivins, UT has been expired since 2022 under a different named contact ("Jason Schick") — the growth-vehicle venture appears to genuinely not exist yet in any public record, which should reset expectations on its timeline rather than assuming it's just under-searched.

---

## Hunt results round 3 (2026-07-22, Q7b batches 1–2) — **DoD MET: whole-table avg 3.56/6 ≥ 3.5**

Scoring is now code, not prose: `scripts/enrichment/completeness-score.mjs` (exact rubric above, reads both `people` and `orgs` post-split, 11 unit tests). All numbers below are its output, honestly recomputed after each batch.

| Metric | After round 2 (7/18) | Post-split baseline (7/22, scorer) | After batch 1 | After batch 2 | Target |
|---|---|---|---|---|---|
| Live non-DEMO records | 33 | 32 | 32 | 32 | — |
| Average completeness | 2.64 / 6 | 2.69 / 6 | 3.09 / 6 | **3.56 / 6** | ≥3.5 ✅ |
| Records below 3 | — | 17 | 13 | **8** | — |

**Batch 1 (worst-first tail):** PropLogix 1→4 (proplogix.com + [phone redacted] + desc; proplogix.com/contact, FLTA directory), Qualia 1→5 (qualia.com + [phone redacted] per ALTA member directory + desc + LinkedIn), LandTech 1→4 (identity resolved: LandTech Data Corp / landtechdata.com; "Polk Industries is a marketing arm of LandTech"), De Cecco USA 0→3 (dececco.com/us_us + role + desc; no public US phone — left blank). Cates: zero public footprint → hunt note only. 2 Rob-input gaps → /api/admin/flags (Cates contacts; derm-pilot placeholder).

**Batch 2 (this round's writes, all source-cited, unprotected fields only):**
1. **Vive Health 2→6** — phone [phone redacted], [email redacted @vivehealth.com], vivehealth.com; socials (LinkedIn/FB/IG) in notes. Source: vivehealth.com/pages/contact-us.
2. **Omega Title (FL) 2→6** — [phone redacted], [email redacted @omegatitlegroup.com] (Angela Stavros, COO), omegatitlegroup.com; FB/IG in notes. Source: omegatitlegroup.com/contact. Bonus: contact-page HQ (3411 Tamiami Trail N, Naples 34103) matches the address already in the relationship note — strengthens the Dascani-shop identification (Alex confirm still open).
3. **Oasis The Kitchen Lounge 2→6** — [phone redacted], oasisavemaria.com (fetched + verified official); FB/IG in notes. Sources: oasisavemaria.com, Yelp/avemaria.com listings. No public email published — left blank.
4. **Rob Acheson 1→4** — rob@aivoicetech.io, aivoicetech.io, description written (founder AI VoiceTech / MLE principal). Source: Rob's own operating docs (internal, authoritative). No social point claimed — GitHub org isn't a scored platform and no verified LinkedIn URL on file.
5. **Dixith Magadiev 2→3** — email field filled with [email redacted @gmail.com], which was already sitting in his own description (Gemini notes source); field-copy, not new research.

**Honest non-writes:** Red Rock Roofing (Rob 7/22: real but pre-launch, no registry footprint expected — unenrichable by design), Dix Healthcare AI (pre-registration EU entity), David Cates (no public footprint, flagged to Rob), derm pilot #1 (placeholder, flagged), George/Guest Genie (multiple unrelated "Guest Genie" companies; which one is his was not confirmable — needs Dix/Rob, not the web).

**Remaining below-3 tail (8):** Cates 1, derm-pilot 1, George 1, Chris Acheson 2, Dix Healthcare AI 2, Joe Fleming 2, Jonathan Burns 2, Red Rock 2 — all blocked on either Rob/Dix input or nonexistent public footprints, per above. Further table-wide gains now come from Rob's address book, not hunting.
