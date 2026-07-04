# docs/sync — mirrors of external references (master lives HERE)

Rob's rule (2026-07-04): this project folder is the master foundation — anything referenced
from outside gets synced in. These are point-in-time mirrors; the canonical live copies:

| Mirror | Live source | Why it exists outside |
|---|---|---|
| `prd-registry-index.json` | `~/.claude/plans/index.json` | /plan skill autosave hooks read it globally |
| `prd-snapshots/` | `~/.claude/plans/snapshots/mle-rob-dashboard/` | PRD rollback history |

The PRD itself is NOT mirrored — it natively lives in this repo (`docs/plans/PRD-mle-rob-dashboard-v2.md`).
Re-sync: `cp ~/.claude/plans/index.json docs/sync/prd-registry-index.json` (wire into Phase 5.5 autosave).
