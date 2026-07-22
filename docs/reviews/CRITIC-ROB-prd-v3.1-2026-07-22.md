# CRITIC ROB — PRD v3.1 dump-fold fidelity audit (commit 42570ad)
**Date:** 2026-07-22 · **Scope:** 7.21.26-1.md + ROB-TALK-NOTES-2026-07-21.md → PRD-mle-crm.md v3.1; all six 2026-07-22 Decisions rows verified against repo/prod/GitHub reality

VERDICT: REVISE   ·   Score: 82/100
Gates: Fidelity 88 · UX 95 · Truth 82 · Engineering 95 · Recording 84 · Effort 93

## Directive-by-directive map (dump → PRD) — VERIFIED
| Dump directive | Where it landed | Status |
|---|---|---|
| No login asks pre-rollout; admin-portal provisioning + Google sign-in | Task 4.6 REWRITTEN + ACCESS decision row | ✅ exact match |
| Gmail scrape + send-as-rep | 4.6 (OAuth scopes) + decision row | ⚠️ no owning task (punch 5) |
| "Rep View" for Rob | 4.6 "View as rep" + decision row | ✅ |
| Own repo then merge? (QUESTION) | Open Q8 | ⚠️ answer now owed, unsent (punch 6) |
| Full rep-POV mockup before rollout | Task 1b.3 + decision row + 4.6 | ✅ triple-anchored |
| Global-rename "Please confirm" | Q9 CLOSED — confirmed w/ caveats, dev-chat #39 sent, sweep executed, Q14 defect found+fixed+prod-verified | ✅ exemplary |
| Vapi/LiveKit challenge + "PUSH BACK" | Task 7.1 CONTESTED → re-eval w/ scorecard (hybrid 93.5) → #38 → Rob #40 delegation → HYBRID locked | ✅ real pushback, sourced |
| Receptionist acts as rep's ASSISTANT | Q7 "acting as the rep's assistant" + rep-assistant persona in provision-vapi-assistant.mjs (CODE) | ✅ nuance survived |
| Instant caller→CRM lookup | crm_caller_lookup tool + pre-answer variableValues (lib/vapi.ts, tested) | ✅ |
| Dump prompt verbatim to 7.21.26-1.md | File exists, verbatim, f7e2e81 | ✅ |
| "NO CHANGES except login removal" | Capture-only freeze honored (3.0.22–3.0.27 all freeze-safe) until #40 lifted it | ✅ |
| Talk-notes: lanes await GO | "Modular lanes: designed, NOT started" row | ✅ |

## 2026-07-22 Decision rows — reality check
- **Flags system:** 0004_flags.sql + /api/admin/flags + ThingsToAddress.tsx on app/page.tsx (Overview digest, unread-only, hover, Read≠resolved) + people/[id] pages + expandable dated archive — matches Rob's #33 correction exactly. TRUE.
- **Receipts:** app/api/dev-chat/route.ts writes author:"system" server-side; live receipts #37/#41 on prod. TRUE.
- **CI/ESLint/Dependabot:** .github/workflows/ci.yml + eslint.config.mjs + dependabot.yml; CI green on main (run 29900617209); TS 5.9.3→7.0.2 PR #3 CI FAILED = the day-zero block. TRUE.
- **Basic auth removed:** prod / returns 200 unauth, /api/network serves full data unauth; f7e2e81 verified. TRUE (see punch 1 on the wording).
- **AIDRE on Vapi:** TRUE (lib/services/scraping/vapi/vapiHandler.ts et al) — but "67 refs" unreproducible (punch 4).
- **Task 4.6 rewrite vs dump login model:** clause-for-clause exact. TRUE.

## PUNCH LIST (ranked by how loud Rob would be)
1. [Truth] Decision row says Rob "accepted exposure trade" — that acceptance appears in NO source: the dump only orders login removal, and no dev-chat message (#28–#42) tells Rob the entire CRM (real names, phones, emails, deal $) is now publicly readable at the URL. "No spin, no upgrading general claims to specific." → Reword the row to Rob's verbatim order, and send ONE dev-chat line: "Heads up — until ACCESS ships, anyone with the URL can read all CRM data. Re-arm is one env var if you ever want it back." Then the claim becomes true.
2. [Recording] "Architecture Atlas artifact = living doc, refreshed after every milestone" — no file named Atlas exists anywhere in this repo, MyLocalEverything, or ~/.claude; "Atlas A-004" cites a ghost. Work that isn't recorded doesn't count. → Commit docs/ARCHITECTURE-ATLAS.md (with the A-00x register incl. A-004) this session or strike the duty.
3. [Truth] Comms-data-lake row attributes "end state = live on-call assist" to "Rob dump" — it is in neither 7.21.26-1 nor the 7/17 vision dump (which supports only the call/video RAG corpus, lines 66–70). → Split attribution: corpus principle = Rob (7/17 lines 66–70 + 7/21 AIDRE/email additions); live-assist = Max proposal pending Rob — or capture the walkthrough source that contains it to docs/plans/sources/.
4. [Truth] "67 refs in its code" — unreproducible under every sane filter (I measured 28 app+lib case-sensitive / 33 files / 42 app+lib+components / 116 ts+tsx / 292 all excl. node_modules+lockfile). A verification stat must carry a reproducible method. → Replace with "33 files incl. lib/services/scraping/vapi/vapiHandler.ts (grep -rli vapi, excl. node_modules/lockfile)".
5. [Fidelity] "Scrape the reps emails and do sendouts from their emails so I dont have to rely on them" is a first-class dump want but lives only in a 4.6 parenthetical + decision row; Task 3.2 is rob@ only, Task 1.5 is research. Deprioritized ≠ dead. → Add a Phase-3/M2 task: per-rep Gmail capture + send-as-rep via the ACCESS OAuth grant, gated on rollout, cross-ref 4.6/1.5/3.2.
6. [Fidelity] Q8 (own repo then merge vs lanes) answer was "owed when he finishes the dump" — #40 ended the dump and lifted the freeze; the answer is now simply owed and unsent. → Send the recommendation (lanes-in-repo per the worktree design, no repo split) to dev-chat and close Q8.
7. [Recording] The v3.1 revision row is filed at the BOTTOM of the table (between 3.0.2.1 and 3.0.2) instead of the top slot above 3.0.39 — the same misfiling class this PRD has already had to fix twice (3.0.19, 3.0.27). → Move it.

## WHAT SURVIVES CONTACT WITH ROB
- **The fold itself is genuinely complete:** every distinct directive in both source files maps to a task, decision, or open question — including the three easy-to-lose nuances (assistant persona, mockup gate, repo question). Task 4.6 matches the dump's login model clause-for-clause. Nothing was silently dropped.
- **The Q9 rename thread is the model:** confirm asked → verified with file:line evidence → honest caveats → found a real prod defect in the process → fixed, deployed, prod-verified, swept. That's "ZERO mixups" behavior.
- **Every shippable claim checked out live:** flags, receipts, CI (including the day-zero Dependabot block), open prod, f7e2e81 — all verified on prod/GitHub, not asserted.
