# Lead-Intake Payload Envelope (PRD Task 1.11)

**Status:** DONE 2026-07-22 · **Canonical source: `lib/leads/intakePayload.ts`** — this doc narrates; the code is the spec (CR-3, Q25/Q27/Q29/Q30 precedent). Tests: `lib/__tests__/intakePayload.test.ts` (11).

## What this is

The body `POST /api/leads` (Task 5.1) accepts from **AIDRE** and **AIVA**. Task 1.11's field list maps 1:1:

| Task 1.11 field | Envelope | Notes |
|---|---|---|
| product | `product` | `"aidre" \| "aiva"` — per-product bearer tokens (5.1) authenticate; envelope names which product claims the lead |
| source | `source_context` | **required** — Task 1.15's typed shapes, validated by composing `parseIntakeSourceContext` (one rule source, specs can't drift) |
| company | `company` | free text; 5.1 matches/creates the org |
| vertical | `vertical` | free text; 5.1 maps to the vertical registry, falls back to the product's home vertical |
| demo dates | `demo.requested_at` / `demo.scheduled_for` | ISO-8601; requested ≠ booked, both optional |
| assigned rep | `assigned_rep` | free text until Phase-4 profiles (same dated deviation as 0005's people columns); omit → Task 1.14 routing decides |
| stage=New Lead | **not a field** | server pins `INTAKE_STAGE = "new_lead"`; a client-supplied `stage` key **rejects the payload** (same anti-smuggling posture as the `/deals` stage-only patch gate) |

Plus `contact` (`name` + at least one of `email`/`phone` — a lead nobody can reach isn't a lead).

## Contracts

- `parseLeadIntake(raw)` reports **every** problem (Tasks 1.9/1.15 parity) — a 400 body doubles as integrator fix-it instructions.
- Unknown extra keys allowed (additive: MC.4 attribution rides along later). Exception: `stage`.
- `INTAKE_WORKED_EXAMPLES` exports one pinned-valid payload per product — integrators import these, never copy doc snippets. Their `source_context` values reuse Task 1.15's own pinned examples.

## DoD

"Payload schema doc handed to Engineering for Task 5.1" — met: 5.1 imports `parseLeadIntake` + `INTAKE_STAGE` and has its whole validation contract prebuilt (1.15 validator already composed inside).

## LIVE ENDPOINT + KEY HANDOFF (Task 5.1 shipped 2026-07-22, Q36)

`POST https://mle-rob-dashboard.vercel.app/api/leads` — LIVE, armed with per-product keys.

- **Keys:** `LEADS_KEY_AIDRE` / `LEADS_KEY_AIVA` — values live ONLY in Vercel prod env (Sensitive) + local `.env.local` (gitignored). **Never commit them.** To hand one to the AIDRE (`digi-rec-roi-dual-demo`) or AIVA (`leaky-bucket-web-agent`) repo: copy the matching key from `.env.local` into THAT repo's own env — a key posts only its own product (cross-product → 401, proven live).
- **Call shape:** `Authorization: Bearer <key>`, JSON body = `LeadIntakePayload` (this doc). Import `INTAKE_WORKED_EXAMPLES` for a known-good payload per product.
- **Responses:** `201` person(create|match) + deal id + activity id · `400` every payload problem listed · `401` missing/wrong/cross-product token · `503` keys unset (inert).
- **Rotation:** replace in Vercel env (`vercel env rm/add LEADS_KEY_X production`) + `.env.local`, redeploy; old key dies with the deploy.
