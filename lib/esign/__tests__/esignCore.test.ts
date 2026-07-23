import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSha256Hex, sha256Hex } from "../hash";
import { hashToken, mintToken, tokenMatches, verifyToken, type TokenRequestRow } from "../token";
import {
  DOCUMENT_STATUSES,
  DOC_TRANSITIONS,
  REQUEST_STATUSES,
  archiveOnNewVersion,
  assertTransition,
  canTransition,
  type DocumentStatus,
} from "../status";
import { EVENT_TYPES, buildEvent, formatEventChain } from "../events";
import { documentPath } from "../storage";
import { ESIGN_CONSENT_TEXT } from "../consent";

const NOW = new Date("2026-07-23T12:00:00Z");

function row(overrides: Partial<TokenRequestRow> = {}): TokenRequestRow {
  const { tokenHash } = mint;
  return {
    token_hash: tokenHash,
    expires_at: "2026-08-06T12:00:00Z",
    status: "pending",
    signed_at: null,
    voided_at: null,
    ...overrides,
  };
}
const mint = mintToken();

describe("hash", () => {
  it("sha256Hex is deterministic and hex-shaped", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(isSha256Hex(sha256Hex("abc"))).toBe(true);
    expect(isSha256Hex("nope")).toBe(false);
  });
});

describe("token", () => {
  it("mints unique base64url tokens whose hash matches", () => {
    const a = mintToken();
    const b = mintToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hashToken(a.token)).toBe(a.tokenHash);
    expect(tokenMatches(a.token, a.tokenHash)).toBe(true);
    expect(tokenMatches(b.token, a.tokenHash)).toBe(false);
  });

  it("verifies a live pending token", () => {
    expect(verifyToken(mint.token, row(), NOW)).toEqual({ ok: true });
  });

  it("viewed status still verifies (view-then-sign is the happy path)", () => {
    expect(verifyToken(mint.token, row({ status: "viewed" }), NOW)).toEqual({ ok: true });
  });

  it("rejects a tampered/forged token", () => {
    expect(verifyToken("forged-token", row(), NOW)).toEqual({ ok: false, reason: "tampered" });
    // Forgery with the right shape but wrong bytes
    const other = mintToken();
    expect(verifyToken(other.token, row(), NOW)).toEqual({ ok: false, reason: "tampered" });
  });

  it("rejects an expired token (boundary: expiry instant itself fails)", () => {
    expect(
      verifyToken(mint.token, row({ expires_at: "2026-07-23T11:59:59Z" }), NOW)
    ).toEqual({ ok: false, reason: "expired" });
    expect(
      verifyToken(mint.token, row({ expires_at: NOW.toISOString() }), NOW)
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a reused token (single-use: signed_at set)", () => {
    expect(
      verifyToken(mint.token, row({ signed_at: "2026-07-23T11:00:00Z", status: "signed" }), NOW)
    ).toEqual({ ok: false, reason: "signed" });
  });

  it("rejects a voided token (resend voided the old link)", () => {
    expect(
      verifyToken(mint.token, row({ voided_at: "2026-07-23T11:00:00Z", status: "voided" }), NOW)
    ).toEqual({ ok: false, reason: "voided" });
  });

  it("tamper check wins over expiry (no oracle about live links)", () => {
    expect(
      verifyToken("forged", row({ expires_at: "2020-01-01T00:00:00Z" }), NOW)
    ).toEqual({ ok: false, reason: "tampered" });
  });
});

describe("status machine", () => {
  it("walks the walkthrough ladder draft→sent→viewed→signed", () => {
    expect(canTransition("draft", "sent")).toBe(true);
    expect(canTransition("sent", "viewed")).toBe(true);
    expect(canTransition("viewed", "signed")).toBe(true);
  });

  it("sent→signed is legal (sign wins a race with the view logger)", () => {
    expect(canTransition("sent", "signed")).toBe(true);
  });

  it("signed is terminal; nothing reverses", () => {
    for (const to of DOCUMENT_STATUSES) expect(canTransition("signed", to)).toBe(false);
    expect(canTransition("viewed", "draft")).toBe(false);
    expect(canTransition("sent", "draft")).toBe(false);
    expect(canTransition("archived", "sent")).toBe(false);
  });

  it("draft cannot jump straight to signed or viewed (nothing signs unsent)", () => {
    expect(canTransition("draft", "signed")).toBe(false);
    expect(canTransition("draft", "viewed")).toBe(false);
  });

  it("assertTransition throws with the pair named", () => {
    expect(() => assertTransition("signed", "sent")).toThrow(/signed → sent/);
  });

  it("every declared transition target is a real status", () => {
    for (const [from, tos] of Object.entries(DOC_TRANSITIONS)) {
      expect(DOCUMENT_STATUSES).toContain(from as DocumentStatus);
      for (const to of tos) expect(DOCUMENT_STATUSES).toContain(to);
    }
  });

  it("archiveOnNewVersion voids only open links and refuses signed docs", () => {
    const plan = archiveOnNewVersion({ id: "d1", status: "sent" }, [
      { id: "r1", status: "pending" },
      { id: "r2", status: "viewed" },
      { id: "r3", status: "voided" },
      { id: "r4", status: "signed" },
    ]);
    expect(plan).toEqual({ archiveDocumentId: "d1", voidRequestIds: ["r1", "r2"] });
    expect(() => archiveOnNewVersion({ id: "d2", status: "signed" }, [])).toThrow(
      /refusing to auto-archive signed/
    );
  });
});

describe("events", () => {
  it("builds rows and rejects junk", () => {
    const e = buildEvent("req-1", "sent", "2026-07-23T12:00:00Z", { ip: "1.2.3.4" });
    expect(e).toEqual({
      request_id: "req-1",
      type: "sent",
      at: "2026-07-23T12:00:00Z",
      ip: "1.2.3.4",
      meta: {},
    });
    expect(() => buildEvent("req-1", "bogus" as never, "2026-07-23T12:00:00Z")).toThrow();
    expect(() => buildEvent("", "sent", "2026-07-23T12:00:00Z")).toThrow();
    expect(() => buildEvent("req-1", "sent", "not-a-date")).toThrow();
  });

  it("formats the chain deterministically, oldest first", () => {
    const lines = formatEventChain([
      { type: "signed", at: "2026-07-23T12:05:00Z", ip: "9.9.9.9" },
      { type: "created", at: "2026-07-23T11:00:00Z", ip: null },
      { type: "viewed", at: "2026-07-23T12:00:00Z", ip: "9.9.9.9" },
    ]);
    expect(lines[0]).toContain("CREATED");
    expect(lines[2]).toContain("SIGNED");
    expect(lines[2]).toContain("ip 9.9.9.9");
  });
});

describe("storage paths", () => {
  it("builds the <anchor>/<doc>/v<N>.pdf convention", () => {
    expect(documentPath("org-1", "doc-1", 1)).toBe("org-1/doc-1/v1.pdf");
    expect(documentPath("org-1", "doc-1", 3, true)).toBe("org-1/doc-1/v3-signed.pdf");
    expect(() => documentPath("", "doc-1", 1)).toThrow();
    expect(() => documentPath("org-1", "doc-1", 0)).toThrow();
    expect(() => documentPath("org-1", "doc-1", 1.5)).toThrow();
  });
});

// DDL drift gate (lib/crm.ts precedent): the runtime enums must equal the
// 0008 check-constraint lists — schema drift fails the suite.
describe("0008 DDL gate", () => {
  const ddl = readFileSync(join(__dirname, "../../../supabase/migrations/0008_esign.sql"), "utf8");

  function constraintList(after: string): string[] {
    const idx = ddl.indexOf(after);
    expect(idx).toBeGreaterThan(-1);
    const m = ddl.slice(idx).match(/check \(\w+ in\s*\(([^)]+)\)\)/);
    expect(m).toBeTruthy();
    return m![1].match(/'([^']+)'/g)!.map((s) => s.replace(/'/g, ""));
  }

  it("document statuses match the DDL", () => {
    expect(constraintList("create table if not exists documents")).toEqual([
      ...DOCUMENT_STATUSES,
    ]);
  });
  it("request statuses match the DDL", () => {
    const idx = ddl.indexOf("create table if not exists signature_requests");
    const chunk = ddl.slice(idx);
    const m = chunk.match(/status text not null default 'pending' check \(status in\s*\(([^)]+)\)\)/);
    expect(m).toBeTruthy();
    expect(m![1].match(/'([^']+)'/g)!.map((s) => s.replace(/'/g, ""))).toEqual([
      ...REQUEST_STATUSES,
    ]);
  });
  it("event types match the DDL (0009 superseded the 0008 list)", () => {
    const ddl9 = readFileSync(
      join(__dirname, "../../../supabase/migrations/0009_esign_comms_consent.sql"),
      "utf8"
    );
    const m = ddl9.match(/add constraint signature_events_type_check check \(type in\s*\(([^)]+)\)\)/);
    expect(m).toBeTruthy();
    expect(m![1].match(/'([^']+)'/g)!.map((s) => s.replace(/'/g, ""))).toEqual([...EVENT_TYPES]);
  });
});

describe("consent", () => {
  it("carries the four ESIGN elements", () => {
    // intent, electronic transaction consent, association, retention/copy
    expect(ESIGN_CONSENT_TEXT).toMatch(/intend my electronic signature/);
    expect(ESIGN_CONSENT_TEXT).toMatch(/conduct this transaction electronically/);
    expect(ESIGN_CONSENT_TEXT).toMatch(/associated with this document/);
    expect(ESIGN_CONSENT_TEXT).toMatch(/retain\s+a copy/);
  });
});
