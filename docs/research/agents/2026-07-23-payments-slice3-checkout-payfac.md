# Payments Deep Research — Slice 3: Non-Stripe Checkout APIs + PayFac-as-a-Service
**Run:** 2026-07-23 · 4-agent swarm for Rob (BoostUp Payments) · SDK repos gh-verified, pricing/URLs cited
**Feeds:** docs/research/payments-deep-research-2026-07-23.md

## Developer-first processors

**Square** — Checkout API `POST /v2/online-checkout/payment-links` returns SMS-friendly `square.link/u/{id}` short URLs, explicitly built for SMS/chat ([API ref](https://developer.squareup.com/reference/square/checkout-api/create-payment-link), [payment links](https://squareup.com/us/en/payment-links)). Web Payments SDK for in-page fields. TS SDK active ([square/square-nodejs-sdk](https://github.com/square/square-nodejs-sdk), 115★, pushed 2026-07-14). Pricing flat: online 2.9%+30¢, keyed 3.5%+15¢, instant transfer 1.95% ([Swipesum](https://www.swipesum.com/insights/square-fees-explained-understanding-your-payment-costs)). **Crypto: auto-enabled Bitcoin/Lightning for eligible US sellers from 2026-03-30, USD settlement default, zero BTC fees through 2026** ([Square press](https://squareup.com/us/en/press/block-to-roll-out-bitcoin-payments-on-square), [CoinDesk](https://www.coindesk.com/business/2026/03/30/jack-dorsey-s-square-auto-enables-bitcoin-payments-for-millions-of-u-s-businesses)). Invoices API w/ hosted pay page (API can't set SMS delivery — dashboard/paid plans only; [Invoices API](https://developer.squareup.com/docs/invoices-api/overview), [pricing](https://squareup.com/us/en/invoices/pricing)). Better: instant onboarding, SMS-native links, free invoicing. Worse: flat-rate cost at volume, lock-in.

**Braintree/PayPal** — ⚠️ **Drop-in SDK deprecated 2025-07-14, unsupported 2026-07-14 (this month)** — don't start new builds on it ([docs](https://developer.paypal.com/braintree/docs/start/drop-in)). 2.59%+49¢ cards; Venmo 3.49%+49¢; **ACH 0.75% capped $5** ([Merchant Insiders](https://merchantinsiders.com/blogs/braintree-fees/)). Repos: braintree_node 332★ active; new [PayPal-TypeScript-Server-SDK](https://github.com/paypal/PayPal-TypeScript-Server-SDK) 51★. PayPal Invoicing free/hosted. Better: consumer trust, capped ACH. Worse: SDK churn, two-brand confusion.

**Adyen** — Pay by Link `POST /paymentLinks`, any delivery channel, but **since 2025-11-01 links can't be iframed** (redirect/new tab only) ([docs](https://docs.adyen.com/unified-commerce/pay-by-link/create-payment-links/api)). IC++ ~0.60%+13¢ markup but **~€1k/mo minimum** ([pricing](https://www.adyen.com/pricing), [MCC review](https://merchantcostconsulting.com/lower-credit-card-processing-fees/adyen-review/)). US SMB fit: poor. Node SDK 136★ daily pushes.

**Checkout.com** — Flow drop-in + Payment Links ([product](https://www.checkout.com/products/payment-links)); **June 2026 stablecoin acceptance (USDC/USDT) via Coinbase Payments, USD settlement** ([Finopotamus](https://www.finopotamus.com/post/checkout-com-enables-stablecoin-acceptance-for-merchants-in-partnership-with-coinbase)). Enterprise-gated. sdk-node 67★ pushed 2026-07-23. US SMB fit: poor.

**Helcim** — HelcimPay.js embedded modal ([docs](https://devdocs.helcim.com/docs/overview-of-helcimpayjs)), hosted pages, **Payment Requests by text/email** ([how-to](https://learn.helcim.com/docs/how-to-send-payment-requests)). IC+ tiers: online IC+0.50%+25¢ (<$50K/mo) → IC+0.15%+15¢; **ACH 0.5%+25¢ capped $6**; $0/mo ([pricing](https://www.helcim.com/pricing/)). Free invoicing w/ hosted pay page ([docs](https://learn.helcim.com/docs/process-a-payment-with-helcim-invoices)). **No official SDKs** — write a thin client. Better: cheapest total cost, transparent. Worse: thin dev ecosystem, weaker link automation.

**Stax** — $99–199+/mo subscription + IC passthrough ([NerdWallet](https://www.nerdwallet.com/business/software/reviews/stax-payments)); only pencils >$5K/mo volume. Skip today.

**National Processing** — $9.95/mo + IC+ bundles, rides Authorize.net ([CreditDonkey](https://www.creditdonkey.com/national-processing-review.html)). Classic low-cost merchant account only.

**Authorize.net** — $25/mo + 2.9%+30¢; Accept Hosted form ([docs](https://developer.authorize.net/api/reference/features/accept-hosted.html)); free invoicing; **no self-serve link builder** ([Shuttle](https://www.shuttleglobal.com/blog/payment-links-for-authorize-net/)). sdk-node 86★ sleepy. Legacy; use only if bundled.

## Chat-commerce ranking (AIVA)
1. **Square** (purpose-built short links, instant onboarding, free)
2. **Helcim** (in-widget HelcimPay.js + cheapest rates; DIY client)
3. **Finix** (best link API of platform tier — [links](https://finix.com/payment-links); only if converging with platform play)
4. PayPal (trust; clunky link API)
5. Adyen/Checkout.com (clean APIs, enterprise-gated; Adyen iframe ban)
6. Authorize.net/NMI (links bolted on)
Pattern: bot → backend → create-link API → link as chat bubble (new tab). True in-widget entry: HelcimPay.js or Square Web Payments SDK.

## PayFac-as-a-Service ("be the payments company")
ISO = refer merchants, own residuals, no liability. Registered PayFac = master merchant account, instant sub-merchant onboarding, YOU own risk — ~$150K+ and 6–12 months ([Fiska](https://fiska.com/blog/why-you-shouldnt-become-a-payfac/), [Checkout.com](https://www.checkout.com/blog/payfac-vs-iso)). PFaaS = PayFac experience, provider holds registration/liability, you keep 66–90% of margin ([Tilled pricing](https://www.tilled.com/pricing)). Rule of thumb: PFaaS below ~$50M/yr; registered PayFac above ([Finix review](https://www.business-money.com/announcements/finix-review-is-this-payfac-a-good-stripe-alternative/)). ⚠️ Correction (critic-rob 2026-07-23): the Nexio URL cited elsewhere for this threshold is dead (404) and Nexio's actual guidance was a $10M–$100M band — the ~$50M rule of thumb is properly attributed to the Finix review above.

| Platform | Get | Economics | For | Sources |
|---|---|---|---|---|
| Tilled | white-label PFaaS, dev-first | rev share 66%+; ~7bps+5¢+$6/merchant/mo; sweet spot $25M–2B/yr | ISVs | [pricing](https://www.tilled.com/pricing) |
| Finix | PFaaS → graduate to own PayFac | IC+ ~15¢ or 2.75%+30¢; Starter ~$250/mo | platforms | [Fiska](https://fiska.com/blog/finix-pricing/) |
| Rainforest | embedded payments for **vertical SaaS**, white-glove | not published; $29M Series B Sept 2025 | Rob's exact archetype | [BusinessWire](https://www.businesswire.com/news/home/20250908143729/en/) |
| Payrix (Worldpay for Platforms) | pioneer PFaaS | sales-led | mid/large ISVs | [platforms.worldpay.com](https://platforms.worldpay.com/) |
| Payabli | Pay In+Out+Ops single API; $28M Series B Jun 2025 | not published | software cos w/ payables (subcontractors!) | [news](https://www.payabli.com/news/payabli-lands-28m-series-b-to-accelerate-payments-infrastructure-for-software-companies/) |
| Preczn | orchestration layer over providers (not a PayFac) | early | vertical SaaS multi-processor | [about](https://www.preczn.com/about) |
| Moov | licensed processor; **published pricing**: IC+0.60%+15¢ cards, same-day ACH 40¢, RTP/push-to-card 0.95%; **$500/mo min**; payment links + invoices (25¢) | lowest credible entry | technical builders | [pricing](https://moov.io/pricing/) |

SDK verification: gettilled/tilled-node (pushed 2026-07-21), payabli/sdk-node+python (2026-07-20), finix-payments/finix-python active, moov-io strongest OSS citizen. Rainforest: no public SDKs (JS components). Tilled/Payabli repos ~2–3★ — young ecosystems.
**Blunt:** all PFaaS minimums premature at Rob's current scale except Moov ($500/mo) / Finix Starter ($250/mo). Rainforest = the one to court when roofing SaaS has real merchant count.

## Gateways for ISO/agent play
- **NMI**: dominant white-label gateway — $440B+/yr, 5.8B txns, 6,000+ partners, 1.2M+ merchants; Francisco Partners-owned; **acquired Fee Navigator June 2026 (AI statement analysis — an ISO sales weapon)** ([BusinessWire](https://www.businesswire.com/news/home/20260602447713/en/NMI-Acquires-Fee-Navigator-Adding-AI-Powered-Pricing-Intelligence-to-Its-Embedded-Payments-Platform)). Reseller-set pricing; merchants ~$10–30/mo+~10–13¢/txn; white-label ~$39–79/merchant/mo ([Capterra](https://www.capterra.com/p/10022250/Payment-Gateway/)). No public SDKs.
- **Fluidpay: NOT acquired** — independent, partner-only, Level-1 PCI, white-label + surcharging, CIOReview gateway-of-the-year 2024 & 2026 ([fluidpay.com](https://www.fluidpay.com/), [white-label](https://www.fluidpay.com/products/private-label-payment-gateway)). Vs NMI: cheaper, no channel conflict; NMI: scale + ecosystem + AI pricing.

## Since ~2022 briefing
1. Instant payouts table stakes (Visa Direct/MC Send ≤30min, ~1%; [Runa](https://runa.io/blog/visa-direct/)).
2. FedNow real but receive-heavy (~1,400 FIs, 75M txns 2025); TCH RTP dominates (~1.5M/day, ~$500B/quarter, 75% of DDAs) ([PYMNTS](https://www.pymnts.com/real-time-payments/2026/real-time-payments-reach-a-turning-point-in-north-america/)).
3. **Surcharging/dual-pricing = #1 SMB ISO pitch**: surcharge legal ~48 states (CT/MA/ME/PR banned; Visa 3% cap); **dual pricing legal in all 50**; >60% SMB adoption per late-2025 data ([IntelliPay](https://intellipay.com/passing-card-fees-to-customers-in-2026-surcharging-dual-pricing-and-convenience-fees-explained/), [ProTech state-by-state](https://protechpayments.com/credit-card-surcharge-laws-by-state/)).
4. Crypto mainstream-rails: Square BTC auto-enable, Checkout.com+Coinbase USDC, GENIUS Act, ~$390B stablecoin payment volume 2025.
5. **Agentic commerce protocols landed**: Mastercard Agent Pay (2025-04-29), Visa Intelligent Commerce (2025-04-30) + Trusted Agent Protocol (2025-10-14), Google AP2 (2025-09-16, 60+ partners) ([comparison](https://appliedtechnologyindex.com/research/2026-comparative-analysis-agentic-commerce-payment-protocols/), [AP2](https://eco.com/support/en/articles/15192002-ap2-protocol-explained-google-s-agentic-commerce-standard-2026)) — chatbot-initiated payments are becoming a standardized category. Directly relevant to AIVA.

## Ranked per use case
**(a) Chatbot checkout:** 1. Square 2. Helcim 3. Finix
**(b) Invoices:** 1. Helcim (ACH capped $6 — $5K invoice costs $6 vs ~$145 card) 2. Square Invoices 3. PayPal (ACH capped $5)
**(c) Platform to build on:** 1. Rainforest (vertical SaaS, court at merchant scale) 2. Moov ($500/mo entry, published pricing) 3. Tilled (66%+ share, later-stage). Finix honorable mention (graduate path).
