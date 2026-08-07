import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Q47 e-sign: private `agreements` bucket I/O (bucket created 2026-07-23,
// public:false verified). Server-side ONLY — everything here rides the
// service-role key; the browser never sees more than a time-limited signed
// URL minted by signedUrlFor. Path convention (walkthrough step 7 +
// assignment): <org_or_person_id>/<document_id>/v<version>.pdf, with the
// final signed copy at v<version>-signed.pdf beside it.

export const AGREEMENTS_BUCKET = "agreements";

// Pure path builders (unit-tested; no I/O).
export function documentPath(
  anchorId: string,
  documentId: string,
  version: number,
  signed = false
): string {
  if (!anchorId || !documentId) throw new Error("documentPath: anchorId and documentId required");
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`documentPath: bad version ${version}`);
  }
  return `${anchorId}/${documentId}/v${version}${signed ? "-signed" : ""}.pdf`;
}

// The fully-executed copy sits beside the signed copy rather than replacing
// it — the signer's copy stays byte-identical to what they were emailed
// (0010: countersigning never rewrites the counterparty's record).
export function countersignedPath(
  anchorId: string,
  documentId: string,
  version: number
): string {
  return documentPath(anchorId, documentId, version).replace(/\.pdf$/, "-countersigned.pdf");
}

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("esign storage: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// Upload never silently overwrites a legal document: upsert stays false so a
// path collision fails loudly (versioning, not clobbering, is the flow).
export async function uploadPdf(path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await db()
    .storage.from(AGREEMENTS_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (error) throw new Error(`esign upload ${path}: ${error.message}`);
}

export async function downloadPdf(path: string): Promise<Uint8Array> {
  const { data, error } = await db().storage.from(AGREEMENTS_BUCKET).download(path);
  if (error || !data) throw new Error(`esign download ${path}: ${error?.message ?? "no data"}`);
  return new Uint8Array(await data.arrayBuffer());
}

// Time-limited read link for the private bucket (view buttons, signer preview,
// copy emails). Default 1 hour; copy emails pass a longer window explicitly.
//
// `downloadAs` sets the saved filename (Content-Disposition). Without it the
// browser names the file after the storage key — "v1-signed.pdf" — which tells
// the recipient nothing (Rob 2026-08-07: make the filename match the subject).
export async function signedUrlFor(
  path: string,
  expiresInSeconds = 3600,
  downloadAs?: string
): Promise<string> {
  const { data, error } = await db()
    .storage.from(AGREEMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds, downloadAs ? { download: downloadAs } : undefined);
  if (error || !data?.signedUrl) {
    throw new Error(`esign signed url ${path}: ${error?.message ?? "no url"}`);
  }
  return data.signedUrl;
}

/**
 * A filesystem-safe download name built from the document title, so the saved
 * PDF matches the email subject. Em dashes and smart punctuation are kept —
 * only characters that are illegal in filenames are replaced.
 */
export function downloadFilename(title: string, suffix = "signed"): string {
  // Plain ASCII only. The filename rides in a URL query parameter, so anything
  // outside it comes back as percent-encoded noise in the link and in the saved
  // name: an em dash became %E2%80%94 and [DRY RUN 3] became %5BDRY+RUN+3%5D
  // (Rob, 2026-08-07: "get rid of all the extra BS"). Dashes and brackets carry
  // no meaning here, so they are normalised rather than escaped.
  const base = (title || "Agreement")
    .replace(/[‒-―−]/g, "-") // – — ― figure/en/em dashes, minus
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, "")
    .replace(/[[\]{}()]/g, "") // brackets add nothing and encode badly
    .replace(/[^\x20-\x7E]/g, "") // anything still non-ASCII
    .replace(/[\\/:*?"<>|\n\r\t]/g, "-") // illegal in filenames
    .replace(/\s*-\s*-+\s*/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .slice(0, 120)
    .trim();
  return `${base}${suffix ? ` - ${suffix}` : ""}.pdf`;
}
