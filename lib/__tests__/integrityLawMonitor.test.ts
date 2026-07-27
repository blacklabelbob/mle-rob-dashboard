import { describe, expect, it } from "vitest";
import {
  isLegalStatusChange,
  lawFlagTitle,
  lawItemsFromPayload,
  lawItemToFlag,
} from "@/lib/integrity/lawMonitor";

// Q21 — AI voice-law monitor items → flags-ledger rows.
const ITEM = {
  matched_keyword: "tcpa",
  title: "FCC Adopts New One-to-One Consent Rule for AI Voice Calls",
  link: "https://www.fcc.gov/document/one-to-one-consent",
  published: "2026-07-20T14:00:00.000Z",
  source: "www.fcc.gov",
  snippet: "The FCC today adopted rules requiring one-to-one consent...",
};

describe("lawItemsFromPayload", () => {
  it("accepts a bare array, an { items } wrapper, and a single item", () => {
    expect(lawItemsFromPayload([ITEM])).toHaveLength(1);
    expect(lawItemsFromPayload({ items: [ITEM, ITEM] })).toHaveLength(2);
    expect(lawItemsFromPayload(ITEM)).toHaveLength(1);
  });

  it("drops items without a usable title and junk payloads", () => {
    expect(lawItemsFromPayload([{ link: "https://x.test" }, { title: "  " }])).toHaveLength(0);
    expect(lawItemsFromPayload(null)).toHaveLength(0);
    expect(lawItemsFromPayload("nope")).toHaveLength(0);
    expect(lawItemsFromPayload({ items: "nope" })).toHaveLength(0);
  });
});

// Rob dev-chat #50 (2026-07-27): "I dont care about the law unless theres been
// an actual full change in the legal status of Voice AI." The negatives below
// are the REAL headlines that landed on his Overview and made him say it.
describe("isLegalStatusChange", () => {
  it("passes a real change in voice-AI legal status", () => {
    expect(isLegalStatusChange(ITEM)).toBe(true);
    expect(
      isLegalStatusChange({ title: "FCC bans AI-generated voice calls under the TCPA" })
    ).toBe(true);
    expect(
      isLegalStatusChange({
        title: "Georgia robocall amendment signed into law, takes effect Jan 1",
      })
    ).toBe(true);
  });

  it("drops the law-news noise Rob rejected (the actual ledger headlines)", () => {
    const noise = [
      "$10MM DOWN THE DRAIN- Court Grants Final Approval to Gen Digital TCPA Settlement",
      "FTC's Shutterstock Settlement Signals Continued Scrutiny of AI",
      "High Gas Prices, Heightened Enforcement Risk - DOJ and FTC Call for Vigilance",
      "NO ESCAPE- Court Enforces TCPA Subpoenas Against Nonparties",
      "What Every Multinational Should Know About Conducting Internal Investigations",
    ];
    for (const title of noise) {
      expect(isLegalStatusChange({ title, matched_keyword: "tcpa" })).toBe(false);
    }
  });

  it("needs BOTH halves — voice AI alone, or a rule change alone, is not enough", () => {
    expect(isLegalStatusChange({ title: "The rise of AI voice agents in call centers" })).toBe(
      false
    );
    expect(isLegalStatusChange({ title: "New rule on hospital price transparency" })).toBe(false);
    expect(isLegalStatusChange({ title: "" })).toBe(false);
  });

  it("does not treat a mere proposal as a change in status", () => {
    expect(
      isLegalStatusChange({
        title: "FCC seeks comment on proposed AI voice call disclosure requirements",
      })
    ).toBe(false);
  });
});

describe("lawItemToFlag", () => {
  it("maps an item to a medium flag carrying source, date, keyword, snippet and link", () => {
    const flag = lawItemToFlag(ITEM);
    expect(flag.severity).toBe("medium");
    expect(flag.title).toBe(
      "Voice-law update: FCC Adopts New One-to-One Consent Rule for AI Voice Calls"
    );
    expect(flag.detail).toContain("www.fcc.gov · 2026-07-20");
    expect(flag.detail).toContain('matched: "tcpa"');
    expect(flag.detail).toContain("one-to-one consent...");
    expect(flag.detail).toContain("https://www.fcc.gov/document/one-to-one-consent");
  });

  it("is deterministic across re-posts (no date in the title = the dedupe key)", () => {
    const again = lawItemToFlag({ ...ITEM, published: "2026-07-27T09:00:00.000Z" });
    expect(again.title).toBe(lawItemToFlag(ITEM).title);
  });

  it("survives a minimal item (title only) with honest placeholders", () => {
    const flag = lawItemToFlag({ title: "Georgia mini-TCPA amended" });
    expect(flag.title).toBe("Voice-law update: Georgia mini-TCPA amended");
    expect(flag.detail).toContain("unknown source · date unknown");
  });

  it("truncates marathon headlines and collapses whitespace", () => {
    const long = "A ".repeat(200) + "end";
    const title = lawFlagTitle(long);
    expect(title.length).toBeLessThanOrEqual("Voice-law update: ".length + 160);
    expect(title.endsWith("...")).toBe(true);
    expect(lawFlagTitle("  spaced\n\nout   headline ")).toBe(
      "Voice-law update: spaced out headline"
    );
  });
});
