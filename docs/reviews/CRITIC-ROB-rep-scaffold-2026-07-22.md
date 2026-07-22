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
