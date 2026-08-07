import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { SignatureEventRow } from "./events";

// Q47 e-sign: service-role access to the 0008 tables, shared by the signer
// page and the /api/esign/* routes. Server-side only (same idiom as
// supabaseStore / the cron routes). Raw snake_case rows on purpose — these
// tables have no UI-type mirror yet; the seam stays PostgREST-shaped.

export interface DocumentRow {
  id: string;
  person_id: string | null;
  org_id: string | null;
  deal_id: string | null;
  title: string;
  phase: string;
  storage_path: string;
  sha256_at_upload: string;
  sha256_signed: string | null;
  signed_path: string | null;
  version: number;
  status: string;
  supersedes_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // 0010 countersign leg — present in the table since the countersign
  // migration; typed here (Q93 inc.1) so a reader of an executed document
  // does not have to widen the type at every call site.
  countersigned_at: string | null;
  countersigner_name: string | null;
  countersigner_title: string | null;
  countersigner_email: string | null;
  countersigned_path: string | null;
  sha256_countersigned: string | null;
}

export interface RequestRow {
  id: string;
  document_id: string;
  token_hash: string;
  expires_at: string;
  channel: string;
  sent_to: string;
  signer_name: string | null;
  signer_email: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  consent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  voided_at: string | null;
  sha256_at_sign: string | null;
  presend_answers: Record<string, unknown>;
  signer_type: "business" | "consumer";
  status: string;
  created_at: string;
  updated_at: string;
}

let client: SupabaseClient | null = null;
export function esignDb(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("esign db: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export async function getRequestByTokenHash(
  tokenHash: string
): Promise<{ request: RequestRow; document: DocumentRow } | null> {
  const { data: request, error } = await esignDb()
    .from("signature_requests")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error(`esign request lookup: ${error.message}`);
  if (!request) return null;
  const { data: document, error: dErr } = await esignDb()
    .from("documents")
    .select("*")
    .eq("id", request.document_id)
    .single();
  if (dErr) throw new Error(`esign document lookup: ${dErr.message}`);
  return { request: request as RequestRow, document: document as DocumentRow };
}

export async function insertEvent(row: SignatureEventRow): Promise<void> {
  const { error } = await esignDb().from("signature_events").insert(row);
  if (error) throw new Error(`esign event insert: ${error.message}`);
}

export async function listEvents(
  requestIds: string[]
): Promise<{ request_id: string; type: string; at: string; ip: string | null }[]> {
  if (requestIds.length === 0) return [];
  const { data, error } = await esignDb()
    .from("signature_events")
    .select("request_id,type,at,ip")
    .in("request_id", requestIds)
    .order("at", { ascending: true });
  if (error) throw new Error(`esign events list: ${error.message}`);
  return data ?? [];
}

// The anchor id used for storage paths + timeline writes: org wins over
// person (path convention is <org_or_person_id>/...), deal-only docs anchor
// on the deal id.
export function anchorIdOf(doc: Pick<DocumentRow, "person_id" | "org_id" | "deal_id">): string {
  const anchor = doc.org_id ?? doc.person_id ?? doc.deal_id;
  if (!anchor) throw new Error("esign: document has no anchor");
  return anchor;
}
