# Payments Deep Research — Slice 4: ISO/Agent/MSP Landscape 2025–26
**Run:** 2026-07-23 · 4-agent swarm for Rob (BoostUp Payments) · all claims sourced; unverified flagged
**Feeds:** docs/research/payments-deep-research-2026-07-23.md

## Decision tree: agent → ISO → PayFac

| Model | Upfront | Ongoing | Liability | Residual portability | Split |
|---|---|---|---|---|---|
| Referral partner | $0 | $0 | none | commissions only | ~10–25% |
| Independent agent (under an ISO's registration) | $0 | $0 | none | contract-dependent — demand lifetime vested residuals, no minimums | **50–70%** (some 80–100% headline w/ buy-rate padding) |
| Registered retail ISO | Visa **$10k yr 1, $5k/yr after**; MC ~similar — per brand per sponsor | ~$10k/yr both brands + compliance | sales only | own brand, saleable portfolio | 70–90% |
| Wholesale ISO | registrations + BIN sponsorship + risk staff; ~$250k+ capital | sponsor fees, risk ops | **shares credit/fraud losses + fines** | full; sets sub-agent Schedule A | ~90%+ |
| Registered PayFac | **$500k–$2M+, 6–12+ mo**; $10k/network; $200–500k/yr compliance | high | owns ALL sub-merchant risk | owns everything | full spread |
| PFaaS (Tilled/Finix/…) | ~$0 | rev share | provider holds | platform-dependent | 70–80% |

Sources: [Rianda Law ISO registration](https://www.riandalaw.com/articles/so-you-want-to-register-as-an-iso/) · [Heartland how-to-ISO](https://www.heartland.us/resources/blog/how-to-become-a-registered-iso) · [Visa TPA FAQ PDF](https://usa.visa.com/dam/VCOM/download/merchants/tpa-registration-program-faqs.pdf) · splits: [Unison 2026](https://www.unisonpayment.com/blog/merchant-services-agent-program-residual-income), [CCSalesPro](https://www.ccsalespro.com/blog/much-residual-can-make-selling-merchant-services-merchant-services-sales-commission) · retail/wholesale: [CardConnect](https://www.cardconnect.com/launchpointe/agent-resources/payfac-vs-iso/), [GETTRX](https://www.gettrx.com/differences-between-isos-and-payfacs/) · PayFac costs: [Nexio](https://blog.nex.io/vertical-saas/the-economics-of-payment-facilitator-registration/), [Rainforest hidden costs](https://www.rainforestpay.com/blog/hidden-costs-of-becoming-a-payfac) · [Celero when-to-PayFac 6/2026](https://celerocommerce.com/2026/06/become-a-payfac/)
PFaaS eats the ISV-referral leg; for a feet-on-street rep network the ISO/agent lane remains the right chassis (PFaaS doesn't pay street residuals).
High-risk fee shift: Visa VIRP $950/yr (from $500, Apr 2024); **MC specialty registration doubled to $1,000/merchant May 2026 + $0.02/txn + 0.10% from June 2026** ([PaymentCloud](https://paymentcloudinc.com/blog/visa-raises-high-risk-registration-fee-what-to-know/), [Brookside](https://brooksidepayments.com/specialty-merchant-registration/)).

## Program table (actively recruiting; tech grade = judgment from portal/API/white-label evidence)

| # | Program | Type | Split (public) | Tech | Niche | URL / evidence |
|---|---|---|---|---|---|---|
| 1 | **Maverick Payments** | FSP/white-label for agents+ISOs | custom Schedule A | **A** — white-label dashboard, onboarding API, FREE unlimited sub-agent mgmt, sub-ISO onboarding | high-risk, in-house UW, multi-bank | [isos-and-agents](https://maverickpayments.com/isos-and-agents) · [Green Sheet lander](https://maverickpayments.com/partner-greensheet) · [DT coverage](https://www.digitaltransactions.net/powering-the-next-generation-of-payment-monetization-maverick-payments-empowers-isvs-with-a-white-labeled-payment-stack/) |
| 2 | **SignaPay (PayLo)** | ISO/agent, dual-pricing flagship | **up to 90%**; portfolio loans/buyouts; "3x residuals" on PayLo | B+ — CRM+gateway, EmpowerU training | dual pricing "50-state", high-risk | [partners](https://signapay.com/partners/) · [Nov 2025 ISO expansion](https://signapay.com/blog/signapay-expands-iso-program-ahead-of-2026-opening-doors-for-new-partners-seeking-a-true-growth-partnership/) |
| 3 | **Payroc** | wholesale ISO/agent aggregator | up to **80% of true residual profit** | B+ — gateway, portal, RewardPay surcharge | broad; surcharging | [sales-partners-agent](https://payroc.com/industries/sales-partners-agent/) · [Agent Opportunity Center](https://partners.payroc.com/agentopportunity) |
| 4 | **North** (fka NAB) | agent + registered-ISO tracks | not published; Peak Bonus; residuals 15th | B — partner portal, own processor (EPX) | SMB volume; Edge cash-discount | [partners.north.com](https://partners.north.com/) · [agent-conduct complaints noted](https://www.cardpaymentoptions.com/credit-card-processors/north-american-bancard-complaints-review-and-rating/) |
| 5 | **PaymentCloud** | high-risk specialist | not published | B | CBD, supplements, **crypto-adjacent**; 98% approval, multi-bank | [partners](https://paymentcloudinc.com/partners/) |
| 6 | **Electronic Payments (EPI)** | ISO/agent | lifetime residuals; $500M+ paid since 2000 | B — ProCharge dual pricing, free Exatouch POS | dual pricing, restaurant/retail | [program](https://electronicpayments.com/partner-programs/iso-agent-programs/) |
| 7 | **EMS** | ISO/agent | **daily residual payouts** | B− — MyPortfolio | generalist | [landing](https://www.emscorporate.com/agent-interest-landing) |
| 8 | **Priority (PRTH)** | ISO/agent via MX | commission engine in MX Connect | **A−** — MX Connect boarding/UW/commissions, VIMAS | scale ISO infra; B2B/ACH.com | [iso-services](https://prioritycommerce.com/iso-services/) · [MX POS reseller launch](https://prioritycommerce.com/news/priority-announces-mx-pos-reseller-program/) · take-private chatter unverified |
| 9 | **Clearent by Xplor** | agent + referral | not published | B+ — 2025 automated onboarding | ISVs, FIs, SMB | [page](https://clearent.com/financial-institutions/) · [onboarding launch](https://ffnews.com/newsarticle/paytech/clearent-by-xplor-launches-new-and-improved-automated-onboarding-solution-for-a-better-merchant-enrollment-experience-and-faster-account-set-up/) — naming in flux (Xplor Pay) |
| 10 | **Celero Commerce** | independent agent/ISO | same/next-day commission funding | B — in-house UW, weekly training | bank-channel; **"build your own sales team"** | [page](https://celerocommerce.com/independent-agents-isos/) |
| 11 | **Shift4** | POS reseller/ISO-style | "industry-leading residuals + upfront" | A− product / **C partner autonomy** ([partner-hostile history](https://reformingretail.com/index.php/2022/02/24/in-less-than-two-weeks-shift4-sends-second-lopsided-partner-communication/)) | restaurant/hospitality; **native Pay-with-Crypto (BTC/ETH/SOL/USDC→USD)** | [reseller](https://www.shift4.com/become-a-pos-reseller) · [crypto launch](https://www.shift4.com/news/shift4-unveils-global-crypto-payment-capabilities) |
| 12 | **Fiserv/CardConnect (Clover)** | agent & ISO (First Data legacy) | not published | B+ — CoPilot, Clover ecosystem | Clover distribution | [sales-partners](https://www.cardconnect.com/sales-partners/) |
| 13 | **Global Payments (Genius)** | ISO/agent | not published | B+ — Genius POS flagship | largest pure-play acquirer post-Worldpay | [ISO page](https://www.globalpayments.com/partners/independent-sales-organizations) |
| 14 | **Nuvei** | ISO/agent | [ISO playbook PDF](https://info.nuvei.com/hubfs/White_papers_and_reports/ISO%20Playbook.pdf) | A− — APIs, AI Integration Agent (Oct 2025) | eCom/intl/high-risk; **40 cryptos + stablecoin on/off-ramp** | [partnerships](https://www.nuvei.com/offers/isv-and-iso-partnerships) · [Integration Agent](https://fintech.global/2025/10/01/nuvei-unveils-integration-agent-to-accelerate-merchant-onboarding/) |
| 15 | National Processing | agent/affiliate | affiliate ≤10% | C+ | low-cost SMB | [agent portal](https://agent.nationalprocessing.com/) — main partner page unreachable; **verify status** |

Honorables: [Payzli (real-time residuals)](https://payzli.com/independent-sales-agents/), [Paysafe](https://www.paysafe.com/us-en/partners/isos-and-agents/), [Beacon (sub-agent playbooks)](https://www.beaconpayments.com/blog/how-to-recruit-sub-agents-and-build-your-iso-network), [Merchants Bancard "up to 100% lifetime"](https://merchantsbancard.com/merchant-services-agent-program/), 2Accept (high-risk; sponsor list from [secondary source](https://paycompass.com/blog/best-high-risk-merchant-account-providers/) — verify).

## Crypto-friendly lanes
- **Shift4** — best one-relationship cards+crypto toggle (Zero Hash-powered; per-merchant Pay-with-Crypto).
- **Nuvei** — 40 coins + fiat ramps + formal ISO program ([crypto page](https://www.nuvei.com/solutions/crypto-digital-assets)).
- **BVNK: Mastercard acquiring it for ~$1.8B** ([American Banker](https://www.americanbanker.com/payments/news/mastercard-boosts-agentic-commerce-adds-crypto-network)) — independent path likely shifting. Zero Hash powers Stripe/IBKR/Shift4/Franklin Templeton.
- Boarding crypto BUSINESSES (MCC 6051): PaymentCloud (crypto-adjacent), 2Accept (claims, verify), Maverick appetite **unverified — ask**. June-2026 MC fee hikes tax this niche.
- Mastercard Agent Pay for Machines (June 2026) pulls Coinbase/Stripe/BVNK/GP into agentic-stablecoin ([press](https://www.mastercard.com/us/en/news-and-trends/press/2026/june/mastercard-launches-agent-pay-for-machines.html)).

## Surcharging/dual-pricing
Why hottest pitch: flips sale to "delete the fee line"; agents earn 2–3x residuals (SignaPay claims). Programs: PayLo, EPI ProCharge, North Edge, Payroc RewardPay. Legal: bans enforced CT/MA/ME/PR; CA SB478 drip-pricing angle; CO 2%, IL 1% + (Jul 2026) no interchange on tax/tip; Visa cap ~3%; debit never surchargeable; CA/TX bans struck down federally → murky. **Dual pricing legal all 50** — the compliant workhorse ([MCC state guide](https://merchantcostconsulting.com/lower-credit-card-processing-fees/credit-card-surcharge-laws-by-state/), [SignaPay 2026 explainer](https://www.signapayse.com/post/surcharge-cash-discount-or-dual-pricing-which-is-actually-legal-in-2026)).

## Ranked paths to a processing company
1. **Agent under 1–2 ISOs (now, $0)** — contract non-negotiables: lifetime vested residuals, no production minimums, portfolio sale rights, sub-agent Schedule A rights.
2. **Registered retail ISO (~$20–30k/yr all-in)** — own brand, sub-agents under your paper. Natural home for the Network model.
3. **Wholesale ISO ($250k+, risk staff, sponsor bank)** — sponsors active 2025–26: [Esquire Bank](https://esquirebank.com/merchant-services/independent-sales-organization/), Merrick Bank, [Commercial Bank of California](https://cbcal.com/acquiring-partners/), [Pathward](https://www.pathward.com/banking/acquiring-solutions/), [Prosperity Bank](https://www.prosperitybankusa.com/iso-sponsorship/). **"Central Bank of St. Louis" could NOT be verified — treat stale.** Market: <100 banks collect ~$200M/yr sponsoring 1,000+ nonbank acquirers ([Flagship](https://flagshipadvisorypartners.com/insights/u-s-acquiring-bin-sponsorship-to-sponsor-or-not-to-sponsor/)).
4. **Registered PayFac** — only above ~$50M/yr; use PFaaS first.
5. **Acquirer/bank** — never.

Market structure: GP closed $24.3B Worldpay Jan 2026 ([American Banker](https://www.americanbanker.com/payments/news/global-payments-closes-worldpay-purchase-issuer-sale-to-fis)); Shift4 bought Global Blue $2.7B + Smartpay; Nuvei (Advent-private) acquiring Payoneer $2.75B (closes mid-2027) ([press](https://www.nuvei.com/posts/nuvei-to-acquire-payoneer-for-2-75-billion-creating-a-leading-global-platform-for-local-and-cross-border-commerce)). Consolidation = displaced reps + orphaned merchants = Rob's recruiting thesis.

## Sub-agent hierarchy fit (the Network model)
Block Feb 2026 layoffs hit Square field sales/onboarding (~10% ≈1,100 verified via [Payments Dive](https://www.paymentsdive.com/news/block-to-chop-up-to-10-of-employees/811703/)/[PYMNTS](https://www.pymnts.com/digital-payments/2026/block-planning-layoffs-of-up-to-10-of-its-workforce/); larger "40%/4,000" figures only in secondary aggregators — treat unverified). Programs explicitly supporting roll-ups: **Maverick** (free unlimited sub-agents, sub-ISO onboarding), **SignaPay** (90% + portfolio financing + EmpowerU), **Priority MX Connect** (hierarchy commissions at scale), **Celero** ("build your own sales team"), **North** (registered-ISO track).

## First-3-calls recommendation
1. **Maverick Payments** — built for Rob's shape: real APIs + white-label to wrap AI tooling around, free unlimited sub-agent hierarchy, in-house high-risk UW. Negotiate splits hard; confirm crypto-6051 appetite.
2. **SignaPay** — actively expanding ISO intake now, up to 90%, portfolio financing, PayLo dual pricing = strongest SMB door-opener; pairs with AI-voice outbound.
3. **Shift4** — only one-stop cards+crypto toggle w/ first-class POS; use as a PRODUCT LINE, not the umbrella (partner-agreement history).
Runners-up: Nuvei (eCom/intl/crypto book), Payroc (safe wholesale umbrella), PaymentCloud (high-risk overflow).
**Structure: start as agent on 2 Schedule A's (Maverick + SignaPay), route crypto merchants via Shift4/Nuvei, register retail ISO (~$20–30k/yr) when sub-agent count justifies the brand.**
