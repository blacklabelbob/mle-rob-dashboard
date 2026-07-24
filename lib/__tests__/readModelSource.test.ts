import { describe, expect, it } from "vitest";
import {
  READABLE_VIEWS,
  allReadsFailed,
  assertReadable,
  columnList,
  fetchPanels,
  type ViewReader,
} from "../readModel/source";
import { getReadModel } from "../readModel/contract";

// MC.12 leg 2: the read seam. The guarantee under test is the one MC.8 wrote
// down and this layer has to actually hold — a panel reads rm_* views and
// nothing else, asks only for contract columns, and never converts a failed
// read into an innocent-looking empty panel.

// Verbatim prod row shapes (same fixtures as readModelPanels.test.ts uses,
// trimmed to what each builder reads).
const PIPELINE_ROWS = [
  {
    deal_id: "d1",
    deal_name: "The Title Base — Phase 1",
    stage: "paid",
    value: 2000,
    owner: "rob",
    counterparty_name: "Trent Brands",
    stage_entered_at: "2026-07-23T00:00:00Z",
  },
  {
    deal_id: "d2",
    deal_name: "Open deal",
    stage: "quote_sent",
    value: 5000,
    owner: "rob",
    counterparty_name: "Someone",
    stage_entered_at: "2026-07-20T00:00:00Z",
  },
];

const ACTION_ROWS = [
  {
    task_id: "t1",
    title: "Send agreement",
    detail: null,
    status: "open",
    due_date: "2026-07-20",
    assigned_to: "rob",
    deal_id: "d2",
    person_id: null,
    created_at: "2026-07-18T00:00:00Z",
  },
];

const ESIGN_ROWS: Record<string, unknown>[] = [];

function readerFor(
  data: Partial<Record<string, Record<string, unknown>[]>>,
  errors: Partial<Record<string, string>> = {}
): ViewReader {
  return async (view) => ({
    rows: data[view] ?? [],
    error: errors[view] ?? null,
  });
}

describe("read-model seam whitelist", () => {
  it("accepts every creatable read model", () => {
    for (const view of READABLE_VIEWS) expect(assertReadable(view)).toBe(view);
  });

  it("refuses base tables — the exact names a panel would reach for", () => {
    for (const table of ["deals", "people", "tasks", "documents", "signature_requests"]) {
      expect(() => assertReadable(table)).toThrow(/not a readable view/);
    }
  });

  it("refuses read models with no backing store", () => {
    expect(() => assertReadable("rm_invoices_ar")).toThrow(/not a readable view/);
    expect(() => assertReadable("rm_delivery_phases")).toThrow(/not a readable view/);
  });

  it("asks for exactly the contract's columns, in contract order", () => {
    for (const view of READABLE_VIEWS) {
      expect(columnList(view)).toBe(
        getReadModel(view).columns.map((c) => c.name).join(",")
      );
    }
    expect(columnList("rm_pipeline")).toContain("deal_id,deal_name,stage,value");
  });
});

describe("fetchPanels", () => {
  it("shapes live rows and names the blocked models", async () => {
    const payload = await fetchPanels(
      readerFor({
        rm_pipeline: PIPELINE_ROWS,
        rm_action_items: ACTION_ROWS,
        rm_esign_status: ESIGN_ROWS,
      }),
      "2026-07-24"
    );

    expect(payload.errors).toEqual([]);
    expect(payload.pipeline?.status).toBe("live");
    expect(payload.pipeline?.totals.wonValue).toBe(2000);
    expect(payload.pipeline?.totals.openValue).toBe(5000);
    expect(payload.actionItems?.totals.overdue).toBe(1);
    // Zero documents on prod today — empty, with the contract's reason.
    expect(payload.esign?.status).toBe("empty");
    expect(payload.esign?.note).toMatch(/ZERO documents/);
    expect(payload.unavailable.map((p) => p.id).sort()).toEqual([
      "rm_delivery_phases",
      "rm_invoices_ar",
    ]);
    for (const panel of payload.unavailable) {
      expect(panel.status).toBe("unavailable");
      expect(panel.unblockedBy).toBeTruthy();
    }
    expect(allReadsFailed(payload)).toBe(false);
  });

  it("reports a failed read as a failure, never as an empty panel", async () => {
    const payload = await fetchPanels(
      readerFor(
        { rm_action_items: ACTION_ROWS, rm_esign_status: ESIGN_ROWS },
        { rm_pipeline: 'relation "rm_pipeline" does not exist' }
      ),
      "2026-07-24"
    );

    expect(payload.pipeline).toBeNull();
    expect(payload.errors).toEqual([
      { id: "rm_pipeline", message: 'relation "rm_pipeline" does not exist' },
    ]);
    expect(payload.actionItems?.status).toBe("live");
    expect(allReadsFailed(payload)).toBe(false);
  });

  it("flags a total read failure so the route can answer 502", async () => {
    const payload = await fetchPanels(
      readerFor(
        {},
        {
          rm_pipeline: "permission denied",
          rm_action_items: "permission denied",
          rm_esign_status: "permission denied",
        }
      ),
      "2026-07-24"
    );
    expect(payload.errors).toHaveLength(3);
    expect(allReadsFailed(payload)).toBe(true);
  });
});
