# Rob dump — repo strategy, permissions, automation housing, agent visibility
**Captured:** 2026-07-29 · **Status:** DISCUSSION ONLY — Rob said "DO NOT DO ANYTHING. We're just talking."
**Fold-in target:** `PRD-scaffolding-in-git-data-in-supabase-v1.md` (Open Questions 1–3), plus a likely new PRD for the agent/skill packaging question.

> Captured verbatim-in-substance per the 2026-07-22 lesson (dumps that land in `sources/` but never get extracted are a defect). Every numbered item below is an open thread until it is answered in a PRD or a decision log.

---

## What Rob asked

1. **Restate decisions 1 and 2 in plain English**, and tell him the *right* way to do it — not just the options.

2. **Clarify the repo recommendation.** His read: "keep the repo as it is now, and then create another repo later of the full thing with those fixes in place." Is that what I meant?

3. **What do real commercial CRMs actually do?** Do they keep code on a private GitHub? Something else? He wants the industry answer, not my preference.

4. **The insider risk.** As he adds bookers and sales reps as users, they will know the software exists and that it holds valuable data. Even set to a lower permission level — "who knows, maybe they have a way to hack into it."

5. **Reuse across future entities.** Today only MLE staff use this CRM. But MLE will build platforms for clients, sometimes **spinning them off into new companies** or optimizing platforms for **specific verticals**. There will be elements of this CRM worth reusing rather than rebuilding from scratch.

6. **Confidence question — the important one.** After the changes we're about to make, what is the confidence level that we do not run into these issues again? He names the specific class: *"not automatically having an agent run and scrape our users' emails for anything useful, like a transcript or otherwise."* Are the automations he wants to run automatically in a place where confidence is **near 100%**?

7. **Where should everything live** so he can give partners access and they can loop in their automations?

8. **The housing question, stated as a versus:**
   - **(A)** Automation elements housed *together* with the tools he has built — the way the contracts pieces already spin up both the agreement and the invoice and send them, and the way the transcript-hunter agent (commissioned 2026-07-28) sweeps Gmail, Fireflies, Notion etc., extracts the pertinent info, and updates the CRM.
   - **(B)** Partners keep functionality like that on their **own local or virtual hub**, and we connect to it almost like plugging into a third-party API.

9. **Agent/skill visibility — he suggested `/plan`-ing this one now.** He wants any special agents or skills **sectioned off and presented in the codebase the way Claude recommends**, so it is easy for him to see which agents and skills we actually have. He referenced an example of "a very small repository focused on one thing."
   - ⚠️ **The example image/link did not come through.** Ask for it before designing against a guess.

10. **Sequencing intent:** "let's get everything buttoned up so we can finish building this out." The proposal generator is explicitly **not** critical to plug in right now — he knows it exists and knows it will be looped in. What matters is connecting that, *or anything like it*, **in the way that is easiest and most foolproof.**

---

## Standing constraints this touches

- Prod dashboard is **open, no logins** — Rob's decision 2026-07-27, closed, not to be re-raised as a question. Item 4 changes the *context* (named users arriving), so it is a new question, not the old one.
- No AGPL foundations — item 5 (spin-offs, white-label, vertical platforms) is exactly the scenario the 2026-07-22 OSS licence sweep protected against.
- CR-3: any guarantee here must be code or a hook, never prose.
- Rob does not read markdown deliverables — the answer to item 9 must be *visible in the repo structure itself*, not described in a doc.

## Open until answered

| # | Thread | Blocks |
|---|---|---|
| 2 | Private-now / clean-repo-later — is that the plan? | PRD Phase 6 |
| 4 | Auth + RLS before named users arrive | New — not in any PRD yet |
| 5 | Core-vs-instance split for spin-offs and verticals | Shapes every packaging decision below |
| 6 | Confidence: agent read-scope, least privilege, audit trail | New — not in any PRD yet |
| 8 | In-repo modules vs partner-hosted services | Shapes item 7 and item 9 |
| 9 | Agent/skill packaging + the missing example image | Needs Rob's example first |
