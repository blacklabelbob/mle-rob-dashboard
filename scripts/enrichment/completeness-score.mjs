#!/usr/bin/env node
// Q7b enrichment completeness scorer — the DoD's "honestly computed" average lives
// HERE, in code (CR-3 / scoring-pattern rule), not in prose. Rubric is the exact
// one from docs/research/ENRICHMENT-GAP-AUDIT-2026-07-17.md (0–6, one point each):
//   Phone / Email / Website / Role / Description>100 chars / Social.
// Social = a real social-platform URL or @handle in notes+description; a link
// already credited to `website` is never double-counted, and a bare platform
// mention with no link ("no Facebook found") scores nothing.
// Post-split (0003) records span BOTH `people` and `orgs` — this reads both.
// Usage: node scripts/enrichment/completeness-score.mjs   (reads .env.local)

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SOCIAL_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/(?:in|company)\/[\w%-]+|facebook\.com\/[\w.-]+|instagram\.com\/[\w.-]+|twitter\.com\/[\w-]+|x\.com\/[\w-]+|tiktok\.com\/@[\w.-]+|youtube\.com\/(?:@|channel\/|c\/)[\w-]+)/i;
const HANDLE_RE = /(?:^|[\s(])@[A-Za-z0-9_.]{3,}\b/;

const has = (v) => typeof v === "string" && v.trim().length > 0;

// Pure per-record scorer. Accepts a raw Supabase row from people OR orgs.
export function scoreRecord(r) {
  const notesBlob = [r.notes, r.description].filter(Boolean).join("\n");
  // Never double-count the website link as a social point.
  const socialBlob = has(r.website) ? notesBlob.split(r.website.trim()).join(" ") : notesBlob;
  const parts = {
    phone: has(r.phone),
    email: has(r.email),
    website: has(r.website) && !SOCIAL_URL_RE.test(r.website), // LinkedIn parked in `website` is social, not a website
    role: has(r.role),
    description: has(r.description) && r.description.trim().length > 100,
    social:
      SOCIAL_URL_RE.test(socialBlob) ||
      HANDLE_RE.test(socialBlob) ||
      (has(r.website) && SOCIAL_URL_RE.test(r.website)),
  };
  const score = Object.values(parts).filter(Boolean).length;
  return { score, parts };
}

export function computeAverage(rows) {
  const scored = rows.map((r) => ({ ...r, ...scoreRecord(r) }));
  const avg = scored.length
    ? scored.reduce((s, r) => s + r.score, 0) / scored.length
    : 0;
  return { scored, avg };
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const envPath = new URL("../../.env.local", import.meta.url);
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
      }
    }
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or put them in .env.local).");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const cols = "id,name,phone,email,website,role,description,notes,node_type";
  const [people, orgs] = await Promise.all([
    db.from("people").select(cols).order("id"),
    db.from("orgs").select(cols).order("id"),
  ]);
  for (const res of [people, orgs]) {
    if (res.error) {
      console.error("Supabase read failed:", res.error.message);
      process.exit(1);
    }
  }
  const rows = [
    ...people.data.map((r) => ({ ...r, table: "people" })),
    ...orgs.data.map((r) => ({ ...r, table: "orgs" })),
  ].filter((r) => !/^demo-/.test(r.id) && r.node_type !== "demo");

  const { scored, avg } = computeAverage(rows);
  scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  const mark = (b) => (b ? "✅" : "—");
  console.log("| Record | Table | P | E | W | R | D | S | Score |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const r of scored) {
    const p = r.parts;
    console.log(
      `| ${r.name} | ${r.table} | ${mark(p.phone)} | ${mark(p.email)} | ${mark(p.website)} | ${mark(p.role)} | ${mark(p.description)} | ${mark(p.social)} | ${r.score} |`
    );
  }
  console.log(`\nRecords scored (non-DEMO): ${scored.length}`);
  console.log(`Average completeness: ${avg.toFixed(2)} / 6  (Q7b DoD target: ≥3.5)`);
  console.log(`Records below 3: ${scored.filter((r) => r.score < 3).length}`);
}

// pathToFileURL, not string concat — the repo path contains spaces.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
