# Cal.com hidden-field / UTM passthrough — VERDICT (Task MC.4 spike)
**Date:** 2026-07-23 · **Author:** Max (CRM build driver, Q55 inc.2) · **Status:** CLOSED — verdict delivered
**Consumers:** MC.4 (this closes it) · MC.9 Cal.com ingestion workflow (build note below) · MC.6 (Cal.com webhook-field row — evidence double-serves) · MC.2 `cost_per_booked_call` / `booking_volume_by_channel`

---

## Verdict: **YES — passthrough works today, but ONLY via hidden booking fields. Auto-UTM-tracking alone is NOT enough for our ingestion.**

Two distinct Cal.com mechanisms exist. They are not the same thing, and picking the wrong one silently loses attribution:

| Mechanism | What it does | Reaches webhook payload? | Verdict for us |
|---|---|---|---|
| **A. Automatic UTM tracking** | Cal.com auto-captures `utm_source, utm_medium, utm_campaign, utm_term, utm_content` from the booking link into an internal Tracking table; host-only visibility on the booking details page | **NO** — Tracking-table data is not sent to webhooks/Zapier; that's an OPEN feature request (Oct 2025) | UI-only convenience. MC.9 cannot read it. |
| **B. Hidden booking fields + URL prefill** | Per event type, add booking questions with identifiers `utm_source` … `utm_content` (+ `campaign_ref`), mark them **Hidden** / Short Text; booking-link query params auto-fill them; answers land in the booking record | **YES** — `BOOKING_CREATED` payload carries a top-level `responses` object: `{ "<identifier>": { "label", "value", "isHidden" } }` | **The route MC.9 builds on.** |

### Evidence (all fetched 2026-07-23)
1. **Auto-tracking + the hidden-field workaround are official Cal.com guidance:** https://cal.com/help/bookings/utm-tracking — auto-captures exactly our five `UTM_CONVENTION` params; "Only the hosts of the booking will be able to view the UTM parameters"; documents the 3-step hidden-question setup (identifier = param name, set Hidden + Short Text, pass params in the booking link) for anything beyond the auto five.
2. **URL prefill of booking-question fields is supported by identifier:** https://cal.com/docs/core-features/bookings/prefill-fields — `?email=…&<identifier>=<value>` fills any booking question, which is what makes mechanism B zero-friction (marketing links just carry normal `utm_*` query params).
3. **Webhook payload carries the answers:** https://cal.com/docs/developing/guides/automation/webhooks — `BOOKING_CREATED` includes top-level `responses` with per-question `{label, value, isHidden}`. Hidden UTM questions arrive here.
4. **Auto-tracked UTMs do NOT reach integrations (the trap):** https://github.com/calcom/cal.com/issues/24759 — open feature request (2025-10-29, Medium priority): Tracking-table UTMs are not sent to Zapier/webhooks; the acknowledged workaround is exactly mechanism B.
5. **Do NOT use `metadata[...]` query params as the carrier:** https://github.com/calcom/cal.com/issues/16140 — reported regression where URL `metadata` failed to propagate to the webhook handler. `responses` is the reliable channel; `metadata` in payloads is Cal.com-internal (e.g. `videoCallUrl`).

### The prescribed setup (MC.9 build note — becomes part of its DoD)
1. On each MLE booking event type: add **six hidden Short-Text booking questions** with identifiers exactly matching `lib/leads/sourceTaxonomy.ts` `UTM_CONVENTION`: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, plus `campaign_ref` (joins Task 1.15's per-lead detail to channel attribution — the `lm-` prefix convention).
2. Marketing links carry plain `utm_*` query params (no special syntax) — Cal.com fills the hidden fields on page load. Same params also feed mechanism A for free (host-side UI view; harmless duplicate).
3. MC.9's n8n Cal.com workflow reads `payload.responses.<identifier>.value` from `BOOKING_CREATED` → feeds `classifyUtm`/`classifyLeadSource` (already shipped, Q55 inc.1) at ingestion time → `deals.source` + `source_context`. **It must NOT expect UTMs anywhere else in the payload** (per evidence #4/#5).
4. Absent/empty responses → classifier already answers honestly (`direct_unknown` ladder) — no fake attribution.

### Residual risks (accepted, on the record)
- Hidden-field identifiers are per-event-type config in Cal.com's UI — config drift is possible. Mitigation: MC.9's DoD test event asserts the six `responses` keys arrive; a missing key fails the ingestion check loudly (no silent `direct_unknown` flood).
- Issue #16140-class regressions argue for exactly that test-event gate rather than trusting docs.
- If Cal.com ships #24759 (Tracking table → webhooks), mechanism A becomes a redundant second source — hidden fields keep working; no migration forced.
