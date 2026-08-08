/**
 * Q86 inc.40 — DoD (b), the half inc.39 named and did not do: WHICH CRM RECORD does a transcript
 * on disk belong to?
 *
 * inc.39 proved the three `.m4a` files in Drive `/Unprocessed` were transcribed on 2026-07-28, and
 * closed by saying the real defect was still open: *"these three recordings now have a transcript
 * proven to exist, and are linked to nothing in the CRM."* This module is that link — proposed,
 * never written. Nothing here creates an activity, touches a record, or moves a file.
 *
 * WHY THIS IS NOT "SEARCH THE NAME AND ATTACH IT"
 *
 * `driveDrain.ts` refusal #2 and Q86 DoD (c) both forbid welding a meeting to a record on a title
 * alone, and a person's name inside a transcript title is a weaker signal than a meeting title, not
 * a stronger one: "Call with David Cates" identifies a human, not which of that human's records —
 * or which company's — the conversation belongs to. So a link is earned the same way inc.39 earned
 * its own: **two independent signals that agree**, and `uncertain` — never `linked` — when only one
 * does.
 *
 *   1. **The record's name appears in the transcript's own title**, whole-word, after
 *      normalization. A registry name written with a parenthetical alias — `Jonathan (John) Burns`
 *      — offers TWO forms and either may match; that parenthetical is the registry's own recorded
 *      statement that the person goes by both, not a guess this module makes.
 *   2. **The record's slug matches the transcript's filename stem.** This is independent of (1)
 *      because the two strings were written by different hands at different times: the slug is a
 *      registry field a human chose, the stem is what whoever saved the audio called the file.
 *      Neither can be derived from the other, which is precisely what makes agreement worth
 *      something.
 *
 * BE HONEST ABOUT WHAT THIS PROVES. Two agreeing signals establish that a record and a transcript
 * are *about the same named subject*. They do not establish that the conversation is ABOUT that
 * record's deal, or that the transcript should be filed as that record's activity — a call with
 * David Cates could be about anyone. `linked` here means "propose this pair to a human", and the
 * caller that turns a proposal into a written activity is the thing that must answer for it.
 *
 * THE WORDS THAT DO NOT FIT ARE REPORTED, NOT SWALLOWED. `joseph-ontime.txt` is titled *"Joseph On
 * Time Roofing Call Recording"* while the only On Time record in the registry is **On Time Moving
 * and Storage** (C-2016, owner Joseph Green, $7,000 quoted 7/17). `Roofing` is not a synonym this
 * module is entitled to resolve — it is either a mis-titled file or a second company, and both
 * readings change who gets called. So every title word the matched record does not account for
 * comes back in `unexplainedTitleWords`, and a partial match that leaves any of them is capped at
 * `uncertain`. Q86 DoD (c): an uncertain pair is left BOTH and flagged, never welded.
 *
 * Pure per CR-3: no clock, no network, no filesystem, no store. Registry and transcripts are both
 * arguments.
 */

/** A CRM record as the registry describes it. Only the identifying fields are used. */
export type RegistryRecord = {
  /** `P-####` or `C-####`. */
  id: string;
  name: string;
  entityKind: "person" | "company";
  /** The registry's own slug field. Compared against the transcript filename stem. */
  legacySlug?: string | null;
};

/** The transcript side: a file measured on disk, as `local-transcripts-*.json` records it. */
export type DiskTranscript = {
  /** The filename under the transcripts directory — how a reader opens it. */
  ref: string;
  /** The title the transcriber wrote at the top of the file. */
  title: string;
};

export type TranscriptRecordStatus =
  /** Both signals agree. Propose this pair to a human. */
  | "linked"
  /** One signal fired, or words in the title the record cannot account for remain. Never counted. */
  | "uncertain"
  /** No record in the registry answers to this transcript. */
  | "none";

export type TranscriptRecordLink = {
  transcript: DiskTranscript;
  /** The record the signals point at. Present for `linked` and for `uncertain`. */
  record?: RegistryRecord;
  status: TranscriptRecordStatus;
  signals: {
    /** The registry name form that matched the title, or null. */
    nameMatched: string | null;
    /** The record slug equalled the transcript filename stem. */
    slugMatched: boolean;
  };
  /**
   * Title words the matched record does not account for, minus meeting boilerplate.
   *
   * `Roofing` on a record named `On Time Moving and Storage` lands here. It is reported rather than
   * resolved: this module has no authority to decide that a roofing call and a moving company are
   * the same engagement.
   */
  unexplainedTitleWords: string[];
  /** In words, what was and was not established. Printed beside the verdict, never inferred. */
  why: string;
};

/**
 * Words a meeting file's title carries regardless of who it is about.
 *
 * These are excluded from `unexplainedTitleWords` because flagging "call" as unexplained on a file
 * named "Call with David Cates" would bury the one word that actually matters. Kept deliberately
 * short: every word added here is a word that stops being shown to a human.
 */
export const TITLE_BOILERPLATE = [
  "call",
  "with",
  "recording",
  "meeting",
  "zoom",
  "the",
  "and",
  "a",
] as const;

/** Lowercase, drop a media/text extension, collapse anything non-alphanumeric to single spaces. */
export function normalizeTitle(title: string): string {
  return title
    .replace(/\.(txt|json|m4a|mp3|mp4|wav|aac|mov|webm|ogg|flac)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** `david-cates.txt` → `david-cates`. The stem as whoever saved the file wrote it. */
export function transcriptStem(ref: string): string {
  return ref.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
}

/**
 * Every name form the registry itself states for a record.
 *
 * `Jonathan (John) Burns` yields `jonathan burns` AND `john burns` — the parenthetical is the
 * registry's recorded statement that both are this person, so honouring it is reading the field,
 * not guessing an alias. A name with no parenthetical yields exactly one form; nothing is invented.
 */
export function nameForms(name: string): string[] {
  const forms = new Set<string>();
  forms.add(normalizeTitle(name.replace(/\([^)]*\)/g, " ")));
  const alias = name.match(/\(([^)]+)\)/);
  if (alias) {
    forms.add(normalizeTitle(name.replace(/(\S+)\s*\(([^)]+)\)/, "$2")));
    forms.add(normalizeTitle(alias[1]));
  }
  return [...forms].filter(Boolean);
}

/** Whole-word containment. `on time` is in `joseph on time roofing`; `time` alone is not a match. */
function containsWords(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const h = ` ${haystack} `;
  return h.includes(` ${needle} `);
}

/**
 * Rule one transcript against every record in the registry.
 *
 * A record whose full name is present in the title is the candidate; the slug is what confirms or
 * refuses it. When no full name is present, a record is still offered as `uncertain` if a
 * distinctive multi-word prefix of its name is (so `On Time Moving and Storage` is still reached
 * from `Joseph On Time Roofing`) — that path can never return `linked`, because the words it did
 * not match are exactly the words that would tell a human it is the wrong company.
 */
export function linkTranscriptToRecord(
  transcript: DiskTranscript,
  registry: RegistryRecord[],
): TranscriptRecordLink {
  const title = normalizeTitle(transcript.title);
  const stem = transcriptStem(transcript.ref);
  const boilerplate = new Set<string>(TITLE_BOILERPLATE);

  const unexplained = (matchedWords: string[]) => {
    const accounted = new Set(matchedWords);
    return title
      .split(" ")
      .filter((w) => w && !boilerplate.has(w) && !accounted.has(w));
  };

  // Pass one: a record whose whole name is in the title.
  for (const record of registry) {
    const form = nameForms(record.name).find((f) => containsWords(title, f));
    if (!form) continue;
    const slugMatched = Boolean(
      record.legacySlug && record.legacySlug.toLowerCase() === stem,
    );
    const slugOfForm = form.split(" ").join("-");
    const stemAgrees = slugMatched || slugOfForm === stem;
    const left = unexplained(form.split(" "));
    const status: TranscriptRecordStatus =
      stemAgrees && left.length === 0 ? "linked" : "uncertain";
    return {
      transcript,
      record,
      status,
      signals: { nameMatched: form, slugMatched: stemAgrees },
      unexplainedTitleWords: left,
      why:
        status === "linked"
          ? `title carries "${form}" and the filename stem "${stem}" agrees — two independently written strings naming the same subject; proposes ${record.id}, does not file it`
          : stemAgrees
            ? `title carries "${form}" and the stem agrees, but the title also says ${left.map((w) => `"${w}"`).join(", ")} — which ${record.id} (${record.name}) does not account for; left uncertain for a human`
            : `title carries "${form}" but the filename stem "${stem}" does not agree with ${record.id}; one signal only, never enough to link`,
    };
  }

  // Pass two: a distinctive multi-word prefix only. Reachable, reportable, never `linked`.
  for (const record of registry) {
    const words = normalizeTitle(record.name).split(" ");
    for (let take = words.length - 1; take >= 2; take -= 1) {
      const prefix = words.slice(0, take).join(" ");
      if (!containsWords(title, prefix)) continue;
      const left = unexplained(prefix.split(" "));
      return {
        transcript,
        record,
        status: "uncertain",
        signals: { nameMatched: prefix, slugMatched: false },
        unexplainedTitleWords: left,
        why: `title carries "${prefix}" but not the rest of "${record.name}", and says ${left.map((w) => `"${w}"`).join(", ")} besides — this is either a mis-titled file or a different entity, and resolving that is not this module's call`,
      };
    }
  }

  return {
    transcript,
    status: "none",
    signals: { nameMatched: null, slugMatched: false },
    unexplainedTitleWords: unexplained([]),
    why: `no record in the registry (${registry.length} read) has a name this title carries — the transcript stays unattached rather than attached to a guess`,
  };
}

/** Rule every transcript. Order is the caller's; nothing is sorted or deduplicated here. */
export function linkTranscripts(
  transcripts: DiskTranscript[],
  registry: RegistryRecord[],
): TranscriptRecordLink[] {
  return transcripts.map((t) => linkTranscriptToRecord(t, registry));
}
