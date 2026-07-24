# Payments Deep Research — Slice 1: GitHub OSS Card-Payment Infrastructure
**Run:** 2026-07-23 · 4-agent swarm for Rob (BoostUp Payments) · all repo numbers live via `gh api`, licenses from LICENSE files
**Feeds:** docs/research/payments-deep-research-2026-07-23.md

## Threshold answer: can OSS get card acceptance WITHOUT a processor relationship?
**No.** Card networks require every merchant to be sponsored by an acquiring bank that is a network member ([FFIEC Merchant Acquiring handbook](https://ithandbook.ffiec.gov/it-booklets/retail-payment-systems/retail-payment-systems-risk-management/retail-payment-instrument-specific-risk-management-controls/merchant-acquiring)). ISOs/PayFacs need [sponsor banks](https://www.digitaltransactions.net/for-isos-and-other-acquirers-picking-a-sponsor-bank-entails-understanding-banks/) / [BIN sponsorship](https://stripe.com/resources/more/bin-sponsorship-explained-how-it-works-and-who-needs-it). Every OSS tool is software in front of/on top of that relationship; none IS one.

## TL;DR
- **Pick for all three use cases: juspay/hyperswitch** — Apache-2.0, 43,347★, 148 connector integrations counted in-repo, pushed daily, v1.125.0 (2026-07-10). THE thing that happened since 2023.
- **Runner-up for "start a processor": Moov** — moov-io OSS libs (Apache-2.0) + Moov the company is a [US-licensed acquiring processor on all four networks](https://moov.io/platform/accept/).
- **Avoid:** anything claiming "self-hosted gateway = no processor needed"; moov-io/paygate (archived 2021); aviabird/gringotts (last release 2018).

## Verified table

| Tool | Stars | Pushed | Release | License | Lang | Gives you | Does NOT give you |
|---|---|---|---|---|---|---|---|
| juspay/hyperswitch | 43,347 | 2026-07-23 | v1.125.0 | Apache-2.0 | Rust | Orchestration, routing, retries, vault, checkout SDK | Merchant account; PCI when self-hosted |
| killbill/killbill | 5,629 | 2026-07-21 | 0.24.19 | Apache-2.0 | Java | Subscription billing/invoicing, payment-plugin bus | Gateway/acquirer; modern UI |
| invoiceninja/invoiceninja | 9,898 | 2026-07-21 | active | **Elastic 2.0** (not OSI) | PHP | Self-hosted invoicing w/ pay-online via many gateways | OSS license; a processor |
| getlago/lago | 10,239 | 2026-07-23 | active | AGPL-3.0 | Ruby | Usage metering/billing | Card processing; permissive license |
| thephpleague/omnipay | 6,057 | 2026-07-10 | v3.2.1 (2021) | MIT | PHP | Multi-gateway abstraction | Merchant account; not TS |
| activemerchant/active_merchant | 4,596 | 2025-11-04 | v1.137.0 | MIT | Ruby | Same pattern | Slowing |
| Payum/Payum | 1,924 | 2026-02-11 | 1.7.7 | MIT | PHP | Same pattern | — |
| moov-io/ach | 554 | 2026-07-21 | v1.61.3 | Apache-2.0 | Go | ACH file tooling | Cards |
| moov-io/iso8583 | 525 | 2026-07-16 | v0.26.0 | Apache-2.0 | Go | Card-network message marshaling | Network connection |
| moov-io/watchman | 480 | 2026-07-23 | v0.65.0 | Apache-2.0 | Go | OFAC/AML screening | — |
| jpos/jPOS | 711 | 2026-07-21 | — | **AGPL-3.0 (dual)** | Java | ISO-8583 transaction switch (real processor building block) | Permissive license; membership |
| interledger/rafiki | 354 | 2026-07-18 | v2.4.5 | Apache-2.0 | TS | Interledger wallet node | Card rails |
| interledger/open-payments | 539 | 2026-07-22 | 7.1.1 | Apache-2.0 | TS | Web-payments protocol | Adoption is early |
| aviabird/gringotts | 501 | 2025-04-18 | v1.1.0 (2018) | MIT | Elixir | DISQUALIFIED — dormant 8 yrs | |
| moov-io/paygate | 132 | archived 2021 | — | Apache-2.0 | Go | DISQUALIFIED — archived | |

## Hyperswitch detail
- 148 connectors counted in `crates/hyperswitch_connectors/src/connectors`: Adyen, Authorize.net, Braintree, Checkout.com, Cybersource, Elavon, Fiserv, Global Payments, Helcim, JPMorgan, Moneris, NMI, Nuvei, PayPal, Rapyd, Shift4, Square, Stax, TSYS, Wells Fargo, Worldpay + more (Stripe is just one connector among many).
- Companions: juspay/hyperswitch-web (checkout SDK, 119★, v0.132.0) + juspay/hyperswitch-card-vault "Tartarus" (PCI vault, Rust, Apache-2.0, 61★, v0.8.0, pushed 2026-07-23) — the only real OSS card vault; Basis Theory/VGS/Token.io are SaaS with SDK-only repos.
- Self-host: Docker/Helm/K8s + [one-click AWS](https://docs.hyperswitch.io/self-hosting/hyperswitch-open-source/deploy-hyperswitch-on-aws/deploy-on-aws-using-cloudformation). Self-hosting shifts PCI scope to you ([their docs](https://docs.hyperswitch.io/integration-guide/workflows/vault/deployment-models/self-hosted-and-in-house-pci)).
- Community: [HN open-core tension thread](https://news.ycombinator.com/item?id=36942447) — code is genuinely Apache-2.0; paid tier is hosted. Bus factor = one funded company (Juspay).

## Kill Bill detail
[435-point HN thread](https://news.ycombinator.com/item?id=33263603) confirms production use inside Square; ex-Groupon founders; criticisms: Java heft, dated Kaui admin UI.

## Ranked per use case
**(a) AIVA chatbot checkout:** 1. Hyperswitch + hyperswitch-web (only OSS drop-in checkout) 2. Direct gateway hosted-fields (Authorize.net/NMI) 3. Kill Bill only if subscriptions. Field is thin — it's Hyperswitch or hand-rolling.
**(b) Invoices:** 1. Invoice Ninja self-hosted (ELv2 fine for internal use) 2. Kill Bill 3. Lago (AGPL flag).
**(c) Start a processor:** 1. Hyperswitch (the software moat, free) 2. moov-io libs + acquiring partnership (Moov/[Visa-Pathward partnership](https://finance.yahoo.com/news/future-modern-payments-processing-moov-161500313.html)) 3. jPOS / moov-io/iso8583 (year-3 problem).

## Also-rans
Primer (not OSS — SDKs only), OpenPPS (doesn't exist), Polar (polarsource/polar 10,077★ Apache but built ON Stripe), BTCPay (crypto-only — slice 2), Saleor/Medusa (commerce platforms), Spreedly (SaaS).

**Key deltas since ~2023:** Hyperswitch appeared and became de-facto OSS orchestrator; Moov became a licensed four-network acquirer; vault market consolidated as SaaS; FedNow spawned an ISO-20022 OSS ecosystem (svapnil/iso20022.js MIT 389★) — pay-by-bank is the anti-interchange angle.
