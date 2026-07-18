// Task 2.0 dry-run: reports exactly what 0003_orgs_split.sql will do — no writes.
// Usage: node scripts/orgs-split-dryrun.mjs   (reads .env.local)
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=") && !l.startsWith("#")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const B = `${env.SUPABASE_URL}/rest/v1`;
const get = async (q) => (await fetch(`${B}/${q}`, { headers: H })).json();

const people = await get("people?select=id,name,entity_kind,referred_by_id");
const edges = await get("edges?select=id,from_id,to_id");
const companies = people.filter(p => p.entity_kind === "company");
const persons = people.filter(p => p.entity_kind !== "company");
const cIds = new Set(companies.map(c => c.id));
const edgesTouchingOrg = edges.filter(e => cIds.has(e.from_id) || cIds.has(e.to_id));
const referralsToOrg = people.filter(p => cIds.has(p.referred_by_id));

console.log(`people now: ${people.length} → after split: ${persons.length} people + ${companies.length} orgs (reconciliation: ${persons.length + companies.length} must equal ${people.length})`);
console.log(`edges repointed to org columns: ${edgesTouchingOrg.length} of ${edges.length}`);
console.log(`referred_by pointers moving to referred_by_org_id: ${referralsToOrg.length}`);
console.log(`\ncompanies moving to orgs:`);
companies.forEach(c => console.log(`  ${c.id}  (${c.name})`));
