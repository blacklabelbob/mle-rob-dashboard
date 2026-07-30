import { describe, expect, it } from "vitest";
import { exemptionReason, findMdGates, parseQueueItems } from "../queue/mdGates";

// The real defect, reduced: Q46 sat open for a week gated on a .md Rob never opened.
const Q46_SHAPED = `- [ ] Q46. **Rep cockpit wiring (from docs/research/REP-COCKPIT-RESEARCH-2026-07-23.md — Rob-requested research, awaiting his morning read):** headline finding = wiring, not new systems.
  - ✅ 7/23 driver: R1 COMPLETE. R2 onward still awaiting Rob's research nod.
`;

describe("parseQueueItems", () => {
  it("attaches indented continuation lines to the item above them", () => {
    const items = parseQueueItems(Q46_SHAPED);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("Q46");
    expect(items[0].text).toContain("R1 COMPLETE");
  });

  it("reads the checkbox state and the 1-indexed line number", () => {
    const items = parseQueueItems("## Head\n\n- [x] Q1. done\n- [ ] Q2. open\n");
    expect(items.map((i) => [i.id, i.open, i.line])).toEqual([
      ["Q1", false, 3],
      ["Q2", true, 4],
    ]);
  });

  it("ends an item at the next heading rather than swallowing the section below", () => {
    const items = parseQueueItems("- [ ] Q1. open\n  detail\n## Next\nnot part of Q1\n");
    expect(items[0].text).toContain("detail");
    expect(items[0].text).not.toContain("not part of Q1");
  });

  it("falls back to the first words when an item carries no Qn label", () => {
    expect(parseQueueItems("- [ ] tidy the deploy script\n")[0].id).toBe("tidy the deploy script");
  });
});

describe("findMdGates", () => {
  it("flags an open item gated on an unread .md, quoting the gate", () => {
    const [finding, ...rest] = findMdGates(Q46_SHAPED);
    expect(rest).toHaveLength(0);
    expect(finding.id).toBe("Q46");
    expect(finding.docs).toEqual(["docs/research/REP-COCKPIT-RESEARCH-2026-07-23.md"]);
    expect(finding.quote).toContain("awaiting his morning read");
  });

  it("prefers the longest matching phrase so the report names the real wording", () => {
    const md = "- [ ] Q9. see docs/x.md — awaiting Rob's morning read before we start.\n";
    expect(findMdGates(md)[0].phrase).toBe("awaiting rob's morning read");
  });

  it("does not flag a CLOSED item — its gate language is history, not a block", () => {
    expect(findMdGates(Q46_SHAPED.replace("- [ ]", "- [x]"))).toEqual([]);
  });

  it("does not flag an open item that merely cites a .md with no read-gate", () => {
    expect(findMdGates("- [ ] Q7. Build it per docs/plans/DESIGN.md, no approval needed.\n")).toEqual([]);
  });

  it("does not flag a gate on Rob that is not a document he cannot read", () => {
    // Waiting on a decision is legitimate; waiting on him to READ markdown is not.
    expect(findMdGates("- [ ] Q8. Blocked: awaiting Rob's read of the Figma.\n")).toEqual([]);
  });

  it("honours an exemption and requires it to carry a reason", () => {
    const withReason = "- [ ] Q80. kills the docs/a.md gate, awaiting Rob's read (md-gate-audit: exempt — quotes the gate to abolish it)\n";
    expect(findMdGates(withReason)).toEqual([]);

    const bare = "- [ ] Q81. docs/a.md, awaiting Rob's read — md-gate-audit: exempt —   \n";
    expect(exemptionReason(bare)).toBeNull();
    expect(findMdGates(bare)).toHaveLength(1);
  });

  it("reports worst-first by position, so top-of-queue blocks lead", () => {
    const md = [
      "- [ ] Q1. clean item",
      "- [ ] Q5. docs/late.md awaiting Rob's read",
      "- [x] Q6. docs/done.md awaiting Rob's read",
    ].join("\n");
    // Only the open one, and identified by its own line.
    expect(findMdGates(md).map((f) => [f.id, f.line])).toEqual([["Q5", 2]]);
  });

  it("dedupes repeated .md mentions within one item", () => {
    const md = "- [ ] Q3. docs/a.md and again docs/a.md and docs/b.md — awaiting Rob's read\n";
    expect(findMdGates(md)[0].docs).toEqual(["docs/a.md", "docs/b.md"]);
  });
});
