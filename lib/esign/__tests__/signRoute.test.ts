import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../hash";
import { mintToken } from "../token";
import type { DocumentRow, RequestRow } from "../db";

// Critic-rob punch #1: the single-use latch is consumed BEFORE the stamped
// PDF exists. These tests simulate stamp/upload failure and pin the recovery
// contract: latch REVERTED to the pre-latch snapshot (link lives again), a
// high flag filed, honest 500 to the signer, NO document update — a failure
// can neither lose a signature (nothing durable existed) nor allow a
// double-sign (the atomic latch is simply re-armed). Also pins punch #6's
// server half: consumer signatures without render evidence are refused
// BEFORE the latch.

const TOKEN = mintToken();
const ORIGINAL = Buffer.from("%PDF-original-bytes");

function requestRow(over: Partial<RequestRow> = {}): RequestRow {
  return {
    id: "req-t1",
    document_id: "doc-t1",
    token_hash: TOKEN.tokenHash,
    expires_at: "2099-01-01T00:00:00Z",
    channel: "email",
    sent_to: "signer@example.com",
    signer_name: "Sam Signer",
    signer_email: "signer@example.com",
    signer_ip: null,
    signer_user_agent: null,
    consent_at: null,
    viewed_at: "2026-07-23T11:00:00Z",
    signed_at: null,
    voided_at: null,
    sha256_at_sign: null,
    presend_answers: {},
    signer_type: "business",
    status: "viewed",
    created_at: "2026-07-23T10:00:00Z",
    updated_at: "2026-07-23T11:00:00Z",
    ...over,
  };
}

function documentRow(): DocumentRow {
  return {
    id: "doc-t1",
    person_id: "person-t1",
    org_id: null,
    deal_id: null,
    title: "Test Agreement",
    phase: "phase-1",
    storage_path: "person-t1/doc-t1/v1.pdf",
    sha256_at_upload: sha256Hex(ORIGINAL),
    sha256_signed: null,
    signed_path: null,
    version: 1,
    status: "viewed",
    supersedes_id: null,
    created_by: null,
    created_at: "2026-07-23T09:00:00Z",
    updated_at: "2026-07-23T11:00:00Z",
  };
}

// Minimal thenable PostgREST fake: records every call; per-(table.op) result
// queues, defaulting to success shapes.
type FakeResult = { data?: unknown; error?: { message: string } | null };
interface Call {
  table: string;
  op: string;
  payload: unknown;
}

function makeFakeDb(results: Record<string, FakeResult[]>, calls: Call[]) {
  return () => ({
    from(table: string) {
      const call: Call = { table, op: "", payload: undefined };
      const qb = {
        update(p: unknown) {
          call.op = "update";
          call.payload = p;
          return qb;
        },
        insert(p: unknown) {
          call.op = "insert";
          call.payload = p;
          return qb;
        },
        select: () => qb,
        eq: () => qb,
        is: () => qb,
        maybeSingle: () => qb,
        then(res: (v: FakeResult) => unknown, rej?: (e: unknown) => unknown) {
          calls.push(call);
          const queue = results[`${table}.${call.op}`];
          const r: FakeResult =
            queue && queue.length > 0 ? queue.shift()! : { data: [{ id: "x" }], error: null };
          return Promise.resolve(r).then(res, rej);
        },
      };
      return qb;
    },
  });
}

describe("POST /api/esign/sign — post-latch failure recovery", () => {
  let calls: Call[];
  let uploaded: string[];

  function mockAll(opts: {
    stampFails?: boolean;
    uploadFails?: boolean;
    dbResults?: Record<string, FakeResult[]>;
    request?: RequestRow;
  }) {
    calls = [];
    uploaded = [];
    vi.doMock("@/lib/esign/db", () => ({
      getRequestByTokenHash: async () => ({ request: opts.request ?? requestRow(), document: documentRow() }),
      esignDb: makeFakeDb(opts.dbResults ?? {}, calls),
      insertEvent: async () => undefined,
      listEvents: async () => [],
      anchorIdOf: () => "person-t1",
    }));
    vi.doMock("@/lib/esign/storage", () => ({
      documentPath: (a: string, d: string, v: number, signed?: boolean) =>
        `${a}/${d}/v${v}${signed ? "-signed" : ""}.pdf`,
      downloadPdf: async () => new Uint8Array(ORIGINAL),
      uploadPdf: async (path: string) => {
        if (opts.uploadFails) throw new Error("upload exploded");
        uploaded.push(path);
      },
      signedUrlFor: async () => "https://example.com/signed-url",
      downloadFilename: (title: string, suffix = "signed") => `${title} (${suffix}).pdf`,
    }));
    vi.doMock("@/lib/esign/stamp", () => ({
      stampAndCertify: async () => {
        if (opts.stampFails) throw new Error("stamp exploded");
        return new Uint8Array(Buffer.from("%PDF-signed-bytes"));
      },
    }));
    vi.doMock("@/lib/esign/sender", () => ({
      ROB_COPY_ADDRESS: "rob@aivoicetech.io",
      esignSenderEnv: () => ({}),
      esignSenderConfigured: () => false,
      deliverEsignEmail: async () => ({ sent: false, reason: "test" }),
      signedCopyEmail: () => ({ subject: "s", text: "t" }),
    }));
    vi.doMock("@/lib/storage", () => ({
      getStore: () => ({ upsertActivity: async () => undefined }),
    }));
  }

  afterEach(() => {
    vi.doUnmock("@/lib/esign/db");
    vi.doUnmock("@/lib/esign/storage");
    vi.doUnmock("@/lib/esign/stamp");
    vi.doUnmock("@/lib/esign/sender");
    vi.doUnmock("@/lib/storage");
    vi.resetModules();
  });
  beforeEach(() => vi.resetModules());

  const post = async (body: Record<string, unknown>) => {
    const { POST } = await import("../../../app/api/esign/sign/route");
    return POST(
      new Request("http://local/api/esign/sign", {
        method: "POST",
        body: JSON.stringify(body),
      }) as never
    );
  };

  const validBody = {
    token: TOKEN.token,
    consent: true,
    signerName: "Sam Signer",
    signerEmail: "signer@example.com",
    typedName: "Sam Signer",
  };

  it("stamp failure → latch reverted to pre-latch snapshot, high flag, honest 500, no doc update", async () => {
    mockAll({ stampFails: true });
    const res = await post(validBody);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("nothing was recorded");
    expect(body.error).toContain("still valid");

    const reqUpdates = calls.filter((c) => c.table === "signature_requests" && c.op === "update");
    expect(reqUpdates).toHaveLength(2); // latch + revert
    const revert = reqUpdates[1].payload as Record<string, unknown>;
    expect(revert.signed_at).toBeNull(); // back to the pre-latch snapshot
    expect(revert.consent_at).toBeNull();
    expect(revert.status).toBe("viewed");
    expect(revert.sha256_at_sign).toBeNull();

    const flags = calls.filter((c) => c.table === "flags" && c.op === "insert");
    expect(flags).toHaveLength(1);
    const flag = flags[0].payload as Record<string, unknown>;
    expect(flag.severity).toBe("high");
    expect(flag.title).toContain("failed after latch");
    expect(String(flag.detail)).toContain("REVERTED");

    expect(calls.filter((c) => c.table === "documents")).toHaveLength(0); // never flipped
    expect(uploaded).toHaveLength(0);
  });

  it("upload failure → same recovery contract", async () => {
    mockAll({ uploadFails: true });
    const res = await post(validBody);
    expect(res.status).toBe(500);
    expect(calls.filter((c) => c.table === "signature_requests" && c.op === "update")).toHaveLength(2);
    expect(calls.filter((c) => c.table === "flags" && c.op === "insert")).toHaveLength(1);
    expect(calls.filter((c) => c.table === "documents")).toHaveLength(0);
  });

  it("revert itself failing → flag says the link is stuck, signer told to get a fresh link", async () => {
    mockAll({
      stampFails: true,
      dbResults: {
        "signature_requests.update": [
          { data: [{ id: "req-t1" }], error: null }, // latch wins
          { data: [], error: null }, // revert matches 0 rows
        ],
      },
    });
    const res = await post(validBody);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("fresh signing link");
    const flag = calls.find((c) => c.table === "flags")!.payload as Record<string, unknown>;
    expect(String(flag.detail)).toContain("stuck consumed");
  });

  it("happy path still completes end-to-end against the fakes (200 + doc flip + signed upload)", async () => {
    mockAll({});
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(uploaded).toEqual(["person-t1/doc-t1/v1-signed.pdf"]);
    const docUpdate = calls.find((c) => c.table === "documents" && c.op === "update")!;
    expect((docUpdate.payload as Record<string, unknown>).status).toBe("signed");
    expect(calls.filter((c) => c.table === "flags")).toHaveLength(0); // no failure flags
  });

  it("consumer without render evidence → 400 BEFORE the latch (punch #6 server half)", async () => {
    mockAll({ request: requestRow({ signer_type: "consumer" }) });
    const res = await post(validBody); // no renderEvidence supplied
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("rendered in your browser");
    expect(calls).toHaveLength(0); // nothing written at all
  });

  it("consumer WITH render evidence proceeds (sanity that the gate is exact)", async () => {
    mockAll({ request: requestRow({ signer_type: "consumer" }) });
    const res = await post({
      ...validBody,
      renderEvidence: {
        pdfRenderedAt: "2026-07-23T11:59:00Z",
        disclosureShownAt: "2026-07-23T11:58:00Z",
        viewport: "390x844",
      },
    });
    expect(res.status).toBe(200);
  });
});
