import { randomBytes } from "node:crypto";
import { esignDb } from "./db";
import { buildEvent } from "./events";
import { sha256Hex } from "./hash";
import { archiveOnNewVersion, type DocumentStatus, type RequestStatus } from "./status";
import { documentPath, uploadPdf } from "./storage";

// Q47 e-sign: the one shared "PDF bytes → documents row" flow, used by both
// POST /api/esign/documents (local-python upload path) and
// POST /api/esign/generate (TS engine — Rob's port directive). Handles the
// supersede rule (walkthrough step 7): new version archives the old document
// and voids its open links; refuses to supersede a signed document
// (archiveOnNewVersion).

export interface CreateDocArgs {
  bytes: Uint8Array;
  personId: string | null;
  orgId: string | null;
  dealId: string | null;
  title: string;
  phase: string;
  createdBy: string | null;
  supersedesId: string | null;
}

export type CreateDocResult =
  | { ok: true; documentId: string; version: number; sha256: string; storagePath: string }
  | { ok: false; status: number; error: string };

export async function createDocumentVersion(args: CreateDocArgs): Promise<CreateDocResult> {
  const { personId, orgId, dealId } = args;
  if (personId && orgId) {
    return { ok: false, status: 400, error: "at most one of personId/orgId (0008 anchor check)" };
  }
  if (!personId && !orgId && !dealId) {
    return { ok: false, status: 400, error: "need an anchor: personId, orgId, or dealId" };
  }
  if (!args.title.trim()) return { ok: false, status: 400, error: "title required" };
  const bytes = args.bytes;
  if (bytes.length < 5 || Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") {
    return { ok: false, status: 400, error: "payload is not a PDF" };
  }

  let version = 1;
  if (args.supersedesId) {
    const { data: oldDoc, error } = await esignDb()
      .from("documents")
      .select("*")
      .eq("id", args.supersedesId)
      .maybeSingle();
    if (error) return { ok: false, status: 500, error: error.message };
    if (!oldDoc) return { ok: false, status: 404, error: "supersedesId not found" };
    if (
      (oldDoc.person_id ?? null) !== personId ||
      (oldDoc.org_id ?? null) !== orgId ||
      (oldDoc.deal_id ?? null) !== dealId
    ) {
      return { ok: false, status: 400, error: "new version must keep the old version's anchors" };
    }
    version = oldDoc.version + 1;

    const { data: reqs, error: rErr } = await esignDb()
      .from("signature_requests")
      .select("id,status")
      .eq("document_id", oldDoc.id);
    if (rErr) return { ok: false, status: 500, error: rErr.message };
    let plan;
    try {
      plan = archiveOnNewVersion(
        { id: oldDoc.id, status: oldDoc.status as DocumentStatus },
        (reqs ?? []) as { id: string; status: RequestStatus }[]
      );
    } catch (err) {
      return { ok: false, status: 409, error: (err as Error).message };
    }
    const now = new Date().toISOString();
    for (const rid of plan.voidRequestIds) {
      await esignDb()
        .from("signature_requests")
        .update({ status: "voided", voided_at: now, updated_at: now })
        .eq("id", rid);
      const { error: evErr } = await esignDb()
        .from("signature_events")
        .insert(buildEvent(rid, "voided", now, { meta: { reason: "superseded", oldDocId: oldDoc.id } }));
      if (evErr) console.error(`[esign] void event for ${rid} failed: ${evErr.message}`);
    }
    const { error: aErr } = await esignDb()
      .from("documents")
      .update({ status: "archived", updated_at: now })
      .eq("id", plan.archiveDocumentId);
    if (aErr) return { ok: false, status: 500, error: aErr.message };
  }

  const id = `doc-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const anchor = orgId ?? personId ?? dealId!;
  const path = documentPath(anchor, id, version);
  await uploadPdf(path, bytes);
  const sha = sha256Hex(bytes);
  const now = new Date().toISOString();
  const { error: insErr } = await esignDb().from("documents").insert({
    id,
    person_id: personId,
    org_id: orgId,
    deal_id: dealId,
    title: args.title.trim(),
    phase: args.phase,
    storage_path: path,
    sha256_at_upload: sha,
    version,
    status: "draft",
    supersedes_id: args.supersedesId,
    created_by: args.createdBy,
    created_at: now,
    updated_at: now,
  });
  if (insErr) return { ok: false, status: 500, error: insErr.message };
  return { ok: true, documentId: id, version, sha256: sha, storagePath: path };
}
