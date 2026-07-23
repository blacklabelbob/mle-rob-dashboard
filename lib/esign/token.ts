import { randomBytes, timingSafeEqual } from "node:crypto";
import { sha256Hex } from "./hash";

// Q47 e-sign signing-link tokens. The raw token lives ONLY in the emailed
// link; the database stores its sha256 (0008 signature_requests.token_hash,
// unique) — a DB leak yields no usable signing links (freesign-style
// hash-at-rest, reimplemented clean-room; no AGPL code copied).
// verifyToken is pure: the caller passes `now` (CR-3 / scoring-pattern rule —
// no clock reads here), plus the request row fields it read from the DB.

export const TOKEN_BYTES = 32;

export interface MintedToken {
  token: string; // base64url, goes in the link, never stored
  tokenHash: string; // sha256 hex, the only thing at rest
}

export function mintToken(bytes: () => Buffer = () => randomBytes(TOKEN_BYTES)): MintedToken {
  const token = bytes().toString("base64url");
  return { token, tokenHash: sha256Hex(token) };
}

export function hashToken(token: string): string {
  return sha256Hex(token);
}

// Constant-time hex-hash comparison (verifyVapiSecret idiom).
export function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(sha256Hex(token));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The request-row fields verification needs (snake_case = raw PostgREST row).
export interface TokenRequestRow {
  token_hash: string;
  expires_at: string;
  status: string; // pending | viewed | signed | voided | expired
  signed_at: string | null;
  voided_at: string | null;
}

export type TokenVerdict =
  | { ok: true }
  | { ok: false; reason: "tampered" | "expired" | "signed" | "voided" | "status" };

// Single-use, expiring, tamper-evident — every failure names its reason so
// the signer page can say the honest thing ("this link was replaced", "this
// link expired") instead of a generic 404.
export function verifyToken(token: string, row: TokenRequestRow, now: Date): TokenVerdict {
  if (!tokenMatches(token, row.token_hash)) return { ok: false, reason: "tampered" };
  if (row.signed_at || row.status === "signed") return { ok: false, reason: "signed" };
  if (row.voided_at || row.status === "voided") return { ok: false, reason: "voided" };
  if (now.getTime() >= Date.parse(row.expires_at)) return { ok: false, reason: "expired" };
  if (row.status !== "pending" && row.status !== "viewed") {
    return { ok: false, reason: "status" };
  }
  return { ok: true };
}
