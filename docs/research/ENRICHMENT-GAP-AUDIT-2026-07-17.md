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
| 17 | Dixith (thedevdix) | person | partner | warm | — | — | — | — | ✅ | ✅ | — | **2** (email exists in description: thedevdix@gmail.com — not in email field!) |
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
5. **Emails trapped in prose**: thedevdix@gmail.com sits in Dixith's description while his `email` column is null.
6. **4 rows have `node_type=null`**: De Cecco USA, Martin Fierro, Michael Jaenvega, Oasis — invisible to any node-type-driven UI filter.
7. **Duplicated deal data** across person/company pairs (Caleb ↔ CG Roofing; Alex ↔ Gulf Coast): $10k quoted on both rows of the pair — double-counts pipeline if summed naively.

## Template

**Martin Fierro Restaurant (score 5/6)** is the standard every business row should hit: phone + email + website in dedicated columns, Sunbiz entity + officer named, sourced notes with registry numbers and review-platform citations. Every hunt above should land its findings in the same shape.
