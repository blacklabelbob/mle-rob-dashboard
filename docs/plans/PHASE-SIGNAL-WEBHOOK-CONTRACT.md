# Phase Component Signal — Webhook Contract v1
**Date:** 2026-07-22 · **Status:** **LIVE ON PROD as of 2026-07-28 (Q40 inc.13)** — endpoint armed at `https://mle-rob-dashboard.vercel.app/api/webhooks/phase-signal`, `PHASE_SIGNAL_WEBHOOK_SECRET` set, store table `phase_component_state` (0025) applied. Still v1 and still open to the partner's edits; what changed is that it now answers instead of 503ing. **Nothing has been signalled yet — the table holds zero rows, and no signal will be manufactured on this side.** · **Consumed by:** MASTER-VIEW-2.0-DESIGN.md §3.1 + BUILD-QUEUE Q40 increment 9
**Pattern parent:** `app/api/webhooks/n8n-email/route.ts` (secret header, 503-inert when unconfigured, 200-on-reject so senders never retry-loop)

## Purpose

Rob (dump 7.22.26-3): *"in order for those elements of each Phase to toggle over to live, a signal has to be sent from my partners tools that are doing all of this. So, the plan would be to have that signal be sent to us."* This is that signal. One POST per component state change; our side flips the Blueprint light.

## Endpoint

```
POST /api/webhooks/phase-signal
Content-Type: application/json
X-Phase-Signal-Secret: <shared secret>       ← same header-secret discipline as x-n8n-secret
```

- `PHASE_SIGNAL_WEBHOOK_SECRET` unset → **503** (endpoint inert, safe to deploy ahead of the partner).
- Wrong/missing secret → **403**.
- Malformed JSON / missing required fields → **400** with the field name.
- Valid but unmatchable (unknown customer/component) → **200** `{ ok: true, applied: false, reason }` — logged, never a retry loop.
- Applied → **200** `{ ok: true, applied: true, componentState }`.

## Payload v1

```jsonc
{
  "version": 1,                              // contract version — bump on breaking change
  "eventId": "evt_8f3a…",                    // REQUIRED. Sender-generated idempotency key.
                                             // Replays of the same eventId are acked 200 but not re-applied.
  "customerId": "miga-food-manufacturing",   // REQUIRED. Our company/org id (shared mapping table
                                             // with the partner; slug format, see OPEN below)
  "phase": 1,                                // REQUIRED. 1 | 2 | 3
  "componentId": "website-aeo-seo",          // REQUIRED. Canonical component slug (list = OQ-1,
                                             // Rob/Will to confirm; unknown slugs → applied:false)
  "status": "live",                          // REQUIRED. "live" | "in_progress" | "reverted"
  "occurredAt": "2026-07-22T18:04:11Z",      // REQUIRED. ISO-8601 UTC — when it actually happened
                                             // (drives the P1 refund clock when componentId is
                                             // website-aeo-seo: refund window starts at this timestamp)
  "source": "mle-partner-tools",             // optional. Sender identifier for the audit line
  "detail": { }                              // optional. Freeform context — stored verbatim in the
                                             // audit log, NEVER rendered into Notes (Q43 discipline)
}
```

## Semantics

1. **Idempotency:** `eventId` is unique per state change. First write wins; replays no-op with `applied: false, reason: "duplicate"`. (Same tag-as-idempotency stance as the recycle cron.)
2. **`status: "live"`** sets `phase_components.live_at = occurredAt`. ALL components of a phase live → phase auto-completes (Rob: "When they are ALL lit, Phase 1 is complete").
3. **`status: "reverted"`** clears `live_at` and flags the company in Things to Address (a light going dark is a Rob-attention event, never silent).
4. **Refund clock:** the `website-aeo-seo` component's first `live` signal starts the Phase-1 30-day refund window (`ACTIVE`) — feeds `lib/phases/refund.ts` FSM. Timestamps come from `occurredAt`, not receipt time.
5. **Ordering:** out-of-order delivery is tolerated — state transitions compare `occurredAt` and ignore stale events.
6. **Versioning:** unknown `version` → 400. v1 fields are only ever added, never repurposed; breaking changes bump to v2 on a parallel path.

## Interim (until the partner wires this)

Manual component toggles in the Master View only (never rep view) write the same `phase_components` rows with `source: "manual-rob"` — pending Rob's OK (design doc OQ-4). The webhook and manual path share one write function so behavior can't diverge.

## OPEN (for Will / partner)

- Customer id mapping: do partner tools know our org slugs, or do we exchange a mapping table / accept their id + keep a lookup?
- Component slug list: canonical Phase 1 (then 2/3) component names — same list that renders the Blueprint lights (design doc OQ-1).
- Delivery: direct POST from partner tools, or relayed through n8n like email capture? Either satisfies this contract.
