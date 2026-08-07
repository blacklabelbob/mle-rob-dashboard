// Q84 inc.15 — the first honest step toward closing the HIGH-severity finding, and it
// writes nothing.
//
// inc.14 put flag #133 on the dedupe mechanism, so the ledger now states a true count of
// the meetings the CRM never heard about. What it states is a WALL: "no path writes a
// meeting activity, one pipeline closes all 40". Six increments have now improved how that
// sentence is maintained and none has moved the number, because the number only moves when
// something can say WHICH company each of those meetings belongs to. That question has a
// cheap answer for some rows and no answer at all for others, and nobody has ever separated
// the two — so "build the pipeline" has stayed one undifferentiated 40-row task.
//
// This module separates them. It is PURE per CR-3 (no clock, no network, no Supabase, no
// Notion) and it is a PLAN — it returns what an activity WOULD attach to and never attaches
// anything. That is not caution theatre: `archiveCheck` refuses to auto-reconcile for the
// same stated reason, and it is the right one. Writing a meeting onto the wrong company is
// unrecoverable and quietly corrupts the attribution chain Rob shows people; an unattached
// meeting is a click.
//
// Matching is EXACT-AFTER-NORMALIZATION ONLY, reusing `normalizeName` from the dedup
// matcher rather than growing a third name ladder in this repo (inc.4/inc.5 spent two
// increments deleting the second copy of one). "PropLogix, LLC." and "proplogix llc" are
// the same org; anything that needs edit distance to agree is reported as unknown, because
// a fuzzy hit here becomes a real activity row on a real company record.

// Q84 inc.17 — the archive names some companies by DOMAIN, and the CRM stores domains.
//
// inc.16 named this as the next increment on the reasoning that `cgroofing.net` and
// `gulfregroup.com` are the CRM's orgs "under a different field". Half of that is right and
// the live data disproves the other half, which is stated here rather than quietly dropped:
// the CRM's CG Roofing Group is `cgroofinggroup.com` and its Gulf Coast RE Group is
// `gulfcoastregroup.com`. Those are DIFFERENT HOSTS. This pass matches hosts exactly and
// therefore closes none of those three rows — and that is the correct outcome, not a
// shortfall: equating `cgroofing.net` with `cgroofinggroup.com` is a guess that would weld a
// real call onto a company record, which is the one thing this module refuses to do.
//
// What the pass changes is the ASK. A domain-shaped company name is no longer "the spelling
// differs" (it does not — nobody misspells a host); it is a one-field fix Rob makes ONCE in
// the CRM, on the org's own Domain field, after which every future run of this pass attaches
// that meeting unattended. The affordance moves from "go retype something in Notion" to "tell
// the CRM the other domain this company uses".

// Q84 inc.18 — the named-next premise was wrong AGAIN, and in the same direction: the two
// "companies the CRM genuinely does not have" are both IN the CRM.
//
// inc.17 named this increment on the reading that the last two unknown-company rows —
// `Omega Title` and `Dixith` — are companies the CRM has never heard of, so the honest next
// step was the org-proposals route. The live rows say otherwise:
//
//   - `Omega Title`  → the CRM holds **Omega Title (FL)** [C-2019]. Same company, a state
//                      qualifier in the name field. Exact-after-normalization cannot see it.
//   - `Dixith`       → not a company at all. The CRM holds the PERSON **Dixith Magadiev**
//                      [P-1010], attached to **Dix Healthcare AI (7 models)** [C-2006]. The
//                      archive's "Company Meeting with" field was filled with a human's name.
//
// Acting on the old premise would have created two duplicate orgs through org-proposals —
// exactly the corruption this module exists to refuse, arrived at by following its own plan.
// So the wrong instruction is the defect: both rows currently tell a reader "either the
// company is missing from the CRM or the spelling differs", and BOTH halves are false.
//
// The fix is a NEAR MISS, never a match. This pass still attaches nothing and still refuses
// to equate two strings that are not equal — a "(FL)" could just as easily be "(TX)" on a
// different company, and a first name is shared by many people. What changes is that the row
// now names the record it nearly hit, with its id, so the human answering it is confirming a
// specific record rather than being sent to create a new one.

// Q84 inc.63 — the same false sentence inc.62 killed in the REPORT was still on the path that
// decides what gets WRITTEN, and here it was also blocking a row that has nothing wrong with it.
//
// `Meeting 2026-07-30` (Martin Fierro Restaurant) was bucketed `no-date` and told *"the row has
// no Call Date — set it in Notion; an activity with no day cannot be written, and a guessed day
// is a wrong record"*. The day is not guessed and it is not missing: the row is STATING it, in
// its own title. So the row was told to supply a fact it had already supplied, and a meeting a
// pipeline could file sat in the human pile.
//
// The recovery is `effectiveDay` — inc.62's ladder, imported, NOT re-implemented (this repo has
// twice paid to delete a second copy of one name rule). It reads only the whole-string stamp
// shapes; `Gulf Coast RE KICKOFF 2026-07-22` yields nothing, because scanning inside a human
// title is how a wrong day gets welded onto a real meeting.
//
// WHY A RECOVERED DAY IS TRUSTED ENOUGH TO WRITE, checked on prod before this was written and
// not assumed: on every archive row carrying BOTH a human Call Date and a stamped title, the two
// agree — `2026-07-28 / Meeting 2026-07-28`, `2026-06-16 / Meeting 2026-06-16T11:05…`,
// `2026-06-05 / 2026-06-05T13:56…`. Three for three, zero disagreements in 41 rows. That is the
// evidence, and `dayFromTitleStamp` is pinned against those exact shapes.
//
// It is still not laundered into looking like something a human typed. Every row now carries
// `occursOn` (the day an activity would be dated) beside `dayFrom` ("call-date" | "title"), so
// the writer Q85 builds can hold its own policy on title-derived days instead of inheriting this
// module's opinion as an unmarked fact. `no-date` stays exactly as it was for rows where no day
// can be read — there the sentence is true.

// Q85 inc.3 — `no-company` was telling eleven rows that only someone who was there could say
// who the meeting was with, on rows whose own title states a host the CRM already holds.
//
// Same shape as inc.63, which killed the same false sentence about the DAY: a row was asked to
// supply a fact it had already supplied. The near miss is built in `titleCompany.ts` and lands
// here as `NearMiss.kind = "title-host"` — a QUESTION with a specific org attached, never a
// match, because a title names the topic ("Cloudflare / SEO optimization") as readily as the
// counterparty. See that module for the full reasoning; it is not repeated here.

import { normalizeName } from "@/lib/dedup/match";
import { titleHostHits } from "./titleCompany";
import { effectiveDay, type ArchiveRowDetail } from "./unexplainedRows";

/**
 * The CRM side, narrowed to what a match can honestly use. `domain` and `website` are both
 * carried because the live rows use them inconsistently — one org has a bare `domain`, others
 * have only a full `website` URL — and an index that read one field would miss real orgs.
 */
export type CrmOrg = { id: string; name: string; domain?: string | null; website?: string | null };

/**
 * The CRM's people, carried only so an unknown-company row can say WHICH person it nearly hit.
 * A person is never a match target — a meeting activity attaches to a company — but "Dixith"
 * in a company field is a fact about a person, and the CRM already knows which org they work
 * for. Reporting that beats telling a human the company is missing when it is not.
 */
export type CrmPerson = { id: string; name: string; orgId?: string | null };

/**
 * Why an unknown-company row is unknown, when the CRM holds something close. NEVER a match:
 * every one of these is a question with a specific record attached, answered by a human once.
 *
 *   - `org-qualifier`      — an org whose name differs only by a trailing parenthetical
 *                            ("Omega Title" vs "Omega Title (FL)"). Not auto-equated: the
 *                            qualifier can be what distinguishes two real companies.
 *   - `person-not-company` — the value names a CRM person, not a company. Their org is the
 *                            likely answer, but the archive did not say so and this pass does
 *                            not decide it.
 *   - `title-host`         — the "Company Meeting with" field does not resolve, but the row's
 *                            own TITLE states a host a CRM org is registered at. The strongest
 *                            near miss on this list and still not a match: a title names the
 *                            topic as often as the counterparty (Q85 inc.3).
 */
export type NearMiss =
  | { kind: "org-qualifier"; orgs: CrmOrg[] }
  | { kind: "person-not-company"; people: CrmPerson[] }
  | { kind: "title-host"; hits: { host: string; orgs: CrmOrg[] }[] };

/** A trailing parenthetical qualifier, removed. "Omega Title (FL)" → "Omega Title". */
export function stripQualifier(name: string): string {
  return (name || "").replace(/\s*\([^()]*\)\s*$/, "").trim();
}

/**
 * A host, or "" when the value is not one. Deliberately strict: scheme, `www.`, port, path,
 * query and a trailing dot come off, and anything with whitespace or no dot is rejected. A
 * company field of "Gulf Coast RE Group" must NOT be read as a host — it would then miss the
 * name index and match nothing, turning a working name match into silence.
 */
export function extractHost(value: string | null | undefined): string {
  let s = (value || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#]/)[0];
  s = s.replace(/^www\./, "").replace(/\.$/, "");
  s = s.split("@").pop() || ""; // an email in a website field yields its host, not the mailbox
  s = s.split(":")[0];
  if (!s || /\s/.test(s) || !/^[a-z0-9.-]+$/.test(s)) return "";
  if (!s.includes(".")) return "";
  return s;
}

/**
 * Who can close the row, which is the only split that changes what happens next:
 *
 *   - `attachable`       — the archive names a company and exactly one CRM org normalizes to
 *                          it. A pipeline can write this activity unattended once one exists.
 *   - `ambiguous-company`— the name matches more than one org row. Never resolved by picking:
 *                          two orgs sharing a name is itself a finding (dedupe), and guessing
 *                          welds the call onto whichever happens to sort first.
 *   - `unknown-company`  — a company IS named and no CRM org matches it. Cheap for a human:
 *                          either the org is missing from the CRM or the spelling differs.
 *   - `no-company`       — the archive row never said who the meeting was with. Only someone
 *                          who was there can, so this lands in the same pile as the rows in
 *                          `unexplainedRows` — it is not a matching failure.
 *   - `no-date`          — the company IS known and NO day can be read from the row at all —
 *                          neither Call Date nor a stamped title. An activity is an event on a
 *                          day; there is nothing to write into `occurred_at`. Caught because
 *                          the first live run called such a row "attachable" and a plan that
 *                          overstates what a pipeline can do unattended is how the pipeline
 *                          later writes a meeting onto the wrong day. Since inc.63 this bucket
 *                          means what it says: a row whose title states its day is not in it.
 */
export type ActivityDisposition =
  | "attachable"
  | "ambiguous-company"
  | "unknown-company"
  | "no-company"
  | "no-date";

export type ActivityPlanRow = {
  row: ArchiveRowDetail;
  disposition: ActivityDisposition;
  /**
   * Which field agreed, on the rows where something did. Recorded because the two are not
   * equally strong evidence to a human reading the plan: a name match can be two companies
   * that happen to share a name, a host match is the company's own registered address.
   */
  matchedBy?: "name" | "domain";
  /** Set only when `attachable` — the one org an activity would be written onto. */
  org?: CrmOrg;
  /**
   * The day an activity would be dated, on the rows where one can be read. Carried so a writer
   * never has to re-derive it and reach a different answer than the plan a human approved.
   */
  occursOn?: string;
  /**
   * Where `occursOn` came from. Never collapsed into the day itself: `call-date` is a human
   * typing what happened, `title` is this module reading a machine stamp out of a title nobody
   * chose. They are not equally strong, and the writer is entitled to treat them differently.
   */
  dayFrom?: "call-date" | "title";
  /** Set only when `ambiguous-company` — every org that normalized to the same name. */
  candidates?: CrmOrg[];
  /**
   * Set only when `unknown-company` AND the CRM holds something close. Its presence changes
   * the ask from "create the company" to "confirm this record" — the difference between a
   * clean CRM and two rows for one company.
   */
  nearMiss?: NearMiss;
  /** Plain-language next step, in the words of the field a human would go fix. */
  nextStep: string;
};

export type ActivityPlan = {
  rows: ActivityPlanRow[];
  counts: {
    /** Rows fed in — the CRM-gap list, not the whole archive. */
    considered: number;
    attachable: number;
    ambiguousCompany: number;
    unknownCompany: number;
    noCompany: number;
    noDate: number;
  };
};

/**
 * Index the CRM orgs by normalized name. A LIST per key, not a single org: two orgs with the
 * same name is a real state in this database (it is what the dedupe queue exists for), and
 * an index that keeps only the last one would silently make an ambiguous row look decided.
 */
function byNormalizedName(orgs: CrmOrg[]): Map<string, CrmOrg[]> {
  const index = new Map<string, CrmOrg[]>();
  for (const org of orgs) {
    const key = normalizeName(org.name || "");
    if (!key) continue; // an org with no name can never be the answer to "which company"
    const bucket = index.get(key);
    if (bucket) bucket.push(org);
    else index.set(key, [org]);
  }
  return index;
}

/**
 * Index the CRM orgs by host, from BOTH `domain` and `website`. Same list-per-key shape as the
 * name index and for the same reason — two orgs on one host is a real (and worth-knowing)
 * state, and collapsing them would make an ambiguous row look decided. An org contributing the
 * same host twice (bare `domain` plus a `website` URL of it) is counted once: that is one
 * company stating one address, not an ambiguity.
 *
 * Exported since Q84 inc.64 so `attendeeCompany` matches attendee domains against the SAME index
 * this module matches archive company fields against. A second host index would be a second rule.
 */
export function indexOrgsByHost(orgs: CrmOrg[]): Map<string, CrmOrg[]> {
  const index = new Map<string, CrmOrg[]>();
  for (const org of orgs) {
    for (const host of new Set([extractHost(org.domain), extractHost(org.website)])) {
      if (!host) continue;
      const bucket = index.get(host);
      if (bucket) {
        if (!bucket.some((o) => o.id === org.id)) bucket.push(org);
      } else index.set(host, [org]);
    }
  }
  return index;
}

/**
 * Index orgs by their name with a trailing qualifier removed — but ONLY where that actually
 * differs from the full name, so a plain org never appears here and this index can never
 * shadow the exact one. Feeds near misses, never matches.
 */
function byStrippedName(orgs: CrmOrg[]): Map<string, CrmOrg[]> {
  const index = new Map<string, CrmOrg[]>();
  for (const org of orgs) {
    const full = normalizeName(org.name || "");
    const stripped = normalizeName(stripQualifier(org.name || ""));
    if (!stripped || stripped === full) continue;
    const bucket = index.get(stripped);
    if (bucket) bucket.push(org);
    else index.set(stripped, [org]);
  }
  return index;
}

/**
 * Index people by full name AND by first name. The first-name key is deliberately loose — it
 * collides, and that is acceptable precisely because nothing here ever becomes a match: every
 * colliding person is reported, and a human picks. A single-token company field ("Dixith") is
 * the case this exists for.
 */
function byPersonName(people: CrmPerson[]): Map<string, CrmPerson[]> {
  const index = new Map<string, CrmPerson[]>();
  const add = (key: string, person: CrmPerson) => {
    if (!key) return;
    const bucket = index.get(key);
    if (bucket) {
      if (!bucket.some((p) => p.id === person.id)) bucket.push(person);
    } else index.set(key, [person]);
  };
  for (const person of people) {
    const full = (person.name || "").trim();
    if (!full) continue;
    add(normalizeName(full), person);
    add(normalizeName(full.split(/\s+/)[0]), person);
  }
  return index;
}

/**
 * @param archiveOnly the meetings the CRM has no activity for — `ArchiveCheck.archiveOnly`,
 *   read with the `company` field the Notion row carries ("Company Meeting with").
 * @param orgs every CRM org, id + name.
 *
 * The whole archive row is carried through, not just an id, so a report can print the day
 * and the title without a second lookup that could disagree with this pass.
 */
export function planMeetingActivities(
  archiveOnly: ArchiveRowDetail[],
  orgs: CrmOrg[],
  people: CrmPerson[] = []
): ActivityPlan {
  const index = byNormalizedName(orgs);
  const hostIndex = indexOrgsByHost(orgs);
  const strippedIndex = byStrippedName(orgs);
  const personIndex = byPersonName(people);
  /**
   * What the row's own title says, when the company field could not answer. Returns the near
   * miss AND the sentence, together, so the two can never describe different orgs.
   */
  const fromTitle = (
    row: ArchiveRowDetail
  ): { nearMiss: NearMiss; nextStep: string } | undefined => {
    const hits = titleHostHits(row.title, hostIndex);
    if (!hits.length) return undefined;
    const named = hits
      .flatMap((h) => h.orgs.map((o) => `${o.name} [${o.id}] (${h.host})`))
      .join(", ");
    const single = hits.length === 1 && hits[0].orgs.length === 1;
    return {
      nearMiss: { kind: "title-host", hits },
      nextStep:
        `this row's own title states ${hits.length === 1 ? "a domain" : `${hits.length} domains`} the CRM already holds: ${named} — ` +
        (single
          ? "confirm that is who the meeting was WITH and put it in Notion's “Company Meeting with”, and this row attaches itself"
          : "confirm which of these the meeting was with and put it in Notion's “Company Meeting with”") +
        "; it is not attached here because a meeting title names what the call was ABOUT at " +
        "least as often as who it was with",
    };
  };

  const rows: ActivityPlanRow[] = archiveOnly.map((row) => {
    const named = (row.company || "").trim();
    if (!named) {
      const title = fromTitle(row);
      if (title) {
        return {
          row,
          disposition: "unknown-company",
          nearMiss: title.nearMiss,
          nextStep: `Notion's “Company Meeting with” is empty on this row, but ${title.nextStep}`,
        };
      }
      return {
        row,
        disposition: "no-company",
        nextStep:
          "the archive row never says who this was with — fill Notion's “Company Meeting with”, " +
          "or leave it: an activity attached to nobody is not worth writing",
      };
    }
    // Deliberately whole-string: a "Company Meeting with" of "Omega & Gulf Coast" is NOT split
    // on the separator and hopefully matched to one of them. Splitting would invent a decision
    // about which company owns a meeting that names two, and that is exactly the write nothing
    // here is allowed to guess at.
    // Name first, host second. Name is what the field is FOR, and a host is only consulted
    // when the field holds one — so a company that has both a name row and a host row in the
    // archive resolves the same way both times.
    const namedHost = extractHost(named);
    const nameHits = index.get(normalizeName(named)) || [];
    const hostHits = nameHits.length ? [] : namedHost ? hostIndex.get(namedHost) || [] : [];
    const hits = nameHits.length ? nameHits : hostHits;
    const matchedBy: "name" | "domain" = nameHits.length ? "name" : "domain";
    // The day, resolved once. `row.day` is what a human typed and always wins; the title stamp
    // is only consulted when that field is empty, so this can never overwrite a human.
    const occursOn = effectiveDay(row);
    const dayFrom: "call-date" | "title" = row.day ? "call-date" : "title";
    if (hits.length === 1 && !occursOn) {
      return {
        row,
        disposition: "no-date",
        org: hits[0],
        matchedBy,
        nextStep:
          `the company is known (${hits[0].name}) but no day can be read from this row — ` +
          "set Call Date in Notion; an activity with no day cannot be written, and a guessed day " +
          "is a wrong record",
      };
    }
    if (hits.length === 1) {
      return {
        row,
        disposition: "attachable",
        org: hits[0],
        matchedBy,
        occursOn,
        dayFrom,
        nextStep:
          `a meeting activity would attach to ${hits[0].name} [${hits[0].id}] on ${occursOn}` +
          (matchedBy === "domain" ? ` (matched on the org's own domain ${namedHost})` : "") +
          (dayFrom === "title"
            ? " — the day is read from the row's own title, not from Call Date, so filling Call " +
              "Date in Notion is still worth doing"
            : "") +
          " — nothing is written by this pass",
      };
    }
    if (hits.length > 1) {
      return {
        row,
        disposition: "ambiguous-company",
        candidates: hits,
        matchedBy,
        nextStep:
          `${hits.length} CRM orgs ${matchedBy === "domain" ? `use the domain ${namedHost}` : `are named “${named}”`} — ` +
          "merge or rename them first; picking one here would weld the call onto whichever sorted first",
      };
    }
    // A domain-shaped value gets its own ask. It is NOT a spelling problem — nobody
    // mistypes a host — and the fix is one field in the CRM, not a retype in Notion. Once
    // that host is on the org, this row attaches itself on the next run, permanently.
    if (namedHost) {
      // The title is consulted BEFORE the "add it to the CRM" instruction is printed. On the
      // live rows this is the difference between telling Rob to register `cgroofing.net` on
      // some org and telling him his title already names `cgroofinggroup.com`, which is
      // C-2017's registered host — one of those asks creates a second CG Roofing row.
      const title = fromTitle(row);
      return {
        row,
        disposition: "unknown-company",
        ...(title ? { nearMiss: title.nearMiss } : {}),
        nextStep: title
          ? `the archive names this meeting by domain (${namedHost}) and no CRM org carries that host — but ${title.nextStep}`
          : `the archive names this meeting by domain (${namedHost}) and no CRM org carries that host — ` +
            "add it to the right org's Domain field in the CRM (a company can use more than one) " +
            "and this row attaches itself; a look-alike host is never assumed to be the same company",
      };
    }
    // Before telling anyone the company is missing, check what the CRM nearly has. Saying
    // "missing" when it is not is how a second row for one company gets created.
    // Org qualifier first: it is evidence about a COMPANY, which is what the field claims to
    // hold. A person's name in that field is a filling mistake, and ranked accordingly.
    const qualifierHits = strippedIndex.get(normalizeName(named)) || [];
    if (qualifierHits.length) {
      return {
        row,
        disposition: "unknown-company",
        nearMiss: { kind: "org-qualifier", orgs: qualifierHits },
        nextStep:
          `no CRM org is named exactly “${named}”, but ${qualifierHits.length === 1 ? "one is" : `${qualifierHits.length} are`} ` +
          `the same name plus a qualifier: ${qualifierHits.map((o) => `${o.name} [${o.id}]`).join(", ")} — ` +
          "confirm it is the same company (rename it or fill its Domain), and this row attaches itself; " +
          "the qualifier is not dropped here because it can be what separates two real companies",
      };
    }
    const personHits = personIndex.get(normalizeName(named)) || [];
    if (personHits.length) {
      const withOrg = personHits.filter((p) => p.orgId);
      return {
        row,
        disposition: "unknown-company",
        nearMiss: { kind: "person-not-company", people: personHits },
        nextStep:
          `“${named}” is not a company in the CRM — it names ${personHits.length === 1 ? "a person" : `${personHits.length} people`}: ` +
          personHits.map((p) => `${p.name} [${p.id}]${p.orgId ? ` → ${p.orgId}` : " (no org)"}`).join(", ") +
          (withOrg.length
            ? ` — put that person's company in Notion's “Company Meeting with”; do NOT create a new org, ${withOrg.length === 1 ? "theirs" : "one of these"} already exists`
            : " — and that person has no company in the CRM yet, so the company is the missing record, not the meeting"),
      };
    }
    const title = fromTitle(row);
    if (title) {
      return {
        row,
        disposition: "unknown-company",
        nearMiss: title.nearMiss,
        nextStep: `no CRM org is named “${named}”, but ${title.nextStep}`,
      };
    }
    return {
      row,
      disposition: "unknown-company",
      nextStep: `no CRM org is named “${named}” — either the company is missing from the CRM or the spelling differs`,
    };
  });

  const count = (d: ActivityDisposition) => rows.filter((r) => r.disposition === d).length;
  return {
    rows,
    counts: {
      considered: archiveOnly.length,
      attachable: count("attachable"),
      ambiguousCompany: count("ambiguous-company"),
      unknownCompany: count("unknown-company"),
      noCompany: count("no-company"),
      noDate: count("no-date"),
    },
  };
}
