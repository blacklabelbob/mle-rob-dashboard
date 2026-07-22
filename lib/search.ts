// Task 4.1 (Q33): full-text search over people + orgs — pure helpers (CR-3).
// The route (/api/admin/search) does store I/O only; every decision lives here.
// SEARCH_COLUMNS must match the coalesce list in 0007_people_search.sql — the
// gate test parses the migration off disk and fails on drift.

export const SEARCH_COLUMNS = [
  "name",
  "business",
  "role",
  "email",
  "phone",
  "relationship",
  "description",
  "notes",
] as const;

export type SearchHit = {
  id: string;
  name: string;
  business: string | null;
  role: string | null;
  verticalId: string | null;
  kind: "person" | "org";
};

// Raw row shape as selected from either table.
export type SearchRow = {
  id: string;
  name: string;
  business: string | null;
  role: string | null;
  vertical_id: string | null;
};

/** Validate + normalize the ?q= input. Returns null when there is nothing to
 * search (route answers 400) — never lets whitespace-only queries through. */
export function normalizeQuery(q: unknown): string | null {
  if (typeof q !== "string") return null;
  const trimmed = q.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, 200); // hard cap: nobody types a 200-char search
}

/** Map raw table rows to hits, tagging entity kind and dropping demo records
 * (same "(DEMO)" convention as lib/stats.isDemo — search never surfaces them). */
export function toHits(rows: SearchRow[], kind: "person" | "org"): SearchHit[] {
  return rows
    .filter((r) => !r.name.includes("(DEMO)"))
    .map((r) => ({
      id: r.id,
      name: r.name,
      business: r.business ?? null,
      role: r.role ?? null,
      verticalId: r.vertical_id ?? null,
      kind,
    }));
}

/** Deterministic merge: people before orgs at equal rank, then name A→Z, id
 * tiebreak — two runs on the same data are byte-identical (scoring-pattern §3). */
export function mergeHits(people: SearchHit[], orgs: SearchHit[], limit = 25): SearchHit[] {
  const all = [...people, ...orgs].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    if (a.kind !== b.kind) return a.kind === "person" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  return all.slice(0, limit);
}
