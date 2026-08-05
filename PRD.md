# PRD — start here

**Rob, 2026-08-05:** *"Why do I have to search so hard for the PRD. And which one is it? Is that not important?"*
It is. This file exists so nobody ever has to ask again. It is a signpost, not a document — nothing is written here.

---

# 👉 THE LIVING PRD IS [`docs/plans/PRD-mle-crm.md`](./docs/plans/PRD-mle-crm.md)

That is the one. It is unified (2026-07-21), it is current, and it is the only PRD in this repo that gets
updated as work ships. If you open one file, open that one.

**Alongside it:** [`BUILD-QUEUE.md`](./BUILD-QUEUE.md) — what is actually being built next, in order.
The PRD is the *what and why*; the queue is the *what's next*.

---

## Every other PRD-shaped file, and why it is not the one

| File | What it is | Open it? |
|---|---|---|
| [`docs/plans/PRD-mle-crm.md`](./docs/plans/PRD-mle-crm.md) | ✅ **THE LIVING PRD.** The CRM / dashboard / network. Updated every increment. | **Yes** |
| [`docs/plans/PRD-scaffolding-in-git-data-in-supabase-v1.md`](./docs/plans/PRD-scaffolding-in-git-data-in-supabase-v1.md) | A narrow architecture decision doc — why code lives in git and data lives in Supabase. | Only for that question |
| [`docs/plans/PRD-claude-arsenal-visible-versioned-shareable-v1.md`](./docs/plans/PRD-claude-arsenal-visible-versioned-shareable-v1.md) | A narrow doc about surfacing the agent/skill arsenal. | Only for that question |
| `docs/archive/plans/PRD-mle-crm-evolution-v1.md` | ⛔ **SUPERSEDED** — folded into the living PRD on 2026-07-21. | No |
| `docs/archive/plans/PRD-mle-rob-dashboard-v2.md` | ⛔ **SUPERSEDED** — folded into the living PRD on 2026-07-21. | No |

**Other repos:** `~/Projects/MyLocalEverything/contracts/docs/plans/` has its own PRD for client onboarding
automation. Different project, different PRD. This file only covers the dashboard.

## The rule going forward

One living PRD per repo. It lives at `docs/plans/PRD-<repo>.md` and this signpost points at it. A new
planning doc that is **not** the living PRD gets a one-line "this is not the living PRD" note at its top and a
row in the table above, **in the same commit that creates it.** Superseded PRDs move to `docs/archive/plans/`
and get a ⛔ header, never left loose beside the live one.

Canonical repo map: `~/.claude/rules/canonical-repos.md`.
