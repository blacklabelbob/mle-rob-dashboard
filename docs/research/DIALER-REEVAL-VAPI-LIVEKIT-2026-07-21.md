# Dialer Re-Eval — Vapi / LiveKit vs raw Twilio (+ hybrid) — BUILD-QUEUE Q12
**Date:** 2026-07-21 · **Author:** Max (head-of-research) · **Method:** weighted composite per `~/.claude/rules/scoring-pattern.md`
**Status:** ✅ COMPLETE — evidence from 2 parallel research agents (Vapi, LiveKit) + 7/18 Twilio baseline; recommendation STAGED for Rob (capture freeze — send when his dump finishes). **No build until Rob decides.**
**Result: Twilio+Vapi hybrid 93.5 · LiveKit 85.25 · Twilio-only 79.25 · Vapi-only 76.25**

## 0. Why this doc exists (Rob, dump 7.21.26-1 #2 — verbatim intent)
Rob is "not going with your recommendations for Inbound and Outbound Calls unless you can convince me otherwise — AS ALWAYS PUSH BACK. WE WANT THE RIGHT ANSWER." His asks:
- Evaluate **Vapi** ("more for AI Agents") and "even cheaper **LiveKit**".
- ONE stack capturing BOTH rep outbound calls AND inbound routing to the same number.
- **Digital receptionist** answers any missed inbound; if the call is for a specific rep, it acts as **that rep's assistant**.
- On any inbound, the receptionist **instantly looks the caller up in the CRM** and pulls everything so it can "speak intelligently and drive the convo forward."

Key framing this doc will test honestly: **Vapi and LiveKit are not mutually exclusive with Twilio** — Vapi can ride on Twilio numbers/SIP, and LiveKit bridges PSTN via SIP trunks (Twilio/Telnyx). So the real candidates are stacks, not vendors.

## 1. Candidates (stacks)
| # | Stack | Human-rep outbound | AI inbound receptionist |
|---|---|---|---|
| A | **Raw Twilio only** (7/18 winner, 94.5) | twilio-voice.js click-to-dial (Q5b scaffold DONE) | Build our own on Twilio Media Streams + LLM — most engineering |
| B | **Vapi only** | ⚠️ to verify — Vapi is AI-call-first; human browser dialing unclear | Native — its core product |
| C | **LiveKit** (Cloud or self-host, Agents + SIP) | Web SDK room bridged to PSTN via SIP participant | LiveKit Agents framework |
| D | **Twilio + Vapi hybrid** | twilio-voice.js (scaffold already built) | Vapi on the SAME Twilio numbers (BYO/SIP); missed/unanswered inbound → Vapi assistant |

## 2. Weight table (extends the 7/18 table with Rob's new criteria)
| Signal | Weight | Rationale |
|---|---|---|
| AI inbound receptionist (missed-call answer, rep-assistant persona, warm transfer) | **0.20** | Rob's dump makes this a first-class requirement, not a later phase — "definitely want a digital receptionist ready to go." |
| Mid-call caller→CRM lookup / screen-pop (tool calls hitting our API at/before answer) | **0.15** | Rob's literal ask: "find the caller in the system immediately and pull everything up." Needs webhook-at-ring or in-call tool calls. |
| Human-rep click-to-dial embedded in the CRM (browser, no desktop app) | **0.20** | Unchanged Phase-7 literal requirement; the Q5b scaffold already implements this on Twilio. A stack that can't do it fails the "one stack captures both" ask. |
| Call capture → CRM (recordings, transcripts, ready-webhooks feeding Task 7.3–7.5 RAG) | **0.20** | Was 0.30 on 7/18; still the pipeline blocker, now sharing weight with the receptionist requirement it must also serve (AI calls captured too). |
| Cost all-in (5 human reps + ~500 AI-receptionist min/mo; STT/TTS/LLM included in math) | **0.15** | Rob explicitly raised cost ("even cheaper LiveKit") — must be scored on ALL-IN $ incl. model/voice fees, not headline platform price. |
| Lock-in / maturity / self-host path | **0.10** | Tie-breaker as before; LiveKit's open-source core scores here, offset by ops burden counted in cost/effort. |
Weights sum to 1.00. Per CR-3, arithmetic will be shown per-cell; every cell gets a source URL + access date or `[UNVERIFIED]`.

## 3. Per-signal ladders (0–100)
- **AI receptionist:** 100 = managed, production-grade inbound agent w/ transfer + persona control, documented; 80 = capable framework, we assemble (days); 50 = possible but weeks of glue; 20 = fundamentally DIY on raw media streams.
- **Caller lookup/screen-pop:** 100 = documented pre-answer webhook/tool-call with caller ID + mid-call custom tool calls; 75 = one of the two; 40 = post-call only; 20 = none.
- **Rep click-to-dial:** 100 = we own it via first-party browser SDK (proven pattern); 75 = documented but thinner pattern; 40 = hacky/undocumented; 0 = human browser calling not supported.
- **Call capture:** ladder inherited verbatim from 7/18 scorecard §2.
- **Cost (all-in $/mo at 5 reps + 500 AI min):** 100: <$75 · 85: $75–124 · 70: $125–199 · 55: $200–299 · 40: $300–449 · 25: $450+. Self-host ops labor priced at $0 cash but noted as risk.
- **Lock-in:** ladder inherited from 7/18 §2; +self-host bonus band (100 = OSS core, data + code portable).

## 4. Evidence
> Twilio baseline evidence carries over from `DIALER-SCORECARD-2026-07-18.md` §3 (raw Twilio row) — not re-derived. Vapi + LiveKit gathered 2026-07-21 by parallel research agents (fixed output contract, scoring-pattern rule 5). All access dates 2026-07-21 unless noted.

### Vapi (vapi.ai)
| Signal | Finding | Source |
|---|---|---|
| Pricing | Platform fee **$0.05/min**; STT/LLM/TTS billed **at cost** (passthrough; $0 with your own keys); concurrency $10/line/mo past 10; HIPAA +$2k/mo, ZDR +$1k/mo (not needed) | https://vapi.ai/pricing · https://docs.vapi.ai/faq |
| All-in AI $/min | Realistic ~$0.13–$0.20/min with a mid-tier stack (Deepgram + 4o-mini-class + standard TTS + Twilio inbound $0.0085/min); third-party 2026 breakdowns put production range $0.15–$0.40 depending on voice/model | https://quiq.com/blog/vapi-ai-pricing/ · https://www.cloudtalk.io/blog/vapi-ai-pricing/ · https://www.twilio.com/en-us/voice/pricing/us |
| Monthly @500 AI min | **≈$65–130/mo AI side** ($25 platform + $35–100 provider passthrough + $4.25 Twilio inbound + $1.15/number). Human-rep telephony stays on Twilio (≈$45/mo @2,500 min, $0.018/min client+PSTN legs) — $0 to Vapi | computed from https://vapi.ai/pricing + https://www.twilio.com/en-us/voice/pricing/us |
| AI receptionist | Native core product: `assistantId` per number OR dynamic per-call assistant from your Server URL; warm/blind `transferCall` w/ call summary + TwiML, runtime destinations via `transfer-destination-request` webhook; 1000+ concurrent, ~800 ms latency | https://docs.vapi.ai/phone-calling · https://docs.vapi.ai/call-forwarding · https://docs.vapi.ai/faq |
| Mid-call CRM lookup | **Custom Tools**: Vapi POSTs `toolCallList` to our server mid-conversation, results feed straight back into the convo; `{{customer.number}}` available for lookup — this is EXACTLY Rob's "find the caller immediately and speak intelligently" | https://docs.vapi.ai/tools/custom-tools |
| Screen-pop | `assistant-request` webhook fires at ring (pre-answer, 7.5 s budget) with the Call object incl. caller number → doubles as CRM screen-pop trigger; can even respond with a `destination` to route to a HUMAN and bypass AI; plus `status-update` ringing events | https://docs.vapi.ai/server-url/events#assistant-request |
| Human click-to-dial | **NOT a Vapi capability** — AI-agents-only platform; Web SDK connects a user to an AI, not a rep to PSTN. Human dialing must live on Twilio Voice JS (our Q5b scaffold). Coexists fine: BYO numbers stay in our Twilio account | https://docs.vapi.ai/faq · https://docs.vapi.ai/quickstart/web · https://docs.vapi.ai/calls/outbound-calling |
| Call capture | `end-of-call-report` webhook: recording URLs + full transcript + messages; mp3 supported; recordings can write to OUR OWN S3/GCS bucket (`recordingUseCustomStorageEnabled`) — feeds Task 7.3–7.5 RAG directly, transcript included free | https://docs.vapi.ai/server-url/events · https://docs.vapi.ai/assistants/call-recording |
| Twilio relation | First-class BYO: number import endpoint + documented Twilio Elastic SIP trunking (TLS 5061, static IPs); telephony bills at Twilio rates on OUR account; platform fee still $0.05/min | https://docs.vapi.ai/advanced/sip/twilio · https://docs.vapi.ai/phone-calling |
| Lock-in/maturity | $50M Series B 2026-05-12 (~$500M val, Peak XV + M12/Kleiner/Bessemer; $72M total); 1B+ calls, won Amazon Ring over 40 rivals; BYO keys/numbers/storage = weak lock-in; on-prem exists (AWS Marketplace, enterprise) | https://techcrunch.com/2026/05/12/vapi-hits-500m-valuation-as-amazon-ring-chose-its-ai-platform-over-40-rivals/ · https://docs.vapi.ai/enterprise/plans |
| [UNVERIFIED] | Warm transfer to a BROWSER (WebRTC) rep rather than PSTN; assistant-request firing when a fixed assistantId is set; per-minute surcharge on BYO-trunk minutes beyond $0.05 (none stated) | — |

### LiveKit (livekit.io — Cloud + Agents + SIP)
| Signal | Finding | Source |
|---|---|---|
| Pricing | Cloud: Build $0/mo (1,000 agent-min + 5,000 participant-min + 1,000 SIP-min incl.), Ship $50/mo, Scale $500/mo; overages $0.01/agent-min, $0.0005/participant-min, $0.004/SIP-min; LiveKit US numbers $1/mo (first free, inbound-only, $0.01/min); Inference bundles STT/TTS/LLM (e.g. Deepgram $0.0048/min, Gemini Flash $0.0013/min, Cartesia TTS $0.03/min) | https://livekit.com/pricing |
| Monthly @500 AI min + 5 reps | **≈$25–35/mo on Build** (everything fits included minutes + ~$20 Inference) or **≈$75–110/mo on Ship** with a Twilio trunk (derived from official rates; third-party fully-loaded example ~$0.077/min) | https://livekit.com/pricing · https://checkthat.ai/brands/livekit/pricing |
| AI receptionist | Framework, not product: Agents 1.0 (Python/Node parity) + SIP dispatch rules auto-answer inbound into rooms; warm transfer = prebuilt `WarmTransferTask` but **BETA, Python-only** (Node = manual multi-room orchestration); **worker is a long-running process WE deploy and keep alive**, even on Cloud | https://docs.livekit.io/sip/dispatch-rule/ · https://docs.livekit.io/sip/transfer-warm/ · https://github.com/livekit/agents |
| Mid-call CRM lookup | Function tools documented ("call external APIs or lookup data"), sync or background, MCP support (Python) — caller-lookup mid-call is a documented pattern | https://docs.livekit.io/agents/build/tools/ |
| Screen-pop | Caller number = participant attribute `sip.phoneNumber`; `participant_joined` webhook carries it server-side at join — effectively **at answer, no pre-answer webhook** (Vapi's assistant-request is earlier) | https://docs.livekit.io/sip/sip-participant/ · https://docs.livekit.io/home/server/webhooks/ |
| Human click-to-dial | Documented composed pattern: rep joins room via browser SDK, backend `CreateSIPParticipant` dials PSTN into the same room (`wait_until_answered`, live `sip.callStatus` for UI); no single named tutorial; room semantics = agent+rep+customer natively share a call | https://docs.livekit.io/sip/outbound-calls/ |
| Call capture | Egress recording (audio $0.005/min) + `egress_ended` webhook says where the file landed; transcripts emitted as JSON we persist ourselves | https://docs.livekit.io/transport/media/ingress-egress/egress/composite-recording/ · https://docs.livekit.io/home/server/webhooks/ |
| Twilio relation | BYO-carrier by design (Twilio/Telnyx trunks); **same trunk serves inbound AI + outbound rep caller-ID**; Twilio callSid surfaced as attributes | https://docs.livekit.io/sip/ |
| Lock-in/maturity | Server/SIP/egress/agents all **Apache-2.0 open source** (19.9k★, release 7/18/26); $100M Series C @ $1B (1/22/26, Index; powers ChatGPT voice mode, Tesla/xAI/Salesforce); full self-host exit path (server+Redis+SIP+egress — real infra ops) | https://github.com/livekit/livekit · https://livekit.com/blog/livekit-series-c · https://docs.livekit.io/home/self-hosting/sip-server/ |
| [UNVERIFIED] | Build-tier overage behavior (likely hard cap); whether Cloud can host the agent worker for us; Twilio number porting into LiveKit Numbers | — |

## 5. Scores
Per-cell arithmetic shown (weight × score); Twilio-only row reuses 7/18 evidence.

| Signal (weight) | A: Twilio only | B: Vapi only | C: LiveKit | D: Twilio+Vapi hybrid |
|---|---|---|---|---|
| AI receptionist (.20) | 20 (DIY on Media Streams) → 4.0 | 100 (native product) → 20.0 | 80 (framework; we run the worker; warm-transfer beta) → 16.0 | 100 (Vapi) → 20.0 |
| Caller lookup/pop (.15) | 75 (ring webhook yes; mid-call tools DIY) → 11.25 | 100 (assistant-request pre-answer + custom tools) → 15.0 | 85 (tools yes; pop at join, not pre-answer) → 12.75 | 100 → 15.0 |
| Rep click-to-dial (.20) | 100 (Q5b scaffold LIVE) → 20.0 | **0 (not supported — AI-only platform)** → 0.0 | 75 (documented composed pattern) → 15.0 | 100 (same scaffold) → 20.0 |
| Call capture (.20) | 95 → 19.0 | 100 (report webhook + own-S3 + transcripts incl.) → 20.0 | 90 (egress + webhook; we persist transcripts) → 18.0 | 95 (two pipelines, both first-class) → 19.0 |
| Cost (.15) | 100 (~$50/mo, but buys NO receptionist) → 15.0 | 85 (~$65–130 AI side only) → 12.75 | 90 (~$30 Build/~$90 Ship all-in — cheapest full stack) → 13.5 | 70 (~$110–180 all-in) → 10.5 |
| Lock-in (.10) | 100 → 10.0 | 85 (BYO keys/numbers/storage) → 8.5 | 100 (Apache-2.0, self-host exit) → 10.0 | 90 → 9.0 |
| **Composite** | **79.25** | **76.25** | **85.25** | **93.5** |

## 6. Recommendation (staged for Rob — send when his dump finishes; no build until he decides)
**Rob was right to push back — and the honest answer is the HYBRID, not a swap.**

1. **Twilio + Vapi hybrid wins at 93.5.** Raw-Twilio-only (the 7/18 pick) drops to 79.25 the moment the AI receptionist is a first-class requirement — building that ourselves on Media Streams is weeks of work Vapi sells for $0.05/min. Vapi-alone fails his own "one stack captures rep outbound too" test: it literally cannot do human click-to-dial (AI-agents-only platform). The hybrid keeps the click-to-dial scaffold we already built and shipped (env-gated), puts Vapi on the SAME Twilio numbers via documented SIP/number-import, and Vapi's `assistant-request` webhook + custom tools deliver EXACTLY his "find the caller immediately, pull everything up, drive the convo" — including routing to a human rep first and only letting AI answer on missed/overflow.
2. **LiveKit (85.25) is the margin play, not the speed play.** Cheapest cash (~$30–90/mo all-in) and zero lock-in (fully Apache-2.0, self-hostable — aligns with "own the CRM core"). But it's a framework: we deploy and babysit a long-running agent worker, warm transfer is beta/Python-only, and every piece (receptionist, transcripts, dial UI) is assembly. Right answer IF/WHEN volume makes Vapi's $0.05/min material (~at 10k+ AI min/mo the delta is ~$450/mo — that's when we revisit).
3. **Nothing already built is wasted either way**: Q5b's Twilio scaffold is the human-dial half of the hybrid, and the recording-webhook→activity pipeline pattern reuses for Vapi's end-of-call-report.

**Ask to Rob:** say HYBRID (Twilio + Vapi — recommended), LIVEKIT (cheapest/own-it, slower to ship), or DEFEND-TWILIO-ONLY (not recommended anymore by our own math). 7.2 build resumes on his word.

