import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { askCount, parseDigest, rankSections, stripInline } from "../digest";

// Q80 half 2. The parser's job is to be boring and literal — every test below is
// really the same assertion: what lands on the screen is what is in the file.

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

const SAMPLE = `# Some Design Doc
**Date:** 2026-07-22 · **Status:** DRAFT rev 4 — awaiting sign-off · **Owner:** Max

> **How to read this:** each section leads with THE DECISION in one or two lines.

---

## 1. Purpose statement — what it is FOR

**Decision: it is Rob's operating picture, not a bigger rep screen.**

Rob said the word decision here in passing and it must not be promoted.

## 2. A section with no decision

Body only. Rob's *emphasis* and a [link](https://example.com/x) and \`code\`.

## 3. Open questions for Rob (2)

1. **Queue contract:** should the band be the top of /rep?
2. **Templates:** who writes the first pass?
`;

describe("stripInline", () => {
  it("keeps a link's label and drops its URL", () => {
    expect(stripInline("see [Attio docs](https://attio.com/help/x) today")).toBe(
      "see Attio docs today",
    );
  });

  it("removes bold, italic and code fences", () => {
    expect(stripInline("**bold** and *soft* and `code`")).toBe("bold and soft and code");
  });

  it("leaves a bare asterisk in prose alone", () => {
    expect(stripInline("2 * 3 is six")).toBe("2 * 3 is six");
  });
});

describe("parseDigest", () => {
  const digest = parseDigest(SAMPLE, { slug: "sample", path: "docs/sample.md" });

  it("reads title, date and status off the header line by label, not position", () => {
    expect(digest.title).toBe("Some Design Doc");
    expect(digest.date).toBe("2026-07-22");
    expect(digest.status).toBe("DRAFT rev 4 — awaiting sign-off");
  });

  it("takes the lead blockquote and strips its 'How to read this' preamble", () => {
    expect(digest.lead).toBe(
      "each section leads with THE DECISION in one or two lines.",
    );
  });

  it("splits the heading label off the heading text", () => {
    expect(digest.sections[0]).toMatchObject({
      label: "1",
      heading: "Purpose statement — what it is FOR",
    });
  });

  it("lifts the Decision lead and drops the word 'Decision:' itself", () => {
    expect(digest.sections[0].decision).toBe(
      "it is Rob's operating picture, not a bigger rep screen.",
    );
  });

  it("reports a missing decision as null rather than paraphrasing the body", () => {
    // The failure this whole item exists to fix was a doc Rob could not see. A
    // digest that invented a headline would be the same defect wearing a UI.
    expect(digest.sections[1].decision).toBeNull();
  });

  it("never promotes a mid-paragraph use of the word 'decision' to the headline", () => {
    expect(digest.sections[0].decision).not.toMatch(/in passing/);
  });

  it("flags the open-questions section and extracts each ask's bold lead", () => {
    expect(digest.sections[2].asksRob).toBe(true);
    expect(digest.sections[2].points).toEqual(["Queue contract", "Templates"]);
  });

  it("does not treat ordinary sections as asks", () => {
    expect(digest.sections[0].asksRob).toBe(false);
  });

  it("ignores indented sub-bullets so the doc's own emphasis survives", () => {
    const nested = parseDigest(
      "# T\n\n## 1. S\n\n- **Top level:** yes\n  - **Nested:** no\n",
      { slug: "s", path: "p" },
    );
    expect(nested.sections[0].points).toEqual(["Top level"]);
  });

  it("takes bold paragraph leads, and never the Decision line as a bullet", () => {
    const doc = parseDigest(
      "# T\n\n## 1. S\n\n**Decision: the headline.**\n\n**8:45am — one tab, one queue.** Jake opens /rep.\n",
      { slug: "s", path: "p" },
    );
    expect(doc.sections[0].points).toEqual(["8:45am — one tab, one queue"]);
  });

  it("reads a table's first column, skipping its header and rule", () => {
    const doc = parseDigest(
      "# T\n\n## 1. S\n\n| Not building | Why |\n|---|---|\n| Auto-sequences | too small a team |\n",
      { slug: "s", path: "p" },
    );
    expect(doc.sections[0].points).toEqual(["Auto-sequences"]);
  });

  it("drops questions already marked RESOLVED so the badge counts only real asks", () => {
    const doc = parseDigest(
      "# T\n\n## 9. Open questions for Rob\n\n| # | Was | Resolution |\n|---|---|---|\n| **OQ-1:** phase lists | x | **RESOLVED 2026-07-22** |\n\n1. **Top Automations slot:** who defines the list?\n",
      { slug: "s", path: "p" },
    );
    expect(doc.sections[0].points).toEqual(["Top Automations slot"]);
    expect(askCount([{ ...doc }])).toBe(1);
  });

  it("treats a table inside a questions section as the resolution log, not asks", () => {
    // Master §9 marks OQ-1..5 resolved in a paragraph ABOVE the table, so the rows
    // themselves look open. Numbered-questions-only is the rule that reads it right.
    const doc = parseDigest(
      "# T\n\n## 9. Open questions for Rob\n\n**OQ-1 through OQ-5: ALL RESOLVED**\n\n| # | Was |\n|---|---|\n| OQ-1 | phase lists |\n| OQ-2 | status labels |\n\n6. **Top Automations slot content.** Who defines it?\n",
      { slug: "s", path: "p" },
    );
    expect(doc.sections[0].points).toEqual(["Top Automations slot content"]);
  });

  it("keeps a resolved row visible in an ordinary section — only asks are filtered", () => {
    const doc = parseDigest(
      "# T\n\n## 2. Taxonomy\n\n- **Status labels:** RESOLVED 2026-07-22, option A\n",
      { slug: "s", path: "p" },
    );
    expect(doc.sections[0].points).toEqual(["Status labels"]);
  });

  it("ignores a table's row numbers, which are not points", () => {
    const doc = parseDigest(
      "# T\n\n## 8. Build plan\n\n| # | Increment |\n|---|---|\n| 1 | ship the tracker |\n",
      { slug: "s", path: "p" },
    );
    expect(doc.sections[0].points).toEqual([]);
  });

  it("caps a long list and declares the overflow instead of hiding it", () => {
    const many = ["# T", "", "## 1. S", ""]
      .concat(Array.from({ length: 11 }, (_, i) => `- **Point ${i}:** body`))
      .join("\n");
    const capped = parseDigest(many, { slug: "s", path: "p" }).sections[0];
    expect(capped.points).toHaveLength(8);
    expect(capped.morePoints).toBe(3);
  });
});

describe("rankSections", () => {
  it("puts what Rob is being asked above what he is only being told", () => {
    const sections = parseDigest(SAMPLE, { slug: "s", path: "p" }).sections;
    expect(rankSections(sections)[0].asksRob).toBe(true);
  });

  it("keeps the source order of everything else, so two runs render alike", () => {
    const sections = parseDigest(SAMPLE, { slug: "s", path: "p" }).sections;
    const rest = rankSections(sections).filter((s) => !s.asksRob);
    expect(rest.map((s) => s.label)).toEqual(["1", "2"]);
  });
});

describe("against the two real docs Q80 is about", () => {
  const master = parseDigest(read("docs/plans/MASTER-VIEW-2.0-DESIGN.md"), {
    slug: "master-view-2",
    path: "docs/plans/MASTER-VIEW-2.0-DESIGN.md",
  });
  const rep = parseDigest(read("docs/research/REP-COCKPIT-RESEARCH-2026-07-23.md"), {
    slug: "rep-cockpit",
    path: "docs/research/REP-COCKPIT-RESEARCH-2026-07-23.md",
  });

  it("finds the master-view decisions rather than an empty shell", () => {
    expect(master.sections.length).toBeGreaterThanOrEqual(9);
    expect(master.sections.filter((s) => s.decision).length).toBeGreaterThanOrEqual(6);
    expect(master.sections[0].decision).toMatch(/operating picture/);
  });

  it("reads the rep doc's one-sentence answer as its lead", () => {
    expect(rep.lead).toMatch(/finish-able daily queue/);
  });

  it("handles the rep doc's § heading style", () => {
    expect(rep.sections[0].label).toBe("§1");
  });

  it("surfaces the four questions the rep doc actually asks Rob", () => {
    const asks = rep.sections.find((s) => s.asksRob);
    expect(asks?.points).toEqual([
      "Queue contract",
      "Templates",
      "Deck homes",
      "Guidance lines",
    ]);
  });

  it("counts only the questions aimed at Rob, not every bullet in the docs", () => {
    const repBullets = rep.sections.reduce((n, s) => n + s.points.length, 0);
    expect(repBullets).toBeGreaterThan(4);
    expect(askCount([rep])).toBe(4);
    expect(askCount([master, rep])).toBeGreaterThanOrEqual(4);
  });

  it("gives every rep-doc section something to show, decision line or not", () => {
    // The rep doc leads with bulleted findings rather than "Decision:" lines. If
    // the digest only understood one shape, six of its sections would render as
    // empty cards and the surface would be worse than the file it replaced.
    for (const section of rep.sections) {
      expect(section.decision !== null || section.points.length > 0).toBe(true);
    }
  });
});
