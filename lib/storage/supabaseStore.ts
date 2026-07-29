import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  Activity,
  Deal,
  Edge,
  NetworkData,
  Person,
  Project,
  Task,
  Vertical,
} from "@/lib/types";
// Relative on purpose: vitest has no "@/" alias; runtime imports must resolve.
import { fromActivity, fromDeal, fromTask, toActivity, toDeal, toTask } from "../crm";
import type { ActivityFilter, StorageAdapter, TaskFilter } from "./adapter";

// Rob's 2026-07-04 call: "Supabase — go." Rows mirror lib/types with nested
// objects (keyDates, estimate, willItems) as JSONB — schema in
// supabase/migrations/0001_network.sql, seed via scripts/seed-supabase.mjs.
// Reads fall back to the file store automatically (lib/storage/index.ts).

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "supabase store: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see docs/plans/sources/STORAGE-DECISION.md)"
    );
  }
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// Task 2.0 dual-schema mode (post 0003_orgs_split): company rows live in
// `orgs`, edges may carry from_org_id/to_org_id, and referred_by pointers at
// org rows moved to referred_by_org_id. ORGS_SPLIT_READS=1 turns the merged
// read + write-routing on; NetworkData shape is unchanged (orgs come back as
// Person rows with entityKind "company"), so no UI code moves. The flag stays
// unset until 0003 is applied — with it off, every path below is byte-identical
// to the pre-split behavior because the org columns simply don't exist.
function orgsSplitMode(): boolean {
  return process.env.ORGS_SPLIT_READS === "1";
}

 
export function toPerson(r: any): Person {
  return {
    id: r.id,
    // Q70/0031. Paired with the conditional write in `fromPerson` (inc.8): reading it
    // back is what makes that write a no-op round-trip on an existing row instead of a
    // rewrite, so an edit anywhere on the record cannot disturb the mapping old URLs
    // resolve through.
    legacySlug: r.legacy_slug ?? undefined,
    name: r.name,
    business: r.business ?? undefined,
    role: r.role ?? undefined,
    nodeType: r.node_type ?? undefined,
    entityKind: r.entity_kind ?? undefined,
    verticalId: r.vertical_id,
    phone: r.phone ?? undefined,
    email: r.email ?? undefined,
    website: r.website ?? undefined,
    referredById: r.referred_by_id ?? r.referred_by_org_id ?? undefined,
    relationship: r.relationship ?? undefined,
    status: r.status,
    quotedAmount: r.quoted_amount ?? undefined,
    signed: r.signed,
    meetingVideoUrl: r.meeting_video_url ?? undefined,
    transcriptUrl: r.transcript_url ?? undefined,
    keyDates: r.key_dates ?? {},
    phaseOne: r.phase_one,
    description: r.description ?? undefined,
    estimate: r.estimate ?? undefined,
    // Q63. Read and write are paired below for the same reason orgId is: an
    // upsert that omits the column writes NULL, so reading it back is what stops
    // a save elsewhere on the record from wiping the rep's ROI inputs.
    phase2Estimate: r.phase2_estimate ?? undefined,
    notes: r.notes ?? undefined,
    // Q41 inc.2. Paired with the write below for the same reason orgId and
    // phase2Estimate are: an upsert that omits the column writes NULL, so
    // reading it back is what stops an unrelated save from erasing the split
    // Rob just corrected — the exact failure mode this registry exists to end.
    equity: r.equity ?? undefined,
    assignedRep: r.assigned_rep ?? undefined,
    // person→org link. Omitted here until 2026-07-25, which meant every person
    // read out of Supabase carried orgId: undefined — so the company ledger's
    // headcount and the §3.2 People-here rail were structurally always empty on
    // prod while passing every test against the fallback file (which HAS the
    // field). Read and write are paired below on purpose: an upsert that omits
    // the column writes NULL, i.e. reading it back is what stops a save from
    // silently unlinking a person from their company.
    orgId: r.org_id ?? undefined,
  };
}

export function fromPerson(p: Person) {
  return {
    id: p.id,
    // Q70 inc.8. `legacy_slug` is the ONLY column here written conditionally, and the
    // asymmetry is the point. Every other field is `x ?? null` because omitting it on an
    // upsert is how a save elsewhere on the record silently erases it. This one inverts:
    //
    //   - present  → write it. Without this, `personIdFor`/`orgIdFor` mint a number, the
    //     comms layer computes the handle, `newOrgToPerson` carries it — and the store
    //     dropped it on the floor. Every record created after 0031 was findable by number
    //     and by nothing else, so the ingest agent would have built a graph of rows no
    //     human could look up by name.
    //   - absent   → omit the KEY, never write null. A row whose handle predates this fix
    //     (or has none) must not have it overwritten, and `?? null` would do exactly that.
    //     Absence here means "don't touch", which is the opposite of what it means below.
    //
    // Safe to write on every save because the value is round-tripped: `toPerson` reads the
    // column, so an ordinary edit re-writes the same string it just read. It is a lookup key
    // only (see lib/recordId.ts) — 0031's unique index is what stops two rows sharing one.
    ...(p.legacySlug ? { legacy_slug: p.legacySlug } : {}),
    name: p.name,
    business: p.business ?? null,
    role: p.role ?? null,
    node_type: p.nodeType ?? null,
    entity_kind: p.entityKind ?? null,
    vertical_id: p.verticalId,
    phone: p.phone ?? null,
    email: p.email ?? null,
    website: p.website ?? null,
    referred_by_id: p.referredById ?? null,
    relationship: p.relationship ?? null,
    status: p.status,
    quoted_amount: p.quotedAmount ?? null,
    signed: p.signed,
    meeting_video_url: p.meetingVideoUrl ?? null,
    transcript_url: p.transcriptUrl ?? null,
    key_dates: p.keyDates ?? {},
    phase_one: p.phaseOne,
    description: p.description ?? null,
    estimate: p.estimate ?? null,
    phase2_estimate: p.phase2Estimate ?? null, // Q63 — paired with the read in toPerson
    notes: p.notes ?? null,
    equity: p.equity ?? null, // Q41 inc.2 — paired with the read in toPerson
    assigned_rep: p.assignedRep ?? null,
    org_id: p.orgId ?? null,
  };
}

export function toOrgPerson(r: any): Person {
  return { ...toPerson(r), entityKind: "company" };
}

// orgs.node_type has a narrower check constraint than people (no mle-admin /
// rep-candidate) and no entity_kind column; referred-by routes to the paired
// column depending on whether the referrer itself is an org.
const ORG_NODE_TYPES = new Set(["partner", "lead", "client", "connector", "vertical-anchor"]);

export function fromOrgRow(p: Person, referrerIsOrg: boolean) {
  const row: any = fromPerson(p);
  delete row.entity_kind;
  // `orgs` has no org_id column — a company is not a member of a company.
  delete row.org_id;
  if (row.node_type && !ORG_NODE_TYPES.has(row.node_type)) row.node_type = null;
  return routeReferrer(row, referrerIsOrg);
}

export function routeReferrer(row: any, referrerIsOrg: boolean) {
  const ref = row.referred_by_id;
  row.referred_by_id = referrerIsOrg ? null : ref;
  row.referred_by_org_id = referrerIsOrg ? ref : null;
  return row;
}

// Edge FKs are paired-nullable post-split (exactly one of person/org set per
// endpoint — DB check constraint); coalescing keeps the app's single-id shape.
export function toEdge(r: any): Edge {
  return {
    id: r.id,
    fromId: r.from_id ?? r.from_org_id,
    toId: r.to_id ?? r.to_org_id,
    relationship: r.relationship ?? undefined,
    suggested: r.suggested ?? undefined,
  };
}

async function isOrgId(s: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await s.from("orgs").select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(`supabase orgs lookup failed: ${error.message}`);
  return data != null;
}

function toProject(r: any): Project {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    theme: r.theme,
    completion: r.completion,
    owner: r.owner,
    summary: r.summary ?? undefined,
    link: r.link ?? undefined,
    willItems: r.will_items ?? undefined,
    updatedAt: r.updated_at,
  };
}

function fromProject(p: Project) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    theme: p.theme,
    completion: p.completion,
    owner: p.owner,
    summary: p.summary ?? null,
    link: p.link ?? null,
    will_items: p.willItems ?? null,
    updated_at: p.updatedAt,
  };
}
 

export const supabaseStore: StorageAdapter = {
  name: "supabase",
  async getNetwork(): Promise<NetworkData> {
    const s = db();
    const split = orgsSplitMode();
    const [people, edges, verticals, projects, orgs] = await Promise.all([
      s.from("people").select("*"),
      s.from("edges").select("*"),
      s.from("verticals").select("*"),
      s.from("projects").select("*"),
      split ? s.from("orgs").select("*") : Promise.resolve({ data: [], error: null }),
    ]);
    const firstError =
      people.error ?? edges.error ?? verticals.error ?? projects.error ?? orgs.error;
    if (firstError) throw new Error(`supabase read failed: ${firstError.message}`);
    return {
      people: [...(people.data ?? []).map(toPerson), ...(orgs.data ?? []).map(toOrgPerson)],
      edges: (edges.data ?? []).map(toEdge),
      verticals: (verticals.data ?? []).map(
        (r): Vertical => ({ id: r.id, name: r.name, color: r.color })
      ),
      projects: (projects.data ?? []).map(toProject),
    };
  },
  async upsertPerson(person: Person) {
    const s = db();
    if (!orgsSplitMode()) {
      const { error } = await s.from("people").upsert(fromPerson(person));
      if (error) throw new Error(`supabase upsertPerson failed: ${error.message}`);
      return;
    }
    // Split mode: a company row must land in orgs — writing it to people would
    // fork the record back into the table 0003 just emptied. Person rows still
    // go to people, but their referrer may now be an org (paired column).
    const refIsOrg = person.referredById ? await isOrgId(s, person.referredById) : false;
    const { error } =
      person.entityKind === "company"
        ? await s.from("orgs").upsert(fromOrgRow(person, refIsOrg))
        : await s.from("people").upsert(routeReferrer(fromPerson(person), refIsOrg));
    if (error) throw new Error(`supabase upsertPerson failed: ${error.message}`);
  },
  async upsertProject(project: Project) {
    const { error } = await db().from("projects").upsert(fromProject(project));
    if (error) throw new Error(`supabase upsertProject failed: ${error.message}`);
  },
  async listDeals(): Promise<Deal[]> {
    const { data, error } = await db()
      .from("deals")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(`supabase listDeals failed: ${error.message}`);
    return (data ?? []).map(toDeal);
  },
  async upsertDeal(deal: Deal) {
    const { error } = await db().from("deals").upsert(fromDeal(deal));
    if (error) throw new Error(`supabase upsertDeal failed: ${error.message}`);
  },
  async listActivities(filter?: ActivityFilter): Promise<Activity[]> {
    let q = db().from("activities").select("*").order("occurred_at", { ascending: true });
    if (filter?.personId) q = q.eq("person_id", filter.personId);
    if (filter?.orgId) q = q.eq("org_id", filter.orgId);
    if (filter?.dealId) q = q.eq("deal_id", filter.dealId);
    const { data, error } = await q;
    if (error) throw new Error(`supabase listActivities failed: ${error.message}`);
    return (data ?? []).map(toActivity);
  },
  async upsertActivity(activity: Activity) {
    const { error } = await db().from("activities").upsert(fromActivity(activity));
    if (error) throw new Error(`supabase upsertActivity failed: ${error.message}`);
  },
  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    let q = db().from("tasks").select("*").order("created_at", { ascending: true });
    if (filter?.status) q = q.eq("status", filter.status);
    const { data, error } = await q;
    if (error) throw new Error(`supabase listTasks failed: ${error.message}`);
    return (data ?? []).map(toTask);
  },
  async upsertTask(task: Task) {
    const { error } = await db().from("tasks").upsert(fromTask(task));
    if (error) throw new Error(`supabase upsertTask failed: ${error.message}`);
  },
};
