import { NextRequest, NextResponse } from "next/server";
import { esignDb } from "@/lib/esign/db";
import { verifyDownloadSignature } from "@/lib/esign/downloadLink";
import { downloadFilename, signedUrlFor } from "@/lib/esign/storage";

// Q47 short download links: /d/<documentId>/<sig> -> 302 to a freshly minted,
// short-lived storage URL. Public by design (the recipient has no dashboard
// credentials) and authenticated by the HMAC in the path, exactly as /sign/
// is authenticated by its token.
//
// Always serves the LATEST copy — countersigned, else signed, else the original
// — so one link stays correct for the whole life of the agreement.

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ documentId: string; sig: string }> }
) {
  const { documentId, sig } = await ctx.params;

  if (!verifyDownloadSignature(documentId, sig)) {
    // Same answer for a bad signature and a missing document: no oracle for
    // whether a given document id exists.
    return NextResponse.json({ error: "invalid or expired download link" }, { status: 404 });
  }

  const { data: doc, error } = await esignDb()
    .from("documents")
    .select("title,status,storage_path,signed_path,countersigned_path")
    .eq("id", documentId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  if (!doc) return NextResponse.json({ error: "invalid or expired download link" }, { status: 404 });

  if (doc.status === "voided" || doc.status === "archived") {
    return NextResponse.json(
      { error: "this agreement has been superseded — ask for a current copy" },
      { status: 410 }
    );
  }

  const path = doc.countersigned_path ?? doc.signed_path ?? doc.storage_path;
  if (!path) return NextResponse.json({ error: "no file stored" }, { status: 404 });

  const stage = doc.countersigned_path ? "fully executed" : doc.signed_path ? "signed" : "";
  const url = await signedUrlFor(path, 300, downloadFilename(doc.title, stage));
  return NextResponse.redirect(url, 302);
}
