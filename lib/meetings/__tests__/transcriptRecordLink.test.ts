/**
 * Q86 inc.40 — asserted against the REAL measured snapshot and the REAL registry, not fixtures.
 *
 * inc.39's tests were written this way for the reason that applies again here: the three transcripts
 * and the records they should reach are actual rows in this repo, and a fixture would let the suite
 * go green while the shipped data disagreed. Each block opens by asserting the shape it depends on
 * still exists, so moved or renamed data fails loudly instead of passing about nothing.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  linkTranscriptToRecord,
  linkTranscripts,
  nameForms,
  normalizeTitle,
  transcriptStem,
  countWords,
  type RegistryRecord,
} from "../transcriptRecordLink";

const REPO = join(__dirname, "..", "..", "..");

const snapshot = JSON.parse(
  readFileSync(
    join(REPO, "MLE Internal Meetings", "local-transcripts-2026-08-08.json"),
    "utf8",
  ),
) as { transcripts: { ref: string; title: string }[] };

const network = JSON.parse(
  readFileSync(join(REPO, "data", "network.local.json"), "utf8"),
) as { people: { id: string; name: string; entityKind: string; legacySlug?: string }[] };

const registry: RegistryRecord[] = network.people.map((p) => ({
  id: p.id,
  name: p.name,
  entityKind: p.entityKind === "company" ? "company" : "person",
  legacySlug: p.legacySlug ?? null,
}));

const bySlug = (ref: string) => {
  const t = snapshot.transcripts.find((x) => x.ref === ref);
  if (!t) throw new Error(`snapshot no longer holds ${ref} — fixture drift, not a pass`);
  return t;
};

describe("the snapshot and registry this suite rules on", () => {
  it("still holds the three transcripts inc.39 proved exist", () => {
    expect(snapshot.transcripts.map((t) => t.ref).sort()).toEqual([
      "david-cates.txt",
      "john-burns.txt",
      "joseph-ontime.txt",
    ]);
  });

  it("still holds the three records they should reach", () => {
    for (const id of ["P-1015", "P-1020", "C-2016"]) {
      expect(registry.find((r) => r.id === id), `${id} missing from registry`).toBeTruthy();
    }
  });
});

describe("normalization", () => {
  it("drops the extension from a ref and lowercases the stem", () => {
    expect(transcriptStem("David-Cates.TXT")).toBe("david-cates");
  });

  it("reads BOTH name forms out of a registry parenthetical, and invents none without one", () => {
    expect(nameForms("Jonathan (John) Burns").sort()).toContain("john burns");
    expect(nameForms("Jonathan (John) Burns").sort()).toContain("jonathan burns");
    expect(nameForms("David Cates")).toEqual(["david cates"]);
  });

  it("matches whole words only — a substring is not a name", () => {
    expect(normalizeTitle("Joseph On Time Roofing Call Recording")).toBe(
      "joseph on time roofing call recording",
    );
    const link = linkTranscriptToRecord(
      { ref: "timekeeping.txt", title: "Timekeeping review" },
      [{ id: "C-2016", name: "On Time Moving and Storage", entityKind: "company", legacySlug: null }],
    );
    expect(link.status).toBe("none");
  });
});

describe("the three real transcripts against the real registry", () => {
  it("david-cates.txt LINKS to P-1020 — title and filename stem agree, nothing left over", () => {
    const link = linkTranscriptToRecord(bySlug("david-cates.txt"), registry);
    expect(link.status).toBe("linked");
    expect(link.record?.id).toBe("P-1020");
    expect(link.signals.nameMatched).toBe("david cates");
    expect(link.signals.slugMatched).toBe(true);
    expect(link.unexplainedTitleWords).toEqual([]);
  });

  it("john-burns.txt LINKS to P-1015 via the registry's OWN parenthetical, not an invented alias", () => {
    const record = registry.find((r) => r.id === "P-1015")!;
    expect(record.name, "the parenthetical this link rests on").toContain("(John)");
    const link = linkTranscriptToRecord(bySlug("john-burns.txt"), registry);
    expect(link.status).toBe("linked");
    expect(link.record?.id).toBe("P-1015");
    expect(link.signals.nameMatched).toBe("john burns");
  });

  it("joseph-ontime.txt is UNCERTAIN — the only On Time record says Moving and Storage, the file says Roofing", () => {
    const t = bySlug("joseph-ontime.txt");
    expect(t.title.toLowerCase(), "the conflict this case exists for").toContain("roofing");
    const link = linkTranscriptToRecord(t, registry);
    expect(link.status).toBe("uncertain");
    expect(link.record?.id).toBe("C-2016");
    expect(link.unexplainedTitleWords).toContain("roofing");
    expect(link.why).toMatch(/mis-titled file or a different entity/);
  });

  it("never returns linked for the conflicting one, at any registry order", () => {
    const reversed = [...registry].reverse();
    expect(linkTranscriptToRecord(bySlug("joseph-ontime.txt"), reversed).status).toBe(
      "uncertain",
    );
  });
});

describe("refusals", () => {
  it("a name match with a disagreeing filename stem is ONE signal and stays uncertain", () => {
    const link = linkTranscriptToRecord(
      { ref: "call-004.txt", title: "Call with David Cates" },
      registry,
    );
    expect(link.status).toBe("uncertain");
    expect(link.signals.nameMatched).toBe("david cates");
    expect(link.signals.slugMatched).toBe(false);
    expect(link.why).toMatch(/one signal only/);
  });

  it("an empty registry attaches nothing and says how many it read", () => {
    const link = linkTranscriptToRecord(bySlug("david-cates.txt"), []);
    expect(link.status).toBe("none");
    expect(link.record).toBeUndefined();
    expect(link.why).toMatch(/\(0 read\)/);
  });

  it("keeps the near-miss record attached so the reader can see the pair", () => {
    const link = linkTranscriptToRecord(bySlug("joseph-ontime.txt"), registry);
    expect(link.record).toBeTruthy();
  });

  it("rules every transcript and returns one verdict each, in the caller's order", () => {
    const links = linkTranscripts(snapshot.transcripts, registry);
    expect(links).toHaveLength(snapshot.transcripts.length);
    expect(links.map((l) => l.transcript.ref)).toEqual(
      snapshot.transcripts.map((t) => t.ref),
    );
    expect(links.filter((l) => l.status === "linked")).toHaveLength(2);
    expect(links.filter((l) => l.status === "uncertain")).toHaveLength(1);
  });
});

/**
 * Q86 inc.41 — the body evidence.
 *
 * The excerpt below is VERBATIM from `~/Projects/MyLocalEverything/transcripts/joseph-ontime.txt`
 * (lines 49, 53 and 93 of the file, read 2026-08-08). It is embedded rather than read from disk
 * because that path is outside this repo and a test that silently skips when a file moves proves
 * nothing — quoting it makes the test the record of the read.
 */
const JOSEPH_BODY_EXCERPT = `
we're we're an agent for National Van Lines. We're the Northeast Florida agent for National Van
Lines, which is one of the larger, you know, van lines out there.
So when when for, like, local moves, I mean, it's like it could be anywhere from, you know, $6,700
to, you know, maybe $3,000 would be, like, an average, you know, for, like, local, like, moves.
But then when they're going out of state, it can vary drastically.
Oh, awesome. Sorry about that. I was having some audio issues, but it's nice to meet you, Joseph.
I'm Will.
`;

describe("countWords", () => {
  it("counts whole words only, case-insensitively", () => {
    expect(countWords("Roofing the roof, roofing again", ["roofing", "roof"])).toEqual([2, 1]);
  });

  it("counts a word repeated back to back as two", () => {
    expect(countWords("on time time again", ["time"])).toEqual([2]);
  });

  it("returns 0 for a word the body never says, and for an empty word", () => {
    expect(countWords("nothing about it here", ["roofing", ""])).toEqual([0, 0]);
  });

  it("matches a multi-word phrase as a phrase", () => {
    expect(countWords("the on time crew", ["on time", "time on"])).toEqual([1, 0]);
  });
});

describe("body evidence on the joseph-ontime pair", () => {
  it("finds the disputed title word ROOFING spoken zero times in the excerpt", () => {
    const t = snapshot.transcripts.find((x) => x.ref === "joseph-ontime.txt");
    expect(t, "the joseph-ontime row must still be in the snapshot").toBeTruthy();
    const link = linkTranscriptToRecord({ ...t!, body: JOSEPH_BODY_EXCERPT }, registry);
    const roofing = link.wordEvidence.find((e) => e.word === "roofing");
    expect(roofing, "roofing must be reported as a disputed title word").toBeTruthy();
    expect(roofing!.side).toBe("title");
    expect(roofing!.bodyHits).toBe(0);
  });

  it("counts BOTH sides — the record's own name words too, not just the case against the title", () => {
    const t = snapshot.transcripts.find((x) => x.ref === "joseph-ontime.txt")!;
    const link = linkTranscriptToRecord({ ...t, body: JOSEPH_BODY_EXCERPT }, registry);
    expect(link.wordEvidence.some((e) => e.side === "record")).toBe(true);
  });

  it("NEVER upgrades the verdict on word counts — evidence narrows, a human rules", () => {
    const t = snapshot.transcripts.find((x) => x.ref === "joseph-ontime.txt")!;
    const withBody = linkTranscriptToRecord({ ...t, body: JOSEPH_BODY_EXCERPT }, registry);
    const without = linkTranscriptToRecord(t, registry);
    expect(withBody.status).toBe(without.status);
    expect(withBody.status).toBe("uncertain");
    expect(withBody.record?.id).toBe(without.record?.id);
  });

  it("says the counts out loud in `why`, and says whose call the ruling is", () => {
    const t = snapshot.transcripts.find((x) => x.ref === "joseph-ontime.txt")!;
    const link = linkTranscriptToRecord({ ...t, body: JOSEPH_BODY_EXCERPT }, registry);
    expect(link.why).toMatch(/"roofing" 0×/);
    expect(link.why).toMatch(/the ruling is a human's/);
  });

  it("a caller with no body gets no evidence and an unchanged sentence", () => {
    const t = snapshot.transcripts.find((x) => x.ref === "joseph-ontime.txt")!;
    const link = linkTranscriptToRecord(t, registry);
    expect(link.wordEvidence).toEqual([]);
    expect(link.why).not.toMatch(/spoken in the body/);
  });

  it("a linked pair with nothing disputed reports no evidence even when a body is supplied", () => {
    const t = snapshot.transcripts.find((x) => x.ref === "david-cates.txt")!;
    const link = linkTranscriptToRecord({ ...t, body: "any words at all" }, registry);
    expect(link.status).toBe("linked");
    expect(link.wordEvidence.filter((e) => e.side === "title")).toEqual([]);
  });
});
