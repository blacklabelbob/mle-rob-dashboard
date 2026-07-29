#!/usr/bin/env node
// Q71 Phase 4, items 2-4 — load the 13 Fireflies meeting exports into 0021.
//
//   node scripts/transcripts-to-supabase.mjs            # dry run: plan it, write nothing
//   node scripts/transcripts-to-supabase.mjs --verify    # read-only: does the DB agree?
//   node scripts/transcripts-to-supabase.mjs --apply     # the write (gated, see below)
//
// Run it through `npm run transcripts:plan|verify|apply` — those carry the loader flag.
//
// THE WRITE IS GATED ON ROB, AND THE GATE IS IN CODE RATHER THAN IN A COMMENT.
// PRD Phase 0 asks "may the 13 transcripts load into prod Supabase?" and that is unanswered.
// A note saying "don't run this yet" is not a gate — it is a suggestion that survives
// exactly until someone runs the file. So `--apply` refuses unless
// `TRANSCRIPT_LOAD_APPROVED=1` is set, which is one env var for the moment Rob says go, and
// an explicit act nobody performs by accident. `--plan` and `--verify` need no approval:
// neither writes, and both are how the answer gets made on evidence.
//
// It imports `lib/calls/firefliesMapping.ts` and `lib/calls/transcriptStore.ts` DIRECTLY
// (see `scripts/ts-loader.mjs`) rather than restating them. The mapping's five decisions are
// graded by 19 tests; a copy in this file would be a sixth decision nobody tested.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const BODY_DIR = join(REPO, "MLE Internal Meetings", "transcripts");

const { planTranscriptLoad, verifyLoad } = await import("../lib/calls/transcriptLoadPlan.ts");

const argv = new Set(process.argv.slice(2));
const MODE = argv.has("--apply") ? "apply" : argv.has("--verify") ? "verify" : "plan";

function die(msg) {
  console.error(msg);
  process.exit(1);
}

/** Read every export off disk. The ONLY filesystem access in this program. */
function readExports() {
  if (!existsSync(BODY_DIR)) {
    die(`No transcripts at ${BODY_DIR}\nRun: node scripts/fireflies-ingest.mjs`);
  }
  const names = readdirSync(BODY_DIR).filter((n) => n.endsWith(".json")).sort();
  return names.map((source) => {
    try {
      return { source, data: JSON.parse(readFileSync(join(BODY_DIR, source), "utf8")) };
    } catch (err) {
      // A corrupt file becomes a planned SKIP, not a crash: one bad export must not stop
      // the other twelve, and the plan is where the reader should see it.
      console.error(`  ! ${source}: unreadable (${err.message})`);
      return { source, data: null };
    }
  });
}

function printPlan(plan) {
  for (const e of plan.entries) {
    const mark = e.skipped ? "skip" : " ok ";
    const why = e.skipped ? ` — ${e.skipped}` : e.rejected ? ` (${e.rejected} sentence(s) rejected)` : "";
    console.log(`  [${mark}] ${e.source}  ${e.sentences} sentences -> ${e.segments} segments${why}`);
  }
  console.log(
    `\n  ${plan.loadable} loadable, ${plan.skipped} skipped, ${plan.segments} segments, ${plan.rejected} rejected`
  );
}

const files = readExports();
const plan = planTranscriptLoad(files);

if (MODE === "plan") {
  console.log(`Planning ${files.length} export(s) from MLE Internal Meetings/transcripts\n`);
  printPlan(plan);
  console.log("\nDRY RUN — nothing was written. `--apply` writes (needs TRANSCRIPT_LOAD_APPROVED=1).");
  process.exit(0);
}

// Everything past here talks to Supabase, so credentials stop being optional.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  die("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example)");
}

const { transcriptClient } = await import("../lib/calls/transcriptDb.ts");
const supabase = transcriptClient();

if (MODE === "verify") {
  console.log(`Verifying ${plan.loadable} transcript(s) against Supabase\n`);
  const observed = [];
  for (const e of plan.entries) {
    if (e.skipped || !e.recordingSid) continue;
    const { data: row, error } = await supabase
      .from("call_transcripts")
      .select("id")
      .eq("recording_sid", e.recordingSid)
      .maybeSingle();
    if (error) die(`call_transcripts read: ${error.message}`);
    if (!row) {
      observed.push({ recordingSid: e.recordingSid, segments: null });
      continue;
    }
    // `head: true` + `count: "exact"` counts server-side — pulling 4,451 rows to call
    // `.length` on them would be the same answer for several megabytes more.
    const { count, error: cErr } = await supabase
      .from("call_transcript_segments")
      .select("idx", { count: "exact", head: true })
      .eq("transcript_id", row.id);
    if (cErr) die(`call_transcript_segments count: ${cErr.message}`);
    observed.push({ recordingSid: e.recordingSid, segments: count ?? 0 });
  }

  const report = verifyLoad(plan, observed);
  for (const r of report.rows) {
    console.log(`  [${r.ok ? " ok " : "FAIL"}] ${r.source}  ${r.expected} expected${r.ok ? "" : ` — ${r.detail}`}`);
  }
  console.log(`\n  ${report.summary}`);
  process.exit(report.ok ? 0 : 1);
}

// --- apply -----------------------------------------------------------------------------
if (process.env.TRANSCRIPT_LOAD_APPROVED !== "1") {
  die(
    "REFUSED: writing internal meeting transcripts to prod Supabase is gated on Rob's\n" +
      "PRD Phase 0 answer (docs/plans/PRD-scaffolding-in-git-data-in-supabase-v1.md).\n" +
      "Once he says go: TRANSCRIPT_LOAD_APPROVED=1 npm run transcripts:apply\n" +
      "Until then `--plan` and `--verify` show exactly what it would do, without writing."
  );
}

const { persistTranscript } = await import("../lib/calls/transcriptStore.ts");
const { supabaseTranscriptDb } = await import("../lib/calls/transcriptDb.ts");
const { mapFirefliesTranscript } = await import("../lib/calls/firefliesMapping.ts");

const db = supabaseTranscriptDb(supabase);
console.log(`Loading ${plan.loadable} transcript(s) into Supabase\n`);

// `updatedAt` is pinned to the transcript's own content, not to the clock: re-running an
// unchanged file should produce an unchanged row, which is what makes "run it twice" a
// meaningful idempotency check rather than a timestamp shuffle.
let written = 0;
let segments = 0;
for (const { source, data } of files) {
  const entry = plan.entries.find((e) => e.source === source);
  if (entry?.skipped) {
    console.log(`  [skip] ${source} — ${entry.skipped}`);
    continue;
  }
  const mapping = mapFirefliesTranscript(data);
  const result = await persistTranscript(db, mapping);
  if (result.kind === "rejected") {
    console.log(`  [FAIL] ${source} — rejected: ${result.reason}`);
    continue;
  }
  written += 1;
  segments += result.segments;
  console.log(`  [ ok ] ${source}  ${result.segments} segments`);
}

console.log(`\n  ${written} transcript(s), ${segments} segment(s) written`);
console.log("  Verify with: npm run transcripts:verify");
process.exit(written === plan.loadable ? 0 : 1);
