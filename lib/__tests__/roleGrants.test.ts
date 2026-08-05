/**
 * Q73 rollout half — the tests that grade `lib/security/roleGrants.ts`.
 *
 * The DoD asks for "a per-role read test that fails if a booker-role token can select a
 * `quoted_amount`, `paid`, or a phone/email column it should not — code, not a config
 * screenshot (CR-3)". That test cannot connect to prod, because the grants are NOT APPLIED and
 * applying them is Rob's call. So it is driven one layer in, against the artifact that WILL be
 * applied: the generated SQL. If `quoted_amount` is absent from every booker GRANT in the
 * migration, then a booker token cannot select it once the migration lands — and this file
 * fails the day someone edits the model into granting it back.
 *
 * The drift check is the other half of that argument: the committed migration must be exactly
 * what the generator produces from the model, or these assertions grade a file nobody applies.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ALLOWANCES,
  COVERED_TABLES,
  DENIALS,
  FULLY_GRANTED_TABLES,
  READ_ROLES,
  grantBreaches,
  partialRoleDenials,
  permittedColumns,
  renderRoleGrantSql,
  uncoveredSensitive,
  type ReadRole,
} from "@/lib/security/roleGrants";

// @ts-expect-error — plain .mjs helpers, deliberately shared with the audit script.
import { readSchema, stripComments, splitTop } from "../../scripts/lib/schema-from-migrations.mjs";
// @ts-expect-error — same.
import {
  sensitiveByTable,
  MONEY,
  PII,
  BENIGN,
  hits,
  isSensitive,
  unreviewed,
  IDENTIFIED_UNDECIDED,
  undecidedKeys,
} from "../../scripts/lib/sensitive-columns.mjs";

const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATION = join(REPO_ROOT, "supabase/migrations/0032_role_read_grants.sql");

const schema: Map<string, Set<string>> = readSchema();
const sensitive: Map<string, string[]> = sensitiveByTable(schema);
const unrev: Map<string, string[]> = unreviewed(schema);
/** The real model, graded the way the generator grades it — all four inputs. */
const realBreaches = () => grantBreaches(schema, sensitive, unrev, undecidedKeys);
const sql = renderRoleGrantSql(schema);

/** The exact column list a role is granted on a table, read back out of the generated SQL. */
function grantedInSql(table: string, role: ReadRole): string[] {
  const re = new RegExp(`grant select \\(([^)]*)\\) on public\\.${table} to ${role};`);
  const m = re.exec(sql);
  if (!m) throw new Error(`no grant for ${role} on ${table} in the generated SQL`);
  return m[1].split(",").map((c) => c.trim());
}

describe("the model is internally sound", () => {
  it("has no breaches against the real schema", () => {
    // The generator refuses to write on any breach, so a red here is a build that cannot ship.
    expect(realBreaches()).toEqual([]);
  });

  it("decides every money/PII column on every table it covers", () => {
    const decided = new Set([
      ...DENIALS.map((d) => `${d.table}.${d.column}`),
      ...ALLOWANCES.map((a) => `${a.table}.${a.column}`),
    ]);
    const undecided: string[] = [];
    for (const table of COVERED_TABLES) {
      for (const col of sensitive.get(table) ?? []) {
        if (!decided.has(`${table}.${col}`)) undecided.push(`${table}.${col}`);
      }
    }
    expect(undecided).toEqual([]);
  });

  it("states every reason, on both lists", () => {
    for (const d of DENIALS) expect(d.because.trim(), `${d.table}.${d.column}`).not.toBe("");
    for (const a of ALLOWANCES) expect(a.because.trim(), `${a.table}.${a.column}`).not.toBe("");
  });

  it("names no column twice across the two lists", () => {
    const keys = [
      ...DENIALS.map((d) => `${d.table}.${d.column}`),
      ...ALLOWANCES.map((a) => `${a.table}.${a.column}`),
    ];
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("reports the sensitive tables it does NOT cover instead of implying completeness", () => {
    const uncovered = uncoveredSensitive(sensitive);
    expect(uncovered.length).toBeGreaterThan(0);
    for (const u of uncovered) {
      expect(COVERED_TABLES).not.toContain(u.table);
      expect(u.columns.length).toBeGreaterThan(0);
    }
  });
});

describe("grantBreaches fails in both directions", () => {
  const realSchema = () => new Map([["people", new Set(["id", "name", "phone"])]]);

  it("flags a denial naming a column that does not exist — a typo protects nothing", () => {
    const b = grantBreaches(new Map([["people", new Set(["id"])]]), new Map([["people", []]]), new Map(), new Set());
    expect(b.some((x) => x.kind === "unknown-column")).toBe(true);
  });

  it("flags a denial naming a table that is in no migration", () => {
    const b = grantBreaches(new Map(), new Map(), new Map(), new Set());
    expect(b.some((x) => x.kind === "unknown-table")).toBe(true);
  });

  it("flags a sensitive column on a covered table that nobody decided", () => {
    // `people.phone` sensitive, but pretend neither list mentions it by dropping the
    // allowance's table from the schema's sensitive map is not enough — assert on the real
    // model instead, which currently decides it, then on a synthetic gap.
    const b = grantBreaches(realSchema(), new Map([["people", ["id"]]]), new Map(), new Set());
    expect(b.some((x) => x.kind === "undecided-sensitive" && x.detail.includes("people.id"))).toBe(true);
  });

  it("does not flag a sensitive column that is deliberately granted", () => {
    const b = realBreaches();
    for (const a of ALLOWANCES) {
      expect(b.some((x) => x.detail.startsWith(`${a.table}.${a.column} is money/PII`))).toBe(false);
    }
  });
});

describe("booker == rep — Rob 2026-08-05", () => {
  // *"The appt Bookers get paid on the clients actually showing up for their meetings and if I
  // see that their giving sales support and pushing to get the deal closed and paid, I'm
  // inclined to pay them more or promote them. Theres nothing an appt booker shouldnt be able
  // to see that a Sales Rep is able to see. At least nothing I can think of at the moment."*
  //
  // The individual column assertions below would each pass while the policy was broken
  // somewhere they do not name — that is how eleven booker-only denials accumulated one
  // increment at a time. These three tests assert the RULE instead of its instances, so a
  // twelfth cannot be added quietly.

  it("grants the two roles the identical column list on EVERY covered table", () => {
    expect(COVERED_TABLES.length).toBeGreaterThan(0);
    for (const table of COVERED_TABLES) {
      expect(
        grantedInSql(table, "mle_booker_read"),
        `${table}: the booker must see exactly what the rep sees`,
      ).toEqual(grantedInSql(table, "mle_rep_read"));
    }
  });

  it("covers the same TABLES for both roles — a missing grant is a refusal too", () => {
    // The failure this catches is the one the 8/5 change nearly caused by itself: releasing a
    // table's only denials empties its DENIALS entry, and a table absent from the migration is
    // a table NEITHER role can select from. Parity raised the booker to the rep; it must not
    // have lowered the rep to nothing.
    for (const table of COVERED_TABLES) {
      for (const role of READ_ROLES) {
        expect(sql, `${table} must be granted to ${role}`).toContain(`on public.${table} to ${role};`);
      }
    }
    // The three tables whose ONLY refusals were booker-only, and which therefore had to be
    // declared explicitly to survive 8/5. Named from the declaration rather than hard-coded, so
    // the list and its guard cannot drift apart.
    expect(FULLY_GRANTED_TABLES.map((g) => g.table).sort()).toEqual([
      "activities",
      "call_transcript_segments",
      "phase2_returns",
    ]);
    for (const g of FULLY_GRANTED_TABLES) {
      expect(COVERED_TABLES, `${g.table} lost coverage when its booker-only denials were released`).toContain(g.table);
      expect(DENIALS.some((d) => d.table === g.table), `${g.table} has a denial after all`).toBe(false);
      expect(g.because.trim(), `${g.table} is covered with no refusal and no reason`).not.toBe("");
    }
  });

  it("declares no per-role denial anywhere in the model", () => {
    for (const d of DENIALS) {
      expect([...d.roles].sort(), `${d.table}.${d.column}`).toEqual([...READ_ROLES].sort());
    }
    expect(partialRoleDenials(DENIALS)).toEqual([]);
    expect(realBreaches().some((b) => b.kind === "partial-role-denial")).toBe(false);
  });

  it("goes RED on a per-role denial, so a twelfth one cannot be added quietly", () => {
    // The gate itself, driven with a deliberately-broken model. Eleven booker-only denials
    // accumulated one increment at a time under a comment that never forbade them; asserting
    // only that today's data is clean would leave the NEXT one to the same prose that missed
    // the last eleven. The generator refuses to write SQL on any breach, so this is a build
    // failure, not a lint.
    const bookerOnly = partialRoleDenials([
      { table: "people", column: "transcript_url", roles: ["mle_booker_read"], because: "x" },
    ]);
    expect(bookerOnly).toHaveLength(1);
    expect(bookerOnly[0].kind).toBe("partial-role-denial");
    expect(bookerOnly[0].detail).toContain("mle_rep_read");
    // It fires in BOTH directions — a rep-only refusal is the same policy broken, and a check
    // that only watched the booker would encode the old asymmetry it was written to remove.
    expect(
      partialRoleDenials([
        { table: "deals", column: "value", roles: ["mle_rep_read"], because: "x" },
      ]),
    ).toHaveLength(1);
    // A denial naming both roles is clean; an empty one is caught as `empty-denial` elsewhere
    // and must not be double-reported here.
    expect(
      partialRoleDenials([
        { table: "people", column: "equity", roles: ["mle_rep_read", "mle_booker_read"], because: "x" },
        { table: "people", column: "estimate", roles: [], because: "x" },
      ]),
    ).toEqual([]);
  });

  it("still withholds EQUITY from both — parity raised the floor, not the ceiling", () => {
    // Rob 2026-07-29: "I dont want to show any equity to anyone but Will and I." The 8/5
    // sentence is about booker-vs-rep parity, not about owners-only data, and the loudest way
    // this change could be mis-implemented is by reading "nothing a booker shouldn't see" as
    // "nothing anyone shouldn't see".
    for (const table of ["people", "orgs", "deals"]) {
      for (const role of READ_ROLES) {
        expect(grantedInSql(table, role), `${role} on ${table}.equity`).not.toContain("equity");
      }
      expect(
        DENIALS.some((d) => d.table === table && d.column === "equity"),
        `${table}.equity must stay an explicit denial, not vanish into parity`,
      ).toBe(true);
    }
  });

  it("keeps every column that was withheld from BOTH roles withheld from both", () => {
    // The other half of "raised the floor, not the ceiling", asserted by name so a future pass
    // cannot release one of them under cover of the parity change.
    const stillRefused: [string, string[]][] = [
      ["invoice_ledger", ["amount", "client_legal_name", "payment_plan_note", "status_text", "pdf"]],
      ["signature_requests", ["signer_name", "signer_email", "signer_ip", "signer_user_agent", "sent_to"]],
      ["documents", ["countersigner_name", "countersigner_email", "countersigner_title"]],
    ];
    for (const [table, cols] of stillRefused) {
      for (const role of READ_ROLES) {
        for (const col of cols) {
          expect(grantedInSql(table, role), `${role} on ${table}.${col}`).not.toContain(col);
        }
      }
    }
  });
});

describe("the DoD's own refusals, read out of the generated SQL", () => {
  // REVERSED 2026-07-29 (Rob, ROB-ANSWERS-2026-07-29-night.md §1): *"I WANT the bookers to see
  // quoted amount… I want people to see how money can be made."* This test used to assert the
  // opposite and it is inverted here rather than deleted, so the reversal is visible in the file
  // that enforces it. Deal money is granted; `equity` is the line, and it is the test below.
  it("GRANTS deal money to both new roles — quoted_amount, estimate, phase2_estimate, value", () => {
    for (const table of ["people", "orgs"]) {
      for (const role of READ_ROLES) {
        const cols = grantedInSql(table, role);
        for (const col of ["quoted_amount", "estimate", "phase2_estimate"]) {
          expect(cols, `${role} on ${table}.${col}`).toContain(col);
        }
      }
    }
    for (const role of READ_ROLES) {
      expect(grantedInSql("deals", role), `${role} on deals`).toContain("value");
      expect(grantedInSql("deals", role), `${role} on deals`).toContain("estimate");
    }
  });

  it("withholds every DOLLAR on the invoice ledger from both roles", () => {
    for (const role of READ_ROLES) {
      const cols = grantedInSql("invoice_ledger", role);
      expect(cols).not.toContain("amount");
      expect(cols).not.toContain("payment_plan_note");
      expect(cols).not.toContain("client_legal_name");
      // Q81: the raw status cell is where '2 x $5,000' actually lives, so it is withheld with
      // the two columns derived from it — it had been granted by silence.
      expect(cols).not.toContain("status_text");
    }
  });

  it("withholds the invoice PDF PATH, because the filename spells out the withheld columns", () => {
    // 2026-08-05. The live value is
    //   "invoices/paid/Phase 1 Invoice - Gulf Coast RE Group - MLE-2026-100123 (PAID).pdf"
    // and `client_legal_name` — refused to both roles one column to the left — is written into
    // it verbatim. A refusal that the column beside it undoes in plain text is not a refusal.
    // Note this is NOT the 8/5 parity change: it tightens, on both roles at once. "Booker ==
    // rep" is not "everyone sees everything", so a leak that used to reach one role now reaches
    // two, which makes it more worth closing rather than less.
    for (const role of READ_ROLES) {
      expect(grantedInSql("invoice_ledger", role), `${role}`).not.toContain("pdf");
    }
    // The row is still identifiable without it: an invoice number and a slug name the record
    // without reproducing the legal name.
    for (const role of READ_ROLES) {
      expect(grantedInSql("invoice_ledger", role)).toContain("invoice_number");
      expect(grantedInSql("invoice_ledger", role)).toContain("client_slug");
    }
  });

  it("releases payment_state to BOTH roles (Q81 rep grant, extended 2026-08-05)", () => {
    // Q81 gave this to the rep alone, on Rob: "We just show it at the rep level so they see it
    // when they open up and see the alerts." 8/5 extends it to the booker, and Rob's own
    // sentence is the reason: he pays a booker more for "pushing to get the deal closed AND
    // PAID", which is not a job you can do without knowing whether it was paid. This assertion
    // was `not.toContain` for the booker and is inverted rather than deleted, so the change of
    // policy is visible in the file that enforces it.
    for (const role of READ_ROLES) {
      expect(grantedInSql("invoice_ledger", role), `${role}`).toContain("payment_state");
    }
    // The release is still columns wide, not the row: the ledger's money stays refused to both.
    for (const role of READ_ROLES) {
      expect(grantedInSql("invoice_ledger", role)).not.toContain("amount");
    }
  });

  it("withholds equity from both roles everywhere it exists (Q41 owners-only)", () => {
    for (const table of ["people", "orgs", "deals"]) {
      for (const role of READ_ROLES) {
        expect(grantedInSql(table, role), `${role} on ${table}`).not.toContain("equity");
      }
    }
  });

  it("withholds the e-sign audit trail from both roles", () => {
    for (const role of READ_ROLES) {
      const cols = grantedInSql("signature_requests", role);
      for (const col of ["signer_name", "signer_email", "signer_ip", "signer_user_agent"]) {
        expect(cols, `${role}`).not.toContain(col);
      }
    }
  });

  it("gives a booker the call record, because the rep has it (Rob 2026-08-05)", () => {
    // INVERTED 2026-08-05, not deleted. Rob: "Theres nothing an appt booker shouldnt be able to
    // see that a Sales Rep is able to see." This test asserted the refusal for four increments,
    // and an un-inverted line would quietly re-impose a policy its owner has replaced.
    expect(grantedInSql("people", "mle_booker_read")).toContain("transcript_url");
    expect(grantedInSql("deals", "mle_booker_read")).toContain("value");
  });

  it("keeps the transcript/recording/video PAIR intact — granted together or refused together", () => {
    // The rule this pins survives 8/5 unchanged, because it was never about WHICH role. Three
    // separate increments (28, 29, and the /video/ case) each shipped a HALF refusal: the
    // transcript link refused and the audio of the same call granted in the same statement, or
    // the transcript refused and the recorded meeting handed over because the column says
    // "video". The defect is a pair split down the middle, and it can now break in the other
    // direction — an increment that re-refuses `text` while leaving `speaker` granted is the
    // same bug wearing the opposite sign. So the assertion is symmetry, not absence: on every
    // covered table, each role must reach exactly the same set of these columns.
    for (const table of COVERED_TABLES) {
      const cols = [...(schema.get(table) ?? new Set<string>())];
      const pair = cols.filter(
        (c) => (/transcript/.test(c) || /recording/.test(c) || /video/.test(c)) && c !== "transcript_id",
      );
      if (!pair.length) continue;
      const rep = grantedInSql(table, "mle_rep_read");
      const booker = grantedInSql(table, "mle_booker_read");
      const repHas = pair.filter((c) => rep.includes(c)).sort();
      const bookerHas = pair.filter((c) => booker.includes(c)).sort();
      expect(bookerHas, `${table}: booker must reach the same call record as the rep`).toEqual(repHas);
      // …and the pair is whole rather than half: every one of them, or none.
      expect(repHas.length === 0 || repHas.length === pair.length, `${table}: half a pair`).toBe(true);
    }
    // Named explicitly, because these three columns are where the bug landed each time.
    for (const role of READ_ROLES) {
      expect(grantedInSql("activities", role), `${role}`).toContain("recording_url");
      expect(grantedInSql("activities", role), `${role}`).toContain("transcript_url");
      for (const table of ["people", "orgs"]) {
        expect(grantedInSql(table, role), `${role} on ${table}`).toContain("meeting_video_url");
      }
    }
  });

  it("KEEPS phone and email for both roles — outreach is the job, not a leak", () => {
    // The inverse assertion matters as much: a model that withheld these would pass every
    // test above while making the roles useless, and someone would quietly drop the roles.
    for (const table of ["people", "orgs"]) {
      for (const role of READ_ROLES) {
        expect(grantedInSql(table, role), `${role} on ${table}`).toContain("phone");
        expect(grantedInSql(table, role), `${role} on ${table}`).toContain("email");
      }
    }
  });

  it("grants only columns that actually exist on the table", () => {
    for (const table of COVERED_TABLES) {
      const real = schema.get(table) ?? new Set<string>();
      for (const role of READ_ROLES) {
        for (const col of grantedInSql(table, role)) {
          expect(real.has(col), `${table}.${col} granted but not in any migration`).toBe(true);
        }
      }
    }
  });

  it("revokes table-level SELECT before granting a column list", () => {
    // A table-level GRANT cannot be narrowed by a column-level REVOKE, so the revoke MUST
    // precede the grant or every denial above is decorative.
    for (const table of COVERED_TABLES) {
      for (const role of READ_ROLES) {
        const revoke = sql.indexOf(`revoke select on public.${table} from ${role};`);
        const grant = sql.indexOf(`grant select (`, revoke);
        expect(revoke, `${role} on ${table}`).toBeGreaterThan(-1);
        expect(grant).toBeGreaterThan(revoke);
      }
    }
  });

  it("never touches service_role, which every server route reads through", () => {
    expect(sql).not.toMatch(/revoke[^\n]*service_role/);
    expect(sql).toContain("service_role is deliberately untouched");
  });

  it("says NOT APPLIED in the file itself, not only in the queue", () => {
    expect(sql).toContain("*** NOT APPLIED. ***");
  });
});

describe("permittedColumns", () => {
  it("subtracts what the table's denials withhold — and the two roles now differ by nothing", () => {
    // Was: the same call returned a shorter list for the booker, because `transcript_url` was
    // booker-only. After 2026-08-05 there are no per-role denials left, so the ONLY subtraction
    // is `equity`, and it applies to both. Rewritten rather than dropped: this is the unit that
    // proves the per-role machinery still works and simply has nothing left to do.
    const all = ["id", "name", "equity", "transcript_url"];
    for (const role of READ_ROLES) {
      expect(permittedColumns("people", all, role), role).toEqual(["id", "name", "transcript_url"]);
    }
    const deal = ["id", "value", "equity", "stage"];
    for (const role of READ_ROLES) {
      expect(permittedColumns("deals", deal, role), role).toEqual(["id", "stage", "value"]);
    }
  });


  it("leaves an uncovered table untouched", () => {
    expect(permittedColumns("verticals", ["id", "name"], "mle_booker_read")).toEqual(["id", "name"]);
  });
});

describe("the committed migration has not drifted from the model", () => {
  it("is byte-identical to the generator's output", () => {
    // Without this, every assertion above grades a string this test built in memory while the
    // file `supabase db push` would actually apply says something else.
    expect(readFileSync(MIGRATION, "utf8")).toBe(sql);
  });
});

describe("stripComments — the parser fix this increment rests on", () => {
  it("does not read a comma-carrying comment sentence as a column", () => {
    const body = `create table if not exists t (
  -- an amount is counted, never coerced to 0.
  issue_date text not null,
  amount numeric
);`;
    const cols = readSchemaFrom(body).get("t")!;
    expect(cols.has("never")).toBe(false);
    expect(cols.has("issue_date")).toBe(true);
    expect(cols.has("amount")).toBe(true);
  });

  it("keeps a -- that lives inside a string literal", () => {
    const kept = stripComments("select 'a--b' , x -- gone\n");
    expect(kept).toContain("'a--b'");
    expect(kept).not.toContain("gone");
  });

  it("keeps a dollar-quoted body intact", () => {
    const kept = stripComments("do $$ -- inner\nbegin end $$; -- outer\n");
    expect(kept).toContain("-- inner");
    expect(kept).not.toContain("outer");
  });

  it("blanks a block comment without eating the newlines around it", () => {
    const kept = stripComments("a\n/* x\ny */\nb");
    expect(kept.split("\n").length).toBe(4);
    expect(kept).not.toContain("x");
  });

  it("preserves length, so splitTop's paren depth cannot be thrown by prose", () => {
    const src = "-- a (unclosed paren in prose\ncreate table t (id uuid);";
    expect(stripComments(src).length).toBe(src.length);
    expect(splitTop(stripComments(src))).toBeDefined();
  });

  it("proves the real invoice_ledger no longer carries invented columns", () => {
    const cols = schema.get("invoice_ledger")!;
    for (const invented of ["never", "not", "plus", "which"]) {
      expect(cols.has(invented), `${invented} is comment prose, not a column`).toBe(false);
    }
    for (const real of ["issue_date", "status_text", "due_date", "source_sha256"]) {
      expect(cols.has(real), `${real} was swallowed by the old parser`).toBe(true);
    }
  });
});

describe("the classifier is shared, not copied", () => {
  it("still calls the audit's own worst columns sensitive", () => {
    expect(hits("quoted_amount", MONEY)).toBe(true);
    expect(hits("equity", MONEY)).toBe(true);
    expect(hits("signer_email", PII)).toBe(true);
    expect(hits("phone", PII)).toBe(true);
  });

  it("classifies by name only, which is why every count is a floor", () => {
    expect(hits("notes", MONEY) || hits("notes", PII)).toBe(false);
    expect(hits("payload", MONEY) || hits("payload", PII)).toBe(false);
  });

  it("calls a recording as sensitive as the transcript of it", () => {
    // The asymmetry that caused inc.28's leak: these two name the same call, and only one of
    // them was sensitive. Both handles are covered now — the URL and the Twilio SID.
    expect(hits("transcript_url", PII)).toBe(true);
    expect(hits("recording_url", PII)).toBe(true);
    expect(hits("recording_sid", PII)).toBe(true);
  });

  it("calls a meeting VIDEO as sensitive as the recording and the transcript", () => {
    // inc.29, the third instance of one shape. `meeting_video_url` was neither money nor PII,
    // so it was never printed by `uncoveredSensitive()` and could not trip `grantBreaches()` —
    // the identical invisible-undercount class as inc.25's swallowed columns and inc.28's audio.
    expect(hits("meeting_video_url", PII)).toBe(true);
    // And the person attached to the words: `text` was withheld from a booker while the label
    // naming who said it was granted in the same statement.
    expect(hits("speaker", PII)).toBe(true);
  });
});

describe("the classifier's third answer — the blind spot is finite and printed", () => {
  // Why this describe exists: for three increments the classifier had two states, "matched a
  // sensitive pattern" and "not mentioned anywhere", and every count treated them as opposites.
  // They are not: a column reviewed and cleared and a column nobody ever read produced the same
  // silence. Each of inc.25, 28 and 29 found a real leak in that gap BY CHANCE. `BENIGN` +
  // `unreviewed()` make the gap something a report can print and a reader can shrink.

  it("never lets a benign pattern clear a money or PII column", () => {
    // The one way this mechanism could do harm: sensitive must always win. If a broad benign
    // pattern could downgrade a real column, inc.29 would have built a leak while closing one.
    const schema = readSchema();
    for (const [, cols] of schema) {
      for (const col of cols) {
        if (isSensitive(col)) {
          expect(hits(col, BENIGN) && !isSensitive(col), `${col} downgraded`).toBe(false);
        }
      }
    }
    // Driven directly, not only through whatever the schema happens to contain today.
    expect(isSensitive("signed_at")).toBe(false); // benign, and genuinely so
    expect(isSensitive("signer_email")).toBe(true); // benign /^signed/ must not reach it
    expect(unreviewed(readSchemaFrom(
      "create table public.t (id uuid, quoted_amount numeric, created_at timestamptz);",
    )).get("t")).toBeUndefined(); // all three ruled on: sensitive, benign, benign
  });

  it("puts an unfamiliar new column in the printed list rather than treating it as safe", () => {
    // The regression that matters going forward: the next migration's odd column name must
    // surface, because "not matched by a pattern" is the state that hid three real leaks.
    const un = unreviewed(readSchemaFrom(
      "create table public.t (id uuid, wildcard_thing text, created_at timestamptz);",
    ));
    expect(un.get("t")).toEqual(["wildcard_thing"]);
  });

  it("keeps the open queue named, real, and non-empty instead of pending in silence", () => {
    // The queue is the only legal way to leave a covered column unruled, so it is held to the
    // same standard as a decision: real pairs, a stated reason, no empties.
    expect(IDENTIFIED_UNDECIDED.length).toBeGreaterThan(0);
    for (const u of IDENTIFIED_UNDECIDED) {
      expect(u.column.trim(), "a named gap with no column").not.toBe("");
      expect(u.tables.length, `${u.column} is queued against no table`).toBeGreaterThan(0);
      expect(u.note.trim(), `${u.column} is listed without saying what the decision hinges on`).not.toBe("");
      for (const t of u.tables) {
        expect(schema.get(t)?.has(u.column), `${t}.${u.column} is queued but does not exist`).toBe(true);
      }
    }
  });

  it("ruled the six columns inc.29 named, rather than carrying them a second increment", () => {
    // inc.29 printed these as "probably sensitive, not yet decided". Leaving a named suspicion
    // unruled is exactly the state that made three leaks findable only by chance, so inc.30
    // ruled them. `signature_events.ip` is the sharpest: the same datum as `signer_ip`, which
    // IS withheld from both roles, and the bare name defeated /ip_address/.
    for (const col of ["ip", "client_legal_name", "sent_to", "business", "estimate", "phase2_estimate", "payment_state"]) {
      expect(isSensitive(col), `${col} is still unruled`).toBe(true);
    }
    expect(unreviewed(readSchema()).get("signature_events") ?? []).not.toContain("ip");
    // And ruling is not the same as withholding: `business` is PII and deliberately GRANTED.
    expect(ALLOWANCES.some((a) => a.table === "people" && a.column === "business")).toBe(true);
  });

  it("goes RED on an unruled column on a covered table — the inc.30 gate", () => {
    // The three leaks (activities.recording_url, people.meeting_video_url,
    // call_transcript_segments.speaker) were each a covered-table column matching no pattern in
    // either direction, and each was caught by a human reading output. This is the mechanism
    // that replaces that luck: unruled on a covered table is a breach, full stop.
    const covered = COVERED_TABLES[0];
    const b = grantBreaches(schema, sensitive, new Map([[covered, ["some_new_column"]]]), undecidedKeys);
    expect(b.some((x) => x.kind === "unreviewed-on-covered-table" && x.detail.includes(`${covered}.some_new_column`))).toBe(true);
    // Queueing it explicitly is the one legal escape, and it must be a deliberate act.
    const q = grantBreaches(schema, sensitive, new Map([[covered, ["some_new_column"]]]), new Set([`${covered}.some_new_column`]));
    expect(q.some((x) => x.kind === "unreviewed-on-covered-table")).toBe(false);
    // An UNCOVERED table's unruled columns are printed, not fatal — coverage is partial on
    // purpose and a gate that punished the uncovered remainder would force false coverage.
    const u = grantBreaches(schema, sensitive, new Map([["submissions", ["business_name"]]]), undecidedKeys);
    expect(u.some((x) => x.kind === "unreviewed-on-covered-table")).toBe(false);
  });

  it("refuses a queue entry that watches a column which does not exist", () => {
    const b = grantBreaches(schema, sensitive, unrev, new Set(["people.no_such_column"]));
    expect(b.some((x) => x.kind === "unknown-column" && x.detail.includes("queued"))).toBe(true);
    const t = grantBreaches(schema, sensitive, unrev, new Set(["no_such_table.x"]));
    expect(t.some((x) => x.kind === "unknown-table" && x.detail.includes("queued"))).toBe(true);
  });
});

/** Parse a one-off SQL string through the real reader, via a temp dir. */
function readSchemaFrom(sqlText: string): Map<string, Set<string>> {
  const { mkdtempSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "rolegrants-"));
  writeFileSync(join(dir, "0001_t.sql"), sqlText);
  return readSchema(dir);
}
