import { createHash } from "node:crypto";

// Q47 e-sign hash discipline (scout doc): sha256 hex digests anchor the
// evidence chain — sha256_at_upload when a PDF lands, sha256_at_sign
// re-computed from the stored bytes at signing time (equality proves the
// signer saw exactly what was sent), sha256_signed over the final stamped PDF.
// Pure: bytes in, hex out; no I/O, no clock.

export function sha256Hex(input: Uint8Array | string): string {
  return createHash("sha256").update(input).digest("hex");
}

export const SHA256_HEX = /^[0-9a-f]{64}$/;

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX.test(value);
}
