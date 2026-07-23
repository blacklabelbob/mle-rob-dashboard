import { NextRequest, NextResponse } from "next/server";
import { buildAgreementPdf, type AgreementConfig } from "@/lib/esign/agreementPdf";
import { createDocumentVersion } from "@/lib/esign/createDocument";
import { signedUrlFor } from "@/lib/esign/storage";

// Q47 e-sign in-dashboard generation (Rob directive 2026-07-23: the Phase-1
// engine ported to TS, Vercel-runnable — lib/esign/agreementPdf.ts). Admin
// route behind the proxy Basic gate. Body = the same client-JSON contract as
// contracts/clients/*.json (intake gate ENFORCED — generation refuses until
// the confirmed intake block matches entities[], identical to the Python
// engine) + CRM anchors. Output lands exactly like an upload: private bucket
// + draft documents row (or v(N+1) with supersedesId).

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const config = body.config as AgreementConfig | undefined;
  if (!config || typeof config !== "object" || !config.client || !Array.isArray(config.entities)) {
    return NextResponse.json(
      { error: "config required: { client, entities[], intake, fee?, provider?, additional_scope? }" },
      { status: 400 }
    );
  }

  let pdf;
  try {
    pdf = await buildAgreementPdf(config, "esign/generate");
  } catch (err) {
    // Intake-gate refusals come back verbatim — the 400 body doubles as the
    // fix-it instruction (house 1.9 contract style).
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : `Phase 1 Agreement - ${config.client.legal_name}`;
  const result = await createDocumentVersion({
    bytes: pdf.bytes,
    personId: typeof body.personId === "string" ? body.personId : null,
    orgId: typeof body.orgId === "string" ? body.orgId : null,
    dealId: typeof body.dealId === "string" ? body.dealId : null,
    title,
    phase: typeof body.phase === "string" && body.phase.trim() ? body.phase.trim() : "phase-1",
    createdBy: typeof body.createdBy === "string" ? body.createdBy : null,
    supersedesId: typeof body.supersedesId === "string" ? body.supersedesId : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const viewUrl = await signedUrlFor(result.storagePath, 3600);
  return NextResponse.json({ ...result, pageCount: pdf.pageCount, viewUrl });
}
