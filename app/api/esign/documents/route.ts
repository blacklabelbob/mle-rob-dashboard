import { NextRequest, NextResponse } from "next/server";
import { createDocumentVersion } from "@/lib/esign/createDocument";
import { esignDb, type DocumentRow, type RequestRow } from "@/lib/esign/db";
import { signedUrlFor } from "@/lib/esign/storage";

// Q47 e-sign document intake + listing (admin: behind the proxy Basic gate,
// same as every /api/admin route — NOT in isPublicPath).
// POST = the upload path: a finished PDF (e.g. from the local Python engine)
// arrives as base64 → sha256 → private bucket → documents row (draft), or —
// with supersedesId — as v(N+1) while the old version is auto-archived and
// its open links voided (walkthrough resend rule). In-dashboard generation
// lives at POST /api/esign/generate (TS engine port).
// GET = the Documents-section feed: documents + requests for one anchor.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const view = p.get("view");
  if (view) {
    // Time-limited signed URL for one document — always the most executed copy
    // that exists (countersigned → signed → original), so "View" on a closed
    // agreement hands back the fully executed paper, not the draft.
    const { data: doc, error } = await esignDb()
      .from("documents")
      .select("storage_path,signed_path,countersigned_path")
      .eq("id", view)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!doc) return NextResponse.json({ error: "document not found" }, { status: 404 });
    const url = await signedUrlFor(doc.countersigned_path ?? doc.signed_path ?? doc.storage_path, 3600);
    return NextResponse.json({ url });
  }
  const person = p.get("person");
  const org = p.get("org");
  const deal = p.get("deal");
  if (!person && !org && !deal) {
    return NextResponse.json({ error: "need ?person= or ?org= or ?deal=" }, { status: 400 });
  }
  let q = esignDb().from("documents").select("*").order("created_at", { ascending: false });
  if (person) q = q.eq("person_id", person);
  else if (org) q = q.eq("org_id", org);
  else q = q.eq("deal_id", deal);
  const { data: documents, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (documents ?? []).map((d: DocumentRow) => d.id);
  let requests: RequestRow[] = [];
  if (ids.length > 0) {
    const { data, error: rErr } = await esignDb()
      .from("signature_requests")
      .select("*")
      .in("document_id", ids)
      .order("created_at", { ascending: false });
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    requests = (data ?? []) as RequestRow[];
  }
  // Strip token hashes from the payload — no reason to hand them to the UI.
  const safe = requests.map(({ token_hash: _drop, ...rest }) => rest);
  return NextResponse.json({ documents: documents ?? [], requests: safe });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const pdfBase64 = typeof body.pdfBase64 === "string" ? body.pdfBase64 : "";
  if (!pdfBase64) return NextResponse.json({ error: "pdfBase64 required" }, { status: 400 });
  let bytes: Buffer;
  try {
    bytes = Buffer.from(pdfBase64, "base64");
  } catch {
    return NextResponse.json({ error: "pdfBase64 is not valid base64" }, { status: 400 });
  }

  const result = await createDocumentVersion({
    bytes,
    personId: typeof body.personId === "string" ? body.personId : null,
    orgId: typeof body.orgId === "string" ? body.orgId : null,
    dealId: typeof body.dealId === "string" ? body.dealId : null,
    title: typeof body.title === "string" ? body.title : "",
    phase: typeof body.phase === "string" && body.phase.trim() ? body.phase.trim() : "phase-1",
    createdBy: typeof body.createdBy === "string" ? body.createdBy : null,
    supersedesId: typeof body.supersedesId === "string" ? body.supersedesId : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const viewUrl = await signedUrlFor(result.storagePath, 3600);
  return NextResponse.json({ ...result, viewUrl });
}
