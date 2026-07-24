import { lintNotes, type NoteLint } from "@/lib/notes";

// Notes-shape watchdog (critic-rob Q43 punch #2, 2026-07-23).
//
// `lintNotes` knows which stored note shapes defeat the notes/enrichment split
// — but a guarantee that nothing consumes is prose, not code (CR-3). This is
// the consumer: the nightly integrity cron runs it over every people/orgs row
// and raises a "Things to Address" flag on the offending RECORD, so Rob sees
// "miga-food is showing a provenance dump as its human note" on miga's own
// page instead of nobody noticing until the next review.
//
// Pure + deterministic: rows in, findings out. No clock, no network.

export interface NoteShapeFinding {
  entityId: string;
  entityName: string;
  code: NoteLint["code"];
  /** First offending excerpt, for the flag body. */
  detail: string;
}

export interface NotesRow {
  id: string;
  name: string | null;
  notes: string | null;
}

// One finding per (record, issue code) — a row with three mid-line markers is
// one thing to fix, not three flags.
export function findNoteShapeIssues(rows: NotesRow[]): NoteShapeFinding[] {
  const findings: NoteShapeFinding[] = [];
  for (const row of rows) {
    const seen = new Set<NoteLint["code"]>();
    for (const issue of lintNotes(row.notes)) {
      if (seen.has(issue.code)) continue;
      seen.add(issue.code);
      findings.push({
        entityId: row.id,
        entityName: row.name?.trim() || row.id,
        code: issue.code,
        detail: issue.detail,
      });
    }
  }
  return findings;
}

// Deterministic title = idempotency key, exactly like the orphan/credential
// watchdogs: re-runs never duplicate a flag, and resolving one is permanent
// unless the note is edited into a NEW bad shape.
export function noteShapeFlagTitle(f: NoteShapeFinding): string {
  return f.code === "mid-line-marker"
    ? "Notes: enrichment marker buried mid-line"
    : "Notes: stray leading separator";
}

export function noteShapeFlagDetail(f: NoteShapeFinding): string {
  return f.code === "mid-line-marker"
    ? `This record's Notes run enrichment provenance ("${f.detail}") into the middle of a human line, so it renders inside the Notes box instead of the collapsed Enrichment section. Fix the stored note: start the provenance on its own line.`
    : `This record's Notes open with a stray separator ("${f.detail}"), so the human note reads as a fragment. Strip the leading punctuation.`;
}
