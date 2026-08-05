import { describe, expect, it } from "vitest";

import {
  buildRecoveryWorklist,
  FIND_MEETING,
  MEASURED_DEPTH_CAP,
  type MeasuredRow,
} from "../recoveryWorklist";

function row(over: Partial<MeasuredRow> & Pick<MeasuredRow, "verdict">): MeasuredRow {
  return {
    id: "page-1",
    title: "A meeting",
    day: "2026-07-28",
    url: "https://notion.so/page-1",
    body: { blocks: 1, chars: 0 },
    ...over,
  };
}

describe("buildRecoveryWorklist", () => {
  it("sends a page with readable text to a plain --page read", () => {
    const { steps } = buildRecoveryWorklist([
      row({ verdict: "body-present", body: { blocks: 531, chars: 101_000 } }),
    ]);
    expect(steps[0].action).toBe("read-page");
    expect(steps[0].command).toBe(`${FIND_MEETING} --page https://notion.so/page-1`);
    expect(steps[0].why).toContain("101000 chars");
    expect(steps[0].why).toContain("unread, not unexplainable");
  });

  it("re-reads a container-only row with --deep instead of calling it empty", () => {
    const { steps, atMostUnrecoverable } = buildRecoveryWorklist([
      row({ verdict: "container-only", body: { blocks: 3, chars: 0 } }),
    ]);
    expect(steps[0].action).toBe("deep-read-page");
    expect(steps[0].command).toBe(`${FIND_MEETING} --page https://notion.so/page-1 --deep`);
    expect(steps[0].why).toContain(String(MEASURED_DEPTH_CAP));
    // The whole point: blocks-with-no-text may never be counted as a possible absence.
    expect(atMostUnrecoverable).toBe(0);
  });

  it("sweeps by date only when the page has no blocks at all", () => {
    const { steps } = buildRecoveryWorklist([
      row({ verdict: "body-empty", body: { blocks: 0, chars: 0 }, day: "2026-06-16" }),
    ]);
    expect(steps[0].action).toBe("sweep-by-date");
    expect(steps[0].command).toBe(`${FIND_MEETING} --date 2026-06-16`);
  });

  it("says a derived date is derived so a miss is not trusted blindly", () => {
    const { steps } = buildRecoveryWorklist([
      row({ verdict: "body-empty", body: { blocks: 0, chars: 0 }, dayIsDerived: true }),
    ]);
    expect(steps[0].why).toContain("read off the row's own title");
  });

  it("asks for identification, not a read, when there is no day to sweep with", () => {
    const { steps } = buildRecoveryWorklist([
      row({ verdict: "body-empty", body: { blocks: 0, chars: 0 }, day: "" }),
    ]);
    expect(steps[0].action).toBe("identify-first");
    expect(steps[0].command).toBe("");
  });

  it("never inherits 'empty' from a measurement error", () => {
    const { steps, atMostUnrecoverable } = buildRecoveryWorklist([
      row({ verdict: "unmeasured", body: undefined, error: "Notion GET -> 429" }),
    ]);
    expect(steps[0].action).toBe("re-measure");
    expect(steps[0].why).toContain("429");
    expect(atMostUnrecoverable).toBe(0);
  });

  it("addresses a page by uuid when the row carries no url", () => {
    const { steps } = buildRecoveryWorklist([
      row({ verdict: "body-present", url: "", id: "abc-123", body: { blocks: 2, chars: 40 } }),
    ]);
    expect(steps[0].command).toBe(`${FIND_MEETING} --page abc-123`);
  });

  it("orders certain reads before sweeps, and is stable on the same input", () => {
    const input: MeasuredRow[] = [
      row({ id: "e", verdict: "body-empty", body: { blocks: 0, chars: 0 }, day: "2026-07-01" }),
      row({ id: "c", verdict: "container-only", day: "2026-07-02" }),
      row({ id: "p1", verdict: "body-present", day: "2026-07-03", body: { blocks: 9, chars: 90 } }),
      row({ id: "p2", verdict: "body-present", day: "2026-07-20", body: { blocks: 9, chars: 90 } }),
      row({ id: "u", verdict: "unmeasured", body: undefined, error: "boom" }),
    ];
    const first = buildRecoveryWorklist(input);
    expect(first.steps.map((s) => s.row.id)).toEqual(["p2", "p1", "c", "e", "u"]);
    expect(buildRecoveryWorklist(input).steps.map((s) => s.row.id)).toEqual(
      first.steps.map((s) => s.row.id),
    );
  });

  it("counts the ceiling of unrecoverable rows, not the pile", () => {
    const { counts, atMostUnrecoverable } = buildRecoveryWorklist([
      row({ id: "a", verdict: "body-present", body: { blocks: 1, chars: 10 } }),
      row({ id: "b", verdict: "container-only" }),
      row({ id: "c", verdict: "container-only" }),
      row({ id: "d", verdict: "body-empty", body: { blocks: 0, chars: 0 } }),
      row({ id: "e", verdict: "body-empty", body: { blocks: 0, chars: 0 }, day: "" }),
    ]);
    expect(counts.rows).toBe(5);
    expect(counts["read-page"]).toBe(1);
    expect(counts["deep-read-page"]).toBe(2);
    expect(atMostUnrecoverable).toBe(2);
  });

  it("returns an empty list, not a crash, when nothing was measured", () => {
    const { steps, counts, atMostUnrecoverable } = buildRecoveryWorklist([]);
    expect(steps).toEqual([]);
    expect(counts.rows).toBe(0);
    expect(atMostUnrecoverable).toBe(0);
  });
});
