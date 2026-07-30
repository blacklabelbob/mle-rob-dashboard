import { describe, expect, it } from "vitest";
import {
  auditAsset,
  buildInventory,
  firstSentence,
  parseAsset,
  type AssetSource,
} from "../inventory";

function src(partial: Partial<AssetSource> & { content: string }): AssetSource {
  return {
    kind: "agent",
    slug: "some-agent",
    path: "/home/x/.claude/agents/some-agent.md",
    lastModified: "2026-07-01T00:00:00.000Z",
    ...partial,
  };
}

const REAL_AGENT = `---
name: critic-rob
model: fable
description: Rob's standards, weaponized. An uncompromising evaluator built from every rule.
tools: Read, Grep, Glob, Bash
---

# Critic Rob
`;

describe("parseAsset", () => {
  it("reads name, model, tools and a one-line purpose from real frontmatter", () => {
    const rec = parseAsset(src({ slug: "critic-rob", content: REAL_AGENT }));
    expect(rec.name).toBe("critic-rob");
    expect(rec.model).toBe("fable");
    expect(rec.tools).toBe("Read, Grep, Glob, Bash");
    expect(rec.purpose).toBe("Rob's standards, weaponized.");
    expect(rec.hasFrontmatter).toBe(true);
  });

  it("falls back to the slug and reports a missing frontmatter block", () => {
    const rec = parseAsset(src({ slug: "bare-skill", content: "# Just a heading\n" }));
    expect(rec.name).toBe("bare-skill");
    expect(rec.purpose).toBeNull();
    expect(rec.hasFrontmatter).toBe(false);
  });

  it("does not treat a mid-document rule as frontmatter", () => {
    const rec = parseAsset(
      src({ slug: "prose", content: "# Title\n\n---\n\nname: not-a-field\n" }),
    );
    expect(rec.hasFrontmatter).toBe(false);
    expect(rec.name).toBe("prose");
  });

  it("keeps colons inside a description value", () => {
    const rec = parseAsset(
      src({ content: "---\ndescription: Use when: the user asks. More text.\n---\n" }),
    );
    expect(rec.purpose).toBe("Use when: the user asks.");
  });
});

describe("firstSentence", () => {
  it("marks truncation instead of cutting silently", () => {
    const out = firstSentence(`${"a".repeat(300)}.`, 40);
    expect(out).toHaveLength(40);
    expect(out.endsWith("…")).toBe(true);
  });

  it("returns the whole text when there is no sentence break", () => {
    expect(firstSentence("no terminator here")).toBe("no terminator here");
  });
});

describe("auditAsset — the half Rob actually asked for", () => {
  it("flags a VP of Sales claim as gate-failing", () => {
    const findings = auditAsset(
      src({ content: "Rob is the VP of Sales and wants roofing decks." }),
    );
    expect(findings.map((f) => f.code)).toContain("stale_role_claim_vp_of_sales");
    expect(findings[0].severity).toBe("high");
    expect(findings[0].evidence).toBe("VP of Sales");
  });

  it("flags 'Rob at STG' as gate-failing", () => {
    const findings = auditAsset(
      src({ content: "When writing for Rob at Sales Transformation Group, use..." }),
    );
    expect(findings.some((f) => f.code === "stale_role_claim_works_at_stg")).toBe(true);
    expect(findings.every((f) => f.severity === "high")).toBe(true);
  });

  it("flags an instruction to brand output as STG", () => {
    const findings = auditAsset(
      src({ content: "Apply STG brand guidelines to every deliverable." }),
    );
    expect(findings.some((f) => f.code === "stg_branding_instruction")).toBe(true);
  });

  it("treats a bare STG mention as medium, not a gate failure", () => {
    const findings = auditAsset(src({ content: "Baseline Selling came out of STG work." }));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].code).toBe("stg_reference");
  });

  it("does not add a medium mention row to a file that already failed high", () => {
    const findings = auditAsset(
      src({ content: "Rob, VP of Sales at STG, sells for STG. STG STG." }),
    );
    expect(findings.filter((f) => f.code === "stg_reference")).toHaveLength(0);
  });

  it("demotes the deliberately-deprecated STG brand skill but still lists it", () => {
    const findings = auditAsset(
      src({
        kind: "skill",
        slug: "stg-brand-guidelines",
        content: "Apply STG brand guidelines. Rob is VP of Sales.",
      }),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
    expect(findings.every((f) => f.code.startsWith("deprecated_by_rule:"))).toBe(true);
  });

  it("demotes a claim the file itself corrects (the head-of-marketing false positive)", () => {
    const findings = auditAsset(
      src({
        slug: "head-of-marketing",
        content:
          "> ⚠️ **Rob LEFT STG.** He is not VP of Sales anywhere — he is the founder of AI VoiceTech.\n",
      }),
    );
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
    expect(findings.some((f) => f.code.includes("corrected:"))).toBe(true);
  });

  it("still fails high when a file corrects the claim in one line and asserts it in another", () => {
    const findings = auditAsset(
      src({
        content:
          "Never call him VP of Sales.\n\nIntroduce Rob as the VP of Sales at every meeting.\n",
      }),
    );
    const high = findings.filter((f) => f.severity === "high");
    expect(high).toHaveLength(1);
    expect(high[0].code).toBe("stale_role_claim_vp_of_sales");
  });

  it("returns nothing for a clean file", () => {
    expect(
      auditAsset(src({ content: "Rob founded AI VoiceTech. Targets: roofing contractors." })),
    ).toEqual([]);
  });
});

describe("buildInventory", () => {
  const sources: AssetSource[] = [
    src({ kind: "skill", slug: "zzz-skill", content: "---\nname: zzz\n---\n" }),
    src({ kind: "agent", slug: "bbb", content: "Rob is the VP of Sales." }),
    src({ kind: "agent", slug: "aaa", content: "Clean file about roofing." }),
    src({ kind: "skill", slug: "aaa-skill", content: "Mentions STG once." }),
  ];

  it("orders agents before skills, then by slug, so the file is stable", () => {
    const inv = buildInventory(sources);
    expect(inv.assets.map((a) => a.slug)).toEqual(["aaa", "bbb", "aaa-skill", "zzz-skill"]);
  });

  it("counts both kinds and both severities", () => {
    const inv = buildInventory(sources);
    expect(inv.counts).toEqual({
      agents: 2,
      skills: 2,
      high: 1,
      medium: 1,
      reviewed: 0,
      unexamined: 2,
    });
  });

  it("fails the gate on any high finding and passes when there are none", () => {
    expect(buildInventory(sources).passes).toBe(false);
    expect(buildInventory([sources[2]]).passes).toBe(true);
  });

  it("does not mutate the caller's array", () => {
    const input = [...sources];
    buildInventory(input);
    expect(input.map((s) => s.slug)).toEqual(sources.map((s) => s.slug));
  });
});

// Q83 inc.3 — the reviewed marker. inc.2 measured the limit this closes: two
// catastrophic rubric lines and one correct rule-against-STG all scored an
// identical `medium / stg_reference`, so the gate could not tell a file somebody
// had judged from a file nobody had opened.
describe("stg-audit: reviewed marker", () => {
  const REVIEWED = src({
    slug: "critic-rob",
    content:
      "---\nname: critic-rob\n---\n<!-- stg-audit: reviewed — the only mention is a rule AGAINST STG branding -->\n\nAuto-fail: STG branding.\n",
  });

  it("codes the finding as reviewed and echoes the reason verbatim", () => {
    const [f] = auditAsset(REVIEWED);
    expect(f.code).toBe("reviewed:stg_reference");
    expect(f.reviewed).toBe("the only mention is a rule AGAINST STG branding");
    expect(f.detail).toContain("Reviewed on purpose: the only mention is a rule AGAINST");
  });

  it("still LISTS the finding — reviewed is a record, not a mute button", () => {
    expect(auditAsset(REVIEWED)).toHaveLength(1);
  });

  it("never downgrades a high finding: reviewing a lie does not make it true", () => {
    const [f] = auditAsset(
      src({
        content:
          "---\nname: x\n---\n<!-- stg-audit: reviewed — looked at it -->\nRob is VP of Sales at STG.\n",
      }),
    );
    expect(f.severity).toBe("high");
    expect(f.reviewed).toBe("looked at it");
    expect(buildInventory([REVIEWED]).passes).toBe(true);
    expect(
      buildInventory([
        src({
          content:
            "---\nname: x\n---\n<!-- stg-audit: reviewed — looked at it -->\nRob is VP of Sales at STG.\n",
        }),
      ]).passes,
    ).toBe(false);
  });

  it("rejects a stamp with no reason — an empty marker is not a review", () => {
    const [f] = auditAsset(
      src({ content: "<!-- stg-audit: reviewed —   -->\nMentions STG.\n" }),
    );
    expect(f.reviewed).toBeNull();
    expect(f.code).toBe("stg_reference");
  });

  it("stacks on top of the deprecated-by-rule demotion without replacing its code", () => {
    const [f] = auditAsset(
      src({
        kind: "skill",
        slug: "stg-brand-guidelines",
        content:
          "<!-- stg-audit: reviewed — kept ON PURPOSE as the deprecated brand record -->\nApply STG branding.\n",
      }),
    );
    expect(f.code).toBe("reviewed:deprecated_by_rule:stg_branding_instruction");
    expect(f.severity).toBe("medium");
  });

  it("counts reviewed and unexamined per FILE, so the report is generated not typed", () => {
    const inv = buildInventory([
      REVIEWED,
      src({ slug: "bare", content: "Mentions STG." }),
      src({ slug: "clean", content: "Roofing only." }),
    ]);
    expect(inv.counts.reviewed).toBe(1);
    expect(inv.counts.unexamined).toBe(1);
  });
});
