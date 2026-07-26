# Macro teardown — 2026-07-25

Rob's directive: analyse `github.com/blacklabelbob/macro` (macro.com — a16z-backed, $30m, an
all-in-one workspace that open-sourced email + chat + docs + tasks + calls + CRM), decide what
to learn from it, what to liberate, and whether to merge it into the MLE CRM.

Eight agents read the clone in parallel — ~1.09M LOC, 164 Rust crates, 42 services, 12,158 files
— against this repo. **Every claim in these reports is traced to a file path in the source, not
to Macro's documentation.** That distinction did most of the work: several of Macro's headline
claims do not survive contact with their own code.

**Visual summary (the thing to actually read):** [`macro-teardown.html`](./macro-teardown.html) —
also published as an artifact.

## The verdict in one line

**Do not merge, fork, or port. Read it, then build your own.** Macro is **AGPL-3.0** with no CLA.
Internal-only use by Rob's own reps does not trigger §13 — but the day an external client logs in
(which is the business model), he owes them the complete source of his modified version, including
his proprietary logic. A Rust→TypeScript port is still a derivative work. And AGPL makes the
standing "no upstream attribution" rule legally impossible, because attribution and source-offer
are the licence's enforcement mechanism rather than a courtesy.

The things worth having are Macro's **decisions**, not their code, and decisions are not
copyrightable.

## The reports

| File | Scope | The single most useful finding |
|---|---|---|
| [`01-architecture.md`](./01-architecture.md) | Monorepo, Rust services, infra, self-host cost | `entity_access`: a 9-column grant table whose `granted_from` column records *why* each grant exists, so a cascade revokes exactly the inherited ones. Take the table, reject their enforcement point — put it in Supabase RLS. |
| [`02-crm.md`](./02-crm.md) | The CRM subsystem, schema, gap table vs MLE | Macro has **no deal object** — the company *is* the deal. MLE is genuinely ahead on deals, scoring, e-sign, lineage and search. Also flagged MLE's open-prod exposure. |
| [`03-ui-ux.md`](./03-ui-ux.md) | Design system, keyboard-first, speed tricks | Macro is **SolidJS**, so steal the CSS and architecture, never the components. 15 OKLCH tokens run their whole app. |
| [`04-ai-memory.md`](./04-ai-memory.md) | Agents, "shared memory", MCP, embeddings | **There is no RAG.** "Shared team-level memory" is a `TEXT` column, one row per user. The embedding stack exists solely for duplicate *task* detection. |
| [`05-calls-voice.md`](./05-calls-voice.md) | Calls, recording, transcription | **Macro has no telephony at all** — zero SIP/PSTN/DTMF. Their calls are LiveKit WebRTC; transcription is Deepgram `nova-3` streaming. Independent confirmation of Rob's own stack instinct. |
| [`06-realtime-sync.md`](./06-realtime-sync.md) | CRDTs, sync, local-first, perf | Only the markdown editor uses CRDTs. Perceived speed is **~20% architecture, 80% frontend craft** — and the 80% ports cleanly to React/Supabase. |
| [`07-comms.md`](./07-comms.md) | Email sync, chat, notifications, bots | Two rules worth copying verbatim: **receiving mail never creates a company, only sending does**, and every email row keyed by `link_id` (which turns Rob's two-identity rule into a schema invariant). |
| [`08-license-market.md`](./08-license-market.md) | AGPL analysis, market/competitive frame | The risk ladder, and the free lunch: LiveKit (Apache-2.0), Lexical (MIT), Loro (MIT) are Macro's *dependencies*, usable freely with zero AGPL exposure. |
| [`09-voice-stack-decision.md`](./09-voice-stack-decision.md) | Costed dialer / recording / transcription / live-coach decision | **Twilio Voice SDK for the rep dialer** (already built, ~$173/mo at 5 reps) — LiveKit owns no carrier and is not a PSTN dialer; it belongs in the AIDRE half only. Recording: keep Twilio dual-channel but **export out fast** (Twilio bills storage monthly, ~22× S3). Deepgram `nova-3` **batch, direct**. Live coach: **build it, post-call first — 80–95% of the value for near-zero extra build**; no incumbent does live coaching at all. Vapi: keep for AIDRE, revisit at 10–15k min/mo. ⚠️ Florida is all-party consent. Next action: provision Twilio. |

## What shipped the same night

- **Q63** — the Phase 2 ROI Estimator mounted on the company record + rep view (`PRD 3.1.147`).
- **Security** — prod was open *and* crawlable; indexing is now blocked (`robots.txt` + `X-Robots-Tag`).
  The open-access decision itself is Rob's, from 7/21, and was deliberately not reversed.
- **UI pass** (`PRD 3.1.148`) — motion tokens across all 33 transitions, the never-rendered
  `saving` state, route skeletons, and `router.refresh()` made optional.

## Standing caveat

The licence analysis was produced by a research agent, not a lawyer. Three questions worth a real
IP attorney's hour are listed at the end of `08-license-market.md`.
