import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countersignCertificateLines,
  countersignLabel,
  countersignState,
  planCountersign,
  type CountersignDoc,
} from "../countersign";

const signed: CountersignDoc = {
  id: "doc-1",
  status: "signed",
  signed_path: "org-1/doc-1/v1-signed.pdf",
  countersigned_at: null,
};
const NOW = "2026-07-23T21:15:00.000Z";

describe("countersignState / label", () => {
  it("is not_signed until the counterparty signs", () => {
    for (const status of ["draft", "sent", "viewed"] as const) {
      expect(countersignState({ ...signed, status })).toBe("not_signed");
    }
  });
  it("is awaiting once signed, complete once countersigned", () => {
    expect(countersignState(signed)).toBe("awaiting");
    expect(countersignState({ ...signed, countersigned_at: NOW })).toBe("complete");
  });
  it("only claims full execution when the fact exists on the row", () => {
    expect(countersignLabel(signed)).toBe("signed · awaiting your countersignature");
    expect(countersignLabel({ ...signed, countersigned_at: NOW })).toBe("fully executed");
    expect(countersignLabel({ ...signed, status: "voided" })).toBe("voided");
  });
});

describe("planCountersign", () => {
  it("plans the patch, the audit event and the stamp source", () => {
    const plan = planCountersign(signed, "req-1", { name: " Rob Acheson ", title: " Managing Member " }, NOW);
    expect(plan.documentPatch).toEqual({
      countersigned_at: NOW,
      countersigner_name: "Rob Acheson",
      countersigner_title: "Managing Member",
      countersigner_email: null,
    });
    expect(plan.event.type).toBe("countersigned");
    expect(plan.event.request_id).toBe("req-1");
    expect(plan.event.at).toBe(NOW);
    expect(plan.event.meta).toMatchObject({ document_id: "doc-1" });
    expect(plan.stampSourcePath).toBe("org-1/doc-1/v1-signed.pdf");
  });

  it("never emits a status change — 'signed' stays terminal", () => {
    const plan = planCountersign(signed, "req-1", { name: "Rob", title: "MM" }, NOW);
    expect(Object.keys(plan.documentPatch)).not.toContain("status");
  });

  it("refuses before the counterparty has signed", () => {
    expect(() =>
      planCountersign({ ...signed, status: "viewed" }, "req-1", { name: "Rob", title: "MM" }, NOW)
    ).toThrow(/has not signed yet/);
  });

  it("refuses a second countersignature (no re-dating an executed agreement)", () => {
    expect(() =>
      planCountersign(
        { ...signed, countersigned_at: "2026-07-23T10:00:00.000Z" },
        "req-1",
        { name: "Someone Else", title: "MM" },
        NOW
      )
    ).toThrow(/already countersigned/);
  });

  it("refuses when there is no stored signed copy to stamp", () => {
    expect(() =>
      planCountersign({ ...signed, signed_path: null }, "req-1", { name: "Rob", title: "MM" }, NOW)
    ).toThrow(/no stored signed copy/);
  });

  it("requires printed name, authority title, request id and a real timestamp", () => {
    expect(() => planCountersign(signed, "req-1", { name: "  ", title: "MM" }, NOW)).toThrow(/name required/);
    expect(() => planCountersign(signed, "req-1", { name: "Rob", title: " " }, NOW)).toThrow(/title\/authority/);
    expect(() => planCountersign(signed, "", { name: "Rob", title: "MM" }, NOW)).toThrow(/request_id/);
    expect(() => planCountersign(signed, "req-1", { name: "Rob", title: "MM" }, "nope")).toThrow(/bad timestamp/);
  });

  it("keeps the email optional and normalized", () => {
    const plan = planCountersign(
      signed,
      "req-1",
      { name: "Rob", title: "MM", email: "  rob@aivoicetech.io " },
      NOW
    );
    expect(plan.documentPatch.countersigner_email).toBe("rob@aivoicetech.io");
  });
});

describe("countersignCertificateLines", () => {
  it("emits nothing until countersigned", () => {
    expect(countersignCertificateLines(signed)).toEqual([]);
  });
  it("mirrors the signer block for the court-facing certificate", () => {
    expect(
      countersignCertificateLines({
        ...signed,
        countersigned_at: NOW,
        countersigner_name: "Rob Acheson",
        countersigner_title: "Managing Member",
      })
    ).toEqual([
      "MLE representative: Rob Acheson, Managing Member",
      `Countersigned (server-stamped): ${NOW}`,
    ]);
  });
});

// The columns the planner writes must exist in the migration that ships with it.
describe("0010 DDL gate", () => {
  const ddl = readFileSync(
    join(__dirname, "../../../supabase/migrations/0010_esign_countersign.sql"),
    "utf8"
  );
  it("adds every documents column the planner patches", () => {
    for (const col of [
      "countersigned_at",
      "countersigner_name",
      "countersigner_title",
      "countersigner_email",
      "countersigned_path",
      "sha256_countersigned",
    ]) {
      expect(ddl).toContain(`add column if not exists ${col}`);
    }
  });
  it("does not widen the document status enum", () => {
    expect(ddl).not.toMatch(/documents_status_check|status text not null default/);
  });
});
