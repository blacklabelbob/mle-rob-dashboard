# AIDRE → CRM Call-Outcome Webhook — Payload Spec
**Version:** 1.0 · **Date:** 2026-07-22 · **Status:** DELIVERED (PRD Task 3.3 DoD) — hand this doc to the AIDRE repo (`digi-rec-roi-dual-demo`) when its outbound webhook is built.

## Endpoint

```
POST https://mle-rob-dashboard.vercel.app/api/webhooks/aidre-call
Content-Type: application/json
x-aidre-secret: <shared secret>
```

- **Auth:** shared secret in the `x-aidre-secret` header (constant-time checked). Secret lives in the dashboard's `AIDRE_WEBHOOK_SECRET` env var — **unset → endpoint returns 503 and is fully inert** (same env-gate pattern as the n8n/Vapi webhooks).
- **Send on:** every *finished* call (answered, missed, voicemail, booked, transferred). One POST per call.
- **Retries are safe:** the activity id is derived from `callId` (`aidre-call-<callId>`), so re-delivery upserts the same row — never a duplicate.

## Payload

| Field | Type | Required | Notes |
|---|---|---|---|
| `callId` | string | ✅ | AIDRE's unique id for the call. Drives idempotency. |
| `callerNumber` | string | ✅ | Any format — matched to CRM contacts on the last 10 digits (`+1 (239) 555-0142` ≡ `2395550142`). |
| `callerName` | string | — | Name as reported/collected by the AI; stored as evidence, **never** used for matching. |
| `direction` | `"inbound" \| "outbound"` | — | Defaults to `inbound`. |
| `outcome` | string | — | One of `answered · missed · voicemail · booked · transferred` preferred; unknown values pass through verbatim. Defaults to `completed`. |
| `durationSeconds` | number | — | Call length. |
| `summary` | string | — | AI-written call summary → becomes the timeline entry text. Missing → honest fallback ("AIDRE inbound call — missed"). |
| `recordingUrl` | string | — | Stored on the activity's `recording_url`. |
| `transcriptUrl` | string | — | Stored on the activity's `transcript_url` (becomes a transcripts FK at Task 7.4). |
| `startedAt` | string (ISO 8601) | — | Call start time. Missing/unparseable → receive time. |

### Example

```json
{
  "callId": "aidre-8f31c2",
  "callerNumber": "+1 (239) 555-0142",
  "callerName": "Jonathan",
  "direction": "inbound",
  "outcome": "booked",
  "durationSeconds": 95,
  "summary": "Caller asked about roof inspection pricing; AI booked a demo for Thursday 10am.",
  "recordingUrl": "https://storage.aidre.example/rec/8f31c2.mp3",
  "transcriptUrl": "https://storage.aidre.example/tx/8f31c2.txt",
  "startedAt": "2026-07-22T14:30:00Z"
}
```

## Responses

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ok, ingested: true, activityId}` | Row written to the matched contact's timeline (`type=call`, `source=aidre`). |
| 200 | `{ok, ingested: false, reason: "no caller match"}` | Number matched no CRM contact. **Do not retry** — the CRM never writes anchorless rows (DB constraint requires ≥1 anchor); unmatched-call handling is a future intake decision (pairs with Task 5.1 lead intake). |
| 400 | `{error}` | Malformed JSON or missing `callId`/`callerNumber`. Fix the payload; don't retry as-is. |
| 403 | `{error: "bad secret"}` | Wrong/missing `x-aidre-secret`. |
| 503 | `{error}` | Capture not armed (`AIDRE_WEBHOOK_SECRET` unset on the dashboard). |

## What lands in the CRM

One `activities` row: `id=aidre-call-<callId>`, `type=call`, `source=aidre`, anchored to the phone-matched person (or org, if the number belongs to a company record — never both), `source_context` = `{channel, direction, outcome, aidreCallId, callerNumber (normalized), callerNameReported, durationSeconds}` per the Task 1.15 source-context spec. Renders on the contact's ActivityTimeline (admin `/people/[id]` and rep views).

Implementation: `lib/aidreCall.ts` (pure, unit-tested) + `app/api/webhooks/aidre-call/route.ts` · Tests: `lib/__tests__/aidreCall.test.ts` (incl. synthetic-POST DoD proof).
