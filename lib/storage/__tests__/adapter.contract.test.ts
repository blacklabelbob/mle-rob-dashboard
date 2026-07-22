import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, Deal, Task } from "@/lib/types";
import type { StorageAdapter } from "../adapter";

// Task 2.3 DoD: BOTH adapters pass this identical contract suite. The file
// store runs against a temp CRM_DATA_PATH; the supabase store runs against an
// in-memory fake of the PostgREST query surface it uses (from/select/eq/order/
// upsert, thenable like the real builder) — the row↔type mappers in lib/crm.ts
// are exercised for real, and they're separately gate-tested against the 0005
// DDL in lib/__tests__/crm.test.ts.

const h = vi.hoisted(() => {
  const tables: Record<string, any[]> = {};
  function query(rows: any[]) {
    let filtered = rows.slice();
    const q: any = {
      eq(col: string, val: unknown) {
        filtered = filtered.filter((r) => r[col] === val);
        return q;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        const dir = opts?.ascending === false ? -1 : 1;
        filtered.sort((a, b) => dir * String(a[col]).localeCompare(String(b[col])));
        return q;
      },
      then(onFulfilled: any, onRejected: any) {
        return Promise.resolve({ data: filtered, error: null }).then(onFulfilled, onRejected);
      },
    };
    return q;
  }
  const fake = {
    from(table: string) {
      const rows = (tables[table] ??= []);
      return {
        select: (_cols?: string) => query(rows),
        upsert: async (row: any) => {
          const i = rows.findIndex((r) => r.id === row.id);
          if (i >= 0) rows[i] = row;
          else rows.push(row);
          return { error: null };
        },
      };
    },
  };
  return { fake, tables };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: () => h.fake }));

import { fileStore } from "../fileStore";
import { supabaseStore } from "../supabaseStore";

const T1 = "2026-07-01T00:00:00Z";
const T2 = "2026-07-02T00:00:00Z";
const T3 = "2026-07-03T00:00:00Z";

const deal = (over: Partial<Deal> = {}): Deal => ({
  id: "d1",
  personId: "caleb",
  name: "CG reroof",
  stage: "quote_sent",
  value: 45000,
  referralSourced: true,
  keyDates: { signed: "2026-06-20" },
  bookProtected: false,
  createdAt: T2,
  updatedAt: T2,
  ...over,
});

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: "a1",
  personId: "caleb",
  type: "call",
  source: "manual",
  sourceContext: {},
  bookProtected: false,
  occurredAt: T2,
  createdAt: T2,
  ...over,
});

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  personId: "caleb",
  title: "Send quote",
  status: "open",
  bookProtected: false,
  createdAt: T1,
  updatedAt: T1,
  ...over,
});

function contractSuite(label: string, adapter: StorageAdapter, reset: () => Promise<void>) {
  describe(`${label} adapter contract`, () => {
    beforeEach(reset);

    it("lists are empty before any write", async () => {
      expect(await adapter.listDeals()).toEqual([]);
      expect(await adapter.listActivities()).toEqual([]);
      expect(await adapter.listTasks()).toEqual([]);
    });

    it("deal round-trips with field fidelity (numbers stay numbers, absent stays undefined)", async () => {
      await adapter.upsertDeal(deal());
      const [d] = await adapter.listDeals();
      expect(d).toMatchObject({
        id: "d1",
        personId: "caleb",
        name: "CG reroof",
        stage: "quote_sent",
        referralSourced: true,
        bookProtected: false,
        createdAt: T2,
      });
      expect(d.value).toBe(45000);
      expect(typeof d.value).toBe("number");
      expect(d.keyDates).toEqual({ signed: "2026-06-20" });
      expect(d.orgId).toBeUndefined();
      expect(d.routingLane).toBeUndefined();
      expect(d.notes).toBeUndefined();
    });

    it("upsert with an existing id updates in place — no duplicate row", async () => {
      await adapter.upsertDeal(deal());
      await adapter.upsertDeal(deal({ stage: "negotiating", updatedAt: T3 }));
      const deals = await adapter.listDeals();
      expect(deals).toHaveLength(1);
      expect(deals[0].stage).toBe("negotiating");
      expect(deals[0].updatedAt).toBe(T3);
    });

    it("deals come back ordered by createdAt ascending", async () => {
      await adapter.upsertDeal(deal({ id: "d-late", createdAt: T3, updatedAt: T3 }));
      await adapter.upsertDeal(deal({ id: "d-early", createdAt: T1, updatedAt: T1 }));
      expect((await adapter.listDeals()).map((d) => d.id)).toEqual(["d-early", "d-late"]);
    });

    it("activities order by occurredAt and filter by person/org/deal anchors", async () => {
      await adapter.upsertActivity(activity({ id: "a-mid", occurredAt: T2 }));
      await adapter.upsertActivity(activity({ id: "a-first", dealId: "d1", occurredAt: T1 }));
      await adapter.upsertActivity(
        activity({ id: "a-org", personId: undefined, orgId: "cg-roofing", occurredAt: T3 })
      );

      expect((await adapter.listActivities()).map((a) => a.id)).toEqual([
        "a-first",
        "a-mid",
        "a-org",
      ]);
      expect((await adapter.listActivities({ personId: "caleb" })).map((a) => a.id)).toEqual([
        "a-first",
        "a-mid",
      ]);
      expect((await adapter.listActivities({ dealId: "d1" })).map((a) => a.id)).toEqual([
        "a-first",
      ]);
      expect((await adapter.listActivities({ orgId: "cg-roofing" })).map((a) => a.id)).toEqual([
        "a-org",
      ]);
      expect(
        (await adapter.listActivities({ personId: "caleb", dealId: "d1" })).map((a) => a.id)
      ).toEqual(["a-first"]);
      expect(await adapter.listActivities({ personId: "nobody" })).toEqual([]);
    });

    it("activity sourceContext jsonb round-trips", async () => {
      await adapter.upsertActivity(
        activity({ source: "n8n", sourceContext: { channel: "email", messageId: "m-1" } })
      );
      const [a] = await adapter.listActivities();
      expect(a.source).toBe("n8n");
      expect(a.sourceContext).toEqual({ channel: "email", messageId: "m-1" });
    });

    it("tasks filter by status and reflect status updates", async () => {
      await adapter.upsertTask(task());
      await adapter.upsertTask(task({ id: "t2", status: "done", createdAt: T2, updatedAt: T2 }));

      expect((await adapter.listTasks()).map((t) => t.id)).toEqual(["t1", "t2"]);
      expect((await adapter.listTasks({ status: "open" })).map((t) => t.id)).toEqual(["t1"]);

      await adapter.upsertTask(task({ status: "done", updatedAt: T3 }));
      expect(await adapter.listTasks({ status: "open" })).toEqual([]);
      expect(await adapter.listTasks({ status: "done" })).toHaveLength(2);
    });
  });
}

const tmpCrm = path.join(os.tmpdir(), `mle-crm-contract-${process.pid}.json`);

beforeAll(() => {
  process.env.CRM_DATA_PATH = tmpCrm;
  // createClient is mocked — values only need to exist for db()'s config check.
  process.env.SUPABASE_URL ??= "http://fake.supabase.local";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "fake-key";
});

contractSuite("file", fileStore, async () => {
  await fs.rm(tmpCrm, { force: true });
});

contractSuite("supabase", supabaseStore, async () => {
  for (const rows of Object.values(h.tables)) rows.length = 0;
});
