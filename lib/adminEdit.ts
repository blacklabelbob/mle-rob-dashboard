// Pure helpers for the admin inline-edit route (app/api/admin/people/route.ts).
// Post-0003 split the 16 business rows live in `orgs`, so the route has to pick
// the target table per id and shape the row for it — kept pure here so vitest
// covers the mapping without mocking Next/Supabase (Q14).

// camelCase field → snake_case column, whitelist only
export const FIELD_MAP: Record<string, string> = {
  name: "name",
  business: "business",
  role: "role",
  status: "status",
  verticalId: "vertical_id",
  nodeType: "node_type",
  quotedAmount: "quoted_amount",
  signed: "signed",
  phone: "phone",
  email: "email",
  website: "website",
  // Q84 inc.21 — ORGS ONLY (see ORG_ONLY_COLUMNS below). Flag #137 asks Rob to
  // "add cgroofing.net / gulfregroup.com to that org's Domain field" so three
  // orphaned meetings attach themselves. Read off prod before writing this:
  // `orgs.domain` is NULL on BOTH C-2017 and C-2018 — the hosts that flag prints
  // as "what the CRM holds today" come from `website`, not `domain` — and until
  // now `domain` was in no allowlist and on no page, so the one-field fix the
  // ledger asked for could not be made anywhere Rob can reach. `activityPlan`'s
  // matcher already indexes BOTH columns, so filling the empty one is exactly
  // the "same company on a second domain" answer without touching `website`.
  domain: "domain",
  relationship: "relationship",
  referredById: "referred_by_id",
  assignedRep: "assigned_rep",
  phaseOne: "phase_one",
  keyDates: "key_dates",
  // Q63 — the Phase 2 ROI estimator autosaves its whole input object through the
  // same PATCH door every inline field uses. Whole-object replace is correct here
  // (unlike `notes`, which is excluded above): the estimator owns every key in
  // this column and always sends complete state, so there is no second writer
  // whose data a replace could drop.
  phase2Estimate: "phase2_estimate",
  // `notes` is deliberately NOT here (Q43 punch #1 of the re-score). Notes are
  // written only via the virtual `notesHuman` field, which the PATCH route
  // recomposes against the STORED row so enrichment blocks survive. A raw
  // `notes` mapping would be a second door straight past that guarantee — a
  // whole-column overwrite that silently drops provenance. Pinned by a test.
  description: "description",
  meetingVideoUrl: "meeting_video_url",
  transcriptUrl: "transcript_url",
};

// orgs.node_type check constraint is narrower than people's (no mle-admin /
// rep-candidate) — mirrors ORG_NODE_TYPES in lib/storage/supabaseStore.ts.
const ORG_NODE_TYPES = new Set(["partner", "lead", "client", "connector", "vertical-anchor"]);

export function buildPatchRow(changes: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(changes)) {
    const col = FIELD_MAP[k];
    if (col) row[col] = v === "" ? null : v;
  }
  // Rob's ruling 2026-07-17: paid is the apex — setting a paid date auto-upgrades to Client.
  const kd = changes.keyDates as Record<string, string> | undefined;
  if (kd?.paid) row.node_type = "client";
  return row;
}

// Columns that exist on `orgs` and NOT on `people`. Verified against prod, not
// assumed: the live `people` row carries no `domain` column at all, so letting a
// person PATCH through with one would make Postgres reject the whole update —
// turning an unrelated field edit into a failed save. Dropped rather than
// rejected because the caller is a shared inline editor: a person page that
// never renders a Domain box cannot send one, and if a future one does, losing
// a column that does not exist is the harmless outcome.
const ORG_ONLY_COLUMNS = new Set(["domain"]);

// Shape a patch row for the target table. Both tables carry every FIELD_MAP
// column EXCEPT ORG_ONLY_COLUMNS; orgs additionally needs node_type narrowed,
// and a referred_by change must land in the paired person/org column on EITHER
// table (people also has referred_by_org_id post-split).
export function shapeRowForTable(
  row: Record<string, unknown>,
  target: "people" | "orgs",
  referrerIsOrg: boolean
): Record<string, unknown> {
  const out = { ...row };
  if (target === "people") {
    for (const col of ORG_ONLY_COLUMNS) delete out[col];
  }
  if (target === "orgs" && out.node_type != null && !ORG_NODE_TYPES.has(String(out.node_type))) {
    out.node_type = null;
  }
  if ("referred_by_id" in out) {
    const ref = out.referred_by_id;
    out.referred_by_id = referrerIsOrg ? null : ref;
    out.referred_by_org_id = referrerIsOrg ? ref : null;
  }
  return out;
}
