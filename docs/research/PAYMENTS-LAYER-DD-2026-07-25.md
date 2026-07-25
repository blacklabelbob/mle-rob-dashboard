# Payment Processing Layer — Add-On DD & Decision Tracker

**Opened:** 2026-07-25 · **Owner:** Rob (decision) / Max (DD) · **Classification:** Add-On (not a core P1 build)
**Serves:** BOTH — MLE (The Network / contracts) and AI VoiceTech (AIDRE / AIVA)
**Thesis (Rob, 2026-07-25):** new revenue stream + raises switching costs on existing accounts.

**Hard dates (Rob, 2026-07-25):**
| Milestone | Window | Drop-dead |
|---|---|---|
| Due diligence complete | 7–10 days | **2026-08-04** |
| Final go/no-go decision | 10–14 days | **2026-08-08** |

Daily nudge armed in `~/.claude/memory/REMINDERS.md` (fires 7:30am until the decision line is deleted).
Itinerary row in `~/.claude/memory/tracker-extras.json` → surfaces in `PROJECT-TRACKER.md`.

**Rob's raw dump:** `docs/plans/sources/ROB-PAYMENTS-LAYER-DUMP-2026-07-25.md`

---

## 1. Prior work — this is NOT a cold start

A 4-agent research swarm already ran this question on **2026-07-23** (~130 sources, repos gh-verified,
licenses read from LICENSE files):

- **`docs/research/payments-deep-research-2026-07-23.md`** — the synthesis
- **`docs/research/payments-landscape-2026-07-23.html`** — visual deliverable
- **`docs/research/agents/2026-07-23-payments-slice{1,2,3,4}-*.md`** — raw evidence
  (slice 1 OSS card infra · slice 2 crypto+fiat · slice 3 non-Stripe APIs + PayFac · slice 4 ISO/agent/MSP landscape)
- **`docs/research/payment-processing-candidates.md`** (2026-07-04) — the *sales-talent* side of the
  same play: recruiting displaced payment-processing reps into The Network. Different question, same thesis.

### What 7/23 already concluded on Rob's exact ISO-vs-ISV-vs-PayFac question

A **staged ladder**, not a single choice:

| Rung | Structure | Cost | When it's right |
|---|---|---|---|
| 1 | Independent **agent** on 2 Schedule A's | **$0** | Start here. Prove the motion before spending. |
| 2 | Registered **retail ISO** | ~$20–30k/yr | When sub-agent count justifies the registration cost |
| 3 | Registered **PayFac** | heavy | Only in the ~$10–100M/yr processing band (~$50M rule of thumb) |
| 3-alt | **PayFac-as-a-Service** (Rainforest / Moov / Finix / Tilled) | low | The realistic "PayFac-like" answer — get PayFac economics without registration |

**This directly answers Rob's framing:** "PayFac-like" ≈ **PFaaS**, and it is a *later rung*, not the entry point.
Entry is $0 as an agent. Source for the ~$50M threshold:
[Finix review, business-money.com](https://www.business-money.com/announcements/finix-review-is-this-payfac-a-good-stripe-alternative/).

**7/23's recommended first 3 calls:** (1) Maverick Payments (white-label + APIs, free unlimited sub-agent
hierarchy, in-house high-risk UW) (2) SignaPay (up to 90% splits, PayLo dual-pricing door-opener that pairs
with AI-voice outbound) (3) **Shift4** (only one-stop cards+crypto toggle; partner-contract history is a flag).

**Agent-contract non-negotiables (from slice 4) — apply to Amplipay and Shift4 alike:**
1. Lifetime **vested** residuals
2. **No production minimums** that claw residuals
3. **Portfolio sale rights**
4. **Sub-agent Schedule A rights**

> Advertised splits ≠ contractual. **The Schedule A is the truth.** Do not evaluate any of these
> partners on their marketing page.

---

## 2. Rob's short-list vs. the 7/23 research — the gap

Rob (2026-07-25): *"Companies that match need-to-haves (Amplipay, Shift4 are still in running)."*

| Company | In 7/23 swarm? | Status |
|---|---|---|
| **Shift4** | ✅ Yes — named a top-3 first call | Partially diligenced. Flag on record: *"treat as a product line, not umbrella; partner-contract history."* Also: Shift4 acquired Global Blue (consolidation wave). |
| **Amplipay** | ❌ **NO — never scored** | **Primary DD gap.** Surfaced only via Rob's OpenRouter/ChatGPT searches, which Max cannot read. |
| Maverick Payments | ✅ 7/23 pick #1 | Not in Rob's short-list — **unexplained drop.** Was it evaluated and rejected, or never seen? |
| SignaPay | ✅ 7/23 pick #2 | Same question. |

**Two unresolved questions for Rob:** (a) were Maverick and SignaPay actually rejected on the merits, or
did the OpenRouter/ChatGPT searches simply not surface them? (b) what were Amplipay's and Shift4's
"need-to-haves" match criteria — Max cannot see the transcripts that produced the short-list.

---

## 3. Amplipay — first-pass findings (Max, 2026-07-25, from amplipay.ai)

**Action already taken by Rob:** web-form booking request submitted **2026-07-24**.

| Attribute | Finding |
|---|---|
| Positioning | "Complete Payment Platform" — cards, ACH, digital assets, POS terminals, eCommerce, virtual terminal |
| **ISO/agent program** | Yes — explicit "ISO Partners" + "Become an ISO Partner" track, "best-in-class revenue splits" (unquantified) |
| Dual pricing / cash discount | Yes — offered as a named program ✅ matches the 7/23 "#1 SMB agent pitch" finding |
| Crypto | Yes — digital assets alongside cards/ACH ✅ same one-stop property that made Shift4 attractive |
| Compliance claims | PCI DSS L1, KYC/AML, 256-bit encryption, "Visa & Mastercard Direct" |
| Location | Boca Raton, FL |
| **Ownership** | ⚠️ **Publicly traded, OTC: APGP** |

### ⚠️ Counterparty-risk flag — the single most important open Amplipay item

Amplipay is an **OTC-listed micro-cap**, not a private processor or a major. In an ISO/agent
relationship your residual stream is only as durable as the counterparty holding it. An OTC issuer
introduces a failure mode the 7/23 candidates don't obviously share.

**Must-verify before any Amplipay signature (none of this is on their website):**
1. **Who is the actual sponsor bank?** "Visa & Mastercard Direct" is a marketing phrase — a sponsor
   bank is required by FFIEC and it is never the ISO itself. Get the bank's name in writing.
2. **OTC financials** — pull the APGP filings/disclosure tier. Revenue, cash position, going-concern
   language, dilution/share-issuance history. Is this an operating processor or a shell with a website?
3. **Residual survivability on partner failure** — what happens to a vested portfolio if APGP is
   delisted, acquired, or insolvent? Get the answer in the contract, not on a call.
4. **Actual merchant count / processing volume** — verifiable, third-party, not self-reported.
5. **Schedule A**, against all four non-negotiables in §1.

> This flag is DD input, **not** a recommendation to drop Amplipay. Rob has a booking in motion —
> keep it, and use these five items as the call agenda.

---

## 4. Identity / entity structure — decision Rob must make

The 7/23 research explicitly filed the processor play in the **BoostUp Payments** lane
(rob@boostuppayments.com), with this standing note:

> *"AIVA checkout integration is a product feature of AI VoiceTech that would consume whichever
> processor BoostUp lands — keep the corporate/email identities separate."*

Rob (2026-07-25) says the initiative **serves both** MLE and AI VoiceTech.

These are reconcilable but the split must be deliberate:

| Layer | Where it should live | Why |
|---|---|---|
| ISO/agent **registration, Schedule A, residual ownership** | BoostUp Payments entity | It's a payments business; that's the entity built for it |
| **Distribution** — selling processing into MLE Network merchants + AI VoiceTech clients | MLE / AI VoiceTech | Where the relationships and switching-cost leverage actually are |
| **Email / DNS / tooling** | ⛔ **NEVER crossed** | Hard global rule — `~/.claude/rules/email-identity.md`, post 2026-07-08 crossover incident |

**Decision needed from Rob:** which entity signs, and how revenue flows between them. The email-identity
rule constrains *plumbing* (no forwarding, no aliases, no shared tooling) — it does **not** forbid a
strategy that spans the businesses. Do not let the two get conflated in either direction.

---

## 5. Open DD checklist — to close by 2026-08-04

- [ ] Rob exports/pastes the **OpenRouter** + **ChatGPT** candidate long-lists (Max cannot read either — 403 / session-scoped)
- [ ] Resolve: were **Maverick** and **SignaPay** rejected on merits, or never surfaced?
- [ ] **Amplipay**: sponsor bank named in writing
- [ ] **Amplipay**: OTC:APGP financials pulled (going-concern, cash, dilution)
- [ ] **Amplipay**: merchant count / volume independently verified
- [ ] **Amplipay**: booking held (submitted 7/24 — chase if no reply by 7/28)
- [ ] **Shift4**: partner-contract history flag investigated (7/23 raised it, never closed)
- [ ] **Both**: Schedule A obtained and scored against the 4 non-negotiables
- [ ] Rung decision: start as **$0 agent** (7/23 recommendation) vs. jump straight to ISO/PFaaS
- [ ] Entity decision: which entity signs (§4)
- [ ] Switching-cost mechanic specified: what *concretely* makes a merchant unable to leave once processing is bundled?
- [ ] Revenue model: expected residual per merchant × realistic merchant count = is this worth the distraction from P1?

## 6. The question nobody has asked yet

Rob's stated value is **revenue + switching costs**. The switching-cost claim is the stronger half and
it is currently unquantified. Processing is famously *easy* to switch (that's the entire premise of the
dual-pricing pitch in §1 — reps win accounts by switching them). Bundling processing into MLE/AIVA only
raises switching costs if the *integration* is what's sticky, not the processing itself.

**Before the 8/8 decision, that mechanic needs to be named explicitly.** Otherwise this is a revenue
add-on with a switching-cost story attached, which is a materially different (and smaller) case.

---

**Changelog**
- 2026-07-25 — Opened by Max on Rob's directive. Dump captured + folded, 7/23 prior work linked,
  Amplipay first-pass + OTC counterparty flag, gap analysis vs 7/23 short-list, reminder + itinerary armed.
