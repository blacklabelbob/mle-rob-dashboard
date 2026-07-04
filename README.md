# The Network — MLE ROB Dashboard

One URL where Rob sees and grows The Network: every person as a node worth
**money + doors**, every project with completion/category/theme, and an AI
estimator that prices what a relationship is really worth.

Plain-English mission: [`WHAT-WE-ARE-DOING.md`](./WHAT-WE-ARE-DOING.md)
Living PRD: [`docs/plans/PRD-mle-rob-dashboard-v2.md`](./docs/plans/PRD-mle-rob-dashboard-v2.md)

## Run it

```bash
npm install
npm run dev        # http://localhost:3000 (verified tonight on :3777 — any port works)
```

Optional: copy `.env.example` → `.env.local` and set `ANTHROPIC_API_KEY` to make
the estimator Claude-powered (it falls back to a transparent heuristic without it).

## Structure

```
app/
  page.tsx              Overview — stats, biggest nodes, Will's action items
  network/page.tsx      The Network graph (zoom/pan canvas, clusters by vertical)
  people/page.tsx       People ledger — all of Rob's fields, sortable
  people/[id]/page.tsx  Person record — dates timeline, connections, AI estimate
  projects/page.tsx     Projects board — completion / category / theme + Will flags
  training/page.tsx     Training corner — renders docs/training/*.md
  api/network/route.ts  Graph data for the canvas
  api/estimate/route.ts AI estimator (Claude if key set, heuristic otherwise)
components/
  NetworkGraph.tsx      Force-directed canvas graph (no chart deps)
  EstimatePanel.tsx     Estimator UI on person detail
lib/
  types.ts              Data model — Person, Edge, Project, Vertical, Estimate
  stats.ts              Contribution + rollup math
  estimator.ts          Heuristic estimator v1
  storage/              StorageAdapter + file store + sheets/airtable/supabase stubs
data/
  network.json          Day-1 store (swap via STORAGE_SOURCE env — see docs/STORAGE-DECISION.md)
docs/
  training/             Training corpus (renders on /training)
  research/             Network research (e.g. payment-processing candidates)
  plans/                The living PRD
```

## Rules of the build

- **Storage behind an adapter.** `STORAGE_SOURCE=file|sheets|airtable|supabase` — swapping
  the store is one env var; a tool outage never stalls work.
- **The PRD is alive.** Check off tasks as they land; version scope changes.
- **Speed over taxonomy.** Tools that make money and light nodes come first.
