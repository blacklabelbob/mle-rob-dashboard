#!/usr/bin/env node
/**
 * ONE cross-meeting ranking per COMPANY — critic-rob Q89 punch #1, move 3.
 *
 * WHY THIS EXISTS. Every meeting was scored on its own, so C-2018 (Gulf Coast RE Group) carried
 * TWO independent rankings — a #1 from 06-16 and a #1 from 07-22 — zipped into one list under one
 * `ranked` header. inc.14's unique-rank gate caught that and correctly demoted the block to
 * source order, which is honest but is not the fix. The ruling (docs/reviews/CRITIC-ROB-Q89-
 * meeting-intel-2026-08-05.md §1): *"One list, one score, re-run whenever a meeting lands."*
 * Rob opens a company to answer one question — what do I do next on this account. A meeting is a
 * filing detail; an account is a decision.
 *
 * HOW GATE A SURVIVES THE MERGE — the part that matters, and the part it would be easy to get
 * wrong. `score_next_steps.py` gate A refuses any item whose `source_line` is not literally
 * present in the `--transcript` it was handed. Merging two meetings into one bundle and handing
 * the scorer both transcripts concatenated would WEAKEN that gate: an item from meeting A could
 * then cite a line that only exists in meeting B and still pass. So this runs in two passes:
 *
 *   PASS 1 — score each meeting ALONE against ITS OWN transcript. This is the real gate A, at
 *            full strength, per item. Any meeting that refuses aborts the whole company run.
 *   PASS 2 — only items that survived pass 1 are merged, and the merged run's concatenated
 *            record is therefore a re-check of lines already proven one-to-one against their own
 *            source. The concatenation can no longer launder anything, because nothing reaches it
 *            unproven.
 *
 * ID COLLISION IS REAL, NOT HYPOTHETICAL. Both Gulf Coast bundles number their items `A1..An`.
 * Merging on the raw id would silently drop half the account. Ids are namespaced `<meetingKey>::<id>`
 * before the merge, and the namespaced id is what the ranking comes back keyed on.
 *
 * WHAT THIS DOES NOT DO. It does not rank — `score_next_steps.py` does, on its published weight
 * table. It does not renumber, re-weight or break ties (the scorer already broke ties on id, so
 * two runs agree byte for byte). It does not invent a rank for an item the scorer left unranked;
 * an unranked item is written back with `rank` absent and `buildMeetingIntel` will then keep the
 * whole block in source order, which is the correct honest outcome.
 *
 * Usage:
 *   node scripts/score-company-next-steps.mjs --company C-2018 --as-of 2026-08-05 [--write]
 *
 * Without --write it prints the cross-meeting ranking and changes nothing (plan-by-default).
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const MEETINGS_DIR = join(REPO, "data", "meetings");
const READS_DIR = join(REPO, "MLE Internal Meetings", "archive-reads");
const SCORER = join(
  process.env.HOME,
  ".claude/skills/meeting-next-steps/scripts/score_next_steps.py",
);

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

/**
 * Every meeting of this company that has BOTH a scorer bundle and the transcript that bundle's
 * lines must be checked against. A bundle with no transcript on disk is not scored and not
 * silently skipped either — it is reported, because "we ranked the account" while a meeting sat
 * out is the same false-completeness this repo keeps killing.
 */
function discoverMeetings(companyId) {
  const found = [];
  const missing = [];
  for (const f of readdirSync(MEETINGS_DIR).sort()) {
    if (!f.endsWith(".activity.json")) continue;
    const key = f.replace(/\.activity\.json$/, "");
    const activity = JSON.parse(readFileSync(join(MEETINGS_DIR, f), "utf8")).activity;
    if (activity.orgId !== companyId) continue;
    const bundle = join(MEETINGS_DIR, `${key}.nextsteps.json`);
    const transcript = join(READS_DIR, `${key}.deepread.txt`);
    if (!existsSync(bundle)) {
      missing.push({ key, why: "no .nextsteps.json bundle — this meeting was never scored" });
      continue;
    }
    if (!existsSync(transcript)) {
      missing.push({ key, why: "no .deepread.txt — gate A cannot be checked, so it is not merged" });
      continue;
    }
    found.push({ key, activityPath: join(MEETINGS_DIR, f), bundle, transcript, activityId: activity.id });
  }
  return { found, missing };
}

function runScorer(bundlePath, transcriptPath, asOf) {
  const out = execFileSync(
    "python3",
    [SCORER, "--bundle", bundlePath, "--transcript", transcriptPath, "--as-of", asOf, "--json"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

function main() {
  const companyId = arg("company");
  const asOf = arg("as-of");
  const write = process.argv.includes("--write");
  if (!companyId || !asOf) {
    console.error("usage: --company C-#### --as-of YYYY-MM-DD [--write]");
    process.exit(2);
  }

  const { found, missing } = discoverMeetings(companyId);
  for (const m of missing) console.error(`SKIPPED ${m.key}: ${m.why}`);
  if (found.length === 0) {
    console.error(`No scoreable meeting for ${companyId}. Nothing to rank.`);
    process.exit(1);
  }

  // PASS 1 — gate A at full strength, each meeting against its own record.
  const verified = [];
  for (const m of found) {
    const r = runScorer(m.bundle, m.transcript, asOf); // throws (exit 2) if a line is not in ITS record
    const bundle = JSON.parse(readFileSync(m.bundle, "utf8"));
    verified.push({ ...m, bundle, scored: r });
    console.error(`pass 1 OK  ${m.key}: ${(bundle.items ?? []).length} items proven against its own transcript`);
  }

  if (verified.length === 1) {
    console.error(
      `${companyId} has one scoreable meeting — its own ranking IS the account ranking. No merge needed.`,
    );
  }

  // PASS 2 — merge the proven items and score the account once.
  const merged = {
    _readme: [
      `Cross-meeting bundle for ${companyId}, generated by scripts/score-company-next-steps.mjs.`,
      "Do not hand-edit: it is derived from the per-meeting bundles, which are the source of truth.",
      "Item ids are namespaced <meetingKey>::<id> because per-meeting ids collide (both Gulf Coast bundles use A1..An).",
    ],
    meeting: {
      company: verified[0].bundle.meeting?.company ?? companyId,
      company_url: verified[0].bundle.meeting?.company_url,
      date: asOf,
      type: `ACCOUNT-LEVEL ranking across ${verified.length} meeting(s): ${verified.map((v) => v.key).join(", ")}`,
      our_attendees: verified[0].bundle.meeting?.our_attendees ?? [],
      their_attendees: verified[0].bundle.meeting?.their_attendees ?? "UNRESOLVED",
      source: `derived from ${verified.map((v) => v.key + ".nextsteps.json").join(" + ")}; each item proven against its own transcript in pass 1`,
      recovered_by: "score-company-next-steps.mjs",
    },
    items: [],
    pain_points: [],
    talking_points: [],
    benefits_to_us: [],
  };

  for (const v of verified) {
    for (const it of v.bundle.items ?? []) {
      merged.items.push({ ...it, id: `${v.key}::${it.id}` });
    }
    for (const k of ["pain_points", "talking_points", "benefits_to_us"]) {
      for (const row of v.bundle[k] ?? []) merged[k].push(row);
    }
  }

  const tmp = mkdtempSync(join(tmpdir(), "company-nextsteps-"));
  const mergedBundlePath = join(tmp, `${companyId}.bundle.json`);
  const mergedRecordPath = join(tmp, `${companyId}.record.txt`);
  writeFileSync(mergedBundlePath, JSON.stringify(merged, null, 2));
  writeFileSync(
    mergedRecordPath,
    verified.map((v) => `\n===== ${v.key} =====\n` + readFileSync(v.transcript, "utf8")).join("\n"),
  );

  const account = runScorer(mergedBundlePath, mergedRecordPath, asOf);

  // The ranking, keyed by namespaced id. `ranked[]` position is the rank; constraints are never
  // ranked and are not carried into the action-items block (gate G, honoured one layer out).
  const rankById = new Map();
  (account.ranked ?? []).forEach((row, i) => rankById.set(row.id, row.rank ?? i + 1));

  console.log(`\n${companyId} — ONE ranking across ${verified.length} meeting(s), as of ${asOf}:\n`);
  for (const row of account.ranked ?? []) {
    const [meetingKey] = row.id.split("::");
    console.log(`  ${String(row.rank).padStart(2)}. ${row.title}  [${meetingKey}]`);
  }

  const outPath = join(MEETINGS_DIR, `${companyId}.company-nextsteps.json`);
  if (!write) {
    console.log(`\n(plan only — pass --write to save ${outPath} and restamp the activity rows)`);
    return;
  }

  writeFileSync(outPath, JSON.stringify(account, null, 2) + "\n");
  console.log(`\nwrote ${outPath}`);

  // Restamp each activity row's intel ranks from the ACCOUNT ranking, matched on the item's
  // source_line. Matching on text, not position: positions are what produced the merged-ranking
  // bug in the first place. An intel item the account ranking does not cover loses its stale
  // per-meeting rank rather than keeping a number from a ranking that no longer exists.
  for (const v of verified) {
    const doc = JSON.parse(readFileSync(v.activityPath, "utf8"));
    const intel = doc.activity.sourceContext?.intel ?? [];
    let stamped = 0;
    for (const item of intel) {
      if (item.kind !== "action-items") continue;
      const match = (account.ranked ?? []).find(
        (r) => r.id.startsWith(`${v.key}::`) && (r.source_line === item.excerpt || r.title === item.text),
      );
      if (match && match.rank != null) {
        item.rank = match.rank;
        stamped += 1;
      } else {
        delete item.rank;
      }
    }
    writeFileSync(v.activityPath, JSON.stringify(doc, null, 2) + "\n");
    console.log(`restamped ${v.key}: ${stamped}/${intel.filter((i) => i.kind === "action-items").length} action items`);
  }
}

main();
