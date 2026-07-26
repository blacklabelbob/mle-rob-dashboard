# MASTER VIEW 2.0 — Design Doc
**Date:** 2026-07-22 · **Status:** DRAFT rev 4 — Rob reviewed the visual mockup ("not bad for a Master View") and his amendments are folded: always-full 3-phase layouts, phase lifecycle triggers, P4 inline-edit, Master-Admin edit-anything, owner-who-is-also-rep, kickoff steps replacing Met. OQ-1..5 resolved; awaiting final sign-off (Q39 gate) · **Owner:** Max
**Sources:** Rob dumps `sources/7.22.26-2.md`, `sources/7.22.26-3.md` (gospel), `sources/ROB-CRM-VISION-DUMP-2026-07-17.md`, `sources/DATA-MODEL-crm-erd-2026-07-17.md`, BUILD-QUEUE Q39–Q45 + "ROB DECISIONS 2026-07-22 late", live demo `https://mylocaleverything.com/app?demo=1` · **Companions:** `PHASE-SIGNAL-WEBHOOK-CONTRACT.md`, `PHASE-COMPONENT-CHECKLIST-DRAFT.md`
**Design research:** Attio, Folk, Twenty, HubSpot, Pipedrive, Affinity — every borrowed pattern cited inline.

> **How to read this:** each section leads with THE DECISION in one or two lines. Details, evidence, and quotes follow. Skim the bold lines and you have the whole design in two minutes.

---

## 1. Purpose statement — what the Master View is FOR

**Decision: the Master View is Rob's operating picture, not a bigger rep screen. One glance answers four questions: (1) what phase is every customer in and what's lit, (2) who owes what / who's been invoiced and paid, (3) where the equity and spinoffs sit (owners-only), (4) what needs Rob's touch today. The rep view stays "only what closes deals." Anything that doesn't answer one of those four questions gets demoted or removed from the master surfaces.**

This is derived, not invented:

- *"It just doesnt give me the quick understanding I meed to."* — Rob, 7.22.26-2. The current mixed ledger fails the glance test. Quick understanding is the product.
- *"from the Owners Me and Wills perspective we need to make sure we are getting that paperwork signed. But we need to record the details of it"* — 7.22.26-2. Money + equity + paperwork state is a master-view job.
- *"the Rep should be noting the Associated Phase for the Associated Agreement"* and *"we will want the Rep to be able to see the progress update from the Entity Page"* — 7.22.26-3. Phase state is visible to both audiences; invoice/refund/equity mechanics are Rob's.
- *"I dont want sales reps getting bogged down by having to look at a bunch of stuff that is not going to be beneficial to them"* — 7.17 vision dump. The rep view's charter is unchanged; the Master View is the layer above it (the "super Admin" top layer from the same dump).

**There are THREE audiences, not two.** Rob flagged the third as critical (7.22.26-3): *"Now this is very important....Every Customer will have their own login showing their own Blueprint."* The customer-facing Blueprint portal is a **portal variant of the same phase tracker — lights + phase names + "NEXT UP", NO money, no internal notes** — rendered behind the customer's own login. It is **explicitly OUT of Master View 2.0 scope** (it gates on Q40's tracker existing and on the ACCESS rollout for customer logins) and is tracked as **BUILD-QUEUE Q44** so it cannot be lost. Master View 2.0 builds the tracker component such that the customer portal is a third render variant of it, not a rebuild.

**Master View vs Rep View vs Customer portal, one table:**

| | Master View (Rob) | Rep View (rep) | Customer portal (Q44, out of scope here) |
|---|---|---|---|
| Purpose | Operate the whole network | Close the next deal | See their own Blueprint progress |
| Companies | All, with phase + money + equity state | Own book only, phase progress visible | Their own company only |
| Phase tracker | Full: paid/owed, refund window, invoice cross-check | Progress lights only | Lights + phase names only — **no financials** |
| Phase 4 / spinoffs | Full registry | **Hidden** (until ACCESS; see §6) | Never |
| Attribution | Full chain back to Rob | "Referred by X" is enough | None |
| Notes | Human notes prominent, enrichment collapsed | Same discipline | None |

---

## 2. Object taxonomy — Companies vs People

### 2a. Separate list views

**Decision: kill the interleaved "People ledger." Ship two list views — `/companies` and `/people` — each with columns tuned to its object. The network graph keeps mixed nodes (Rob explicitly likes that).**

Rob, verbatim (7.22.26-2): *"I dont like having the Entities and the People all in one layout. I mean I DO like it for having the NODES together but I dont really like Having an entity then a person then an entity."*

This is how every best-in-class CRM works — none of them interleave:

- **Attio** ships two standard objects, People and Companies, each with its own views; Companies carry a `Team` attribute (people there), People carry a `Company` attribute — linked but never mixed in one list ([Attio: manage standard objects](https://attio.com/help/reference/managing-your-data/objects/manage-standard-objects), [Attio data model](https://attio.com/help/reference/attio-101/attios-data-model/understanding-attio-data-model)).
- **Folk** has exactly "2 types of contacts: people & companies"; people linked to a company appear in a People section on the company profile and a People column in company views ([Folk data model](https://help.folk.app/en/articles/9790806-folk-data-model), [Folk: link people and companies](https://help.folk.app/en/articles/4998069-link-people-and-companies)).
- **Twenty** (open source, [github.com/twentyhq/twenty](https://github.com/twentyhq/twenty)) pre-configures People, Companies, and Opportunities as distinct standard objects with distinct index views ([twenty.com](https://twenty.com/)).

**List columns (proposal):**

| `/companies` | `/people` |
|---|---|
| Name · Vertical · Status · **Phase (P1 ●●○○)** · Owed/Paid · Assigned rep · Last touch | Name · **Role @ Company** (link) · Relationship label · Status · Referred-by chain (compact, §5) · Last touch |

The graph (`/network`) is untouched: mixed nodes stay, per Rob. The existing dedup/CSV/search tooling moves with the People list. *(For the record, 2026-07-22: the reviewed mockup simply didn't replicate the network graph; the real app's graph is unchanged by this design and Rob is OK with that.)*

### 2b. Status vocabulary — replacing the shared "Client" label

> **✅ RESOLVED 2026-07-22 (Rob decision batch): Option A APPROVED — with an amendment.** Relationship labels alone are not enough for people; Rob: someone may be *"a VP, or a Bookkeeper that we need to send the Invoice to."* The person model below (§2c) adds a functional ROLE + an invoice-recipient flag. Options B/C stay in this doc as the record of what was considered.

Rob: *"I dont love that they can both share 'Client' designation. Maybe 'Client/Owner' I dont know. I want you to think long and hard about this."*

The root problem: `nodeType: "client"` is applied to both Caleb (a human) and Miga Food Manufacturing (a company). "Client" is true of the **company relationship**; the human's label should say **what they are to that relationship**.

**Three options considered:**

**Option A — Per-object vocabularies (RECOMMENDED).** Companies and People get different label sets; the person's label is relative to their company.

| Companies | People |
|---|---|
| Prospect · **Client** · Partner Org · Spinoff · Vertical Anchor · Dormant | **Owner** · Champion · Connector · Partner · Rep Candidate · Lead (unattached) |

So the list reads: *Miga Food Manufacturing — Client* and *Caleb — Owner @ Caleb's company*. Rob's instinct ("Client/Owner") is honored — those are the two labels — but split across the two objects instead of jammed into one. Attio/Folk/Twenty all type their vocabularies per object; nothing shares a label across People and Companies.

**Solopreneur rule (person who IS the client, no company entity — e.g. a $29/mo trades-app buyer):** "Client" never lands on a person. On signing, auto-create a lightweight company shell (name = trade name or "«Person»'s business"), mark IT Client, mark the person Owner — so money, phases, and refund windows always hang off a company record and one rule holds everywhere. Pre-sale they're simply *Lead (unattached)*. Rob edits this alongside the label words in OQ-2.

**Option B — Rob's compound label ("Client/Owner") on one shared vocabulary.** What it does better than A: zero migration (one enum stays), and one label carries both facts at a glance without needing the company column. Loses because it re-creates the interleaving problem at the label level — a compound label on a person still doesn't tell you which company, and companies would still need their own set anyway.

**Option C — Attio-style: status lives on deals/lists, records carry only identity.** Statuses like "Client" become derived (a company is a Client iff it has a paid deal). What it does better than A: statuses can never go stale — they're computed from money, which is the CRM-purist answer and where we should drift long-term. Loses today because Rob reads statuses as *his* hand-set relationship notes (connector, anchor), not derivable facts, and it makes the label un-editable inline — violating the click-to-edit bar.

**Recommendation: Option A now, with C's derivation as a check** — if a company is marked Client but has no signed deal, flag it in Things to Address (same pattern as the existing "⚠ disputed signed" flag).

Migration note: `node_type` slugs stay in the DB; this is a label-map + per-object filtered option list change (`lib/labels.ts` already centralizes this), plus a one-time reclassification pass over the ~54 rows using the ERD doc's org-split heuristic (`DATA-MODEL-crm-erd-2026-07-17.md` §3).

### 2c. The person row — final field vocabulary (Rob's ROLE amendment, 2026-07-22)

**Decision: a person carries FOUR distinct facts, never conflated — relationship (what they are to the deal), role (what they are at their company), a billing flag (who gets the invoice), and the company link.** Rob's amendment: relationship labels are not enough — someone may be *"a VP, or a Bookkeeper that we need to send the Invoice to."* And his ask to *"figure out the language we want to use"* — this table IS the proposed language:

| Fact | UI label | Field | Type | Example | Where it shows |
|---|---|---|---|---|---|
| What they are **to us/the deal** | **Relationship** | `node_type` (relabeled) | enum: Owner · Champion · Connector · Partner · Rep Candidate · Lead | Owner | header pill, `/people` column, graph |
| What they are **at their company** | **Role / title** | `role` (exists today) | free text | "VP of Ops", "Bookkeeper" | header, `/people` column, company People-rail |
| Who **gets the invoice** | **Invoice recipient** | `billing_contact` (new boolean) | flag, ≤1 warn per company | ✓ | badge in company People-rail + on the tracker's money row ("Invoice to: Karen — Bookkeeper") |
| **Which company** | **Company** | `org_id` (exists today) | FK → orgs | Miga Food Manufacturing | header "@ Company" link |

Header grammar: **"Karen Diaz — Champion · Bookkeeper @ Miga Food Manufacturing ⧉ invoices"**. Relationship answers "why do I care", role answers "what do they do", the flag answers Rob's exact bookkeeper case: the tracker's per-phase money row names the invoice recipient so nobody hunts for who to bill. Role stays free text (Attio/Folk treat job title as an open attribute, not an enum — titles are too varied to enumerate; the structure lives in the other three fields).

**Worked example (real, Rob-confirmed; data already corrected in prod): Chris Acheson — Connector (relationship) · Co-Owner @ Gulf Coast (role).** Two different facts about the same man: what he is to us (opens doors) and what he is at his company. Under the old single-label model these fought over one field; here they coexist by design.

**Owner-who-is-also-rep (real case: Jonathan Polk — Owner of Naples Spine & Joint AND an MLE rep, comped):** Rob: *"It might not be uncommon to sign an owner who then wants to sell our services."* The §2c fields already carry it — relationship (Owner) + role (Owner @ Naples Spine & Joint) + **a rep flag** (`is_rep` / rep-profile link, the same identity the ACCESS rollout will use for rep logins) can coexist on one person; none of the three excludes the others. His company is a normal Client with a normal tracker. **Comped deals get a first-class render state:** the deal shows a **COMPED** badge, and the tracker's money row reads "COMPED" instead of invoice amounts — no fake $0 invoices, no pretending it's owed. How comped value counts in rollups (pipeline/signed totals) is **Rob's open value-ruling — flag #17**; the design only commits to the render state, not the accounting.

**The `business` column — audit + fate (Rob spotted it mostly empty in Supabase; verified):**

- **Audit (prod Supabase, 2026-07-22):** 22 people rows → `business` empty on **17**; set on 5. Of those 5: 4 have no `org_id` (`rob-acheson` "AI VoiceTech / MLE", `david-cates` "The Cates Processing Group", `will` "MLE", `george-eu` "Guest Genie") and **1 contradicts its org link** (`gary-waskivich`: business says "Miga Food Manufacturing", `org_id` says `dececco-pasta`). It is pre-orgs-split legacy — the ERD called it the original bug (*"`business` is a free-text field on a person, not a real entity"*, `DATA-MODEL-crm-erd-2026-07-17.md` §1) — and it's already caused real defects: Rob's PropLogic→Proplogix rename didn't propagate into it (Q13 caveat), and free text can silently disagree with the org link (gary case).
- **Fate: DERIVE FROM ORG LINK, THEN DROP.** (1) Resolve the 4 business-only rows to real orgs (create/link; gary's contradiction → human review, not auto-fix). (2) Remove `business` from all UI reads/writes — `PersonEditor` field, `PeopleTable` subtitle, `SearchBar` fallback; CSV export emits a **derived** company column from `org_id`. (3) Lead intake (`lib/leads/intakePlan.ts` currently writes `business: payload.company`) switches to org-match-or-create, preserving the raw string in `source_context.company_hint` — enrichment data, per §3.5 discipline. (4) Drop the DB column once 1–3 land. Not repurposed: a free-text company field existing next to a real FK is exactly how the gary contradiction happens.

---

## 3. Company record page spec

**Decision: the company page is the delivery + money page. Order: header → Things to Address → Phase Blueprint tracker → People here → Deals (services / equity split) → Activity → Notes (human) → details grid → enrichment (collapsed, last).** Rob: *"You have the exact same page for the entity and the person when I click into them. That doesnt seem to make sense."* Correct — today `app/people/[id]/page.tsx` renders the identical `PersonEditor` for both with only a "business" pill. That ends here.

Layout skeleton (HubSpot's proven 3-area record anatomy — left properties, center timeline, right associations — adapted to our single-column-plus-rail style; [HubSpot record layout](https://knowledge.hubspot.com/records/work-with-records)):

```
┌──────────────────────────────────────────────┬───────────────┐
│ HEADER: Name · Status (Client) · Vertical ·  │  RIGHT RAIL   │
│         Assigned rep · website/phone         │               │
│ 1. Things to Address (open flags)            │ People here   │
│ 2. PHASE BLUEPRINT TRACKER  ← the centerpiece│ (Owner first) │
│ 3. Deals — Services                          │               │
│    Deals — Phase 4 / Equity (OWNERS ONLY)    │ Attribution   │
│ 4. Activity timeline                         │ chain (§5)    │
│ 5. NOTES (human, prominent)                  │               │
│ 6. Details grid (inline-edit, demoted)       │ AI estimate   │
│ 7. Enrichment (collapsed, very bottom)       │               │
└──────────────────────────────────────────────┴───────────────┘
```

### 3.1 The Phase Blueprint tracker (Q40 — the centerpiece)

Rob, 7.22.26-3 (gospel): *"Every Customer will have their own login showing their own Blueprint. Phase 1 for everyone will largely be the same. As each of the components go live, we get closer to the completion of phase 1. When they are ALL lit, Phase 1 is complete."* And: *"please take the steps from the demo I am giving you to be shown in a similair manner as to the one in the demo."*

**What the demo shows** (fetched 2026-07-22, `mylocaleverything.com/app?demo=1`): a three-phase blueprint rail — **Phase 1 "live now"** (green LIVE state), **Phase 2 "high-ROI automation" badged "NEXT UP"**, **Phase 3 "the 95% business" subtitled "THE DEEP END"** (future/locked, with a "Browse the full automation database" link). Current phase uses operational live-status language; future phases are visually quieter.

**All three phases ALWAYS render as FULL sections (Rob mockup amendment, 2026-07-22): even a not-started phase shows its complete fillable layout — component slots (unlit), money row placeholders (no agreement yet · not invoiced), the works — never a slim summary card.** Rob: *"At least we'll have the layout that can be filled in."* The demo grammar (LIVE / NEXT UP / locked-quiet) survives as **visual states applied to full sections** — tone and badge change, structure never does. This also serves the Master-Admin edit-anything rule (§3.7): every slot on a future phase is already there to be filled in.

**Per-phase section spec (master view — P2/P3 render this same full structure with empty slots):**

```
KICKOFF STEPS  Meeting booked ✓ → Quote ✓ → Signed ✓ → Invoiced ✓ → Paid ✓
               (pre-P1 sales journey as a strip — see "Kickoff steps" below)
PHASE 1 — Foundation                    [LIVE]    ● ● ● ○ ○  3/5 live
├─ components: [Website+AEO-SEO ●] [Everything Agent ●] [Social ●]
│              [Content ○] [Radar ○]   (drafted — see checklist doc)
├─ money:  Agreement #A-102 (Phase 1) · Invoiced $X · PAID ✓ 7/02
├─ refund: 30-day window — ACTIVE, 19 days left (started 7/10,
│          website-live-with-AEO-SEO)     [state machine below]
└─ ── between P1 and P2: "TOP AUTOMATIONS WE RECOMMEND" slot ──
PHASE 2 — High-ROI Automations          [NEXT UP]  ○ ○ ○  0/3 slots
├─ components: [p2-auto-1 — empty slot] [p2-auto-2 —] [p2-auto-3 —]
├─ money:  no agreement yet · not invoiced · ROI guarantee: 3 months
PHASE 3 — The 95% Business              [locked, quiet tone]  ○ ○ ○
├─ components: [p3-auto-1 — empty slot] [p3-auto-2 —] [p3-auto-3 —]
├─ money:  no agreement yet · not invoiced
```
*(P2/P3 above are the SAME full structure as P1 — empty slots and placeholder money rows, quieter visual tone. Nothing collapses.)*

Rules, each traceable to the dump:

| Rule | Rob verbatim (7.22.26-3) |
|---|---|
| Component lights; ALL lit = phase complete | *"As each of the components go live... When they are ALL lit, Phase 1 is complete"* |
| Lights flip on a **signal from partner tools** (webhook), never hand-toggled once armed | *"a signal has to be sent from my partners tools... the plan would be to have that signal be sent to us"* |
| Per-phase invoice/paid state, cross-checkable phase ↔ agreement ↔ invoice | *"They will need to Pay another invoice"* + *"the Rep should be noting the Associated Phase for the Associated Agreement"* |
| One phase at a time is the norm | *"except in an unusual situation, we would build one phase out at a time"* |
| "Top Automations next" slot **between** P1 and P2 | *"between Phases 1 & 2, We will put the Top Automations we recommend to give them something to aim for next"* |
| P1 refund: 30-day full refund, clock starts at website-live-with-AEO-SEO, **voided** by early advance to P2 | *"Phase 1 has a 30 day Full Refund... the 30 day period begins as soon as the Website is live with AEO-SEO... if they do chose to move on from Phase 1 to Phase 2 prior to the 30 day period then the refund associated with Phase 1 is considered voided"* |
| P2: 3-month ROI guarantee | *"In Phase 2, we guarantee an ROI (per our calculations which will be forthcoming) within 3 months"* |
| Customers advance as fast as they want | *"people are more than welcome to move forward i the Phases as quickly as they want"* |

**Refund-window state machine (CODE, per CR-3 / scoring-pattern rule — pure function, time as parameter, unit-tested):**

```
NOT_STARTED ──(website-live-with-AEO-SEO signal)──▶ ACTIVE(day 0..30)
ACTIVE ──(30 days elapse)──────────────────────────▶ EXPIRED
ACTIVE ──(P2 agreement signed OR P2 invoice paid)──▶ VOIDED_BY_ADVANCE
```
The tracker renders the state + days remaining; VOIDED_BY_ADVANCE renders with an explicit note ("advanced to P2 on {date} — refund voided") so nobody has to reconstruct why.

**Kickoff steps — the pre-P1 sales journey, and the end of "Met" (Rob mockup amendment):** the standalone key-dates chips felt out of place to Rob; his fix: render the pre-Phase-1 journey — **Meeting booked → Quote → Signed → Invoiced → Paid** — as a **"Phase 1 kickoff steps" strip directly ABOVE the Phase 1 section**, same visual language as the component lights (a done step is a lit step). And **"Met" is retired as a tracked concept** — Rob: *"lets get rid of MET. Over the phone is fine. What I care about is booked meetings whether in person or over the phone."* Booked meetings, channel-agnostic, are the tracked event (which is exactly Q45's `meeting_booked` stage — the kickoff strip's first light reads from it). Migration implication: `key_dates.met` stays in the DB as **historical data only** — no UI reads or writes it anywhere (PersonEditor's "Met" chip and the rep workspace's "Met" date field are removed); no destructive migration needed.

**Phase lifecycle triggers (Rob mockup amendment — "or do whatever action we want"):** phase events fire configurable actions. Triggers are **CODE on the phase state machine** (CR-3): every FSM transition emits a typed event; a declarative config table maps events to actions — adding a mapping is config, adding an event/action type is code + test.

| Event (enum) | Fires when | Action (enum) → first configured use |
|---|---|---|
| `refund_window_complete` | Refund FSM → EXPIRED (30 days survived) | **`rep_alert`** → flag to the assigned rep's Things to Address: **"Refund window closed — time to reach out for Phase 2"** (the first concrete trigger, per Rob) |
| `phase_complete` | ALL components of a phase lit | any of the three |
| `phase_paid` | Phase invoice paid_at set | any of the three |
| `early_advance` | Refund FSM → VOIDED_BY_ADVANCE | any of the three |

Actions: **`rep_alert`** (a flag via the existing flags/Things-to-Address ledger — no new alert plumbing), **`task_create`** (tasks table, assigned + due date), **`email`** (rides the n8n seam once Comms lands; until then config can't select it — honest gap, not a stub). Both enums are extensible by design; the trigger runner is idempotent per (event, phase, action) so FSM re-evaluation never double-fires.

**Rep view of the same tracker:** lights + phase names + "NEXT UP" only — no invoice amounts, no refund mechanics. Rob: *"we will want the Rep to be able to see the progress update from the Entity Page or Company page."* (7.22.26-3)

**Component checklists (✅ OQ-1 resolved: Max drafts, Rob edits):** drafted at **`docs/plans/PHASE-COMPONENT-CHECKLIST-DRAFT.md`** — P1 as a shared checklist (only `website-aeo-seo` is confirmed; the rest grounded in the demo and marked `[DRAFT — Rob confirm]`), P2/P3 as **per-customer slot structures** (`p2-auto-<n>`), since Rob picks the highest-ROI automations per customer. Component names are config, not code — Rob's edit pass renames labels without touching slugs.

**Pricing (✅ OQ-3 resolved): standard list price per phase + per-customer override.** The tracker's "owed" reads the phase's standard price from config unless the deal carries an override value; when an override exists, the master tracker shows both ("$X — standard $Y") so discounts are visible, never silent.

**Interim toggles (✅ OQ-4 resolved: YES):** until Will's tools send phase-signal webhooks, Rob flips component lights manually — Master View only, audit-logged as `source: "manual-rob"`, sharing the exact write path the webhook uses (one function, can't diverge).

**Data model deltas:** `phases` (per company: phase_no, status, agreement_id, invoice_amount, invoiced_at, paid_at, standard_price_override), `phase_components` (per phase: slug, name, live_at, signal_source), refund fields on phase 1 row. The inbound signal is fully specified in **`docs/plans/PHASE-SIGNAL-WEBHOOK-CONTRACT.md`** (drafted, versioned, idempotent, secret-header auth per the n8n-email pattern — written for Will/partner to react to). The current `Person.phaseOne` field is superseded and migrates into `phases`.

### 3.2 People at this company (right rail, top)

Owner first (label from §2b), then champions/others; each name links to the person record. Mirrors Folk's People-section-on-company-profile ([Folk](https://help.folk.app/en/articles/4998069-link-people-and-companies)) and Attio's `Team` attribute ([Attio](https://attio.com/help/reference/managing-your-data/objects/manage-standard-objects)). Data: `people.orgId` (already backfilled by `backfill-org-links.mjs`).

### 3.3 Deals — services and equity are separate sections

- **Services:** the Phase 1–3 deals, each showing its associated phase, stage, value, key dates. This is where the phase ↔ agreement ↔ invoice cross-check surfaces mismatches ("agreement says Phase 2, no Phase 2 invoice").
- **Where the rep notes the phase (decision):** Rob — *"the Rep should be noting the Associated Phase for the Associated Agreement"* (7.22.26-3). The UI home is an **inline `Phase` field on the deal card in `/rep/accounts/[id]`** — click-to-edit select (P1/P2/P3), autosave, per Rob's inline-edit standard (no edit mode, no Save button). That rep-entered value is exactly what the master-side cross-check above compares against invoices; a deal missing its phase flags in Things to Address.
- **Phase 4 / Equity — owners-only, and CLICKABLE-EDITABLE (Rob mockup amendment):** rendered only for owner role; reps never see this section (mechanics in §6). Rob: *"these Spinoff Companies and the details of them are not something I necessarily want our Reps to see."* (7.22.26-2). The equity card is **not read-only**: owners click any value and edit inline — split (40/60), state (DISCUSSED/AGREED/SIGNED), notes — per the inline-edit standard (click, edit, autosave; no edit mode, no Save button). These are the same rows the §6 registry reads, so an edit here is instantly correct there — one write path, two surfaces.

### 3.4 Activity timeline

Existing `ActivityTimeline` component, kept. Center-column chronological activity is the industry-standard record spine ([HubSpot](https://knowledge.hubspot.com/records/work-with-records), [Pipedrive detail view](https://support.pipedrive.com/en/article/deal-detail-view), [Attio Activity tab](https://attio.com/help/reference/managing-your-data/records/configure-record-pages)).

### 3.5 Notes vs enrichment (Q43 discipline — applies to BOTH record types)

**Decision: NOTES = human words only, prominent, directly under the timeline. Enrichment/provenance = collapsed section at the very bottom: most recent line visible + "show all (N)" expander. Never mixed.** BUILD-QUEUE Q39(d), from Rob's evening message: *"NOTES section = real human notes that mean something, never enrichment dumps."*

Precedent: Attio keeps Notes as their own tab/section while enriched data lives in identified attribute cells — per their docs, lilac colored cells represent enriched data points automatically populated by Attio, with a sparkle icon next to enriched attribute names in table views — i.e. machine-produced values are visually **marked as machine-produced**, never prose-dumped into notes ([Attio enriched data](https://attio.com/help/reference/managing-your-data/enriched-data)). We adopt the same contract: machine-derived facts are data, styled as data, quarantined at the bottom; the Notes box is sacred.

One more Rob rule lands here (7.22.26-2): *"When you pick up from either notes I've inputted or meeting or email notes you've seen its Important you highlight the FUTURE opportunities outside of just working phase 1-3."* → any detected Phase-4 opportunity renders as a **highlighted "Future opportunity (Phase 4)" callout** above Notes on the company page (owners-only), feeding the §6 registry — not buried in enrichment.

**INHERITED DEFECT — Q43 punch #7, this section owns it now (added 2026-07-24).** The Q43 retrofit put the enrichment section last in DOM order, which is correct on desktop but *not* on mobile: the single-column stack collapses the two-column grid, so on a phone the collapsed enrichment block currently renders **above** the EstimatePanel instead of beneath everything. The critic-rob re-score accepted deferring it here rather than churning a grid this redesign rebuilds — but "at the very bottom" above is not satisfied until it is true at every breakpoint. **This §3.5 DoD does not close while enrichment can appear above live record content on any viewport.** Fix belongs in the §3.6 grid rebuild, not in a one-off media query.

### 3.6 Details grid + enrichment

The current 16-field inline-edit grid (`PersonEditor`) survives but **demoted** below Notes, trimmed to company-relevant fields (website, phone, vertical, assigned rep). Inline click-to-edit autosave is retained everywhere — Rob's law, no Save buttons. ("Met" is gone from the date chips per §3.1's kickoff-steps amendment; the remaining sales-journey dates render as the kickoff strip, not a chip row.)

### 3.7 Master-Admin edit-anything (Rob mockup amendment — new requirement)

**Decision: on master surfaces, Rob + Will can fill or correct ANY stored field on any record inline** — Rob: *"until we figure out the easiest way to capture them."* Manual entry is the honest interim capture path, so no master surface may be read-only for stored data.

**Surfaces getting the full inline treatment:**

| Surface | Inline-editable |
|---|---|
| Details grid (company + person, §3.6) | every field, as today |
| People-here rail (§3.2) | relationship, role, `billing_contact` flag — editable in place on the rail, not just on the person's own page |
| Phase sections (§3.1) | component toggles (manual-rob path), agreement link, invoice amount/dates, standard-price override — on ALL three phases incl. not-started (the always-full layout exists precisely to be filled in) |
| Kickoff steps strip (§3.1) | each step's date, click-to-set |
| Equity cards + registry rows (§3.3/§6) | split, state, notes — owners only |
| Deals sections | stage, phase, value, key dates |

**Exclusions (the only ones):** (1) **derived/computed values** — est. contribution, deal scores, lineage chains, refund-window state, phase-complete state: these are outputs of code and render read-only (editing them would be editing a lie; you edit their inputs instead); (2) **demo/mock records** — `(DEMO)` book rows keep their existing guardrails and don't accept master edits into real rollups; (3) **webhook-stamped `live_at` timestamps once the partner signal is armed** — correctable only via an explicit manual-override that logs `source: "manual-rob"` over the top, so a hand edit is never mistaken for a partner signal. Everything else: click it, fix it, autosaved.

---

## 4. Person record page spec

**Decision: the person page is relationship-forward — who they are, what they are to us, which company, who brought them, what they've opened — not a money/delivery page. Order: header (name · relationship label · role @ company link) → Things to Address → attribution lineage (full chain, §5) + doors opened → activity/notes → details grid → enrichment collapsed.**

Differences from the company page, deliberately:

| | Company page | Person page |
|---|---|---|
| Centerpiece | Phase Blueprint tracker | Attribution lineage + doors opened |
| Money | Per-phase invoiced/paid/owed | None directly — link to their company's deals |
| Header emphasis | Status + phase | Relationship label + **role @ company** (one click to company context — ERD doc: "one click to the company context") |
| Right rail | People here | Company card + referrer chain |

Person-specific sections:
- **Company link:** "Owner @ Miga Food Manufacturing" in the header, linking to the company record — the Attio/Folk person→company attribute pattern ([Attio](https://attio.com/help/reference/managing-your-data/objects/manage-standard-objects)).
- **Attribution lineage:** full chain back to Rob (§5), replacing today's single-hop "Came through."
- **Doors opened:** kept from the current page, but each opened door also renders with its chain suffix so the network math is visible.
- **Their activities + notes:** same timeline component scoped to the person; same Q43 notes/enrichment discipline as §3.5.

No `Phase` UI on people. Phases belong to companies.

---

## 5. Attribution lineage component

**Decision: every attribution line renders the full chain from ROB (origin) to the node, breadcrumb-style: `ROB → Alex → Sarah → this company` — compact, each hop clickable, computed by walking `referredById` to the root.** BUILD-QUEUE Q39(e): *"attribution lines must show the FULL referral chain back to ROB origin... never make Rob guess the origin node."*

**Computation (pure function, `lib/lineage.ts`, unit-tested per CR-3):**

```ts
chain(id): PersonRef[]  // walk referredById until null (root) —
                        // root should be Rob; cycle-guard via visited set;
                        // cap at 10 hops; a non-Rob root or a cycle renders
                        // an explicit "⚠ broken chain" chip, never a guess
```
Data source is the existing `people.referredById` self-FK (`lib/types.ts`; ERD: `PEOPLE ||--o{ PEOPLE : referred_by`). No schema change needed.

**Display:**
- Compact breadcrumb: `ROB → Alex → Sarah`, Rob's chip visually anchored (origin styling), current node omitted (it's the page you're on). Hops ≥4 middle-truncate: `ROB → … → Sarah` with the ellipsis expandable on click.
- Appears: person page (own chain), company page right rail (chain of its owner/first contact), `/people` list column (ultra-compact: `ROB→A→S`), and on every "Doors opened by X" line.
- Precedent: this is Affinity's "introduction path" concept — surfacing who-knows-who paths as first-class UI so warm routes are never reconstructed by hand ([Affinity relationship intelligence](https://www.affinity.co/product/relationship-intelligence), [Affinity network mapping](https://www.affinity.co/blog/crm-network-mapping)) — collapsed to our simpler tree case (single `referred_by` parent, so the path is unique and cheap).

---

## 6. Phase-4 registry view (owners-only)

**Decision: a dedicated `/registry` (owners-only) table — one row per spinoff/equity position — plus the owners-only equity section on each company page. Structured fields, never notes-crammed.** Rob (7.22.26-2): *"we will typically spin this up into a new entity and get an equity split. Calebs CRM is one example. Alex's HomeCloneVault is another... with Homevault, we have agreed to a 40/60 Split... we have not signed off on it yet... we need to make sure we are getting that paperwork signed. But we need to record the details of it."*

**Columns:** Spinoff entity · Partner (person link) · Origin client (company link) · Equity split (e.g. 40/60) · State: **DISCUSSED → AGREED → SIGNED** · Paperwork task (link, due date, overdue flag) · Notes. **All owner-editable inline** — registry rows and the company-page equity cards (§3.3) are the same records behind one write path; edit in either place, both render it.

Seeded rows — live in **prod Supabase** (verified 2026-07-22 against the `orgs`/`deals`/`tasks` tables; they are NOT in the repo's `data/network.json`, and increment 10's DoD re-proves they render): `spinoff-homeclonevault` (Alex, 40/60, AGREED-unsigned, task due 7/29) · `deal-gulf-coast-equity-phase4` (30%, PROBABLE, unsigned, task due 7/29). Caleb's CRM enters as DISCUSSED.

**Rep-hiding (✅ OQ-5 resolved: route-hidden pre-ACCESS APPROVED by Rob — ship at the unlinked owners route now; real auth locks it at ACCESS rollout):**
- **Pre-ACCESS (now):** the dashboard has no per-user auth yet (Rob 7.21: no logins until rollout, from his admin portal). Interim: `/registry` and the company-page equity section render **only outside `/rep/*` routes**, the registry route is unlinked from any rep-visible nav, and equity deals are excluded from every rep-facing API response shape (the `RepAccountListItem` DTO pattern already strips sensitive fields server-side — extend it: equity deals never serialize into rep payloads). Honest limitation, stated for the record: pre-ACCESS this is separation-by-route, not security.
- **Post-ACCESS:** `book_protected`-style RLS — equity deals get `owners_only = true`; policy grants Rob + Will (`super_admin`/owner roles) and nobody else, per the RLS sketch in `DATA-MODEL-crm-erd-2026-07-17.md` §5. Reps can still *sell* spinoff products later without seeing cap-table details — the product, not the split (Rob: *"they are going to be able to sell it and take advantage of it when the time is right"*).

---

## 7. Rep view fix — pipeline click-through (Q42)

**Decision: every card in the rep pipeline is one whole click target opening `/rep/accounts/[id]` — not just the name text.** Rob: *"you cant even click into them in the pipeline."*

Current state: on `/rep` (Today queue) only the name `<Link>` inside the card navigates; the card body, source-context block, and phase bar are dead zones. The industry norm is card-click-opens-detail ([Pipedrive: "To see full details, click the deal card. This opens the deal detail view."](https://support.pipedrive.com/en/article/pipeline-view)).

Spec:
- Whole card wrapped as the link (RepAccountsList already solved this exact pattern for rows: "a row can be the whole click target with zero conflict against inline-edit affordances" — read-only card, edits live one click deeper). Call/Email buttons sit above the link with `stopPropagation` so one-tap contact still works.
- Same treatment for any DealsBoard cards surfaced in a rep context: card click → lead detail; drag still drags (click vs drag disambiguated by movement threshold, the standard board pattern).
- DoD (per Q42): every pipeline card navigates to its lead detail; prod-verified click path.

### 7b. Meeting Booked stage (Q45 — Rob direct ask, 2026-07-22)

**Decision: `meeting_booked` sits between `contacted` and `meeting_held` on the stage ladder and must be visible everywhere a stage is — board column, company lead view (master + rep), and the aging rules.**

Honest current state: the stage **already exists** in the ladder — `lib/types.ts` `DealStage`, `lib/crm.ts` stage list, `lib/scoring/deal.ts` `STAGE_LADDER` (`meeting_booked: 35`, correctly between `contacted: 25` and `meeting_held: 45`), and `components/DealsBoard.tsx` labels ("Meeting booked"). What Q45 actually adds:

1. **Company lead view (master + rep):** the §3.3 deals section and the rep account workspace render the deal's stage chip including Meeting booked; the rep's inline stage edit offers it in ladder order.
2. **Stage-aging rung (the real gap):** `lib/tasks/todayRules.ts` `STAGE_AGING_DAYS` currently has **no** `meeting_booked` entry — a booked-then-ghosted deal never surfaces. Proposed thresholds: **primary rule — booked meeting datetime + 2 days with the deal still in `meeting_booked` (no advance to `meeting_held`) → aging item ("meeting was 2+ days ago — held? log it or rebook")**, reading the meeting datetime from the linked activity/task; **fallback — plain `meeting_booked: 7` days-in-stage when no meeting datetime is attached** (days-in-stage alone would false-positive on meetings legitimately booked a week out, hence the two tiers). Thresholds live in the same exported constant, pure and test-pinned.
3. **Scoring:** no weight change needed — `STAGE_LADDER` already ranks it; DoD includes the gate test asserting ladder order `contacted < meeting_booked < meeting_held`.
4. **Existing deals unaffected** (per Q45): no data migration; the stage is additive.

---

## 8. Build plan — ordered increments (≤6-min driver sized)

Sequenced so nothing waits on Rob that doesn't have to. **A = buildable on doc approval · R = needs a Rob decision first.**

| # | Increment | Gate | DoD |
|---|---|---|---|
| 1 | ✅ **Rep card click-through (Q42).** Whole-card link on `/rep` queue cards; buttons stopPropagation. **SHIPPED 2026-07-23** (stretched-link overlay + z-10 actions, not stopPropagation — same effect, no nested anchors; prod-verified 12/12 cards). | A (buildable now) | Click any card body in prod → lead detail opens |
| 2 | **Notes/enrichment retrofit (Q43).** On current record page: Notes prominent; enrichment/provenance collapsed at bottom, most-recent visible + expander. | A (buildable now) | Record renders notes-first; critic-rob readability pass |
| 3 | **Lineage engine.** `lib/lineage.ts` pure chain-walk + cycle guard + tests; breadcrumb component; mount on person page + "doors opened" lines. **3a SHIPPED 2026-07-25** — the engine: origin-first node-inclusive `path` + `ancestors`, `ORIGIN_ID = "rob-acheson"`, `MAX_HOPS = 10`, **five distinct broken states** (`unknown_node` / `broken_root` / `broken_missing` / `broken_cycle` / `broken_depth`) each returning its partial path + a plain-language `reason` for the ⚠ chip, `doorsOpenedBy()`, `formatChain()` (§5 ≥4-hop middle-truncation). 18 tests incl. three over the real 41-node network; 802/802, build green, no deploy (nothing renders it yet). ⏳ **3b remaining: breadcrumb component + person-page/"doors opened" mounts — and 3b must not start until flag "Spinoff entities will render a broken-chain warning" is ruled** (live data reads 33 rooted / 8 not; 6 demo + **2 real Phase-4 spinoff entities that are legitimately their own root**, which §5 as written would wrongly red-flag). | A | Unit tests green; person page shows `ROB → … → X` |
| 4a | ✅ **SHIPPED + DEPLOYED 2026-07-25** (prod `/companies` 200: 19 companies · $10k owed · $21k paid; 19/19 row links resolve to company ids, zero person rows). The 37.4.0 token failure that held this open cleared on CLI 57.0.0 — `vercel whoami` = robertacheson. **`/companies` list.** New route + table with company columns (name, vertical, status, phase, owed/paid, rep, last touch); nav entry. — `lib/companies.ts` (pure row/money derivation per CR-3), `components/CompaniesTable.tsx`, `app/companies/page.tsx`, nav entry; sorted owed → paid → name. Money rule test-pinned: a paid/owed deal with a missing or unreadable value is excluded from totals and counted ("+N no value"), never zeroed; quote-stage/lost are not owed; a paid *date* counts as paid even when the stage lags. Last touch = newest activity on the company or its deals, else "—" (never `updatedAt`). 12 tests incl. companies-only proven against the real network; 814/814, build green. ⏳ **`vercel --prod` refused with an invalid token — prod still 404s, so this row does NOT close yet** (Rob's `vercel login` needed; asked in PING-INBOX). | A | `/companies` live, companies only, zero people rows |
| 4b | ✅ **SHIPPED + DEPLOYED 2026-07-25.** **`/people` re-filter.** Existing ledger filtered to humans only via `lib/peopleLedger.ts` (pure per CR-3: `splitLedger()` + `reconcileLedger()`); an unset `entityKind` counts as HUMAN, never company (test-pinned — guessing would vanish a real person). Header states the split and links across: prod reads *16 people · 19 companies moved to the company ledger · 35 records total* (41 nodes − 6 demo), 16 row links, zero company ids among them. A `reconciles: false` result renders a visible amber warning rather than hiding a row that landed on neither ledger. 7 tests; 821/821 vitest. **Still open from this row's original scope:** the §2a person COLUMNS (role @ company, chain, relationship label) and the dedup/CSV/search re-verification on the filtered view — folded into 5d/6b, not silently dropped. | A | `/people` shows zero companies; companies+people row counts reconcile to old ledger total |
| 5a | **Company record shell.** New `app/companies/[id]`: header (status/vertical/rep) + people-here right rail + Things to Address. | A | Company route renders header + people rail from `orgId` links |
| 5b | ✅ **SHIPPED 2026-07-25.** **Company deals section.** Deals list on the company record via `lib/companyDeals.ts` (pure per CR-3): stage, value, key dates, referral-sourced chip, ladder-ordered, with paid/open totals split. Money is REPORTED, never derived — a deal with no `value` is printed as *"no value recorded"*, counted in `valueMissing` and EXCLUDED from both totals, never zeroed (MC.9 invoice-ledger precedent). A deal reached through a PERSON at this company is shown but never passed off as the company's own paper: it carries `anchoredVia` naming that person. Stage↔key-date contract IS enforced: `paid`/`invoiced`/`signed` with no matching date raises `stage_without_evidence`; a paid date with no value raises `paid_date_without_value`. 9 tests. | A | ~~a phase-less deal produces a flag~~ → **DoD AMENDED 2026-07-25, see note:** deals render on the company page; the stage↔key-date contract flags per deal; the phase gap is reported ONCE as `phaseStoreAvailable: false` |
| 5c | ✅ **SHIPPED + DEPLOYED 2026-07-25.** **Company notes/enrichment order.** `app/companies/[id]` now renders the §3.4–§3.6 spine in order: `ActivityTimeline` → **Notes** (human words only — `splitNotes().human`, edited through the `notesHuman` virtual field, so a save here cannot overwrite enrichment) → **details grid, demoted** and trimmed to website · phone · email · assigned rep (inline click-to-edit autosave; vertical + record type read-only on purpose — re-parenting a company is a graph edit, not a text field) → `EnrichmentSection` collapsed with the most-recent-plus-expander. **§3.5 punch #7 is fixed here, not inherited:** enrichment sits OUTSIDE the two-column grid, so it is last at every breakpoint (the person record still carries the defect). Prod-verified on miga-food-manufacturing / vive-health / the-title-base; 870/870 vitest, build green. | A | §3 section order onscreen; passes Q43 discipline |
| 5d | **Person page slim-down.** Person record re-cut per §4: relationship-forward header, lineage centerpiece, company link; no phase UI, no money. **⏳ LEG 1 OF 3 SHIPPED + DEPLOYED 2026-07-25** — `components/AttributionLineage.tsx` is the sole renderer of `lib/lineage.ts` (pure engine, unit-tested since increment 3, previously imported by **no page**); single-hop *"Came through"* retired; lineage is now the centerpiece **above** the timeline; doors-opened lines carry their own chain suffix (§4); header renders **role @ company** as a link when a real `orgId` exists; ≥4-hop truncation is **expandable** (`+N`), never lossy; non-origin-rooted chains render **⚠ broken chain** + the engine's reason + the partial chain, never a guessed origin. Prod-verified on all three states (`trent-brands` rooted-direct, `daniella-roach` multi-hop + 2 doors, `demo-rita-alvarez` broken_root). **LEG 2 OF 3 SHIPPED + DEPLOYED 2026-07-25** — (a) ORDER CLOSED: `PersonEditor` moved BELOW the timeline/documents, immediately above collapsed enrichment, so the spec order holds (prod DOM byte order on `/people/daniella-roach`: lineage 4806 → Activity 6896 → The record 7591 → Enrichment 16182). (b) MONEY RULING MADE: the right rail now leads with a **Company card** stating that deals/invoiced/paid live on the company record. `EstimatePanel` STAYS pending leg 3 — **11 person rows carry a saved `estimate` in prod** and the company page has no estimate slot, so deleting the panel today would hide live data behind no replacement. Deviation recorded: the rail does NOT repeat the referrer chain (the chain is this page's centerpiece; duplicating it on one screen fails Rob's bar) — a rail chain belongs on the company page. **REMAINING for the tick:** leg 3 — build the company-record estimate slot, migrate `EstimatePanel` there, then drop it from the person rail. | A | See enumerated ≠-test below — **#2 and #3 now pass**; order/money legs still open |
| 6 | **Status vocabulary.** Apply §2b Option A label maps (✅ Rob-approved); reclassify ~54 rows (ERD §3 heuristic, ambiguous → review queue); Client-without-deal flag wired to Things to Address; solopreneur rule enforced. | **A** (OQ-2 resolved) | Labels live per object; reconciliation report zero-drop |
| 6b | **Person ROLE model + `business` retirement (§2c).** `billing_contact` boolean + migration; Role/Relationship split in header + lists; invoice-recipient badge on company People-rail + tracker money row; `business` fate steps 1–3 (org-resolve 4 rows, gary contradiction → review; UI reads/writes removed; intake → org-match + `company_hint`). Column drop = its own later increment (step 4). | **A** (amendment is Rob's own ask) | Header renders Relationship · Role @ Company; invoice badge visible; zero UI reads of `business`; 4 rows org-resolved |
| 7 | **Refund state machine + phase schema.** `lib/phases/refund.ts` pure FSM (time as param) + tests; `phases`/`phase_components` migration seeded from the checklist draft slugs; manual toggles (✅ approved) share the webhook write path. | **A** (OQ-1 resolved: draft exists; Rob's edit pass renames config, not code) | FSM tests cover all 4 states incl. VOIDED_BY_ADVANCE; components seeded from `PHASE-COMPONENT-CHECKLIST-DRAFT.md` |
| 8a | **Tracker — master variant.** §3.1 on company record: component lights, per-phase invoiced/paid/owed row (standard price + override rendering, ✅ OQ-3), refund-window state line, phase↔agreement↔invoice cross-check. **All three phases render as FULL sections** — not-started phases show empty component slots + placeholder money rows (Rob amendment). | **A** (OQ-1/3 resolved) | Master tracker renders lights + money (override shows "standard $Y") + refund state; P2/P3 render full fillable sections while not started |
| 8b | **Tracker — rep variant.** Lights + phase names + NEXT UP only on `/rep/accounts/[id]`; inline `Phase` field on the deal (§3.3 decision). | **A** (OQ-1 resolved) | Rep page shows lights, zero money strings in payload; phase editable inline |
| 8c | **Tracker — demo-grammar states + Top Automations slot.** Live / NEXT UP / locked-quiet phase card states matching the demo; "Top Automations we recommend" slot rendered between P1 and P2. | A (states) / **R** (OQ-6 slot content — the one still-open question) | Three visual states match demo grammar; slot renders between phases |
| 9 | **Signal webhook.** Inbound `POST /api/webhooks/phase-signal` per the drafted contract — **`docs/plans/PHASE-SIGNAL-WEBHOOK-CONTRACT.md`** (payload, idempotency, secret header, 503-inert) — flipping `phase_components.live_at`; manual toggles interim ✅ approved. | **A** (OQ-4 resolved) | Test payload lights a component end-to-end; duplicate eventId no-ops; manual toggle writes `source: "manual-rob"` |
| 10 | **Phase-4 registry.** `/registry` owners route + company-page equity section; rep-payload exclusion; seeded rows render; overdue paperwork flags. **Equity fields inline-editable** (split/state/notes, one write path shared by card + registry — Rob amendment). | **A** (OQ-5 resolved: route-hide approved for prod) | Registry lists HomeCloneVault + Gulf Coast; `/rep/*` payloads verifiably equity-free; split edited inline on the company card renders changed in the registry |
| 11 | **Meeting Booked surfacing (Q45, §7b).** ✅ **Leg 1 DONE 2026-07-23 — the two-tier `STAGE_AGING_DAYS` rung** (`MEETING_BOOKED_GRACE_DAYS = 2` booked-datetime primary + `meeting_booked: 7` days-in-stage fallback; both tiers *and* the booked-a-week-out negative test-pinned; 562/562, no deploy — nothing user-visible consumes it yet). ⏳ Still approval-gated: stage chip on company lead view (master + rep) + inline stage edit offers it in ladder order. | **A** | Aging item fires in tests for both tiers; ladder-order gate test green; stage visible master + rep; existing deals untouched |
| 12 | **Kickoff steps strip + Met retirement (§3.1 amendment).** Pre-P1 journey (Meeting booked → Quote → Signed → Invoiced → Paid) as a lit-steps strip above Phase 1, click-to-set dates; remove every UI read/write of `key_dates.met` (PersonEditor chip, rep workspace field); `met` stays DB-historical. | **A** | Strip renders above P1 with first light fed by `meeting_booked`; repo-wide grep shows zero UI references to `met`; existing `met` data untouched |
| 13 | **Phase lifecycle trigger engine (§3.1 amendment).** Typed events off the FSM transitions (`refund_window_complete`, `phase_complete`, `phase_paid`, `early_advance`) × actions (`rep_alert`, `task_create`; `email` enum-reserved until Comms) via declarative config; idempotent per (event, phase, action). First config row: refund_window_complete → rep_alert "time to reach out for Phase 2". | **A** (rides increment 7's FSM) | FSM test drives EXPIRED → assigned rep gets the Things-to-Address flag exactly once across re-runs; config-only mapping addition needs no code change |
| 14 | **Master-Admin edit-anything (§3.7).** Inline-edit coverage audit + fill-in across master surfaces: people-here rail (relationship/role/billing flag), all phase-section fields on all three phases, kickoff dates, deal fields; §3.7 exclusions enforced (computed values read-only; DEMO guardrails; `live_at` override logs `manual-rob`). Includes the owner-rep pattern surface: rep flag on person + **COMPED** deal render state (value ruling = Rob flag #17, accounting untouched until ruled). | **A** | Every §3.7 table row click-editable on a real record; excluded fields verifiably read-only; Polk renders Owner+rep with COMPED badge and no $ owed on the tracker |
| — | *(Q44 — customer Blueprint portal: out of scope here; gated on 8a-c + ACCESS; see §1.)* | | |

**DoD amendment note — increment 5b, 2026-07-25 (driver).** As written, 5b's DoD said *"a phase-less deal produces a flag"* and its scope said *"per-deal phase … + phase↔invoice mismatch flags"*. Both were authored assuming a `phase` field existed on a deal. It does not: `Deal` in `lib/types.ts` has no phase of any kind, and the `phases`/`phase_components` schema does not land until **increment 7**. Taken literally the DoD would therefore stamp an identical warning on **every deal on every company record** — 100% of rows, forever, until increment 7 — which is a statement about a schema gap, not about the data, and is exactly the kind of noise that trains Rob to ignore flags. So 5b reports the gap **once** per record, as `phaseStoreAvailable: false` rendered as a single line, and the per-deal phase flag plus the phase↔invoice cross-check move to their real home: **increment 7 (schema) / 8a (tracker cross-check)**, where there is a stored phase to disagree with an invoice. Nothing is dropped — 8a's DoD already carries "phase↔agreement↔invoice cross-check". What 5b *does* enforce, because it is checkable today, is the **stage↔key-date contract**: a deal parked on `paid` or `invoiced` with no matching date is a money claim with no paperwork behind it, and it flags per deal.

**The increment-5 "company page ≠ person page" test, enumerated (testable):** (1) company page renders the Phase Blueprint tracker + people-here rail; (2) person page renders the attribution-lineage centerpiece and neither tracker nor people rail; (3) the two pages share **zero** centerpiece components (shared primitives like timeline/inline fields are fine — no shared page-layout component); (4) both pass Q43 notes/enrichment discipline (notes prominent, enrichment collapsed at bottom with most-recent visible + expander).

**Unblocked status after Rob's 2026-07-22 decision batch (verified against the gates above):** every increment is now **A** — buildable on doc approval — **except** 8c's Top Automations slot *content* (OQ-6, the sole open question; 8c's visual states are A) and the out-of-scope Q44 customer portal (gated on 8a-c + ACCESS). Post-ACCESS registry lockdown (§6) also stays ACCESS-gated by nature. Rob's checklist edit pass (OQ-1 resolution mode) can rename/strike components at any time — it's config, so it never re-blocks 7/8a/8b.

---

## 9. Open questions for Rob

**OQ-1 through OQ-5: ALL RESOLVED 2026-07-22 (Rob decision batch — recorded in BUILD-QUEUE.md "ROB DECISIONS 2026-07-22 late"), answers folded into the sections above:**

| # | Was | Resolution | Folded into |
|---|---|---|---|
| OQ-1 | Phase component lists | **Max drafts, Rob edits** → draft shipped: `docs/plans/PHASE-COMPONENT-CHECKLIST-DRAFT.md` (P1 confirmed to include website-live-w/-AEO-SEO — starts the refund clock) | §3.1, increments 7/8a/8b |
| OQ-2 | Status labels | **Option A approved + ROLE amendment** (VP/Bookkeeper case → functional role + invoice-recipient flag; plus the `business` column fate) | §2b, §2c, increments 6/6b |
| OQ-3 | Per-phase pricing | **Standard list price per phase + per-customer override** | §3.1 pricing block, increment 8a |
| OQ-4 | Interim manual toggles | **YES** — acceptable until Will's tools send phase-signal webhooks | §3.1 toggles block, increments 7/9 |
| OQ-5 | Phase-4 exposure pre-ACCESS | **Route-hidden pre-ACCESS approved** — ship at unlinked owners route now; real auth at ACCESS | §6, increment 10 |

**Still open (one):**

6. **Top Automations slot content.** Who defines the "Top Automations we recommend" list shown between P1 and P2 — you, Will's build sheet, or per-vertical defaults Max drafts for your edit? *(Blocks only increment 8c's slot content; the visual states ship without it. Natural default candidate: the customer's `growth-scan` output — say the word and Max drafts per-vertical lists for your edit, same mode as OQ-1.)*

---

*Approval of this doc unlocks Q40–Q43 + Q45 builds in the §8 order (Q44 customer portal stays gated separately). Nothing in §3–§7b gets built before Rob signs off (Q39 DoD).*
