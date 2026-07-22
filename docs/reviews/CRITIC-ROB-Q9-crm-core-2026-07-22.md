# CRITIC ROB — Q9: CRM Core Schema Milestone (Tasks 2.1 / 2.2 / 2.3 / 2.7)
**Date:** 2026-07-22 · **Reviewer:** critic-rob agent (session a66f0def496caaadc) · **Requested by:** crm-build-driver

```
VERDICT: SHIP   ·   Score: 95/100
Gates: Fidelity 98 · UX 96 · Truth 95 · Engineering 97 · Recording 95 · Effort 97
```

**Verification actually performed (nothing taken on trust):**

- **Tests:** `npx vitest run` reproduced by the reviewer — 120/120, 12 files. The DDL gate suite (`lib/__tests__/crm.test.ts`) genuinely parses `0005_crm_core.sql` off disk: column-set equality BOTH directions per table, enum arrays == check-constraint lists. Not a mock of the schema — the schema.
- **Contract suite:** one identical behavioral suite × both stores (`lib/storage/__tests__/adapter.contract.test.ts`); file store on a temp `CRM_DATA_PATH`, supabase store through the real `lib/crm.ts` mappers. Live-table proof was done separately in inc.4 and the fake-vs-live caveat was recorded honestly in the PRD at the time — that's how it's done.
- **Prod (read-only curls):** deals = **6 rows, sum exactly $41,000** (19,000 + 10,000 + 7,000 + 5,000 + 0 + null). **Zero demo-sourced rows.** All six stage/value/key_dates match source rows in people/orgs **verbatim**. `referral_sourced=true` on all six is backed by a non-null `referred_by_id` on every source row — checked each one.
- **caleb+CG dedup:** ONE deal (`deal-cg-roofing-group`), dual-anchored person+org, $10k counted once; both source rows carry identical signed/invoiced dates, satisfying `canMerge` legitimately.
- **Idempotency proven live by the reviewer:** ran the dry-run — planned 6 / to insert 0, all SKIP, 5 DEMO-SKIP lines ($39.5k of fiction reported, not silently dropped).
- **Source rows untouched, proven two ways:** (1) script code contains only GETs on people/orgs and POSTs to deals/activities — no PATCH path exists; (2) diffed live quoted/signed/key_dates for all 7 source rows against the pre-backfill committed snapshot (`git show 25d0e0f:data/network.json`) — **0 mismatches**. Money and signed fields are exactly where Rob left them.
- **activities/tasks:** both empty in prod, matching the "0 step-8 rows, handler ready" claim (no live row carries a video/transcript URL — verified).
- **PRD revision rows 3.1.7–3.1.15:** all checked against commits — accurate; the 3.1.13 gap is the absorbed autosave row, documented in 3.1.14. Repo pushed, 0/0 vs origin/main.

**RULING ON POLK (quoted_amount=0 → stage quote_sent): ACCEPTABLE, with one flag owed.**
Copying the 0 verbatim was the only correct move — inventing a value or nulling Rob's data would have been the sin. The $0 adds nothing to the pipeline, so no money is misstated either way. The stage derivation is defensible (the row literally carries a quote amount; the ladder treated it as evidence of a quote). But 0 is ambiguous: it's either a deliberate $0 door-opener quote (plausible — Polk is Rob's test case and personally referred naples-spine's $5k) or a data-entry placeholder, in which case the honest stage is `meeting_held` (his only key_date is `met`, and calebs-brother shows real quotes carry a `quoted` stamp). The script can't know and neither can the reviewer — **only Rob can.** Surfacing it to this review was legitimate, but the Things-to-Address flag system (Task 1b.1) exists for exactly this and wasn't used.

**PUNCH LIST (ranked, all post-ship follow-ups — none blocks the tick):**

1. **[Truth]** Post a flag via `/api/admin/flags`: "Polk `quoted_amount=0` — real $0 quote or placeholder? Deal stage derived `quote_sent`; say the word and it becomes `meeting_held`." Route the ambiguity to the data owner, not just the reviewer. → one POST, done in a minute.
2. **[Truth]** Deal `notes` provenance overstates on gary and polk: "Backfilled from org+person rows" — but dececco-pasta and proplogic contributed zero data; only the CG merge earned the dual-source claim. `toDeal` keys the wording on anchors, not on data provenance (`scripts/backfill-crm.mjs:69`). → key it on `mergedFrom` instead; PATCH the 2 prod notes strings or accept them as cosmetic debris.
3. **[Recording]** `prd-autosave.sh` is writing content-free version bumps into the revision log (3.1.8, 3.1.10, and an uncommitted 3.1.15 sitting in the working tree at review time). A living doc's history should record work, not heartbeats. → suppress version bumps on no-op touches; commit or drop the stray 3.1.15.
4. **[Engineering]** Synthetic noon-UTC `occurred_at` for date-only `met` stamps (`T12:00:00Z`) manufactures a time of day. Pinned by test and harmless today (0 live rows), but when the handler first fires for real, stamp `source_context.time_synthetic: true` so nobody ever reads precision that isn't there.

**WHAT SURVIVES CONTACT WITH ROB:** The $41k pipeline is real — every dollar traced to a source row he typed, the caleb+CG $10k counted exactly once, $39.5k of demo fiction kept out and reported, and his people/orgs money fields provably untouched. The truth gates live in code (merge guard, demo skip, deterministic ids, CONFLICT reporting), not in prose promises. Five increments, each independently verified, honestly caveated, committed, and pushed. Q9 ticks.

**Driver disposition (same increment):** punch #1 executed — Polk flag posted to `/api/admin/flags`. Punch #2–4 recorded in PRD Task 2.7 as follow-ups.
