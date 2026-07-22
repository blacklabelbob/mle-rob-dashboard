# Storage Decision — Rob's 10-Second Call
**Date:** 2026-07-04 · **Status:** ✅ DECIDED — Rob: "supabase go" (2026-07-04) · Adapter + schema + seed script are BUILT; awaiting `supabase login` + project creation to flip `STORAGE_SOURCE=supabase`

## What's going in it

| Table | What it holds | Rough size year 1 |
|---|---|---|
| `people` | Every contact: name, phone, email, website, vertical/business description, referred_by, relationship, quoted amount, signed?, video link, transcript link, est. time to payment, phase-one status, key dates, node type (client / connector / rep candidate / vertical anchor), lit/unlit status | hundreds–low thousands |
| `edges` | Who connects to whom: referred-by, works-with, can-open-door-to, plus AI-suggested connections | ~3-5× people |
| `estimates` | AI outputs per person: est. aggregate revenue, est. new nodes, probability, reasoning, run date | 1-2 per person |
| `projects` | Every project: category, theme (sign / get paid / reduce friction), completion %, owner (Rob/Will/Max), Will-owed items, update reminders | dozens |
| `training` | Coaching materials, Phase One explainer content, rep chat-box corpus | dozens |
| `events` | Upcoming events + which nodes will be there | dozens |
| `tasks` | Daily priorities, reminders (incl. Will's) | rolling |

## Why Supabase over Airtable

1. **We own it.** Free tier, our account, our Postgres. Airtable is a rented UI — and the moment an API key or plan lapses, we're locked out (your exact nightmare scenario).
2. **It's already in the family.** The invoicing PRD already plans Supabase tables (`invoices`, `payment_status`). One database = the meeting→money flow and The Network read each other with a join, not an integration.
3. **Graphs need queries.** "Show me everyone within 2 hops of Jonathan Polk with probability > 60%" is one SQL query in Postgres. In Airtable it's an API pagination slog.
4. **Vercel-native.** Server components read it directly; no rate-limit anxiety.

**What Airtable wins on:** hand-editing in a pretty grid. Counter: the dashboard's add/edit forms (Phase 1.4) give you that, and until then I maintain the data — you just talk.

## The no-stall guarantee (regardless of choice)

All reads/writes go through a `StorageAdapter` interface. Day 1 the source is versioned JSON files in the repo (works offline, deploys to Vercel, zero credentials). Supabase becomes source when you say go; the file store stays as automatic nightly backup. If Supabase ever breaks, one line switches to Google Sheets or back to files. **No lost login ever stops work.**

## What I need from you

- ☐ **"Supabase — go"** (recommended), or
- ☐ "Airtable" (workable, adapter handles it), or
- ☐ "Keep it in files/Sheets for now" (fine, zero setup)

That's it. Everything is built so your answer changes one line of config, not the product.
