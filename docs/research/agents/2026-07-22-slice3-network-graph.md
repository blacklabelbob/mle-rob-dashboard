# Agent Report — Slice 3: Relationship-graph / network-first / personal CRMs
**Run:** 2026-07-22 · github-tool-scout methodology · all numbers live via `gh api` (account blacklabelbob)
**Feeds:** docs/research/oss-crm-landscape-2026-07-22.md

**Method note:** jakobo/kit → 404, dropped. Discovery covered `gh search repos` (20+ phrasings), GitHub topics `personal-crm` / `relationship-management`, sneg55/awesome-open-source-crm, HN threads (Nametag Show HN, Monica threads, Dex Launch HN), and web sweeps for Clay/Dex OSS alternatives.

**Headline finding:** No OSS project models R4 (promised-intro chase queue) or R5's door-value-alongside-dollar-value as first-class concepts. Rob's differentiator is confirmed unoccupied. Best prior art splits into three camps: graph-edge schema (nametag, followthemoney), referral provenance (django-referral-system), cadence/strength scoring (pingcrm, monica).

---

### mattogodoy/nametag
- https://github.com/mattogodoy/nametag — "A simple, yet effective Personal Relationship Manager" — 1,026★ | 57 forks | pushed 2026-07-22 | **AGPL-3.0** | TypeScript | 32 open issues
- **Relationship model** (`prisma/schema.prisma`): closest structural match to Rob's Person+Edge model found anywhere. `Relationship {personId, relatedPersonId, relationshipTypeId?, notes, deletedAt}` indexed on both endpoints; `RelationshipType {name, label, color, inverseId}` — **user-defined edge kinds with self-referential inverse pairs** (PARENT↔CHILD); `Person.relationshipToUserId` nullable "for indirect connections" — ego-vs-network edges distinguished; `JournalEntryPerson` join = activity timeline per person (R2); `ImportantDate` recurring reminder enums (R3-lite). D3 force-directed graph UI. Stack: Next.js 16 + TS + Prisma + Postgres.
- Health: 1k stars in ~6 months since Show HN (Jan 2026), pushed same-day, solo maintainer (bus factor flag).
- Alignment: R5 graph ✅ (no provenance/door-value), R2 ✅, R3 partial, R4 ✗, R14 near-perfect stack match.
- Verdict: **SCHEMA-ONLY** (AGPL; and Rob already has a live dashboard, so schema-mining wins anyway).
- License risk: AGPL-3.0 — no code copying; schema *ideas* fine.

### alephdata/followthemoney (+ alephdata/aleph)
- https://github.com/alephdata/followthemoney — "Data model and processing tools for investigative entity data" — 279★ | pushed 2026-02-28 | **MIT** | Python/YAML. Parent app aleph: 2,399★ | 351 forks | pushed 2026-02-20 | MIT.
- **Relationship model** (`followthemoney/schema/Interval.yaml`, `Associate.yaml`, `Family.yaml`, `Membership.yaml`, `UnknownLink.yaml`): relationship records extend `Interval` (time-bounded: startDate/endDate, summary, recordId for source provenance); child schemata like `Associate` declare `edge: {source: person, target: associate, directed: false}` with typed endpoints and named reverse properties. (Note: Interval.yaml itself states "Intervals are not graph edges" — the edge spec lives in the child schemata.) OCCRP's battle-tested "who-is-connected-to-whom with evidence" schema — the most rigorous edges-with-provenance model in OSS.
- Health: Foundation-grade (OCCRP-backed), moderate activity, stable/mature.
- Alignment: R5 edges-as-first-class-entities-with-time-bounds-and-source ✅✅ (exact pattern for referral provenance chains), everything else ✗ (investigation tool, not a CRM).
- Verdict: **SCHEMA-ONLY** (gold-standard pattern source). License: MIT — clean, could even lift code.

### sneg55/pingcrm
- https://github.com/sneg55/pingcrm — "Personal Networking CRM — AI-powered... scores relationships" — 103★ | pushed 2026-07-20 | **AGPL-3.0** | Python (FastAPI) + Next.js
- **Model** (`backend/app/models/contact.py`): `relationship_score` (indexed), `interaction_count`, `last_interaction_at`, `priority_level` (no person↔person edges). (`backend/app/services/followup_engine.py`): **two-pool "who do I touch today" engine** — Pool A (active, 3 slots) + Pool B (dormant revival, 2 slots), deterministic tier ladders (`interactions≥10 AND days>90 → 1000+base`, event-trigger bonus +300, 14-day re-suggest cooldown). `FollowUpSuggestion {trigger_type, suggested_message, suggested_channel, status, pool, scheduled_for}`. Also life-event detection, meeting prep, graph map view, MCP server.
- Health: young, very active; solo maintainer; author curates awesome-open-source-crm.
- Alignment: R3 ✅✅ (best-in-class cadence engine), R12 ✅, R2 ✅, R5 ✗, R4 ✗.
- Verdict: **SCHEMA-ONLY** (follow-up engine maps 1:1 onto scoring-pattern rule: explicit ladders, code-not-vibes). License: AGPL — re-derive, no code lift.

### monicahq/monica
- https://github.com/monicahq/monica — 24,888★ | 2,558 forks | pushed 2026-04-24 | **AGPL-3.0** | PHP/Laravel | 786 open issues
- **Model** (v5/"Chandler" branch): `app/Models/RelationshipType.php` — `{name, name_reverse_relationship, relationship_group_type_id}` — typed, grouped, inverse-labeled person↔person edges with auto-reciprocal services; `ContactReminder {frequency_number, type, last_triggered_at}` = keep-in-touch cadence (R3).
- Health: category king by stars but v4→v5 rewrite dragging 3+ years (issue #6626, discussion #7321); momentum down.
- Verdict: **SCHEMA-ONLY** — reference vocabulary for relationship-type taxonomies. License: AGPL.

### soldatov-ss/django-referral-system
- https://github.com/soldatov-ss/django-referral-system — 55★ | pushed 2026-04-21 | **MIT** | Python/Django
- **Model** (`referrals/models.py`): only repo found where **WHO-referred-WHOM is first-class**: `Promoter {user 1:1, referral_token unique}` → `Referral {user 1:1, promoter FK, invitation_method, status enum, commission_rate frozen-at-creation}` → `PromoterCommission {promoter, referral, amount, status}` → `PromoterPayout`. Provenance token → referral row → value attribution row = the skeleton for door-value ledgering (swap commission-$ for est-revenue + est-new-nodes).
- Verdict: **SCHEMA-ONLY** (MIT — patterns AND code usable). License: clean.

### carlassmann/tilly
- https://github.com/carlassmann/tilly — "relationship journal... offline-capable PWA... AI agent" — 64★ | pushed 2026-07-09 | **MIT** | TypeScript
- Minimal model: Person + notes/journal per person, reminder cadence. No edges.
- Verdict: **TACK-ON** (MIT TS code for timeline/journal UX). License: clean.

### harperreed/crm
- https://github.com/harperreed/crm — 26★ | pushed 2026-04-02 | **no license file** | Go
- `Relationship {SourceID, TargetID uuid, Type string, Context string}` — fully generic typed edge, entity-agnostic. MCP server, Google sync.
- Verdict: **SCHEMA-ONLY.** License: NO LICENSE = all-rights-reserved; ideas only, zero code reuse.

### djaiss/peopleOS
- https://github.com/djaiss/peopleOS — "Bullshit free personal CRM" by Monica's founder — 27★ | last push 2025-08-25 (**archived**) | **MIT** | PHP/Laravel
- `Encounter.php` (met-someone log — nice R2 primitive), `LifeEvent.php`, typed specific relations.
- Verdict: **SCHEMA-ONLY** (the `Encounter` concept). License: MIT.

### twentyhq/twenty
- 53,467★ | AGPL + `@license Enterprise` dual | metadata-driven custom objects with generic RELATION field type — no network graph, no provenance, no door-value.
- Verdict: **REJECT for this slice.**

### kbanc85/claudia
- https://github.com/kbanc85/claudia — "AI chief of staff. Remembers relationships, tracks commitments" — 277★ | pushed 2026-07-10 | **PolyForm Noncommercial 1.0.0** | Python
- Markdown/vault-based memory + commitment tracking ("I said I'd intro X to Y") — conceptually closest to R4's promise-chasing, but prose memory, not schema.
- Verdict: **REJECT for reuse** (noncommercial license kills productization). UX concept only.

### datenknoten/freundebuch
- https://github.com/datenknoten/freundebuch — 2★ | pushed 2026-06-29 | **AGPL-3.0** | TypeScript (SvelteKit + raw SQL)
- contact↔contact relationship rows + **circles** (Dunbar-style grouping); readable hand-written SQL.
- Verdict: **SCHEMA-ONLY.** License: AGPL.

### vasturiano/react-force-graph
- https://github.com/vasturiano/react-force-graph — 3,245★ | pushed 2026-02-04 | **MIT** | React
- 2D/3D/VR force graph; node canvas objects, link directional particles — good for animating referral flow direction.
- Verdict: **TACK-ON** (viz layer only). MIT.

**Dropped with reason:** FeeiCN/grw (dead 2016, no license), puncsky/touchbase.ai (MIT, dead 2021), lorey/personal-crm (dead 2022), jakobo/kit (404), meoyawn/warmpath (4★, warm-intro pathfinding concept, Unlicense), Nexus/vandan1729 (0★ vaporware), lunatask (closed-source), KiloNiner/asocial (3★, AGPL).

---

## Ranked top-3

1. **mattogodoy/nametag** — structural twin of Rob's Person+Edge+graph UI in the same stack family, alive today, 1k stars. Mine: soft-deleted edges, user-defined inverse-paired RelationshipTypes, "indirect connection" nullable ego-edge. AGPL = ideas only.
2. **alephdata/followthemoney** — MIT, foundation-backed; edges as time-bounded entities with source provenance. The right formal skeleton for referral-provenance chains.
3. **sneg55/pingcrm** — best "who do I touch today" engine found: two-pool slot-limited suggestion queue with deterministic tier ladders + event bonuses + cooldowns. AGPL = re-derive.

## Patterns worth stealing (referral provenance + door-value)

1. **Edges as dated, sourced entities** (followthemoney `Interval`): every edge gets `startDate`, optional `endDate`, `summary`, `recordId` evidence pointer. For Rob: every intro edge carries *when promised, when made, and the artifact proving it*.
2. **Provenance chain as 3-table ledger** (django-referral-system): `Promoter → Referral(status enum, method, rate-frozen) → Commission(amount, status)`. Swap commission for door-value: `Person → Intro(promised/made/converted) → ValueEvent(est_revenue, est_new_nodes, probability)`. **The status enum on the referral row IS R4's chase queue**: `promised` with no linked lead = chase.
3. **Inverse-paired, user-defined edge types** (nametag `RelationshipType.inverseId`; monica `name_reverse_relationship`): one edge row, both directions rendered with correct labels. Rob's edge kinds should each declare an inverse label.
4. **Soft-delete on edges + indexes on both endpoints** (nametag): `deletedAt` + `@@index([personId, deletedAt])` — relationship history never destroyed; matters for provenance auditing.
5. **Two-pool slot-limited touch queue with threshold ladders** (pingcrm): active pool (3 slots) + dormant-revival pool (2 slots), explicit tiers, +300 event bonus, 14-day cooldown. Deterministic, code-not-prose.
6. **"Indirect connection" nullable ego-edge** (nametag): distinguishes people Rob knows from people who only exist *inside* the network — matches lit/warm/unlit.
7. **Encounter as a primitive** (peopleOS): log *meetings* as objects distinct from notes — cheap R2 timeline atoms.
8. **Market gap confirmed:** across ~40 repos, zero model door-value/network-value per node, zero implement intro-promise chasing as schema. Nametag's HN thread (Jan 2026) shows demand for graph-first PRM; nothing does value-weighted edges.

**Sources:** [Nametag Show HN](https://news.ycombinator.com/item?id=46599958) · [sneg55/awesome-open-source-crm](https://github.com/sneg55/awesome-open-source-crm) · [Monica v4-vs-v5 discussion](https://github.com/monicahq/monica/discussions/7321) · [Monica project update issue #6626](https://github.com/monicahq/monica/issues/6626) · [Dex Launch HN](https://news.ycombinator.com/item?id=20699923) · [NocoBase OSS CRM roundup](https://www.nocobase.com/en/blog/github-open-source-crm-projects) · [Storyflow comparison](https://storyflow.so/blog/best-personal-crm-tools-2026) · [YourPond comparison](https://www.yourpond.io/blog/best-personal-crm-apps-2026) · [RepoCloud Nametag listing](https://www.repocloud.io/details/Nametag/) · schema files cited inline (all via `gh api`).
