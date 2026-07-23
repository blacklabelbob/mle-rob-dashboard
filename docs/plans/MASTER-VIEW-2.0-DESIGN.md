# MASTER VIEW 2.0 — Design Doc
**Date:** 2026-07-22 · **Status:** DRAFT rev 2 (critic-rob 88/100 punch list applied) — awaiting re-review + Rob sign-off (Q39 gate for Q40–Q43) · **Owner:** Max
**Sources:** Rob dumps `sources/7.22.26-2.md`, `sources/7.22.26-3.md` (gospel), `sources/ROB-CRM-VISION-DUMP-2026-07-17.md`, `sources/DATA-MODEL-crm-erd-2026-07-17.md`, BUILD-QUEUE Q39–Q43, live demo `https://mylocaleverything.com/app?demo=1`
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

The graph (`/network`) is untouched: mixed nodes stay, per Rob. The existing dedup/CSV/search tooling moves with the People list.

### 2b. Status vocabulary — replacing the shared "Client" label

Rob: *"I dont love that they can both share 'Client' designation. Maybe 'Client/Owner' I dont know. I want you to think long and hard about this."*

The root problem: `nodeType: "client"` is applied to both Caleb (a human) and Miga Food Manufacturing (a company). "Client" is true of the **company relationship**; the human's label should say **what they are to that relationship**.

**Three options considered:**

**Option A — Per-object vocabularies (RECOMMENDED).** Companies and People get different label sets; the person's label is relative to their company.

| Companies | People |
|---|---|
| Prospect · **Client** · Partner Org · Spinoff · Vertical Anchor · Dormant | **Owner** · Champion · Connector · Partner · Rep Candidate · Lead (unattached) |

So the list reads: *Miga Food Manufacturing — Client* and *Caleb — Owner @ Caleb's company*. Rob's instinct ("Client/Owner") is honored — those are the two labels — but split across the two objects instead of jammed into one. Attio/Folk/Twenty all type their vocabularies per object; nothing shares a label across People and Companies.

**Option B — Rob's compound label ("Client/Owner") on one shared vocabulary.** What it does better than A: zero migration (one enum stays), and one label carries both facts at a glance without needing the company column. Loses because it re-creates the interleaving problem at the label level — a compound label on a person still doesn't tell you which company, and companies would still need their own set anyway.

**Option C — Attio-style: status lives on deals/lists, records carry only identity.** Statuses like "Client" become derived (a company is a Client iff it has a paid deal). What it does better than A: statuses can never go stale — they're computed from money, which is the CRM-purist answer and where we should drift long-term. Loses today because Rob reads statuses as *his* hand-set relationship notes (connector, anchor), not derivable facts, and it makes the label un-editable inline — violating the click-to-edit bar.

**Recommendation: Option A now, with C's derivation as a check** — if a company is marked Client but has no signed deal, flag it in Things to Address (same pattern as the existing "⚠ disputed signed" flag).

Migration note: `node_type` slugs stay in the DB; this is a label-map + per-object filtered option list change (`lib/labels.ts` already centralizes this), plus a one-time reclassification pass over the ~54 rows using the ERD doc's org-split heuristic (`DATA-MODEL-crm-erd-2026-07-17.md` §3).

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

**What the demo shows** (fetched 2026-07-22, `mylocaleverything.com/app?demo=1`): a three-phase blueprint rail — **Phase 1 "live now"** (green LIVE state), **Phase 2 "high-ROI automation" badged "NEXT UP"**, **Phase 3 "the 95% business" subtitled "THE DEEP END"** (future/locked, with a "Browse the full automation database" link). Current phase uses operational live-status language; future phases are visually quieter aspirational cards. Our tracker mirrors that grammar: **lit components for the active phase, a "NEXT UP" card for the following phase, a quiet locked card for the one after.**

**Per-phase card spec (master view):**

```
PHASE 1 — Foundation                              ● ● ● ○ ○  3/5 live
├─ components: [Website+AEO-SEO ●] [AI Receptionist ●] [GBP ●]
│              [Reviews ○] [Booking ○]        (names TBD — OQ-1)
├─ money:  Agreement #A-102 (Phase 1) · Invoiced $X · PAID ✓ 7/02
├─ refund: 30-day window — ACTIVE, 19 days left (started 7/10,
│          website-live-with-AEO-SEO)     [state machine below]
└─ ── between P1 and P2: "TOP AUTOMATIONS WE RECOMMEND" slot ──
PHASE 2 — High-ROI Automations                    NEXT UP
├─ money: not yet invoiced · ROI guarantee: 3 months (calcs — Rob)
PHASE 3 — (locked, quiet)
```

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

**Rep view of the same tracker:** lights + phase names + "NEXT UP" only — no invoice amounts, no refund mechanics. Rob: *"we will want the Rep to be able to see the progress update from the Entity Page or Company page."* (7.22.26-3)

**Data model deltas:** `phases` (per company: phase_no, status, agreement_id, invoice_amount, invoiced_at, paid_at), `phase_components` (per phase: name, live_at, signal_source), refund fields on phase 1 row. The inbound signal is fully specified in **`docs/plans/PHASE-SIGNAL-WEBHOOK-CONTRACT.md`** (drafted, versioned, idempotent, secret-header auth per the n8n-email pattern — written for Will/partner to react to). The current `Person.phaseOne` field is superseded and migrates into `phases`.

### 3.2 People at this company (right rail, top)

Owner first (label from §2b), then champions/others; each name links to the person record. Mirrors Folk's People-section-on-company-profile ([Folk](https://help.folk.app/en/articles/4998069-link-people-and-companies)) and Attio's `Team` attribute ([Attio](https://attio.com/help/reference/managing-your-data/objects/manage-standard-objects)). Data: `people.orgId` (already backfilled by `backfill-org-links.mjs`).

### 3.3 Deals — services and equity are separate sections

- **Services:** the Phase 1–3 deals, each showing its associated phase, stage, value, key dates. This is where the phase ↔ agreement ↔ invoice cross-check surfaces mismatches ("agreement says Phase 2, no Phase 2 invoice").
- **Where the rep notes the phase (decision):** Rob — *"the Rep should be noting the Associated Phase for the Associated Agreement"* (7.22.26-3). The UI home is an **inline `Phase` field on the deal card in `/rep/accounts/[id]`** — click-to-edit select (P1/P2/P3), autosave, per Rob's inline-edit standard (no edit mode, no Save button). That rep-entered value is exactly what the master-side cross-check above compares against invoices; a deal missing its phase flags in Things to Address.
- **Phase 4 / Equity — owners-only:** rendered only for owner role; reps never see this section (mechanics in §6). Rob: *"these Spinoff Companies and the details of them are not something I necessarily want our Reps to see."* (7.22.26-2)

### 3.4 Activity timeline

Existing `ActivityTimeline` component, kept. Center-column chronological activity is the industry-standard record spine ([HubSpot](https://knowledge.hubspot.com/records/work-with-records), [Pipedrive detail view](https://support.pipedrive.com/en/article/deal-detail-view), [Attio Activity tab](https://attio.com/help/reference/managing-your-data/records/configure-record-pages)).

### 3.5 Notes vs enrichment (Q43 discipline — applies to BOTH record types)

**Decision: NOTES = human words only, prominent, directly under the timeline. Enrichment/provenance = collapsed section at the very bottom: most recent line visible + "show all (N)" expander. Never mixed.** BUILD-QUEUE Q39(d), from Rob's evening message: *"NOTES section = real human notes that mean something, never enrichment dumps."*

Precedent: Attio keeps Notes as their own tab/section while enriched data lives in identified attribute cells — per their docs, lilac colored cells represent enriched data points automatically populated by Attio, with a sparkle icon next to enriched attribute names in table views — i.e. machine-produced values are visually **marked as machine-produced**, never prose-dumped into notes ([Attio enriched data](https://attio.com/help/reference/managing-your-data/enriched-data)). We adopt the same contract: machine-derived facts are data, styled as data, quarantined at the bottom; the Notes box is sacred.

One more Rob rule lands here (7.22.26-2): *"When you pick up from either notes I've inputted or meeting or email notes you've seen its Important you highlight the FUTURE opportunities outside of just working phase 1-3."* → any detected Phase-4 opportunity renders as a **highlighted "Future opportunity (Phase 4)" callout** above Notes on the company page (owners-only), feeding the §6 registry — not buried in enrichment.

### 3.6 Details grid + enrichment

The current 16-field inline-edit grid (`PersonEditor`) survives but **demoted** below Notes, trimmed to company-relevant fields (website, phone, vertical, assigned rep, key dates). Inline click-to-edit autosave is retained everywhere — Rob's law, no Save buttons.

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

**Columns:** Spinoff entity · Partner (person link) · Origin client (company link) · Equity split (e.g. 40/60) · State: **DISCUSSED → AGREED → SIGNED** · Paperwork task (link, due date, overdue flag) · Notes.

Seeded rows (already in data per Q41): `spinoff-homeclonevault` (Alex, 40/60, AGREED-unsigned, task due 7/29) · `deal-gulf-coast-equity-phase4` (30%, PROBABLE, unsigned, task due 7/29). Caleb's CRM enters as DISCUSSED.

**Rep-hiding:**
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

---

## 8. Build plan — ordered increments (10-minute driver sized)

Sequenced so nothing waits on Rob that doesn't have to. **A = buildable on doc approval · R = needs a Rob decision first.**

| # | Increment | Gate | DoD |
|---|---|---|---|
| 1 | **Rep card click-through (Q42).** Whole-card link on `/rep` queue cards; buttons stopPropagation. | A (buildable now) | Click any card body in prod → lead detail opens |
| 2 | **Notes/enrichment retrofit (Q43).** On current record page: Notes prominent; enrichment/provenance collapsed at bottom, most-recent visible + expander. | A (buildable now) | Record renders notes-first; critic-rob readability pass |
| 3 | **Lineage engine.** `lib/lineage.ts` pure chain-walk + cycle guard + tests; breadcrumb component; mount on person page + "doors opened" lines. | A | Unit tests green; person page shows `ROB → … → X` |
| 4a | **`/companies` list.** New route + table with company columns (name, vertical, status, phase, owed/paid, rep, last touch); nav entry. | A | `/companies` live, companies only, zero people rows |
| 4b | **`/people` re-filter.** Existing ledger filtered to humans only; person columns per §2a (role @ company, chain, relationship label); dedup/CSV/search tooling verified on the filtered view. | A | `/people` shows zero companies; companies+people row counts reconcile to old ledger total |
| 5a | **Company record shell.** New `app/companies/[id]`: header (status/vertical/rep) + people-here right rail + Things to Address. | A | Company route renders header + people rail from `orgId` links |
| 5b | **Company deals section.** Services deals list w/ per-deal phase, stage, value, key dates + phase↔invoice mismatch flags. | A | Deals render on company page; a phase-less deal produces a flag |
| 5c | **Company notes/enrichment order.** Timeline → Notes (human, prominent) → details grid (demoted) → enrichment collapsed at very bottom (most-recent + expander). | A | §3 section order onscreen; passes Q43 discipline |
| 5d | **Person page slim-down.** Person record re-cut per §4: relationship-forward header, lineage centerpiece, company link; no phase UI, no money. | A | See enumerated ≠-test below |
| 6 | **Status vocabulary.** Apply §2b Option A label maps; reclassify ~54 rows (ERD §3 heuristic, ambiguous → review queue); Client-without-deal flag wired to Things to Address. | **R** (OQ-2) | Labels live per object; reconciliation report zero-drop |
| 7 | **Refund state machine + phase schema.** `lib/phases/refund.ts` pure FSM (time as param) + tests; `phases`/`phase_components` migration; manual component toggles as interim signal. | A (schema) / **R** (component list, OQ-1) | FSM tests cover all 4 states incl. VOIDED_BY_ADVANCE |
| 8a | **Tracker — master variant.** §3.1 card on company record: component lights, per-phase invoiced/paid/owed row, refund-window state line, phase↔agreement↔invoice cross-check. | **R** (OQ-1, OQ-3) | Master tracker renders lights + money + refund state for a seeded company |
| 8b | **Tracker — rep variant.** Lights + phase names + NEXT UP only on `/rep/accounts/[id]`; inline `Phase` field on the deal (§3.3 decision). | **R** (OQ-1) | Rep page shows lights, zero money strings in payload; phase editable inline |
| 8c | **Tracker — demo-grammar states + Top Automations slot.** Live / NEXT UP / locked-quiet phase card states matching the demo; "Top Automations we recommend" slot rendered between P1 and P2. | **R** (OQ-3) | Three visual states match demo grammar; slot renders between phases |
| 9 | **Signal webhook.** Inbound `POST /api/webhooks/phase-signal` per the drafted contract — **`docs/plans/PHASE-SIGNAL-WEBHOOK-CONTRACT.md`** (payload, idempotency, secret header, 503-inert) — flipping `phase_components.live_at`; armed but inert until the secret is set. | A (contract drafted) / **R** (OQ-4 interim toggles) | Test payload lights a component end-to-end; duplicate eventId no-ops |
| 10 | **Phase-4 registry.** `/registry` owners route + company-page equity section; rep-payload exclusion; seeded rows render; overdue paperwork flags. | A (interim hiding) / **R** (OQ-5 for prod exposure) | Registry lists HomeCloneVault + Gulf Coast; `/rep/*` payloads verifiably equity-free |
| — | *(Q44 — customer Blueprint portal: out of scope here; gated on 8a-c + ACCESS; see §1.)* | | |

**The increment-5 "company page ≠ person page" test, enumerated (testable):** (1) company page renders the Phase Blueprint tracker + people-here rail; (2) person page renders the attribution-lineage centerpiece and neither tracker nor people rail; (3) the two pages share **zero** centerpiece components (shared primitives like timeline/inline fields are fine — no shared page-layout component); (4) both pass Q43 notes/enrichment discipline (notes prominent, enrichment collapsed at bottom with most-recent visible + expander).

Each sub-increment is independently shippable and demoable inside one driver session; 1–5d need no Rob input beyond this doc's approval.

---

## 9. Open questions for Rob (only the blocking ones)

1. **Phase component lists.** What are the named components of Phase 1 (and 2/3 when known)? e.g. Website+AEO-SEO, AI Receptionist, GBP, Reviews, Booking…? We need the canonical checklist to render the lights — is this yours to define or do we pull it from Will's build sheet? *(Blocks increments 7–8.)*
2. **Status labels.** Approve §2b Option A (Companies: Prospect/Client/Partner Org/Spinoff/Vertical Anchor/Dormant · People: Owner/Champion/Connector/Partner/Rep Candidate/Lead) — or edit the words. *(Blocks increment 6.)*
3. **Per-phase pricing.** Are Phase 1/2/3 invoice amounts standard prices, or quoted per customer? (Determines whether the tracker's "owed" is a config value or per-deal entry.) *(Blocks increment 8's money row.)*
4. **Interim manual toggles.** The webhook payload contract is **already drafted** — `docs/plans/PHASE-SIGNAL-WEBHOOK-CONTRACT.md`, written for Will/partner to react to. The only blocking question: until the partner wires it, are **manual component toggles (Master View only, audit-logged as `source: "manual-rob"`)** an acceptable interim so the tracker is usable day one? *(Blocks increment 9's interim path only.)*
5. **Phase-4 exposure pre-ACCESS.** Until real logins land, the registry is hidden by route/nav only — not real security. OK to ship to prod that way, or hold `/registry` behind the basic-auth wall / local-only until ACCESS? *(Blocks increment 10 in prod.)*

---

*Approval of this doc unlocks Q40–Q43 builds in the §8 order (Q44 customer portal stays gated separately). Nothing in §3–§7 gets built before Rob signs off (Q39 DoD).*
