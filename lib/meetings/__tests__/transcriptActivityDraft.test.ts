// Q86 inc.42 — the plan half of DoD (b), tested against the THREE REAL transcripts, linked by the
// real linker against the real registry.
//
// The pairs are not fixtures. They are built by running `linkTranscripts` over
// `data/network.local.json` — so if a record is renamed, re-slugged or given an org, these tests
// change their answer instead of going green about a world that has moved on. The first test
// asserts the live shapes themselves, so a moved subject fails loudly rather than quietly.
//
// ⚠️ A FIRST DRAFT OF THIS FILE INVENTED `P-1016 Joseph Green` and called joseph-ontime.txt a
// `linked` pair. Neither is true: C-2016 has NO people on it at all, and the linker rules that
// transcript `uncertain` — which is exactly what inc.41 wrote down. Corrected in place rather than
// deleted, because a test that agrees with a story instead of the data is the failure this repo
// keeps paying for.

import { describe, it, expect } from "vitest";
import {
  planTranscriptActivity,
  transcriptActivityId,
  type TranscriptIntel,
} from "../transcriptActivityDraft";
import { linkTranscripts, type TranscriptRecordLink } from "../transcriptRecordLink";
import registry from "../../../data/network.local.json";

const RECORDS = (registry as { people: Record<string, unknown>[] }).people.map((r) => ({
  id: String(r.id),
  name: String(r.name),
  entityKind: r.entityKind as "person" | "company",
  legacySlug: (r.legacySlug ?? null) as string | null,
}));

/** The three files measured on disk 2026-08-08 (inc.39), with the titles their transcribers wrote. */
const DISK = [
  { ref: "david-cates.txt", title: "Call with David Cates" },
  { ref: "joseph-ontime.txt", title: "On Time Roofing" },
  { ref: "john-burns.txt", title: "Call with John Burns" },
];

const LINKS = linkTranscripts(DISK, RECORDS);
const byRef = (ref: string): TranscriptRecordLink => {
  const hit = LINKS.find((l) => l.transcript.ref === ref);
  if (!hit) throw new Error(`${ref} is no longer in the measured set — the test is stale, not passing`);
  return hit;
};

const INTEL: TranscriptIntel[] = [
  { kind: "pain_point", text: "for local moves ... maybe $3,000 would be an average", sourceRef: "line 412" },
];

describe("the live pairs this module is asked to plan", () => {
  it("are the shapes inc.39–41 recorded: two linked to PERSON records, joseph-ontime uncertain", () => {
    expect(byRef("david-cates.txt").status).toBe("linked");
    expect(byRef("david-cates.txt").record?.id).toBe("P-1020");
    expect(byRef("john-burns.txt").status).toBe("linked");
    expect(byRef("john-burns.txt").record?.id).toBe("P-1015");
    // inc.41 settled this one by READING it, and the code still declines to rule.
    expect(byRef("joseph-ontime.txt").status).toBe("uncertain");
    expect(byRef("joseph-ontime.txt").unexplainedTitleWords).toContain("roofing");
  });
});

describe("planTranscriptActivity", () => {
  it("drafts the row for a linked pair, keyed on the transcript ref", () => {
    const r = planTranscriptActivity({
      link: byRef("david-cates.txt"),
      orgId: "C-2020",
      personId: "P-1020",
      occurredOn: "2026-07-24",
      intel: INTEL,
    });
    expect(r.drafted).toBe(true);
    if (!r.drafted) return;
    expect(r.draft.id).toBe(transcriptActivityId("david-cates.txt", "2026-07-24"));
    expect(r.draft.orgId).toBe("C-2020");
    expect(r.draft.personId).toBe("P-1020");
    expect(r.draft.type).toBe("meeting");
    expect(r.draft.occurredAt).toBe("2026-07-24");
    expect(r.draft.sourceContext.transcriptRef).toBe("david-cates.txt");
    expect(r.draft.bookProtected).toBe(false);
    // Nothing was in dispute on this pair, so nothing is reported as unexplained.
    expect(r.draft.sourceContext.titleWordsRecordCannotAccountFor).toBeUndefined();
  });

  it("never puts a money field on the row", () => {
    const r = planTranscriptActivity({
      link: byRef("john-burns.txt"),
      orgId: "C-2013",
      occurredOn: "2026-07-24",
      intel: INTEL,
    });
    expect(r.drafted).toBe(true);
    if (!r.drafted) return;
    const flat = JSON.stringify(r.draft);
    for (const banned of ["quoted", "paid", "signed", "amount", "dealValue"]) {
      expect(flat).not.toContain(banned);
    }
  });

  it("is idempotent: the same transcript and day produce the same id", () => {
    const args = { link: byRef("john-burns.txt"), orgId: "C-2013", occurredOn: "2026-07-24", intel: INTEL };
    const a = planTranscriptActivity(args);
    const b = planTranscriptActivity(args);
    expect(a.drafted && b.drafted && a.draft.id === b.draft.id).toBe(true);
  });

  it("refuses when the CRM already holds the transcript under a DIFFERENT id", () => {
    const r = planTranscriptActivity({
      link: byRef("john-burns.txt"),
      orgId: "C-2013",
      occurredOn: "2026-07-24",
      intel: INTEL,
      // The hand-published path: one of the four rows somebody wrote from data/meetings/*.
      existing: [{ id: "A-MTG-2026-07-24-ABCDEF", transcriptRef: "john-burns.txt" }],
    });
    expect(r.drafted).toBe(false);
    if (r.drafted) return;
    expect(r.refusal.kind).toBe("already-present");
    expect(r.refusal.kind === "already-present" && r.refusal.existingId).toBe("A-MTG-2026-07-24-ABCDEF");
  });

  it("refuses joseph-ontime — the near-miss is a question, not a row on C-2016", () => {
    const r = planTranscriptActivity({
      link: byRef("joseph-ontime.txt"),
      orgId: "C-2016",
      occurredOn: "2026-07-17",
      intel: INTEL,
    });
    expect(r.drafted).toBe(false);
    if (r.drafted) return;
    expect(r.refusal.kind).toBe("not-linked");
  });

  it("refuses david-cates as the registry actually stands — P-1020 carries no org", () => {
    // Not a hypothetical: the live row has no `orgId`, so the caller has no company to pass.
    expect(RECORDS.find((r) => r.id === "P-1020")).toBeTruthy();
    expect((registry as { people: { id: string; orgId?: string }[] }).people.find((p) => p.id === "P-1020")?.orgId)
      .toBeUndefined();
    const r = planTranscriptActivity({ link: byRef("david-cates.txt"), occurredOn: "2026-07-24", intel: INTEL });
    expect(r.drafted).toBe(false);
    if (r.drafted) return;
    expect(r.refusal.kind).toBe("no-org");
  });

  it("refuses without the CALL day, and says the transcription date is not it", () => {
    const r = planTranscriptActivity({ link: byRef("john-burns.txt"), orgId: "C-2013", intel: INTEL });
    expect(r.drafted).toBe(false);
    if (r.drafted) return;
    expect(r.refusal.kind).toBe("no-day");
    expect(r.refusal.why).toContain("TRANSCRIBED");
  });

  it("refuses a malformed day rather than writing it into occurred_at", () => {
    const r = planTranscriptActivity({
      link: byRef("john-burns.txt"),
      orgId: "C-2013",
      occurredOn: "July 17",
      intel: INTEL,
    });
    expect(r.drafted).toBe(false);
    if (r.drafted) return;
    expect(r.refusal.kind).toBe("no-day");
  });

  it("refuses with no intel, because the only writer in the repo would reject the row", () => {
    const r = planTranscriptActivity({ link: byRef("john-burns.txt"), orgId: "C-2013", occurredOn: "2026-07-24" });
    expect(r.drafted).toBe(false);
    if (r.drafted) return;
    expect(r.refusal.kind).toBe("no-intel");
    expect(r.refusal.why).toContain("publish-meeting-activity.mjs");
  });

  it("drops intel with no sourceRef instead of writing untraceable claims", () => {
    const r = planTranscriptActivity({
      link: byRef("john-burns.txt"),
      orgId: "C-2013",
      occurredOn: "2026-07-24",
      intel: [{ kind: "pain_point", text: "they said something", sourceRef: "  " }],
    });
    expect(r.drafted).toBe(false);
    if (r.drafted) return;
    expect(r.refusal.kind).toBe("no-intel");
  });

  it("carries an unexplained title word onto the row when a disputed pair ever does link", () => {
    // Constructed, and labelled as such: no LIVE pair is both `linked` and disputed today. The
    // invariant still has to hold, because the moment a human confirms joseph-ontime, the row that
    // results must keep "roofing" on it — renaming the file would destroy the only surviving
    // record that the mislabel happened (inc.41).
    const confirmed: TranscriptRecordLink = { ...byRef("joseph-ontime.txt"), status: "linked" };
    const r = planTranscriptActivity({ link: confirmed, orgId: "C-2016", occurredOn: "2026-07-17", intel: INTEL });
    expect(r.drafted).toBe(true);
    if (!r.drafted) return;
    expect(r.draft.sourceContext.titleWordsRecordCannotAccountFor).toEqual(["roofing"]);
    expect(r.draft.sourceContext.transcriptTitle).toBe("On Time Roofing");
  });
});
