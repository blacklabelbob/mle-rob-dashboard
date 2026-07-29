#!/usr/bin/env node
// Synthetic seed generator for data/network.json (Q71 Phase 2).
//
// WHY THIS EXISTS: the committed data/network.json is the scaffolding a fresh
// clone boots from, and today it carries 26 real phone numbers and 22 real
// email addresses. Git never forgets, so the fix is not "scrub it" — it is
// "the committed file is generated, and the generator cannot emit a real
// person". Every address here is RFC 2606 @example.com and every number sits
// in the reserved 555-01XX block behind the non-assignable 555 area code, by
// construction rather than by review.
//
// PURE + DETERMINISTIC (CR-3): no Date.now(), no network, no filesystem reads.
// buildNetwork() is a function of its seed alone, so two runs are byte-identical
// and the drift guard can regenerate in-memory and diff against the committed
// file. Dates come from BASE_DATE, not the clock.
//
// CLI (writes the file; the only impure part of this module):
//     node scripts/seed-synthetic.mjs [outPath]
// Default outPath is data/network.json.

import { writeFileSync } from "node:fs";

/** Every generated record traces back to this string. Change it and the whole
 *  committed file changes — which is the point: the seed IS the provenance. */
export const SEED = "mle-rob-dashboard/synthetic/v1";

/** Anchor for every derived date. A clock here would break byte-identity. */
export const BASE_DATE = "2026-07-01";

/** RFC 2606 reserved — can never resolve to a real mailbox. */
export const EMAIL_DOMAIN = "example.com";

/**
 * Reserved fictional numbers. `555` is a non-assignable area code AND `555-01XX`
 * is the reserved line range, so this format satisfies both conventions at once.
 * The six pre-existing `demo-` rows used `+1 (555) 010-XXXX` — area-code-safe but
 * outside the reserved line range; the generator tightens rather than copies, and
 * Phase 3's Tier A accepts both so those rows keep passing.
 */
export function syntheticPhone(index) {
  const line = 100 + (index % 100); // 555-0100 .. 555-0199
  return `+1 (555) 555-0${line}`;
}

// ── Seeded PRNG ─────────────────────────────────────────────────────────────
// mulberry32 over an FNV-1a string hash. Deliberately hand-rolled: a faker-style
// dependency would add a package whose output still has to be forced into the
// reserved domain/number blocks above, and whose determinism across versions is
// a promise rather than a property.

function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = hashSeed(String(seed));
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];
const intBetween = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/** Deterministic ISO date, `days` after BASE_DATE. No clock, no timezone drift. */
export function dateOffset(days) {
  const base = Date.UTC(2026, 6, 1); // BASE_DATE, pinned by test
  return new Date(base + days * 86400000).toISOString().slice(0, 10);
}

export const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// ── Invented name pools ─────────────────────────────────────────────────────
// Chosen to read as plausible without matching anyone in the real ledger; a
// test asserts zero overlap with the currently committed file, and Phase 3's
// hashed Tier B denylist is the durable version of that check.

const FIRST_NAMES = [
  "Avery", "Bennett", "Cora", "Dashiell", "Elena", "Ford", "Greta", "Hollis",
  "Imani", "Jonas", "Keira", "Lorenzo", "Mira", "Nils", "Odette", "Porter",
  "Quinn", "Rosalind", "Soren", "Thea", "Ulric", "Vesper", "Wendell", "Xiomara",
];

const LAST_NAMES = [
  "Ashgrove", "Blackwood", "Castellan", "Dunmore", "Ellery", "Fairbank",
  "Gilliard", "Harrowgate", "Ingleby", "Jarvis", "Kettleman", "Lindqvist",
  "Marchetti", "Norwood", "Oakhurst", "Pemberton", "Quillon", "Rothwell",
  "Stanhope", "Thackeray", "Underhill", "Vandermeer", "Whitlock", "Yarborough",
];

const COMPANY_HEADS = [
  "Ironvale", "Northgate", "Copperline", "Silverbrook", "Redhawk", "Blue Harbor",
  "Stonefield", "Kingsway", "Amberton", "Westmark", "Foxglove", "Granite Bay",
  "Larkspur", "Highmoor", "Cedarcrest", "Thornbury", "Wexford", "Ravensmoor",
  "Marlowe", "Bellhaven",
];

const COMPANY_TAILS = {
  roofing: ["Roofing", "Exteriors", "Roofing & Siding"],
  title: ["Title Group", "Title & Escrow", "Realty Partners"],
  "home-services": ["Plumbing & Drain", "HVAC", "Home Services"],
  medical: ["Medical Group", "Family Dental", "Clinic"],
  payments: ["Payment Systems", "Merchant Services"],
  food: ["Kitchen Co.", "Brewing Co.", "Provisions"],
  webdev: ["Web Studio", "Digital", "Interactive"],
  core: ["Holdings", "Group"],
};

// ── Fixed reference data ────────────────────────────────────────────────────
// Verticals are taxonomy, not PII: the ids are load-bearing (routes, colors,
// filters key off them), so they are carried verbatim from the real file.

export const VERTICALS = [
  { id: "core", name: "Core Team", color: "#f8fafc" },
  { id: "food", name: "Food & Beverage", color: "#a3e635" },
  { id: "home-services", name: "Home Services", color: "#34d399" },
  { id: "medical", name: "Medical", color: "#34d399" },
  { id: "payments", name: "Payment Processing", color: "#c084fc" },
  { id: "roofing", name: "Roofing", color: "#f59e0b" },
  { id: "title", name: "Title / Real Estate", color: "#60a5fa" },
  { id: "webdev", name: "Web Developers", color: "#f472b6" },
];

const BUSINESS_VERTICALS = VERTICALS.filter((v) => v.id !== "core").map((v) => v.id);

const PERSON_ROLES = ["Owner", "Managing Partner", "Operations Lead", "Sales Director", "Founder"];
const NODE_TYPES = ["connector", "client", "lead", "partner", "rep-candidate", "vertical-anchor"];
const STATUSES = ["lit", "warm", "unlit"];
const PHASE_ONE = ["not-started", "in-progress", "complete"];

// Cardinality mirrors the real ledger (22 people / 19 orgs / 47 edges / 12
// projects) so the demo dashboard exercises the same layouts and empty-state
// thresholds the real one does.
const PERSON_COUNT = 22;
const ORG_COUNT = 19;
const EDGE_COUNT = 47;
const PROJECT_COUNT = 12;

// ── Generators ──────────────────────────────────────────────────────────────

/** Person and org ids mirror the Q70 record-number convention on prod
 *  (`P-1001…` / `C-2001…`), with the name-derived slug kept as `legacySlug`
 *  exactly as the real records carry it, so slug URLs resolve in demo mode too. */
export function buildPeople(rng) {
  const rows = [];

  for (let i = 0; i < PERSON_COUNT; i++) {
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length]}`;
    const verticalId = i < 3 ? "core" : BUSINESS_VERTICALS[i % BUSINESS_VERTICALS.length];
    const status = STATUSES[i % STATUSES.length];
    const signed = status === "lit" && i % 4 === 0;
    const quoted = status === "unlit" ? undefined : intBetween(rng, 3, 24) * 1000;

    rows.push({
      id: `P-${1001 + i}`,
      legacySlug: slugify(name),
      name,
      role: `${pick(rng, PERSON_ROLES)}`,
      nodeType: verticalId === "core" ? "mle-admin" : NODE_TYPES[i % NODE_TYPES.length],
      entityKind: "person",
      verticalId,
      phone: syntheticPhone(i),
      email: `${slugify(name)}@${EMAIL_DOMAIN}`,
      status,
      quotedAmount: quoted,
      signed,
      keyDates: {
        met: dateOffset(-120 + i * 3),
        ...(quoted ? { quoted: dateOffset(-60 + i * 2) } : {}),
        ...(signed ? { signed: dateOffset(-30 + i) } : {}),
      },
      phaseOne: signed ? PHASE_ONE[i % PHASE_ONE.length] : "not-started",
      description: "SYNTHETIC RECORD — generated by scripts/seed-synthetic.mjs. Not a real person.",
      notes: "Demo scaffolding. Replaced by live rows when STORAGE_SOURCE=supabase.",
    });
  }

  for (let j = 0; j < ORG_COUNT; j++) {
    const verticalId = BUSINESS_VERTICALS[j % BUSINESS_VERTICALS.length];
    const head = COMPANY_HEADS[j % COMPANY_HEADS.length];
    const tails = COMPANY_TAILS[verticalId] ?? COMPANY_TAILS.core;
    const name = `${head} ${tails[j % tails.length]}`;
    const status = STATUSES[(j + 1) % STATUSES.length];

    rows.push({
      id: `C-${2001 + j}`,
      legacySlug: slugify(name),
      name,
      nodeType: "client",
      entityKind: "company",
      verticalId,
      phone: syntheticPhone(j + PERSON_COUNT),
      email: `contact@${slugify(head)}.${EMAIL_DOMAIN}`,
      website: `https://${slugify(name)}.${EMAIL_DOMAIN}`,
      status,
      signed: status === "lit" && j % 5 === 0,
      keyDates: { met: dateOffset(-150 + j * 4) },
      phaseOne: "not-started",
      description: "SYNTHETIC RECORD — generated by scripts/seed-synthetic.mjs. Not a real business.",
      notes: "Demo scaffolding. Replaced by live rows when STORAGE_SOURCE=supabase.",
    });
  }

  return rows;
}

/**
 * Referral edges. Every edge points at ids that exist — a dangling edge would
 * render as a broken node in the graph, which is exactly the class of defect a
 * generated seed is supposed to make impossible.
 */
export function buildEdges(rng, people) {
  const persons = people.filter((p) => p.entityKind === "person");
  const orgs = people.filter((p) => p.entityKind === "company");
  const edges = [];
  const seen = new Set();

  for (let i = 0; edges.length < EDGE_COUNT && i < EDGE_COUNT * 4; i++) {
    const from = persons[i % persons.length];
    const to = i % 2 === 0 ? orgs[(i * 3) % orgs.length] : persons[(i * 5 + 1) % persons.length];
    if (!to || from.id === to.id) continue;
    const id = `ref-${from.id}-${to.id}`.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({
      id,
      fromId: from.id,
      toId: to.id,
      relationship: pick(rng, ["Introduced by", "Referral partner", "Former colleague", "Client referral"]),
    });
  }

  return edges;
}

export function buildProjects(rng) {
  const categories = ["revenue-system", "product-build", "internal"];
  const themes = ["sign-the-agreement", "get-paid-fast", "reduce-all-friction"];
  const owners = ["Rob", "Will", "Max"];

  return Array.from({ length: PROJECT_COUNT }, (_, i) => {
    const name = `${COMPANY_HEADS[(i * 3) % COMPANY_HEADS.length]} Initiative`;
    return {
      id: slugify(name),
      name,
      category: categories[i % categories.length],
      theme: themes[i % themes.length],
      completion: intBetween(rng, 0, 100),
      owner: owners[i % owners.length],
      summary: "SYNTHETIC PROJECT — demo scaffolding, not a real initiative.",
      updatedAt: dateOffset(-i * 5),
    };
  });
}

/**
 * The whole file. `__synthetic` is the flag the demo banner reads and the flag
 * Phase 3's Tier A requires: a data file without it is either real data that
 * must never be committed, or a generator that forgot to say what it is.
 */
export function buildNetwork(seed = SEED) {
  const rng = makeRng(seed);
  const people = buildPeople(rng);
  return {
    __synthetic: true,
    people,
    edges: buildEdges(rng, people),
    verticals: VERTICALS,
    projects: buildProjects(rng),
  };
}

/** Stable serialization — the drift guard diffs bytes, so formatting is contract. */
export function serializeNetwork(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("seed-synthetic.mjs");
if (invokedDirectly) {
  const outPath = process.argv[2] ?? "data/network.json";
  const data = buildNetwork();
  writeFileSync(outPath, serializeNetwork(data), "utf8");
  console.log(
    `wrote ${outPath} — ${data.people.length} people, ${data.edges.length} edges, ` +
      `${data.verticals.length} verticals, ${data.projects.length} projects (seed "${SEED}")`,
  );
}
