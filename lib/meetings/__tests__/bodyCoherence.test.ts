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

  // Q89 inc.10 — "nobody ruled" and "ruled internal" must never be the same verdict.
  describe("the third state: an internal meeting with no counterparty", () => {
    const internal = {
      examined: true as const,
      counterparty: "none" as const,
      reason:
        "a coaching call Rob facilitated on HighLevel knowledge bases; participants are unnamed",
      sourceRef: "body ¶1 + to-do ‘@Robert Acheson to create feedback survey’",
    };

    it("rules an examined counterparty-less row internal, NOT unverifiable", () => {
      const result = checkBodyCoherence({
        asserted: [],
        body: "Robert facilitated a coaching call focused on knowledge bases for AI agents.",
        counterpartyReview: internal,
      });
      expect(result.verdict).toBe("internal-no-counterparty");
      expect(result.verdict).not.toBe("unverifiable");
    });

    it("still refuses to publish an internal row — a reason to stop, not a licence", () => {
      const result = checkBodyCoherence({
        asserted: [],
        body: "internal training session",
        counterpartyReview: internal,
      });
      expect(result.safeToPublish).toBe(false);
    });

    it("prints the human's reason and the line it came from, so the ruling is checkable", () => {
      const result = checkBodyCoherence({
        asserted: [],
        body: "internal training session",
        counterpartyReview: internal,
      });
      expect(result.reason).toContain("coaching call Rob facilitated");
      expect(result.reason).toContain("@Robert Acheson");
    });

    it("says an internal row is owed no further read, unlike an unexamined one", () => {
      const ruled = checkBodyCoherence({
        asserted: [],
        body: "internal training session",
        counterpartyReview: internal,
      });
      const unruled = checkBodyCoherence({ asserted: [], body: "internal training session" });
      expect(ruled.reason).toContain("not owed another read");
      expect(unruled.reason).toContain("still owed a read");
    });

    it("treats an omitted review as unexamined — silence is never a ruling of 'none'", () => {
      const result = checkBodyCoherence({ asserted: [], body: "some body text" });
      expect(result.verdict).toBe("unverifiable");
      expect(result.safeToPublish).toBe(false);
    });

    it("treats an explicit examined:false the same as an omitted review", () => {
      const result = checkBodyCoherence({
        asserted: [],
        body: "some body text",
        counterpartyReview: { examined: false },
      });
      expect(result.verdict).toBe("unverifiable");
    });

    it("lets the BODY overrule the ruling when a counterparty IS asserted", () => {
      // A ruling of "internal" cannot excuse a row whose summary names a company the
      // body never mentions — that is inc.9's welded-rows defect, and it still wins.
      const result = checkBodyCoherence({
        asserted: [{ term: "BBX Moving Company", sourceRef: "summary" }],
        body: "an automation walkthrough that names no counterparty at all",
        counterpartyReview: internal,
      });
      expect(result.verdict).toBe("mismatch");
      expect(result.safeToPublish).toBe(false);
    });
  });
});
