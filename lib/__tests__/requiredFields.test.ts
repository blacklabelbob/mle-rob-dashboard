// PRD Task 1.9 DoD: "Save rejected if any required field missing." The rules
// are pinned here field-by-field on the pure validator, then the DoD itself is
// proven through the REAL POST handler on a temp file store (Q26 harness
// pattern): a complete manual log saves, and stripping ANY single mandatory
// field rejects the save with that exact field named.
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { validateManualLog } from "../activities/requiredFields";
import { localCrmPath } from "../storage/fileStore";

const complete = () => ({
  personId: "demo-jake-1",
  type: "call",
  occurredAt: "2026-07-22T15:00:00Z",
  sourceContext: {
    referral_source: "none",
    door_opened: { opened: false },
    next_step: { description: "send quote", due_date: "2026-07-24" },
    stage_change: "none",
  },
});

describe("validateManualLog (Task 1.9 mandatory fields)", () => {
  it("accepts a complete manual log", () => {
    expect(validateManualLog(complete())).toEqual({ ok: true });
  });

  it("accepts orgId as the contact anchor", () => {
    const c = complete() as Record<string, unknown>;
    delete c.personId;
    c.orgId = "org-proplogix";
    expect(validateManualLog(c)).toEqual({ ok: true });
  });

  it("requires who when door was opened", () => {
    const c = complete();
    c.sourceContext.door_opened = { opened: true } as never;
    expect(validateManualLog(c)).toEqual({
      ok: false,
      missing: ["sourceContext.door_opened.by"],
    });
    c.sourceContext.door_opened = { opened: true, by: "Jonathan Polk" } as never;
    expect(validateManualLog(c)).toEqual({ ok: true });
  });

  const strip: Array<[string, (c: ReturnType<typeof complete>) => void, string]> = [
    ["date", (c) => delete (c as Record<string, unknown>).occurredAt, "occurredAt"],
    ["contact", (c) => delete (c as Record<string, unknown>).personId, "personId|orgId"],
    ["channel", (c) => delete (c as Record<string, unknown>).type, "type"],
    ["referral source", (c) => delete (c.sourceContext as Record<string, unknown>).referral_source, "sourceContext.referral_source"],
    ["door-opened", (c) => delete (c.sourceContext as Record<string, unknown>).door_opened, "sourceContext.door_opened.opened"],
    ["next step", (c) => delete (c.sourceContext as Record<string, unknown>).next_step, "sourceContext.next_step.description"],
    ["stage change", (c) => delete (c.sourceContext as Record<string, unknown>).stage_change, "sourceContext.stage_change"],
  ];
  for (const [label, mutate, field] of strip) {
    it(`rejects when ${label} is missing`, () => {
      const c = complete();
      mutate(c);
      const r = validateManualLog(c);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.missing).toContain(field);
    });
  }

  it("rejects status_change as a manual channel (server-written only, Task 4.7)", () => {
    const c = complete() as Record<string, unknown>;
    c.type = "status_change";
    const r = validateManualLog(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("type");
  });

  it("rejects a malformed next_step due_date", () => {
    const c = complete();
    c.sourceContext.next_step = { description: "call back", due_date: "tomorrow" } as never;
    const r = validateManualLog(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(["sourceContext.next_step.due_date"]);
  });

  it("reports ALL missing fields at once, in spec order", () => {
    const r = validateManualLog({});
    expect(r).toEqual({
      ok: false,
      missing: [
        "occurredAt",
        "personId|orgId",
        "type",
        "sourceContext.referral_source",
        "sourceContext.door_opened.opened",
        "sourceContext.next_step.description",
        "sourceContext.next_step.due_date",
        "sourceContext.stage_change",
      ],
    });
  });
});

describe("POST /api/admin/activities (Task 1.9 DoD through the real route)", () => {
  const tmp = path.join(os.tmpdir(), `mle-req-fields-${process.pid}.json`);
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    process.env.STORAGE_SOURCE = "file";
    process.env.CRM_DATA_PATH = tmp;
    await fs.writeFile(
      tmp,
      JSON.stringify({ people: [], edges: [], verticals: [], projects: [] })
    );
    ({ POST } = (await import("../../app/api/admin/activities/route")) as unknown as {
      POST: (req: Request) => Promise<Response>;
    });
  });

  const post = (body: unknown) =>
    POST(
      new Request("http://test/api/admin/activities", {
        method: "POST",
        body: JSON.stringify(body),
      }) as never
    );

  it("saves a complete manual log (201, persisted)", async () => {
    const res = await post(complete());
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const saved = JSON.parse(await fs.readFile(localCrmPath(), "utf8"));
    expect((saved.activities ?? []).some((a: { id: string }) => a.id === json.id)).toBe(true);
  });

  it("REJECTS the save when a required field is missing (DoD)", async () => {
    const c = complete();
    delete (c.sourceContext as Record<string, unknown>).next_step;
    const res = await post(c);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.missing).toContain("sourceContext.next_step.description");
    const saved = JSON.parse(await fs.readFile(localCrmPath(), "utf8"));
    expect((saved.activities ?? []).length).toBe(1); // only the earlier good row
  });

  it("rejects non-manual sources (webhooks own those)", async () => {
    const res = await post({ ...complete(), source: "aidre" });
    expect(res.status).toBe(400);
  });
});
