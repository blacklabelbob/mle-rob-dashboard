# The Perfect CRM From the Rep's Seat — Research & Recommendations
**Date:** 2026-07-23 · **Author:** Max (deep-research assignment from Rob) · **Status:** RESEARCH ONLY — nothing here is built by this doc
**Grounded in:** `app/rep/*` (mockup, critic-rob 92/100, awaiting Rob approval), `docs/plans/PRD-mle-crm.md` (Phases 4/7/8/M3), `docs/plans/MASTER-VIEW-2.0-DESIGN.md` rev 4, `BUILD-QUEUE.md` (Q39–Q45 + Rob decisions), live pipelines (todayRules, Gmail capture, deal scoring, /api/leads)

> **The one-sentence answer:** the perfect rep CRM is a **finish-able daily queue** that opens into a
> **single account workspace** where the rep can **talk, send, and present without leaving the page** —
> while the system does ALL the logging. Every product reps actually praise converges on that shape;
> every complaint converges on its absence. We already own most of the pieces.

---

## §1 The rep's day in the perfect setup (Jake's Tuesday, MLE-specific)

**8:45am — one tab, one queue.** Jake opens `/rep`. No dashboard, no charts (Principle 1: only what
closes deals). The top of the page is his **Today queue** — not his whole book, just what our
`todayRules` engine says needs a touch: an overdue next-step on **CG Roofing** (their $5,000 split
payment was due yesterday), a **meeting he held Friday with a Naples title company and never logged**,
and a roofing lead that's been sitting in *Quote Sent* for 6 days (stage-aging). Four items. He can
finish this list, and the page tells him so. Below the fold: the rest of his book sorted money-first,
exactly like today's mockup.

**9:00am — first touch without leaving the row.** The CG Roofing card shows *why* it surfaced
("payment follow-up overdue 1d") and *how they got here* (the source-context block — they replied to
the roofing cold email about missed calls). He hits **Call** on the card. The Twilio/Vapi hybrid dials;
when he hangs up, the recording, transcript, and AI summary land on the timeline on their own (Phase 7)
— Jake types nothing. The one thing the system asks of him: **"Next step?"** — he types "resend invoice
link, chase Friday" and picks a date. That's his entire data-entry burden for the call.

**9:40am — a new lead routes in.** AIDRE posts a roofing lead through `/api/leads` (live today). It
arrives already carrying the story: product, the actual reply text, demo-requested date — because we
capture the *details behind the source*, not just "source: email" (Principle 4). The account page
already shows a deep-scrape rapport brief (Task 7.6): 5 talking points with sources. Jake calls warm,
not cold.

**11:00am — demo time.** He opens the title-company account he's presenting to at 11:30. On the right
rail sits the **Collateral shelf**: the *Title/Real-Estate demo deck* (because the account's vertical
is title — the shelf is vertical-aware), the MLE one-pager, and this account's own **AI Growth Scan**
— the P1→P2 bridge asset (`growth-scan` is a Phase-1 component and the seed list for the "Top
Automations we recommend" slot, per `PHASE-COMPONENT-CHECKLIST-DRAFT.md`). One click, deck's up.
No Drive spelunking, no "which version is current."

**12:15pm — they said yes.** Still on the call, Jake hits **Send agreement** (Phase 8). The agreement
is generated with the account's name and — because agreements carry a Phase (Rob's rule, Q40 / Master
View §3.1) — he confirms **"Phase 1"** in the send dialog. It goes out for e-signature via the
Documenso flow; the signed event will land on the timeline by itself. He drags the deal to
*Negotiating → Signed* when DocuSigned — the stage-change audit row writes itself (Task 4.7, live).

**2:30pm — pipeline sweep.** He flips to **My Pipeline** — his deals as a board, columns matching the
canonical ladder including **Meeting Booked** (Q45). Two cards wear an amber "aging" tint (our
stage-aging thresholds, same idea as Pipedrive's rotting indicator). Every card is a whole-card click
into the account workspace (Q42 — Rob's "you can't even click into them" fix).

**4:45pm — emails he never logged.** Three prospect replies came in during the day. He answered from
the account pages using a **template** (short, per-stage: "post-demo recap," "quote follow-up") sent
as himself — Gmail capture (live) plus send-as-rep (4.6b) means every thread is already on the
timeline. He reviews his queue: zero left. Phase tracker on the Naples account shows 3/5 lights lit —
he can tell the owner exactly where their build stands without asking Will.

**5:00pm — done.** Jake logged into exactly **one** tool all day. He typed next-steps and one phase
confirmation. Everything else — calls, emails, meetings, transcripts, stage audit rows — captured
itself. That is the entire pitch, and it is the exact inverse of why reps hate CRMs (§2.8).

---

## §2 The 8 cockpit surfaces that matter

Each: **what it is → the pattern's source → what it maps to in our stack** (✅ exists / 🔜 queued in PRD / 🆕 new).

### 2.1 The Today queue (the home screen is a to-do list, not a dashboard)

**What:** the rep's landing surface is a prioritized, *finish-able* action queue — call/email/task
items with the reason attached — not a report. This is the single strongest convergent pattern in 2025-26
sales tooling:
- HubSpot's **Sales Workspace prospecting queue** puts "tasks, sales activities, and guided actions
  on the same page" and lets reps execute them in sequence — [knowledge.hubspot.com/prospecting/use-the-prospecting-queue](https://knowledge.hubspot.com/prospecting/use-the-prospecting-queue)
- **Salesloft Rhythm** ranks "next best actions" into one daily list, *each with an explanation of why
  it matters* — [salesloft.com/platform/rhythm](https://www.salesloft.com/platform/rhythm)
- **Close Smart Views** are saved dynamic filters worked as a daily queue ("new leads with no activity
  in 7 days") that feed the dialer directly — [help.close.com/docs/search-and-smart-views-legacy](https://help.close.com/docs/search-and-smart-views-legacy)

**Maps to us:** ✅ `lib/tasks/todayRules.ts` + `GET /api/tasks/today` already compute exactly this
(overdue → due-today → meeting-unlogged → stage-aging, deterministic order). ✅ `/rep` exists but
currently sorts the whole book by stage-rank+money — it does **not consume todayRules yet**. The
referral-chase queue (`lib/referrals/chaseQueue.ts`, ✅) and recycle candidates (✅) are additional
feeds for the same list. **Gap: wiring, not building** (§5-R2).

### 2.2 My Pipeline — a kanban the rep can click into, with visible staleness

**What:** deals as drag-and-drop cards in stage columns; stalled deals *look* stalled. Pipedrive —
the CRM small sales teams consistently rate easiest to actually use — treats the kanban as the
centerpiece and flags idle deals red with a days-idle counter via its **Rotting feature**
([support.pipedrive.com/en/article/the-rotting-feature](https://support.pipedrive.com/en/article/the-rotting-feature)); card click opens the deal detail
([support.pipedrive.com/en/article/pipeline-view](https://support.pipedrive.com/en/article/pipeline-view)). Open-source **Twenty** ships the same
grammar — every object viewable as table or kanban with per-stage required fields
([github.com/twentyhq/twenty](https://github.com/twentyhq/twenty)); **Attio** lets any list flip
kanban↔table without rebuilding the view ([crm.org/news/attio-review](https://crm.org/news/attio-review)).
Kanban for working the pipeline, list for scanning the book — offer both, force neither.

**Maps to us:** ✅ `DealsBoard` with drag-persist + stage audit (Task 2.5/4.7). ✅ stage-aging
thresholds (`STAGE_AGING_DAYS`) = our rotting rule — but they surface only in todayRules, **not as a
visual state on cards**. 🔜 Q42 whole-card click-through (approved, buildable now). 🔜 Q45
`meeting_booked` column + two-tier aging (meeting-datetime + 2d primary, 7d fallback — Master View §7b).
🆕 rep-scoped board (today's board is master-view).

### 2.3 The account workspace — one page per relationship, everything on it

**What:** clicking anything lands on ONE record page holding identity, full conversation timeline,
next step, and actions — Close's model: every call/email/SMS in one chronological lead inbox, "no
switching tabs" ([help.close.com/docs/inbox](https://help.close.com/docs/inbox)); reviewers single out
how little manual logging it demands ([hackceleration.com/labs/review/close](https://hackceleration.com/labs/review/close)).
Salesforce sells the same thing as the Console — lead queue, record, intelligence on one screen
([salesforce.com Sales Cloud Console design](https://www.salesforce.com/uk/services/success-plans/accelerators/sales-cloud-console-design/)).

**Maps to us:** ✅ `/rep/accounts/[id]` is already this shape: header with status + money,
source-context block, ActivityTimeline, inline next-step, contact card, key dates — inline
click-to-edit everywhere (Rob's Apple-not-MSDOS law). 🔜 additions that research says earn their
place: deal-stage chip w/ inline stage move (feeds §2.2), the **rep variant of the Phase Blueprint
tracker** (lights + NEXT UP, no money — Rob: *"we will want the Rep to be able to see the progress
update from the… Company page"*, Master View §3.1), and Q43's notes-first/enrichment-collapsed layout
discipline. 🔜 rapport brief (Task 7.6). Note §2c vocabulary: relationship · role · billing-contact
flag — the rep's send-invoice flow (§2.5) reads the `billing_contact` flag so nobody hunts for who
gets the bill.

### 2.4 The comms dock — call, text, email from the record; never from another app

**What:** communication tools live *inside* the record. Close's built-in dialer is "one click from any
lead record," calls transcribed and logged automatically — the most-praised feature in its reviews
([syncgtm.com/blog/close-crm-review](https://syncgtm.com/blog/close-crm-review)). The anti-pattern is
app-hopping: knowledge workers toggle apps ~1,200×/day and burn ~4 hours/week reorienting
([HBR via speakwiseapp.com/blog/context-switching-statistics](https://speakwiseapp.com/blog/context-switching-statistics)).

**Maps to us:** ✅ `CallButton` (Twilio Voice SDK, env-gated, graceful tel: fallback) — blocked only on
Rob's Twilio creds. ✅ Vapi webhook + `crm_caller_lookup` (instant caller→CRM context, Rob's ask). 🔜
Phase 7.3–7.5: transcript → AI summary/action items → RAG search. ✅ Gmail *capture* is live (inbound
threads land as activities); 🔜 4.6b send-as-rep closes the loop (rep sends from their own address,
auto-logged). Email today is a bare `mailto:` — §3 upgrades it.

### 2.5 The send drawer — proposal, agreement (with Phase), invoice, in seconds

**What:** documents generate from record data and send without leaving the deal. PandaDoc's whole
pitch: rep opens the deal, picks a template, merge fields pre-fill from CRM, sends for e-sign — never
leaving the CRM ([pandadoc.com/integrations/crm](https://www.pandadoc.com/integrations/crm/)). We stay
self-owned with **Documenso** (open-source, API + templates + webhooks on every state change,
self-hostable — [documenso.com](https://documenso.com/)), already the named engine of Task 8.3.

**Maps to us:** 🔜 Phase 8 is exactly this surface: 8.1 proposal <60s, 8.2 redacted case-study
matcher, 8.3 agreement e-sign, 8.4 invoice. **MLE-specific rule the generic tools don't have:** the
agreement send dialog REQUIRES a Phase selection (Rob: *"the Rep should be noting the Associated Phase
for the Associated Agreement"*) — that's what powers the phase ↔ agreement ↔ invoice cross-check and
the refund clock. Invoice send reads the §2c `billing_contact` flag. G3 verdict (2026-07-23):
invoicing truth lives in the contracts repo CSV — the send button rides that seam, read-only here.

### 2.6 The collateral shelf — the right deck for THIS account, one click

**What:** sales content attached where the rep is, filtered to fit. HubSpot lets teams build a
document library, attach docs to deal records, and see which content actually closes
([hubspot.com/products/sales/document-tracking](https://www.hubspot.com/products/sales/document-tracking));
Salesforce Path attaches guidance *and shareable files* per stage
([trailhead — Path](https://trailhead.salesforce.com/content/learn/modules/sales_admin_optimize_salesforce_for_selling/sales_admin_optimize_for_selling_unit_1)).
Highspot/Seismic exist to do this at enterprise scale — a 3-person shop needs the *pattern*, not the
platform: **a config table mapping vertical × stage → asset link**.

**Maps to us:** 🔜 Task M3.4 "collateral shelf" is queued and this is its spec. MLE inventory is
naturally small and vertical-keyed: roofing demo deck, title/RE demo deck, medical demo deck, MLE
one-pager, the live demo (`mylocaleverything.com/app?demo=1`), and — per account, not per vertical —
that customer's **AI Growth Scan**, which doubles as the P1→P2 "Top Automations" bridge asset. §3 has
the concrete recommendation. 🆕 (config + right-rail render; small).

### 2.7 The guided next-step rail — one hint per stage, never a wizard

**What:** lightweight per-stage guidance: Salesforce Path shows up to 5 key fields + a 1,000-char
"Guidance for Success" per stage ([salesforceben.com/implement-salesforce-path](https://www.salesforceben.com/implement-salesforce-path/));
HubSpot Playbooks put talk-track cards + structured note capture on the record
([hubspot.com/products/sales/playbooks](https://www.hubspot.com/products/sales/playbooks)); HubSpot
guided actions surface admin-curated next steps in the workspace
([knowledge.hubspot.com/prospecting/customize-guided-actions](https://knowledge.hubspot.com/prospecting/customize-guided-actions)).
This is Baseline-Selling-style step discipline for junior reps: what "done" means at this stage, what
to send, what to say.

**The skepticism (earned):** guided selling fails more than it works. Playbooks get ignored when
they're generic ("basic process illustrations… don't help reps assess the specific situation" —
[sbigrowth.com/insights/sales-playbooks](https://sbigrowth.com/insights/sales-playbooks)); next-best-action
engines are "only as good as the data feeding them" ([prospeo.io/s/what-is-guided-selling](https://prospeo.io/s/what-is-guided-selling));
and over-alerting trains reps to ignore everything — "47 notifications from Outreach… every alert
becomes noise" ([prospeo.io/s/sales-engagement-notifications](https://prospeo.io/s/sales-engagement-notifications)).
**The smallest set that changes behavior:** (a) the 4 todayRules triggers we already have, (b) ONE
static line of stage guidance + the stage's collateral link, (c) the phase-lifecycle `rep_alert`
("refund window closed — time for Phase 2," already designed in Master View §3.1). Nothing pops,
nothing pushes; the queue IS the notification channel. Add a 5th rule only when reps act on all four.

**Maps to us:** ✅ todayRules + flags ledger. 🔜 phase triggers (Q40). 🆕 per-stage guidance line
(config next to the collateral map — one file, two consumers). Task M3.1 rep chat (corpus-grounded
Q&A) is the eventual "ask why" layer on top — 🔜, keep behind the basics.

### 2.8 The invisible surface: auto-capture (why reps will actually use this)

**What:** the system logs; the rep sells. The research is unambiguous on why reps abandon CRMs:
- Salesforce State of Sales: **~70% of rep time goes to non-selling work** ([salesforce.com/news/stories/sales-ai-statistics-2024](https://www.salesforce.com/news/stories/sales-ai-statistics-2024/))
- **71% of reps say they spend too much time on data entry**; ~a quarter of the workweek burns on it ([prospeo.io/s/crm-data-entry](https://prospeo.io/s/crm-data-entry))
- Required-field bloat is "the silent adoption killer — 15+ fields per record gets worse data, not better," and ~50% of CRM licenses go unused ([prospeo.io/s/crm-in-sales](https://prospeo.io/s/crm-in-sales), [businessingmag.com/24023/equipping/simple-crms](https://businessingmag.com/24023/equipping/simple-crms/))
- What flips reps to *praising* a CRM is the same thing inverted: Close reviewers' #1 surprise is "how little manual logging the team had to do" ([hackceleration.com/labs/review/close](https://hackceleration.com/labs/review/close))

**Maps to us — this is our strongest suit, mostly ✅ already:** Gmail capture (live), AIDRE call
webhook (live), stage-change audit rows (server-written, live), lead intake with source details (live),
nightly dedup + hourly overdue watcher + weekly recycle tagger (live), meeting capture (Fathom/Fireflies
connected, Task 7.7 wires it in). 🔜 Phase 7 call transcript/summary pipeline. **Design law to adopt
from this research: the rep's REQUIRED manual writes are exactly Task 1.9's list (date auto, contact
auto, channel, next step) — and never grow.** Every new "just add a field" idea must pass: *can a
pipeline capture this instead?*

---

## §3 Send-and-present: the concrete MLE recommendation

**Templates (build small, now-able):**
- ~8–12 **templates**, keyed by (stage × vertical where it matters): first-touch reply, demo
  confirm, post-demo recap + Growth Scan link, quote follow-up, payment chase, referral ask,
  P2 pitch after refund-window close. HubSpot's model — templates + snippets insertable on the
  contact record with personalization tokens ([knowledge.hubspot.com/templates/create-and-send-templates](https://knowledge.hubspot.com/templates/create-and-send-templates)) —
  is the right grammar; ours pre-fill from the record (name, vertical, phase, quoted amount) and open
  in a compose box on the account page. Pre-4.6b they open a `mailto:`/Gmail-draft with the body
  filled; post-4.6b they send-as-rep and auto-log.
- **Skip auto-sequences** (multi-step timed cadences). Reasons: (a) at MLE's volume every lead is
  referral-warm or product-routed — cadence tooling is for cold lists; (b) sequence platforms' own
  users report the failure mode — Apollo's most-cited complaint is 15–25% bounce rates and sequence
  spam mechanics ([rb2b.com/learn/apollo-io-reviews](https://www.rb2b.com/learn/apollo-io-reviews)); (c) identity rules
  (aivoicetech/MLE separation) make automated sending a footgun. The todayRules follow-up nudge + a
  one-click template gives 90% of the value with a human on every send.

**Agreements/invoices:** Documenso flow (Task 8.3/8.4) with the **Phase field required at send** —
the agreement is the object that carries the Phase (Rob's rule), so the send dialog is where the rep
"notes the phase," not a separate admin chore. Signed webhook → timeline + kickoff-strip light.
Invoice send targets the `billing_contact` person (§2c) and reads/write-backs via the contracts-CSV
seam per the G3 verdict — the CRM never becomes a second invoicing truth.

**Where decks live:** **a versioned config map in the repo, assets in Drive (or `/public` for the
small ones) — NOT a content-management build.** One file, e.g. `config/collateral.ts`:
`{ vertical, stage?, label, url }` + per-account overrides (`growth_scan_url` on the org record).
The account workspace right rail renders "Present" links filtered by the account's vertical + deal
stage. That is the Highspot *pattern* (right content, right context) at 3-person cost. When a deck is
updated, the link doesn't change — no version drift in front of prospects. Upgrade path later:
click-tracking à la HubSpot documents ([hubspot.com/products/sales/document-tracking](https://www.hubspot.com/products/sales/document-tracking)) — not needed for v1.
**The AI Growth Scan is pinned collateral on every account from Signed onward** — it is both the P1
component (`growth-scan`) and the sales asset for the P1→P2 "Top Automations" conversation.

---

## §4 What we deliberately DON'T build (small-team honesty)

| Not building | Why |
|---|---|
| **Forecasting / weighted-pipeline analytics** | "Sophisticated forecasting is overkill for a five-rep team" ([outplay.ai](https://outplay.ai/blog/choose-crm-sales-forecasting-smb)); Rob's OUT clause already bans in-CRM reporting. The board's column sums are the forecast. |
| **Comp plans / leaderboards / activity quotas** | Management analytics = Mission Control (never rep views). Leaderboard pings are named notification-fatigue noise ([prospeo.io](https://prospeo.io/s/sales-engagement-notifications)). |
| **Multi-step automated sequences** | §3 — cadence engines fit cold-volume shops; ours is referral-warm. Human sends with templates. |
| **A content-management platform** | Highspot/Seismic solve a 500-rep problem. Config map + Drive links solves ours. |
| **A notification system** | The queue is the notification. No push, no badge counts, no email digests to reps. Alert fatigue research is unanimous ([prospeo.io](https://prospeo.io/s/sales-engagement-notifications), [salesmotion.io](https://salesmotion.io/blog/sales-reps-ignore-intelligence-tools-adoption)). |
| **AI next-best-action scoring/ML prioritization** | Salesloft-class Conductor AI needs signal volume we don't have; our deterministic todayRules are explainable ("why am I seeing this") which is the part reps actually value ([salesloft.com/platform/rhythm](https://www.salesloft.com/platform/rhythm)). Revisit at real call-corpus scale (Task 7.8). |
| **More required fields — ever** | The adoption killer ([prospeo.io/s/crm-in-sales](https://prospeo.io/s/crm-in-sales)). Task 1.9's list is the ceiling. |

---

## §5 Gap list vs today's `/rep` + PRD 4.6x, with proposed build order

**What `/rep` already nails** (keep, don't churn): source-context block on every card; money-first
sorting; inline click-to-edit + autosave; scoped book (no back door); one-tap Call/Email; timeline;
key-date chips; PhaseEightBar placeholder for the send drawer.

**Gaps found by this research** (Δ# = gap, R# = proposed driver increment, ≤6-min sized, honoring the
4.6f gate — R1 is already Rob-approved via Q42):

| # | Gap | Fix | Size |
|---|---|---|---|
| Δ1 | Pipeline cards not clickable (Rob's own complaint) | **R1 = Q42** whole-card link, `stopPropagation` on Call/Email | 1 inc |
| Δ2 | `/rep` sorts the book but ignores `todayRules` — the queue engine exists and the rep page doesn't consume it | **R2**: "Today" band at top of `/rep` fed by `/api/tasks/today` (+ chase-queue feed), reason chips ("overdue 2d", "meeting not logged"), rest of book below | 1–2 inc |
| Δ3 | No rep pipeline board; no visual staleness | **R3**: rep-scoped DealsBoard w/ aging tint from `STAGE_AGING_DAYS` (Pipedrive-rot equivalent — data already computed) | 1–2 inc |
| Δ4 | `meeting_booked` invisible in rep views; no aging rung | **R4 = Q45** (column, stage chip, two-tier aging) — Rob-gated w/ Q39 sign-off | 1–2 inc |
| Δ5 | No deal-stage chip / stage move on the account workspace | **R5**: stage chip + inline ladder select (writes via the audited PATCH path) | 1 inc |
| Δ6 | Email = bare `mailto:`, no templates | **R6**: template config + compose-prefill from record (pre-auth: Gmail draft handoff; post-4.6b: send-as-rep) | 2 inc |
| Δ7 | No collateral shelf / no Growth Scan on the account | **R7**: `config/collateral.ts` map + right-rail "Present" section (vertical × stage aware, per-account growth_scan link) — delivers M3.4's rep half | 2 inc |
| Δ8 | Rep can't see phase progress (Rob explicitly wants it) | **R8**: rep variant of the Q40 Phase tracker (lights + NEXT UP, no money) — **gated on Q40 build** | rides Q40 |
| Δ9 | No per-stage guidance line for junior reps | **R9**: one guidance string per stage in the same config; renders beside the stage chip | 1 inc |
| Δ10 | Manual interaction logging UI absent (validation contract already live) | **R10**: "Log interaction" form on the workspace posting to `/api/admin/activities` (Task 1.9 enforcement pre-built) | 1–2 inc |
| Δ11 | Auth/identity: everything above is demo-book until ACCESS | **R11 = PRD rollout order verbatim**: 4.6f approval → 4.6c provisioning → 4.6d Google OAuth (Gmail scopes) → 4.6 RLS → 4.6e View-as-rep → 4.6b send-as-rep/capture | per PRD |
| Δ12 | Comms depth (dialer, transcripts, RAG, rapport brief) | Phase 7 as planned — 7.2 blocked only on Twilio creds (PING-INBOX) | per PRD |
| Δ13 | Send drawer is a mock (PhaseEightBar) | Phase 8 in order 8.3 (agreement w/ required Phase select — highest Rob-value) → 8.1 proposal → 8.4 invoice (G3 CSV seam) → 8.2 case studies | per PRD |

**Proposed order:** R1 → R2 → R3 → R5 → R10 → R6 → R7 → R9 (all pre-auth, demo-book-safe, each
prod-verifiable) · R4 + R8 when their Rob gates clear · R11 (ACCESS chain) when Rob approves the
mockup · then Δ12/Δ13 per PRD. Rationale: R1–R2 fix the two things Rob and the research agree on most
(click-through + finish-able queue) and are pure reuse of shipped engines.

---

## §6 Open questions for Rob (4)

1. **Queue contract:** should the Today band be *the* top of `/rep` (book below the fold), or a
   separate tab? Research says: same screen, queue first (HubSpot/Salesloft pattern). Default: same screen.
2. **Templates:** will you (or Will) write the first-pass wording for the ~8 templates, or should Max
   draft from the call/email corpus for your edit pass (checklist-draft precedent)?
3. **Deck homes:** are the vertical demo decks living in Drive today, and is a link-out acceptable for
   v1 (vs uploading into `/public`)? Need the canonical URLs to seed `config/collateral.ts`.
4. **Guidance lines:** one sentence per stage (9 stages) — your Baseline-Selling wording, or Max
   drafts → you edit? (Same answer style as Q2 is fine.)

---
*Method note: every external claim above carries its source URL inline; internal claims cite repo
files/PRD tasks. Vendor-marketing claims were cross-checked against reviewer/complaint sources
(G2-derived review roundups, practitioner blogs) per the assignment's "not vendor marketing" bar.*
