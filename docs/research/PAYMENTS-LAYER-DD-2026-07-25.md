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
- [ ] Resolve: were **Maverick** and **SignaPay** rejected on merits, or never surfaced? — **MERITS HALF CLOSED 2026-07-25, see §3d** (both scored on public evidence: Maverick's *"free unlimited downstream sub-agent management"* survives the check ✅ marketing-level, but **23 BBB complaints in 3 years** dominated by held reserves / abrupt merchant closures; SignaPay is quieter — **3 complaints** — but its "portfolio buyouts" is *SignaPay as buyer*, **not** the third-party sale right of non-negotiable #3, and a 2015 BBB complaint alleges a rep signed an equipment lease in a merchant's name → NN#4 must be asked as sub-agent **liability**, not just sub-agent permission. **Neither disqualified.** Remaining half is Rob-only: did his OpenRouter/ChatGPT searches ever surface them?)
- [ ] **SignaPay**: cardpaymentoptions.com review returns **HTTP 403** to automated fetch — needs a human browser pull (same bucket as the Shift4 T&C PDFs); nothing from it is quoted until read
- [ ] **Amplipay**: sponsor bank named in writing — ⬆️ **the top agenda item** (§3a: an ~$82k-cap issuer means the sponsor bank is the only capitalized party in the chain). **PUBLIC RECORD EXHAUSTED 2026-07-25, see §3e** — no sponsor/acquiring/member bank is named on any of five properties (`amplipay.ai`, `amplipaygroup.com`, `edatapay.com/about`, `/partners`, `/banking-partnerships-and-lucrative-residual-commissions`), and the **card-brand-mandated *"registered ISO/MSP of [Bank], [City], [State]"* disclosure is absent entirely** from a company that self-describes as a *"Bankcard ISO"*. Line now **company-blocked, not unworked**: converts to a **call gate** for the 7/28 chase — *sponsor bank + acquiring BIN in writing, plus your published ISO/MSP disclosure language* — before any Schedule A review is worth doing
- [x] **Amplipay**: OTC:APGP financials pulled (going-concern, cash, dilution) — **CLOSED 2026-07-25, see §3a.** Answer: *there are none to pull.* Not an SEC reporting company (only EDGAR "Osyka" registrant filed Form 15-15D in 2008; last financials on EDGAR are a 10-QSB for Q3 2000). Issuer is a **1990 oil-and-gas shell renamed from Osyka Corporation on 2025-06-12** with a 1-for-500 reverse split, **market cap ≈ US$82,190**, net income ≈ −$127k/qtr
- [x] **Amplipay**: merchant count / volume independently verified — **CLOSED 2026-07-25, see §3c.** Answer: *there is no count to verify.* No third-party figure exists; the company's own corporate site (`amplipaygroup.com`, a second domain alongside `amplipay.ai`) renders **"0+ Customers / 0+ World Active User / 0% Satisfaction"** template placeholders. Operating substance appears to sit in named brand **eDataPay** (Boca Raton) — a **high-risk / hard-to-place merchant specialist** claiming "over 18 years" but publishing no merchant count, no volume, and no acquiring bank. Two new agenda items: merchant count + volume **in writing**, and **which entity (AmpliPay Inc. vs eDataPay) counter-signs the Schedule A**
- [ ] **Amplipay**: read the two **OTC Markets alternative-reporting disclosure documents** (report ids `484380`, `506506`) — they exist (refines §3a's "no financials": none at the **SEC**, but OTC alt-reporting filings are on file). Unread this run: otcmarkets.com served a site-wide *"Temporarily Unavailable"* page all session. **Retry next run** — no figure from them is quoted anywhere until read
- [ ] **Amplipay**: booking held (submitted 7/24 — chase if no reply by 7/28)
- [x] **Shift4**: partner-contract history flag investigated (7/23 raised it, never closed) — **CLOSED 2026-07-25, see §3b.** Answer: *the history is real and adverse.* Feb 2022 Shift4 unilaterally discontinued ancillary-fee residual streams effective 4/1/2022 and replaced them with a one-time buyout carrying a **10-year** merchant non-solicit (industry norm 16–42 months); SEC filings describe buying out **"over a hundred"** partners' residual obligations plus non-solicitation rights; 2018 antitrust suit (Payment Logistics, S.D. Cal.) over cutting independent interfaces out of the channel; Jan 2025 **$750k SEC penalty** for undisclosed related-person residual commissions. **Fails non-negotiables 1 and 3 on conduct; 2 and 4 remain unknown (T&C PDFs are 403 to automated fetch).**
- [ ] **Both**: Schedule A obtained and scored against the 4 non-negotiables — *Shift4 partially scored from public conduct (§3b); the actual Authorized Partner T&Cs PDF needs a human/browser download (HTTP 403)*
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
