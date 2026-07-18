# Dialer SaaS Scorecard — Task 7.1 / BUILD-QUEUE Q5
**Date:** 2026-07-18 · **Author:** Max (head-of-research) · **Method:** weighted composite per `~/.claude/rules/scoring-pattern.md`
**Context:** PRD Phase 7 (Rep Cockpit) needs click-to-dial embedded in the Next.js 16 CRM, with call recordings flowing to our webhook for the transcript→RAG pipeline (Task 7.3–7.5). The OSS scout (2026-07-17, Decisions Log) already ruled out forking an OSS dialer and established that if raw Twilio wins, the build shape is **official `twilio-voice.js` SDK + ~200 lines of our own Next.js token/webhook routes** — that engineering estimate is taken as given here, not re-derived.
**Candidates:** JustCall · Aircall · OpenPhone (rebranded **Quo**, 2025-09-23) · raw Twilio (Programmable Voice + Voice JS SDK)
**Research method:** 4 parallel research agents (one per vendor), each working primary vendor sources (pricing pages, developer docs, help center) first, secondary sources only to corroborate JS-rendered pricing pages. Every cell below is either a cited fact (source + access date) or explicitly marked `[UNVERIFIED]`. All access dates 2026-07-18.

---

## 1. Weight table

| Signal | Weight | Rationale |
|---|---|---|
| Recording API access + webhook events (recording-ready, call-completed) | **0.30** | This is the literal PRD Phase 7 blocker — Task 7.3 (transcript pipeline) and 7.5 (RAG) cannot start without a reliable recording URL + a webhook that fires when it's ready. Highest weight because a failure here blocks two downstream tasks, not one. |
| CRM-embed friendliness (web SDK vs. app-only) | **0.25** | The literal ask is "click-to-dial **embedded** in a Next.js CRM." A vendor with no embeddable web SDK doesn't meet the requirement at all regardless of how good its API is — near-disqualifying, so it carries the second-highest weight. |
| Cost at 5 seats/mo | **0.20** | Rob's team is small; 5 seats is the realistic near-term size. Kept below the two functional gates per "rent-first" — cost matters, but a cheap tool that can't embed or can't webhook isn't a real option. |
| SMS + transcript support/API | **0.15** | Both matter (SMS for the outbound-caller product line later; transcripts feed the RAG corpus directly) but are more commoditized across vendors than the top two signals, so weighted lower. |
| Contract/lock-in risk | **0.10** | Least differentiating — none of the four impose crippling lock-in — but still worth a tie-breaker weight. |

Weights sum to 1.00. Adopted the task's suggested weights as-is; the rationale column reflects why (not adjusted).

---

## 2. Per-signal ladders (0–100)

**Recording + webhook API access**
- 100 — First-party recording API + a webhook event that fires specifically when the recording/data is ready, no gating, fully documented.
- 90 — Full recording API; a documented "data ready" event exists (may be a general call-ended event rather than recording-named) with no plan gating.
- 75 — Full recording API; completion webhook exists but the "recording is ready" signal is inferred from a payload field rather than a named event (race-condition risk).
- 50 — Recording API exists but webhook coverage is ambiguous/unverified.
- 30 — No confirmed programmatic recording access.

**CRM embeddability**
- 100 — We own the SDK/code outright; built for embedding in any web app (raw SDK approach).
- 90 — Vendor-provided JS SDK explicitly for embedding a phone widget in a third-party web app, fully in-browser, no desktop app required.
- 75 — Vendor-provided embeddable SDK exists but is newer/thinner (smaller ecosystem, less battle-tested).
- 40 — Only a browser extension/desktop app, no embeddable widget.
- 15 — No embeddable SDK at all; API + native CRM plugins only (still requires building our own softphone UI from scratch against a REST API, which is effectively a bespoke build with none of the raw-Twilio engineering control).

**Cost at 5 seats/mo** (functional-parity plan — i.e., the cheapest tier that actually satisfies recording+webhook+SMS-API+transcript-API, not the cheapest headline price)
- 100: <$75 · 90: $75–99 · 80: $100–124 · 70: $125–149 · 60: $150–174 · 50: $175–199 · 40: $200–249 · 30: $250–299 · 20: $300+

**SMS + transcript support**
- 95–100 — Both SMS API and transcript API available ungated (or ungated) at/near the entry tier.
- 80–85 — One ungated, one gated to a mid/upper tier.
- 55–70 — Both gated to upper tiers and/or require a paid add-on stack.
- 30 — Either feature unconfirmed or effectively unavailable via API.

**Lock-in risk** (100 = least lock-in)
- 100 — Pure pay-as-you-go, no contract, no seat minimum, cancel anytime; only risk is our own engineering maintenance.
- 80 — Month-to-month billing available, self-service cancel, no annual-contract requirement found for API/recording features.
- 68 — Month-to-month available, cancel-anytime, but vendor reserves an asymmetric short notice period to terminate developer/API access.
- 55 — Seat minimums, common annual commitments in practice for full feature access, and longer written-notice requirements at scale.

---

## 3. Evidence by vendor (source + access date on every cell)

### JustCall (justcall.io)
| Signal | Finding | Source | Accessed |
|---|---|---|---|
| Pricing | Team $29/user/mo (annual, 2-seat min) → 5 seats ≈ $145/mo; $39/user monthly billing | [justcall.io/pricing](https://justcall.io/pricing/) | 2026-07-18 |
| Recording API | `GET /v2.1/calls/{id}/recording/download` returns MP3 after call ends | [developer.justcall.io](https://developer.justcall.io/reference/call_recording_download_v21) | 2026-07-18 |
| Webhooks | `call.initiated`, `call.completed`, `call.updated`, `jc.call_ai_generated`; recording URL delivered inside `call_info` of `call.completed` — **no dedicated "recording ready" event found** `[UNVERIFIED beyond this]` | [developer.justcall.io/docs/call-events](https://developer.justcall.io/docs/call-events) | 2026-07-18 |
| SMS | Native, `POST /v2.1/texts/new`, ungated at entry plan | [developer.justcall.io](https://developer.justcall.io/reference/texts_new_v21) | 2026-07-18 |
| Transcripts | Unlimited AI transcription included from entry Team plan; API via `fetch_transcription=true` returning `call_transcription` array | [help.justcall.io](https://help.justcall.io/en/articles/8820238-accessing-justcall-ai-data-using-apis) | 2026-07-18 |
| CRM embed | Real embeddable **CTI Dialer SDK**, npm `@justcall/justcall-dialer-sdk`, iframe-based, framework-agnostic, `onLogin/onLogout/onReady` callbacks | [developer.justcall.io/docs/cti-dialer-sdk](https://developer.justcall.io/docs/cti-dialer-sdk), [GitHub](https://github.com/saaslabsco/justcall-dialer-sdk) | 2026-07-18 |
| Lock-in | Monthly + annual billing; self-service cancel effective end of cycle; no annual-contract requirement found gating API/recording | [justcall.io/refund-policy](https://justcall.io/refund-policy/), [help.justcall.io](https://help.justcall.io/en/articles/1046750-cancelling-justcall-account) | 2026-07-18 |

### Aircall (aircall.io)
| Signal | Finding | Source | Accessed |
|---|---|---|---|
| Pricing | Essentials $30/seat annual (3-seat min); Professional $50/seat annual (needed for SMS-via-API); +AI Assist add-on $9/mo/license for transcripts → functional-parity 5 seats ≈ (50+9)×5 = **$295/mo** | [cloudtalk.io/blog/aircall-pricing](https://www.cloudtalk.io/blog/aircall-pricing/) (secondary — Aircall's own pricing page renders via JS), [aircall.io/pricing](https://aircall.io/pricing/) | 2026-07-18 |
| Recording API | `GET /v1/calls` / `/v1/calls/:id` return `recording` (1h URL) and `recording_short_url` (3h URL) | [developer.aircall.io/api-references](https://developer.aircall.io/api-references/) | 2026-07-18 |
| Webhooks | `call.hungup` (immediate) then `call.ended` (~30s later, once recording/duration data is fully assembled) — functions as the de-facto "recording ready" event | [developer.aircall.io/tutorials/webhooks-guide](https://developer.aircall.io/tutorials/webhooks-guide/) | 2026-07-18 |
| SMS | Native Messages API, but **gated to Professional plan** — Essentials cannot send SMS via API | [developer.aircall.io](https://developer.aircall.io/tutorials/sending-sms-messages-with-aircall-api/), [support.aircall.io](https://support.aircall.io/hc/en-gb/articles/20566418489757) | 2026-07-18 |
| Transcripts | Call Transcript/Summary/Topics/Sentiment via API+webhooks, but gated behind **AI Assist add-on** ($9/mo) or AI Assist Pro ($49/mo); up to 24h activation delay | [support.aircall.io](https://support.aircall.io/en-gb/articles/17784000797853), [aircall.io/products/ai](https://aircall.io/products/ai/) | 2026-07-18 |
| CRM embed | **Aircall Everywhere** SDK (`npm i aircall-everywhere`) embeds the Workspace phone via iframe directly in a custom web app; no desktop app required | [developer.aircall.io](https://developer.aircall.io/), [GitHub](https://github.com/aircall/aircall-everywhere) | 2026-07-18 |
| Lock-in | Monthly/annual billing separate from contract term; ≤10 seats self-cancel, >10 seats needs 30-day written notice; no refunds on committed terms | [support.aircall.io](https://support.aircall.io/en-gb/articles/19179941054877) | 2026-07-18 |

### OpenPhone / Quo (quo.com, rebranded 2025-09-23)
| Signal | Finding | Source | Accessed |
|---|---|---|---|
| Pricing | Business plan (needed for transcript API) $23/mo annual / $33/mo monthly → 5 seats ≈ **$115–165/mo** | [quo.com/pricing](https://www.quo.com/pricing) | 2026-07-18 |
| Recording API | `GET /v1/call-recordings/{callId}` returns `url`, `id`, `status`, `duration`, `startTime` | [quo.com/docs](https://www.quo.com/docs/mdx/api-reference/calls/get-recordings-for-a-call) | 2026-07-18 |
| Webhooks | `call.ringing`, `call.completed`, **`call.recording.completed`**, `call.summary.completed`, `call.transcript.completed` — the single most literal match to the PRD's "recording-ready, call-completed" phrasing of any vendor | [support.quo.com/webhooks](https://support.quo.com/core-concepts/integrations/webhooks) | 2026-07-18 |
| SMS | Native two-way Messages API, ungated even at Starter (lowest tier) | [quo.com/docs](https://www.quo.com/docs/llms-full.txt) | 2026-07-18 |
| Transcripts | `GET /v1/call-transcripts/{id}` + `GET /v1/call-summaries/{callId}` — **gated to Business/Scale plans**, not available on Starter | [quo.com/docs](https://www.quo.com/docs/llms-full.txt) | 2026-07-18 |
| CRM embed | **No embeddable JS/web SDK or softphone widget found.** Strictly its own web/desktop/mobile app + REST API + native Salesforce/HubSpot/Zapier integrations — confirmed no result for "embeddable dialer widget SDK" searches | [quo.com/integrations](https://www.quo.com/integrations), [openphone.com/blog/crm-phone-integration](https://www.openphone.com/blog/crm-phone-integration/) | 2026-07-18 |
| Lock-in | Month-to-month available, cancel anytime; numbers held 60 days post-cancel; vendor may terminate developer access with only **10 days'** notice vs. 30 days from the developer side (asymmetric) | [support.quo.com](https://support.quo.com/core-concepts/administration/billing/managing-your-trial) | 2026-07-18 |

### Raw Twilio (Programmable Voice + `twilio-voice.js`)
| Signal | Finding | Source | Accessed |
|---|---|---|---|
| Pricing model | No per-seat fee at all — usage-based only. US outbound $0.0140/min; inbound local $0.0085/min + $1.15/mo number rental; inbound toll-free $0.0220/min + $2.15/mo. **Modeled** (not vendor-quoted) cost for 5 reps at an assumed 2,500 total min/mo across 5 numbers: ≈$5.75 number rental + ≈$35 usage + ≈$6.25 recording creation + ≈$1.25 recording storage + ≈$60 Voice Intelligence transcription (see below) ≈ **$108/mo** — flat regardless of seat count, scales with talk-time instead | [twilio.com/voice/pricing/us](https://www.twilio.com/en-us/voice/pricing/us) | 2026-07-18 |
| Recording API | `GET /2010-04-01/Accounts/{Sid}/Recordings/{Sid}.json`; media via Recording URI; $0.0025/min creation + $0.0005/min/mo storage | [twilio.com/docs/voice/api/recording](https://www.twilio.com/docs/voice/api/recording), [pricing](https://www.twilio.com/en-us/voice/pricing/us) | 2026-07-18 |
| Webhooks | `<Record>`'s `recordingStatusCallback` + `recordingStatusCallbackEvent` (`in-progress`/`completed`) — exact 1:1 match to the PRD's "recording-ready" event; `StatusCallback`/`StatusCallbackEvent` on the Call resource for call-completed | [twilio.com/docs/voice/twiml/record](https://www.twilio.com/docs/voice/twiml/record), [twilio.com/docs/voice/api/call-resource](https://www.twilio.com/docs/voice/api/call-resource) | 2026-07-18 |
| SMS | Programmable Messaging API, $0.0083/segment US (+ carrier surcharges) | [twilio.com/sms/pricing/us](https://www.twilio.com/en-us/sms/pricing/us) | 2026-07-18 |
| Transcripts | Two paths: built-in `<Record transcribe="true">` ($0.05/min, English-only) or **Voice Intelligence** product (batch $0.024/min, streaming $0.027/min, plus PII redaction/sentiment add-ons) — no plan gating, just per-use cost | [twilio.com/docs/voice/twiml/record](https://www.twilio.com/docs/voice/twiml/record), [pricing](https://www.twilio.com/en-us/voice/pricing/us) | 2026-07-18 |
| CRM embed | `twilio-voice.js` (Voice JS SDK) is explicitly a client-side SDK built for embedding browser-based calling into any web app | [twilio.com/docs/voice/sdks/javascript](https://www.twilio.com/docs/voice/sdks/javascript) | 2026-07-18 |
| Lock-in | Pay-as-you-go, "no commitments required"; the real lock-in-equivalent is engineering maintenance of the ~200 lines of custom Next.js token/webhook routes (SDK version bumps, webhook signature validation, token refresh) — a qualitative risk, not a contractual one | [twilio.com/voice/pricing/us](https://www.twilio.com/en-us/voice/pricing/us); engineering estimate per OSS scout, Decisions Log 2026-07-17 | 2026-07-18 |

---

## 4. Composite table (breakdown per scoring-pattern rule #4)

Composite = 0.30×RecWebhook + 0.25×Embed + 0.20×Cost@5 + 0.15×SMS/Transcript + 0.10×LockIn — computed in code (not by hand) to guarantee the arithmetic is exact and reproducible.

| Vendor | RecWebhook (raw / weighted) | Embed (raw / weighted) | Cost@5 (raw / weighted) | SMS+Transcript (raw / weighted) | LockIn (raw / weighted) | **Composite** | Grade |
|---|---|---|---|---|---|---|---|
| **Twilio (raw)** | 100 / 30.00 | 100 / 25.00 | 80 / 16.00 | 90 / 13.50 | 100 / 10.00 | **94.50** | **A** |
| JustCall | 75 / 22.50 | 78 / 19.50 | 70 / 14.00 | 95 / 14.25 | 80 / 8.00 | **78.25** | B |
| Aircall | 90 / 27.00 | 90 / 22.50 | 30 / 6.00 | 55 / 8.25 | 55 / 5.50 | **69.25** | C |
| OpenPhone/Quo | 95 / 28.50 | 15 / 3.75 | 80 / 16.00 | 80 / 12.00 | 68 / 6.80 | **67.05** | C |

Grade bands: A ≥90 (Adopt) · B 75–89 (Strong alt / fallback) · C 60–74 (Review — real gaps) · D <60 (Discard)

---

## 5. Pick, runner-up, and what the "losers" do better

### Pick: **raw Twilio** (`twilio-voice.js` + our own ~200-line Next.js routes) — 94.50
Wins on the two heaviest-weighted signals (recording+webhook, embeddability) by construction — we own the code, so the webhook payload is exactly `recordingStatusCallback`/`StatusCallback` on our terms, not whatever a SaaS vendor happened to name its events. Cost is usage-based and, at a realistic 5-rep call volume, lands cheaper than every SaaS option modeled here (own estimate, not vendor-quoted — flagged above). No contract, no seat minimum. This also matches the OSS scout's independent 2026-07-17 conclusion, which is a useful cross-check: two separate research passes converged on the same build shape.

### Runner-up: **JustCall** — 78.25
Best SaaS option if Rob ever wants a rent-first fallback instead of owning the ~200 lines: cheapest functional-parity plan ($145/mo @ 5 seats vs. Aircall's $295), SMS and AI transcription both ungated at the entry tier, and — critically — it has a genuine embeddable CTI Dialer SDK (most people assume JustCall is app-only; it isn't). Its one real gap is the missing dedicated "recording ready" webhook event (recording URL rides inside the `call.completed` payload instead), which is a minor integration wrinkle, not a blocker.

### What the losers do better
- **Aircall** has the cleanest *documented* webhook semantics of the three SaaS options (`call.ended` is explicitly described as firing only once recording/duration data is fully assembled — the least ambiguous "data is ready" signal among the SaaS vendors) and the most mature, widely-adopted embeddable SDK (Aircall Everywhere has the largest ecosystem/GitHub footprint of the three). It loses purely on cost: hitting SMS-via-API + transcripts requires stacking Professional + AI Assist, pushing 5 seats to $295/mo, nearly 3x JustCall.
- **OpenPhone/Quo** has, on paper, the *single best-named webhook set of any vendor* — `call.recording.completed`, `call.summary.completed`, `call.transcript.completed` are almost a literal transcription of the PRD's own language, and its pricing is second-cheapest. It is disqualified from serious contention by the one binary requirement it fails outright: **no embeddable web SDK exists** — building click-to-dial against it would mean writing our own softphone UI from scratch against a bare REST API, which forfeits SaaS's main advantage (rent-first) without any of raw Twilio's control benefits.

---

## Decisions Log entry (for BUILD-QUEUE.md / PRD Decisions Log)
> 2026-07-18 — Task 7.1 dialer scorecard complete: raw Twilio (`twilio-voice.js` + own routes) confirmed as pick, composite 94.50 vs. JustCall 78.25 / Aircall 69.25 / OpenPhone-Quo 67.05. Consistent with OSS scout's 2026-07-17 build-shape call. JustCall is the fallback if Rob wants rent-first instead. Posted to dev_chat for Rob confirm. — Max/head-of-research
