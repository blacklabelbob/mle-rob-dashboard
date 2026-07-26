/**
 * Q67b — the row seam: `filter_page` returns raw database rows, the UI renders domain
 * objects, and this is the one place that turns one into the other.
 *
 * **Decided at the ROUTE, not in the table** — the same call inc.2 made for the demo
 * exclusion, for the same reason: a share link, `PeopleTable`, an export and a later agent
 * all read `/api/views/page`, and a mapping applied in one client is a mapping every other
 * consumer skips. It also cannot live in the browser at all: the existing mappers ship
 * inside `lib/storage/supabaseStore`, which constructs a service-role Supabase client at
 * module scope. Importing that into a client component would either drag the SDK into the
 * bundle or force a second, hand-written field map — and a second field map is exactly how
 * `/people` and a saved view start disagreeing about the same person.
 *
 * So: no new field mapping is written here. This file is a dispatcher over the mappers the
 * rest of the dashboard already reads its rows through (`toPerson` / `toOrgPerson` /
 * `toDeal` / `toActivity`). Every column rename since 0001 — `referred_by_org_id`,
 * `phase2_estimate`, `org_id` — is already handled there, and inheriting them is the
 * point.
 *
 * ORDER IS LOAD-BEARING: `nextPageCursor()` reads `created_at` and `id` off the RAW rows,
 * and no domain type carries `created_at`. Map after the cursor is built, never before —
 * mapping first makes every page's cursor throw "page row has no created_at", i.e. a 500
 * on page 1 of a working view. A test pins that ordering.
 */

import type { Activity, Deal, Person } from "@/lib/types";
import { FILTER_TARGETS, type FilterTarget } from "./ast";
import { toActivity, toDeal } from "@/lib/crm";
import { toOrgPerson, toPerson } from "@/lib/storage/supabaseStore";

/** What a mapped page holds, per target. `org` rows are Person-shaped by design. */
export type MappedRow = Person | Deal | Activity;

export class RowMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RowMapError";
  }
}

export function isRowMapError(e: unknown): e is RowMapError {
  return e instanceof RowMapError;
}

/**
 * Map one page of raw rows for a target.
 *
 * `org` goes through `toOrgPerson`, NOT `toPerson`: the only difference is
 * `entityKind: "company"`, and that one field is what makes a company render as a company
 * (the "biz" badge, the company record link) instead of quietly appearing as a person. The
 * `orgs` table has no `entity_kind` column to carry it, so it has to be applied here.
 *
 * A row that is not a plain object throws rather than mapping to `{id: undefined}` — a
 * nameless, un-clickable ghost row is worse than an error, because nothing about it looks
 * like a failure on screen.
 */
export function mapPageRows(target: FilterTarget, rows: readonly unknown[]): MappedRow[] {
  if (!(FILTER_TARGETS as readonly string[]).includes(target)) {
    throw new RowMapError(`unknown filter target: ${String(target)}`);
  }
  return rows.map((row, i) => {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new RowMapError(`page row ${i} is not an object`);
    }
    switch (target) {
      case "person":
        return toPerson(row);
      case "org":
        return toOrgPerson(row);
      case "deal":
        return toDeal(row);
      case "activity":
        return toActivity(row);
    }
  });
}
