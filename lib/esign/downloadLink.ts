// Q47 short download links — Rob, 2026-08-07: the signed/executed copy emails
// carried a ~600-character Supabase signed URL that wrapped across five lines
// and ended in "%255BDRY+RUN+3%255D". The signing email looked fine only
// because it points at our own domain.
//
// So do the same thing for downloads: mail a short link on our own domain and
// mint the real (short-lived) storage URL at click time.
//
//   https://<host>/d/<documentId>/<sig>
//
// Stateless by design — no table, no migration, nothing to clean up. The link
// is the document id plus an HMAC of it, so it cannot be guessed or walked from
// one document to another, and there is no shared "download token" row to leak.
//
// Because the URL is resolved at click time it always serves the LATEST copy:
// the link mailed at signing later hands back the fully-executed version once
// countersigned. That is deliberate — one link per agreement, always current,
// and it does not rot after seven days the way the old signed URL did.
//
// TRADE-OFF ON THE RECORD: this link does not expire on its own. It is a
// 128-bit-unguessable bearer link to one specific agreement, and anyone holding
// it can re-download that agreement until the document is voided or archived
// (both of which the route refuses). That is the same posture as the emailed
// copy it replaces — an emailed link lives in an inbox forever either way — but
// it IS a bearer link, and if that ever stops being acceptable the fix is an
// expiry stamped into the payload, not a longer signature.

import { createHmac } from "node:crypto";

/** Key separation: never HMAC with the sender secret itself. */
function linkKey(): string {
  const root = process.env.ESIGN_SENDER_SECRET || process.env.CRON_SECRET || "";
  if (!root) return "";
  return createHmac("sha256", root).update("esign-download-link-v1").digest("hex");
}

export function downloadSignature(documentId: string, key = linkKey()): string {
  if (!key) return "";
  return createHmac("sha256", key)
    .update(documentId)
    .digest("base64url")
    .slice(0, 22); // ~128 bits, and still short enough to read in an email
}

export function verifyDownloadSignature(
  documentId: string,
  sig: string,
  key = linkKey()
): boolean {
  const expected = downloadSignature(documentId, key);
  if (!expected || !sig || expected.length !== sig.length) return false;
  // Constant-time compare (same idiom as lib/esign/token.ts).
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/**
 * The link to put in an email. Returns null when no signing key is configured,
 * so callers fall back to the long storage URL rather than mailing a dead link.
 */
export function downloadLink(documentId: string, baseUrl: string): string | null {
  const sig = downloadSignature(documentId);
  if (!sig) return null;
  return `${baseUrl.replace(/\/+$/, "")}/d/${documentId}/${sig}`;
}

/** Public origin for links in email. */
export function publicBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "https://mle-rob-dashboard.vercel.app";
}
