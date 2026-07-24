# Payments Deep Research — Slice 2: Crypto Acceptance + Crypto→Fiat
**Run:** 2026-07-23 · 4-agent swarm for Rob (BoostUp Payments) · repos gh-verified, all claims sourced
**Feeds:** docs/research/payments-deep-research-2026-07-23.md

## Plain answers
**Lowest-friction US path to "accept crypto, get USD in bank":** custodial processor with auto-fiat settlement — [OpenNode](https://opennode.com/) (1% flat, [auto-USD](https://help.opennode.com/en/articles/3703687-automatic-conversion-to-usd), BTC/Lightning, US bank required; shutdown rumors UNFOUNDED) or [BitPay](https://developer.bitpay.com/docs/settlement) (2%/1.5%/1% + 25¢ tiered, next-day ACH, $20 min — the licensed incumbent). All-in ~1–2%.

**Is there OSS that converts crypto→fiat itself? No — structurally cannot exist.** Conversion needs a regulated counterparty with fiat rails. [BTCPay FAQ](https://docs.btcpayserver.org/FAQ/General/) says fiat conversion only via plugins that hand BTC to an exchange ([Kraken custodian plugin, v1.9.0](https://blog.btcpayserver.org/btcpay-server-1-9-0/); origin thread [issue #112](https://github.com/btcpayserver/btcpayserver/issues/112)).

## OSS table (gh-verified 2026-07-23)

| Repo | Stars | Pushed | License | Fiat story |
|---|---|---|---|---|
| btcpayserver/btcpayserver | 7,666 | 2026-07-23 | MIT | None native; self-custody; Kraken plugin sells on exchange; [Strike integration](https://strike.me/blog/btcpay-server-integrates-strike-api-to-power-bitcoin-payments/) |
| lnbits/lnbits | 1,219 | 2026-07-23 | MIT | None — Lightning account layer (v1.5.6) |
| x402-foundation/x402 | 6,387 | 2026-07-23 | Apache-2.0 | Protocol only — USDC over HTTP-402; facilitator settles USDC not USD. The interesting new thing for agentic/chatbot payments |
| RequestNetwork/requestNetwork | 386 | 2026-07-21 | MIT | Onchain invoicing protocol; fiat via commercial Request Finance; [top Commerce-migration path](https://request.network/coinbase-commerce-alternative/) |
| coinbase/onchainkit | 1,045 | 2026-01-31 (stalling) | MIT | React checkout components for Base |
| SatSale/SatSale | 256 | 2026-06-02 | MIT | Self-custody only; solo-maintainer fragile |
| solana-foundation/pay | 1,739 | 2026-07-23 | MIT | **Repurposed** — old solana-labs/solana-pay merchant SDK effectively sunset; repo now agentic-payments CLI (x402/MPP/AP2) |
| heliofi/heliopay | 15 | 2026-07-10 | **NONE** | Not OSS — [MoonPay bought Helio $175M Jan 2025](https://www.coindesk.com/business/2025/01/13/moon-pay-buys-crypto-payment-processor-helio-for-175-m) |
| coinbase/commerce-onchain-payment-protocol | 204 | 2024-08-20 (dead) | Apache-2.0 | Contracts behind shuttered Commerce |

**BTCPay Server is the only serious self-hosted option** (v2.4.0 2026-06-25, org-backed, MIT). It is self-custody by design — no "settles USD to your bank" mode exists.

## Commercial processors with fiat settlement

| Processor | Fee | USD settlement | US? | Notes |
|---|---|---|---|---|
| [BitPay](https://developer.bitpay.com/docs/settlement) | 2/1.5/1% + 25¢ | daily ACH | ✅ licensed | Safe incumbent ([fees](https://paybis.com/blog/bitpay-pricing-fees-breakdown/)) |
| [OpenNode](https://opennode.com/) | 1% flat | auto-convert at txn | ✅ (US-only feature) | BTC/Lightning only; alive & active |
| [Strike](https://strike.me/business/) | ~1% spread ([FAQ](https://strike.me/faq/what-fees-and-rates-apply-to-bitcoin-transactions/)) | hold/settle USD | ✅ | Clean [API](https://docs.strike.me/walkthrough/receiving-payments/); BTC only |
| Coinbase Business | see [blog](https://www.coinbase.com/blog/introducing-a-powerful-suite-of-business-payment-tools-on-coinbase-business) | USDC auto-settle; USD off-ramp managed | US+SG | **Commerce shut down 2026-03-31** ([migration](https://help.coinbase.com/en/migrating-to-the-onchain-payment-protocol)) |
| [Confirmo](https://confirmo.com/product/payouts) | 0.8%/0.5% | USD/EUR/CZK | EU-based | [review](https://0xprocessing.com/blog/confirmo-payment-gateway-review/) |
| [CoinGate](https://coingate.com/pricing) | 1% | USD via intl wire (friction) | EU/MiCA | — |
| [TripleA](https://www.triple-a.io/blog/best-crypto-payment-gateways) | 0.8% | 160+ countries | SG MAS | cross-border |
| [Radom](https://www.radom.com/pricing) | from 0.5% | instant off-ramp | ✅ | modern API, invoicing (pricing from 3rd-party — verify at contract) |
| [Sphere Pay](https://spherepay.co/) | 0.5% + 5¢ | stablecoin-native, ACH/wire | ✅ | newest ([eco.com 2026](https://eco.com/support/en/articles/15083177-best-crypto-payment-gateways-2026)) |
| [NOWPayments](https://nowpayments.io/off-ramp) | 0.5–1% + partner | via 3rd party, KYB | ⚠️ St. Vincent, no US licensing ([review](https://coingape.com/nowpayments-review/)) | caution for US entity |

## What Rob missed since 2023
1. **GENIUS Act signed 2025-07-18** — first federal stablecoin law: permitted issuers, 1:1 reserves, stablecoins ≠ securities ([WilmerHale](https://www.wilmerhale.com/en/insights/client-alerts/20250718-what-the-genius-act-means-for-payment-stablecoin-issuers-banks-and-custodians), [OCC rulemaking](https://www.occ.gov/news-issuances/bulletins/2026/bulletin-2026-3.html), [KPMG](https://www.kpmg.com/us/en/articles/2025/stablecoins.html)); may [reduce state MTL reliance](https://www.klgates.com/The-GENIUS-Act-and-Stablecoins-Could-This-Replace-State-Money-Transmitter-Licensing-10-6-2025).
2. **Visa launched US USDC settlement 2025-12-16** ($3.5B annualized, Cross River + Lead Bank, Solana rails) ([Visa IR](https://investor.visa.com/news/news-details/2025/Visa-Launches-Stablecoin-Settlement-in-the-United-States-Marking-a-Breakthrough-for-Stablecoin-Integration/default.aspx)); **Mastercard 2026-06-03** (USDC, PYUSD, USDG, RLUSD) ([Cointelegraph](https://cointelegraph.com/news/mastercard-stablecoin-settlement-usdc-pyusd-rlusd)).
3. PayPal PYUSD in 70 markets; ~$8.2B cross-border stablecoin volume Q1 2026.
4. Stripe bought Bridge ($1.1B, closed Feb 2025); Bridge conditional federal charter Feb 2026; Stripe+Advent $53B PayPal bid pending ([Spark](https://www.spark.money/research/stripe-bridge-acquisition-stablecoin-payments)).
5. **Bottom line: stablecoins (USDC), not BTC, are the practical crypto-acceptance answer now.**

## Off-ramp rails for a processor-builder
- **[Zero Hash](https://zerohash.com/)** — FinCEN MSB + MT licenses in 51 US jurisdictions ([help center](https://zerohash.zendesk.com/hc/en-us/articles/6642372273171-Who-is-zerohash)); powers Stripe, MoneyLion, DraftKings, MoonPay ([Sacra](https://sacra.com/c/zero-hash/)). The standard "ride their licenses" answer.
- **[BVNK](https://www.bvnk.com/)** — UK/EU EMI + 25+ US MTLs ([vs Bridge vs Zero Hash deep dive](https://www.finextra.com/blogposting/29034/deep-dive-bvnk-vs-bridge-vs-zero-hash---stablecoin-payment-infrastructure)).
- **Bridge (Stripe)** — best DX, Stripe-ecosystem priority post-acquisition.
- **[Kraken Embed](https://www.kraken.com/institutions/embed)** (Apr 2025) — crypto-as-a-service for banks/fintechs ([BusinessWire](https://www.businesswire.com/news/home/20250429878133/en/)).
- Reality: small players don't get direct bank sponsorship for crypto settlement — build on Zero Hash/BVNK/Bridge or partner banks (Cross River/Lead Bank).

## Ranked per use case
**Chatbot checkout:** 1. Strike (BTC) or Radom (stablecoin) 2. x402 (TS-native agentic; USDC-to-wallet, pair with off-ramp) 3. BitPay hosted.
**Invoices:** 1. BitPay 2. Request Network/Finance 3. BTCPay + Kraken plugin (BTC-only tolerable).
**Processor building block:** 1. Zero Hash 2. BVNK 3. BTCPay (MIT chassis) + Zero Hash/Kraken Embed as regulated conversion layer.
**Avoid:** NOWPayments (US entity), anything on Coinbase Commerce (dead 2026-03-31), Solana Pay merchant SDK (repurposed), Helio SDKs as "OSS" (no license).

Confidence flags: Sphere/Radom pricing from 3rd-party comparisons; CoinGate USD-by-wire friction; Stripe-PayPal bid pending not closed.
