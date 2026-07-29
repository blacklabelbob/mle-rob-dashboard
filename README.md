# The Network — MLE ROB Dashboard

One URL where Rob sees and grows The Network: every person as a node worth
**money + doors**, every project with completion/category/theme, an AI estimator
that prices what a relationship is really worth, and the CRM around it — deals,
activities, tasks, e-sign, invoicing.

Plain-English mission: [`WHAT-WE-ARE-DOING.md`](./WHAT-WE-ARE-DOING.md)
Living PRD: [`docs/plans/PRD-mle-crm.md`](./docs/plans/PRD-mle-crm.md)

## Scaffolding lives in git. Data lives in Supabase.

Nothing tracked in this repo is a real person. `data/network.json` and
`data/crm.json` are **generated synthetic seed** — invented names, RFC 2606
(`example.com`) addresses, non-assignable `555-01XX` phones, each file marked
`__synthetic`. Real rows arrive at runtime: either from Supabase directly, or
pulled into gitignored `*.local.json` overlays that are never committed.
`npm run guard:pii` turns the test suite red if a real contact ever reaches a
tracked file. Full plan:
[`docs/plans/PRD-scaffolding-in-git-data-in-supabase-v1.md`](./docs/plans/PRD-scaffolding-in-git-data-in-supabase-v1.md).

## Run it — three paths, pick one

### 1. Demo — no secrets, no network

```bash
git clone <repo> && cd "MLE ROB Dashboard"
npm install
npm run dev:demo          # http://localhost:3000
```

A **populated** dashboard on the committed seed — graph, people ledger,
pipeline, projects, activity feed all render real-shaped rows. No `.env.local`,
no API keys, nothing dialled out. Every page carries the banner *"Demo mode —
Generated sample data"* so nothing on screen can be mistaken for a real record.
This is the path CI runs.

After changing the generator, regenerate: `npm run seed:synthetic`. It is
deterministic — same seed, byte-identical files — and a hand-edit to
`data/*.json` fails the suite by design, because that is how a real phone number
would get back into git.

### 2. Live — the real dashboard

```bash
cp .env.example .env.local     # set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
STORAGE_SOURCE=supabase npm run dev
```

Reads and writes live Supabase; this is what production runs. Every other
variable in `.env.example` is optional — unset means that one seam reports
itself unconfigured (503 / skipped / heuristic fallback) and nothing else
changes. `npm run check:env` fails if code reads a variable the example file
does not document.

If Supabase is unreachable the file store covers the read, and the banner says
so in the loudest terms available — a live dashboard silently serving generated
rows is the one failure this project will not allow.

### 3. Local mirror — real data, offline

```bash
cp .env.example .env.local     # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run seed:local             # Supabase → data/*.local.json (gitignored)
npm run dev:demo               # file mode now serves the real rows
```

`seed:local` writes only the gitignored overlays, so `git status` stays clean of
data files. The overlay wins on read and absorbs every write — committed
scaffolding is never touched. Overlay rows are not marked `__synthetic`, so the
demo banner correctly stops claiming they are invented.

## Checks

```bash
npm test              # vitest
npm run lint
npm run guard:pii     # no real contacts in any tracked file (also enforced by the suite)
npm run check:env     # .env.example documents every variable the code reads
```

`.githooks/pre-push` runs lint and the suite, and the suite runs the guard over
the real tracked tree — so these are gates, not commands to remember.

## Structure

```
app/
  page.tsx              Overview — stats, biggest nodes, Things to Address
  network/              The Network graph (zoom/pan canvas, clusters by vertical)
  people/               People ledger + person records (timeline, connections, estimate)
  companies/            Company records — deals, contacts, open items
  deals/                Pipeline board — stage ladder, aging, money
  projects/             Projects board — completion / category / theme
  rep/                  Rep cockpit — same data, role decides what renders
  sign/                 E-sign agreement flow
  ops/                  Ops panels on the read-model seam
  training/             Training corner — renders docs/training/*.md
  api/                  Route handlers: network, estimate, admin, webhooks, cron
components/             NetworkGraph, EstimatePanel, FallbackBanner, record UI
lib/
  types.ts crm.ts       Data model — Person, Edge, Project, Deal, Activity, Task
  storage/              StorageAdapter — file store + Supabase store, one env var apart
  readModel/            Derived views (pipeline, invoicing/AR, KPIs)
  estimator.ts          Heuristic estimator (Claude when ANTHROPIC_API_KEY is set)
  __tests__/            The suite
data/
  network.json          Committed synthetic seed — graph
  crm.json              Committed synthetic seed — deals / activities / tasks
  *.local.json          Gitignored real-data overlays (npm run seed:local)
scripts/
  seed-synthetic.mjs    Generates the committed seed
  regen-fallback.mjs    Supabase → network.local.json
  seed-local-crm.mjs    Supabase → crm.local.json
  pii-guard.mjs         Tier A structural + Tier B denylist through one allowlist
  env-manifest.mjs      .env.example completeness
docs/
  plans/                The living PRDs
  training/             Training corpus (renders on /training)
  research/ reviews/    Research + critic-rob reviews
```

## Rules of the build

- **Storage behind an adapter.** `STORAGE_SOURCE=file|supabase` — swapping the
  store is one env var; a tool outage never stalls work.
- **Scaffolding in git, data in Supabase.** A tracked file never carries a real
  name, phone, address or dollar figure.
- **Guarantees live in code, not in prose.** Anything this README promises has a
  test or a guard behind it.
- **The PRD is alive.** Check off tasks as they land; version scope changes.
- **Speed over taxonomy.** Tools that make money and light nodes come first.
