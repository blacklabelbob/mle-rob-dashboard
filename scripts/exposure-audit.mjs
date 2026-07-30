#!/usr/bin/env node
/**
 * `npm run audit:exposure` — Q73 audit half (BUILD-QUEUE), the unblocked one.
 *
 * Answers two questions Rob asked when he said bookers and sales reps are about
 * to become named users: **what can anyone holding the prod URL read today**,
 * and **what can the service-role key reach**, with the money/PII weight behind
 * each. Both answers are DERIVED — routes from `app/`, tables from
 * `supabase/migrations/*.sql` — because the queue item says "generated from
 * code rather than from memory" and a hand-written inventory is exactly the
 * artifact that goes stale the day after it is written (CR-3).
 *
 * THREE choices here are load-bearing:
 *
 * 1. **A route is OPEN unless it proves otherwise.** Gating is detected by the
 *    route reading a shared secret / authorization header. Anything we cannot
 *    see gating in is reported as open, because the failure mode we care about
 *    is under-reporting exposure. A false "open" costs a re-read; a false
 *    "gated" is the thing that gets someone's phone number scraped.
 *
 * 2. **Column classification is by name, and its limits are printed.** `value`,
 *    `paid`, `phone` are money/PII by any reading; a name-based pass cannot see
 *    PII buried inside a `notes` jsonb. The report says so rather than implying
 *    the count is complete — an audit that overstates its own coverage is worse
 *    than none.
 *
 * 3. **No network, no service-role key needed to RUN it.** The audit describes
 *    what the key can reach; it must not require the key, or it can only be run
 *    by someone already holding the thing under audit.
 *
 * Writes `docs/ops/EXPOSURE-AUDIT.md`. Exit 0 always — this is an inventory,
 * not a gate. The gate is the RLS work in Q73's rollout half, which is Rob's go.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readSchema } from "./lib/schema-from-migrations.mjs";
import { MONEY, PII, hits, unreviewed, IDENTIFIED_UNDECIDED } from "./lib/sensitive-columns.mjs";
import { dirname } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ tables */



/* ---------------------------------------------------------------- surfaces */

/** Every file named `name` under `dir`, recursively. */
function walk(dir, name, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, name, out);
    else if (entry === name) out.push(p);
  }
  return out;
}

/** app/foo/[id]/page.tsx -> /foo/[id] ; route groups `(x)` drop out. */
function toRoute(file) {
  const rel = relative(join(repo, "app"), file).split(sep).slice(0, -1);
  const parts = rel.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return "/" + parts.join("/");
}

/** Does this handler check a shared secret / authorization header? */
const GATE = /CRON_SECRET|LEADS_KEY|ESIGN_SENDER_SECRET|ADMIN_KEY|authorization|x-api-key|bearer/i;

function readSurfaces() {
  const pages = walk(join(repo, "app"), "page.tsx").map((f) => ({
    kind: "page",
    route: toRoute(f) || "/",
    gated: GATE.test(readFileSync(f, "utf8")),
    file: relative(repo, f),
  }));
  const apis = walk(join(repo, "app"), "route.ts").map((f) => {
    const src = readFileSync(f, "utf8");
    const methods = [...src.matchAll(/export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)/g)]
      .map((m) => m[1]);
    return {
      kind: "api",
      route: toRoute(f),
      gated: GATE.test(src),
      methods: methods.length ? methods : ["—"],
      file: relative(repo, f),
    };
  });
  return { pages, apis };
}

/* ------------------------------------------------------------------ report */

const tables = readSchema();
const { pages, apis } = readSurfaces();

const rows = [...tables.entries()]
  .map(([table, cols]) => {
    const list = [...cols];
    const money = list.filter((c) => hits(c, MONEY));
    const pii = list.filter((c) => hits(c, PII));
    return { table, total: list.length, money, pii };
  })
  .sort((a, b) => b.money.length + b.pii.length - (a.money.length + a.pii.length) || a.table.localeCompare(b.table));

const openApis = apis.filter((a) => !a.gated);
const totalMoney = rows.reduce((n, r) => n + r.money.length, 0);
const totalPii = rows.reduce((n, r) => n + r.pii.length, 0);

// The third answer. Two states — "matched a sensitive pattern" and "not mentioned" — were being
// read as opposites, so a name nobody had ever looked at counted as cleared. Three increments
// each found a real leak in that gap by chance (25, 28, 29). Printing it makes it finite.
const unrev = unreviewed(tables);
const unrevNames = [...new Set([...unrev.values()].flat())].sort();
const unrevTotal = [...unrev.values()].reduce((n, l) => n + l.length, 0);

const md = [
  "# Exposure audit — what is readable today",
  "",
  "> **GENERATED — do not hand-edit.** `npm run audit:exposure` (`scripts/exposure-audit.mjs`)",
  "> rebuilds this file from `app/` and `supabase/migrations/*.sql`. Re-run it after any",
  "> route or migration change; a hand-kept copy of this page would be stale within a day.",
  "",
  "Q73 audit half (BUILD-QUEUE): Rob is about to add bookers and sales reps as named users.",
  "This is the enumeration of what a person holding the prod URL can reach **before** any",
  "permission layer exists, and what the service-role key can reach behind it.",
  "",
  "## Headline",
  "",
  `| | count |`,
  `|---|---|`,
  `| Pages served to anyone with the URL | **${pages.length}** |`,
  `| API routes total | ${apis.length} |`,
  `| API routes with **no** secret/authorization check | **${openApis.length}** |`,
  `| Tables the service-role key can reach | **${rows.length}** |`,
  `| Money columns behind them | **${totalMoney}** |`,
  `| Person/PII columns behind them | **${totalPii}** |`,
  `| Columns **nobody has ruled on** (neither sensitive nor reviewed-benign) | ${unrevTotal} (${unrevNames.length} distinct names) |`,
  "",
  "**There is no per-user permission layer today.** Every page and every ungated API route",
  "answers the same to Rob and to a booker who has the link — the dashboard was opened on the",
  "decision that only Rob held the URL (closed 2026-07-27), and named non-owner staff is the",
  "new fact that reopens the population, not that decision.",
  "",
  "## Tables reachable by the service-role key",
  "",
  "| table | columns | money | PII |",
  "|---|---:|---:|---:|",
  ...rows.map((r) =>
    `| \`${r.table}\` | ${r.total} | ${r.money.length ? `**${r.money.length}** — ${r.money.map((c) => `\`${c}\``).join(", ")}` : "0"} | ${r.pii.length ? `**${r.pii.length}** — ${r.pii.map((c) => `\`${c}\``).join(", ")}` : "0"} |`),
  "",
  "## The blind spot, printed rather than left silent",
  "",
  "A name-based classifier has three answers, not two: **sensitive**, **reviewed and cleared**,",
  "and **nobody has looked at this name**. The first two are decisions; the third is a gap. Until",
  "2026-07-29 this file collapsed the last two together, so a column that had been cleared and a",
  "column that had never been read produced the identical silence — and three separate increments",
  "each found a real leak sitting in that gap **by chance rather than by tooling**:",
  "",
  "| increment | what was hiding | how it was found |",
  "|---|---|---|",
  "| inc.25 | 4 real columns swallowed by comment prose in `0012_invoice_ledger.sql` | reading generated SQL |",
  "| inc.28 | `activities.recording_url` — the audio, granted while the transcript link was refused | reading one GRANT line |",
  "| inc.29 | `people`/`orgs`.`meeting_video_url` — the recorded meeting, same pair, said \"video\" not \"recording\" | reading this list |",
  "",
  "So the third answer is now explicit: `BENIGN` in `scripts/lib/sensitive-columns.mjs` holds the",
  "names reviewed and cleared (keys, timestamps, enums, hashes, provenance), and everything in",
  "neither list is printed below. **A column added tomorrow with an unfamiliar name lands here",
  "instead of reading as safe.** This list shrinks when somebody rules on a name — never by the",
  "report going quiet. Sensitive always wins over benign, so a broad benign pattern cannot",
  "downgrade a money or PII column.",
  "",
  `**${unrevTotal} columns, ${unrevNames.length} distinct names:**`,
  "",
  "| table | columns nobody has ruled on |",
  "|---|---|",
  ...[...unrev.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, l]) => `| \`${t}\` | ${l.map((c) => `\`${c}\``).join(", ")} |`),
  "",
  "### The open queue — looked at, deliberately not ruled yet",
  "",
  "**On a covered table, this queue is the ONLY way a column may stay unruled.** Everything else",
  "on those nine tables must be classified sensitive (then denied or deliberately granted) or",
  "reviewed benign — `grantBreaches()` returns `unreviewed-on-covered-table` otherwise and the",
  "generator refuses to write the migration. That is the 2026-07-29 inc.30 change: the three leaks",
  "above were each caught by a person reading output, so the detector is now a failing test rather",
  "than somebody's attention. Each entry below says what its decision hinges on.",
  "",
  "| column | where | what the decision hinges on |",
  "|---|---|---|",
  ...IDENTIFIED_UNDECIDED.map((u) => `| \`${u.column}\` | ${u.tables.map((t) => `\`${t}\``).join(", ")} | ${u.note} |`),
  "",
  "**Coverage limit, stated rather than implied:** columns are classified by *name*. PII sitting",
  "inside a free-text or `jsonb` column (`notes`, `payload`, `key_dates`) is **not** counted here —",
  "the structural PII guard (`npm run guard:pii`) is what covers content. Read these counts as a",
  "floor, never as the total.",
  "",
  "## Pages — readable by anyone with the prod URL",
  "",
  "| route | file |",
  "|---|---|",
  ...pages.sort((a, b) => a.route.localeCompare(b.route)).map((p) => `| \`${p.route}\` | \`${p.file}\` |`),
  "",
  "## API routes",
  "",
  "| route | methods | gate |",
  "|---|---|---|",
  ...apis.sort((a, b) => a.route.localeCompare(b.route)).map((a) =>
    `| \`${a.route}\` | ${a.methods.join(", ")} | ${a.gated ? "secret/auth checked" : "**open**"} |`),
  "",
  "## What closes this",
  "",
  "The audit half of Q73 ends here — it is an inventory, and `npm run audit:exposure` exits 0",
  "by design so it never blocks a build. The **rollout half** (Supabase RLS + a per-role read",
  "test that fails when a booker-role token selects `value`, `paid`, or a phone/email column)",
  "ships only on Rob's explicit go, per the queue item.",
  "",
].join("\n");

writeFileSync(join(repo, "docs/ops/EXPOSURE-AUDIT.md"), md, "utf8");
console.log(
  `wrote docs/ops/EXPOSURE-AUDIT.md — ${pages.length} pages, ${apis.length} api routes ` +
  `(${openApis.length} open), ${rows.length} tables, ${totalMoney} money / ${totalPii} PII columns`,
);
