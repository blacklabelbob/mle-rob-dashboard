# Homemade-CRM Failure Modes & Detection (PRD Task 3.8)
**Created:** 2026-07-22 · living doc — update whenever a watchdog lands or a new failure mode is discovered.

Every way this CRM can silently break, and the thing that catches it. Rule of the house: a failure mode without a detection method is an open defect — add the watchdog or write down why it's accepted.

| # | Failure mode | What breaks | Detection method | Status |
|---|---|---|---|---|
| 1 | **Credential expiry — JWT keys** (SUPABASE_SERVICE_ROLE_KEY, future N8N_API_KEY) | All reads/writes → CRM serves fallback file data | Nightly `/api/cron/integrity` decodes the real `exp` claim from each JWT in env; ≤7 days out → high-severity flag in Things to Address (Task 3.8, 2026-07-22). Rotation re-arms the alert (exp is part of the flag's idempotency key). | ✅ LIVE |
| 2 | **Credential revocation — non-JWT secrets** (CRON_SECRET, AIDRE_WEBHOOK_SECRET, ANTHROPIC_API_KEY, Vercel deploy token) | Crons stop / webhooks 503 / AI features fail | No expiry to decode — revocation shows as 401/503 at the consumer. Crons: Vercel cron logs show non-200 (check `vercel crons ls` + logs). Webhooks: senders get 401 and their side alerts. Anthropic: feature errors surface in Vercel runtime logs. | ⚠️ indirect — acceptable while all consumers are low-volume; revisit with Task 3.6 |
| 3 | **Orphaned rows** (task loses all anchors via deal delete; FK/check bypass) | Ghost records the UI can't reach | Nightly `/api/cron/integrity` orphan sweep → flags ledger (Task 3.7, live 2026-07-22) | ✅ LIVE |
| 4 | **Duplicate people/orgs** | Split activity history, double outreach | Nightly `/api/cron/dedup` (shared detector w/ admin POST) → dedup_review queue (Task 3.5) | ✅ LIVE |
| 5 | **Silent capture-workflow failure** (Gmail/AIDRE ingestion stops) | CRM quietly stops learning; looks fine, data is stale | **Task 3.6 LIVE (inc.2 2026-07-22):** n8n Error Trigger → `POST /api/webhooks/n8n-error` → high flag on the ledger within seconds (covers run failures AND polling-trigger credential failures). Proven on prod: forced once-a-minute failure → flag in seconds, 12+ alarm runs → 1 flag (storm idempotency). Alarm workflow `VoOFOPGqObGWe5Jr` + `errorWorkflow` on Gmail capture | ✅ LIVE |
| 6 | **Fallback-data drift** (Supabase unreachable → file store serves stale data) | Users see old numbers without knowing | Amber "serving fallback data" banner (Q1); sticky until next good read; `scripts/regen-fallback.mjs` keeps the file honest | ✅ LIVE |
| 7 | **Cron silently unregistered** (vercel.json edit drops a cron) | Watchdogs 1/3/4 stop watching — meta-failure | `vercel crons ls` check is part of every cron-touching increment's DoD; both crons verified 2026-07-22 | ✅ process |
| 8 | **Supabase project pause** (free-tier inactivity) | Everything → fallback mode | Same surface as #6 (banner) + nightly crons start failing (Vercel logs). Daily traffic makes pause unlikely. | ⚠️ indirect |

**Where alerts land:** high-severity rows in the `flags` ledger → "Things to Address" on the dashboard (findings protocol 2026-07-22). Nothing alert-worthy lives only in logs.
