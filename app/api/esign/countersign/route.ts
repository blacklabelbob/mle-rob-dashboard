import { NextRequest, NextResponse } from "next/server";
import { planCountersign, type CountersignDoc } from "@/lib/esign/countersign";
import { stampCountersignature } from "@/lib/esign/countersignPdf";
import { anchorIdOf, esignDb, insertEvent, type DocumentRow } from "@/lib/esign/db";
import { sha256Hex } from "@/lib/esign/hash";
import { countersignedPath, downloadPdf, signedUrlFor, uploadPdf } from "@/lib/esign/storage";
import { getStore } from "@/lib/storage";

// Q47 countersign inc.2 — the executor over the pure planner (lib/esign/
// countersign.ts). Admin route behind the proxy gate, same posture as
// /api/esign/generate. Order of operations mirrors the signer route's
// hard-won shape: CLAIM the row atomically first (so a double-click can
// never produce two countersignatures or re-date an executed agreement),
// then do the fallible PDF work, and REVERT the claim if that work fails.
// documents.status is never touched — `signed` is terminal (0010 header).

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
  const name = typeof body.name === "string" ? body.name : "";
  const title = typeof body.title === "string" ? body.title : "";
  const email = typeof body.email === "string" ? body.email : null;
  if (!documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 });
  }

  const db = esignDb();
  const { data: document, error: dErr } = await db
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (dErr) return NextResponse.json({ error: `document lookup: ${dErr.message}` }, { status: 500 });
  if (!document) return NextResponse.json({ error: "document not found" }, { status: 404 });
  const doc = document as DocumentRow & CountersignDoc;

  // The event rides the SIGNER's request so one chain carries the whole story.
  const { data: reqRow, error: rErr } = await db
    .from("signature_requests")
    .select("id,signer_name,sent_to,signed_at")
    .eq("document_id", documentId)
    .not("signed_at", "is", null)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rErr) return NextResponse.json({ error: `request lookup: ${rErr.message}` }, { status: 500 });

  let plan;
  try {
    // Refusals from the planner come back verbatim — "not signed yet",
    // "already countersigned", "no stored signed copy" are the fix-it text.
    plan = planCountersign(doc, reqRow?.id ?? "", { name, title, email }, new Date().toISOString());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }

  // --- atomic claim: only one caller can move countersigned_at off NULL ---
  const { data: claimed, error: cErr } = await db
    .from("documents")
    .update(plan.documentPatch)
    .eq("id", documentId)
    .is("countersigned_at", null)
    .select("id")
    .maybeSingle();
  if (cErr) return NextResponse.json({ error: `countersign claim: ${cErr.message}` }, { status: 500 });
  if (!claimed) {
    return NextResponse.json({ error: "document is already countersigned" }, { status: 409 });
  }

  const releaseClaim = async () => {
    const { error } = await db
      .from("documents")
      .update({
        countersigned_at: null,
        countersigner_name: null,
        countersigner_title: null,
        countersigner_email: null,
      })
      .eq("id", documentId);
    return !error;
  };

  let outPath: string;
  let sha256Countersigned: string;
  try {
    const signedBytes = await downloadPdf(plan.stampSourcePath);
    const digest = sha256Hex(signedBytes);
    if (doc.sha256_signed && digest !== doc.sha256_signed) {
      throw new Error(
        `stored signed copy digest ${digest} does not match documents.sha256_signed — refusing to countersign an altered file`
      );
    }
    const stamped = await stampCountersignature({
      signedPdf: signedBytes,
      documentTitle: doc.title,
      documentId: doc.id,
      version: doc.version,
      signerName: reqRow?.signer_name || reqRow?.sent_to || "(counterparty)",
      signedAtIso: reqRow?.signed_at ?? "",
      countersignerName: name,
      countersignerTitle: title,
      countersignerEmail: email,
      countersignedAtIso: plan.documentPatch.countersigned_at,
      sha256Signed: digest,
    });
    outPath = countersignedPath(anchorIdOf(doc), doc.id, doc.version);
    await uploadPdf(outPath, stamped);
    sha256Countersigned = sha256Hex(stamped);
  } catch (err) {
    const reverted = await releaseClaim();
    return NextResponse.json(
      {
        error: reverted
          ? `countersignature not recorded (${(err as Error).message}) — nothing changed, retry is safe`
          : `countersignature failed (${(err as Error).message}) AND the claim could not be released — the row shows countersigned_at with no PDF; clear it before retrying`,
      },
      { status: 500 }
    );
  }

  // From here the countersigned copy exists. Path/digest land on the row; a
  // miss below is an audit gap, not a reason to unwind an executed agreement.
  const { error: pErr } = await db
    .from("documents")
    .update({ countersigned_path: outPath, sha256_countersigned: sha256Countersigned })
    .eq("id", documentId);
  if (pErr) console.error(`[esign] countersigned path write failed: ${pErr.message}`);

  if (reqRow?.id) {
    await insertEvent(plan.event).catch((err) =>
      console.error("[esign] countersigned event insert failed:", err)
    );
  }

  await getStore()
    .upsertActivity({
      id: `esign-countersigned-${doc.id}`,
      personId: doc.person_id ?? undefined,
      orgId: doc.org_id ?? undefined,
      dealId: doc.deal_id ?? undefined,
      createdBy: "esign",
      type: "note",
      source: "api",
      sourceContext: {
        esign: true,
        event: "countersigned",
        documentId: doc.id,
        version: doc.version,
        countersignerName: name,
      },
      summary: `Agreement countersigned: ${doc.title} (v${doc.version}) by ${name}, ${title}`,
      bookProtected: false,
      occurredAt: plan.documentPatch.countersigned_at,
      createdAt: plan.documentPatch.countersigned_at,
    })
    .catch((err) => console.error("[esign] countersign timeline activity failed:", err));

  const downloadUrl = await signedUrlFor(outPath, 7 * 24 * 3600);
  return NextResponse.json({
    ok: true,
    documentId: doc.id,
    countersignedAt: plan.documentPatch.countersigned_at,
    countersignedPath: outPath,
    sha256Countersigned,
    downloadUrl,
  });
}
