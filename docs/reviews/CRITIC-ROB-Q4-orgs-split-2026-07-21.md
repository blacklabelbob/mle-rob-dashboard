# Critic-Rob Milestone Review — Q4 / PRD Task 2.0 (people/org split)
**Date:** 2026-07-21 · **Verdict:** TICK · **Score:** 97/100
Gates: Fidelity 97 · UX 95 · Truth 100 · Engineering 97 · Recording 98 · Effort 98

Independent verification (critic ran every check itself against live Supabase + prod URL):

- **Zero businesses typed as Person:** `people?entity_kind=eq.company` → 0 rows. Live people = 22 = 16 real + 6 `demo-*` (rep demo book). PASS.
- **org_id linking:** 11/16 linked; the 5 nulls are exactly the documented honest skips (rob-acheson, david-cates, will, trent-brands, george-eu — no org row exists). `org_memberships` = 15. PASS.
- **Graph + ledger render:** prod `/api/network` → 32 nodes / 47 edges / 0 dangling / 0 DEMO (isDemo filter working with 6 DEMO rows in DB). `/people/calebs-brother-moving-co` renders Business, $7,000, referrer Caleb Green. Biz badge markup on `/people`. PASS.
- **Reconciliation:** backup `pre-0003-people-2026-07-21.json` = 32 in → 16 people + 16 orgs out; edges 47, 0 rows with both paired FKs null on either end. PASS.
- **Money truth gates:** signed set pre vs post IDENTICAL (Naples $5k, Gulf Coast $19k, CG Roofing $10k + caleb-green person). Gulf `key_dates` carried byte-for-byte; `isDisputedSigned` computes the same pre/post. Field preservation on orgs: referred_by 16/16, relationship 16/16, estimate 10, quoted 4, signed 3 — exact. PASS.
- **Artifacts:** 15/15 vitest (ran), 0003 committed, rehearsal rollback harness present, 4 backup files present. PASS.

## Punch list (non-blocking)
1. [Engineering] `/api/network` doesn't export `entityKind` — add it before Phase-2 deals consumers exist, so nobody re-infers person-vs-business from names.
2. [Recording] `people.entity_kind` column is now 0-company transitional debris — dated drop-note added to PRD (drop after Task 2.2 lands).
3. [Recording] Gulf dispute resolved-by-data (signed date present since 7/18) — noted in PRD so future reviewers stop hunting it.

Full agent output preserved in session transcript; review run by `critic-rob` agent, 19 tool uses, all claims evidence-backed.
