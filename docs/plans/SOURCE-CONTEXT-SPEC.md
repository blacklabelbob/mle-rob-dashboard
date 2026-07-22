# Source-Context Intake Spec (PRD Task 1.15)
**Date:** 2026-07-22 · **Canonical source: `lib/leads/sourceContext.ts` (code, per CR-3). This doc narrates; if they disagree, the code wins.**

## What this is

The per-lead detail that makes the CRM's source tracking a differentiator: when a rep opens a lead, they see *what the prospect actually said/answered/responded to* — not a bare `source: "form"`. Rides `activities.source_context` (0005 JSONB seam, zero new schema) and Task 5.1's `POST /api/leads` payload. Discriminant: `source_type`.

## The four intake source types

| `source_type` | Required fields | Optional | One-liner rendering |
|---|---|---|---|
| `email_reply` | `replied_to_subject`, `reply_text` | `campaign_ref`, `reply_from` | `Replied to "<subject>"` |
| `web_form` | `form_name`, `answers[]` (each `{question, answer}`, both non-empty) | `page_url` | `Submitted <form> (N answers)` |
| `ad_reel` | `topic`, `creative_ref` | `platform` | `Responded to <platform> creative: <topic>` |
| `trade_show` | `event_name`, `notes` | `booth` | `Met at <event>` |

- `parseIntakeSourceContext(raw)` validates — returns **every** problem (400 body doubles as fix-it instructions, same contract as Task 1.9's validator).
- **Extra keys are allowed by design** — MC.4's attribution taxonomy and Task 1.11's per-product detail ride alongside additively.
- `describeIntakeSource(ctx)` is the rep-surface one-liner (structured replacement for the `SOURCE:` description-string convention in `lib/repSource.ts`).
- Worked examples for all 4 types are **exported as `WORKED_EXAMPLES`** and test-pinned valid — import them, don't copy doc snippets.

## What this does NOT govern

Shapes already live on the same seam keep their own narrower validators at their own ingestion points (deliberate — one giant validator would couple every capture path):

| Shape | Owner | Purpose |
|---|---|---|
| n8n Gmail capture | `lib/n8nEmail.ts` | ongoing correspondence (Rob's inbox) |
| AIDRE call webhook | `lib/aidreCall.ts` | call outcomes |
| `promised_intro` | `lib/referrals/chaseQueue.ts` | referral promises (Task 1.8) |
| Manual-log fields | `lib/activities/requiredFields.ts` | Task 1.9 mandatory fields |
| `{from, to}` stage audit | `lib/crm.ts` | Task 4.7 server-written audit rows |

`email_reply` ≠ the n8n capture shape: capture logs mail as it flows; `email_reply` describes the reply that *birthed a lead* (campaign context for first touch). Both can coexist on one timeline.

## Consumers

- **Task 5.1 `POST /api/leads`** — validates inbound `source_context` with `parseIntakeSourceContext` (primary consumer, not yet built).
- **Task 1.11** (AIDRE/AIVA payload schema) — composes these shapes + product envelope.
- **Rep surfaces** (`/rep/accounts`, person pages) — `describeIntakeSource` for "how did they get here".
- **MC.4** — channel-level attribution rides alongside as extra keys; no conflict.
