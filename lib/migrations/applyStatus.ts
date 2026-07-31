/**
 * Q84 inc.51 — the backlog of migrations that are written, tested and NOT APPLIED.
 *
 * inc.50 ended with `0034_dedup_review.sql` committed and unapplied, beside
 * `0032_role_read_grants.sql` in the same state since Q73. Both say so — in
 * PROSE, in a comment header, in two different phrasings:
 *
 *   0032: `-- *** NOT APPLIED. *** Rob's go gates the rollout half.`
 *   0034: `-- Applying it is Rob's \`supabase db push\` — nothing here has been applied.`
 *
 * Prose is not a ledger. Nothing reads either sentence, so "written, tested, not
 * applied" has happened twice and the only record that it is OUTSTANDING lives in
 * increment notes nobody greps. A third one would be invisible the same way.
 *
 * This module is the machine half. One canonical marker line per migration:
 *
 *   -- APPLY-STATUS: PENDING (owner: rob)
 *   -- APPLY-STATUS: APPLIED
 *
 * and one rule with teeth: a migration whose PROSE claims it is unapplied must
 * carry the marker. That disagreement — a human writing it where only humans can
 * see — is the exact failure this catches, and it is a test failure, not a note.
 *
 * Pure per CR-3: no clock, no filesystem, no network. Callers read the files.
 */

export type ApplyStatus = "pending" | "applied" | "unmarked";

export type MarkerParse = {
  status: ApplyStatus;
  /** Owner named in the marker, when it declares one (`(owner: rob)`). */
  owner: string | null;
};

/**
 * The one machine-readable form. Anchored to the start of a comment line so a
 * marker quoted inside a sentence (or inside this file's own prose) is not a
 * declaration.
 */
const MARKER = /^--\s*APPLY-STATUS:\s*(PENDING|APPLIED)\b[ \t]*(?:\(owner:\s*([^)]+)\))?/im;

export function parseApplyStatus(sql: string): MarkerParse {
  const m = MARKER.exec(sql);
  if (!m) return { status: "unmarked", owner: null };
  return {
    status: m[1].toUpperCase() === "PENDING" ? "pending" : "applied",
    owner: m[2] ? m[2].trim() : null,
  };
}

/**
 * The phrasings a human actually reached for when they meant "this is not live
 * yet". Deliberately a list of observed sentences rather than a clever pattern:
 * each entry is a real line from a real migration, so the ladder cannot claim to
 * cover a phrasing nobody has written.
 */
const PROSE_CLAIMS: RegExp[] = [
  /\bnot\s+applied\b/i,
  /\bnothing\s+here\s+has\s+been\s+applied\b/i,
  /\bhas\s+not\s+been\s+applied\b/i,
  /\bnot\s+yet\s+applied\b/i,
  /\bunapplied\b/i,
];

/** The matched sentence when the file's prose claims it is unapplied, else null. */
export function prosePendingClaim(sql: string): string | null {
  for (const line of sql.split("\n")) {
    if (!line.trimStart().startsWith("--")) continue;
    // The marker itself is a declaration, not a prose claim about one.
    if (/^--\s*APPLY-STATUS:/i.test(line.trim())) continue;
    if (PROSE_CLAIMS.some((re) => re.test(line))) return line.trim();
  }
  return null;
}

export type MigrationFile = { name: string; sql: string };

export type PendingEntry = {
  name: string;
  owner: string | null;
  /** Why it is on the backlog: the marker, or the prose that contradicts it. */
  evidence: string;
};

export type Disagreement = {
  name: string;
  prose: string;
  marker: ApplyStatus;
  reason: string;
};

export type Backlog = {
  pending: PendingEntry[];
  disagreements: Disagreement[];
  /** Files carrying no marker at all — reported, never silently assumed applied. */
  unmarked: string[];
};

/**
 * The backlog, in one place, off the files themselves.
 *
 * `unmarked` is returned rather than folded into "applied" on purpose: this
 * convention arrives at migration 0035, so the 33 files that predate it have no
 * marker and inferring "applied" from silence is the same guess that let two
 * pending migrations go untracked. They are listed, and the caller says so.
 */
export function migrationBacklog(files: MigrationFile[]): Backlog {
  const pending: PendingEntry[] = [];
  const disagreements: Disagreement[] = [];
  const unmarked: string[] = [];

  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    const { status, owner } = parseApplyStatus(file.sql);
    const prose = prosePendingClaim(file.sql);

    if (status === "pending") {
      pending.push({ name: file.name, owner, evidence: prose ?? "APPLY-STATUS: PENDING" });
      continue;
    }

    if (prose) {
      // A human wrote "not applied" where only humans can see it. This is the
      // failure mode, so it is both a disagreement AND still on the backlog —
      // suppressing it until someone adds a marker would lose the migration.
      disagreements.push({
        name: file.name,
        prose,
        marker: status,
        reason:
          status === "unmarked"
            ? "prose says unapplied, no APPLY-STATUS marker — invisible to every reader but a human"
            : "prose says unapplied, marker says APPLIED — one of the two is wrong",
      });
      pending.push({ name: file.name, owner, evidence: prose });
      continue;
    }

    if (status === "unmarked") unmarked.push(file.name);
  }

  return { pending, disagreements, unmarked };
}
