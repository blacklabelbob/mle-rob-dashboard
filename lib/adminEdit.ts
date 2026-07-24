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
  relationship: "relationship",
  referredById: "referred_by_id",
  assignedRep: "assigned_rep",
  phaseOne: "phase_one",
  keyDates: "key_dates",
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

// Shape a patch row for the target table. Both tables carry every FIELD_MAP
// column; orgs additionally needs node_type narrowed, and a referred_by change
// must land in the paired person/org column on EITHER table (people also has
// referred_by_org_id post-split).
export function shapeRowForTable(
  row: Record<string, unknown>,
  target: "people" | "orgs",
  referrerIsOrg: boolean
): Record<string, unknown> {
  const out = { ...row };
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
