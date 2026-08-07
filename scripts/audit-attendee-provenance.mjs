#!/usr/bin/env node
/**
 * audit-attendee-provenance.mjs — Q85 inc.25.
 *
 * inc.24 reported 0 of 4 stored meetings attachable to a person and put the fix on a human
 * filling Notion's `Non MLE Attendees`. This asks the archive whether that is true, row by row,
 * joined on the `pageId` each stored payload already carries.
 *
 * READ-ONLY, and there is no `--apply`: it decides WHOSE gap each row is, and the writer for
 * the recoverable ones is only worth building once this run says there are any.
 *
 * TOUCHES NOTHING: no insert, no update, no delete, no Notion PATCH, no money / quoted /
 * signed / paid field, no `STORAGE_SOURCE`.
 *
 * Usage:
 *   node --import ./scripts/ts-loader.mjs scripts/audit-attendee-provenance.mjs [--json]
 */

import { readFileSync } from "node:fs";

import {
  decideAttendeeProvenance,
  summarizeProvenance,
} from "../lib/meetings/storedAttendeeProvenance.ts";

const AS_JSON = process.argv.includes("--json");

const NOTION_VERSION = "2025-09-03";
const DATA_SOURCE_ID = "600498eb-b6e0-41af-a625-e369cbe5fc6a";

function env(key) {
  if (process.env[key]) return process.env[key].trim();
  try {
    const m = readFileSync(".env.local", "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

const NOTION_KEY = env("NOTION_API_KEY");
const SUPABASE_URL = env("SUPABASE_URL");
const SUPABASE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const missing = [
  !NOTION_KEY && "NOTION_API_KEY",
  !SUPABASE_URL && "SUPABASE_URL",
  !SUPABASE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
].filter(Boolean);
if (missing.length) {
  console.error(`Cannot audit — missing ${missing.join(", ")} in env or .env.local.`);
  process.exit(2);
}

const plain = (rich) => (Array.isArray(rich) ? rich.map((r) => r.plain_text).join("") : "");
/** Notion returns dashed ids; stored payloads carry the same form. Compare undashed to be safe. */
const key = (id) => String(id || "").replace(/-/g, "").toLowerCase();

async function readStoredMeetings() {
  const url = `${SUPABASE_URL}/rest/v1/activities?select=id,org_id,person_id,source_context&type=eq.meeting&order=id`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

async function readArchive() {
  const out = new Map();
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) throw new Error(`Notion ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    for (const page of json.results) {
      const p = page.properties || {};
      out.set(key(page.id), {
        title: plain(p["Meeting Title"]?.title),
        contactName: plain(p["Contact Name"]?.rich_text),
        nonMleAttendees: plain(p["Non MLE Attendees"]?.rich_text),
        mleAttendees: (p["MLE Attendees"]?.multi_select || []).map((o) => o.name).filter(Boolean),
        salesRep: (p["Sales Rep"]?.people || []).map((o) => o.name).filter(Boolean),
      });
    }
    cursor = json.has_more ? json.next_cursor : null;
  } while (cursor);
  return out;
}

const [rows, archive] = await Promise.all([readStoredMeetings(), readArchive()]);

const decisions = rows.map((r) => {
  const ctx = r.source_context ?? {};
  const pageId = (ctx.pageId ?? "").trim();
  const archiveRow = pageId ? archive.get(key(pageId)) ?? null : null;
  return decideAttendeeProvenance(
    { activityId: r.id, context: { pageId: ctx.pageId, attendeesOther: ctx.attendeesOther } },
    archiveRow
  );
});
const summary = summarizeProvenance(decisions);

if (AS_JSON) {
  console.log(JSON.stringify({ archiveRows: archive.size, summary, decisions }, null, 2));
  process.exit(0);
}

console.log(
  `\n── ${summary.rows} stored meeting row(s) vs ${archive.size} archive row(s) · ` +
    `${summary.recoverable} recoverable by us · ${summary.needsHuman} need a human · ` +
    `${summary.unjoinable} unjoinable · read-only ──`
);
for (const d of decisions) {
  const mark = d.verdict === "payload-dropped" ? "♻️" : d.verdict === "agrees" ? "✅" : "⛔";
  console.log(`\n  ${mark} ${d.activityId}  [${d.verdict}]`);
  console.log(`     archive: ${d.archiveNames.join(", ") || "(no identifying counterparty)"}`);
  console.log(`     stored : ${d.storedNames.join(", ") || "(none)"}`);
  console.log(`     ${d.detail}`);
}
console.log(
  `\n  Nothing above has been written. A "payload-dropped" row is ours to re-publish;\n` +
    `  an "archive-thin" row is genuinely blocked on someone who was in the room.\n`
);
