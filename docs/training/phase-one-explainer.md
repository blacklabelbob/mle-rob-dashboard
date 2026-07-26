# Phase One Explainer — Rep Training Doc

**Company:** My Local Everything, LLC ("MLE") · brand: AI VoiceTech
**Signers:** William DeVito (CEO) · Robert Acheson (Managing Director)
**Doc version:** 1.0 · **Created:** 2026-07-04
**Source of truth:** `contracts/` repo — `Phase-I-Agreement-TEMPLATE`, `phase1_engine.py`, `invoice_engine.py`, live client configs (`cg_roofing.json`, `gulf_coast.json`)
**Audience:** any new rep, or a chatbot grounded on this file, that needs to answer "what exactly is Phase One?"

Read time: ~10 minutes. Read it once, then keep it open during your first 10 calls.

---

## 1. What Phase One Is (one paragraph)

Phase One is the client's **first, low-risk step** into working with us. For one flat fee, we build and switch on a set of AI systems for their business — a big SEO/AI-optimized website, a "Living Second Brain" knowledge base that keeps itself updated, and (if they have salespeople/agents) the same setup duplicated per agent, including automated social posting. We start the moment they pay, we go live, and the clock starts on a **30-day performance guarantee**: if it isn't producing results in 30 days, they get every dollar back **and keep everything we built**. There's no long contract, no big commitment — it's a handshake-style agreement that exists to prove we're worth trusting with bigger phases later.

---

## 2. What the Client Gets, Concretely

Everything below is pulled directly from Section 2 of the actual agreement (`phase1_engine.py`, `build_scope()`), so this is what's actually delivered — not marketing copy.

1. **Main Website(s)** — up to a scoped page count (real examples: 500 pages per entity for CG Roofing/Red Rock Roofing; 2,000 pages for Gulf Coast RE Group), built and continuously optimized to be:
   - AI-search boosted, SEO boosted, GEO (generative-engine) boosted, and conversion boosted;
   - designed to grow organic traffic; and
   - automatically updated on an ongoing basis.
2. **A "Living" Second Brain Knowledge System (RAG)** for the company — a retrieval-augmented knowledge base that stays continuously current with everything about the business: its knowledge, market, competitors, personas, visuals, and more. Automatically kept up to date.
3. **Automated Social Media Posting** on **two (2) dedicated business profiles** of the client's choosing — **the standard on every Phase One deal** (Rob, 2026-07-25). More accounts can be added at any time for an additional fee. *Reps: lead with two; it is included, not an upsell. Where a client has an agent layer, per-agent social is scoped separately and on top (Gulf Coast: 45 individual accounts).* **Applies to deals scoped from 2026-07-25 forward** — CG Roofing/Red Rock signed before the standard existed and their agreement carries no social bullet; do not tell them it does.
4. **If the client has agents/salespeople** (optional, scoped per client):
   - A **dedicated website for each agent**, built, optimized, and maintained on the same terms as the main website.
   - A **Living Second Brain** for each agent (same as above, per-agent).
   - **Automated social media posting** on a dedicated profile for each agent.
5. We pull from a library of **44,000+ automations** and may add other high-impact ones we identify once we're in the account — Phase One is intentionally not a fixed checklist; we deploy whatever moves the needle first.

**What Phase One is NOT:** it's not the full build-out. Later phases (booking systems, CRM automation, voice receptionist deployment, deeper integrations, etc.) get their own, more specific agreements once we know what's working. Phase One exists so nobody has to commit to those before we've proven value.

---

## 3. Cost, Payment Terms, and the 30-Day Guarantee

**Fee — CONFIRMED BY ROB (2026-07-04).** The standard Phase One anchor is **$10,000 upfront + $1,000 per month**. Reps lead with that number. Larger scopes are quoted up from the anchor based on entity count, page count, and agent count — live example: Gulf Coast RE Group (1 entity, 2,000-page site, 60 agents with full agent layer) closed at **$18,000** upfront. CG Roofing & Red Rock Roofing (2 entities, 500 pages each, no agent layer) closed at the **$10,000** anchor.

**Payment terms — CONFIRMED BY ROB (2026-07-04).** The **$10,000 upfront is pay-in-full, "Due upon receipt"** (per the invoice config schema) — no installment split of the upfront. The **$1,000/month recurring** begins per the agreement schedule. The Effective Date of the agreement is legally defined as *the date Provider receives payment of the Phase I Fee* — in plain terms: **we don't start the clock, or the work, until they've paid.**

**Go-Live and the Phase I Period.** We begin work immediately after payment. "Go-Live Date" = the date we tell the client the core Phase One services are live and operating. The **"Phase I Period" runs 30 days from the Go-Live Date** (not from the payment date) — unless a later-phase agreement supersedes it.

**The 30-Day Performance Guarantee ("100% Investment Security")** — this is the headline promise, word for word from the signed agreement:
> If the Services have not started producing results for Client within thirty (30) days after the Go-Live Date, Client may request a full refund of every dollar paid, and Provider will refund 100% of those amounts within thirty (30) days of the request. **And Client keeps everything.** All work and technology built during Phase I — the websites, the Living Second Brain systems, the content — remains the client's to keep and use, at no further charge.

To invoke it, the client just has to notify us in writing (email is fine) before the end of the Phase I Period. We will not disable or claw back anything after a refund.

**Ownership.** Once the fee is paid in full (or refunded under the guarantee), the client owns the specific deliverables we built for them. We keep ownership of our underlying automation library/templates/methodology, but the client gets a perpetual, royalty-free license to keep using whatever of our tech is embedded in what we delivered.

---

## 4. How a Deal Flows

```
1. Discovery meeting (recorded, with consent)
      ↓
2. Terms discussed live — fee, entity count, page counts, agent count
      ↓
3. Rob/Will sends the Cover Email (sets tone, recaps what Phase I covers,
   reiterates the 30-day guarantee) — client replies "let's go"
      ↓
4. Will sends the Phase I Agreement via DocuSign
      ↓
5. Three signers: William DeVito (CEO), Robert Acheson (Managing Director),
   and the Client — agreement is e-signed
      ↓
6. Invoice generated from the SAME client data used for the agreement
   (so invoice can never describe different services than what was signed)
      ↓
7. Invoice sent, "Due upon receipt" — Effective Date = date payment is received
      ↓
8. Work begins immediately on payment
      ↓
9. Go-Live — Rob/Will notify the client the core services are live
      ↓
10. Phase I Period clock starts: 30 days to prove results, guarantee active
      ↓
11. Kickoff into delivery / eventual Phase 2 conversation
```

**Note for reps:** steps 1–5 are where you live. Once the agreement is signed, invoicing/delivery is an internal ops handoff — you don't need to chase payment, but you should know the guarantee cold because it's the #1 objection-killer on the call.

---

## 5. The 10 Questions Prospects Actually Ask

**1. "What exactly am I getting for this money?"**
A fully built, AI-optimized website (up to the scoped page count), a self-updating knowledge base ("Second Brain") about your business, and — if you have agents/salespeople — the same setup duplicated for each of them, plus automated social posting. It's built and switched on inside Phase One, not "coming later."

**2. "What if it doesn't work?"**
That's the whole point of Phase One. You get 30 days from go-live to see results. If it's not producing, you get every dollar back — and you keep everything we built. There's no clawback.

**3. "How much does this cost?"**
It's $10,000 upfront plus $1,000 a month — scoped up from there for bigger businesses (more entities, bigger site, agent layer).

**4. "Do I have to sign a long-term contract?"**
No. Phase One is a standalone agreement covering just this phase. If Phase One proves out, we write a new, more specific agreement for the next phase — you're never locked into something bigger than what you've already seen work.

**5. "When do you start, and how fast do I see something live?"**
We start the moment payment is received. Go-Live is whenever the core Phase One services are live and operating — that's when your 30-day guarantee clock starts.

**6. "Who am I actually signing with / who's on the hook?"**
My Local Everything, LLC. William DeVito (CEO) and Robert Acheson (Managing Director) both sign every agreement personally, alongside you.

**7. "What do you need from me to keep this moving fast?"**
Timely access to your accounts, domains, and brand assets, and quick answers to our questions/approvals (we ask for a 2-business-day turnaround). Delays on your end can push the Go-Live date.

**8. "Do I own what you build, or are you holding it hostage?"**
You own the specific deliverables once you've paid in full (or if you get refunded). We keep ownership of our underlying tech/automation library, but you get a permanent, free license to keep using whatever of it is built into your site/Second Brain.

**9. "What happens after the 30 days if I want to keep going?"**
We move into a later-phase agreement — those get more specific because by then we both know what's actually working for you. Phase One is deliberately broad because at day one, nobody knows yet which of our 44,000+ automations will move your needle most.

**10. "Is this some kind of trial or 'freemium' thing?"**
No — it's a real, paid engagement with real deliverables you keep either way. The guarantee isn't "try it for free," it's "we're confident enough to put our fee on the line."

---

## 6. 60-Second Phone Script

> "Here's how this works. Phase One is our starting point together — one flat fee, and for that we build you a full AI-optimized website, a knowledge base about your business that updates itself automatically, and if you've got a sales team, we build the same thing for each of them plus automated social posting.
>
> We start the day you pay, and the moment we flip it live, you get 30 days. If it's not producing results in those 30 days, you get every single dollar back — and you keep everything we built. No catch, no clawback.
>
> There's no long contract behind this — it's literally just Phase One. If it works, and it will, we talk about what's next once we both know what's actually moving the needle for you.
>
> Sound fair? If so, I'll get you the agreement today and we can be live within days."

---

## 7. FAQ for Reps (things reps ask each other, not prospects)

**Q: Can I quote an exact price on the call?**
Lead with the anchor: **"$10,000 upfront plus $1,000 a month."** Bigger scopes (entities / pages / agent layer) quote up from there.

**Q: What if the prospect wants to negotiate the fee?**
[CONFIRM WITH ROB: is there pricing flexibility/discount authority for reps, or does every fee change route through Rob/Will?]

**Q: Who actually signs the agreement?**
Three signatures every time: William DeVito (CEO), Robert Acheson (Managing Director), and the client. Never fewer.

**Q: What if the prospect asks about installment payments?**
Upfront is pay-in-full, due upon receipt — no installments on the $10k. The $1,000/month recurring is separate and standard.

**Q: Do I need to send the agreement myself?**
No — reps should get the verbal "yes," then hand off to Rob/Will, who sends the cover email first and follows with the DocuSign after the client replies.

**Q: What do I say if they ask "why only 30 days"?**
Because that's plenty of time to see whether the core services (website traffic, agent activity, etc.) are producing — and it forces us to move fast and prove value quickly rather than dragging things out.

**Q: Is the guarantee real, or is there fine print that gets us out of it?**
It's real and it's in the signed agreement (Section 5): 100% refund within 30 days of a written request, and the client keeps all deliverables regardless. Don't oversell around this — quote it plainly, it's already strong enough.

**Q: What happens to the invoice/payment process — is that on me?**
No, that's an ops/billing handoff once the agreement is signed. Your job ends at getting the signed agreement; billing and delivery kickoff run separately.

---

## 8. 90-Second Training Video Script

**[0:00–0:10] Hook — on camera or voiceover, energetic, direct]**
"New to the team? Here's Phase One in 90 seconds — the thing every single deal starts with."

**[0:10–0:30] What it is**
"Phase One is the client's first step with us. One flat fee. In exchange, we build them a fully AI-optimized website, a self-updating knowledge base we call their 'Second Brain,' and — if they've got a sales team — we duplicate that whole setup for every one of their agents, plus automated social posting for each of them."

**[0:30–0:50] The guarantee — the selling point**
"Here's the part that makes this an easy yes: the day we go live, the client gets 30 days. If it's not producing results in that window, they get every dollar back. And — this is key — they keep everything we built. No clawback, no catch. We're that confident."

**[0:50–1:10] How the deal actually moves**
"It flows like this: discovery call, we agree on scope and fee live, cover email goes out, DocuSign follows, three signatures — William DeVito, Rob Acheson, and the client — then an invoice, due on receipt. Work starts the moment payment lands. No signature on the invoice — payment itself is what locks it in."

**[1:10–1:25] What's NOT included**
"Phase One is intentionally not everything. It's the proof point. Once we know what's working, we write a more specific agreement for the next phase — nobody signs up for the big stuff blind."

**[1:25–1:30] Close**
"That's Phase One. Low risk for them, fast start for us. Go get your first signature."

---

## Items Requiring Rob's Confirmation

The following claims were deliberately left as placeholders because no source document specifies a fixed number — do not quote these to a prospect until confirmed:

1. ~~Standard/anchor Phase One price~~ — **RESOLVED 2026-07-04: $10,000 upfront + $1,000/month.**
2. ~~Installment/deposit plans~~ — **RESOLVED 2026-07-04: upfront is pay-in-full due upon receipt; $1,000/month recurring is standard.**
3. **Whether reps have any discount/negotiation authority** on the Phase One fee, or whether every fee change must route through Rob or Will. **STILL OPEN.**
