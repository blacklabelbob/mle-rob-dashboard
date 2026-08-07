#!/usr/bin/env node
/**
 * calendar-spine.mjs — Q86 DoD (a): the reconciliation report, run rather than asserted.
 *
 * Every past calendar meeting in the snapshot's window, and per meeting which source holds a
 * transcript and which holds a video. Reads only; writes no record anywhere.
 *
 * Usage:
 *   npm run --silent spine:q86
 *   npm run --silent spine:q86 -- --calendar "MLE Internal Meetings/calendar-snapshot-2026-08-07.json"
 *   npm run --silent spine:q86 -- --json
 *
 * WHY THE CALENDAR ARRIVES AS A SNAPSHOT AND NOT AS A FETCH — stated here rather than hidden:
 * there is no Google OAuth client or service account in `.env.local` (Notion, Fireflies, Supabase
 * and n8n all have keys; Calendar has none). The live read happens through the Google Calendar MCP
 * in an agent session, which is not reachable from node. So this script consumes a snapshot, PRINTS
 * ITS AGE on every run, and treats a stale snapshot as a defect to be seen rather than one to be
 * guessed at. Wiring a real fetcher needs a credential Rob has to issue — that ask is in the
 * increment note, and it gates the refresh, not the report.
 *
 * The two sources it can read for itself, it reads for itself: the Fireflies archive manifest and
 * the transcript files on disk. The other five (Gemini, Fathom, Notion, Gmail, Drive) are not wired
 * yet and the report SAYS so — a source that was never asked must never read as a source that
 * answered "nothing", which is INCIDENT-LEDGER #22/#34 in one line.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import { fromCalendarEvents, SOURCES_NOT_WIRED, sourceRecordsFromAttachments } from "../lib/meetings/calendarEvents.ts";
import { reconcileCalendarSpine } from "../lib/meetings/calendarSpine.ts";
import { fromManifest, fromTranscriptFiles } from "../lib/meetings/spineSources.ts";

const AS_JSON = process.argv.includes("--json");

const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

// fileURLToPath, not `.pathname` — this repo's directory name contains a space, and `.pathname`
// hands back `MLE%20ROB%20Dashboard`, which no fs call can open.
const REPO = fileURLToPath(new URL("..", import.meta.url));
const CALENDAR =
  argOf("--calendar") ?? join(REPO, "MLE Internal Meetings", "calendar-snapshot-2026-08-07.json");
const MANIFEST = join(REPO, "MLE Internal Meetings", "manifest.json");
const TRANSCRIPTS = join(homedir(), "Projects", "MyLocalEverything", "transcripts");

/**
 * ISO instant → local day in the snapshot's timezone.
 *
 * The zone is read off the snapshot, never assumed: an 8pm ET meeting is already tomorrow in UTC,
 * and getting that wrong silently un-links a meeting from every source record that agrees with it.
 */
const localDayIn = (timeZone) => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : fmt.format(new Date(iso)));
};

function die(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

if (!existsSync(CALENDAR)) die(`no calendar snapshot at ${CALENDAR}`);
const snapshot = JSON.parse(readFileSync(CALENDAR, "utf8"));
const timeZone = snapshot.timeZone ?? "America/New_York";
const toLocalDay = localDayIn(timeZone);

const { meetings, skipped } = fromCalendarEvents(snapshot.events ?? [], { toLocalDay });

// ── the two sources this repo can actually read ────────────────────────────────────────────────
const manifestRows = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : [];
const rows = Array.isArray(manifestRows) ? manifestRows : (manifestRows.meetings ?? []);
const fireflies = fromManifest(rows, { source: "fireflies", toLocalDay });

const files = existsSync(TRANSCRIPTS)
  ? readdirSync(TRANSCRIPTS)
      .filter((f) => f.endsWith(".txt"))
      .map((f) => {
        const path = join(TRANSCRIPTS, f);
        return { path, title: basename(f, ".txt"), bytes: statSync(path).size };
      })
  : [];
const harvest = fromTranscriptFiles(files, { source: "local-repo" });

// ── the source the calendar was already holding (inc.4) ────────────────────────────────────────
// Not a fetch and not a credential: `Notes by Gemini` docs are attached to the event itself, so
// reading them off the spine costs nothing. They are LOCATED, never READ — see the refusal in
// `sourceRecordsFromAttachments`. Every one of these carries `hasTranscript: false`, so no row's
// coverage status can move because of this list; what moves is that the human sent to look now
// has the URL.
const attached = sourceRecordsFromAttachments(snapshot.events ?? [], { toLocalDay });

const report = reconcileCalendarSpine(meetings, [...fireflies, ...harvest.records, ...attached]);

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        snapshot: { path: CALENDAR, fetchedAt: snapshot.fetchedAt, window: snapshot.window, timeZone },
        sourcesRead: ["fireflies", "local-repo", "calendar-attachments"],
        attached,
        sourcesNotWired: SOURCES_NOT_WIRED,
        skipped,
        stubs: harvest.stubs,
        ...report,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// The window's own bounds as LOCAL DAYS, so an unclaimed record's day can be compared against
// them with the same zone rule the meetings were placed with. Undefined if the snapshot declares
// no window — in which case nothing below claims to know whether a record is inside it.
const windowStartDay = snapshot.window?.start ? toLocalDay(snapshot.window.start) : null;
const windowEndDay = snapshot.window?.end ? toLocalDay(snapshot.window.end) : null;

const c = report.counts;
console.log(`\n📅 CALENDAR SPINE — ${snapshot.window?.start ?? "?"} → ${snapshot.window?.end ?? "?"} (${timeZone})`);
console.log(`   snapshot taken ${snapshot.fetchedAt ?? "(undated — treat as unknown age)"} · ${CALENDAR}`);
console.log(
  `   sources READ: fireflies (${fireflies.length} records), local-repo (${harvest.records.length} files), calendar attachments (${attached.length} located, 0 read)`,
);
console.log(
  `   sources NOT WIRED, so silent and NOT a finding: ${SOURCES_NOT_WIRED.join(", ")} — a source nobody asked has answered nothing.\n`,
);

for (const row of report.rows) {
  const icon =
    row.status === "transcript-and-video" || row.status === "transcript-only"
      ? "✅"
      : row.status === "in-person-no-recorder-possible"
        ? "🚪"
        : "❓";
  console.log(`${icon} ${row.day}  ${row.title}`);
  console.log(`     status: ${row.status}`);
  if (row.links.length) {
    for (const l of row.links) {
      console.log(`     ← ${l.source}:${l.id} (${l.basis}${l.hasTranscript ? ", transcript" : ""}${l.hasVideo ? ", video" : ""})`);
    }
  }
  for (const u of row.uncertain) console.log(`     ⚠ uncertain: ${u.source}:${u.id} — ${u.why}`);
  if (row.reason) console.log(`     ${row.reason}`);
}

if (skipped.length) {
  console.log(`\n— NOT COUNTED AS MEETINGS (${skipped.length}), listed so the denominator stays honest —`);
  for (const s of skipped) console.log(`   · ${s.title} — ${s.why}`);
}

if (harvest.stubs.length) {
  console.log(`\n— STUB FILES (${harvest.stubs.length}), present but NOT coverage —`);
  for (const s of harvest.stubs) console.log(`   · ${s.title} (${s.bytes} B) — ${s.why}`);
}

if (report.unclaimed.length) {
  // inc.5: this used to read "the window above is two weeks" — a sentence that was true when it
  // was written and silently false the moment anyone widened the snapshot. The excuse is now
  // ARITHMETIC against the snapshot's own declared window, and it is stated per record, because
  // "outside the window" and "inside the window and matched nothing" are opposite findings: the
  // first is an artefact to be fixed by a wider read, the second is a real record the spine could
  // not place and a human has to look at. A record with no day at all is neither — it is counted
  // separately rather than folded into whichever number reads better.
  const inWindow = (day) =>
    day && windowStartDay && windowEndDay ? day >= windowStartDay && day < windowEndDay : null;
  const verdictOf = (u) => {
    const v = inWindow(u.day);
    if (v === true) return "IN WINDOW — unmatched, a human has to place this";
    if (v === false) return "outside the window — artefact of the read, widen it before counting it";
    return "no date on the record — cannot be judged against the window";
  };
  const tally = { inside: 0, outside: 0, undated: 0 };
  for (const u of report.unclaimed) {
    const v = inWindow(u.day);
    tally[v === true ? "inside" : v === false ? "outside" : "undated"] += 1;
  }

  console.log(`\n— SOURCE RECORDS NO CALENDAR EVENT IN THIS WINDOW CLAIMS (${report.unclaimed.length}) —`);
  for (const u of report.unclaimed.slice(0, 15)) {
    console.log(`   · ${u.source}:${u.title}${u.day ? ` (${u.day})` : ""} — ${verdictOf(u)}`);
  }
  if (report.unclaimed.length > 15) console.log(`   … ${report.unclaimed.length - 15} more (use --json)`);
  console.log(
    `   ${tally.inside} inside the window (real, unplaced) · ${tally.outside} outside it (widen the snapshot) · ` +
      `${tally.undated} undated. Only the first number is a finding.`,
  );
}

console.log(
  `\n📊 ${c.meetings} meetings · ${c.withTranscript} with a transcript · ${c.withVideo} with video · ` +
    `${c.inPerson} closed by the calendar itself · ${c.owedAHuman} OWED A HUMAN · ${c.withUncertain} carrying an unruled near-match\n`,
);
