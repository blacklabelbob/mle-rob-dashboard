// Q4 tail: person→org backfill (people.org_id + org_memberships).
// Every link below carries the evidence that justifies it — sourced from the
// 2026-07-17/18 enrichment passes already in people.notes/role, or a Rob
// confirmation in dev_chat. People with no matching org row are listed in
// SKIPPED and left null (no guessing, per scoring-pattern rule 5).
// Idempotent: org_id only set when currently null; memberships upserted on
// the (person_id, org_id) unique key. Run: node scripts/backfill-org-links.mjs
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// [personId, orgId, isPrimary, roleAtOrg, evidence]
const LINKS = [
  ['caleb-green', 'cg-roofing-group', true, 'President / registered agent', 'FL DBPR RC29027554 d/b/a CG Roofing Group LLC + Sunbiz L17000012511 registered agent'],
  ['gary-waskivich', 'dececco-pasta', true, 'Regional Sales Manager (FL)', 'linkedin.com/in/gary-waskovich-390490294 — RSM De Cecco USA'],
  ['gary-waskivich', 'miga-food-manufacturing', false, 'Co-owner', 'Rob confirmed 2026-07-17 (co-owner w/ Daniella); Sunbiz P21000103391'],
  ['giovanni-spazioso', 'dececco-pasta', true, 'National Account Sales Manager – East', 'linkedin.com/in/giovannispazioso'],
  ['jonathan-polk', 'proplogic', true, 'Regional Manager, SW & Miami FL', 'linkedin.com/in/jonathan-polk-56a95469 + proplogix.com/team/jonathan-polk'],
  ['alex-greenwood', 'golf-coast-real-estate-group', true, 'Team Leader', 'gulfcoastregroup.com/agents/327940-Alex-Greenwood (FL lic SL3227669)'],
  ['chris-acheson', 'golf-coast-real-estate-group', true, 'Realtor', 'FL lic SL3400734, team roster since 2017'],
  ['daniella-roach', 'miga-food-manufacturing', true, 'Co-owner, officer + registered agent', 'Sunbiz P21000103391; Rob confirmed co-ownership 2026-07-17'],
  ['daniella-roach', 'martin-fierro-restaurant', false, 'Co-owner', 'facebook.com/shopthesecretingredient "Meet Daniella" (owner Oasis, Martin Fierro, MIGA)'],
  ['daniella-roach', 'oasis-kitchen-lounge', false, 'Owner', 'same FB feature; Jaenvega Holdings Sunbiz L23000029882'],
  ['michael-jaenvega', 'martin-fierro-restaurant', true, 'President, MFS Naples Inc', 'Sunbiz P17000087470 (ACTIVE operating co of Martin Fierro)'],
  ['michael-jaenvega', 'oasis-kitchen-lounge', false, 'Co-owner (JV w/ Phong Ho)', 'avemaria.com Oasis opening announcement; Sunbiz L23000083341'],
  ['joe-fleming', 'vive-health', true, 'Co-founder / owner', 'Vive Health LLC manager + registered agent (record role field)'],
  ['jonathan-burns', 'vive-health', true, 'Director of B2B Marketing', 'theorg.com/org/vive-health/org-chart/john-burns'],
  ['dix-thedevdix', 'dix-healthcare-ai', true, 'Founder', 'his own venture (7 healthcare-AI models) — 7/8 Dix call notes'],
  // Added 2026-07-25: `the-title-base` org row was created 7/23 with the $2,000 PAID
  // Phase 1 deal, which retired this person's SKIPPED reason ("no org row yet") without
  // anyone re-running the backfill — so /companies/the-title-base rendered "Nobody is
  // linked to this company yet" (flag #47). Ownership is Rob's own words, not inference.
  ['trent-brands', 'the-title-base', true, 'Owner', 'Rob dev-chat #44 2026-07-23 verbatim: "Trent brands wo is the owner of the company \\"The Title Base\\" aka thetitlebase.com"'],
];

const SKIPPED = [
  ['david-cates', 'The Cates Processing Group has no org row yet'],
  ['george-eu', 'Guest Genie has no org row yet'],
  ['rob-acheson', 'MLE / AI VoiceTech has no org row (internal)'],
  ['will', 'MLE has no org row (internal)'],
];

async function req(method, path, body) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method, headers: { ...H, Prefer: method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
}

const people = await (await fetch(`${URL}/rest/v1/people?select=id,org_id`, { headers: H })).json();
const orgs = new Set((await (await fetch(`${URL}/rest/v1/orgs?select=id`, { headers: H })).json()).map((o) => o.id));
const byId = new Map(people.map((p) => [p.id, p]));

let orgIdSet = 0, memberships = 0;
for (const [personId, orgId, isPrimary, roleAtOrg, evidence] of LINKS) {
  const p = byId.get(personId);
  if (!p) throw new Error(`person ${personId} not found`);
  if (!orgs.has(orgId)) throw new Error(`org ${orgId} not found`);
  if (isPrimary && p.org_id == null) {
    await req('PATCH', `people?id=eq.${personId}&org_id=is.null`, { org_id: orgId });
    orgIdSet++;
    console.log(`org_id  ${personId} → ${orgId}  [${evidence}]`);
  } else if (isPrimary) {
    console.log(`org_id  ${personId} already ${p.org_id} — untouched`);
  }
  await req('POST', 'org_memberships?on_conflict=person_id,org_id', {
    person_id: personId, org_id: orgId, is_primary: isPrimary, role_at_org: roleAtOrg,
  });
  memberships++;
}

for (const [id, why] of SKIPPED) console.log(`skip    ${id} — ${why}`);

const after = await (await fetch(`${URL}/rest/v1/people?select=id,org_id`, { headers: H })).json();
const linked = after.filter((p) => p.org_id != null).length;
// Expected count is derived, not a magic number: every primary link in LINKS must
// end up carrying an org_id. It was a hard-coded 11 until trent-brands landed.
const EXPECTED = new Set(LINKS.filter(([, , isPrimary]) => isPrimary).map(([personId]) => personId)).size;
console.log(`\nGATE: org_id set this run=${orgIdSet}, memberships upserted=${memberships}, people linked=${linked}/${after.length} (expected ${EXPECTED}), skipped=${SKIPPED.length}`);
if (linked !== EXPECTED) { console.error(`GATE FAIL: linked count != ${EXPECTED}`); process.exit(1); }
console.log('GATE PASS');
