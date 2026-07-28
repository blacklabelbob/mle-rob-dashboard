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

### 🔴 3a. OTC:APGP financials — CHECKLIST LINE CLOSED (Max, 2026-07-25)

Item 2 of the five above is now answered, and the answer is worse than "thin disclosure." **There are no
SEC financials to pull, because the issuer is not an SEC reporting company — and the payments business is
a 13-month-old repositioning of a 1990 oil-and-gas shell.**

| Verified fact | Source |
|---|---|
| Name changed **Osyka Corporation → AmpliPay Group, Inc. effective 2025-06-12**, with a **1-for-500 reverse stock split** + minimum-share adjustment (approved by stockholders Jan 2025) | [OTC Markets financial report viewer, APGP](https://www.otcmarkets.com/financialReportViewer?symbol=APGP&id=506506) |
| The name change explicitly "reflects the Company's strategic repositioning **from natural resource development to financial technology and global payment solutions**" | same |
| Predecessor filings are captioned "**OSYKA CORPORATION** A Nevada Corporation"; current ones "**AMPLIPAY GROUP INC.** A Nevada Corporation" | [OTC Markets company financial report](https://www.otcmarkets.com/file/company/financial-report/449536/content) |
| Still profiled by data vendors as an **oil & gas** company (Houston TX, founded 1990, sector Energy) — the fintech identity has not propagated to the security's own classification | [Simply Wall St OTCPK:APGP](https://simplywall.st/stocks/us/energy/otc-apgp/amplipay-group) · [stockanalysis.com APGP](https://stockanalysis.com/quote/otc/APGP/company/) |
| **Market cap ≈ US$82,190** on ~1.33m shares outstanding (post-split) | [Simply Wall St OTCPK:APGP](https://simplywall.st/stocks/us/energy/otc-apgp/amplipay-group) |
| Net income ≈ **−$127k** in each of the two most recent reported quarters | [TradingView OTC:APGP](https://www.tradingview.com/symbols/OTC-APGP/) |
| Ticker still resolves under the pre-change stub **OSKAD** at some vendors | [Yahoo Finance OSKAD](https://finance.yahoo.com/quote/OSKAD/) |
| **Not an SEC reporting company.** EDGAR's only "Osyka" registrant (CIK 0001084486, `OSYKA Corp`, formerly `RX TECHNOLOGY HOLDINGS INC` to 2008-03-04) filed **Form 15-15D on 2008-03-04**, terminating its reporting duty. Its last financial statements on EDGAR are the **10-QSB for the quarter ended 2000-09-30**; the only filing in the 18 years since is a single 8-K (2019-02-07). | EDGAR submissions API, CIK 0001084486 (pulled 2026-07-25) |

**One honest caveat, not smoothed over:** the EDGAR registrant carries a Mandeville, LA mailing address and
SIC 7330 (mailing/reproduction/commercial art), which does **not** match the Houston/oil-and-gas profile the
data vendors show. It is the *only* Osyka registrant on EDGAR, so the linkage is probable — but treat
"CIK 0001084486 is this company" as **unconfirmed** until Amplipay states its own CIK (or confirms it has
none). The conclusion does not depend on it either way: **no vendor and no filing index surfaces audited SEC
financials for this issuer**, which is the thing that mattered.

**What this changes.** The §1 non-negotiables are all *contractual promises about a residual stream that
outlives the relationship* — lifetime vested residuals, portfolio sale rights, no clawing minimums. Those
promises are worth exactly the balance sheet standing behind them. Here that balance sheet is (a) not
audited by anyone the SEC supervises, (b) attached to a corporate vehicle whose payments business is ~13
months old, and (c) carried at a market capitalization **smaller than a single mid-size merchant portfolio**.
An ~$82k-cap counterparty cannot credibly guarantee a lifetime residual.

**Concretely, for the booking (which stays — this is call agenda, not a rejection):**
1. Ask directly: **is Amplipay an SEC reporting company, and what is its CIK?** If the answer is no, then
   ask what disclosure *is* published and where (OTC alternative reporting tier, audited or not).
2. Ask what the operating payments business actually was **before June 2025** — was it acquired into the
   shell, and from whom? A 1990 oil-and-gas registrant did not organically become a PCI DSS L1 processor.
3. The **sponsor bank question (item 1) is now the single highest-value question on the agenda**, not item 1
   of 5. Re-searched this run and it is nowhere public. If Rob's residuals are contractually owed by an
   $82k-cap issuer, the sponsor bank is the only party in the chain with real capital — so *whose paper the
   residual is actually on* decides whether any of this is bankable.
4. Item 3 (residual survivability on partner failure) escalates from prudent to **essential**, and the answer
   belongs in the contract, not on the call.

**Not concluded:** this does not resolve whether Amplipay is a real operating processor — a small public
vehicle can sit on top of a genuine business. It resolves that **the public record cannot tell us**, which is
itself the finding, and it means every remaining Amplipay fact has to come from the company in writing.

---

## 🔴 3b. Shift4 — partner-contract history flag: CHECKLIST LINE CLOSED (Max, 2026-07-25)

The 7/23 swarm named Shift4 a top-3 first call but attached an unclosed caveat — *"treat as a product
line, not umbrella; **partner-contract history**."* That flag is now investigated and closed. **The
history is real, documented, and it collides head-on with three of Rob's four non-negotiables.**

### The record

| Date | Event | Source |
|---|---|---|
| 2018-04-24 | **Payment Logistics v. Shift4 Payments / Shift4 Corp / Lighthouse Network** — antitrust suit, S.D. Cal., No. 3:18-cv-00786-L-AGS. Alleged that after Lighthouse acquired Shift4, defendants stopped supporting independent payment interfaces, forcing restaurants onto Shift4's proprietary interface or "debilitating monthly and transaction costs," and that the merger let them "unilaterally increase pricing" and cut competitors out of the channel. Sought an injunction against the acquisition. Outcome not stated in the source. | [Mogin Law LLP](https://moginlawllp.com/payment-logistics-files-antitrust-lawsuit-shift4-payments-shift4-corp-lighthouse-network/) |
| 2022-02 (two comms in <2 weeks) | **Shift4 unilaterally discontinued ancillary-fee residual streams to channel partners effective 2022-04-01** — Authorize.net, Crosscheck, Tableside, TabbedOut, Association Rate, Assessments, UBC Gateway, Monthly Service, NABU, Non-Acquiring Gateway, HT Online Ordering — replacing an ongoing stream with a **one-time buyout** pitched as "a substantial premium over your typical monthly Ancillary Fee residual payment." | [Reforming Retail](https://reformingretail.com/index.php/2022/02/24/in-less-than-two-weeks-shift4-sends-second-lopsided-partner-communication/) |
| 2022-02 (same comms) | The buyout carried a **10-year non-compete/non-solicit**: partner may not solicit merchants Shift4 acquired, may not advise merchants when Shift4 contracts expire, may not refer them to competing processors, may not contact previously-referred merchants — for a decade. Reforming Retail called it *"the longest we've literally ever heard of,"* against an industry norm of **16–42 months**. Acceptance mechanics were left ambiguous (did cashing the lump sum bind you?). | same |
| 2022-06 | Shift4 entered a **$3.6M residual commission buyout** with distribution partner Tiffany Caramico — a related party. | Shift4 SEC filings (see below) |
| 2020–2022 | Shift4 SEC filings describe residual buyouts as insourcing distribution: it **acquired the residual-commission obligations of "over a hundred" partners**, buying "ongoing merchant relationships and **non-solicitation rights**." | [Shift4 DEF 14A FY2025](https://www.sec.gov/Archives/edgar/data/1794669/000119312525105572/d859431ddef14a.htm) · [10-Q FY2024](https://www.sec.gov/Archives/edgar/data/1794669/000179466924000016/four-20240331.htm) |
| 2025-01 | **SEC settled enforcement action** — Shift4 violated §13(a) and §14(a) / Item 404(a) Reg S-K by failing to disclose related-person transactions: a sibling of an executive officer/director paid **$1.1M in compensation 2020–2022**, and another sibling paid **over $1M in "residual commissions while acting as an independent sales agent"** in the same period. Neither appeared in the 10-Ks or proxies. **$750,000 civil penalty**, settled without admitting or denying. | [Dodd-Frank.com / SEC settlement](https://www.dodd-frank.com/2025/01/sec-settles-charges-against-shift4-after-failing-to-disclose-related-person-transactions/) |

### Scored against Rob's four non-negotiables

| # | Non-negotiable | Shift4 verdict |
|---|---|---|
| 1 | **Lifetime vested residuals** | ❌ **Contradicted by conduct.** A residual stream that the counterparty can discontinue by memo — twice inside two weeks, effective in ~5 weeks — is not vested in any operative sense, whatever the contract's caption says. The buyout is *evidence of the power*, not a cure for it. |
| 2 | No production minimums that claw | ⚠️ **Unknown** — the public Authorized Partner Program T&Cs PDF is served but blocks automated fetch (HTTP 403, both the [Authorized Partner](https://www.shift4.com/pdf/Authorized-Partner-Program-Terms-and-Conditions.pdf) and [SkyTab Partner](https://www.shift4.com/pdf/Authorized-SkyTab-Partner-Program-Terms-and-Conditions.pdf) documents). Needs a human download. |
| 3 | **Portfolio sale rights** | ❌ **Structurally hostile.** Shift4's documented strategy is to *be* the buyer of partner portfolios and to bolt a 10-year non-solicit onto the sale. A partner who takes the buyout cannot rebuild the book they sold; a partner who declines has watched the stream be cancelled anyway. |
| 4 | Sub-agent Schedule A rights | ⚠️ **Unknown** — same 403 blocker. |

### What this changes

- **Shift4 is not disqualified; it is repriced.** The one-stop cards+crypto property that put it in the
  top 3 is unchanged. What changes is that Shift4 must be treated as a **product line you resell**, not a
  **residual counterparty you retire on** — which is precisely the 7/23 note ("product line, not umbrella"),
  now with evidence under it.
- **This directly informs Q61 recommendation (1) — the rung.** It is an argument *for* the $0 independent
  agent start on multiple Schedule A's: concentration risk on any single processor's residual stream is the
  exact failure mode the record above documents.
- **Symmetry check with Amplipay (§3a):** the two candidates fail counterparty durability from opposite
  ends — Amplipay may lack the *balance sheet* to honour a lifetime residual, Shift4 has the balance sheet
  and a documented history of *choosing not to*. Neither is a reason to stop; both are reasons the
  Schedule A, not the pitch, is the deciding document.
- **Still open for Shift4:** the actual Schedule A / Authorized Partner T&Cs (403-blocked to automated
  retrieval — Rob or a browser session must pull the PDF), which is the only thing that can close
  non-negotiables 2 and 4.

**House limit honoured:** nothing signed, no processor committed, no money field moved.

---

## 🔴 3c. Amplipay — merchant count / processing volume: CHECKLIST LINE CLOSED (Max, 2026-07-25)

Item 4 of the five in §3 ("actual merchant count / processing volume — verifiable, third-party, not
self-reported"). **Answer: there is no merchant count to verify — not a low one, none at all.** No
third-party figure exists, and the company's own corporate site publishes its scale as literal zeros.

| Verified fact | Source |
|---|---|
| The corporate site's own metrics band renders **"0+ World Active User", "0+ Customers", "0% Satisfaction"** — unpopulated template placeholders standing where a scale claim belongs | [amplipaygroup.com](https://amplipaygroup.com/) (fetched 2026-07-25) |
| A **second, separate domain** exists alongside the `amplipay.ai` site used for §3 — `amplipaygroup.com` — with the `.ai` site listed only as the support-email domain (`support@amplipay.ai`). Two front doors, one company, no shared numbers | [amplipaygroup.com](https://amplipaygroup.com/) |
| The operating substance appears to sit in a named brand/subsidiary: **eDataPay** (Boca Raton — same city as Amplipay per §3) | [amplipaygroup.com](https://amplipaygroup.com/) "Our Brands" |
| eDataPay is a **high-risk / hard-to-place merchant specialist** ("high-risk, high-volume, and hard-to-place merchants", US + international acquiring), running its own ISO/reseller program | [edatapay.com](https://edatapay.com/), [edatapay.com/partners](https://edatapay.com/partners/) |
| eDataPay claims **"over 18 years of experience"** but publishes **no merchant count, no founding year, no processing volume, and names no acquiring or sponsor bank** — only a "broad U.S. and international banking network" | [edatapay.com/about](https://edatapay.com/about/) (fetched 2026-07-25) |
| eDataPay markets a joint dispute-management product **"with AmpliPay Group tools"** (Visa/Mastercard/Verifi/Ethoca) — an independent corroboration that the two are operationally linked, and the only one found | [edatapay.com](https://edatapay.com/) |
| The ticker also surfaces as **OSKAD** on a market-data vendor — the temporary D-suffix symbol used after a name change / reverse split, independently corroborating §3a's 2025-06-12 Osyka→AmpliPay event | [marketscreener.com](https://www.marketscreener.com/quote/stock/AMPLIPAY-GROUP-INC-120793168/) |

### Refinement of §3a — one claim there was too broad

§3a said there are "no financials to pull." That is exactly right **for SEC filings** and stands. But this
run surfaced **two OTC Markets disclosure-report documents for APGP** (report ids `484380` and `506506`) —
so the issuer *does* appear to file under OTC's **alternative reporting** standard, which is not SEC
reporting and is not audited to the same bar, but is not nothing. **Their contents are unread**: OTC
Markets was returning a site-wide *"Temporarily Unavailable"* page for the whole session (verified by
direct request, not an access block on us). Recorded as a **retry**, not a finding — no number from those
documents is quoted or implied anywhere in this tracker. Next driver run should re-attempt both URLs.

### What this changes

- **The merchant-count line closes as a negative, and that is itself the finding.** Every other candidate
  in the 7/23 field can be sized from public data. This one cannot be sized at all — the residual counter-
  party's book is invisible from outside, and after §3a the balance sheet behind it is ~$82k.
- **The high-risk profile is a new, unasked-for fact and it cuts both ways.** High-risk acquiring carries
  the fattest agent splits in the industry — which is plausibly what makes Amplipay attractive — and also
  the highest attrition, chargeback exposure, and reserve/clawback risk. It is materially different from
  the roofing/title SMB book Rob would actually be bundling. **Non-negotiable #2 (no production minimums
  that claw) is a different question against a high-risk portfolio than a standard one**, and must be
  asked that way.
- **Two new call-agenda items** (joining the three from §3a): (1) *how many live merchants and what monthly
  processed volume, in writing?* (2) *what is the relationship between AmpliPay Group Inc. and eDataPay —
  ownership, acquisition, or brand licence — and which entity would counter-sign the Schedule A?* That
  second one is now as load-bearing as the sponsor-bank question: if eDataPay is the operator and AmpliPay
  the listed shell, **the entity on the residual paper decides whether the residual is worth anything.**

**NOT a disqualification.** A privately-held book being invisible to search is normal; a *public* issuer's
book being invisible while its own site reads "0 Customers" is a question, and Rob's 7/24 booking is the
right place to ask it. Everything in this section is public-record only — **nothing here reflects the
OpenRouter/ChatGPT criteria Max still cannot read.**

**House limit honoured:** nothing signed, no processor committed, no money field moved.

---

## 🟠 3d. Maverick + SignaPay — the MERITS half of the "rejected or never surfaced?" line (Max, 2026-07-25)

**What this section does and does not close.** The checklist line reads *"were Maverick and SignaPay
rejected on merits, or never surfaced?"* — the **rejected-vs-never-surfaced** half is answerable only by
Rob (his OpenRouter room and ChatGPT conversation remain unreadable to Max: session-scoped / HTTP 403,
re-verified 7/25). What Max can do without him — and did here — is **pre-answer the merits half**, so that
whichever one-word answer Rob gives, the line resolves the same run instead of starting a fresh DD.
Nothing below infers what those transcripts said.

### Maverick Payments (7/23 pick #1)

| Non-negotiable | Public evidence | Verdict |
|---|---|---|
| 1. Lifetime **vested** residuals | Nothing published — the ISO/agent page markets *portfolio and residual **tracking*** (dashboards), never residual **ownership** | ⚠️ UNKNOWN — contract-only |
| 2. No production minimums | Nothing published | ⚠️ UNKNOWN — contract-only |
| 3. Portfolio sale rights | Nothing published | ⚠️ UNKNOWN — contract-only |
| 4. Sub-agent Schedule A rights | *"free unlimited downstream sub-agent management"* / sub-ISO onboarding, sub-agents and resellers free of charge | 🟡 **Marketing-supported only** — the 7/23 claim survives contact with the public record, but a dashboard feature is not a contractual right |

Sources: [Maverick ISOs & Agents](https://maverickpayments.com/isos-and-agents) ·
[Maverick partner lander](https://maverickpayments.com/partner-greensheet).

**The adverse finding is merchant-side, not agent-side — and it still matters.**
[BBB complaints, Maverick Payments (Calabasas CA)](https://www.bbb.org/us/ca/calabasas/profile/payment-processing-services/maverick-payments-1216-437050/complaints):
**23 complaints in 3 years, 9 closed in the last 12 months**, and the dominant theme is **held settlement
funds / reserves and abrupt account closures** — verbatim from complainants: *"held $23,357.45 of my
merchant reserve funds despite no chargebacks, no refunds, no fraud"*; *"closed my merchant account
today…without any warning or clear reason and is holding $3,600"*; one alleges Maverick used *"their own
mishandling of a single fraudulent chargeback to justify seizing 100% of our revenue indefinitely"*, and
states *"I have now joined other merchants in a joint lawsuit against Maverick"* (that suit is a
complainant's assertion on a BBB page — **not independently verified, and it is not cited here as
established fact**).

**Why merchant conduct lands on an agent decision:** a residual is a claim on a **living merchant**. An
acquirer that freezes reserves and closes accounts is churning the exact book the agent gets paid on — and
under Rob's model those merchants would be **his own roofing/title customers**, arriving through MLE.
Reputational blast radius runs backwards into the P1 business in a way it never does for a pure agent play.
This is the same shape as the §3c note about eDataPay's high-risk book: **fat splits and volatile merchants
are the same trade.**

### SignaPay (7/23 pick #2)

| Non-negotiable | Public evidence | Verdict |
|---|---|---|
| 1. Lifetime vested residuals | *"residual splits up to 90%"* — a **rate**, never a **vesting** claim | ⚠️ UNKNOWN — contract-only |
| 2. No production minimums | Nothing published | ⚠️ UNKNOWN — contract-only |
| 3. Portfolio sale rights | *"flexible payouts, loans, and **portfolio buyouts**"* | ⚠️ **UNKNOWN, and note the substitution** — a buyout SignaPay offers is *SignaPay as the buyer*; non-negotiable #3 is the right to sell **to a third party**. Shift4's §3b record is what that substitution looks like when it goes wrong |
| 4. Sub-agent Schedule A rights | Nothing published | ⚠️ UNKNOWN — contract-only |

Sources: [SignaPay ISO program expansion, 2025-11-10/12](https://signapay.com/blog/signapay-expands-iso-program-ahead-of-2026-opening-doors-for-new-partners-seeking-a-true-growth-partnership/) ·
[same release, PR Newswire](https://www.prnewswire.com/news-releases/signapay-expands-iso-program-ahead-of-2026--opening-doors-for-new-partners-seeking-a-true-growth-partnership-302609009.html).

**Counterparty record — thin, old, and two items worth carrying to a call.**
[BBB, SignaPay (Irving TX)](https://www.bbb.org/us/tx/irving/profile/credit-card-processing-services/signapay-0875-90041862/complaints):
**3 complaints, 2 negative reviews** — materially quieter than Maverick's 23. One alleges escrowed funds
were transferred to a third party that then went bankrupt (SignaPay's answer: records show a check was
sent); one alleges **a salesperson signed an equipment lease in the merchant's name** (SignaPay's answer:
sold by a third party, not them). Separately, **Nov 2015 Priority Payment Systems of Georgia v. SignaPay**
alleged misappropriation of merchant-management-system data — inter-ISO, 11 years old, **not agent-facing**,
and carried here only so it isn't "discovered" later.
The equipment-lease allegation is the one that scales: **if Rob runs sub-agents, third-party lease
misconduct is the classic way an agent's own portfolio and licence get contaminated** — so non-negotiable #4
must be asked as *"what are my liabilities for a sub-agent's conduct?"*, not only *"can I have sub-agents?"*

### What this changes

1. **Four candidates diligenced, four times the same answer: the public record cannot settle a single one
   of the four non-negotiables.** Amplipay (§3a/§3c) can't be sized at all; Shift4 (§3b) is settled *against*
   two of them by conduct; Maverick and SignaPay publish **nothing** on any of them. This is now an
   evidence-backed pattern, not an impression, and it is the strongest affirmative argument yet for
   **Q61 rec (1): start as a $0 independent agent on *multiple* Schedule A's** — the only rung where being
   unable to verify the counterparty in advance is survivable.
2. **Neither candidate is disqualified.** Maverick's free unlimited sub-agent hierarchy — the property that
   won it pick #1 — survives the check; SignaPay's 90% and its dual-pricing PayLo door-opener are intact.
   Both now carry a **named** question to put on a call rather than a vibe.
3. **The call agenda gains one question that applies to every candidate:** *what happens to my residual when
   YOU terminate the merchant?* Maverick's BBB record is what makes it concrete.
4. **New human-browser-pull line** (same bucket as Shift4's 403'd T&C PDFs): cardpaymentoptions.com's
   SignaPay review returns **HTTP 403** to automated fetch — the agent-side detail there is unread and
   nothing from it is quoted.

**Still Rob-only, unchanged:** whether he ever saw these two. The merits are now on the record either way.

**House limit honoured:** nothing signed, no processor committed, no money field moved.

---

## 🟠 3e. Amplipay / eDataPay — the SPONSOR BANK question: public record exhausted (Max, 2026-07-25)

§3a promoted this to **the top question on the call** for a specific reason: if the residual is owed by an
~$82k-market-cap issuer, the **sponsor bank is the only capitalized party in the chain**, so whose paper the
residual actually sits on decides whether it is bankable. This run was the public-record pass. It is now
exhausted, and the answer is a **documented negative with a compliance edge**.

### What was checked, and what it says

| Property | Sponsor / acquiring / member bank named? | What it says instead |
|---|---|---|
| `amplipay.ai` (incl. footer) | ❌ none | Footer is only *"© 2026 AmpliPay Group Inc. (OTC: APGP). All rights reserved."*; body references *"Visa & Mastercard Direct"* and *"acquiring networks"* — no institution named. Self-asserted *"PCI DSS L1 Certified"*, *"KYC / KYB Verified"* (self-descriptions, not third-party designations) |
| `amplipaygroup.com` | ❌ none | The §3c placeholder site (*"0+ Customers"*) |
| `edatapay.com/about/` | ❌ none | *"a broad U.S. and international banking network"* — plural, generic, unnamed; *"over 18 years of experience"* |
| `edatapay.com/partners/` (the ISO/agent recruiting page) | ❌ none | *"Profitable Reseller & Affiliate Program"*, *"White Labeled Agent marketing and Gateways Tools"*, a *"Bonus program"* |
| `edatapay.com/banking-partnerships-and-lucrative-residual-commissions/` — the page whose **title** is banking partnerships + residuals | ❌ none | *"Residual income means you earn money every time a transaction is made"* — and nothing about ownership, duration, portability, or assignability |
| Web search, targeted (`sponsor bank` / `acquiring bank` / `member bank` / `registered ISO of`) | ❌ none | Returns only generic glossary pages plus eDataPay's own self-description as *"ISO/MSP USA"*, a *"Bankcard ISO in Boca Raton, FL"*, and *"an independent sales agent for US and International Bank Card acquirer"* (singular, unnamed) |

### The new fact — it is not just that the bank isn't named

Visa and Mastercard **require** an ISO/MSP to display the disclosure *"[Company] is a registered ISO/MSP of
[Bank], [City], [State]"* on its website and marketing material; industry references put the penalty for a
missing/non-visible disclosure at **up to $25,000**. Across five properties of a company that calls itself a
*"Bankcard ISO"*, **that mandated disclosure does not appear anywhere** — no bank, no city, no state.
Sources: [PaymentCloud, ISO/MSP explainer](https://paymentcloudinc.com/blog/iso-msp/) ·
[eDataPay about](https://edatapay.com/about/) · [eDataPay partners](https://edatapay.com/partners/) ·
[eDataPay banking-partnerships/residuals](https://edatapay.com/banking-partnerships-and-lucrative-residual-commissions/) ·
[amplipay.ai](https://amplipay.ai/) · [amplipaygroup.com](https://amplipaygroup.com/)

**Stated precisely, because the distinction matters:** absence from marketing pages does **not** prove there
is no sponsor bank — a real merchant application or agreement would carry it, and that document is exactly
what Rob does not have yet. What *is* established: (a) the bank cannot be learned from the public record, and
(b) the disclosure that the card brands require to be public **is missing**, which is itself a
compliance-posture signal on the counterparty, not a neutral gap.

### Entity sprawl — compounding §3c's "who counter-signs?"

The same operation presents across at least five domains — `amplipay.ai`, `amplipaygroup.com`,
`edatapay.com`, `edatapay.net` (*"eDatapay Financial Group"*), `edatabankcard.com` — plus a LinkedIn page
registered as **"eData Financial Systems Inc."** An eData-affiliated FAQ domain surfaced in search
(`panamapayments.net`) **no longer resolves at all** (DNS `ENOTFOUND`, verified this run). §3c already asked
*which entity counter-signs the Schedule A*; five live brands and one dead domain make that question
load-bearing rather than administrative.

### What this changes

1. **The line does not close — it converts.** It moves from *"re-searched, nowhere public"* to
   **"not obtainable from the public record; answerable only in writing by the company"**, which is the form
   it needs to be in for the 8/4 DD deadline: a Rob/company-blocked line with the search work banked, not an
   open line nobody worked.
2. **It becomes a call gate, not a call question.** Recommended framing for the 7/28 chase: *name the
   sponsor bank and the acquiring BIN in writing, and send the ISO/MSP disclosure language you publish* —
   no Schedule A review is worth doing before that is answered, because the four non-negotiables are all
   claims against whoever's paper the residual sits on.
3. **The 4-for-4 pattern from §3d now holds on the bank too — 5-for-5 on the counterparty.** Four candidates
   settle none of the four non-negotiables publicly; the one candidate Rob has a booking with will not name
   its bank publicly either. Same conclusion, harder: **Q61 rec (1) $0 independent agent across multiple
   Schedule A's** is the only rung where an unverifiable counterparty is survivable.
4. **No new adverse claim about eDataPay's legitimacy is asserted here.** It is a real, findable operating
   business with an 18-year claim; what is documented is what it does and does not publish.

**House limit honoured:** nothing signed, no processor committed, no money field moved.

---

## 🔴 3f. The SWITCHING-COST MECHANIC — named, and it contradicts the rung recommendation (Max, 2026-07-25)

This closes §5's *"Switching-cost mechanic specified: what concretely makes a merchant unable to leave once
processing is bundled?"* — the line §6 calls **the question nobody has asked**, and it is half of Rob's own
stated rationale (*"serve Both as a revenue stream and increase switching costs"*). It is answered here from
banked evidence rather than left for Q61, because the answer changes what Q61 rec (1) can honestly claim.

### The mechanic exists and is measurable — but it is NOT payments

The industry evidence says stickiness comes from the **software the payment flows through**, never from the
processing itself:

| Evidence | Figure | Source |
|---|---|---|
| Verticalized vs. horizontal acquirers, 5 European markets (Visa) | **+19pp** payment-volume growth, **5% less** merchant attrition | [Visa VCA verticalization whitepaper](https://www.visa.co.uk/content/dam/VCOM/regional/ve/unitedkingdom/PDF/vca/uk-vca-verticalization-whitepaper.pdf) |
| Embedded-payment SaaS platforms vs. traditional payment providers (BCG × Adyen, 2025) | **2.5×** customer retention | [BCG, *Moving Embedded Finance From Promise to Practice*](https://www.bcg.com/publications/2025/moving-embedded-finance-from-promise-practice) |
| Embedded vs. standalone merchant retention, 2026 industry report | *"2x to 4x higher retention rates due to increased switching friction and deeper integration into daily workflows"*; embedded platforms *"90%+ retention"* | [Clearly Payments, merchant churn by vertical 2026](https://www.clearlypayments.com/blog/what-merchant-churn-looks-like-by-vertical-2026-industry-report/) |
| Baseline churn in **Rob's own verticals** | contractors / home services **15–30%/yr** (3–6 yr life); property management **8–12%/yr** (7–12 yr life); legal & accounting **5–10%/yr** | [Clearly Payments (same)](https://www.clearlypayments.com/blog/what-merchant-churn-looks-like-by-vertical-2026-industry-report/) |
| Payments attach when the platform sells payments alone | *"often remain below 20%"* | [Apideck, embedded finance for vertical SaaS](https://www.apideck.com/blog/embedded-finance-vertical-saas) |

**Explicitly NOT used:** a widely-repeated *"merchants using 3+ software layers have 5% annual churn vs 18%
for payment-only"* / *"40% lower churn"* pair surfaced in search and traces to a vendor blog whose own text
carries **no attribution** for those numbers (its cited sources — TSG, Nilson, McKinsey — are listed at the
foot but tied to no specific claim). Not quoted, not banked. The four rows above are kept because each names
a traceable originator.

### The four candidate mechanics for MLE/AIVA, ranked by whether they actually bind

1. ✅ **The AI agent transacts.** AIDRE takes the deposit on the call; AIVA closes the booking with a card in
   the chat. The deliverable Rob sells is *a booked-and-paid job*, not *a call answered* — and that outcome is
   inseparable from the rail the agent charges on. A roofer cannot keep "the receptionist that collects the
   deposit" and move processing; the agent breaks. **This is the strongest mechanic and it is unique to Rob's
   stack** — it is not available to an ordinary ISO, and it is why the payments question is even interesting.
2. ✅ **The second brain becomes the revenue system-of-record.** If quotes, invoices, deposits and
   paid/unpaid state originate in the Blueprint (Q40) and reconcile there, leaving processing forfeits
   reconciliation history and forces re-onboarding. Real, medium-strength, and already half-built.
3. ⚠️ **Data-derived money products** (instant payout, working capital priced off processing history). The
   strongest lock-in in the industry (the Toast/Shopify mechanic) and **out of reach** — it needs capital,
   underwriting, and the PayFac-band volume the 7/23 research put at ~$10–100M.
4. ❌ **Dual pricing / surcharge configuration is NOT a switching cost — it is the opposite.** It is the
   door-opener reps use to *win* accounts off incumbents (§1). It is symmetric: whatever it lets Rob take, it
   lets the next agent take back. Counting it as lock-in would be counting the attack as the armour.

### The finding that matters for 8/8 — rung (1) and switching cost are in direct conflict

Every mechanic above requires that **Rob's software can program the payment rail** — issue the charge, hold
the state, read the history. That is the PayFac-as-a-Service posture (Rainforest / Moov / Finix / Tilled).

At the **$0 independent-agent rung** — the 7/23 recommendation, and the rung §3b–§3e have been *hardening*
because it is the only one that survives an unverifiable counterparty — Rob **refers** the merchant to
someone else's rail. He earns a residual and adds **zero** switching cost. Nothing integrates; the merchant
can move processing next week and keep every MLE deliverable intact.

**So the honest statement of Rob's own thesis is that it splits in two, and the two halves sit on different
rungs:**

- **Revenue half** — available immediately, at $0, at rung 1. Real, small, uncontroversial.
- **Switching-cost half** — **unavailable at rung 1 by construction.** It requires PFaaS and the engineering
  to make the AI agent transact. It is a Phase-2+ build, not a signature.

This is not an argument against the add-on. It is the argument that **Q61 rec (1) must be stated as
"$0 agent NOW for the revenue, with the switching-cost mechanic named as a later, separate, engineering
decision"** — rather than presenting one rung as delivering both of Rob's stated goals, which it cannot.

### What this changes

1. §5's switching-cost line **CLOSES with a named mechanic** (mechanic #1, the transacting agent) rather than
   remaining the open hole §6 flagged.
2. **Q61 rec (3) is now pre-drafted** and rec (1) acquires a mandatory caveat it did not have before.
3. **Q61 rec (4) (revenue model) gets its denominator honestly**: contractor merchants churn **15–30%/yr**
   at baseline, so residual-per-merchant must be modelled against a 3–6 year life, not perpetuity — and the
   retention multiple (2.5×–4×) may **only** be applied to the rung that actually integrates.
4. The dual-pricing pitch is demoted from "lock-in" to "acquisition wedge" wherever it appears.

**House limit honoured:** nothing signed, no processor committed, no money field moved. No code touched.

---

## 🔴 3g. The REVENUE MODEL — line CLOSED, and it reverses the framing of the whole add-on (Max, 2026-07-25)

The last purely-analytic line on the §5 checklist: *"expected residual per merchant × a defensible merchant
count — is this worth the distraction from P1?"* It is answered here with a **first-party denominator** (our own
CRM, not an industry guess) so the number cannot be inflated by a favourable assumption.

### Per-merchant residual — two independent routes, converging

| Route | Inputs (each with an originator) | Result |
|---|---|---|
| **A — margin share** | Gross margin per merchant **$70/mo** (CCSalesPro's own worked calculator example) × the split it states verbatim as *"The industry average right now is probably about 50%"* | **~$35/mo** |
| **A′ — aggressive split** | Same $70 margin at the *"70% or 80% residual in exchange for no up-front bonus"* tier CCSalesPro describes | **$49–56/mo** |
| **B — basis points** | A merchant at $30k/mo processing × the **15 bps** Strictly's 2026 ISO guide calls the floor: *"maintaining a spread of at least 15 basis points is vital for long term ISO profitability"* | **~$45/mo** |

Two unrelated methods land in the same place. **Model band: $35–$50 per merchant per month**, net of split.
Both routes are *before* the deductions Strictly enumerates (BIN sponsorship **1–5 bps**, network/per-item fees,
equipment) — so $35 is the honest planning number and $50 is the ceiling, not the midpoint.

**One widely-repeated figure was REJECTED, not banked.** Search surfaces *"average monthly credit card spend rose
from $10,000 in 2020 to $23,000"* across a 2025 study of 1.6m U.S. small businesses (traceable to the Akcigit /
Chhina / Cilasun *Credit Card Entrepreneurs* work, BFI/NBER). It is **the wrong metric** — that is small businesses
**spending on** business credit cards *as buyers*, not merchant **card-acceptance volume** *as sellers*. Using it
here would inflate the model with a number measuring the opposite side of the transaction. Not used.

### The denominator — from our own CRM, 2026-07-25

**MLE Network today: 19 organisations, 8 deals** (direct count against prod Supabase this run — first-party, not
estimated). Against that, §3f's already-banked Apideck finding: payment attach rates *"often remain below 20%"*
when a platform sells payments on its own.

| Scenario | Merchants | Monthly residual @ $35–50 | Portfolio value @ 25–40× |
|---|---|---|---|
| **Realistic near-term** (sub-20% attach on 19 orgs) | ~4 | **$140 – $200** | ~$4k – $8k |
| Every current org converts (100% attach — not a forecast) | 19 | $665 – $950 | ~$17k – $38k |
| The industry "successful agent" portfolio | 100 | $3,500 – $5,000 | ~$88k – $200k |

Portfolio multiple from the same Strictly 2026 guide: *"the total monthly residual income multiplied by an
industry-standard multiple, typically ranging from 25x to 40x."* (Vendor calculators also circulate a **25–40%/yr
attrition** norm; that is **search-summary level, not verbatim-read, and is NOT used in the table** — the model
uses §3f's directly-quoted **15–30%/yr contractor churn on a 3–6 year life** instead.)

### The answer to Rob's question — and it is not the one the question expects

**"Is this worth the distraction from P1?" On monthly revenue at today's network size: no.** Four merchants at
$140–200/month is not a revenue stream; it is a rounding error against a single $2,000 Phase 1 (Q57) or the
$10,000 CG Roofing contract. At 15–30%/yr churn Rob is also replacing ~1 in 5 merchants annually just to stay flat.

**But the payoff shape is wrong-footed by asking about monthly cash.** The residual portfolio is an **asset that
sells at 25–40× its monthly figure**, and every scenario above is driven by exactly one variable: **how many
merchants MLE has.** Which produces the finding:

> **The payments add-on does not compete with P1 — it is a multiplier that sits downstream of it.** Its entire
> value is a function of MLE's customer count, so an hour moved from P1 to payments lowers the payments outcome
> too. The correct sequencing is not "payments vs. P1"; it is **P1 builds the denominator, payments monetises it
> later** — which is also, independently, what §3f concluded about the switching-cost half (rung 1 now, integration
> as a Phase-2+ decision).

This is consistent with, and strengthens, the 7/23 recommendation: at the **$0-independent-agent** rung the
carrying cost is zero, so the add-on can be *started* now precisely because it costs nothing to hold while the
denominator grows — whereas the **registered-ISO rung at ~$20–30k/yr would require ~50–70 merchants at $35–50/mo
just to break even**, i.e. roughly **3× the entire current MLE Network**, before a dollar of profit. That is a
hard, sourced disqualifier for jumping rungs on 8/8.

### What this changes

1. §5's revenue-model line **CLOSES**; **Q61 rec (4) is now pre-drafted** with its arithmetic and its sources.
2. **Q61 rec (1) gains a second, independent argument** for starting at $0 — the ISO rung's fixed cost needs ~3×
   the current network to break even. rec (1) now rests on three legs: unverifiable counterparties (§3b–§3e),
   zero switching cost at rung 1 (§3f), and negative unit economics at the ISO rung (here).
3. The framing Rob's dump used — *"revenue stream and increase switching costs"* — is now answered on **both**
   halves, and **both** resolve the same way: real, but later, and gated on customer count rather than on a signature.
4. **No line of this model changes if the Rob-blocked legs open.** The transcripts, the OTC filings and the
   Schedule A's affect *which counterparty*, not *how much per merchant* — so this line is closed, not provisional.

**House limit honoured:** nothing signed, no processor committed, no money field moved. No code touched.

**Sources:** [CCSalesPro — merchant services commission](https://www.ccsalespro.com/blog/much-residual-can-make-selling-merchant-services-merchant-services-sales-commission) · [Strictly — How to Calculate Payment Residuals: The Definitive ISO Guide for 2026](https://strictlyzero.com/announcements/payments-announcements/how-to-calculate-payment-residuals-the-definitive-iso-guide-for-2026/) · [BFI — Credit Card Entrepreneurs (the REJECTED metric, recorded for traceability)](https://bfi.uchicago.edu/working-papers/credit-card-entrepreneurs) · Apideck attach rate + Clearly Payments churn: banked verbatim in §3f · Merchant/deal counts: prod Supabase, 2026-07-25.

---

## 🔴 3h. WHICH ENTITY SIGNS — recommendation pre-drafted, and the card-brand rule reframes the question (Max, 2026-07-25)

This pre-answers **Q61 rec (2)** — the last of the packet's four recommendations without a draft — and it
turns out the entity question is **not** primarily a tax/branding choice. Visa's own agent-registration
program constrains, in writing, *who may say what to a merchant*, and that constraint lands directly on the
$0-agent rung §3f–§3g have been hardening.

### The governing rule, quoted

> *"ISO registration is required for any entity that solicits on behalf of a Visa client. An ISO is any entity
> that solicits merchant or cardholder accounts, discusses pricing, fees or rates, processes merchant or
> cardholder accounts, discusses terms and agreements, manages and/or drafts contracts, submits contracts to
> the acquirer or issuer… A registered ISO may use referral entities or sales representatives to solicit on
> their behalf; however, **those entities may only solicit and market in the name of the registered ISO**…
> **Referral entities or sales representatives who market in their own name may only generate leads** to
> registered ISOs and **may not provide ISO services** such as direct solicitation of merchant or cardholder
> accounts, discuss pricing, fees or rates… manage/draft contracts, submit contracts to an acquirer or issuer."*
> — [Visa, *Third Party Agent Registration Program FAQs*](https://usa.visa.com/dam/VCOM/download/merchants/tpa-registration-program-faqs.pdf)

| Verified fact | Source |
|---|---|
| An unregistered referral entity may market **in its own name** only to **generate leads** — it may **not** discuss pricing/fees/rates, draft contracts, or submit applications | [Visa TPA FAQs](https://usa.visa.com/dam/VCOM/download/merchants/tpa-registration-program-faqs.pdf) |
| To do those things unregistered, the entity must **solicit and market in the name of the registered ISO** — i.e. under the ISO's brand, not its own | same |
| *"Acquirers must not process applications from any entity that they have not registered as an ISO with Visa"*; clients *"may be subject to fines and penalties for using an unregistered agent"* | same |
| ISO registration is **$5,000 USD initial + $5,000 annual renewal**, assessed to the acquirer **per agent per region** (PF and **HRIPF** carry the same $5,000; ESO/TPS $1,000) | same |
| A **DBA "is not a separate legal entity"** and must have *"the same operational management"*; a separate legal entity therefore cannot ride on another entity's registration as a trade name | same |
| A **High Risk ISO (HR-ISO)** is a distinct registered type for portfolios of *"high-brand risk merchants"* | same |

⚠️ **Currency caveat, stated rather than smoothed:** the copy read is the **May 2016** edition of the FAQ
(`usa.visa.com` serves the same filename but returns **HTTP 403** to automated fetch — retrieved from Visa's
`visa.pt` mirror of the identical document). The Visa Rules themselves govern; a human browser pull of the
current US edition belongs in the same bucket as the Shift4 T&C and cardpaymentoptions pulls. The fee
figures in particular should be re-confirmed before they are used as anything but an order of magnitude.

### What that does to the question

The entity question has been framed as *"BoostUp vs MLE/AI VoiceTech — who signs?"*. The rule says the
signature is the **smaller** half. The bigger half is **whose name is on the pitch**:

- If MLE/AIVA **markets processing in its own name** at rung 1 — "MLE takes card payments for you" — that is
  ISO activity by an unregistered entity the moment anyone quotes a rate, and it is the **acquirer** that
  eats the fine. This is exactly the bundled-brand story the add-on is attractive for.
- If Rob's entity **markets in the ISO's name**, no registration is needed — but then the merchant's
  processing relationship is visibly the ISO's, which is **weaker** brand-wise and (per §3f) adds no
  switching cost anyway at rung 1.
- Registering to escape the fork costs **$5,000/yr at Visa alone**, per entity, per region — before
  Mastercard's own program, and **before** §3g's ~$20–30k/yr all-in ISO figure. Registering **two** entities
  so both can market in their own names doubles it, and the DBA route is closed by the *"a DBA is not a
  separate legal entity"* rule.

### Recommendation for Q61 rec (2) — ONE entity signs, and it is BoostUp Payments

1. **BoostUp Payments signs the Schedule A and owns the residual.** It is the entity built for payments
   (7/23 filing), and §3g establishes the residual book is a **saleable asset at 25–40× monthly** — an asset
   should not be split across two signatures, and non-negotiable #3 (the right to sell the portfolio to a
   third party) is exercised by whoever signed.
2. **MLE and AI VoiceTech never appear on the processor paper.** They are the **distribution** side, and at
   rung 1 they must operate within the rule above: either lead-gen in their own name (introduce, hand off,
   quote nothing), or solicit under the registered ISO's name. **Which of those two is chosen is a real
   decision with brand consequences — it is not a formality**, and it is the part of rec (2) Rob actually
   needs to rule on.
3. **A written intercompany referral agreement** between BoostUp and MLE/AIVT, arm's-length, because MLE's
   own customers are the merchants (§3g's denominator is our own CRM) — MLE sits on the **merchant** side of
   the same relationship BoostUp earns on. Undocumented, that is a conflict sitting inside one owner's head;
   documented, it is an ordinary referral fee.
4. **Plumbing stays uncrossed regardless** — no shared email, DNS, or tooling between the identities
   (`~/.claude/rules/email-identity.md`, post-2026-07-08 crossover incident). Strategy may span the
   businesses; infrastructure may not.
5. **New call-agenda item, from the HR-ISO row:** §3c established the operating substance behind Amplipay
   appears to be **eDataPay, a high-risk / hard-to-place specialist**. Ask which **agent type** Rob's book
   would be boarded under — ordinary ISO or **HR-ISO** — because a roofing/title portfolio boarded through a
   high-risk channel inherits that channel's reserve and pricing posture. This joins the sponsor-bank and
   who-counter-signs questions already on the 7/28 list.

### What this changes

- **Q61 rec (2) is pre-drafted**; with rec (1), (3) and (4) already drafted (§3f, §3g), **all four
  recommendations now exist in evidence form** and Q61 reduces to building the one-screen visual + Rob's
  own two calls (rung confirmation, own-name vs ISO-name marketing).
- **Rec (1) gains a fourth independent leg.** Rungs were being compared on cost and lock-in; the card-brand
  rule adds a **capability** axis: at rung 1 the unregistered entity may not even quote a rate in its own
  name. "$0 agent" is not merely cheap-and-limited, it is **speech-limited** — which must be said plainly in
  the packet rather than discovered after a rep quotes a rate on a call.
- **No entity was chosen and nothing was signed** — this is a recommendation with its evidence, for Rob.

**House limit honoured:** nothing signed, no processor committed, no money field moved. No code touched.

**Sources:** [Visa — Third Party Agent Registration Program FAQs](https://usa.visa.com/dam/VCOM/download/merchants/tpa-registration-program-faqs.pdf) (read via the identical [visa.pt mirror](https://www.visa.pt/dam/VCOM/download/merchants/tpa-registration-program-faqs.pdf), May 2016 edition — `usa.visa.com` 403s automated fetch) · residual-as-asset and ISO-rung cost: §3g · switching cost at rung 1: §3f · eDataPay high-risk finding: §3c · identity rule: `~/.claude/rules/email-identity.md`.

---

## 🔴 3i. THE ATTACH RATE — §3g's softest number now has sourced bounds, and the spread is the finding (Max, 2026-07-25)

**The line this closes:** §5's deliverable-side line (b), added 7/25 pm — *source an attach rate for payments
**delivered as part of the product** vs. §3g's banked Apideck *"often remain below 20%"* for payments **sold
separately***. §7.3 called this *"the highest-leverage variable in the entire §3g model"* and left it a named
hypothesis with **no number**. It is no longer numberless.

### What was found — four figures, ordered by how much weight they can bear

| # | Figure | What it actually measures | Weight it bears | Source |
|---|---|---|---|---|
| 1 | **67% of GMV** ran through Shopify Payments in Q1 2026 (vs **64%** in Q1 2025) | Payments penetration on a platform where checkout ships **as part of the product**, merchant opts in | **Highest — first-party, SEC-filed, audited-issuer disclosure.** Not a vendor claim | [Shopify Inc. Form 10-Q, FY2026 Q1](https://www.sec.gov/Archives/edgar/data/0001594805/000159480526000019/shop-20260331.htm) |
| 2 | **"attach can range from 20% to 90+%"** across vertical SaaS players | The observed spread, from an operator | High — named originator, **Ronnie Gurion, COO of Clio**, a vertical SaaS company that sells payments | [Tidemark — How to sell payments in vertical SaaS](https://www.tidemarkcap.com/post/how-to-sell-payments-vertical-saas) |
| 3 | Payments treated as a **core product inside sales quotas** yields *"maximum attach"*; a **SPIFF** model yields *"a decent amount of attach, but… it still gets treated like a secondary product"* | The **mechanism** behind the spread — how it is sold, not what it is | High for direction, **zero for magnitude** — no percentages attached to either mode | [Tidemark / Gurion, same piece](https://www.tidemarkcap.com/post/how-to-sell-payments-vertical-saas) |
| 4 | *"The median payments attach rate has doubled in 1 year"*; 87% of vertical SaaS companies offering fintech now offer payments (from 30% a year earlier) | Direction of travel across 200+ vertical SaaS companies | Medium — **the absolute median is not published on the public page**, only the doubling | [Stripe / 2025 Tidemark Vertical & SMB SaaS Benchmark](https://stripe.com/lp/vertical-saas-benchmark-2025) |

**Toast is the structural ceiling and is recorded as a contrast, not a benchmark:** Toast requires its own
processing — a merchant cannot bring another processor — so its attach is ~100% **by contract, not by
product quality**. That is a mandatory-bundling model, which is a different (and legally different) proposition
from MLE shipping a chatbot that happens to transact. Sourced from third-party reviews, not Toast filings,
so it is cited as context only: [Merchant Insiders — Toast fees](https://merchantinsiders.com/blogs/toast-fees/).

### The answer, stated at the precision the evidence supports

**§7.3's hypothesis is CORROBORATED IN DIRECTION AND UNQUANTIFIED IN MAGNITUDE — and that is the honest
answer, not a placeholder.** Apideck's *sub-20%* sits at the **bottom** of Gurion's observed 20–90+% range,
and it describes exactly the mode Gurion names as the weak one (payments as a secondary product / SPIFF).
Shopify — checkout shipped inside the product — sits at **67%**, in the upper half of the same range. Two
independent sources, one an SEC filing, agree that **how payments is delivered moves attach by multiples, not
by percentage points.**

**What is NOT established, and is not being invented:** there is no published attach figure for the specific
thing Rob would ship — *a third-party-built website whose chatbot takes the payment, with the merchant boarded
on the builder's Schedule A*. Shopify is a first-party platform monetizing its own checkout; Rob would be an
agent earning a residual on someone else's rail. **The 67% is a directional ceiling, not our forecast.**

### What this changes for the 8/8 packet

- **§3g's ~4-merchant denominator stays as the planning number.** It was built on sub-20% attach, which is
  the correct assumption for **rung 1 as it exists today** — refer the merchant, hope they board. Nothing
  here justifies raising it, because nothing here describes our delivery mode.
- **It converts the chat-commerce capability from "nice add-on" into the single identified lever on the one
  number that makes the whole add-on small.** Moving from Apideck's floor toward Shopify's 67% is worth
  ~3× on §3g's revenue model at a constant customer count — which is a **product decision (Q62), not a rung
  decision (Q61)**, and does not argue for jumping a rung.
- **Rec (4) gains a sourced range and keeps its honest bound:** state the model at sub-20% attach, name
  20–90+% as the observed spread with the delivery mode as the driver, and print that our own mode has no
  published figure. ✅ **APPLIED to the 8/8 packet 2026-07-25** (`PAYMENTS-DECISION-PACKET-2026-08-08.html`:
  rec 4 `⚡ Update 7/25 pm` block + evidence line + the addendum's rec-4 row, which previously said
  *"hypothesis with no number"*). Recs 1–3 untouched; the `~4 merchants ≈ $140–200/mo` planning row unchanged;
  the refusal to blend 67% with 20% is now restated on the packet itself, not only here.
- **The mechanism finding is directly actionable and costs nothing:** attach follows whether payments is a
  core product or a bolt-on. MLE shipping checkout *inside the site it builds* is the structural version of
  Gurion's "core product," which is why §7.3's boarding-as-onboarding-step framing survives this check.

**No number was invented, and one was deliberately not manufactured:** the tempting move — averaging Shopify's
67% with Apideck's 20% to produce a "blended" attach — would be a fabricated statistic on a money model and
was not made.

**House limit honoured:** nothing signed, no processor committed, no money field moved. Docs-only, no code.

**Sources:** [Shopify Inc. Form 10-Q FY2026 Q1 (SEC)](https://www.sec.gov/Archives/edgar/data/0001594805/000159480526000019/shop-20260331.htm) · [Tidemark — How to sell payments in vertical SaaS (Ronnie Gurion, COO, Clio)](https://www.tidemarkcap.com/post/how-to-sell-payments-vertical-saas) · [Stripe — 2025 Vertical SaaS benchmark](https://stripe.com/lp/vertical-saas-benchmark-2025) · [Merchant Insiders — Toast fees (context only)](https://merchantinsiders.com/blogs/toast-fees/) · Apideck sub-20% figure: banked verbatim in §3f/§3g.

---

## 4. Identity / entity structure — decision Rob must make

> ✅ **PRE-DRAFTED 2026-07-25 — see §3h.** Recommendation: **BoostUp Payments signs alone and owns the
> residual; MLE/AIVT are distribution only and never appear on the processor paper.** §3h also reframes the
> question: Visa's agent rules constrain *whose name is on the pitch*, not just whose name is on the
> signature — an unregistered entity marketing **in its own name** may only generate leads, and may not
> quote rates or submit applications. Rob's remaining call is own-name-lead-gen vs. marketing under the
> registered ISO's name. Section below preserved as originally written.

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

## 🟢 3j. THE 7/28 CHASE — the call sheet exists, and the agenda has a GATE, not a list (Max, 2026-07-25)

The Amplipay booking (submitted 7/24) is the **only live non-Rob leg left on this DD** — everything else is
Rob-only, human-browser-403, or otcmarkets-outage-blocked. Eight call-agenda items had accumulated across
§3a, §3c, §3d, §3e and §3h with **no single place they were written down in the order they have to be asked**,
which is how a 20-minute call ends with the pitch answered and the four non-negotiables still unknown.

**Deliverable:** [`AMPLIPAY-CALL-SHEET-2026-07-28.html`](./AMPLIPAY-CALL-SHEET-2026-07-28.html) — one screen,
HTML because Rob does not read markdown (house rule 9), every claim carrying its source URL (house rule 10).

**Nothing on it is new evidence.** It is §3a–§3h assembled, and the one thing the assembly adds is the
structure the evidence already implies:

1. **Three GATE questions, answered in writing, before any Schedule A is worth reading** — (1) sponsor bank +
   acquiring BIN + your published ISO/MSP disclosure language (§3e); (2) AmpliPay Group Inc. vs eDataPay —
   relationship, and **which entity counter-signs** (§3c, §3e); (3) SEC reporting status + CIK, and *send the
   OTC filings directly* (§3a — now the standing fallback after **six consecutive** otcmarkets outages).
   The reason they are a gate and not questions 1–3 of 9: **all four non-negotiables are claims against
   whoever's paper the residual sits on.** Until that party is named, the terms describe nothing.
2. **Six follow-ups in order** — merchant count + volume in writing (§3c); what the payments business was
   before June 2025 (§3a); **ISO vs HR-ISO boarding type** (§3c); *what happens to my residual when YOU
   terminate the merchant?* (§3d); residual survivability on delisting/acquisition/insolvency, answered **in
   the contract** (§3a); and the Schedule A **last** — with §3b printed as the reason it goes last (Shift4 had
   the balance sheet and still ended partner residual streams by memo).
3. **The four-non-negotiable scorecard entering the call: 4× UNKNOWN**, each row saying what the public
   record actually shows rather than leaving a blank — including that the page titled *banking partnerships
   and lucrative residual commissions* offers exactly one sentence on the residual and says nothing about
   ownership, duration, portability or assignability.
4. **What the call cannot change, printed on the sheet:** it decides **which counterparty**, never the rung
   ($0 independent agent — the ISO rung needs ~50–70 merchants, ~3× the current network, to clear its
   ~$20–30k/yr) and never the arithmetic ($35–50/merchant/mo × ~4 merchants ≈ $140–200/mo, §3g). A good call
   improves the counterparty; it does not make payments compete with P1 for Rob's hours.

**Retries run first this increment, and both failed honestly:** otcmarkets served the site-wide *"Temporarily
Unavailable"* page for the **6th consecutive** attempt (HTTP 200 + outage HTML, verified by direct request —
platform outage, not a block on us), and the three human-browser pulls were re-attempted with full browser
headers — Shift4 partner T&Cs now **HTTP 429**, cardpaymentoptions/SignaPay **403**, current Visa TPA FAQ
**403**. Nothing is quoted from any of them; the May-2016 `.pt` mirror caveat on the Visa fee figures stands.

**House limit unchanged and printed on the artifact's own face: this call produces evidence, never a
signature.** No processor committed, no money field moved, nothing signed.

---

## 🔴 3k. PFaaS ECONOMICS — the missing half of Rob's rung question is now priced, and the break-even is an order of magnitude closer than the ISO rung (Max, 2026-07-25)

**The line this closes:** §5's *"PFaaS ECONOMICS — the missing half of Rob's rung question"* (added 7/25 pm,
§7.7). Rob is explicitly weighing *"ISO or a PayFac or whatever."* Rung 1 ($0 agent) and rung 2 (registered
ISO) both had sourced economics from §3g. **Rung 3-alt — PayFac-as-a-Service — had none**, which meant the
comparison Rob is being asked to make on 8/8 was missing a leg. It now has one.

### What each provider actually publishes

| Provider | Model | Platform's economics | Fixed monthly cost | Published? |
|---|---|---|---|---|
| **Tilled** | **Revenue share** | **70%** of the spread under $5M/mo processing; **80%** over $5M/mo | **$500/mo** SaaS fee (Start-Up); **$2,500/mo** (Scaling) | ✅ Both tiers public — [tilled.com/pricing](https://www.tilled.com/pricing) |
| **Moov** | **Buy-rate** — platform sets merchant price, keeps the spread | Card online **interchange+ 0.60% + 15¢**; Tap to Pay **interchange+ 0.50% + 15¢**; ACH same-day 40¢ | **$500/mo minimum**, + $5.00/mo per merchant processing account, + $2.00/mo per business PCI | ✅ Full rate card public — [moov.io/pricing](https://moov.io/pricing/) |
| **Rainforest** | **Buy-rate, and explicitly NOT rev-share** — verbatim: *"No, we offer a buy-rate, interchange-plus pricing model giving you the most control over your revenue"* | **0.30% + per-item** at $0–5M/mo, stepping to 0.25% ($5–15M) and 0.20% ($15–25M); disputes $15/item | **Not disclosed**; a **"Risk Management Fee — risk dependent"** is named but unpriced | ⚠️ Rates public, minimums and risk fee **not** — [rainforestpay.com/pricing](https://www.rainforestpay.com/pricing) |
| **Finix** | *"flat rate, dynamic, or custom"* | **Not published** — gated to a sales call | Not published | ❌ **Unpublished.** [finix.com/pricing](https://finix.com/pricing) — recorded as unknown, not estimated |

### The per-merchant number, built only from figures the vendor prints

Tilled is the only provider publishing **both** halves (share % *and* the spread it applies to), so it carries
the calculation. Its own pricing page states the illustrative assumption: *"merchant pricing is set as 2.9% +
$0.30 with no monthly account fee and all-in partner costs are set at 2.27% + $0.15."*

- Spread = **0.63% + $0.15/txn**
- At §3g's **$30,000/mo** per-merchant volume → **$189.00/mo** gross spread on the volume component
- Platform keeps **70%** → **≈ $132/merchant/month**

⚠️ **This is a FLOOR, and deliberately so.** The **$0.15-per-transaction** half of the spread is excluded
because transaction *count* per merchant is not in evidence — only volume is. Inventing an average ticket to
monetize it would be a fabricated number on a money model. **The 2.9%+$0.30 / 2.27%+$0.15 figures are Tilled's
own calculator assumptions, not a quoted rate to us** — they are labelled as such here and must stay labelled
on the 8/8 packet.

### The finding — PFaaS break-even sits AT today's merchant count, not 3× the network

| Rung | Fixed annual cost | Per merchant / month | Merchants to break even |
|---|---|---|---|
| 1 — $0 independent agent | **$0** | **$35–$50** (§3g, two converging routes) | **1** — profitable from the first merchant |
| 3-alt — **PFaaS (Tilled Start-Up)** | **$6,000/yr** ($500/mo) | **≈ $132** (floor, above) | **≈ 4** to cover the fee · **≈ 6** to beat staying at rung 1 |
| 2 — registered ISO | **$20–30k/yr** (§3g) | $35–$50 | **≈ 50–70** (§3g) — *≈ 3× the entire current network* |

**Rung 2 is disqualified by a factor of ~12; rung 3-alt is not disqualified at all.** §3g's own planning
denominator is **~4 merchants near-term** — which lands exactly on the PFaaS fee break-even and just under the
~6 needed to beat rung 1. The registered-ISO rung needs 50–70. **That is the whole answer to *"ISO or a PayFac
or whatever"*: the ISO rung is out on arithmetic, and the PayFac-like rung is a live option that today is
roughly a wash — not a loss.**

### Why "roughly a wash" is the *bullish* reading, not the bearish one

§3f established that **every switching-cost mechanic Rob wants requires his software to program the rail — and
that at the $0-agent rung the switching cost added is ZERO.** §3f left revenue and switching cost sitting on
different rungs with no price on the gap. **That price is now known: ~$6,000/yr, break-even ≈4–6 merchants.**

So the two halves of Rob's stated thesis resolve like this:

- **Revenue half** — rung 1 wins today on pure arithmetic (no fixed cost, profitable at merchant #1).
- **Switching-cost half** — only rung 3-alt delivers it, and it costs **$6k/yr and ~2 extra merchants** to
  unlock, *not* the $20–30k/yr and 50–70 merchants that the ISO framing implied.
- **And rung 3-alt is the one that makes Q62's in-chat Buy Now possible at all** — a programmable rail is the
  precondition for an AI agent taking a card mid-conversation (§3f, §7.4).

### What this changes

- **The 8/8 packet's rung recommendation must now be a THREE-way comparison, not the two-way it currently
  implies.** 7/23's *"start at rung 1"* survives as the **revenue** answer and is not overturned — but it was
  formed without a price on rung 3-alt, and the honest statement is: *rung 1 today, rung 3-alt is the trigger
  to pre-plan, and the trigger is a merchant count (~6), not a date.*
- **A concrete, checkable trigger now exists** and should go on the packet: **when boarded merchants reach ~6,
  PFaaS turns net-positive AND unlocks the switching-cost half.** That is the first decision rule in this
  whole DD that Rob can act on without another research pass.
- **The rung question is no longer Rob-blocked on evidence** — it is now a judgment call between a known $0
  option and a known $6k/yr option, which is exactly the shape a go/no-go needs.
- **Rainforest is the structural alternative to watch**: buy-rate with *no* rev-share cap means the platform
  sets merchant pricing and keeps 100% of its own spread — better upside than Tilled's 70%, **but its monthly
  minimum is unpublished**, so it cannot be compared on break-even. That becomes an RFP question, not a
  research question.
- **Finix stays unknown, on purpose.** Nothing was estimated for it.

### What is NOT established — three items that convert to RFP questions, not open research

Every provider omits the same three things, so no amount of further public research closes them:

1. **Liability posture** — who eats a chargeback/fraud loss when the platform is merchant-of-record-adjacent.
   Rainforest prices a *"Risk Management Fee"* but publishes neither the fee nor the liability allocation.
2. **Time-to-live** — **not published by any of the four.**
3. **Minimums beyond the headline** — Tilled's $500/$2,500 are SaaS fees, not stated processing minimums;
   Rainforest publishes no minimum at all.

**House limit honoured:** nothing signed, no processor contacted, no money field moved. Docs-only, no code.

**Sources:** [Tilled pricing](https://www.tilled.com/pricing) · [Moov pricing](https://moov.io/pricing/) · [Rainforest pricing](https://www.rainforestpay.com/pricing) · [Finix pricing (gated)](https://finix.com/pricing) · per-merchant volume, agent-residual range, and ISO break-even: §3g (banked).

---

## 5. Open DD checklist — to close by 2026-08-04

- [ ] Rob exports/pastes the **OpenRouter** + **ChatGPT** candidate long-lists (Max cannot read either — 403 / session-scoped)
- [ ] Resolve: were **Maverick** and **SignaPay** rejected on merits, or never surfaced? — **MERITS HALF CLOSED 2026-07-25, see §3d** (both scored on public evidence: Maverick's *"free unlimited downstream sub-agent management"* survives the check ✅ marketing-level, but **23 BBB complaints in 3 years** dominated by held reserves / abrupt merchant closures; SignaPay is quieter — **3 complaints** — but its "portfolio buyouts" is *SignaPay as buyer*, **not** the third-party sale right of non-negotiable #3, and a 2015 BBB complaint alleges a rep signed an equipment lease in a merchant's name → NN#4 must be asked as sub-agent **liability**, not just sub-agent permission. **Neither disqualified.** Remaining half is Rob-only: did his OpenRouter/ChatGPT searches ever surface them?)
- [ ] **SignaPay**: cardpaymentoptions.com review returns **HTTP 403** to automated fetch — needs a human browser pull (same bucket as the Shift4 T&C PDFs); nothing from it is quoted until read
- [ ] **Amplipay**: sponsor bank named in writing — ⬆️ **the top agenda item** (§3a: an ~$82k-cap issuer means the sponsor bank is the only capitalized party in the chain). **PUBLIC RECORD EXHAUSTED 2026-07-25, see §3e** — no sponsor/acquiring/member bank is named on any of five properties (`amplipay.ai`, `amplipaygroup.com`, `edatapay.com/about`, `/partners`, `/banking-partnerships-and-lucrative-residual-commissions`), and the **card-brand-mandated *"registered ISO/MSP of [Bank], [City], [State]"* disclosure is absent entirely** from a company that self-describes as a *"Bankcard ISO"*. Line now **company-blocked, not unworked**: converts to a **call gate** for the 7/28 chase — *sponsor bank + acquiring BIN in writing, plus your published ISO/MSP disclosure language* — before any Schedule A review is worth doing
- [x] **Amplipay**: OTC:APGP financials pulled (going-concern, cash, dilution) — **CLOSED 2026-07-25, see §3a.** Answer: *there are none to pull.* Not an SEC reporting company (only EDGAR "Osyka" registrant filed Form 15-15D in 2008; last financials on EDGAR are a 10-QSB for Q3 2000). Issuer is a **1990 oil-and-gas shell renamed from Osyka Corporation on 2025-06-12** with a 1-for-500 reverse split, **market cap ≈ US$82,190**, net income ≈ −$127k/qtr
- [x] **Amplipay**: merchant count / volume independently verified — **CLOSED 2026-07-25, see §3c.** Answer: *there is no count to verify.* No third-party figure exists; the company's own corporate site (`amplipaygroup.com`, a second domain alongside `amplipay.ai`) renders **"0+ Customers / 0+ World Active User / 0% Satisfaction"** template placeholders. Operating substance appears to sit in named brand **eDataPay** (Boca Raton) — a **high-risk / hard-to-place merchant specialist** claiming "over 18 years" but publishing no merchant count, no volume, and no acquiring bank. Two new agenda items: merchant count + volume **in writing**, and **which entity (AmpliPay Inc. vs eDataPay) counter-signs the Schedule A**
- [ ] **Amplipay**: read the two **OTC Markets alternative-reporting disclosure documents** (report ids `484380`, `506506`) — they exist (refines §3a's "no financials": none at the **SEC**, but OTC alt-reporting filings are on file). **Still unread after an 8th consecutive retry (2026-07-28 inc.48) — and the 7/28 contingency below has now FIRED.** The outage is no longer site-wide: `www.otcmarkets.com` **has RECOVERED** (serves the real site, `<title>OTC Markets | Official site of OTCQX, OTCQB, OTCID and Pink Limited Markets`), but the **data/document tier is still down** — *both* `www.otcmarkets.com/otcapi/...` and `backend.otcmarkets.com/otcapi/...` return the *"Temporarily Unavailable"* page (HTTP 200, 2116 bytes) for **both** report ids `484380` and `506506`, verified this run. **Recorded precisely because a retry that only checks the homepage would now wrongly report "back up" and close this line on a page that carries no filing.** This is a **sustained data-tier outage in its 4th day** (7/25 → 7/28), not a transient blip, and still a platform outage rather than a block on us. **CONTINGENCY TRIGGERED AS WRITTEN:** it was still down on 7/28, so this folds into the Amplipay chase call as *"send us your OTC disclosure filings directly"* — that is now the **only** remaining route to these documents, not a fallback. No figure from them is quoted anywhere until read
- [ ] **Amplipay**: booking held (submitted 7/24 — chase if no reply by 7/28). **CALL SHEET BUILT 2026-07-25 (§3j): [`AMPLIPAY-CALL-SHEET-2026-07-28.html`](./AMPLIPAY-CALL-SHEET-2026-07-28.html)** — the three gate questions, six follow-ups, and the four-non-negotiable scorecard, each with its source; nothing on it is new evidence, it is §3a–§3h assembled into the order the call has to run in
- [x] **Shift4**: partner-contract history flag investigated (7/23 raised it, never closed) — **CLOSED 2026-07-25, see §3b.** Answer: *the history is real and adverse.* Feb 2022 Shift4 unilaterally discontinued ancillary-fee residual streams effective 4/1/2022 and replaced them with a one-time buyout carrying a **10-year** merchant non-solicit (industry norm 16–42 months); SEC filings describe buying out **"over a hundred"** partners' residual obligations plus non-solicitation rights; 2018 antitrust suit (Payment Logistics, S.D. Cal.) over cutting independent interfaces out of the channel; Jan 2025 **$750k SEC penalty** for undisclosed related-person residual commissions. **Fails non-negotiables 1 and 3 on conduct; 2 and 4 remain unknown (T&C PDFs are 403 to automated fetch).**
- [ ] **Both**: Schedule A obtained and scored against the 4 non-negotiables — *Shift4 partially scored from public conduct (§3b); the actual Authorized Partner T&Cs PDF needs a human/browser download (HTTP 403)*
- [ ] Rung decision: start as **$0 agent** (7/23 recommendation) vs. jump straight to ISO/PFaaS
- [x] Entity decision: which entity signs (§4) — **RECOMMENDATION PRE-DRAFTED 2026-07-25, see §3h.** Answer: **BoostUp Payments signs the Schedule A and owns the residual** (it is the payments entity, and §3g's residual book is a saleable asset at 25–40× monthly that must not be split across two signatures); **MLE / AI VoiceTech never appear on the processor paper** — they are distribution, under a written arm's-length intercompany referral agreement, because MLE's own customers *are* the merchants. **The card-brand rule reframes the question:** Visa's TPA program says an unregistered referral entity marketing **in its own name** *"may only generate leads"* and **may not** discuss pricing/fees/rates, draft contracts or submit applications — to do those unregistered it must *"solicit and market in the name of the registered ISO."* Registering to escape that fork is **$5,000/yr at Visa alone, per entity, per region**, and the DBA workaround is closed (*"a DBA is not a separate legal entity"*). **Rob's remaining call is therefore not "who signs" but own-name lead-gen vs. marketing under the ISO's name.** New agenda item: ISO vs **HR-ISO** boarding type, given §3c's eDataPay high-risk finding
- [x] Switching-cost mechanic specified: what *concretely* makes a merchant unable to leave once processing is bundled? — **CLOSED 2026-07-25, see §3f.** Answer: **the AI agent transacting** (AIDRE takes the deposit on the call / AIVA closes the booking with a card) — the sold outcome is *a booked-and-paid job*, which cannot survive moving the rail; second-strongest is the second brain as revenue system-of-record (Q40). Dual pricing is **not** lock-in, it is the acquisition wedge, and is symmetric. **The finding with teeth: every mechanic requires that Rob's software can PROGRAM the rail (PFaaS posture) — so at the $0-independent-agent rung, switching cost added is ZERO.** Rob's thesis splits: revenue half is available now at rung 1; switching-cost half is a Phase-2+ engineering decision, not a signature
- [x] Revenue model: expected residual per merchant × realistic merchant count = is this worth the distraction from P1? — **CLOSED 2026-07-25, see §3g.** Answer: **$35–$50 per merchant per month** (two independent routes converge: $70 gross margin × the stated ~50% industry-average split; and $30k/mo volume × the 15 bps floor). Denominator taken **first-party from our own CRM — 19 orgs, 8 deals today** — with §3f's Apideck sub-20% attach → **~4 merchants ≈ $140–200/month near-term**, i.e. *not* a revenue stream at today's size. **The payoff shape is the finding: a residual book sells at 25–40× monthly, and every scenario scales with MLE's customer count — so the add-on is downstream of P1, not competing with it.** Hard sourced disqualifier for jumping rungs: the **registered-ISO rung (~$20–30k/yr) needs ~50–70 merchants just to break even ≈ 3× the entire current network.** A widely-circulated *"$23,000 average monthly card spend"* figure was **rejected** — it measures small businesses *spending on* business cards, not merchant *acceptance* volume
- [ ] 🆕 **DELIVERABLE-SIDE LINE (added 2026-07-25 pm from Rob's chat-commerce dump — see §7).** ~~(a) **Rob-only:** which vertical?~~ **(a) CLOSED by Rob the same evening — there is no vertical gate (§7.5): the paying chatbot is a HORIZONTAL add-on to the websites MLE spins up, across every vertical; e-commerce/apparel was one example, and the general principle is Amazon's Buy Now button — collect payment before the customer reaches a checkout page.** (b) ✅ **CLOSED 2026-07-25 — see §3i.** Attach for payments **delivered as part of the product** now has sourced bounds: **Shopify Payments = 67% of GMV, Q1 2026 (SEC 10-Q)** against §3g's banked Apideck *"often remain below 20%"* for payments **sold separately**, with Clio's COO putting the observed vertical-SaaS spread at ***"20% to 90+%"*** and naming the driver — payments as a **core product** vs. a SPIFF'd secondary one. **Direction corroborated, magnitude for OUR delivery mode still unpublished and not invented; §3g's sub-20% denominator therefore stands as the planning number.** (c) Confirm the 7/23 rail shortlist (Square payment links / Helcim HelcimPay.js) still holds for an in-chat flow at rung 1, and that hosted checkout keeps MLE **out of PCI scope** — target posture **SAQ-A, card data never in the LLM context or our logs** (§7.4, §7.7)
- [x] 🆕 **PFaaS ECONOMICS — the missing half of Rob's rung question (added 2026-07-25 pm, §7.7) — CLOSED 2026-07-25, see §3k.** Answer to *"does a platform-of-record model pay MORE than an agent residual on the same volume?"* → **YES, roughly 3×: ≈$132/merchant/month (Tilled, floor) vs §3g's $35–50 agent residual** — but it carries a **$500/mo SaaS fee**, so break-even is **≈4 merchants** to cover the fee and **≈6** to beat staying at rung 1. **Against the registered-ISO rung's 50–70, PFaaS is an order of magnitude closer — it lands AT §3g's own ~4-merchant planning denominator.** Tilled 70%/80% rev share + $500/$2,500 mo published; Moov buy-rate interchange+0.60%+15¢, $500/mo minimum published; Rainforest **explicitly not rev-share** (buy-rate, 0.30%+item at $0–5M) but **minimum unpublished**; **Finix unpublished entirely, recorded as unknown and not estimated.** **The decision-grade output is a trigger, not a date: at ~6 boarded merchants PFaaS turns net-positive AND unlocks §3f's switching-cost half, which rung 1 cannot deliver at any merchant count.** Three items are unpublished by ALL four (liability allocation, time-to-live, minimums beyond the headline) → they convert to **RFP questions, not open research**
- [ ] 🆕 **NN#3 IS NOW THE DEAL-BREAKER CLAUSE, not the third checkbox (§7.7).** Rob cites portfolio resale value (25–40× monthly, §3g) as a stated reason for the whole initiative → on **every** Schedule A, verify the sale right is a **third-party** sale right, not the processor's own buyback (the exact trap §3d found in SignaPay's published *"portfolio buyouts"*). A book sellable only back to the processor does not carry the outside multiple

## 6. The question nobody has asked yet — ✅ ANSWERED 2026-07-25 (see §3f)

> **Resolved.** The mechanic is **the AI agent transacting** — and the answer carried a second finding the
> question did not anticipate: the mechanic is **unavailable at the $0-agent rung**, because every version of
> it requires Rob's software to program the payment rail. Revenue and switching cost therefore sit on
> *different rungs*, and Q61 must say so. Original framing preserved below for the record.

Rob's stated value is **revenue + switching costs**. The switching-cost claim is the stronger half and
it is currently unquantified. Processing is famously *easy* to switch (that's the entire premise of the
dual-pricing pitch in §1 — reps win accounts by switching them). Bundling processing into MLE/AIVA only
raises switching costs if the *integration* is what's sticky, not the processing itself.

**Before the 8/8 decision, that mechanic needs to be named explicitly.** Otherwise this is a revenue
add-on with a switching-cost story attached, which is a materially different (and smaller) case.

---

## 7. 🆕 THE DELIVERABLE-SIDE QUESTION — payments *inside* what MLE ships (Rob, 2026-07-25 evening)

**Source:** `docs/plans/sources/ROB-CHAT-COMMERCE-DUMP-2026-07-25.md` (verbatim). Rob: *"adding a payment
processor to the MLE's deliverables, for example creating a website with a chatbot where the chatbot serves as
a personal shopper and then the user can checkout right from within the chatbox."*

**This is a different question from §1–§6 and is kept separate on purpose.** §1–§6 diligence the **business
layer** — whose paper Rob signs, what residual he earns, at which rung. §7 is the **product layer** — what a
client actually receives. They interact (below) but they are not the same decision and must not be merged into
one recommendation on 8/8.

### 7.1 What was already on record (NOT overwritten — these stand)

| Where | What it already says |
|---|---|
| `payments-deep-research-2026-07-23.md` (line 16) | *"Chatbot checkout (AIVA), today: Square (API payment links `square.link/u/…` built for SMS/chat…). Runner-up Helcim (in-widget HelcimPay.js, cheapest IC+). Forward bet: x402 (Apache-2.0, TS) for agentic USDC."* |
| same, line 12 | *"Agentic commerce standards landed 2025 — Mastercard Agent Pay, Visa Intelligent Commerce/TAP, Google AP2. Chatbot payments becoming first-class (AIVA-relevant)."* |
| `agents/2026-07-23-payments-slice3-checkout-payfac.md` §5 | the same three protocols with dates + comparison sources — *"chatbot-initiated payments are becoming a standardized category. Directly relevant to AIVA."* |
| `agents/2026-07-23-payments-slice2-crypto-fiat.md` | crypto/agentic rails ranked for chatbot checkout (Strike, Radom, x402, BitPay hosted) |
| §3f above, mechanic #1 | *"the AI agent transacts — AIDRE takes the deposit on the call; **AIVA closes the booking with a card in the chat**"* |

### 7.2 What was NOT on record — the actual gap

Searched every file in `~/Projects/MyLocalEverything` (see the dump's search table): **zero hits** for
*shopper*, *cart*, *storefront*, *e-commerce*. More important than the vocabulary:

- **Phase One's delivered scope** (`docs/training/phase-one-explainer.md` §2, pulled from
  `phase1_engine.py build_scope()`) is websites · Living Second Brain · per-agent sites/brains/social ·
  the automations library. **No commerce component and no payment component exist in any delivered scope.**
- **The Q40 phase model** (per-customer Blueprint, components that "light up") has **no commerce component**
  in its checklist.
- Every prior mention of in-chat checkout is filed under **AIVA the product**, never under **MLE the
  deliverable** — i.e. as a rail we might *use*, never as a line item a client *buys*.

**So the idea is genuinely new here, and it is now recorded.** Nothing above was edited to make room for it.

### 7.3 Why this matters to the 8/8 decision — it fixes §3g's weakest number

§3g closed the revenue model on a denominator problem: attach rate. Apideck's banked finding is that payments
attach *"often remain below 20%"* **when a platform sells payments on its own** — which is exactly what rung 1
does (refer the merchant, hope they board). That is how ~19 orgs became **~4 merchants ≈ $140–200/mo**.

If checkout is **part of the deliverable**, the merchant is not being *sold* payments — the merchant is being
*shipped* a store that already transacts. The boarding is a step in onboarding, not a second close.
**This is the highest-leverage variable in the entire §3g model** and it moves the one term §3g flagged as
soft. It is stated here as a hypothesis with a named mechanism, **not** as a number: no attach figure for
"payments delivered as product" has been sourced yet, and none is invented. → new §5 checklist line.

> ✅ **UPDATE 2026-07-25 (driver inc.10) — the hypothesis now has sourced bounds; see §3i.** Shopify Payments
> = **67% of GMV** (Q1 2026 SEC 10-Q) for checkout shipped inside the product, against Apideck's **sub-20%**
> for payments sold alone, inside Clio-COO Ronnie Gurion's observed **20–90+%** vertical-SaaS range whose
> stated driver is *core product vs. SPIFF'd secondary product*. **Direction confirmed; magnitude for our
> specific mode (third-party-built site, merchant on the builder's Schedule A) is unpublished and was not
> manufactured — §3g's sub-20% denominator stands.** The paragraph above is left as written rather than
> retro-edited, so the state of knowledge at each date stays readable.

### 7.4 The constraint that carries over — and the part that does not

The §3f finding still binds: **switching cost requires programming the rail (PFaaS posture)**. A client whose
chatbot merely links out to a hosted checkout can move processors next week.

But the **revenue** half survives at rung 1 intact, and this is the distinction to hold on 8/8:

| | Rung 1 ($0 agent) | PFaaS rung |
|---|---|---|
| Ship a chatbot that takes payment | ✅ yes — hosted payment links / hosted fields (Square, Helcim per 7/23) | ✅ yes |
| Earn residual on those transactions | ✅ yes — **if the merchant is boarded on Rob's Schedule A** | ✅ yes |
| Own the checkout state / charge programmatically | ❌ no | ✅ yes |
| Adds switching cost | ❌ **zero** (§3f) | ✅ yes |
| PCI scope on MLE | stays out of scope with hosted checkout | expands — needs its own review |

**Rec (1) is unchanged by this.** Rec (3)'s switching-cost mechanic gains a concrete MLE-side embodiment
(*the client's own site closes the sale in the chat*), and rec (4) gains the attach lever above. Nothing here
argues for jumping a rung.

### 7.5 ~~The open question — WHICH VERTICAL~~ → **CORRECTED BY ROB, 2026-07-25 (same evening)**

**Max's first read was wrong and is struck rather than quietly rewritten.** Max treated *"personal shopper"*
as implying a catalog and therefore a vertical choice (contractor deposits vs. title/RE fees vs. a new
retail ICP), and gated the item on Rob picking one. **There is no vertical gate.** Rob, verbatim:

> *"one of the things we'll be adding for a lot of customers for the websites we spin up is an embedded
> chatbot. We have customers across every vertical. Some of those will inevitably be ecommerce… I was just
> using an eCommerce site as an example."*

**The correct framing — a horizontal capability on an add-on MLE already plans to ship.** The embedded
chatbot rides the websites MLE spins up. Once AIVA is finished it can be **trained per vertical**, including
as an e-commerce site chatbot. Rob's apparel walkthrough is one training target, not the target:

> *"oh, you want a hoodie, great. what color? Red. what size do you generally wear? XL. ok cool, here are some
> of our best-selling Red XL hoodies"* — pulling **product image + description** into the chat — *"then give
> them the ability to make the purchase right from the chatbot."*

**The design principle he named is the general case:** Amazon carries a **Buy Now** button *alongside* Add to
Cart because it removes steps. Rob: *"there's utility for all sorts of ways to accept payments… we can
collect payment before the customer even gets to the checkout page."* One capability, one money moment per
customer type:

| MLE customer type | The in-chat money moment |
|---|---|
| E-commerce / apparel / retail | product purchase — the Buy Now analogue Rob described |
| Roofing / contractors | deposit on a booked job (= §3f mechanic #1, already banked) |
| Title / real estate | fee payment (escrow-adjacent flows still untouched by this tracker) |
| Services generally | invoice pay · booking deposit · retainer |

**And his three stated reasons, verbatim: *"a convenience to the customer, a way to convert on more sales for
the business owner, and a profit center for MLE."*** Those are three different beneficiaries and the packet
should say all three — the first two are why a client buys it; only the third needs a processor decision.

**Net effect: Q62 is NOT Rob-blocked.** What remains is engineering (§7.4's rail + the constraint in §7.7)
and the rung question, which is Q60/Q61's, not a new one.

### 7.6 What was done with this (2026-07-25) — and what deliberately was not

- ✅ Dump captured verbatim → `docs/plans/sources/ROB-CHAT-COMMERCE-DUMP-2026-07-25.md`
- ✅ Folded here as §7 (additive — no existing section, figure, or recommendation edited)
- ✅ New line added to the §5 checklist (attach-rate evidence + vertical question)
- ✅ Queue item **Q62** opened in `BUILD-QUEUE.md`, classified ADD-ON and placed **below** Q60/Q61 and below
  all P1 work — §3g's rule applies here too: this is downstream of P1
- ✅ Addendum panel added to the 8/8 decision packet (dated, additive; the four recommendations untouched)
- ❌ **NOT** added to `phase-one-explainer.md` §2 or to any client-facing scope — that section is generated
  from signed agreements (`phase1_engine.py build_scope()`), and nothing enters it that is not in a signed
  agreement. This is a **Phase-2+ / add-on candidate** until Rob decides otherwise
- ❌ Nothing built, nothing signed, no processor committed, no money field touched

*(§7.6 written before Rob's correction in §7.5. The "not added to client-facing scope" and "nothing built"
lines still stand; the Rob-gated-on-vertical line does not — superseded by §7.5 and §7.7.)*

### 7.7 🔴 Rob's own "why" — and the direct answer to *"I'm debating signing up as an ISO or a PayFac or whatever"*

Rob, 2026-07-25: *"if I'm going to offer that service, I would like to get a piece of the profit from the
processing fee… Merchant accounts that you have in your portfolio also have a high multiple attached to them
for resale."* That is the clearest statement of the thesis yet, and it lands on evidence already banked here.

**Answer, stated plainly: you do not need to be an ISO or a PayFac to take a piece of the processing profit.**
The residual comes from the **Schedule A**, not from the rung. At the **$0 independent-agent** rung, every
merchant boarded on Rob's code pays him a residual for the life of the account — that is §3g's $35–50 per
merchant per month, at **zero** carrying cost. The rungs buy *other* things:

| What Rob wants | $0 agent (rec 1) | Registered ISO (~$20–30k/yr) | **PFaaS** (Rainforest/Moov/Finix/Tilled) | Registered PayFac |
|---|---|---|---|---|
| "A piece of the profit from the processing fee" | ✅ **yes, today** | ✅ better splits | ✅ per-transaction economics | ✅ |
| Portfolio with a resale multiple (25–40× monthly, §3g) | ✅ **but only if NN#3 is in the paper** | ✅ same caveat | ⚠️ different asset shape | ✅ |
| Chatbot takes the payment (hosted checkout / payment link) | ✅ yes | ✅ yes | ✅ yes | ✅ yes |
| MLE **owns** the in-chat checkout UX + programs the charge | ❌ no | ❌ no — registration ≠ a rail | ✅ **this is the one** | ✅ |
| Adds switching cost (§3f) | ❌ zero | ❌ zero | ✅ yes | ✅ yes |
| Rep may quote rates / submit apps in MLE's own name (§3h) | ❌ speech-limited | ✅ | ✅ | ✅ |
| Cost to stand up | **$0** | ~$20–30k/yr → needs **50–70 merchants** to break even ≈ 3× today's network (§3g) | not yet sourced → new §5 line | only in the ~$10–100M band (7/23) |

**Two consequences that change how the 8/8 packet reads, without changing rec 1:**

1. **The re-sale point re-ranks the non-negotiables.** Rob is explicitly buying a *saleable asset*, so
   **NN#3 — third-party portfolio sale rights — stops being fourth on a checklist and becomes the deal-breaker
   clause.** §3d already found the trap: SignaPay's published *"portfolio buyouts"* is **SignaPay as buyer**,
   which is not the right to sell to a third party. A residual book you may only sell back to the processor
   does not carry the 25–40× outside multiple. **This is now the first thing to check on any Schedule A.**
2. **His goal splits across rungs the same way §3f's did — and the split is now cleaner:** *"get a piece of
   the processing profit"* is available **at rung 1, immediately, for $0**. *"MLE owns the in-chat Buy Now
   experience across the whole book"* is the **PFaaS** conversation. They are sequential, not either/or, and
   nothing about starting at rung 1 forecloses PFaaS later — but PFaaS becomes worth pricing only when the
   number of live MLE sites running a paying chatbot is real, which is the same denominator §3g identified.

**Engineering constraint that must be in the spec (new, from this framing):** *"collect payment before the
customer even gets to the checkout page"* means card data would be captured inside a chat surface driven by an
LLM. **Card data must never enter the model's context or our logs** — the chat hands off to a hosted field /
hosted payment page / tokenized element (Square payment links or Helcim's HelcimPay.js per 7/23), and the bot
only ever sees a token and a status. That posture is also what keeps MLE at **PCI SAQ-A** instead of dragging
the whole dashboard into PCI scope. The 2025 agentic-commerce standards banked on 7/23 (Mastercard Agent Pay,
Visa Intelligent Commerce/TAP, Google AP2) exist for exactly this transaction shape — worth tracking as the
standardized version of what Rob is describing, not as a dependency.

**What this does NOT do:** it does not add a number to §7.3's attach hypothesis (still unsourced, still not
invented), and it does not move rec 1. If anything it hardens rec 1 — Rob's stated near-term goal is fully
served at $0, and the rung that would serve the *other* half has no sourced economics yet.

---

**Changelog**
- 2026-07-25 — Opened by Max on Rob's directive. Dump captured + folded, 7/23 prior work linked,
  Amplipay first-pass + OTC counterparty flag, gap analysis vs 7/23 short-list, reminder + itinerary armed.
- 2026-07-25 (driver inc.1) — **§3a added; the OTC:APGP financials line is CLOSED.** APGP is a 1990
  oil-and-gas shell (Osyka Corporation) renamed to AmpliPay Group on 2025-06-12 with a 1-for-500 reverse
  split, ~US$82k market cap, and **no SEC financials at all** (the only EDGAR "Osyka" registrant
  deregistered via Form 15-15D in 2008). EDGAR CIK linkage explicitly marked unconfirmed — address/SIC
  mismatch stated rather than smoothed. Sponsor-bank line promoted to top agenda item; residual-
  survivability line escalated to essential. Posted to the ledger as a high-severity flag.
- 2026-07-25 (driver inc.2) — **§3b added; the Shift4 partner-contract-history line is CLOSED**
  *(row backfilled by inc.3 — inc.2 wrote §3b and the checklist but missed this changelog entry; the
  omission is recorded rather than silently patched).* Feb 2022 unilateral discontinuation of ancillary-
  fee residual streams effective 4/1/2022, replaced by a one-time buyout with a **10-year** merchant
  non-solicit; SEC filings describe buying out "over a hundred" partners' residual obligations; 2018
  antitrust suit (Payment Logistics, S.D. Cal.); Jan 2025 **$750k SEC penalty** for undisclosed
  related-person residual commissions. **Fails non-negotiables 1 and 3 on conduct; 2 and 4 UNKNOWN**
  (Authorized Partner / SkyTab T&C PDFs are HTTP 403 to automated fetch — needs a human browser pull).
  Posted to the ledger as a high-severity flag.
- 2026-07-25 (driver inc.3) — **§3c added; the Amplipay merchant-count/volume line is CLOSED, as a
  negative.** No third-party figure exists and the corporate site `amplipaygroup.com` (a **second domain**
  beside `amplipay.ai`) publishes **"0+ Customers / 0+ World Active User / 0% Satisfaction"** placeholders.
  Operating substance appears to be brand/subsidiary **eDataPay** (Boca Raton) — a **high-risk merchant
  specialist** claiming "over 18 years", publishing no count, no volume, no acquiring bank; its joint
  "with AmpliPay Group tools" dispute product is the only independent corroboration of the link. Ticker
  **OSKAD** corroborates §3a's name-change/reverse-split. **§3a refined:** two OTC alternative-reporting
  disclosure docs (`484380`, `506506`) DO exist — none at the SEC still stands — but they are **unread**
  (otcmarkets.com served a site-wide "Temporarily Unavailable" page all session); logged as a retry with
  no figure quoted. Two new agenda items: count+volume in writing, and **which entity counter-signs the
  Schedule A**. Posted to the ledger as a high-severity flag.
- 2026-07-25 (driver inc.4) — **§3d added; the Maverick/SignaPay line is HALF-CLOSED — the MERITS half.**
  The rejected-vs-never-surfaced half stays Rob-only (transcripts still unreadable), so the merits were
  pre-answered instead: **neither company publishes a single one of the four non-negotiables.** Maverick's
  *"free unlimited downstream sub-agent management"* survives the check at marketing level (NN#4 🟡), but
  **23 BBB complaints in 3 years** are dominated by **held reserves and abrupt merchant closures** — which
  under Rob's model would be his own roofing/title customers, so it runs backwards into P1. SignaPay is far
  quieter (**3 complaints**); its published *"portfolio buyouts"* is **SignaPay as buyer**, not the
  third-party sale right NN#3 means, and a BBB complaint alleging **a rep signed an equipment lease in a
  merchant's name** reframes NN#4 as sub-agent **liability**, not just permission. 2015 Priority Payment
  Systems v. SignaPay logged as inter-ISO and 11 years old, not agent-facing. **Neither disqualified.**
  Headline: **4 candidates, 4× the public record cannot settle the non-negotiables** → the strongest
  affirmative argument yet for Q61 rec (1), $0 independent agent across **multiple** Schedule A's. New
  human-browser-pull line (cardpaymentoptions 403). Posted to the ledger as a flag.
- 2026-07-25 (driver inc.5) — **§3e added; the sponsor-bank line's public record is EXHAUSTED and converts
  from "unworked" to "company-blocked".** No sponsor / acquiring / member bank is named on any of five
  Amplipay/eDataPay properties — including the page literally titled *banking partnerships and lucrative
  residual commissions*, which offers only *"Residual income means you earn money every time a transaction is
  made"* with no ownership, duration, or portability terms. **The new fact: the Visa/Mastercard-mandated
  *"registered ISO/MSP of [Bank], [City], [State]"* disclosure (missing = fineable up to $25,000) is absent
  everywhere**, from a company that self-describes as a *"Bankcard ISO"* — a compliance-posture signal, not a
  neutral gap. Stated with its limit: absence from marketing ≠ no sponsor bank; a merchant agreement would
  carry it, and that document is what Rob doesn't have. Entity sprawl logged (five live domains + LinkedIn as
  *"eData Financial Systems Inc."*; affiliated `panamapayments.net` no longer resolves), which makes §3c's
  *which entity counter-signs* load-bearing. Line converted to a **call gate** for the 7/28 chase: sponsor
  bank + acquiring BIN in writing before any Schedule A review. Counterparty pattern is now **5-for-5**
  unverifiable → hardens Q61 rec (1). Posted to the ledger as a flag.
- 2026-07-25 (driver inc.6) — **§3f added; the SWITCHING-COST MECHANIC line is CLOSED, and §6 is answered.**
  OTC retry attempted first and otcmarkets.com **still serves the site-wide "Temporarily Unavailable" page**
  (2nd consecutive run; verified by direct request to both `/otcapi/company/financial-report/{484380,506506}/content`
  — HTTP 200 but the outage HTML body, i.e. a platform outage, not a block on us), so that line stays open,
  unread, nothing quoted. Mechanic named: **the AI agent transacting** (AIDRE deposit-on-call, AIVA
  card-in-chat) — the sold outcome is a *booked-and-paid job*, inseparable from the rail; #2 the second brain
  as revenue system-of-record (Q40); #3 data-derived money products, out of reach (needs PayFac-band volume +
  capital); #4 **dual pricing is NOT lock-in** — it is the acquisition wedge, and it is symmetric. Evidence
  banked with traceable originators only (Visa VCA: +19pp volume growth / 5% less attrition for verticalized
  acquirers; BCG × Adyen 2025: 2.5× retention; Clearly Payments 2026: 2–4× retention, 90%+ for embedded
  platforms, and the baseline that matters — **contractors/home services churn 15–30%/yr, 3–6 yr life**;
  Apideck: attach *"often remain below 20%"* when a platform sells payments alone). A widely-repeated
  *"5% vs 18% churn / 40% lower"* pair was **rejected** — vendor blog, no attribution on those claims.
  **The finding with teeth: every mechanic requires Rob's software to PROGRAM the rail (PFaaS posture), so at
  the $0-independent-agent rung — the rung §3b–§3e keep hardening — switching cost added is ZERO.** Rob's
  thesis splits across rungs: revenue now at rung 1, switching cost as a Phase-2+ engineering decision.
  Q61 rec (3) is now pre-drafted, rec (1) gains a mandatory caveat, rec (4) gets an honest denominator
  (model against a 3–6 yr merchant life, and apply the retention multiple only to a rung that integrates).
  Posted to the ledger as a flag.
- 2026-07-25 (driver inc.7) — **§3g added; the REVENUE MODEL line is CLOSED — the last purely-analytic line on
  the checklist.** OTC retry ran first for the 3rd consecutive run and otcmarkets.com **still serves the site-wide
  "Temporarily Unavailable" page** (HTTP 200 + outage HTML), so that line stays open, unread, nothing quoted;
  it now carries a fallback — ask Amplipay for the filings directly on the 7/28 chase. **Per-merchant residual:
  $35–$50/month**, from two independent routes that converge — CCSalesPro's worked **$70 gross margin** × its
  verbatim *"industry average right now is probably about 50%"* split, and a $30k/mo merchant × Strictly's 2026
  **15 bps** profitability floor. **Denominator taken first-party rather than from industry averages: 19 orgs /
  8 deals counted directly against prod Supabase this run**, then discounted by §3f's already-banked Apideck
  *"attach often remain below 20%"* → **~4 merchants ≈ $140–200/month near-term.** A widely-repeated *"$10,000
  (2020) → $23,000 average monthly credit card spend"* study (Akcigit/Chhina/Cilasun, BFI/NBER, 1.6m businesses)
  was **rejected, not banked** — it measures small businesses *spending on* business cards as buyers, the opposite
  side of the transaction from merchant acceptance volume. **The finding that reframes the add-on: monthly cash is
  the wrong question. A residual book sells at 25–40× monthly (Strictly 2026), and every scenario is driven by one
  variable — MLE's customer count — so the payments layer is DOWNSTREAM of P1, not competing with it; an hour moved
  from P1 to payments lowers the payments outcome too.** Second hard number for Q61 rec (1): the **registered-ISO
  rung at ~$20–30k/yr needs ~50–70 merchants to break even ≈ 3× the entire current MLE Network**, a sourced
  disqualifier for jumping rungs on 8/8. rec (1) now rests on three independent legs (unverifiable counterparties
  §3b–§3e, zero switching cost at rung 1 §3f, negative ISO-rung unit economics §3g). Explicitly noted: **none of
  this model moves if the Rob-blocked legs open** — transcripts/OTC/Schedule A's change *which counterparty*, not
  *how much per merchant* — so the line closes rather than staying provisional. Posted to the ledger as a flag.
- 2026-07-25 (driver inc.8) — **§3h added; the ENTITY line is PRE-ANSWERED, and Q61's fourth and last
  undrafted recommendation now exists in evidence form.** OTC retry ran first for the **4th consecutive run**
  — otcmarkets.com still serves its site-wide "Temporarily Unavailable" page (HTTP 200 + outage HTML on
  `/otcapi/company/financial-report/484380/content`), so that line stays open, unread, nothing quoted.
  **Recommendation: BoostUp Payments signs alone and owns the residual; MLE / AI VoiceTech are distribution
  only and never appear on the processor paper, under a written arm's-length intercompany referral agreement
  (MLE's own customers are the merchants — §3g's denominator).** The finding that reframes the line is
  Visa's own TPA registration program: an unregistered referral entity marketing **in its own name** *"may
  only generate leads"* and **may not** discuss pricing/fees/rates, draft contracts or submit applications;
  to do those unregistered it must *"solicit and market in the name of the registered ISO."* Registering to
  escape that fork is **$5,000 initial + $5,000 annual at Visa alone, per agent per region**, and the DBA
  workaround is closed by Visa's own *"a DBA is not a separate legal entity"* rule. **So rec (1) gains a
  fourth independent leg — a capability one: the $0-agent rung is not just cheap-and-limited, it is
  speech-limited**, which the packet must say plainly rather than let a rep discover it mid-call. Rob's
  remaining entity call is **own-name lead-gen vs. marketing under the ISO's name**, not "who signs".
  Currency caveat recorded rather than smoothed: the FAQ read is the **May 2016** edition via Visa's
  `visa.pt` mirror (`usa.visa.com` 403s automated fetch) — a human browser pull of the current US edition
  joins the Shift4 T&C / cardpaymentoptions bucket, and the fee figures are order-of-magnitude until then.
  New 7/28 agenda item from the HR-ISO row: **ISO or HR-ISO boarding type**, given §3c's eDataPay high-risk
  finding. Posted to the ledger as a flag. Docs-only; nothing signed, no processor committed.
- 2026-07-25 (Rob dump #2, evening) — **§7 added: the DELIVERABLE-SIDE question is now on record for the
  first time.** Rob asked whether he had ever referenced putting a payment processor *inside MLE's
  deliverables* — specifically a client website whose chatbot acts as a **personal shopper with checkout
  inside the chat**. Searched: **0 hits** for *shopper / cart / storefront / e-commerce* anywhere in
  `~/Projects/MyLocalEverything`; Phase One's delivered scope (`phase-one-explainer.md` §2, generated from
  `phase1_engine.py build_scope()`) and the Q40 phase model both contain **no commerce and no payment
  component**. What *did* exist — and was **not overwritten** — is the rail-level work from 7/23 (Square
  payment links / Helcim HelcimPay.js / x402 for chatbot checkout; Mastercard Agent Pay, Visa Intelligent
  Commerce/TAP, Google AP2) plus §3f mechanic #1 (*AIVA card-in-chat*), all of which is filed under **AIVA
  the product**, never under **MLE the deliverable**. **Why it matters to 8/8: it moves §3g's softest term.**
  §3g's ~4-merchant denominator rests on Apideck's banked *"attach often remain below 20%"* — a figure about
  platforms that **sell** payments separately. Shipping checkout as part of the deliverable makes boarding an
  onboarding step rather than a second close; recorded as a **named hypothesis with no number attached** (no
  attach figure for product-delivered payments has been sourced, and none was invented) → new §5 line.
  **§3f's constraint carries over unchanged:** switching cost still needs a programmable rail, so rung 1 can
  ship in-chat checkout and earn the residual but adds **zero** lock-in — rec (1) is unchanged, rec (3) gains
  a concrete MLE-side embodiment, rec (4) gains the attach lever. **Flagged, not assumed: "personal shopper"
  implies a catalog, and neither roofing nor title/RE has one** — the three readings (contractor deposits /
  RE-title fees / a new catalog ICP) are written down side by side as a Rob-only call, and nothing is built
  until he picks. Deliberately NOT added to `phase-one-explainer.md` or any client-facing scope (that section
  is generated from signed agreements). Queue item **Q62** opened below Q60/Q61 and below all P1 work.
  Both re-fed links (OpenRouter room, ChatGPT conversation) re-checked: **still unreadable** (session-scoped /
  HTTP 403) — same two links already logged in the morning dump; the export ask is now twice-asked.
  Docs-only: nothing built, nothing signed, no processor committed, no money field touched.
- 2026-07-25 (Rob correction, same evening) — **§7.5 STRUCK AND REWRITTEN, §7.7 ADDED. Max's vertical gate was
  wrong and is recorded as wrong rather than quietly replaced.** Max read *"personal shopper"* as implying a
  catalog and therefore a vertical choice, and blocked Q62 on it. Rob: *"we have customers across every
  vertical… some of those will inevitably be ecommerce… I was just using an eCommerce site as an example."*
  **The correct framing is a HORIZONTAL capability on an add-on MLE already plans to ship** — the embedded
  chatbot rides the websites MLE spins up, AIVA gets trained per vertical once finished (e-commerce being one
  training target: *"what color? Red. what size? XL"* → pull product image + description into the chat →
  buy in-chat), and the money moment varies while the capability does not (product purchase · deposit on a
  booked job · fee payment · invoice/retainer). **The design principle is Amazon's Buy Now button beside Add to
  Cart — fewer steps, payment collected before the customer reaches a checkout page.** Rob's three reasons,
  verbatim: *"a convenience to the customer, a way to convert on more sales for the business owner, and a
  profit center for MLE."* **§7.7 answers his actual open debate — *"I'm debating signing up as an ISO or a
  PayFac or whatever"* — from banked evidence: you do NOT need to be either to take a piece of the processing
  profit. The residual comes from the Schedule A, not the rung; rung 1 pays it at $0 on every merchant boarded
  on Rob's code. What PFaaS buys, and neither the agent nor the registered-ISO rung does, is OWNING the in-chat
  checkout and programming the charge — i.e. the switching cost. Sequential, not either/or; rec 1 is unchanged
  and arguably hardened, since Rob's stated near-term goal is fully served at $0.** Two knock-ons, both new §5
  lines: **(1) NN#3 (third-party portfolio sale rights) is promoted from fourth checkbox to DEAL-BREAKER
  CLAUSE** — Rob explicitly cites the 25–40× resale multiple as a reason for the initiative, and §3d already
  caught SignaPay publishing *"portfolio buyouts"* meaning **itself as buyer**, which does not carry an outside
  multiple; **(2) PFaaS revenue-share economics (Rainforest/Moov/Finix/Tilled) are UNSOURCED** — rung 1 and the
  ISO rung both have sourced economics here, PFaaS does not, so the ISO-vs-PayFac comparison is not honest
  until they exist. **New engineering constraint written into the spec:** collecting payment inside an
  LLM-driven chat means **card data must never enter the model context or our logs** — hosted field / hosted
  page / tokenized element only (Square payment links, Helcim HelcimPay.js per 7/23), bot sees a token and a
  status, target posture **PCI SAQ-A**; the 2025 agentic-commerce standards (Agent Pay, Visa TAP, Google AP2)
  are the standardized version of this transaction shape, tracked not depended on. **No new number was
  invented:** §7.3's attach hypothesis is still unsourced and still labelled as such. Q62 unblocked and
  rewritten horizontally; packet addendum updated (recs 1–4 still untouched). Docs-only.
- 2026-07-25 (driver inc.9) — **§7's deliverable-side capability now has a written spec:
  `docs/plans/IN-CHAT-COMMERCE-SPEC.md`** (BUILD-QUEUE Q62 DoD legs 1 + 2; PRD 3.1.133). Flow written ONCE,
  horizontally, money moment as a parameter (discover-or-quote → select-or-scope → pay-in-chat → receipt →
  CRM activity; stages 3–4 identical in every vertical). Rail named from the 7/23 short-list (Square payment
  links / Helcim HelcimPay.js) with the posture that **rail selection follows the Schedule A** — a rail Rob
  cannot board under his own code pays him nothing (§7.7). §7.7's card-data rule promoted to a hard,
  consequence-pinned constraint (PCI SAQ-A; a card field in our DOM = a new decision; non-collection is the
  control, redaction only a backstop; the rule binds voice too). The storefront leg is written up with its
  catch printed: platform-checkout shape can deliver the convenience with **no residual**; charge-then-write
  shape must answer partial failure first. **No new number invented** — §7.3's attach hypothesis and the
  matching §5 checklist line stay open and unsourced. Docs-only; nothing signed, no processor committed,
  no money field moved.
- 2026-07-25 (driver inc.10) — **§5's deliverable-side line (b) CLOSED → new §3i: the ATTACH RATE, §3g's
  softest number, now has sourced bounds.** Shopify Payments = **67% of GMV, Q1 2026** (64% prior-year
  quarter) for checkout shipped *inside* the product — [SEC Form 10-Q FY2026 Q1], first-party and audited,
  the heaviest evidence in the file — against §3g's banked Apideck ***"often remain below 20%"*** for
  payments **sold separately**. Both sit inside the ***"20% to 90+%"*** vertical-SaaS spread published by a
  named operator (**Ronnie Gurion, COO of Clio**), who also supplies the mechanism: payments as a **core
  product** in quotas → *"maximum attach"*; a **SPIFF** → *"still gets treated like a secondary product."*
  Stripe's 200+-company 2025 benchmark corroborates direction (median attach *"has doubled in 1 year"*;
  87% vs 30% offering payments) and is weighted **medium** because the absolute median is not published.
  **Toast recorded as a CONTRAST not a benchmark** — ~100% attach by contractual requirement, third-party
  sourced. **Direction corroborated, magnitude for OUR mode unpublished and not invented:** no figure exists
  for a third-party-built site whose chatbot takes the payment with the merchant on the *builder's*
  Schedule A, so **67% is a directional ceiling and §3g's sub-20% denominator stands as the planning
  number.** The tempting blend of 67% and 20% into a "realistic" attach was **explicitly refused and the
  refusal written down**, so no later run can quietly manufacture it. §7.3 left as written with a dated
  UPDATE block beneath it. Reclassifies chat-commerce from nice-add-on to **the single identified lever on
  the term that makes the add-on small** (~3× on §3g at constant customer count) — a **product** decision
  (Q62), not a **rung** decision (Q61); rec (1) untouched. Standing otcmarkets retry **timed out** this run
  (5th consecutive failure) — nothing quoted, line stays open. Docs-only; nothing signed, no processor
  committed, no money field moved.
- 2026-07-25 (driver inc.11) — **§3j added: the 7/28 Amplipay chase now has a CALL SHEET —
  `AMPLIPAY-CALL-SHEET-2026-07-28.html`, one screen, every claim sourced.** Picked because the chase is the
  only live non-Rob leg on this DD and it is 3 days out. Retries ran first and both failed honestly:
  otcmarkets served its site-wide "Temporarily Unavailable" page for the **6th consecutive** attempt (HTTP 200
  + outage HTML, direct request — platform outage, not a block on us), and the three human-browser pulls were
  re-attempted with full browser headers → Shift4 partner T&Cs **429**, cardpaymentoptions/SignaPay **403**,
  current Visa TPA FAQ **403**; nothing quoted from any of them. **No new evidence was produced and none was
  needed** — eight agenda items had accumulated across §3a/§3c/§3d/§3e/§3h with nowhere they were written in
  the order they must be asked. The sheet's one contribution is structure the evidence already implied:
  **three GATE questions in writing before any Schedule A is read** (sponsor bank + BIN + published ISO/MSP
  disclosure language · which entity counter-signs, AmpliPay vs eDataPay · SEC reporting status/CIK and *send
  the OTC filings directly*), because all four non-negotiables are claims against whoever's paper the residual
  sits on; then six follow-ups in order with the Schedule A **last** and §3b printed as the reason; then the
  four-non-negotiable scorecard entering the call — **4× UNKNOWN**, each row stating what the record does show
  rather than leaving a blank. **What the call cannot change is printed on the sheet:** it decides *which
  counterparty*, never the rung and never the arithmetic (§3g). House limit on the artifact's face — this call
  produces evidence, never a signature. Docs-only; nothing signed, no processor committed, no money field moved.

- 2026-07-28 (driver inc.48) — **THE OUTAGE SPLIT, AND THE 7/28 CONTINGENCY FIRED.** Watchdog recovery run;
  dev_chat re-queried first (newest rob **#53** < newest max **#55**, nothing unanswered, nothing posted).
  Q68 and Q69 were both re-verified hard-gated on Rob before this item was picked: prod
  `scripts/call-arming-ask.mjs` returns `verdict: closed (reached: nothing)` with `TWILIO_AUTH_TOKEN` +
  `DEEPGRAM_API_KEY` still `[MISS]`, and n8n workflow `JnIJiCbOqSaK8uN2` still answers *"Workflow is not
  available in MCP"* (Q69 inc.47's filed gate re-confirmed from this session, not assumed).
  **The 8th otcmarkets retry produced a NEW fact rather than an 8th identical outage note:** the outage is
  now **partial** — `www.otcmarkets.com` has recovered and serves the real site, while the **document tier
  is still down** on both hosts (`www` *and* `backend`), returning the 2116-byte *"Temporarily Unavailable"*
  page for both report ids `484380` and `506506`. **Written down because it is a trap:** a future retry that
  checks only the homepage would read "back up" and close this line against a page containing no filing —
  the exact failure this tracker exists to prevent. Four days running (7/25 → 7/28) makes it a sustained
  data-tier outage, not a blip.
  **The contingency written on 7/25 has therefore fired on its own terms:** *"if still down by 7/28, fold
  into the Amplipay chase call"* — so asking Amplipay for its OTC disclosure filings directly is now the
  **only** route to these two documents, promoted from fallback to sole path, and it is the one item on the
  chase sheet that no further Max-side retry can close.
  **Nothing was re-derived as new:** the SEC half of this question was already CLOSED in §3a on 7/25, and an
  EDGAR re-check this run agreed with it rather than adding to it (zero filings matching *"Amplipay"* in
  full-text search 2001–present; no `APGP` ticker and no Amplipay registrant in SEC's 10,432-entry ticker
  registry; all 100 EDGAR `APGP` string hits belong to unrelated filers — Atairos Partners GP, Bowlero).
  Recorded as a confirmation of §3a, **not** as a second closure of a closed line.
  Filed to the ledger per the findings protocol. Docs-only: no code, no tests, no deploy, nothing signed,
  no processor committed, no money field moved. **Q60 stays UNTICKED** — every remaining line is Rob-only,
  human-browser-403, or now routed through the chase call.
