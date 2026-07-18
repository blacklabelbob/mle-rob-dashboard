import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { NetworkData, Person, Project, Edge, Vertical } from "@/lib/types";
import type { StorageAdapter } from "./adapter";

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
      "supabase store: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see docs/STORAGE-DECISION.md)"
    );
  }
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toPerson(r: any): Person {
  return {
    id: r.id,
    name: r.name,
    business: r.business ?? undefined,
    role: r.role ?? undefined,
    nodeType: r.node_type ?? undefined,
    entityKind: r.entity_kind ?? undefined,
    verticalId: r.vertical_id,
    phone: r.phone ?? undefined,
    email: r.email ?? undefined,
    website: r.website ?? undefined,
    referredById: r.referred_by_id ?? undefined,
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
    notes: r.notes ?? undefined,
    assignedRep: r.assigned_rep ?? undefined,
  };
}

function fromPerson(p: Person) {
  return {
    id: p.id,
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
    notes: p.notes ?? null,
    assigned_rep: p.assignedRep ?? null,
  };
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
/* eslint-enable @typescript-eslint/no-explicit-any */

export const supabaseStore: StorageAdapter = {
  name: "supabase",
  async getNetwork(): Promise<NetworkData> {
    const s = db();
    const [people, edges, verticals, projects] = await Promise.all([
      s.from("people").select("*"),
      s.from("edges").select("*"),
      s.from("verticals").select("*"),
      s.from("projects").select("*"),
    ]);
    const firstError = people.error ?? edges.error ?? verticals.error ?? projects.error;
    if (firstError) throw new Error(`supabase read failed: ${firstError.message}`);
    return {
      people: (people.data ?? []).map(toPerson),
      edges: (edges.data ?? []).map(
        (r): Edge => ({
          id: r.id,
          fromId: r.from_id,
          toId: r.to_id,
          relationship: r.relationship ?? undefined,
          suggested: r.suggested ?? undefined,
        })
      ),
      verticals: (verticals.data ?? []).map(
        (r): Vertical => ({ id: r.id, name: r.name, color: r.color })
      ),
      projects: (projects.data ?? []).map(toProject),
    };
  },
  async upsertPerson(person: Person) {
    const { error } = await db().from("people").upsert(fromPerson(person));
    if (error) throw new Error(`supabase upsertPerson failed: ${error.message}`);
  },
  async upsertProject(project: Project) {
    const { error } = await db().from("projects").upsert(fromProject(project));
    if (error) throw new Error(`supabase upsertProject failed: ${error.message}`);
  },
};
