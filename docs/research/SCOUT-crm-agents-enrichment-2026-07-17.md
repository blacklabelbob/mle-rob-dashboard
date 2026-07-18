# SCOUT — CRM enrichment, phone/SMS, and Claude agents for MLE CRM

**Date:** 2026-07-17 · **Method:** github-tool-scout 4-pass (frame → wide net → health-score via `fetch_repo_health.sh` → community sanity-check) · **Target stack:** Next.js 16 + TS + Supabase, self-owned CRM for roofing/RE sales reps · **License bar:** MIT/Apache preferred; AGPL flagged; self-hostable or library/API-usable from Node/n8n.

All star / commit / license numbers pulled live from the GitHub API on 2026-07-17.

---

## MISSION 1 — Lead / company auto-enrichment

### TL;DR
- **Pick:** `gosom/google-maps-scraper` — the only mature (5,088★, 56 commits/90d, 23 contributors, MIT, active v1.16.3) OSS engine that turns a business name/area into **phone + address + website + rating** at scale, which is exactly the firmographic core a roofing/RE CRM needs. Runs as a Go binary, Docker service, or web API you call from Node/n8n.
- **Runner-up:** `firecrawl/fire-enrich` — best *domain → firmographics + tech stack + funding* multi-agent enricher (1,224★, MIT, TS/Next.js — drops straight into your stack), but **stale** (last push 2025-10-08, 0 commits/90d, bus-factor 3) and it leans on paid Firecrawl + LLM API keys.
- **Avoid:** treating any single low-star Python repo (`waterfall-gtm`, `lead-enrichment-scoring`, the b2b-enrichment MCPs) as a product — they're 1-author demos (bus factor = 1, no releases). Steal their *waterfall pattern*, don't depend on the repo.

The honest shape of this category: **there is no self-hostable OSS Clearbit.** Clearbit was absorbed into HubSpot Breeze; the market alternatives are all SaaS (Clay, Apollo, Cognism). OSS gets you two usable primitives — (a) a **maps scraper** for phone/firmographics from a name+geo, and (b) a **domain enricher** that scrapes the company's own site/JSON-LD. Everything richer (social graph, connections, LinkedIn) is either a paid API wrapper or a ToS-risky scraper. Recommend: scraper for the raw firmographic pull, fire-enrich's pattern for domain enrichment, and a paid API (Apollo/Hunter) behind an n8n waterfall for the rest.

### Comparison table
| Tool | Stars | Last commit | License | Language | Maintainer | Best for | Watch out for |
|---|---|---|---|---|---|---|---|
| **gosom/google-maps-scraper** | **5,088** | **2026-07-13** | **MIT** | **Go** | **23 contrib, active** | **name/geo → phone, address, site, rating at scale** | **Google caps 120 results/query; needs proxies ($50-300/mo) at volume; skips email** |
| firecrawl/fire-enrich | 1,224 | 2025-10-08 | MIT | TS/Next.js | 3 contrib | domain → firmographics + tech + funding, native to your stack | stale (0 commits/90d); needs Firecrawl + LLM keys; 15-row/5-col default cap |
| rqcai200/lead-enrichment-scoring | 23 | 2026-07-01 | MIT | Python | 1 (bus=1) | LinkedIn enrich + scoring pattern reference | solo dev, no release, demo-grade |
| codyschneiderx/waterfall-gtm | 32 | 2026-01-31 | MIT | Python | 1 (bus=1) | waterfall-provider + HubSpot-sync pattern | solo dev, 0 commits/90d, no release |
| Aleksey-Panf/b2b-enrichment-mcp | 2 | — | none | Python | 1 (bus=1) | Hunter+Apollo MCP wrapper idea | no license, ~0 adoption |

### Per-tool deep dive

**`gosom/google-maps-scraper`** — [github.com/gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper)
- **What it is:** fast concurrent Go scraper that extracts name, address, phone, website, rating, review count, lat/long (and optionally emails via site crawl) from Google Maps.
- **Why it made the list:** 5,088★, 56 commits in last 90 days, 23 contributors, tagged release v1.16.3, MIT. It is the only enrichment repo here that is both popular *and* actively maintained.
- **Pros:** Runs headless as binary, Docker, or a **web-service/REST mode** you can call from Node or n8n — no code coupling. Emits exactly the firmographic fields a contractor CRM lead card needs (phone is first-class). "Recognized for raw speed" among Maps scrapers in independent testing (scrap.io).
- **Cons:** Google hard-caps 120 results per query — you must tile searches by geography/keyword. At volume you need residential proxies ($50-300/mo). Email extraction is weak (requires separate site crawl; "open-source scrapers almost universally skip email" — scrap.io). Scraping Maps is a Google ToS gray area — fine for a self-owned tool, flag before white-labeling onto a client site.
- **When to pick it:** your primary "give me every roofer in ZIP 12345 with a phone number" motion. This is the PVP data-scouting engine.

**`firecrawl/fire-enrich`** — [github.com/firecrawl/fire-enrich](https://github.com/firecrawl/fire-enrich)
- **What it is:** AI multi-agent enricher that takes an email/domain and returns company profile, funding, tech stack via Firecrawl scraping + LLM orchestration.
- **Why it made the list:** 1,224★, MIT, and it's **TypeScript/Next.js** — the only serious enricher that is literally your stack, so it's copy-paste architecture reference for a Supabase-backed enrichment route.
- **Pros:** Clean multi-agent extraction pattern (discovery → financial → technical → custom-field) that maps directly onto the scoring-pattern.md fan-out contract. Self-hostable UI.
- **Cons:** **Stale** — last push 2025-10-08, 0 commits in 90 days, bus factor 3. Default caps 15 rows / 5 cols / 10 fields (raise in "unlimited mode"). Requires paid Firecrawl API + an LLM key, so not truly free at scale. Still an "intentionally limited" project by the maintainers' own words.
- **When to pick it:** domain-in-hand enrichment (you already have the website, want firmographics + tech stack). Adopt the *architecture*, pin your fork.

### Also-rans
- `codyschneiderx/waterfall-gtm` (32★, MIT) — good **reference** for waterfall providers + AI personalization + HubSpot sync, but 1-author, stale. [link](https://github.com/codyschneiderx/waterfall-gtm)
- `rqcai200/lead-enrichment-scoring` (23★, MIT) — "15x cheaper than Clay" LinkedIn enrich+score; solo, demo-grade but a useful scoring-ladder crib. [link](https://github.com/rqcai200/lead-enrichment-scoring)
- `mambalabsdev/mcp-company-firmographic-enricher` — MCP that parses schema.org/Organization JSON-LD from a domain; thin, tied to a paid Apify actor. [link](https://github.com/mambalabsdev/mcp-company-firmographic-enricher)
- `Lead-Orchestra/awesome-b2b-leads` (15★) — curated list of B2B scraping tools + n8n workflows; use as a *directory*, not a dependency. [link](https://github.com/Lead-Orchestra/awesome-b2b-leads)

---

## MISSION 2 — Phone / SMS layer (click-to-dial + SMS + call recording)

### TL;DR
- **Pick:** `twilio/twilio-voice.js` — the official Twilio Voice **WebRTC SDK** (81★ but that's not the signal; it's Twilio's own, 22 contributors, 16 commits/90d, active v2.18.3, semver'd on npm). This is the browser click-to-dial primitive; you own the thin Next.js API routes around it. Nothing OSS beats first-party for a Twilio-class provider.
- **Runner-up:** `TwilioDevEd/browser-dialer-react` — Twilio's own **reference React dialer** (26★, MIT) to lift the token-mint + Device wiring pattern; pair with `philnash/react-twilio-phone` (62★, MIT) for the fuller web-phone UI.
- **Avoid:** the dozen `*/Twilio-Dialer` repos (0-1★, mostly no license) and `joshterrill/twilio-autodialer` (self-labeled "not functional"). There is **no** turnkey OSS CRM dialer worth adopting — this layer is glue code you write, not a repo you install.

The honest shape: click-to-dial + SMS + recording against Twilio is **~200 lines of your own Next.js route handlers + the official SDK**, not a product to fork. SMS and call recording are pure Twilio webhook endpoints (`recordingStatusCallback` → your Supabase). Full OSS dialers (VICIdial, FreePBX/Asterisk) are Asterisk/PBX-world — wrong archetype for a Next.js SaaS; only mine them for TwiML/queue patterns if you build outbound campaigns later.

### Comparison table
| Tool | Stars | Last commit | License | Language | Maintainer | Best for | Watch out for |
|---|---|---|---|---|---|---|---|
| **twilio/twilio-voice.js** | **81** | **2026-07-08** | **Apache-ish (BSD/MIT-family)** | **TS** | **Twilio (official), 22 contrib** | **browser WebRTC click-to-dial SDK** | **it's an SDK, not a dialer — you build UI + token route** |
| philnash/react-twilio-phone | 62 | 2025-03-22 | MIT | JS | 3 contrib (Twilio DevRel) | full React web-phone UI to lift | last commit 2025-03; React-class patterns, update deps |
| TwilioDevEd/browser-dialer-react | 26 | 2024-04-15 | MIT | JS | 4 contrib (Twilio official) | canonical token-mint + Device wiring | 2024 vintage; SDK v1-era, port to voice.js v2 |
| mifi/twilio-caller | 4 | 2025-02-13 | none | TS | 1 (bus=1) | minimal "call from browser" spike | no license, solo, trivial |
| gregwhitaker/twilio-webhook-example | — | — | — | — | 1 | SMS-recording webhook shape reference | example only |

### Per-tool deep dive

**`twilio/twilio-voice.js`** — [github.com/twilio/twilio-voice.js](https://github.com/twilio/twilio-voice.js)
- **What it is:** Twilio's official JS/TS SDK for making and receiving voice calls in the browser over WebRTC.
- **Why it made the list:** First-party, actively maintained (16 commits/90d, 22 contributors, latest release v2.18.3), semver'd, on npm. Star count is irrelevant here — SDK adoption lives on npm downloads, not GitHub stars.
- **Pros:** The supported path for browser click-to-dial with Twilio; TypeScript types; works cleanly inside a Next.js client component with a server route that mints capability tokens. Call recording + SMS are separate Twilio REST/webhook calls you already control.
- **Cons:** It's a *primitive*, not a dialer — you build the dial-pad UI, the `/api/token` route, and the `recordingStatusCallback` handler yourself. License is Twilio's own permissive (verify the LICENSE file text before white-labeling).
- **When to pick it:** always, for the in-app call button. This is the foundation; everything else is a pattern to copy on top of it.

**`TwilioDevEd/browser-dialer-react` + `philnash/react-twilio-phone`** — [browser-dialer-react](https://github.com/TwilioDevEd/browser-dialer-react) · [react-twilio-phone](https://github.com/philnash/react-twilio-phone)
- **What they are:** Twilio DevRel reference implementations of a browser dialer / web-phone in React.
- **Why they made the list:** MIT, Twilio-authored, they show the exact token-mint → `Device` → `Connection` lifecycle and UI you'd otherwise reverse-engineer.
- **Pros:** Correct, canonical wiring from people who build the SDK; MIT so you can lift freely.
- **Cons:** Both are 2024–2025 vintage on the older SDK generation — port patterns to `twilio-voice.js` v2. Not maintained as products (0 commits/90d).
- **When to pick it:** as your starting scaffold for the dialer component, then modernize onto voice.js v2 + Next.js 16 server actions.

### Also-rans
- `anycable/twilio-ai-js-demo` — Next.js + Twilio Streams + OpenAI Realtime; relevant later for the **AIDRE outbound voice-agent** mode, not for plain click-to-dial. [link](https://github.com/anycable/twilio-ai-js-demo)
- The `*/Twilio-Dialer` cluster (shubhsingh1515, Kabilanvk98, IUKHAN53, etc.) — 0-1★, mostly unlicensed student projects. Skip.
- VICIdial / FreePBX (Asterisk world) — real OSS dialers but PBX archetype, AGPL/GPL, wrong fit for a Next.js SaaS. Only for heavy outbound-campaign patterns.

---

## MISSION 3 — Claude Code agent / subagent collections to import

### TL;DR
- **Pick:** `wshobson/agents` — largest, most active, multi-platform production agent library (37,991★, **100 commits/90d**, 71 contributors, MIT, plugin-structured). 749 `.md` files organized into plugins; the reviewer/architect/business agents are genuinely production-grade and portable to `~/.claude/agents/`.
- **Runner-up:** `VoltAgent/awesome-claude-code-subagents` — 23,450★, MIT, 34 contributors, active (37 commits/90d), clean **one-file-per-agent** layout under `categories/` that's easier to cherry-pick than wshobson's plugin nesting. Best when you want a single crisp agent file, not a plugin.
- **Avoid:** the long tail of low-star personal collections (`rshah515`, `0xfurai`, `NicholasSpisak`, `Dlaby23/ultimate-collection`) — mostly stale (0 commits/90d), 1-author, and duplicative of the two leaders. `hesreallyhim/awesome-claude-code` (50k★) is a **link directory**, not importable agent files — use it to discover, not to adopt.

### Comparison table
| Repo | Stars | Last commit | Commits/90d | License | Maintainer | Best for | Watch out for |
|---|---|---|---|---|---|---|---|
| **wshobson/agents** | **37,991** | **2026-07-17** | **100** | **MIT** | **71 contrib** | **production reviewer/architect/business agents, multi-platform** | **plugin nesting — files live deep under `plugins/*/agents/`** |
| VoltAgent/awesome-claude-code-subagents | 23,450 | 2026-07-10 | 37 | MIT | 34 contrib | clean single-file agents by category, easy cherry-pick | some agents are generic/thin; verify before adopting |
| 0xfurai/claude-code-subagents | 959 | 2025-10-15 | 0 | MIT | 3 contrib | 100+ dev subagents | stale, bus-factor 3 |
| rshah515/claude-code-subagents | 96 | 2025-08-08 | 0 | MIT | 1 | breadth (marketing/fintech/health) | solo, stale, unvetted |
| hesreallyhim/awesome-claude-code | 50,263 | 2026-07-18 | 100 | other | 14 contrib | **discovery directory** of resources | NOT agent files — it's a curated link list |

### Specific agent files worth adopting for the MLE CRM build
Pull these into `~/.claude/agents/` (or the project's `.claude/agents/`), then run each through `evaluating-skill-fidelity` per CR-2 before trusting it:

1. **`wshobson/agents` → `plugins/backend-development/agents/backend-architect.md`** — architecture guidance for the Supabase/Next.js API layer; directly useful for the CRM data model + route design.
2. **`wshobson/agents` → `plugins/javascript-typescript/agents/typescript-pro.md`** — TS-specific reviewer/implementer; matches your exact language.
3. **`wshobson/agents` → `plugins/customer-sales-automation/agents/sales-automator.md`** — closest thing to a CRM/enrichment/outreach agent in either collection; a starting persona for the PVP outreach flows (edit to strip generic SaaS framing, align to roofing/RE).
4. **`VoltAgent/…` → `categories/04-quality-security/code-reviewer.md`** and **`architect-reviewer.md`** — your evaluator/critic pairing; slot into the CR-2 evaluator role and the 90%-gate workflow.
5. **`VoltAgent/…` → `categories/05-data-ai/prompt-engineer.md`** (or wshobson's `plugins/llm-application-dev/agents/prompt-engineer.md`) — useful for tuning the enrichment/scoring LLM prompts that fan-out per scoring-pattern.md.

Runner-up files to skim: `wshobson/.../database-design/agents/sql-pro.md` (Supabase/Postgres query work), `wshobson/.../agent-teams/agents/team-reviewer.md` + `team-debugger.md` (multi-agent review patterns mirroring Rob's chief-of-staff → dept-head → evaluator workflow), and `VoltAgent/.../08-business-product/business-analyst.md`.

**Adoption caveat:** Rob already runs 32+ mature, STG/AI-VoiceTech-tuned agents. Per CR-1 reuse gate, these imports are **pattern donors and gap-fillers**, not replacements — adopt a file only where there's no equivalent in `~/.claude/agents/`, and re-tune each to the roofing/RE + AI VoiceTech lens (strip generic personas) before use.

### Also-rans
- `0xfurai/claude-code-subagents` (959★, MIT) — solid dev set but 0 commits/90d. [link](https://github.com/0xfurai/claude-code-subagents)
- `rshah515/claude-code-subagents` (96★) — widest domain coverage incl. marketing, but solo + stale. [link](https://github.com/rshah515/claude-code-subagents)
- `Dlaby23/claude-agents-ultimate-collection` — 798 deduped agents from 12 repos; a grab-bag, unvetted quality. [link](https://github.com/Dlaby23/claude-agents-ultimate-collection)
- `hesreallyhim/awesome-claude-code` (50k★) — the discovery index for everything Claude Code; use to find, not to import. [link](https://github.com/hesreallyhim/awesome-claude-code)

---

## Sources
- GitHub API (live, 2026-07-17) via `fetch_repo_health.sh` — all star/commit/contributor/license numbers.
- Enrichment: [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper) · [firecrawl/fire-enrich](https://github.com/firecrawl/fire-enrich) · [scrap.io Maps scraper guide](https://scrap.io/google-maps-scraper-github-open-source-guide) · [Spike: Clearbit after HubSpot](https://getspike.ai/blog/clearbit-alternatives/) · [fire-enrich issues](https://github.com/firecrawl/fire-enrich/issues) · [thunderbit Firecrawl review](https://thunderbit.com/blog/firecrawl-review-and-alternatives)
- Phone/SMS: [twilio/twilio-voice.js](https://github.com/twilio/twilio-voice.js) · [TwilioDevEd/browser-dialer-react](https://github.com/TwilioDevEd/browser-dialer-react) · [philnash/react-twilio-phone](https://github.com/philnash/react-twilio-phone) · [anycable/twilio-ai-js-demo](https://github.com/anycable/twilio-ai-js-demo) · [Twilio recording webhook docs](https://support.twilio.com/hc/en-us/articles/223132867-Recording-a-Phone-Call-with-Twilio)
- Agents: [wshobson/agents](https://github.com/wshobson/agents) · [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) · [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
