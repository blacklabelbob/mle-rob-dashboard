import { describe, expect, it } from "vitest";
import { checkBodyCoherence } from "../bodyCoherence";

/**
 * The case that produced the module. Measured on the real page, not imagined:
 * Notion `2cf1de57-0199-8003-9e6d-fd921fbb8a59` ("will Devito 2025-12-20") carries an
 * STG summary of a call with BBX Moving Company sitting above 74,271 characters of a
 * transcript that says BBX 0 times, Chai 0, moving 0, Vancouver 0.
 */
const BBX_ASSERTED = [
  { term: "BBX Moving Company", sourceRef: "summary bullet «Quick Facts» — Company" },
  { term: "Chai", sourceRef: "summary bullet «Quick Facts» — Owner / Decision Maker" },
  { term: "Vancouver", sourceRef: "summary bullet «Quick Facts» — Location/Market" },
];

/** A faithful excerpt of what is actually on that row below the summary. */
const AUTOMATION_TRANSCRIPT = `Me: Hit me. So there's three steps to building an automation,
any automation, that's it. The first step. What is your input data? Is it a file? Is it audio,
video, image, text? You figure out exactly what the input is coming in. And then you want to
figure out what is your output. Everything else in the middle you build with that sole purpose.
Now let me ask, with that output, did you get that from one prompt, or did you piece it all
together? Here I'll show you a visual description and what it looks like — if you were to go to
an app like Higgs Field and generate the image, I want you to see how in depth they are.`;

describe("checkBodyCoherence — the will-Devito/BBX row", () => {
  it("calls a summary about one meeting over a transcript of another a MISMATCH", () => {
    const result = checkBodyCoherence({ asserted: BBX_ASSERTED, body: AUTOMATION_TRANSCRIPT });
    expect(result.verdict).toBe("mismatch");
    expect(result.found).toHaveLength(0);
    expect(result.missing.map((m) => m.term)).toEqual([
      "BBX Moving Company",
      "Chai",
      "Vancouver",
    ]);
  });

  it("refuses to publish from that row, and says why in words a reader can act on", () => {
    const result = checkBodyCoherence({ asserted: BBX_ASSERTED, body: AUTOMATION_TRANSCRIPT });
    expect(result.safeToPublish).toBe(false);
    expect(result.reason).toContain("different meetings");
    expect(result.reason).toContain("A human must read it");
  });

  it("does not let 'Chai' be satisfied by a longer word that merely contains it", () => {
    // The whole guard turns on this: "supply chain" must not vouch for a man named Chai.
    const result = checkBodyCoherence({
      asserted: [{ term: "Chai", sourceRef: "summary" }],
      body: "We walked the supply chain and the chairs in the lobby.",
    });
    expect(result.verdict).toBe("mismatch");
  });
});

describe("checkBodyCoherence — the verdicts that are not mismatch", () => {
  it("passes a row whose body actually names everything the summary claims", () => {
    const result = checkBodyCoherence({
      asserted: [
        { term: "Martin Fierro", sourceRef: "summary — Company Meeting with" },
        { term: "Dani", sourceRef: "summary — Non MLE Attendees" },
      ],
      body: "Dani said the biggest problem at Martin Fierro is getting people in the door.",
    });
    expect(result.verdict).toBe("coherent");
    expect(result.safeToPublish).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("matches a multi-word name across a line break rather than calling it absent", () => {
    const result = checkBodyCoherence({
      asserted: [{ term: "Gulf Coast RE Group", sourceRef: "summary" }],
      body: "the team at Gulf Coast\n   RE Group asked about assets",
    });
    expect(result.verdict).toBe("coherent");
  });

  it("calls a half-present identity PARTIAL and still refuses the publish", () => {
    const result = checkBodyCoherence({
      asserted: [
        { term: "Omega Title", sourceRef: "summary" },
        { term: "Blake", sourceRef: "summary" },
      ],
      body: "Omega Title runs payoff orders by hand and it is a nightmare.",
    });
    expect(result.verdict).toBe("partial");
    expect(result.safeToPublish).toBe(false);
    expect(result.reason).toContain("a human decides");
  });

  it("calls a row with nothing asserted UNVERIFIABLE, never coherent", () => {
    const result = checkBodyCoherence({ asserted: [], body: "ninety minutes of real transcript" });
    expect(result.verdict).toBe("unverifiable");
    expect(result.safeToPublish).toBe(false);
    expect(result.reason).toContain("not a pass");
  });

  it("calls an empty body UNVERIFIABLE — an unread row is not a confirmed one", () => {
    const result = checkBodyCoherence({
      asserted: [{ term: "BBX Moving Company", sourceRef: "summary" }],
      body: "   ",
    });
    expect(result.verdict).toBe("unverifiable");
    expect(result.safeToPublish).toBe(false);
    expect(result.missing).toHaveLength(1);
  });

  it("ignores blank asserted terms rather than failing a row on whitespace", () => {
    const result = checkBodyCoherence({
      asserted: [
        { term: "  ", sourceRef: "summary — empty field" },
        { term: "Omega Title", sourceRef: "summary" },
      ],
      body: "Omega Title was on the call.",
    });
    expect(result.verdict).toBe("coherent");
    expect(result.found).toHaveLength(1);
  });

  it("is case- and smart-quote-insensitive without matching words the body lacks", () => {
    const result = checkBodyCoherence({
      asserted: [{ term: "O’Brien Roofing", sourceRef: "summary" }],
      body: "we met O'BRIEN ROOFING on site",
    });
    expect(result.verdict).toBe("coherent");
  });
});
