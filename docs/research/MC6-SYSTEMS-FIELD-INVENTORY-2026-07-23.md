# MC.6 — Systems & Webhook Field Inventory
**Date:** 2026-07-23 · **Author:** Max (CRM build driver, Q56 inc.1) · **Status:** IN PROGRESS — internal legs + Cal.com row done; Fathom/Documenso/Twilio/Retell webhook rows pending (inc.2, each needs fetched doc-URL evidence)
**Task:** PRD Task MC.6 *(was base 8.1)* — inventory onboarding-PRD data (`clients/<slug>.json` schema, Documenso IDs + signed-PDF URLs, CRM adapter fields) + Cal.com/Fathom/Documenso/Twilio/Retell webhook payload fields with doc URLs.
**Consumers:** MC.9 ingestion workflows (field bindings) · MC.8 read-model contract (source columns) · MC.12 ops panels · Q40 phase tracker (agreement/invoice fields)

---

## §1 — `clients/<slug>.json` schema (onboarding repo)

**Source (local, authoritative):** `~/Projects/MyLocalEverything/contracts/clients/gulf_coast.json` — the ONLY instance today (n=1; schema is inferred from it + the generator it feeds, not from a written spec — no JSON Schema file exists in that repo).

| Field path | Type | Example (Gulf Coast) | Notes for CRM ingestion |
|---|---|---|---|
| `output_filename` | string (repo-relative path) | `agreements/Phase 1 Agreement - … (complete).pdf` | Generated agreement PDF location |
| `fee` | string, `$`-formatted | `"$19,000"` | ⚠️ NOT numeric — parse before any KPI math |
| `client.legal_name` / `short_name` / `descriptor` / `address` | string | `Gulf Coast RE Group` … | Maps to CRM org record |
| `entities[]` | array | 1 entry | Per-entity scope: `name`, `website_pages` |
| `entities[].agents` | object | `count: 60`, `website_pages: 60`, `second_brain: true` | Delivery-scope counts (Q40 phase components) |
| `entities[].agents.social_media` | object | `count: 45` + free-text `note` | |
| `additional_scope[]` | array of `{title, description}` | Security & Reporting, 1 yr | Free-text scope riders |
| `agreement_status` | object | see below | **The e-sign state MC.9's Documenso leg must reconcile with** |
| `agreement_status.version` | number | `2` | |
| `agreement_status.generated_date` / `sent_date` / `signed_date` / `effective_date` | string ISO date (empty = not happened) | `signed_date: ""` yet `status: "effective — paid in full"` | ⚠️ empty-string-as-null convention; status free text can outrun the dates |
| `agreement_status.sent_via` | free text | `"DocuSign (Rob)"` | ⚠️ real send happened via **DocuSign**, not Documenso — see §2 |
| `agreement_status.status` | free text | `"effective — paid in full 2026-07-16 (checks)"` | Not an enum; CRM side must map, never trust as machine state |
| `intake` | object | `confirmed_by`, `date`, `entities_count`, `second_brains_total`, `other_adjustments` (long free text) | Human-confirmed final terms; `other_adjustments` is the audit trail of term changes |
| `invoice` | object | `number: MLE-2026-100123`, `issue_date`, `due_terms`, `bill_to.attn`, `agreement_title` | Joins to the G3 verdict's invoice store (MC.7) |
| `invoice.invoice_output` | string path | `invoices/paid/… (PAID).pdf` | ⚠️ paid-state is encoded in the PATH (`invoices/paid/`) as well as the object |
| `invoice.payment_received` | object | `date`, `date_display`, `method: "check"` | Money truth — read-only for the CRM (hard limit) |

**Honest gaps:** no `documenso_document_id`, no signed-PDF URL, no CRM ids, no phase field in the live instance. Those are *planned* fields (§2/§3), not present data.

## §2 — Documenso IDs + signed-PDF URLs

**Status: PLANNED, NOT DEPLOYED — zero Documenso IDs exist anywhere today.**
- Onboarding PRD (`contracts/docs/plans/PRD-phase1-client-onboarding-automation-v1.md`) Phase 4: store `documenso_document_id` on generate-and-send; `/webhook/documenso-completed` (HMAC-verified) stores the signed-PDF URL and advances CRM stage. All unchecked (⬜ "not started" as of that PRD).
- The one real agreement (Gulf Coast) was sent via **DocuSign (Rob)** and closed on paper/checks — `agreement_status.sent_via` in §1. So MC.9's Documenso leg has **no historical backfill to do**; it starts clean when Documenso goes live.
- Planned field homes: `documenso_document_id` (per client), signed-PDF URL (webhook write-back), both onto the client record / CRM deal.

## §3 — CRM adapter fields (onboarding PRD Phase 5)

**Source:** onboarding PRD Phase 5 (blocked on its Open Q1: Bitrix24 vs self-hosted Twenty — Rob decision, still open there; NOTE our CRM has since been built in-house, so this adapter list now reads as the **field contract the onboarding repo expects to push INTO us** when its Phase 5 builds):

| Adapter field | Where it lands in OUR CRM today |
|---|---|
| entities | org record (`business`) — exists |
| contact | person record — exists |
| AI number | ☐ no field yet (Vapi/Twilio number; Q15/Q5b land it) |
| Retell agent ID | ☐ no field yet — and stack decision moved to **Vapi** (Q12/Rob #40 HYBRID); Retell rows in MC.6 kept only because base-PRD names them — flag to Rob if Retell is truly dead (see inc.2) |
| Documenso envelope id | ☐ no field yet (§2) |
| signed date | `signed` on person/deal — exists (hard-limit field) |
| 30-day expiry | Q40 refund-window state machine (queued) |
| Terms Reviewed bool | ☐ no field yet |
| stage | deal `stage` ladder — exists (Task 1.6 canonical list pending Rob approval) |

Adapter surface: `crm/adapter.py` ABC — `create_contact / create_deal / update_deal_stage / attach_note`. Our `POST /api/leads` (Task 5.1, live) already covers create_contact/create_deal semantics with bearer keys; a `LEADS_KEY_ONBOARDING` product key is the natural integration point instead of a Python adapter targeting a third-party CRM.

## §4 — Webhook payload field tables (one row-set per system)

### 4a. Cal.com — ✅ DONE (evidence via MC.4 spike)
Full field table + evidence URLs: `docs/research/CALCOM-UTM-PASSTHROUGH-VERDICT-2026-07-23.md`. Summary: `BOOKING_CREATED` carries top-level `responses` object (`{<identifier>: {label, value, isHidden}}`) — the SIX hidden-field identifiers (`utm_source/medium/campaign/term/content` + `campaign_ref`) arrive there and ONLY there (Tracking table not in payloads — open calcom#24759; `metadata[...]` carrier rejected — calcom#16140). Docs: https://cal.com/docs/developing/guides/automation/webhooks · https://cal.com/help/bookings/utm-tracking · https://cal.com/docs/core-features/bookings/prefill-fields

### 4b. Fathom — ⏳ PENDING (inc.2)
Needs: recording-ready webhook payload fields with doc URLs. Local head start: Fathom MCP tools exist (transcript/summary pulls) but MC.9 needs the *webhook* shape.

### 4c. Documenso — ⏳ PENDING (inc.2)
Needs: `document.sent/viewed/signed/declined` (naming TBC against docs) payload fields + HMAC header, with doc URLs.

### 4d. Twilio — ⏳ PENDING (inc.2)
Local head start (already consumed by shipped code, `lib/twilio.ts` `recordingToActivity`): `CallSid`, `RecordingSid`, `RecordingUrl` (+`.mp3`), `RecordingDuration`, `From`, `To` — validated via `X-Twilio-Signature` (HMAC-SHA1). inc.2 adds the official doc URLs so every field carries a source per Rob's rule.

### 4e. Retell — ⏳ PENDING (inc.2) — ⚠️ likely OBE
Stack decision is Twilio+Vapi HYBRID (Rob #40). Vapi's `end-of-call-report` is already handled in `lib/vapi.ts`/`POST /api/webhooks/vapi`. inc.2 should confirm with Rob (flag, not silent drop) whether the Retell row is replaced by a **Vapi** row — base-PRD 8.1 predates the dialer decision.

---
**DoD scorecard (MC.6):** consolidated field table per system, each with source URL — §1 ✅ (local source) · §2 ✅ (honest: none exist) · §3 ✅ (local source) · §4a ✅ · §4b–e ⏳ inc.2.
