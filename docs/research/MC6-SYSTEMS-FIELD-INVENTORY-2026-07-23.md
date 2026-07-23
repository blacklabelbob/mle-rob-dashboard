# MC.6 — Systems & Webhook Field Inventory
**Date:** 2026-07-23 · **Author:** Max (CRM build driver, Q56 inc.1+2) · **Status:** COMPLETE — all systems inventoried with source URLs; two leaf-level items deliberately deferred to MC.9 build time (Fathom payload leaf fields, Documenso secret-header name — both behind JS-rendered doc pages, exact URLs pinned below)
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

### 4b. Fathom — ✅ (fetched 2026-07-23)
**One webhook event: "New Meeting Content Ready"** — fires after a meeting ends, for own and/or shared meetings. Payload *sections* are opt-in at webhook-creation time (`include_transcript`, `include_summary`, `include_action_items`, `include_crm_matches` — at least one required), so MC.9's webhook must be created with the sections it wants.

| Item | Value | Source URL |
|---|---|---|
| Event | New Meeting Content Ready (meeting data + opted-in transcript / summary / action items / CRM matches) | https://developers.fathom.ai/webhooks |
| Signature headers | `webhook-id` (unique msg id) · `webhook-timestamp` (epoch secs) · `webhook-signature` (Base64, space-delimited, version-prefixed) | https://developers.fathom.ai/webhooks |
| Verification | HMAC-SHA256 over `id.timestamp.body` with the Base64-decoded secret after the `whsec_` prefix; constant-time compare; ~5-min timestamp tolerance (Svix-standard scheme) | https://developers.fathom.ai/webhooks |
| Payload leaf fields | ⚠️ payload page is JS-rendered (headless fetch returns the OpenAPI shell, `paths: {}`) — exact leaf names to be read in-browser at MC.9 build time | https://developers.fathom.ai/api-reference/webhook-payloads/new-meeting-content-ready |
| Webhook creation API | opt-in flags above set here | https://developers.fathom.ai/api-reference/webhooks/create-a-webhook |

Local head start: Fathom MCP tools (transcript/summary pulls) exist for on-demand reads; the webhook is the push channel MC.9 needs.

### 4c. Documenso — ✅ (fetched 2026-07-23)
**Events cover the full document lifecycle** — created, sent, opened, signed, completed, rejected, cancelled — plus template events (created, updated, deleted, used). Constant naming pattern observed in docs: `DOCUMENT_<STATUS>` (e.g. `DOCUMENT_COMPLETED`) / `TEMPLATE_<ACTION>`.

| Item | Value | Source URL |
|---|---|---|
| Envelope shape | `{ event, payload, createdAt, webhookEndpoint }` | https://docs.documenso.com/developers/webhooks |
| `payload` fields (example shown in docs) | `id` (number — **this is the `documenso_document_id` §2 plans to store**), `title`, `status`, `completedAt` (ISO), `recipients[]` (`{id, email, signingStatus}`) | https://docs.documenso.com/developers/webhooks |
| Verification | Docs name a dedicated "Webhook Verification" section; the exact secret-header name sits behind a JS-rendered subsection (direct paths 404 to headless fetch) — confirm in-browser at MC.9 build; onboarding PRD already commits to HMAC-verified handling | https://docs.documenso.com/developers/webhooks |

Note for MC.9: the docs' example payload does NOT show a signed-PDF URL field — the signed-PDF fetch may need the REST API (`GET /api/documents/{id}` family) after `DOCUMENT_COMPLETED` rather than reading it off the webhook. Verify at build time.

### 4d. Twilio — ✅ (fetched 2026-07-23)
Already consumed by shipped code (`lib/twilio.ts` `recordingToActivity`), now with official sources:

| Callback param | Notes | Source URL |
|---|---|---|
| `AccountSid` | account owning the recording | https://www.twilio.com/docs/voice/api/recording#recordingstatuscallback |
| `CallSid` | call the recording belongs to | same |
| `RecordingSid` | unique recording id | same |
| `RecordingUrl` | audio URL (append `.mp3` — our code does) | same |
| `RecordingStatus` | `in-progress` / `completed` / `absent` | same |
| `RecordingDuration` | seconds; only when status=`completed` | same |
| `RecordingChannels` / `RecordingStartTime` / `RecordingSource` / `RecordingTrack` | channel count · start ts · initiation method · `inbound`/`outbound`/`both` | same |
| `From` / `To` | consumed by our handler (standard voice-request params) | https://www.twilio.com/docs/usage/webhooks/voice-webhooks |
| Auth | `X-Twilio-Signature` (HMAC-SHA1 over URL+params w/ auth token) — already validated in `lib/twilio.ts` | https://www.twilio.com/docs/usage/webhooks/webhooks-security |

### 4e. Retell — ⚠️ OBE, FLAGGED TO ROB (2026-07-23) → provisional **Vapi** row below
Base-PRD 8.1 named Retell, but the stack decision is **Twilio+Vapi HYBRID** (Rob #40, post-dating 8.1). Zero Retell code/creds/plans exist in the repo. **Flag posted to /api/admin/flags (low, "Things to Address")** per findings protocol — Rob confirms strike-or-keep; not silently dropped.

**Vapi (provisional replacement row)** — already partially consumed by shipped code (`app/api/webhooks/vapi/route.ts` handles `assistant-request`, `tool-calls`, logs `end-of-call-report`):

| Item | Value | Source URL |
|---|---|---|
| Server message types (MC.9-relevant) | `assistant-request` · `tool-calls` · `status-update` · `end-of-call-report` · `transcript` · `hang` (full list in docs) | https://docs.vapi.ai/server-url/events |
| `end-of-call-report` fields | `message.type`, `call` (metadata), `endedReason`, `artifact.recording` (URLs), `artifact.transcript`, `artifact.messages[]` (roles+content) | https://docs.vapi.ai/server-url/events |
| CRM binding | end-of-call artifact → activities-ready payload (rides Task 2.1 activities lake, same seam as the Twilio recording webhook) — Q15's DoD | local: `BUILD-QUEUE.md` Q15 |

---
**DoD scorecard (MC.6): ✅ COMPLETE** — consolidated field table per system, each with source URL — §1 ✅ (local source) · §2 ✅ (honest: none exist) · §3 ✅ (local source) · §4a ✅ · §4b ✅ (leaf fields deferred to MC.9 in-browser read, URL pinned) · §4c ✅ (secret-header name deferred likewise) · §4d ✅ · §4e ✅ (Retell OBE flagged to Rob; Vapi row provisional pending his confirm).
