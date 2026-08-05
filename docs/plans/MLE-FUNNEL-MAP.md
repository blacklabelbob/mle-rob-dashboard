# Rob's Portfolio → MLE Funnel Map
**Date:** 2026-07-08 · full scan of PROJECT-TRACKER + ~/Projects + MLE folders · **all projects are Rob's** (nothing Will's unless stated)
**Rule honored:** don't remake Will's tech (contracts/invoicing/ops plumbing = Will-adjacent; flagged below)

## ⚠️ Key correction
The hail engine is **NOT in the `zero` project** — `~/Projects/zero` is Zero.xyz API-marketplace research, no hail code. The real engine lives at **`~/Projects/aivoicetech-roofing-gtm/01-data-engine/storm-match/`** (the roofing GTM project once probed Zero.xyz weather APIs — that's the memory crossover).

## The map

| Project | MLE fit | The play | % |
|---|---|---|---|
| **Storm Match / Hail Engine** 🥇 | LEAD MAGNET + PAID AUTOMATION | Free "8,499 hail-hit owner-occupied old-roof homes in your ZIP" list → sell the monthly storm feed ($500–1,500/mo/market). Proven on real Collin Co. data: 17× re-roof surge match. **2–3 days to demo-ready.** | 65 |
| **RankLens + dataforseo** 🥈 | LEAD MAGNET + FUNNEL STEP | A finished funnel skeleton (domain → instant audit → checkout) + `/seo prospect <niche> <city>` literally prints MLE's city prospect lists. Rebrand only. Working copy: `dataforseo-webapp-RECOVERED`. | 70 |
| **geo-seo-claude** 🥉 | LEAD MAGNET | Free "can AI search find your business?" audit for ANY local business; PDF reports + proposals + prospect CRM built in. Reps demo it live on calls. | 72 |
| **AIDRE** (digi-rec) | PAID AUTOMATION | IS the receptionist product MLE Phase I already sells; missed-call ROI demo is the closer. ⚠️ confirm vs MLE's current receptionist stack with Will. | 70 |
| **AIVA `/demo`** | PAID AUTOMATION + FUNNEL | Paste prospect's URL → talking avatar tuned to their business. Strongest "holy shit" demo owned; embed widget = recurring revenue. | 40 |
| **aivoicetech-roofing-gtm** | LEAD MAGNET FACTORY | Permit-share scorecards ("you're −78% while county +77%") = ready-made PVPs for blue-collar targets. | 35 |
| **interactive-lead-magnets** (skill) | LEAD MAGNET FACTORY | One scorecard/quiz/ROI calculator per MLE vertical in hours. | done |
| **GEO Report Library** | FUNNEL STEP | Client deliverable templates (strip STG branding). | 70 |
| **ai-realestate-claude** | LEAD MAGNET (2nd vertical) | Free property analyses for realtor/title prospects (feeds Gulf Coast/Title Base plays). | 70 |
| **Voice Dojo** | TRAINING ASSET | Train MLE reps to pitch/close; possible paid add-on for client sales teams. | 60 |
| **CloseClinic** | TRAINING ASSET | Salvage closing methodology for rep training. | 50 |
| **roofing-intent-signals** | LEAD MAGNET (feed) | Secondary roofing signal feed behind storm-match. | early |
| MLE contracts / Automated Submission Form | INTERNAL (already MLE) | ⚠️ Will-overlap: scope Phase II automation WITH Will. | 25 |
| PropEstimate, DixBot, ai-marketing-claude, zero | NOT APPLICABLE (now) | Park. (zero idea worth keeping: publish hail/permit data as a paid per-call API later.) | — |

## Top-3 build order for MLE (blue-collar first, per Rob)
1. **Storm Match → demo-ready lead magnet** (2–3 days; MRMS 1-km radar upgrade +3–5 days; each new county 1–2 days; fully automated subscription tier ~2 weeks = standalone $500–1,500/mo/market product, zero Will dependency).
2. **RankLens rebrand → MLE funnel** (fastest live funnel; DataForSEO trial is ~$1).
3. **geo-seo-claude audits** as the rep-run lead magnet for non-roofing local businesses.

Hail deep-dive (files, gaps, effort): agent report archived in the dashboard session; engine scripts: `geocode_all.py`, `storm_match.py`, `target_list_v2.py` (276 lines, all free data: NOAA SPC/IEM + Census geocoder + Collin CAD Socrata). Missing for v1: branded report generator, TCPA scrub for phone outreach, county adapters.
