CRITIC ROB — Q4b PRD Spot-Check (independent falsification pass)
Date: 2026-07-21 · Scope: Q4b closing gate — 5-claim sample of docs/plans/PRD-mle-crm.md
PRD version checked: 3.0.13 (header line 3; last substantive revision 3.0.11 sweep)
Method: every claim checked against the SOURCE OF TRUTH (live Supabase REST, prod Vercel, git remote,
GitHub anonymous API, repo files) — never against the PRD's own cross-references. Sampled AROUND the
sweep's stated examples (n8n 200, Twilio creds, entityKind export, lib/types.ts, file existence, phase
counts — all deliberately avoided).

VERDICT: PASS — 5/5 HOLD. Q4b may tick.   ·   Score: 93/100

CLAIM 1 — Task checkbox status (Task 2.0, line 158): "scripts/backfill-org-links.mjs: 11/16 people linked to their org + 15 org_memberships rows incl. 3 secondary affiliations … 5 honest skips where no org row exists"
- Verification: live Supabase REST — people?select=id,org_id (count + demo-id filter), org_memberships?select=* with Prefer: count=exact, orgs count.
- Observed: 22 people rows = 16 non-demo + 6 demo-* rows; exactly 11 non-demo people have org_id (11/16 ✓, 5 skips ✓); org_memberships = exactly 15 rows ✓; orgs = 16 ✓. Secondary (is_primary=false) rows = 4 (gary-waskivich→miga, daniella-roach→martin-fierro, daniella-roach→oasis, michael-jaenvega→oasis) across 3 people — matching rev 2.2.27's own naming of all four pairings.
- VERDICT: HOLDS. Every load-bearing number verifies exactly. Precision nit (fix, don't relitigate): "3 secondary affiliations" is true as a people-count, false as a row-count (11 primary + 4 secondary = 15; 11+3 ≠ 15). One-word edit owed: "3 people w/ secondary affiliations (4 rows)".

CLAIM 2 — Dependencies & Blockers row (line 357): "Anthropic API key — ✅ resolved — estimator running on claude (est. panel stamps 'source: claude 7/17'; Rob confirmed 7/21)"
- Verification: .env.local key-name grep (presence only, no values); live Supabase people?select=id,estimate&estimate=not.is.null.
- Observed: ANTHROPIC_API_KEY present (plus ANTHROPIC_KEY alias, matching commit baa2417). Live estimate JSON carries source: "claude" stamps (alex-greenwood, trent-brands). One sampled row (dix-thedevdix) still stamps source: "openai" — a pre-cutover estimate, consistent with "re-run on description change" (M1.3), not a falsifier of "estimator running on claude."
- VERDICT: HOLDS.

CLAIM 3 — Open Question Q4 (line 309): "Rep discount authority — last open [CONFIRM WITH ROB] in phase-one-explainer.md"
- Verification: grep -n "CONFIRM WITH ROB" docs/training/phase-one-explainer.md.
- Observed: exactly ONE marker in the file (line 140), and it is verbatim the rep pricing/discount-authority question. "Last open" is literally true — it's the only one left.
- VERDICT: HOLDS.

CLAIM 4 — Decisions Log entry 2026-07-17 (line 332): "Full CRM rebuild w/ logins GREENLIT … push to GitHub first + push throughout … Repo live: github.com/blacklabelbob/mle-rob-dashboard (private)"
- Verification: git ls-remote origin -h refs/heads/main (authed), anonymous api.github.com/repos/blacklabelbob/mle-rob-dashboard, anonymous public-repo listing for the user.
- Observed: remote live, main = 18bc94e = local HEAD (pushed through the latest commit ✓). Anonymous API → 404 AND repo absent from blacklabelbob's public repo list → repo exists but is private ✓. (Local gh CLI auth is dead — 401 Bad Credentials — verified via anonymous API instead; gh auth login owed, noted below.)
- VERDICT: HOLDS.

CLAIM 5 — Revision row 2.2.26 (line 401): "Pre-apply JSON backups in backups/ … prod verified (32 nodes, 47 edges …) … scripts/regen-fallback.mjs made org-aware (merges orgs as company Persons)"
- Verification: ls -la backups/; grep -n orgs scripts/regen-fallback.mjs; live curl https://mle-rob-dashboard.vercel.app/api/network.
- Observed: 4 pre-0003-*-2026-07-21.json backups (people/edges/projects/verticals, Jul 21 19:33 — pre-apply timing consistent) ✓; regen-fallback.mjs reads the orgs table and maps rows to entityKind: "company" Persons (lines 82–102) ✓; prod today returns 32 nodes / 47 edges / 0 demo ✓ (also independently confirms rev 2.2.30's "32 nodes/0 DEMO").
- VERDICT: HOLDS.

OVERALL: PASS — 5/5 HOLD. The v3.0.11 "zero stale lines" claim survived independent sampling. Q4b may tick.

Score: 93/100 — every sampled load-bearing claim verified exactly against live sources; docked for one ambiguous sub-count on Task 2.0 and side findings below that the sweep should have caught or flagged.

PUNCH LIST (side findings — none blocks the PASS, all get fixed):
1. [Engineering/SECURITY] /api/network served the full graph to an UNAUTHENTICATED curl — real names, quotedAmount on 4 nodes, signed dates, relationships. Rob's private money graph on an open URL. Task 4.6 (RLS/roles) being open explains it but nothing in the PRD says "prod endpoint is currently public" — surface it as a known-open risk line on Task 4.6, or gate the route now. Revision rows saying "authed curl" read as if auth is enforced; it is not.
2. [Recording] Revision History has duplicate version numbers with different content: "3.0.2" appears twice (lines 387 and 406, two different changes), and 2.2.22/24/25/26/27 rows each appear twice; ordering is non-monotonic (3.0.2 above 3.0.13). Versions exist to be unique — dedupe/renumber the table.
3. [Truth] Task 2.0 line 158: change "3 secondary affiliations" → "3 people w/ secondary affiliations (4 rows)" so the arithmetic closes (11+4=15).
4. [Order] Local gh CLI auth is broken (401) — re-auth so future gates don't need anonymous-API workarounds.

WHAT SURVIVES CONTACT WITH ROB: The sweep was honest — 5/5 independently-sampled claims matched live Supabase, live prod, and the real GitHub remote, including exact counts (11/16, 15, 32/47, 16 orgs). The one stale line it self-reported (Task 3.1) was real, and it found it itself. That is what a living PRD is supposed to look like.

Disposition (Max, same commit): PASS recorded, Q4b ticked. Punch #3 fixed in PRD line 158; punch #1 surfaced as known-open risk on Task 4.6; punch #2 queued (BUILD-QUEUE revision-table renumber item); punch #1 route-gate queued as a security item; punch #4 gh re-auth pinged to Rob (PING-INBOX, non-blocking).
