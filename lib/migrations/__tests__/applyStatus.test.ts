import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  migrationBacklog,
  parseApplyStatus,
  prosePendingClaim,
  type MigrationFile,
} from "../applyStatus";

// Q84 inc.51 — the backlog is only a ledger if drift fails a test. Driven off the
// REAL migrations directory (the 0021/0034 precedent — parsed, not eyeballed), so
// the next migration that says "not applied" in a comment and nowhere else turns
// this file red instead of joining an invisible pile.

const DIR = path.join(process.cwd(), "supabase/migrations");

const FILES: MigrationFile[] = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((name) => ({ name, sql: readFileSync(path.join(DIR, name), "utf8") }));

describe("the marker ladder", () => {
  it("reads PENDING and APPLIED, with and without an owner", () => {
    expect(parseApplyStatus("-- APPLY-STATUS: PENDING (owner: rob)\nbegin;")).toEqual({
      status: "pending",
      owner: "rob",
    });
    expect(parseApplyStatus("-- APPLY-STATUS: APPLIED\nbegin;")).toEqual({
      status: "applied",
      owner: null,
    });
    expect(parseApplyStatus("begin;").status).toBe("unmarked");
  });

  it("a marker quoted mid-sentence is not a declaration", () => {
    // Documentation about the convention must not declare a status — otherwise
    // this very repo's prose would file migrations onto the backlog.
    const doc = "-- write `APPLY-STATUS: PENDING` at the top of the file\nbegin;";
    expect(parseApplyStatus(doc).status).toBe("unmarked");
  });

  it("prose claims are read from comments only, and never from the marker line", () => {
    expect(prosePendingClaim("-- *** NOT APPLIED. *** Rob's go gates this.")).toContain(
      "NOT APPLIED",
    );
    expect(prosePendingClaim("-- APPLY-STATUS: PENDING (owner: rob)")).toBeNull();
    // A SQL string that happens to contain the words is not a comment.
    expect(prosePendingClaim("insert into notes (body) values ('not applied');")).toBeNull();
  });
});

describe("the live migrations directory", () => {
  it("every migration whose prose says it is unapplied carries the marker", () => {
    const { disagreements } = migrationBacklog(FILES);
    // The failure this exists to catch: a human writes "NOT APPLIED" in a header
    // and nothing else in the repo knows. Message names the file and the line so
    // the fix is one marker, not an investigation.
    expect(
      disagreements.map((d) => `${d.name}: ${d.reason} — ${d.prose}`),
      "add `-- APPLY-STATUS: PENDING (owner: <who runs it>)` to the file header",
    ).toEqual([]);
  });

  // Q84 inc.71 — this pin is deliberately a LIVE-DIRECTORY assertion, and it earned its
  // keep this run: adding `0035_flag_payload.sql` failed it before the file was mentioned
  // anywhere else. Growing the list is a decision, not a maintenance chore — every entry
  // added here lengthens the ONE `supabase db push` Rob owes, and that has to be seen.
  // 2026-08-05: grew to FOUR, and the pin did its job again — `0036_client_demos.sql`
  // failed this test before it was mentioned anywhere else. Recording the decision here
  // rather than just bumping the number: Rob asked for the mockups we build for prospects
  // to be captured ("we SHOULD be capturing the mockups we create for them"), and there
  // was no column for one — a preview URL was sitting in `orgs.website` pretending to be
  // a company's own site. That is a schema gap, so it costs a migration, so it lengthens
  // the push Rob owes. Seen and accepted.
  it("the backlog is exactly the four migrations Rob still has to push", () => {
    const { pending } = migrationBacklog(FILES);
    expect(pending.map((p) => p.name)).toEqual([
      "0032_role_read_grants.sql",
      "0034_dedup_review.sql",
      "0035_flag_payload.sql",
      "0036_client_demos.sql",
    ]);
    // Nameless work is unassignable work — a pending migration says whose push it is.
    for (const entry of pending) expect(entry.owner).toBe("rob");
  });

  it("pre-convention migrations are reported as unmarked, not assumed applied", () => {
    const { unmarked, pending } = migrationBacklog(FILES);
    // Silence is not evidence of application. They are listed so the number is
    // visible and shrinks deliberately, rather than being folded into "applied".
    expect(unmarked.length).toBe(FILES.length - pending.length);
    expect(unmarked).not.toContain("0034_dedup_review.sql");
  });
});
