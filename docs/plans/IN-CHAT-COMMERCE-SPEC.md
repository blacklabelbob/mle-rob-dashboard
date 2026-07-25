# SPEC: In-Chat Commerce — the "Buy Now" chatbot as an MLE deliverable

**Created:** 2026-07-25 (Rob's local date, ET) · **Status:** DRAFT — scope only, no code authorized
**Owner:** Rob + Max · **Queue item:** BUILD-QUEUE **Q62** (ADD-ON, below all P1 work)
**Source of the ask:** `docs/plans/sources/ROB-CHAT-COMMERCE-DUMP-2026-07-25.md`
**Evidence base:** `docs/research/PAYMENTS-LAYER-DD-2026-07-25.md` §7 (esp. §7.3, §7.4, §7.5, §7.7), §3f, §3g;
7/23 swarm `docs/research/payments-deep-research-2026-07-23.md` (rail short-list, agentic-commerce standards)

> **What this document is.** Q62's DoD leg (1) — the flow, written **once, horizontally**, with the money
> moment as a *parameter* — and leg (2) — the rail named, with the card-data constraint written in as a hard
> rule. It is a scope document. **Nothing here authorizes code, commits MLE to a processor, moves a money
> field, or enters `docs/training/phase-one-explainer.md` §2** (that section is generated from *signed*
> agreements by `phase1_engine.py build_scope()` and is client-facing).
>
> **Leg (3) CLOSED 2026-07-25 → §6.** The attach rate is no longer a numberless hypothesis: payments shipped
> *inside* the product runs **67% of GMV** (Shopify, Q1 2026 SEC 10-Q) against Apideck's **sub-20%** for
> payments sold separately, inside a published **20–90+%** vertical-SaaS spread. **What is still not
> established — and is not invented — is the figure for OUR delivery mode**; see §6 for the bound.
>
> **Still open on Q62 after this doc** (tracked in the queue item, not solved here): leg (4) placement —
> Phase-2+ add-on vs. a component in the Q40 Blueprint phase model — which is **Rob's call**, written into
> the PRD once made.

---

## 1. The capability, in one sentence

**The chatbot embedded on the website MLE builds for a customer can close the money moment inside the chat —
in fewer steps than the customer's own checkout — and every one of those transactions runs on a merchant
account boarded under Rob's Schedule A.**

Rob's design principle, verbatim: *"the Amazon Buy Now button next to Add to Cart"* — fewer steps, **collect
payment before the customer ever reaches a checkout page**. His three reasons, verbatim: *"a convenience to
the customer, a way to convert on more sales for the business owner, and a profit center for MLE."*

**It is HORIZONTAL** (Rob, 2026-07-25, DD §7.5 — correcting Max's first read, which wrongly gated this on
picking a vertical): *"we have customers across every vertical… some of those will inevitably be ecommerce…
I was just using an eCommerce site as an example."* The capability is one build; AIVA is trained per vertical
once it is finished; **only the money moment varies.**

---

## 2. The flow — written once, money moment as a parameter

Five stages. Stages 1, 2 and 5 vary by money moment; **stages 3 and 4 are identical in every vertical** and
are where the payments layer actually lives.

| # | Stage | What it is | Varies? |
|---|-------|-----------|---------|
| 1 | **DISCOVER or QUOTE** | The bot establishes *what is being paid for*: a catalog item, a scoped job, a named fee, an open invoice. | ✅ per money moment |
| 2 | **SELECT or SCOPE** | The customer confirms the specific thing + amount. Ends with an **amount, a currency, a description, and an idempotency key** — the contract stage 3 consumes. | ✅ per money moment |
| 3 | **PAY IN CHAT** | Hosted payment surface opens **inside/over the chat**. Card data goes to the processor, never to us (§4). Bot receives **a token and a status** — nothing else. | ❌ identical |
| 4 | **RECEIPT** | Processor-issued receipt to the customer; confirmation message in chat; failure/decline path is an explicit branch, not a dead end. | ❌ identical |
| 5 | **CRM ACTIVITY** | A payment activity lands on the right CRM record (person + org + deal where one exists), same shape the dashboard already renders. **Plus, for storefronts only, the order lands back in the merchant's store (§5).** | ⚠️ stage 5b varies |

### 2.1 The four money moments this must cover

| Money moment | Vertical (example) | Stage 1–2 shape | Amount source | Stage 5b store leg? |
|---|---|---|---|---|
| **Product purchase** | retail / e-commerce | personal-shopper: browse → pick SKU + variant + qty | store catalog (authoritative) | ✅ **REQUIRED** — see §5 |
| **Deposit on a booked job** | roofing / contractors | qualify job → book slot → deposit % or flat | rule or rep-set, not a catalog | ❌ no |
| **Fee payment** | title / real estate | identify file/closing → name the fee | fee schedule / stated amount | ❌ no |
| **Invoice or retainer** | services | look up open invoice / state retainer | existing invoice record | ❌ no |

**Build order follows this table, not the pitch order:** the deposit / fee / invoice moments are the *simpler
first build* — a single amount and no inventory behind it. The storefront moment carries the whole §5 leg.

### 2.2 Rules that hold in every money moment

1. **The bot never invents an amount.** Every amount traces to a catalog item, an existing invoice, a stated
   fee, or an explicit rule. An LLM-computed price is out of scope by rule, not by preference.
2. **Idempotency is the bot's job.** A chat can be retried, resumed, double-tapped, or reopened on another
   device; stage 2 issues one key per intent and stage 3 must be safe to replay.
3. **Every completed payment produces a CRM activity** — no off-books money moment. This is the same
   principle that makes the dashboard's ledger trustworthy today.
4. **Decline / abandon is a designed branch.** The bot hands back a retry or a human handoff; it does not
   guess whether the money landed. Status comes from the processor, never from the conversation.
5. **The customer can always leave the chat and pay the normal way.** The chat is the fast path, not the
   only path — a broken chat must never be able to block a sale the merchant would otherwise have made.

---

## 3. The rail — named, from the 7/23 short-list

Both candidates already ranked by the 7/23 swarm for exactly this shape (chat/SMS-originated checkout):

| Rail | Shape | Why it is on the list |
|---|---|---|
| **Square** — hosted payment links | Bot generates a link/QR per intent; customer pays on Square's page. | Built for SMS/chat; simplest possible integration; no fields rendered by us. |
| **Helcim** — HelcimPay.js | Hosted **in-widget** modal over our page; card fields belong to Helcim's iframe. | Keeps the customer *inside* the chat surface — closest to Rob's "fewer steps" principle. |

**Recommended posture for the first build: link-based (Square-shape) for the deposit/fee/invoice moments,
in-widget (HelcimPay.js-shape) where the storefront experience justifies it.** Both are hosted; both keep §4
intact. Neither is committed to — **rail selection follows the Schedule A, not the other way round**: which
processor Rob boards on (Q60/Q61, decision 2026-08-08) constrains which rail earns him the residual, and a
rail that cannot be boarded under his own code is a rail that pays him nothing (§7.7).

**Tracked, not depended on:** the 2025 agentic-commerce standards banked 7/23 — Mastercard Agent Pay, Visa
Intelligent Commerce/TAP, Google AP2, x402 for agentic USDC — are the standardized version of this exact
transaction shape. Watch them; **do not build on them yet.**

---

## 4. 🔴 HARD CONSTRAINT — card data never touches the LLM or our logs

**Rule (non-negotiable, from DD §7.7):** the chat surface hands off to a **hosted field / hosted payment page /
tokenized element**. The bot sees **a token and a status**. Card number, CVV, expiry, and full PAN never enter
the model's context window, our prompts, our transcripts, our application logs, or Supabase.

Consequences that must survive into any implementation:

- **PCI posture target: SAQ-A.** Hosted-only is what keeps MLE at SAQ-A instead of dragging the dashboard
  into full PCI scope. Any design that renders a card field in our DOM changes MLE's compliance obligations
  and is therefore a **new decision**, not an implementation detail.
- **Chat transcripts are stored and are LLM context.** That is precisely why the payment step must be a
  handoff, not a conversation turn. "Read me your card number" is prohibited — including as a fallback.
- **Redaction is not the control; non-collection is.** A regex scrubber is a backstop for accidents, never
  the reason the design is safe.
- **The same rule binds voice.** If AIDRE ever takes a deposit on a call, the equivalent is a hosted IVR /
  pay-by-link handoff — the model does not hear the card. (Out of scope here; recorded so the rule is not
  re-litigated per surface.)

---

## 5. ⚠️ The storefront leg — an in-chat sale must land back in the merchant's store

*(Raised by Max, not Rob — flagged as such in Q62. This is a scoping fact, not an objection.)*

For a real e-commerce client, **charging the card is not the whole transaction.** An order taken in the chat
must reach the merchant's own back office, or MLE has manufactured an off-books sale: no inventory decrement,
no fulfillment, no tax/shipping calculation, no order status for the buyer, no refund path for the merchant.

Two acceptable shapes — **pick per client, do not mix within one client:**

- **(A) Chat drives the platform's own checkout** — the bot assembles a cart permalink / hosted checkout on
  Shopify / Woo / BigCommerce and hands the customer into it. Fewest moving parts; the store stays the system
  of record for the order; the platform's payment configuration decides whether Rob's Schedule A earns on it,
  **which is the catch** — this shape can produce the convenience with **no residual**.
- **(B) Chat takes payment, then creates the order via the platform API** — MLE owns the money moment and the
  residual, and must then guarantee the order write, taxes/shipping, and refunds line up with what was
  charged. More surface, more failure modes, and it needs an explicit answer for **partial failure** (money
  captured, order write failed) before any code is written.

**Not decided here.** What is decided: **a storefront money moment is not shippable without one of these two
legs answered in writing**, and (A) vs (B) is the difference between "convenient" and "profitable."

---

## 6. The attach rate — why this capability is worth building at all (Q62 leg 3, CLOSED)

Full evidence and sourcing: **DD tracker §3i**. The short version, because it is the business case for this spec:

| Delivery mode | Attach | Source |
|---|---|---|
| Payments **sold separately** by a platform (refer the merchant, hope they board) | *"often remain below 20%"* | Apideck, banked in DD §3f/§3g |
| Payments **shipped inside the product** (checkout is part of what the merchant bought) | **67% of GMV**, Q1 2026 (64% a year earlier) | [Shopify Inc. Form 10-Q FY2026 Q1 (SEC)](https://www.sec.gov/Archives/edgar/data/0001594805/000159480526000019/shop-20260331.htm) |
| Observed spread across vertical SaaS | ***"20% to 90+%"*** | [Ronnie Gurion, COO of Clio, via Tidemark](https://www.tidemarkcap.com/post/how-to-sell-payments-vertical-saas) |
| What moves a platform up that range | payments as a **core product** in quotas → *"maximum attach"*; a **SPIFF** → *"still gets treated like a secondary product"* | same |

**Why it matters here:** the flow in §2 is the structural version of "core product" — the merchant is not
sold payments, the merchant is shipped a site that already transacts. That is the only identified lever on
the one number (attach) that makes the whole payments add-on small in DD §3g's revenue model.

**The bound this spec must respect — stated, not buried:** there is **no published attach figure for our
actual mode** (a third-party-built website whose chatbot takes the payment, merchant boarded on the builder's
Schedule A). Shopify is a first-party platform monetizing its own checkout. **67% is a directional ceiling,
never a forecast**, and DD §3g's sub-20% denominator remains the planning number until we have our own data.
No blended or averaged attach figure was manufactured to fill the gap.

---

## 7. What this spec deliberately does NOT do

- Does not commit to a processor, sign anything, or move any money field (house limit, restated).
- Does not claim an attach rate for our own delivery mode — §6 gives the sourced **bounds** and says plainly
  that the specific number is unpublished and was not invented.
- Does not decide Phase-2+ add-on vs. Q40 Blueprint component (Q62 leg 4 — Rob's call).
- Does not enter any client-facing scope surface; `phase-one-explainer.md` §2 remains generated from signed
  agreements only.
- Does not change Q61's recommendation (1): at the $0-agent rung this earns the residual and adds **zero**
  switching cost (§3f) — that stays true whether or not this capability ships.

---

**Changelog**
- 2026-07-25 (driver inc.9) — Created. Q62 DoD legs (1) flow-as-parameter and (2) rail + card-data constraint
  written; storefront leg carried in from the queue note as §5. Legs (3) and (4) remain open by design.
- 2026-07-25 (driver inc.10) — **Leg (3) CLOSED: §6 added, the attach-rate business case.** Sourced bounds
  now replace the hypothesis — Shopify Payments **67% of GMV** Q1 2026 (SEC 10-Q) for checkout shipped inside
  the product vs. Apideck's **sub-20%** for payments sold separately, inside Clio-COO Ronnie Gurion's observed
  **20–90+%** vertical-SaaS range, whose stated driver is *core product vs. SPIFF'd secondary product*.
  The bound is printed, not buried: **no published figure exists for our own delivery mode**, 67% is a
  directional ceiling and never a forecast, DD §3g's sub-20% denominator stands, and no blended attach number
  was manufactured. Old §6 renumbered to §7. Full evidence: DD tracker §3i. **Leg (4) placement remains
  Rob's call and is the only open leg.**
