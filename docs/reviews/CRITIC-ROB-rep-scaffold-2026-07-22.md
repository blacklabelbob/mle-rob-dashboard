# CRITIC ROB — Rep CRM Scaffold (Task 1b.3: My Accounts list + account workspace)
**Reviewed:** 2026-07-22 · live prod (mle-rob-dashboard.vercel.app) + repo @ dc2420e · Playwright desktop 1440×900 + mobile 390×844, DOM audits, live autosave round-trip, build/lint/tests rerun

VERDICT: REVISE   ·   Score: 72/100
Gates: Fidelity 90 · UX 72 · Truth 80 · Engineering 80 · Recording 74 · Effort 88

## Verified true (evidence, not assertion)
- All 6 account pages 200 (marcus, rita, dale, priya, sandra, tony) + /rep + /rep/accounts — 500-fix claim CONFIRMED.
- Zero Save buttons / edit modes on every rep surface (DOM count = 0). Inline autosave round-trip PROVEN live: edited Dale's Next step → persisted across reload → restored.
- No admin data rendered: no AI contribution $, door-open scores, estimates, network anything on any rep page (keyword scan + visual).
- Demo quarantine: book = 6 (DEMO) records only, every visible role line says "(fabricated)", notes carry FABRICATED disclaimer, workspace guard 404s non-Jake ids.
- Dale = truthful empty timeline ("Nothing logged yet… Phase 8/9"), no fake history. Marcus/Rita show "DEMO HISTORY" badge.
- Call/Email = tel:/mailto: (present on all 3 workspaces; 6× each on /rep).
- Build green, vitest 68/68, eslint 0 errors (19 pre-existing warnings, Q-LINT queued). Committed AND pushed (2f505ef, dc2420e).

## PUNCH LIST (ranked by how loud Rob would be)
1. [Truth] Sandra's $9,500 quote renders as "$10k" (list + her workspace header; pipeline $27.5k → "$28k") — `money()` whole-k rounding on the exact number a rep quotes. "Every stat needs to be right — he cites these." → rep surfaces format sub-$100k as $9.5k or $9,500; keep money() for admin rollups.
2. [UX] Rita is PAID but her chip says "signed — client" and her header says "$12k QUOTED" — corpus §C: "paid client > signed; paid = green client tier." Money already collected labeled as a quote. → add paid branch to `touchReason` (keyDates.paid → "client — paid"), header label "collected" when paid date exists.
3. [UX] Workspace right column is one small card + a desktop void; the rep cannot READ or copy the phone number or email anywhere — only buttons. Attio would not ship a record page without visible contact fields. → contact card (phone/email via existing InlineText) + key-date chips under Next step.
4. [UX] Mobile horizontal scroll: page is 589px wide at 390px viewport — offender is the GLOBAL header nav (`nav.flex gap-1`, 458px, pre-existing on every page, incl. `/`). Rob's rule: mobile always works — and this is the surface he gates Caleb on. → `overflow-x-auto` (or wrap) on the header nav; one line.
5. [Engineering] Full `Person` objects are serialized into the rep page's client payload — `notes` is already in view-source, and `estimate` (AI revenue $) will leak the day a rep-assigned record carries one. Reps see only what closes — including on the wire. → map to a RepAccount DTO in the server pages before passing to RepAccountsList.
6. [Engineering] `lib/repSource.ts` (stageRank ladder, touchReason, sourceContext parse, lastTouchDate) has ZERO unit tests while every sibling lib module has them — ranking logic in code but unproven (scoring-pattern rule: ladders live in unit-tested modules). → `lib/__tests__/repSource.test.ts`.
7. [Recording] CHANGELOG.md stops at 2026-07-21 — no entry for the rep scaffold or the 500 fix. "Work that isn't recorded doesn't count." → dated 2026-07-22 entry. (PRD 1b.3 correctly unchecked — DoD includes this gate + Rob sign-off.)
8. [Truth] Rita's list row says "Last touch 2026-07-10" while her workspace timeline's latest entry is 7/11 (kickoff call) — two surfaces disagree because lastTouchDate reads keyDates only. → for demo records take max(keyDates, demo timeline); real records get the activities feed later.
9. [UX] /rep has the page-level DEMO footer disclaimer; /rep/accounts and workspaces rely only on "(fabricated)" role text + timeline badge — Dale's workspace has no badge at all. → reuse the same one-line footer on /rep/accounts.
10. [Engineering] Rep client code calls `/api/admin/activities` + PATCHes `/api/admin/people` — admin routes baked into the rep bundle. Fine for the mockup; alias `/api/rep/*` before Phase-4 real reps.

## WHAT SURVIVES CONTACT WITH ROB
- **The list.** Attio-density, priority sort = the actual work order (money out → warm → new → closed), a Source column that sells the differentiator, mobile cards with their own labels. This is the "feels like a CRM" he asked for.
- **Inline-kit discipline, proven.** 0 save buttons in the DOM across 5 pages, click-edit-Enter-persist verified against live prod and reverted. The 7/17 "Apple, not MS-DOS" law is actually enforced here.
- **Honesty engineering.** Dale's truthful empty shell, the DEMO-HISTORY badge with a tooltip that literally says "fabricated," the defensive activities route that returns real rows the day the table exists. No Tessa in this build.

*Fix 1–4 + 7 and rerun this gate — that's a same-evening pass to SHIP. Nothing here is structural.*

---

# RE-SCORE — after punch fixes 1-9 (commit 117df50, live prod re-verified 2026-07-22)

VERDICT: SHIP   ·   Score: 92/100
Gates: Fidelity 95 · UX 92 · Truth 95 · Engineering 93 · Recording 95 · Effort 92

Every claim re-verified against LIVE prod, not the builder's report:
1. **Exact money everywhere** — list: $18,000 / $9,500 / $12,000, pipeline "$27,500"; zero "$10k"/"$28k" anywhere; /rep Today also exact. ✅
2. **Paid apex** — Rita: green "client — paid" chip + "$12,000 COLLECTED" header; stageRank puts her last in the work queue; list chip matches. ✅
3. **Right column filled** — Contact card (copyable phone + email, inline kit) + Key-dates chips (Signed 2026-07-02 / Paid 2026-07-10 green, Met/Quoted pending) + Next step. No desktop void. ✅
4. **Mobile 390px** — scrollWidth 390 = clientWidth 390 on /rep/accounts, workspace, and /rep. No horizontal scroll; site-wide nav fix confirmed. ✅
5. **DTO leak closed** — /rep/accounts view-source: 0 hits for FABRICATED / notes / estimate / estRevenue / SOURCE:; only "description" hits are the site meta tag. ✅
6. **Tests** — 88/88 vitest (20 new repSource tests incl. paid branch + DTO mapper), build green, 0 lint errors. Rerun locally on 117df50. ✅
7. **CHANGELOG** — three dated 2026-07-22 entries (scaffold, 500-fix, punch fixes). ✅
8. **lastTouch = max(keyDates, timeline)** — Rita list shows 2026-07-11 (kickoff call), Marcus 07-15; list and workspace agree. ✅
9. **DemoFooter** — present on list, Rita, Marcus, AND Dale (plus his honest "Nothing logged yet"). ✅
10. **Q16 recorded** in BUILD-QUEUE.md with a real DoD (alias /api/rep/* before Phase-4 real reps) — queued, not built, per instruction. ✅

Zero Save buttons on every surface (DOM-counted), tel:/mailto: intact, inline autosave previously proven live. The list is Attio-density with truthful numbers; the workspace is a complete record page. **Task 1b.3 gets ticked.** The remaining 8 points live in Q16 and the Phase-8 ghost buttons becoming real — both tracked, neither blocks this mockup.
