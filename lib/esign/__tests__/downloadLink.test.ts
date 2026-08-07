import { describe, expect, it } from "vitest";
import {
  downloadLink,
  downloadSignature,
  verifyDownloadSignature,
} from "../downloadLink";

// Q47 short download links. Rob, 2026-08-07: the signed/executed copy emails
// still carried the ~600-character Supabase URL. These pin the two properties
// the link has to have — it must be unguessable, and it must not become a
// skeleton key for other agreements.

const KEY = "test-key-not-a-secret";

describe("download link signature", () => {
  it("verifies its own signature", () => {
    const sig = downloadSignature("doc-abc-123", KEY);
    expect(verifyDownloadSignature("doc-abc-123", sig, KEY)).toBe(true);
  });

  it("is bound to ONE document — a valid signature cannot be reused", () => {
    const sig = downloadSignature("doc-abc-123", KEY);
    expect(verifyDownloadSignature("doc-xyz-999", sig, KEY)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const sig = downloadSignature("doc-abc-123", KEY);
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(verifyDownloadSignature("doc-abc-123", flipped, KEY)).toBe(false);
    expect(verifyDownloadSignature("doc-abc-123", sig.slice(0, -1), KEY)).toBe(false);
    expect(verifyDownloadSignature("doc-abc-123", "", KEY)).toBe(false);
  });

  it("does not verify under a different key", () => {
    const sig = downloadSignature("doc-abc-123", KEY);
    expect(verifyDownloadSignature("doc-abc-123", sig, "another-key")).toBe(false);
  });

  it("carries enough entropy to be unguessable", () => {
    // 22 base64url chars ~ 132 bits.
    expect(downloadSignature("doc-abc-123", KEY)).toHaveLength(22);
  });

  it("refuses to sign when no key is configured — callers fall back", () => {
    expect(downloadSignature("doc-abc-123", "")).toBe("");
    expect(verifyDownloadSignature("doc-abc-123", "anything", "")).toBe(false);
  });
});

describe("downloadLink", () => {
  it("is short and readable, unlike the storage URL it replaces", () => {
    const url = downloadLink("doc-msjc5sns-f43405", "https://mle-rob-dashboard.vercel.app", KEY);
    expect(url).not.toBeNull();
    // The whole point: it fits on one line of an email.
    expect(url!.length).toBeLessThan(90);
    expect(url).not.toContain("%");
    expect(url).toMatch(/^https:\/\/[^/]+\/d\/doc-msjc5sns-f43405\/[A-Za-z0-9_-]{22}$/);
  });

  it("returns null with no key so callers fall back to the long URL", () => {
    expect(downloadLink("doc-1", "https://x.test", "")).toBeNull();
  });

  it("tolerates a trailing slash on the base url", () => {
    const a = downloadLink("doc-1", "https://x.test/", KEY);
    const b = downloadLink("doc-1", "https://x.test", KEY);
    expect(a).toBe(b);
  });
});
