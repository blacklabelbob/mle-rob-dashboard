# The MLE Inbound Contract — how a partner-hosted automation connects
**Date:** 2026-07-29 · **Status:** v1, live for all seven inbound doors · **Owner:** MLE ROB Dashboard · **Queue item:** Q75 inc.2
**Audience:** whoever runs the automation on the other side — an n8n cloud instance, a partner's own VPS, AIDRE, Twilio, Vapi. **You should not need to read our repository to finish this page.**
**Enforced by:** `lib/partnerHooks.ts` + `lib/__tests__/partnerHooks.test.ts`. Every section below is checked against the code on disk: a hook whose section is missing, or whose section does not name the header and secret env the route actually reads, fails our test suite by name. That is why this file can be trusted rather than dated.

## The decision this file records (Q75)

Rob asked it as a versus: **(A)** automation housed with the tools, inside this repo, or **(B)** partners keep it on their own local or virtual hub and we connect to it like a third-party API.

**Decision: (B) is the default for anything a partner already runs, and (A) is reserved for automation that touches money, signed documents, or personal data.** The reason is not preference — it is that (B) is already the shape of every automation running today (seven inbound webhooks, seven partner-side secrets), so choosing (A) would mean *migrating working systems* to gain nothing a partner asked for. What was actually broken is what this page fixes: the connection recipe was re-invented per partner, so "connect a new automation" meant reading our source code.

The line between them is drawn on **who suffers when the hub is down**. A partner hub that stops sending phase signals costs a stale light on a Blueprint. A partner hub that owned invoice generation, e-signature, or contact-record writes could cost a wrong number on a customer's invoice — so those stay in-repo (`contracts` engines, e-sign flow, dedup), where they are tested and versioned with the data they touch.

**Rob's own acceptance test** was *"the way that is easiest and most foolproof"*, and foolproof-ness is graded here on two questions only, both answered identically at every door: **what happens when your hub is down**, and **what happens when a key rotates**. See below.

## The universal rules (identical at all seven doors)

```
POST https://mle-rob-dashboard.vercel.app/api/webhooks/<door>
<secret header>: <the shared secret we gave you>
Content-Type: application/json          # except twilio-recording, which is form-encoded
```

| Situation | You get | What it means for you |
|---|---|---|
| We have not configured your secret yet | **503** | The door is **inert, never open**. Safe for us to deploy ahead of you; safe for you to point at it early. Retry later — nothing was lost or half-accepted. |
| Your secret is missing or wrong (e.g. rotated on one side only) | **403** | Loud rejection. **Nothing is ever half-accepted on a bad key.** Fix the secret and re-send. |
| Body is not the expected format, or a required field is absent | **400** + the field name | Your payload is wrong. Retrying unchanged will fail forever. |
| Accepted but not actionable (unknown customer, unmatched phone number, immaterial item) | **200** `{ ok: true, …:false, reason }` | **Deliberate: not an error.** No retry will make it actionable, so we refuse to make your queue loop. The `reason` is the explanation. |
| Accepted and applied | **200** `{ ok: true, …:true, … }` | Done. |
| Our storage failed mid-write | **500** | The one case a retry fixes. Please retry. |

Three more rules that hold everywhere:

1. **Send an idempotency key when the door offers one** (`eventId`, `messageId`, a headline, a `RecordingSid`). We de-duplicate on it, so a replay is safe and a network timeout is not a reason to fear a double.
2. **Secrets travel in a header, never in the URL or body.** URLs land in logs; headers do not.
3. **We never call you back.** Every integration is one-way inbound, so you need no inbound firewall rule, no public URL, and no callback endpoint. A hub behind NAT works fine.

To rotate a secret without downtime: tell us the new value, we set it, then you switch. In between, the old secret is still accepted; after, the old one gets a 403.

---

## aidre-call

**Header:** `x-aidre-secret` · **Secret env (our side):** `AIDRE_WEBHOOK_SECRET` · **Body:** JSON
**Caller:** AIDRE receptionist (partner-hosted voice product). **Deeper spec:** `docs/plans/AIDRE-CALL-PAYLOAD-SPEC.md` — read that for the full field list; this section is the connection half.
One POST per completed call. Unknown caller numbers answer `200 { ok: true, ... }` with a reason rather than an error — an unrecognised number is a normal outcome for a receptionist.

## n8n-email

**Header:** `x-n8n-secret` · **Secret env (our side):** `N8N_EMAIL_WEBHOOK_SECRET` · **Body:** JSON
**Caller:** n8n cloud — Gmail sweep. One POST per captured message.

```jsonc
{
  "messageId": "18f2c…",        // REQUIRED. Gmail message id — the idempotency key.
  "threadId":  "18f2b…",        // optional
  "from":      "Dana Reyes <dana@roofco.com>",   // REQUIRED. Display-name form is fine.
  "to":        "rob@aivoicetech.io",             // optional. String, comma-joined, or array.
  "cc":        [],                                // optional. Same three shapes.
  "subject":   "Re: roof scope",                  // optional
  "snippet":   "first ~200 chars",                // optional
  "date":      "2026-07-29T14:02:00Z",            // optional, ISO-8601
  "mailbox":   "rob@aivoicetech.io"               // REQUIRED once more than one mailbox is connected.
}                                                 // An UNREGISTERED mailbox is refused (200, reason) —
                                                  // never filed as somebody else's.
```

Missing `messageId` or `from` → **400**. Mail addressed to a different identity is refused with `200 { ok: true, ingested: false, reason }` and logged — by design, per Rob's email-identity rule; do not treat it as a failure.

## n8n-error

**Header:** `x-n8n-secret` · **Secret env (our side):** `N8N_EMAIL_WEBHOOK_SECRET` · **Body:** JSON
**Caller:** n8n cloud — workflow failure notifier. Wire your n8n **Error Trigger** workflow straight at this door and every capture failure reaches Rob's ledger in seconds. Send n8n's native error payload unmodified:

```jsonc
{
  "workflow":  { "id": "…", "name": "Gmail Capture" },   // REQUIRED: workflow.name. Without it → 200, ignored.
  "execution": { "id": "…", "url": "…", "lastNodeExecuted": "Gmail", "error": { "message": "…" } },
  "trigger":   { "error": { "message": "…" } }            // polling-trigger failures send this INSTEAD of `execution`
}
```

One flag per workflow **per day** — a once-a-minute failure storm raises exactly one. Repeats answer `200 { flagged: false, reason: "already flagged" }`.

## phase-signal

**Header:** `x-phase-signal-secret` · **Secret env (our side):** `PHASE_SIGNAL_WEBHOOK_SECRET` · **Body:** JSON
**Caller:** partner tools reporting a Blueprint component LIVE. **Deeper spec:** `docs/plans/PHASE-SIGNAL-WEBHOOK-CONTRACT.md` — full payload v1, component slugs, and the refund-clock rule live there.
Requires `eventId` as its idempotency key; replays are acked but not re-applied. Unknown customer or component → `200 { applied: false, reason }`, never a retry loop.

## twilio-recording

**Header:** `x-twilio-signature` · **Secret env (our side):** `TWILIO_AUTH_TOKEN` · **Body:** **form-encoded** (`application/x-www-form-urlencoded`)
**Caller:** Twilio (recording-complete callback). This is the one door you do not hand-build: set it as the recording callback URL on the Twilio number and Twilio signs each POST itself. Fields consumed: `CallSid`, `RecordingSid` (the idempotency key), `RecordingUrl`, `RecordingDuration`, `From`, `To`, `RecordingStartTime` (or `Timestamp`).

Because Twilio retries any non-2xx, the status codes are chosen around it: an unresolvable call (unknown number, both parties internal, no recording sid) answers **200** `{ persisted: false }` since no retry could fix it, while a storage failure answers **500** so the retry is spent on the one case it can fix. Transcription happens after we answer — a slow transcriber can never time out a filing that already succeeded.

## vapi

**Header:** `x-vapi-secret` · **Secret env (our side):** `VAPI_WEBHOOK_SECRET` · **Body:** JSON
**Caller:** Vapi (call lifecycle events). Set this as the assistant's **server URL**; Vapi wraps everything in `{ "message": { "type": … } }`. Three types matter:

| `message.type` | We answer with |
|---|---|
| `assistant-request` (pre-answer) | the receptionist assistant to use, already carrying the caller's CRM context |
| `tool-calls` (mid-call, `crm_caller_lookup`) | the caller→CRM lookup result |
| anything else (`status-update`, `end-of-call-report`, transcripts) | `200 { ok: true }`; end-of-call reports are logged in full |

## voice-law

**Header:** `x-n8n-secret` · **Secret env (our side):** `N8N_EMAIL_WEBHOOK_SECRET` · **Body:** JSON
**Caller:** n8n cloud — voice-law monitor. Accepts all three n8n shapes: a bare array, `{ "items": [ … ] }`, or one item per call.

```jsonc
{ "title": "FCC adopts final rule on AI-generated voice calls",   // REQUIRED — also the idempotency key
  "link": "https://…", "published": "2026-07-28", "source": "FCC",
  "matched_keyword": "AI voice", "snippet": "…" }
```

**Send everything your filter caught; we narrow, not you.** Only an actual change in the legal status of AI voice calling reaches the ledger (enacted / effective / final rule / court ruling / ban). Commentary and explainers are dropped silently with `200 { flagged: 0, ignored: n }` — that is the normal quiet week, not a fault.

---

## Adding an eighth door

Ask us for one. On our side it is: a row in `PARTNER_HOOKS`, a section on this page, and a route that answers 503 unconfigured / 403 on a bad secret. The test suite refuses a door that skips any of the three — including one added to the codebase without ever being written down here.

**Still open (inc.3):** drive a brand-new automation through this page end to end with the page as the *only* input, and count how many times the integrator has to ask a question. Also open as pinned debt: **five distinct secret headers** an integrator must learn across seven doors (`lib/__tests__/partnerHooks.test.ts` pins the number so it can shrink deliberately and never grow by accident).
