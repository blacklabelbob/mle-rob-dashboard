import { NextRequest, NextResponse } from "next/server";
import { createDocumentVersion } from "@/lib/esign/createDocument";
import { esignDb, type DocumentRow, type RequestRow } from "@/lib/esign/db";
import { downloadFilename, downloadPdf, signedUrlFor } from "@/lib/esign/storage";
import { extractPageText, lastPdfTextError } from "@/lib/esign/pdfText";
import { findSignatureAnchors } from "@/lib/esign/signatureAnchors";

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
      .select("title,storage_path,signed_path,countersigned_path")
      .eq("id", view)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!doc) return NextResponse.json({ error: "document not found" }, { status: 404 });
    // Name the download after the document, not the storage key. The email path
    // already did this; the dashboard View button did not, so every file Rob
    // opened from the CRM still saved as "v1-signed.pdf" (his report, 2026-08-07).
    const path = doc.countersigned_path ?? doc.signed_path ?? doc.storage_path;
    const stage = doc.countersigned_path
      ? "fully executed"
      : doc.signed_path
        ? "signed"
        : "";
    const url = await signedUrlFor(path, 3600, downloadFilename(doc.title, stage));
    return NextResponse.json({ url });
  }
  // ?anchors=<documentId> — does the signature locator actually work against
  // THIS file, in THIS runtime? Added 2026-08-07 because the locator passed
  // every local test and silently no-opped on Vercel, and nothing could tell
  // us that without a human signing a document first.
  const anchors = p.get("anchors");
  if (anchors) {
    const { data: doc, error } = await esignDb()
      .from("documents")
      .select("storage_path,signed_path")
      .eq("id", anchors)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!doc) return NextResponse.json({ error: "document not found" }, { status: 404 });
    const bytes = await downloadPdf(doc.signed_path ?? doc.storage_path);
    const pages = await extractPageText(bytes);
    const found = findSignatureAnchors(pages);
    return NextResponse.json({
      documentId: anchors,
      pagesExtracted: pages.length,
      textItems: pages.reduce((n, pg) => n + pg.items.length, 0),
      extractionError: lastPdfTextError(),
      anchors: found,
      verdict:
        found.client && found.provider
          ? "OK — both signature lines located"
          : pages.length === 0
            ? "BROKEN — no text extracted (pdf.js unavailable in this runtime?)"
            : "PARTIAL — text extracted but headings/rules not matched",
    });
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
