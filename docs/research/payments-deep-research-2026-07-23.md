# Payments Deep Research — Cards + Crypto + ISO/Processor Paths (BoostUp lane)
**Date:** 2026-07-23 · **Owner:** Max · **Method:** 4-agent swarm (OSS card infra / crypto+fiat / non-Stripe APIs+PayFac / ISO-agent-MSP landscape), ~130 sources, repos gh-verified, licenses read from LICENSE files.
**Visual deliverable:** https://claude.ai/code/artifact/cb980970-caa7-40f0-aad9-60a1bb3b731d
**Raw evidence:** `docs/research/agents/2026-07-23-payments-slice{1,2,3,4}-*.md`
**Related:** `payment-processing-candidates.md` (displaced-rep recruiting for The Network — the sales-talent side of the same play).

## Six shifts since ~2023 (the returning-operator briefing)
1. **GENIUS Act (2025-07-18)** — federal stablecoin framework; stablecoins ≠ securities; may relieve state MTL burden.
2. **Card networks settle in stablecoins** — Visa US USDC (Dec 2025), Mastercard (Jun 2026). USDC, not BTC, is the practical crypto answer. Coinbase Commerce dead (2026-03-31).
3. **Hyperswitch** — 43,347★ Apache-2.0 self-hostable payment orchestrator, 148 connectors + OSS PCI vault. The ownable software layer; never replaces sponsor-bank rails (FFIEC).
4. **Dual pricing legal in all 50 states**, surcharging in ~48 — the #1 SMB agent pitch (2–3x residuals). NMI bought Fee Navigator (AI statement audits = productized PVP).
5. **Agentic commerce standards landed 2025** — Mastercard Agent Pay, Visa Intelligent Commerce/TAP, Google AP2. Chatbot payments becoming first-class (AIVA-relevant).
6. **Consolidation** — GP+Worldpay ($24.3B, closed Jan 2026), Shift4+Global Blue, Nuvei+Payoneer pending; Block cut ~10% incl. Square field sales → displaced reps + orphaned merchants (Network thesis).

## Recommendations by use case
- **Chatbot checkout (AIVA), today:** Square (API payment links `square.link/u/…` built for SMS/chat; BTC auto-enabled w/ USD settlement, 0 fees through 2026). Runner-up Helcim (in-widget HelcimPay.js, cheapest IC+). Forward bet: x402 (Apache-2.0, TS) for agentic USDC.
- **Invoice payments:** Helcim ACH (0.5% capped $6 — $5K invoice = $6) on the CRM's hosted invoice page; Square Invoices #2; PayPal ACH (capped $5) #3. Braintree Drop-in SDK unsupported as of Jul 2026 — avoid new builds.
- **Crypto accept → USD:** BitPay (licensed incumbent, 1–2%) or OpenNode (1% BTC auto-USD; shutdown rumors unfounded); Strike for clean BTC API. OSS truth: BTCPay (MIT, 7,666★) is self-custody; **no OSS converts to fiat — conversion always requires a regulated counterparty** (BTCPay's own FAQ).
- **BoostUp processor play:** start as **independent agent on 2 Schedule A's ($0)** → **registered retail ISO ~$20–30k/yr** when sub-agent count justifies → registered PayFac only in the ~$10–100M/yr band (~$50M rule of thumb per the [Finix review](https://www.business-money.com/announcements/finix-review-is-this-payfac-a-good-stripe-alternative/); use PFaaS first: Rainforest/Moov/Finix/Tilled). Crypto rails to build on: **Zero Hash** (licenses in 51 jurisdictions; powers Stripe/Shift4). Tech layer to own later: Hyperswitch + moov-io.
- **First 3 calls:** 1) **Maverick Payments** (white-label + APIs, free unlimited sub-agent hierarchy, in-house high-risk UW — negotiate splits, confirm crypto-6051 appetite) 2) **SignaPay** (up to 90%, ISO intake expanding Nov 2025, PayLo dual pricing = door-opener that pairs with AI-voice outbound) 3) **Shift4** (only one-stop cards+crypto toggle — treat as product line, not umbrella; partner-contract history).

## Agent-contract non-negotiables (from slice 4)
Lifetime vested residuals · no production minimums clawing residuals · portfolio sale rights · sub-agent Schedule A rights.

## Confidence flags
Advertised splits ≠ contractual (Schedule A is truth) · "Central Bank of St. Louis" as sponsor bank unverifiable (stale) · Block layoff totals verified to ~10% only · Radom/Sphere pricing from 3rd-party comparisons · 2Accept sponsor list secondary-source · MC specialty (high-risk) registration doubled to $1,000/merchant + per-txn fees June 2026 · National Processing partner page unreachable — verify company status.

## Identity note
This is **BoostUp Payments** work (rob@boostuppayments.com lane). Per standing rule: never mix with aivoicetech.io outbound/tooling; AIVA checkout integration is a product feature of AI VoiceTech that would *consume* whichever processor BoostUp lands — keep the corporate/email identities separate.
