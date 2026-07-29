// Q71 Phase 2 item 5 — the CRM two-file seam.
//
// The guarantee under test is not "the script points elsewhere", it is that the
// COMMITTED file is unreachable by any write path. So the committed file is
// byte-compared before and after a write, rather than the write path merely
// being inspected.
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileStore, localCrmPath } from "../fileStore";
import type { Deal } from "@/lib/types";

const dir = path.join(os.tmpdir(), `mle-crm-overlay-${process.pid}`);
const committed = path.join(dir, "crm.json");

const deal = (id: string, name: string): Deal => ({
  id,
  personId: "P-1001",
  name,
  stage: "quote_sent",
  referralSourced: false,
  keyDates: {},
  bookProtected: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

const writeJson = (p: string, data: unknown) => fs.writeFile(p, JSON.stringify(data, null, 2), "utf8");

let prev: string | undefined;

beforeEach(async () => {
  prev = process.env.CRM_DATA_PATH;
  process.env.CRM_DATA_PATH = committed;
  await fs.mkdir(dir, { recursive: true });
  await fs.rm(committed, { force: true });
  await fs.rm(localCrmPath(), { force: true });
});

afterEach(async () => {
  if (prev === undefined) delete process.env.CRM_DATA_PATH;
  else process.env.CRM_DATA_PATH = prev;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("fileStore CRM overlay", () => {
  it("serves the committed scaffolding when no local overlay exists", async () => {
    await writeJson(committed, { deals: [deal("d-committed", "Scaffolding")], activities: [], tasks: [] });
    expect((await fileStore.listDeals()).map((d) => d.id)).toEqual(["d-committed"]);
  });

  it("prefers the local overlay when it exists", async () => {
    await writeJson(committed, { deals: [deal("d-committed", "Scaffolding")], activities: [], tasks: [] });
    await writeJson(localCrmPath(), { deals: [deal("d-local", "Real pull")], activities: [], tasks: [] });
    expect((await fileStore.listDeals()).map((d) => d.id)).toEqual(["d-local"]);
  });

  it("re-resolves per call in BOTH directions", async () => {
    await writeJson(committed, { deals: [deal("d-committed", "Scaffolding")], activities: [], tasks: [] });
    expect((await fileStore.listDeals())[0].id).toBe("d-committed");
    await writeJson(localCrmPath(), { deals: [deal("d-local", "Real pull")], activities: [], tasks: [] });
    expect((await fileStore.listDeals())[0].id).toBe("d-local");
    await fs.rm(localCrmPath(), { force: true });
    expect((await fileStore.listDeals())[0].id).toBe("d-committed");
  });

  it("writes land in the overlay and leave the committed file byte-identical", async () => {
    await writeJson(committed, { deals: [deal("d-committed", "Scaffolding")], activities: [], tasks: [] });
    const before = await fs.readFile(committed, "utf8");

    await fileStore.upsertDeal(deal("d-new", "Written at runtime"));

    expect(await fs.readFile(committed, "utf8")).toBe(before);
    const overlay = JSON.parse(await fs.readFile(localCrmPath(), "utf8"));
    expect(overlay.deals.map((d: Deal) => d.id).sort()).toEqual(["d-committed", "d-new"]);
  });

  it("a corrupt overlay fails LOUD rather than silently serving demo rows", async () => {
    await writeJson(committed, { deals: [deal("d-committed", "Scaffolding")], activities: [], tasks: [] });
    await fs.writeFile(localCrmPath(), "{ not json", "utf8");
    // Falling back here would show generated demo deals while a real local pull
    // sits half-written on disk — the single most dangerous silent success.
    await expect(fileStore.listDeals()).rejects.toThrow();
  });

  it("still returns empty when neither file exists", async () => {
    expect(await fileStore.listDeals()).toEqual([]);
    expect(await fileStore.listActivities()).toEqual([]);
    expect(await fileStore.listTasks()).toEqual([]);
  });
});
