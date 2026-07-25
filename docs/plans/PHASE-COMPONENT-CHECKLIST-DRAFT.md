# Phase Component Checklist — CANON (Rob-confirmed 2026-07-25)
**Rob's ruling:** "for Phase one only the ones shown in the demo on the site" — items below match mylocaleverything.com/app?demo=1 exactly. `ai-receptionist` is STRUCK (not in the demo; belongs to a later phase/product decision). Items 1-7 are no longer draft.

**Date:** 2026-07-22 · **Status:** DRAFT — Max-drafted per Rob's decision ("Max drafts the P1/P2/P3 component checklists, Rob edits/approves") · **Feeds:** MASTER-VIEW-2.0-DESIGN.md §3.1 (Blueprint lights) + PHASE-SIGNAL-WEBHOOK-CONTRACT.md (`componentId` slugs)
**Grounding:** dump 7.22.26-3 (verbatim rules) + the partner demo `https://mylocaleverything.com/app?demo=1` (fetched 2026-07-22). **Every item not directly confirmed by Rob's words or the demo is marked `[CONFIRMED — Rob 2026-07-25, demo-matched]`. No fabricated certainty.**

> **How to edit this, Rob:** strike components, rename them, add ones we can't see from here (Will's build sheet knows things we don't). Slugs are what the partner webhook sends (`componentId`) — once you approve, the names can still change freely; the slugs shouldn't.

---

## Phase 1 — Foundation *(demo: "live now")*

One shared checklist for every customer — Rob: *"Phase 1 for everyone will largely be the same."* (7.22.26-3)

| Slug (webhook `componentId`) | Component | One-line meaning | Basis |
|---|---|---|---|
| `website-aeo-seo` | Website live with AEO-SEO | Customer site live and optimized for AI + classic search. **First `live` signal starts the 30-day refund clock.** | ✅ CONFIRMED — Rob verbatim: *"the 30 day period begins as soon as the Website is live with AEO-SEO"*; re-confirmed in the 7/22 decision batch |
| `everything-agent` | Everything Agent active | The customer's core MLE agent running on their business. | [CONFIRMED — Rob 2026-07-25, demo-matched] demo has a dedicated "Everything Agent" tab + "7 agents active" |
| `social-connections` | Social channels connected | Their social accounts wired for posting/capture. | [CONFIRMED — Rob 2026-07-25, demo-matched] demo "Connections" tab + social channel connect/post section |
| `brand-knowledge` | Brand knowledge loaded | Voice/style/brand docs ingested so content sounds like them. | [CONFIRMED — Rob 2026-07-25, demo-matched] demo "brand knowledge management (voice/style documentation)" |
| `content-engine` | Content engine running | Weekly content planned + generated ("Generate my week"), library populated. | [CONFIRMED — Rob 2026-07-25, demo-matched] demo weekly content planning + content library/photo uploads |
| `social-radar` | Social Radar listening | Competitor/social feeds monitored for the customer's market. | [CONFIRMED — Rob 2026-07-25, demo-matched] demo "Social Radar" tab / market listening |
| `growth-scan` | AI Growth Scan delivered | Tech-stack scan complete — also the seed list for the P1→P2 "Top Automations" slot. | [CONFIRMED — Rob 2026-07-25, demo-matched] demo "AI Growth Scan for tech stack analysis" |
~~`ai-receptionist` — AI receptionist live~~ **STRUCK by Rob 2026-07-25: not in the demo — not a P1 light.**

**Phase-complete rule (confirmed):** ALL lit → Phase 1 complete. *"When they are ALL lit, Phase 1 is complete (thats the simplistic overview)."*

---

## Phase 2 — Highest-ROI Automations *(demo: "high-ROI automation" · NEXT UP)*

**Structurally per-customer, not a fixed list** — Rob: *"Phase 2 is about providing the customer with the Highest ROI Automations... we'll pick out the automations that work for them, but the same principle applies."* (7.22.26-3)

So P2 is a **slot structure**, not a checklist:

- On P2 agreement signing, 3–5 automation slots `[DRAFT — Rob confirm the count]` are filled per customer, picked from the automation database (demo: "Browse the full automation database") — informed by their `growth-scan` output and the Top Automations recommendation.
- Each filled slot becomes a component row: slug `p2-auto-<n>` + a human name chosen at selection (e.g. `p2-auto-1` "Invoice chasing automation"). The webhook contract needs no change — partner tools send the assigned slug.
- Same lighting rule: all filled slots live → Phase 2 complete.
- **ROI guarantee (confirmed):** 3 months, per Rob's forthcoming calcs — tracked on the phase row, rendered on the master tracker only.

## Phase 3 — The 95% Business *(demo: "the 95% business" · THE DEEP END)*

Same per-customer slot structure as P2 (`p3-auto-<n>`), deeper scope. `[CONFIRMED — Rob 2026-07-25, demo-matched]` everything here: the demo gives only the framing ("deepest automation tier"); no component candidates are visible from outside, and dump 7.22.26-3 says only *"Same thing for Phase 3."* We deliberately draft **no** fake P3 items.

---

~~`ai-receptionist` — AI receptionist live~~ **STRUCK by Rob 2026-07-25: not in the demo — not a P1 light.**
