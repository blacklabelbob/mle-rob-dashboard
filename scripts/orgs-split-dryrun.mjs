// Task 2.0 dry-run: reports exactly what 0003_orgs_split.sql will do — no writes.
// Usage: node scripts/orgs-split-dryrun.mjs   (reads .env.local)
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=") && !l.startsWith("#")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const B = `${env.SUPABASE_URL}/rest/v1`;
const get = async (q) => (await fetch(`${B}/${q}`, { headers: H })).json();

const people = await get("people?select=*");
const edges = await get("edges?select=id,from_id,to_id");
const companies = people.filter(p => p.entity_kind === "company");
const persons = people.filter(p => p.entity_kind !== "company");
const cIds = new Set(companies.map(c => c.id));
const edgesTouchingOrg = edges.filter(e => cIds.has(e.from_id) || cIds.has(e.to_id));
const referralsToOrg = people.filter(p => cIds.has(p.referred_by_id));
const orgReferredByOrg = companies.filter(c => cIds.has(c.referred_by_id));

console.log(`people now: ${people.length} → after split: ${persons.length} people + ${companies.length} orgs (reconciliation: ${persons.length + companies.length} must equal ${people.length})`);
console.log(`edges repointed to org columns: ${edgesTouchingOrg.length} of ${edges.length}`);
console.log(`people referred_by pointers moving to referred_by_org_id: ${referralsToOrg.length}`);
console.log(`org rows referred BY an org (step 1b repoint): ${orgReferredByOrg.length}`);

// Field-preservation gate (2026-07-21 amendment): every people column except
// entity_kind must survive the copy into orgs. Reports non-null counts per
// carried column so the post-apply query can be diffed 1:1 against this.
const CARRIED = ["name","business","role","vertical_id","phone","email","website","node_type","status","referred_by_id","relationship","quoted_amount","signed","meeting_video_url","transcript_url","key_dates","phase_one","est_time_to_payment_days","description","estimate","notes","assigned_rep"];
console.log(`\nfield preservation (non-null/non-default counts across ${companies.length} company rows — must match orgs post-apply):`);
for (const col of CARRIED) {
  const n = companies.filter(c => c[col] !== null && c[col] !== undefined).length;
  if (n > 0) console.log(`  ${col}: ${n}`);
}
const unknownCols = Object.keys(companies[0] ?? {}).filter(k => !CARRIED.includes(k) && !["id","entity_kind","created_at","updated_at","org_id","referred_by_org_id"].includes(k));
if (unknownCols.length) console.log(`  ⚠️ people columns NOT in the carry list (would be DROPPED): ${unknownCols.join(", ")}`);

console.log(`\ncompanies moving to orgs:`);
companies.forEach(c => console.log(`  ${c.id}  (${c.name})`));
