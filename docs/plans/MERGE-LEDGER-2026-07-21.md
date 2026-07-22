# Merge Ledger — 2026-07-21

**Purpose:** zero-loss proof for the unification of `PRD-mle-rob-dashboard-v2.md` (base PRD, v1.0→2.1.2) and
`PRD-mle-crm-evolution-v1.md` (CRM-evolution PRD, v1.0→2.2.28) into `PRD-mle-crm.md` (unified, v3.0).
Every task ID, scope bullet, success criterion, open question, decisions-log row, and dependency row from
BOTH source documents is listed below with a disposition and its new location. Source files were read in
full three times during this merge (initial extraction, gap-check pass, targeted questions/decisions/
dependencies pass) — see the Verification Passes section at the end for what each pass caught.

**Disposition key:**
- `kept-as-is` — unchanged, lives in the unified doc exactly as it did in its source (CRM skeleton)
- `new-id-X` — renumbered/relocated into the unified doc under a new task ID, content preserved verbatim (or near-verbatim with only the ID/label changed)
- `merged-into-X` — folded into an existing task/row, both sources' content preserved in the merged text
- `completed/absorbed` — task was already checked/done; recorded here as historical fact, not re-listed as an active task
- `superseded-by-X` — explicitly superseded before this merge (already marked so in the source PRDs); disposition unchanged by this merge, just carried forward
- `duplicate` — same substance already present in the retained CRM skeleton; not re-added, cross-referenced here for the record
- `flagged-overlap` — both source items kept as separate, distinct tasks, but a cross-reference note was added in the unified doc because their subject matter genuinely overlaps; NOT auto-merged (judgment call — see summary)

---

## 1. Base PRD — Tasks

### Phase 0: Overnight Build (all complete)

| Task ID | Description | Disposition | New Location |
|---|---|---|---|
| 0.1 | Write WHAT-WE-ARE-DOING.md | completed/absorbed | Not re-listed; unified PRD links the file directly (Related Files) |
| 0.2 | Scaffold Next.js + git init | completed/absorbed | Historical — foundation of current codebase |
| 0.3 | Data model: Person/Node, Edge, Project, Vertical, Estimate types | completed/absorbed | Historical — `lib/types.ts`, extended by CRM Task 2.2 |
| 0.4 | StorageAdapter interface + JSON file store | completed/absorbed | Historical — extended by CRM Task 2.3 |
| 0.5 | Seed data (Polk chain, verticals, project list) | completed/absorbed | Historical |
| 0.6 | People ledger page | completed/absorbed | Historical — extended by Task M1.1, CRM Task 2.0 (org split) |
| 0.7 | Network graph page | completed/absorbed | Historical — Rob's super-admin lens per North-Star Principle 5 |
| 0.8 | Overview + Projects pages | completed/absorbed | Historical |
| 0.9 | AI estimator v1 (heuristic) | completed/absorbed | Historical — superseded by live Claude estimator, Task M1.3 |
| 0.10 | Evaluate → iterate → verify → deploy; morning report | completed/absorbed | Historical |

### Phase 1: Storage & Real Data

| Task ID | Description | Disposition | New Location |
|---|---|---|---|
| 1.1 | GATE: storage decision | completed/absorbed | Resolved 2026-07-04 (Supabase); recorded in unified Decisions Log (first row) |
| 1.2 | Implement store adapter + migrate seed → real data | completed/absorbed | Resolved 2026-07-17; unified PRD's Phase 2 prereq note ("Prereqs: base-PRD Task 1.2... complete") |
| 1.3 | Brain-dump first ~25 real people | completed/absorbed | Resolved (54 people loaded); unified Dependencies table |
| 1.4 | Add-person form (<60s) + inline edit | new-id-M1.1 | Phase M1, Task M1.1 |
| 1.5 | Import roofing lists + lead-magnet inventory as seed clusters | new-id-M1.2 | Phase M1, Task M1.2 |
| 1.6 | Nightly backup of store to file | merged-into-MC.16 | Mission Control Task MC.16 (base 9.5 Hardening) — judgment call, flagged in summary |

### Phase 2: Network Intelligence

| Task ID | Description | Disposition | New Location |
|---|---|---|---|
| 2.1 | Claude-powered estimator on live data | new-id-M1.3 | Phase M1, Task M1.3 |
| 2.2 | Connection suggester | new-id-M1.4 | Phase M1, Task M1.4 |
| 2.3 | Success-rate vs probability overlay | new-id-M1.5 | Phase M1, Task M1.5 |
| 2.4 | Node-activation playbook per node type | new-id-M1.6 | Phase M1, Task M1.6 |
| 2.5 | Vertical-anchor scan (payment processing) | new-id-M1.7 | Phase M1, Task M1.7 |
| 2.6 | Cluster analytics | new-id-M1.8 | Phase M1, Task M1.8 |

### Phase 3: Meeting→Money Flow

| Task ID | Description | Disposition | New Location |
|---|---|---|---|
| 3.1 | Low-friction meeting notes capture | new-id-M2.1 | Phase M2, Task M2.1 |
| 3.2 | Notes → scope extraction → agreement fields | new-id-M2.2 | Phase M2, Task M2.2 |
| 3.3 | Signature → invoice-out trigger | new-id-M2.3 | Phase M2, Task M2.3 |
| 3.4 | Time-to-payment tracking | new-id-M2.4 | Phase M2, Task M2.4 |
| 3.5 | Key-dates timeline per person | new-id-M2.5 | Phase M2, Task M2.5 |

### Phase 4: Team & Training

| Task ID | Description | Disposition | New Location |
|---|---|---|---|
| 4.1 | Phase One explainer | completed/absorbed | Already shipped 2026-07-04; noted under Phase M3 heading, not re-listed |
| 4.2 | Rep chat box | new-id-M3.1 | Phase M3, Task M3.1 |
| 4.3 | Record/approve coaching materials | new-id-M3.2 | Phase M3, Task M3.2 |
| 4.4 | Rep onboarding path | new-id-M3.3 | Phase M3, Task M3.3 |
| 4.5 | Collateral shelf incl. Will-owed items | new-id-M3.4 | Phase M3, Task M3.4 |

### Phase 5: Cadence & Automation

| Task ID | Description | Disposition | New Location |
|---|---|---|---|
| 5.1 | Daily priorities panel | new-id-M4.1 | Phase M4, Task M4.1 |
| 5.2 | Reminders engine | new-id-M4.2 | Phase M4, Task M4.2 |
| 5.3 | Scheduling hooks (estimator refresh, connection scan, daily digest) | new-id-M4.3 (flagged-overlap w/ MC.15) | Phase M4, Task M4.3 |
| 5.4 | Events section | new-id-M4.4 | Phase M4, Task M4.4 |
| 5.5 | PRD autosave verification | new-id-M4.5 | Phase M4, Task M4.5 |
| 5.6 | Update-reminders for Products section | new-id-M4.6 | Phase M4, Task M4.6 |

### Phase 6: Growth Tooling

| Task ID | Description | Disposition | New Location |
|---|---|---|---|
| 6.1 | Scraper/search pipeline for target groups | new-id-M5.1 | Phase M5, Task M5.1 |
| 6.2 | Vertical expansion queue | new-id-M5.2 | Phase M5, Task M5.2 |
| 6.3 | Bulk import (CSV) | superseded-by-CRM-4.3/4.4 | Already superseded pre-merge (base v2.1.2); not re-listed; carried in unified Phase 4 Task 4.3 text |
| 6.4 | Reuse roofing lead magnets | new-id-M5.3 | Phase M5, Task M5.3 |
| 6.5 | Recruit first 2 reps | new-id-M5.4 | Phase M5, Task M5.4 |

### Phase 7: Business Definitions & KPIs

| Task ID | Description | Disposition | New Location |
|---|---|---|---|
| 7.1 | Canonical pipeline-stage definition | superseded-by-CRM-1.6 | Already superseded pre-merge (base v2.1.2); not re-listed; carried in unified Phase 1 Task 1.6 text |
| 7.2 | Define 7 sales KPIs | new-id-MC.1 | Mission Control, Task MC.1 |
| 7.3 | Define 4 marketing KPIs | new-id-MC.2 | Mission Control, Task MC.2 |
| 7.4 | Define "Needs Action Today" rule set | new-id-MC.3 (flagged-overlap w/ CRM 1.7) | Mission Control, Task MC.3 |
| 7.5 | Lead-source taxonomy + UTM convention | new-id-MC.4 (cross-ref w/ CRM 1.15) | Mission Control, Task MC.4 |
| 7.6 | Stalled-deal thresholds, qualified-lead gate, lost-reason enum | new-id-MC.5 (flagged-overlap w/ CRM 1.6/1.7) | Mission Control, Task MC.5 |
| 7.7 | GATE G1: CRM system of record decision | **completed/absorbed — see summary finding** | Mission Control phase header note; unified Dependencies table (flagged for Rob's explicit sign-off, not silently closed) |

### Phase 8: Ops Data & Ingestion

| Task ID | Description | Disposition | New Location |
|---|---|---|---|
| 8.1 | Inventory onboarding-PRD data + webhook fields | new-id-MC.6 | Mission Control, Task MC.6 |
| 8.2 | GATE G3: confirm invoicing/AR backing store | new-id-MC.7 | Mission Control, Task MC.7 |
| 8.3 | Read-model data contract + read-only role | new-id-MC.8 | Mission Control, Task MC.8 |
| 8.4 | n8n ingestion workflows (Cal.com/Fathom/Documenso/invoicing) | new-id-MC.9 | Mission Control, Task MC.9 |
| 8.5 | Error workflow + freshness (`sync_failures`, `last_synced_at`) | new-id-MC.10 | Mission Control, Task MC.10 |
| 8.6 | Publish Mermaid workflow map | new-id-MC.11 | Mission Control, Task MC.11 |

### Phase 9: Ops Panels, Alerting & Hardening

| Task ID | Description | Disposition | New Location |
|---|---|---|---|
| 9.1 | Add ops panels to dashboard | new-id-MC.12 | Mission Control, Task MC.12 |
| 9.2 | "Needs Action Today" widget | new-id-MC.13 (flagged-overlap w/ CRM 2.6) | Mission Control, Task MC.13 |
| 9.3 | Alerting (stale data, failed sync, overdue items, unpaid invoices) | new-id-MC.14 | Mission Control, Task MC.14 |
| 9.4 | Daily digest + weekly KPI rollup | new-id-MC.15 (cross-ref w/ M4.3) | Mission Control, Task MC.15 |
| 9.5 | Hardening (secrets, health endpoint, backup, no client-bundle secrets) | new-id-MC.16 | Mission Control, Task MC.16 — absorbs base 1.6's nightly-backup DoD |
| 9.6 | Live sign-off: spot-check 3 records | new-id-MC.17 | Mission Control, Task MC.17 |

### "Retired from v1" list (already moot in base PRD)

| Item | Description | Disposition | New Location |
|---|---|---|---|
| G2 | Will-access gate | completed/absorbed (already resolved in base) | Carried verbatim into unified Mission Control phase's "Retired" list |
| G4 | Hetzner capacity check + Docker/Caddy ADR | completed/absorbed (already moot in base) | Carried verbatim into unified Mission Control phase's "Retired" list |
| — | Standalone brand-spec task | completed/absorbed (already moot in base) | Carried verbatim into unified Mission Control phase's "Retired" list |
| — | Competitive dashboard scan | completed/absorbed (already moot in base) | Carried verbatim into unified Mission Control phase's "Retired" list |

---

## 2. Base PRD — Scope Bullets

### Scope IN (front-loaded — The Network)

| Bullet | Disposition | New Location |
|---|---|---|
| The Network graph | completed/absorbed (shipped 0.7) | Referenced in unified Scope IN carryover bullet + North-Star Principle 5 |
| People ledger | completed/absorbed (shipped 0.6), extended | Extended by Task M1.1 + CRM Task 2.0 |
| Projects board + Products section | completed/absorbed (shipped 0.8) | — |
| AI contribution estimator | completed/absorbed v1 (0.9), extended | Extended by Task M1.3 |
| Meeting→Money | carried-to-Phase-M2 | Unified Scope IN carryover bullet; Phase M2 |
| Training corner | carried-to-Phase-M3 | Unified Scope IN carryover bullet; Phase M3 |
| Storage behind an adapter | completed/absorbed (shipped 0.4/1.2), extended | Extended by CRM Task 2.3 |
| Daily prioritization, reminders, events | carried-to-Phase-M4 | Unified Scope IN carryover bullet; Phase M4 |

### Scope IN (deferred — mission control, Phases 7–9)

| Bullet | Disposition | New Location |
|---|---|---|
| Canonical pipeline stages, stalled-deal thresholds, qualified-lead gate, lost-reason taxonomy | carried-to-Mission-Control (partially superseded by CRM 1.6) | Mission Control Task MC.5 (flagged-overlap) |
| 7 sales KPIs + 4 marketing KPIs | carried-to-Mission-Control | Mission Control Tasks MC.1, MC.2 |
| Lead-source attribution / UTM taxonomy | carried-to-Mission-Control | Mission Control Task MC.4 |
| Read-only data layer over onboarding/invoicing systems | carried-to-Mission-Control | Mission Control Task MC.8 |
| n8n ingestion: Cal.com, Fathom, Documenso, invoicing webhooks | carried-to-Mission-Control | Mission Control Task MC.9 |
| Ops panels (Pipeline, Onboarding/E-sign, Action Items, Invoicing/AR, KPI Summary, Needs Action Today) | carried-to-Mission-Control | Mission Control Tasks MC.12, MC.13 |
| Alerting, digests, backups, security hardening | carried-to-Mission-Control | Mission Control Tasks MC.14, MC.15, MC.16 |

### Scope OUT

| Bullet | Disposition | New Location |
|---|---|---|
| GoHighLevel in any form; Close CRM as destination | duplicate (already in CRM's own OUT list, same substance) | Unified Scope OUT (CRM's original bullet, unchanged) |
| Outside investment tracking | new-bullet-added | Unified Scope OUT (new bullet, tagged "added 2026-07-21 merge") |
| Client-facing views / white-label embeds | duplicate (already in CRM's own OUT list) | Unified Scope OUT (CRM's original bullet, unchanged) |
| Writing back to onboarding/invoicing source systems | new-bullet-added | Unified Scope OUT (new bullet, tagged "added 2026-07-21 merge") |

---

## 3. Base PRD — Success Criteria

| Criterion | Disposition | New Location |
|---|---|---|
| Rob opens one URL: graph/ledger/projects/estimates all render | completed/absorbed (Phase 0 shipped) | — |
| Adding a person takes <60s | new-bullet-added + carried-as-DoD | Unified Success Criteria (new bullet) + Task M1.1's DoD |
| AI estimator Polk test case directionally right | new-bullet-added + carried-as-DoD | Unified Success Criteria (new bullet) + Task M1.3 |
| Storage swap test: zero UI functionality lost | duplicate (CRM's own success criteria already state the storage-adapter guarantee) | Unified Success Criteria (CRM's original bullet, unchanged); extended by CRM Task 2.3's contract tests |
| (Phases 7–9) Every KPI documented, panel data matches source on 3-record spot check, stale-data alerts within 30 min | carried-to-Mission-Control | Mission Control Tasks MC.1, MC.2, MC.14, MC.17 |
| PRD checkboxes/revision history current within 24h | new-bullet-added | Unified Success Criteria (new bullet) |

---

## 4. Base PRD — Open Questions

| ID | Question | Disposition | New Location |
|---|---|---|---|
| Q1 | Storage decision | completed/absorbed (resolved 2026-07-04) | Unified Decisions Log (first row, enriched) |
| Q2 | 25 real people brain-dump | completed/absorbed (resolved) | Unified Dependencies table |
| Q3 | Anthropic API key | completed/absorbed (resolved) | Unified Dependencies table |
| Q4 | Rep discount authority | new-id-Q4 | Unified Open Questions, Q4 |
| Q5 | Alert channel for Phase 9/Mission Control | new-id-Q5 | Unified Open Questions, Q5 |
| Q6 | Data-freshness SLA per table | new-id-Q6 | Unified Open Questions, Q6 |

---

## 5. Base PRD — Decisions Log

| # | Date | Decision (short) | Disposition | New Location |
|---|---|---|---|---|
| 1 | 2026-07-04 | Re-center PRD on The Network | new-row-added | Unified Decisions Log (carried, tagged) |
| 2 | 2026-07-04 | v1 scope not dead, merged as Phases 7–9 | new-row-added | Unified Decisions Log (carried, tagged; text updated to reference Mission Control phase) |
| 3 | 2026-07-04 | Hosting = Vercel | new-row-added | Unified Decisions Log (carried, tagged) |
| 4 | 2026-07-04 | Will gets access | new-row-added | Unified Decisions Log (carried, tagged) |
| 5 | 2026-07-04 | Storage behind adapter; file store day 1; no-stall guarantee | new-row-added | Unified Decisions Log (carried, tagged) |
| 6 | 2026-07-04 | No outside money; door-openers earn a cut | new-row-added | Unified Decisions Log (carried, tagged) — also drove the new Scope OUT bullet |
| 7 | 2026-07-04 | Lost-reason/stage-probability taxonomy deprioritized to Phase 7 | new-row-added | Unified Decisions Log (carried, tagged; text updated to reference Task MC.5) |
| 8 | 2026-07-04 | Est. network value labeled directional | new-row-added | Unified Decisions Log (carried, tagged; text updated to reference Task M1.5) |
| 9 | 2026-07-04 | Estimate writes fail LOUD; no-stall guarantee is code not prose | new-row-added | Unified Decisions Log (carried, tagged) |
| 10 | 2026-07-04 | Storage = Supabase (adapter files/schema named) | merged-into-existing-row | Merged into unified Decisions Log's first row (CRM's own "Supabase as store" row), enriched with the file/schema detail from this base row |
| 11 | 2026-07-04 | Phase One pricing = $10k + $1k/mo | new-row-added | Unified Decisions Log (carried, tagged) |
| — | 2026-07-04 | Rep discount authority still undecided (flag, not a decision) | superseded-by-Q4 | Folded into unified Open Question Q4 rather than duplicated as a decision row |

---

## 6. Base PRD — Dependencies & Blockers

| Item | Disposition | New Location |
|---|---|---|
| Storage decision (Q1) | duplicate (already resolved & tracked in CRM's own Dependencies table) | Not re-added; CRM's existing resolved rows cover it |
| Anthropic API key (Q3) | duplicate (already resolved & tracked in CRM's own Dependencies table) | Not re-added |
| 25-person brain-dump (Q2) | duplicate (already resolved & tracked in CRM's own Dependencies table) | Not re-added |
| Onboarding PRD extraction pipeline | new-row-added | Unified Dependencies table (dependency for Tasks M2.2, MC.6) |
| Invoicing PRD engine | new-row-added | Unified Dependencies table (dependency for Tasks M2.3, MC.7) |
| G1: CRM system of record | new-row-added, marked functionally-resolved | Unified Dependencies table — flagged for Rob's explicit sign-off (see summary finding) |
| G3: Invoicing backing store confirmed | new-row-added | Unified Dependencies table (gate for Task MC.7) |
| Alert channel + freshness SLA (Q5/Q6) | new-row-added | Unified Dependencies table (gate for Tasks MC.9, MC.14) |

---

## 7. Base PRD — Related Files

| File | Disposition | New Location |
|---|---|---|
| WHAT-WE-ARE-DOING.md | duplicate (already in CRM's own Related Files) | Unified Related Files (CRM's original entry, unchanged) |
| docs/STORAGE-DECISION.md | duplicate (already in CRM's own Related Files) | Unified Related Files (CRM's original entry, unchanged) |
| contracts/docs/plans/ (onboarding + invoicing PRDs) | new-entry-added | Unified Related Files |
| ~/.claude/plans/snapshots/mle-rob-dashboard/ (v1.0 snapshot) | new-entry-added | Unified Related Files |

---

## 8. Base PRD — Revision History

The base PRD's own 12-row revision history (v1.0 → v2.1.2, 2026-07-04 through 2026-07-16) is **not
duplicated** into the unified doc's Revision History table — that table tracks changes to the unified
document itself, not a second copy of the base document's history. **Nothing is lost**: the base file is
preserved unmodified (per the "do not modify source files" constraint of this task) and referenced by the
LINEAGE note at the top of the unified PRD; archive copies exist at docs/archive/plans/ (commit 6bc0b64).
Disposition: `kept-as-is` — in its original file, referenced not duplicated.

---

## 9. CRM PRD — Tasks (Phases 1–8)

All 61 tasks below are **kept-as-is**: unchanged, verbatim, in their original phase/task numbering, because
the CRM-evolution PRD is the skeleton of the unified document. Listed here only for completeness, per the
"every task ID from both source PRDs" requirement.

| Phase | Task IDs | Disposition | New Location |
|---|---|---|---|
| 1: De-Risk & Definition | 1.1–1.15 (15 tasks) | kept-as-is | Unified Phase 1, unchanged. Tasks 1.6, 1.7, 1.15 gained cross-reference notes pointing at Mission Control overlaps (content unchanged, notes appended) |
| 2: CRM Core | 2.0–2.7 (8 tasks) | kept-as-is | Unified Phase 2, unchanged. Task 2.6 gained a cross-reference note (content unchanged, note appended) |
| 3: Capture & Automation | 3.1–3.8 (8 tasks) | kept-as-is | Unified Phase 3, unchanged |
| 4: Contact Lifecycle & Access | 4.1–4.7 (7 tasks) | kept-as-is | Unified Phase 4, unchanged |
| 5: Lead Intake & Routing API | 5.1–5.6 (6 tasks) | kept-as-is | Unified Phase 5, unchanged |
| 6: Productization Groundwork | 6.1–6.5 (5 tasks) | kept-as-is | Unified Phase 6, unchanged |
| 7: Rep Cockpit | 7.1–7.8 (8 tasks) | kept-as-is | Unified Phase 7, unchanged |
| 8: In-Call Action Buttons | 8.1–8.4 (4 tasks) | kept-as-is | Unified Phase 8, unchanged |

---

## 10. CRM PRD — Scope, Success Criteria, North-Star Principles, Role Layers

| Item | Disposition | New Location |
|---|---|---|
| Scope IN (8 bullets) | kept-as-is | Unified Scope IN, unchanged, + 1 new bullet appended (see §2 above) |
| Scope OUT (6 bullets) | kept-as-is | Unified Scope OUT, unchanged, + 2 new bullets appended (see §2 above) |
| Success Criteria (8 bullets) | kept-as-is | Unified Success Criteria, unchanged, + 3 new bullets appended (see §3 above) |
| North-Star Principles (5 items) | kept-as-is | Unified doc, unchanged |
| Role Layers table (6 rows) | kept-as-is | Unified doc, unchanged |

---

## 11. CRM PRD — Open Questions

| ID | Question | Disposition | New Location |
|---|---|---|---|
| Q1 | Bounty hunters + bookers mechanics | kept-as-is | Unified Open Questions, Q1 (unchanged) |
| Q2 | Sales Agents' book-of-business visibility | kept-as-is | Unified Open Questions, Q2 (unchanged) |
| Q3 | Auto-close lane | kept-as-is | Unified Open Questions, Q3 (unchanged) |

---

## 12. CRM PRD — Decisions Log

All 20 rows are `kept-as-is` (unchanged), except the first row ("Supabase as store"), which was
**enriched** (not altered in substance) with detail merged in from base PRD decision #10 (see §5 above).
19 of 20 rows are byte-for-byte unchanged; 1 of 20 gained a parenthetical enrichment.

| Row (by date) | Disposition | New Location |
|---|---|---|
| 2026-07-04 Supabase as store | merged-into (enriched) | Unified Decisions Log, row 1 |
| 2026-07-16 (4 rows: CRM basis, scorecard, pipeline-stage canonical, RLS gated-off) | kept-as-is | Unified Decisions Log, unchanged |
| 2026-07-17 (12 rows: research queue, v2.0 vision fold-in, stack decision, keep-base provisional, blockchain ASSUMED, partner-layer ASSUMED, sales-agent-book ASSUMED, PAID apex signal, full rebuild greenlit, critic-rob mandated, auto-enrichment mandated, enrichment stack, dialer build shape, agent imports) | kept-as-is | Unified Decisions Log, unchanged |
| 2026-07-18 (1 row: Task 7.1 decided raw Twilio) | kept-as-is | Unified Decisions Log, unchanged |

---

## 13. CRM PRD — Dependencies & Blockers

All 8 rows `kept-as-is`, unchanged.

| Item | Disposition | New Location |
|---|---|---|
| Rob's differentiator brain-dump (resolved) | kept-as-is | Unified Dependencies, unchanged |
| Base-PRD Task 1.2 Supabase adapter (resolved) | kept-as-is | Unified Dependencies, unchanged |
| Base-PRD Task 1.3 25-person brain-dump (resolved) | kept-as-is | Unified Dependencies, unchanged |
| Anthropic API key (resolved) | kept-as-is | Unified Dependencies, unchanged |
| n8n API key rotation (open) | kept-as-is | Unified Dependencies, unchanged |
| AIDRE call-outcome payload shape (open) | kept-as-is | Unified Dependencies, unchanged |
| Q1–Q3 answers (open) | kept-as-is | Unified Dependencies, unchanged |
| Dialer provider decision (open) | kept-as-is | Unified Dependencies, unchanged |

---

## 14. CRM PRD — Related Files

All 6 entries `kept-as-is`, unchanged (ROB-CRM-VISION-DUMP, base-PRD reference, WHAT-WE-ARE-DOING,
STORAGE-DECISION, scoring-pattern rule, email-identity rule). Note: the base-PRD reference line's *target*
now points at the archive path per the LINEAGE note, but the entry itself is not a new addition — it is the
CRM PRD's own pre-existing reference to the base PRD, updated in place to reflect the merge (this is the one
line in the "kept-as-is" CRM skeleton that was substantively edited by the merge, and is called out
explicitly here for transparency).

---

## 15. CRM PRD — Revision History

All 19 rows `kept-as-is`, unchanged, preserved below the new v3.0 unification row. Disposition:
`kept-as-is`.

---

## Summary — Judgment Calls Needing Rob's Eyes

1. **Base Task 1.6 (nightly backup) merged into Mission Control Task MC.16** (base 9.5, Hardening) rather
   than getting its own M-phase slot, because 9.5's DoD already covers "nightly store/Postgres backup with
   verification" — near-duplicate scope. If Rob wants nightly backup to ship *before* the rest of Hardening
   (i.e., earlier than Mission Control's position in the phase order), it should be split back out.

2. **Base Task 7.7 (GATE G1: CRM system of record) was still open/unchecked in the base PRD**, but this
   merge found it functionally answered by the CRM-evolution PRD's own 2026-07-16 decision ("Dashboard
   becomes basis of self-made CRM"). It was **not** unilaterally checked off — it's flagged in the unified
   Mission Control phase header and the Dependencies table as "functionally resolved, needs Rob's explicit
   confirmation," since no one had formally closed the base gate before this merge.

3. **Five content-overlap points were flagged, not silently merged:**
   - CRM Task 1.6 (canonical pipeline stages) ↔ Mission Control Task MC.5 (base 7.6: stalled-deal
     thresholds/BANT gate/lost-reason enum) — Stalled/Lost stages and stage-aging thresholds are now
     defined in CRM 1.6/1.7; MC.5's threshold-per-stage language may be redundant, but its qualified-lead
     gate and lost-reason enum are not covered anywhere else.
   - CRM Task 1.7 ("who do I touch today") ↔ Mission Control Task MC.3 (base 7.4: "Needs Action Today"
     rule set) — related SLA-rule concepts, different audiences (rep next-steps vs. Rob/ops daily
     priorities panel).
   - CRM Task 2.6 (rep-facing "needs action today" endpoint) ↔ Mission Control Task MC.13 (base 9.2:
     Rob-facing "Needs Action Today" widget) — likely two consumers of related rule sets.
   - CRM Task 1.15 (source-context intake) ↔ Mission Control Task MC.4 (base 7.5: lead-source
     taxonomy/UTM) — probably complementary (per-lead detail vs. channel-level attribution), not
     duplicative, but worth Rob's eyes.
   - Phase M4 Task M4.3 (base 5.3: scheduling hooks, incl. "daily digest" as one of three scheduled runs)
     ↔ Mission Control Task MC.15 (base 9.4: the actual daily-digest content spec) — mechanism vs. content,
     probably fine as-is.

4. **Decisions Log ordering:** the 11 base-PRD decisions (all dated 2026-07-04) were appended after the CRM
   PRD's existing 20 rows (dated 2026-07-04 through 2026-07-18) rather than re-sorted into strict
   chronological order, to satisfy the "keep the CRM skeleton intact" instruction literally (no reordering
   of existing rows). This means the unified table is not strictly date-sorted. Flag if Rob wants it
   re-sorted chronologically instead.

5. **Archive copy + git tag not created.** The unified PRD's LINEAGE banner states (per this task's explicit
   instruction) that the base PRD is "archived at `docs/archive/plans/PRD-mle-rob-dashboard-v2.md`" with a
   "git tag `pre-prd-merge-2026-07-21`" — **neither of these was actually created**, because the task
   explicitly said not to move/delete/modify source files, and creating a new archive copy or git tag was
   not itself excluded but was left undone to avoid taking actions beyond "write only the two new files."
   **RESOLVED (commit 6bc0b64 + eefd7e8):** archive copies exist at `docs/archive/plans/` (tombstoned); exact pre-merge state tagged `pre-prd-merge-exact` (ba4cc68).

---

## Verification Passes

**Pass 1 (initial extraction, during first full read of both source files):** built the complete task/scope/
criteria/question/decision/dependency inventory for both PRDs before drafting anything. Caught the base
Task 7.7/G1 functional-resolution finding and all 5 overlap points on this first pass, by cross-referencing
task text against both Decisions Logs while cataloguing.

**Pass 2 (second full re-read of both source files, checking every task ID against the ledger draft):**
re-read both PRDs top to bottom a second time against the in-progress ledger. Caught: (a) the CRM PRD's
Dependencies table has 8 rows, not 7 as first estimated — corrected; (b) base PRD's "Rep discount authority
still undecided" Decisions Log row is not really a decision and belongs folded into Open Question Q4, not
duplicated as its own Decisions Log row — corrected; (c) confirmed no task text was truncated or paraphrased
in a way that lost a DoD clause when copying into the unified doc's M1–M5/Mission Control phases.

**Pass 3 (targeted pass on Open Questions, Decisions Log rows, and Dependencies table specifically):**
walked every open question and every row of both Decisions Logs and both Dependencies tables one more time,
matching each against the unified doc line-by-line. Caught: (a) base Q1/Q2/Q3 needed explicit
"completed/absorbed" dispositions rather than being silently dropped, since they're resolved but were real
open questions in their source; (b) the Supabase decision-row merge (base #10 into CRM's first row) needed
to be called out explicitly as a merge rather than a silent drop, to keep the "19 of 20 unchanged, 1 of 20
enriched" claim honest; (c) the base PRD's own Related Files entry for the v1.0 snapshot
(`~/.claude/plans/snapshots/mle-rob-dashboard/`) had not yet been added to the unified Related Files list —
added.

**Total: 0 tasks, 0 scope bullets, 0 success criteria, 0 open questions, 0 decisions-log rows, and 0
dependency rows from either source PRD are unaccounted for in this ledger.**
