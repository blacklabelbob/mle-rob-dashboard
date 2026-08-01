/**
 * Q84 inc.52/53 — what the LIVE schema can prove about a migration, and what it cannot.
 *
 * inc.51 built the backlog off markers in the files: 2 pending, 0 disagreements,
 * and **36 unmarked** — every migration written before the convention existed.
 * The tempting shortcut is to back-fill 36 `-- APPLY-STATUS: APPLIED` lines by
 * assertion. That is the same guess this whole ladder was built to kill: nobody
 * checked, they just wrote it down.
 *
 * The honest source is prod itself. PostgREST publishes an OpenAPI root listing
 * every table/view it exposes and their columns — read-only, no schema access
 * needed. So a migration that creates `dedup_review(status, resolution_note…)`
 * can be checked against what actually exists.
 *
 * The trap, and the reason this module is more careful than "does the table
 * exist": **that root sees objects, not rules.** CHECK constraints, GRANTs, RLS
 * policies, indexes and triggers are all invisible to it. (inc.53 correction:
 * *functions* were on that list and should not have been — the root publishes
 * every exposed one as `/rpc/<name>`. Only trigger functions and functions
 * outside the exposed schema are genuinely invisible.) `0034` is
 * exactly this case — the `dedup_review` TABLE exists on prod (it was created by
 * hand, which is why inc.50 found no migration for it) while the CHECKs that
 * migration adds do not. A verdict of "table present → applied" would have
 * declared a pending migration applied and closed a real backlog row on a lie.
 *
 * So evidence runs in one direction with confidence and one direction without:
 *
 *   an object MISSING  → proof the file is not fully applied.
 *   an object PRESENT  → proof only that the object exists (some path created
 *                        it), and says nothing about statements the root cannot
 *                        see. Any unverifiable statement caps the verdict.
 *
 * Pure per CR-3: no clock, no filesystem, no network. The caller fetches the
 * OpenAPI root and hands the shape in.
 */

/** table/view name → column names, as published by the PostgREST OpenAPI root. */
export type LiveSchema = Record<string, string[]>;

/**
 * The full shape the root publishes. inc.52 read only `definitions` and therefore
 * declared every `create function` invisible — but the same document also lists
 * every function PostgREST exposes, as an `/rpc/<name>` path. Six of them are
 * live on prod, so "functions cannot be seen from here" was simply false for the
 * ones that are callable, and it was costing two files a verdict they had earned.
 */
export type LiveShape = {
  tables: LiveSchema;
  rpcs: string[];
  /**
   * inc.57 — keys of objects prod publishes a DESCRIPTION for (`table:x`,
   * `column:x.y`, `function:f`). PostgREST renders `comment on` into the same
   * root this module already fetches, so `comment on` is not the catalog-only
   * dead end it was handed over as: it is adjudicable by the weakest access on
   * the ladder, with no extra key.
   *
   * Optional, and its absence means "no descriptions were supplied", NOT "prod
   * documents nothing" — same distinction as `rpcs`, and the same consequence:
   * a comment verdict is withheld rather than reported missing.
   */
  documented?: string[];
};

export type SchemaObject =
  | { kind: "table"; table: string }
  | { kind: "column"; table: string; column: string }
  | { kind: "function"; name: string }
  /** A `comment on …` with a literal body. `target` is a documented-key: `table:x` / `column:x.y` / `function:f`. */
  | { kind: "comment"; target: string };

export type ParsedMigration = {
  /** Objects the OpenAPI root can adjudicate. */
  objects: SchemaObject[];
  /** Statements it cannot: constraints, grants, policies, indexes, functions… */
  unverifiable: string[];
};

/** Strip line comments and block comments so their prose cannot parse as DDL. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*--.*$/gm, " ");
}

function bareName(raw: string): string {
  const last = raw.trim().split(".").pop() ?? raw;
  return last.replace(/["`]/g, "").trim().toLowerCase();
}

const CREATE_TABLE = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([\w".]+)/gi;
const CREATE_VIEW = /\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?([\w".]+)/gi;
const ALTER_TABLE = /^\s*alter\s+table\s+(?:if\s+exists\s+)?([\w".]+)/i;
const ADD_COLUMN = /\badd\s+column\s+(?:if\s+not\s+exists\s+)?([\w"]+)/gi;
const CREATE_FUNCTION = /\bcreate\s+(?:or\s+replace\s+)?function\s+([\w".]+)\s*\(/gi;
/**
 * inc.57 — `comment on` was the single most common unrecognised shape in the live
 * run (11 of 38 files carried one). The handover called it catalog-only and
 * therefore permanent; **that was wrong, and prod said so**: PostgREST publishes a
 * table/column comment as the `description` of its definition and a function
 * comment as the description of its `/rpc/<name>` path — in the very document
 * this grader already fetches.
 *
 * The literal body is required (`is '…'`). `comment on … is null` REMOVES a
 * comment, and its evidence runs the other way — a description still present
 * would disprove it, an absent one proves nothing, because nothing distinguishes
 * "removed" from "never written". That inverse is not built here, so the shape is
 * deliberately left unclaimed and surfaces as `unclassified`. (Measured
 * 2026-07-31: 0 migrations do this. A rule for a shape nobody has written is the
 * assertion this ladder exists to stop.)
 */
const COMMENT_ON =
  /\bcomment\s+on\s+(table|column|function)\s+([\w".]+)\s*(?:\([^)]*\))?\s+is\s+'/gi;

/** Labels for comment statements a call declined to grade — classified in the ceiling sets below. */
export const COMMENT_UNGRADED = "comment on";
export const COMMENT_UNEXPOSED = "comment on an object prod does not expose";

/**
 * Statements whose effect is real but invisible to the OpenAPI root. Listed by
 * the shape a human writes, not inferred — an unlisted statement simply does not
 * cap the verdict, and that is a bug we would rather find as a wrong verdict
 * than hide behind a catch-all that matches everything.
 */
const UNVERIFIABLE: Array<[RegExp, string]> = [
  [/\badd\s+constraint\b/i, "add constraint"],
  [/\bcheck\s*\(/i, "check constraint"],
  [/\bgrant\s+/i, "grant"],
  [/\brevoke\s+/i, "revoke"],
  [/\bcreate\s+(?:unique\s+)?index\b/i, "create index"],
  [/\bcreate\s+policy\b/i, "create policy"],
  [/\benable\s+row\s+level\s+security\b/i, "enable rls"],
  // `create function` is NOT here — it is adjudicated per-function below, because
  // some are visible (exposed as /rpc/<name>) and some structurally never can be.
  [/\bcreate\s+trigger\b/i, "create trigger"],
  [/\bcreate\s+type\b/i, "create type"],
  // inc.58 — the DROP mirrors. The parser listed each `create` and none of its
  // twin, so a migration that only tears down contributed no capping label at
  // all. Each mirror is capped exactly where its twin is, because removing an
  // object is observed by the same access that would have observed adding it:
  // `drop trigger` needs a write (its twin is write-observable), `drop policy`
  // changes what a read returns for some role (its twin is read-probeable).
  [/\bdrop\s+trigger\b/i, "drop trigger"],
  [/\bdrop\s+policy\b/i, "drop policy"],
  // inc.58 — `update \w+ set` missed an ALIASED update (`update orgs o set …`)
  // and a schema-qualified one (`update public.orgs set …`). Carried since
  // inc.56, harmless until now only by luck: `0003` and `0031` each also run an
  // unaliased update, so the file still earned the label by a different
  // statement — the per-statement coverage check is what made the gap visible.
  // The alias is optional and may not be the word `set`, or `update orgs set`
  // would read `set` as the alias and then demand a second one.
  [
    /\b(?:insert\s+into|update\s+(?:only\s+)?[\w".]+(?:\s+(?:as\s+)?(?!set\b)[\w"]+)?\s+set\b|delete\s+from)\b/i,
    "data change",
  ],
];

/**
 * inc.56 — splitting on `;` is wrong the moment a function body exists.
 *
 * The ADD_COLUMN scan above splits on a bare `;` and gets away with it: a
 * fragment of a `$$ … $$` body either matches `alter table` or it does not, and
 * a fragment that matches nothing costs nothing. Statement COVERAGE cannot get
 * away with it — every fragment of a function body would surface as its own
 * unrecognised statement, and a checker that cries wolf on `if not found then`
 * gets ignored exactly like the prose markers this ladder replaced.
 *
 * So: dollar-quoted blocks (`$$`, `$fn$`) and single-quoted strings are opaque —
 * a `;` inside one is body text, not a terminator.
 */
export function splitStatements(sql: string): string[] {
  const body = stripComments(sql);
  const out: string[] = [];
  let buf = "";
  let open: string | null = null;

  for (let i = 0; i < body.length; ) {
    if (open) {
      if (open === "'" && body[i] === "'") open = null;
      else if (open !== "'" && body.startsWith(open, i)) {
        buf += open;
        i += open.length;
        open = null;
        continue;
      }
      buf += body[i];
      i += 1;
      continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(body.slice(i));
    if (dollar) {
      open = dollar[0];
      buf += dollar[0];
      i += dollar[0].length;
      continue;
    }
    if (body[i] === "'") {
      open = "'";
      buf += body[i];
      i += 1;
      continue;
    }
    if (body[i] === ";") {
      out.push(buf);
      buf = "";
      i += 1;
      continue;
    }
    buf += body[i];
    i += 1;
  }
  out.push(buf);

  return out.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/**
 * Statements that leave nothing behind for any later read, write or plan to
 * differ on — so their absence from every rule above is correct, not a gap.
 * Named explicitly rather than pattern-matched, for the same reason UNVERIFIABLE
 * is: a catch-all that swallows the unknown is what this whole pass exists to
 * stop. `set` is matched as a LEADING token only — `alter table … set default`
 * leads with `alter`, and that one is a real change this must not excuse.
 */
const NO_EFFECT = /^(begin|start\s+transaction|commit|end|rollback|set|reset)\b/i;

/**
 * Every rule that claims a statement. Object rules are re-tested per statement
 * (not against the whole file) so a claim is only credited to the statement it
 * actually describes — a file whose `create table` sits three statements away
 * must not launder an unlisted statement beside it.
 */
/** `public.people.phase2_estimate` → `column:people.phase2_estimate`; schema qualifiers dropped, like every other name here. */
export function commentTarget(kind: string, raw: string): string {
  const parts = raw
    .split(".")
    .map((p) => p.replace(/["`]/g, "").trim().toLowerCase())
    .filter(Boolean);
  if (kind.toLowerCase() === "column") return `column:${parts.slice(-2).join(".")}`;
  return `${kind.toLowerCase()}:${parts[parts.length - 1]}`;
}

function statementIsClaimed(stmt: string): boolean {
  COMMENT_ON.lastIndex = 0;
  if (COMMENT_ON.test(stmt)) return true;
  for (const re of [CREATE_TABLE, CREATE_VIEW, CREATE_FUNCTION]) {
    re.lastIndex = 0;
    if (re.test(stmt)) return true;
  }
  if (ALTER_TABLE.test(stmt)) return true;
  return UNVERIFIABLE.some(([re]) => re.test(stmt));
}

/**
 * The inverse of inc.55's failure, and the reason it needs the same treatment.
 *
 * inc.55 fixed labels the parser emitted but the ceiling did not classify. This
 * is the other side: statements the parser never labels AT ALL. `UNVERIFIABLE`
 * lists the shapes a human was actually seen to write, so a migration written
 * with a shape nobody listed (`alter table … alter column … set default`,
 * `comment on`, `alter type … add value`, a bare `do $$ … $$`) contributes no
 * capping label — and a file with no capping label and its tables present reports
 * `objects-present`, the STRONGEST verdict on the ladder. It would have earned
 * that verdict by the checker not knowing what it was looking at.
 *
 * Each unclaimed statement becomes a label the ceiling reports as `unclassified`
 * — deliberately, and never folded into permanent or probeable. Nobody has
 * decided what could settle a shape nobody has read yet, and pretending
 * otherwise is the guess this module exists to kill.
 */
export function unrecognisedStatements(sql: string): string[] {
  const out: string[] = [];
  for (const stmt of splitStatements(sql)) {
    if (NO_EFFECT.test(stmt)) continue;
    if (statementIsClaimed(stmt)) continue;
    const fp = stmt.toLowerCase().split(" ").slice(0, 4).join(" ");
    if (fp && !out.includes(fp)) out.push(fp);
  }
  return out;
}

/** Prefix of the labels above. Excluded from `parserEmittableLabels()` on purpose — see there. */
export const UNRECOGNISED_LABEL = "unrecognised statement: ";

export function parseMigration(sql: string): ParsedMigration {
  const body = stripComments(sql);
  const objects: SchemaObject[] = [];
  const seen = new Set<string>();

  const push = (o: SchemaObject) => {
    const key =
      o.kind === "table"
        ? `t:${o.table}`
        : o.kind === "function"
          ? `f:${o.name}`
          : o.kind === "comment"
            ? `m:${o.target}`
            : `c:${o.table}.${o.column}`;
    if (seen.has(key)) return;
    seen.add(key);
    objects.push(o);
  };

  for (const re of [CREATE_TABLE, CREATE_VIEW]) {
    re.lastIndex = 0;
    for (let m = re.exec(body); m; m = re.exec(body)) push({ kind: "table", table: bareName(m[1]) });
  }
  // Columns are read STATEMENT BY STATEMENT. The first cut of this matched
  // `alter table X … add column Y` across a window of characters, and prod's own
  // schema caught it in the first run: `alter table edges add constraint …` then
  // bridged to the NEXT statement's `alter table people add column org_id`, and
  // reported a missing `edges.org_id` that no migration ever wrote. A verdict
  // engine that invents an object is worse than no verdict, so the bridge is
  // gone — a column belongs to the ALTER TABLE it is written inside of.
  for (const stmt of body.split(";")) {
    const owner = ALTER_TABLE.exec(stmt);
    if (!owner) continue;
    ADD_COLUMN.lastIndex = 0;
    for (let m = ADD_COLUMN.exec(stmt); m; m = ADD_COLUMN.exec(stmt)) {
      push({ kind: "column", table: bareName(owner[1]), column: bareName(m[1]) });
    }
  }

  // Comments are read per STATEMENT for the same reason columns are: a global
  // scan lets `comment on column` bridge onto a name from a neighbouring
  // statement, and inventing an object is worse than grading none.
  for (const stmt of splitStatements(sql)) {
    COMMENT_ON.lastIndex = 0;
    for (let m = COMMENT_ON.exec(stmt); m; m = COMMENT_ON.exec(stmt)) {
      push({ kind: "comment", target: commentTarget(m[1], m[2]) });
    }
  }

  const unverifiable: string[] = [];
  const note = (label: string) => {
    if (!unverifiable.includes(label)) unverifiable.push(label);
  };
  for (const [re, label] of UNVERIFIABLE) {
    if (re.test(body)) note(label);
  }

  // inc.56 — what no rule above claimed. Reported as its own label rather than
  // silently omitted, so a shape nobody enumerated caps the file instead of
  // letting it claim the strongest verdict on the ladder.
  for (const fp of unrecognisedStatements(sql)) note(`${UNRECOGNISED_LABEL}${fp}`);

  // Functions split in two, and the split is the whole point of grading them
  // individually rather than as one blanket "create function" label:
  //
  //   returns trigger      → PostgREST never exposes it. Invisible forever; no
  //                          probe short of writing a row can observe it, and a
  //                          write is not read-only. Honestly permanent.
  //   non-public schema    → not in the exposed schema, so also invisible here.
  //   anything else        → published as /rpc/<name> and adjudicable.
  //
  // The return type is read from the FIRST `returns` after the name and bounded
  // by the next `create … function`, so the read cannot bridge into a later
  // definition — the same bridge that made inc.52's first run invent a column.
  CREATE_FUNCTION.lastIndex = 0;
  const defs: Array<{ qualified: string; from: number }> = [];
  for (let m = CREATE_FUNCTION.exec(body); m; m = CREATE_FUNCTION.exec(body)) {
    defs.push({
      qualified: m[1].replace(/["`]/g, "").trim().toLowerCase(),
      from: m.index + m[0].length,
    });
  }
  for (const [i, def] of defs.entries()) {
    const window = body.slice(def.from, defs[i + 1]?.from ?? body.length);
    const returns = /\breturns\s+(\w+)/i.exec(window)?.[1]?.toLowerCase();
    const schema = def.qualified.includes(".") ? def.qualified.split(".").slice(-2)[0] : "public";

    if (returns === "trigger") note("create trigger function");
    else if (schema !== "public") note(`create function in schema ${schema}`);
    else push({ kind: "function", name: bareName(def.qualified) });
  }

  return { objects, unverifiable };
}

/**
 * inc.54 — what the `no-visible-objects` bucket is actually WAITING for.
 *
 * inc.52 and inc.53 both shrank that bucket (9 → 7), and each handover framed the
 * remainder as work the next increment could keep chipping at. That framing is
 * wrong for most of what is left, and a list that silently implies "one more
 * pass" is the same disease as a marker written by assertion: it invites someone
 * to keep looking for evidence that cannot exist.
 *
 * So each unverifiable statement is classified by the WEAKEST access that could
 * ever adjudicate it:
 *
 *   read-probeable  → its effect changes what a READ returns for some role, so a
 *                     read-only probe with the right key could adjudicate it.
 *   write-observable → only a WRITE makes it speak (a CHECK rejects an insert; a
 *                     trigger fires on a row). A write is not read-only, so this
 *                     ladder can never reach it.
 *   plan-only       → invisible in results entirely; only the query planner knows.
 *
 * A file's ceiling is capped by its WEAKEST statement, exactly like its verdict:
 * a file carrying both a grant and an index can have the grant probed and the
 * index never, so the FILE is permanent. And an unrecognised label is reported as
 * `unclassified` rather than folded into either answer — inferring "permanent"
 * from a label nobody has thought about is the guess this module exists to kill.
 */
export type Ceiling =
  /** Every capping statement could be settled by a read-only probe. The bucket can still shrink. */
  | "probeable-read-only"
  /** At least one capping statement needs a write, or a plan, to observe. This file will never be adjudicated read-only. */
  | "permanent"
  /** A capping statement nobody has classified. Reported, never folded. */
  | "unclassified";

const READ_PROBEABLE = new Set([
  "grant",
  "revoke",
  "create policy",
  // inc.58 — same cap as its twin, and for the twin's own reason: a policy is
  // what decides whether a row comes back for a role, so removing one changes
  // what a read returns just as adding one does. Nothing about the direction
  // makes it harder to see.
  "drop policy",
  "enable rls",
  "data change",
  // inc.55 — `create type` is settled by a READ, and by the weakest one on this
  // ladder: PostgREST publishes an enum type's values as the `enum` of any
  // exposed column of that type, in the very root this grader already fetches —
  // no extra key at all. The honest limit, stated rather than implied: that read
  // only speaks when a column of the type is exposed. A type nothing uses is
  // invisible — but a type nothing uses also changes nothing, so there is no
  // verdict being withheld. (Measured 2026-07-31: prod has 0 enum-typed columns
  // and no migration writes `create type`, so this classifies a label the parser
  // can emit, not a file that exists today.)
  "create type",
  // inc.57 — a comment this call did not grade because no descriptions were
  // supplied. The same OpenAPI root carries them, so supplying them settles it:
  // read-probeable by the weakest access there is.
  COMMENT_UNGRADED,
  // Same family, same reason, and it has always been reachable this way: a
  // caller that hands in the rpc list settles `create function` with one read.
  "create function",
]);
const WRITE_OBSERVABLE = new Set([
  "add constraint",
  "check constraint",
  "create trigger",
  // inc.58 — a trigger is invisible to every read whether it is there or not;
  // only writing a row shows the difference. That is true of its absence too,
  // so the mirror is permanent for the read-only ladder exactly as its twin is.
  "drop trigger",
  "create trigger function",
  // A comment on something the data API does not publish. No read, write or plan
  // through this API reaches it — only catalog access would, which this ladder
  // does not have. Permanent for the same reason a private-schema function is.
  COMMENT_UNEXPOSED,
]);
const PLAN_ONLY = new Set(["create index"]);
/**
 * Labels the parser builds from the file's own text rather than picking off a
 * fixed list. `create function in schema <x>` is permanent for a reason the
 * exact-match sets cannot express: PostgREST exposes one schema, so a function
 * outside it is never published as `/rpc/<name>` and never callable through the
 * data API — no read, no write and no plan reaches it.
 */
const PERMANENT_PREFIXES = ["create function in schema "];

/**
 * Every label `parseMigration` can put in `unverifiable`. Exported so the three
 * sets above can be held to it by a test: a label with no home falls through to
 * `unclassified`, which reads to the next person as "someone will get to it" —
 * the exact misreading inc.54 built this ceiling to kill. The templated label is
 * represented by a concrete instance, because that is what the prefix rule has
 * to classify.
 *
 * inc.56's `unrecognised statement: …` labels are NOT listed here, and that is
 * the point of them: they exist to land in `unclassified`. Giving them a home in
 * one of the three sets would classify a statement nobody has read — the exact
 * assertion-over-evidence move this ladder was built to stop. A separate test
 * pins them to `unclassified` so the omission stays deliberate, not forgotten.
 */
export function parserEmittableLabels(): string[] {
  return [...UNVERIFIABLE.map(([, label]) => label), "create trigger function", "create function in schema private"];
}

function classifyCeilingLabel(label: string): "probeable" | "permanent" | "unclassified" {
  if (READ_PROBEABLE.has(label)) return "probeable";
  if (WRITE_OBSERVABLE.has(label) || PLAN_ONLY.has(label)) return "permanent";
  if (PERMANENT_PREFIXES.some((p) => label.startsWith(p))) return "permanent";
  return "unclassified";
}

export type CeilingReport = {
  ceiling: Ceiling;
  /** Statements a read-only probe could settle. */
  probeable: string[];
  /** Statements no read-only access can ever settle. */
  permanent: string[];
  /** Statements not yet classified either way. */
  unclassified: string[];
  reason: string;
};

export function evidenceCeiling(unverifiable: string[]): CeilingReport {
  const probeable: string[] = [];
  const permanent: string[] = [];
  const unclassified: string[] = [];

  for (const label of unverifiable) {
    const where = classifyCeilingLabel(label);
    if (where === "probeable") probeable.push(label);
    else if (where === "permanent") permanent.push(label);
    else unclassified.push(label);
  }

  // Order matters and is deliberate: an unknown label must never be reported as
  // permanent (we would stop looking) nor as probeable (we would look for the
  // wrong thing). It outranks both.
  const ceiling: Ceiling = unclassified.length
    ? "unclassified"
    : permanent.length
      ? "permanent"
      : "probeable-read-only";

  const reason = unclassified.length
    ? `${unclassified.join(", ")} has no classification yet — do not assume either way`
    : permanent.length
      ? `${permanent.join(", ")} cannot be observed by any read — it takes a write, a query plan, or a schema the data API does not expose — so no read-only check will ever settle this file`
      : probeable.length
        ? `${probeable.join(", ")} could be settled by a read-only probe with the right key`
        : "nothing caps this file";

  return { ceiling, probeable, permanent, unclassified, reason };
}

export type Verdict =
  /** At least one object the file creates is absent from prod. Proof: not fully applied. */
  | "objects-missing"
  /** Every object exists and the file does nothing the root cannot see. Strongest evidence available. */
  | "objects-present"
  /** Every object exists, but the file also does things the root cannot see. NOT proof of applied. */
  | "objects-present-unverifiable-rules"
  /** Nothing in the file is visible to the root at all. No evidence either way. */
  | "no-visible-objects";

export type Evidence = {
  name: string;
  verdict: Verdict;
  present: string[];
  missing: string[];
  unverifiable: string[];
  /**
   * Set only when something caps this file. Says whether a better read-only
   * check could ever move it — so "no evidence" stops reading as "not yet".
   */
  ceiling?: CeilingReport;
  /** One line a human can read without knowing any of the above. */
  reason: string;
};

function describe(o: SchemaObject): string {
  if (o.kind === "table") return o.table;
  if (o.kind === "function") return `${o.name}()`;
  if (o.kind === "comment") return `comment on ${o.target.replace(":", " ")}`;
  return `${o.table}.${o.column}`;
}

/**
 * PostgREST writes its OWN description onto primary-key and foreign-key columns
 * ("Note:\nThis is a Primary Key.<pk/>") whether or not a human ever wrote a
 * `comment on`. Counting that as documentation would report a comment landed on
 * every PK in the database — the false-positive twin of inc.52's invented column.
 * So the generated note is stripped and what a human wrote is what remains.
 */
export function humanDescription(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/Note:\s*\n[\s\S]*$/i, "").trim();
}

/**
 * Callers that only have tables (and every test written before functions were
 * adjudicable) keep working: a bare LiveSchema means "no rpc list was supplied",
 * which is not the same as "prod exposes no functions" — so a function verdict
 * is withheld rather than reported missing. Absence of evidence, again, is not
 * evidence of absence, and this is the one place that distinction could quietly
 * turn into a false `objects-missing`.
 */
export function asLiveShape(live: LiveSchema | LiveShape): LiveShape {
  return "tables" in live && "rpcs" in live ? (live as LiveShape) : { tables: live as LiveSchema, rpcs: [] };
}

/** A description can only exist for something the data API publishes. */
function targetIsExposed(target: string, shape: LiveShape): boolean {
  const [kind, rest] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)];
  if (kind === "table") return shape.tables[rest] !== undefined;
  if (kind === "function") return shape.rpcs.includes(rest);
  const dot = rest.lastIndexOf(".");
  return (shape.tables[rest.slice(0, dot)] ?? []).includes(rest.slice(dot + 1));
}

export function schemaEvidence(name: string, sql: string, live: LiveSchema | LiveShape): Evidence {
  const shape = asLiveShape(live);
  const knowsRpcs = "tables" in live && "rpcs" in live;
  const knowsDocumented = Array.isArray((live as LiveShape).documented);
  const { objects, unverifiable } = parseMigration(sql);
  const present: string[] = [];
  const missing: string[] = [];
  // Objects this call actually GRADED. An object we decline to adjudicate must
  // not count toward "the file has visible objects" — otherwise a file whose only
  // object was withheld reads as `objects-present-unverifiable-rules` with an
  // empty present list, i.e. a sentence claiming things exist while naming none.
  let graded = 0;

  for (const o of objects) {
    if (o.kind === "function" && !knowsRpcs) {
      if (!unverifiable.includes("create function")) unverifiable.push("create function");
      continue;
    }
    if (o.kind === "comment") {
      // Two ways this cannot be graded, and neither may read as `missing`:
      // no descriptions supplied at all, and a comment on an object prod does
      // not expose (an unexposed table, or a trigger function) — the data API
      // publishes no description for something it does not publish.
      if (!knowsDocumented) {
        if (!unverifiable.includes(COMMENT_UNGRADED)) unverifiable.push(COMMENT_UNGRADED);
        continue;
      }
      if (!targetIsExposed(o.target, shape)) {
        if (!unverifiable.includes(COMMENT_UNEXPOSED)) unverifiable.push(COMMENT_UNEXPOSED);
        continue;
      }
      graded += 1;
      ((shape.documented ?? []).includes(o.target) ? present : missing).push(describe(o));
      continue;
    }
    graded += 1;
    if (o.kind === "function") {
      (shape.rpcs.includes(o.name) ? present : missing).push(describe(o));
      continue;
    }
    const cols = shape.tables[o.table];
    const exists = o.kind === "table" ? cols !== undefined : (cols?.includes(o.column) ?? false);
    (exists ? present : missing).push(describe(o));
  }

  const ceiling = unverifiable.length ? evidenceCeiling(unverifiable) : undefined;

  if (missing.length) {
    return {
      name,
      verdict: "objects-missing",
      present,
      missing,
      unverifiable,
      ceiling,
      reason: `prod is missing ${missing.join(", ")} — this migration has not fully landed`,
    };
  }
  if (!graded) {
    return {
      name,
      verdict: "no-visible-objects",
      present,
      missing,
      unverifiable,
      ceiling,
      reason: ceiling
        ? `only does things the OpenAPI root cannot see (${unverifiable.join(", ")}) — no evidence either way; ${ceiling.reason}`
        : "creates no table or column the OpenAPI root can see — no evidence either way",
    };
  }
  if (unverifiable.length) {
    return {
      name,
      verdict: "objects-present-unverifiable-rules",
      present,
      missing,
      unverifiable,
      ceiling,
      reason: `${present.join(", ")} exist, but ${unverifiable.join(", ")} cannot be seen from here — NOT proof it is applied`,
    };
  }
  return {
    name,
    verdict: "objects-present",
    present,
    missing,
    unverifiable,
    reason: `${present.join(", ")} all exist on prod and this file does nothing else`,
  };
}

export type EvidenceReport = {
  evidence: Evidence[];
  /** Files whose objects are missing — the alarming ones, regardless of any marker. */
  notLanded: string[];
  /** Files an APPLIED marker could be written for on evidence rather than assertion. */
  supportsApplied: string[];
  /** Files the live schema simply cannot speak to. */
  noEvidence: string[];
  /**
   * The `noEvidence` list split by whether it can EVER shrink. Without this the
   * bucket reads as a backlog — two increments in a row handed it forward as if
   * one more pass would clear it, and most of it structurally cannot be cleared
   * by any read-only check.
   */
  noEvidenceCeiling: { probeable: string[]; permanent: string[]; unclassified: string[] };
};

/**
 * `supportsApplied` is deliberately narrow: only `objects-present`, never the
 * `…-unverifiable-rules` case. Shrinking the unmarked list is the goal, but a
 * marker written off partial evidence is worth less than no marker at all.
 */
export function evidenceReport(
  files: Array<{ name: string; sql: string }>,
  live: LiveSchema | LiveShape,
): EvidenceReport {
  const evidence = [...files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => schemaEvidence(f.name, f.sql, live));

  const blind = evidence.filter((e) => e.verdict === "no-visible-objects");
  const byCeiling = (c: Ceiling) => blind.filter((e) => e.ceiling?.ceiling === c).map((e) => e.name);

  return {
    evidence,
    notLanded: evidence.filter((e) => e.verdict === "objects-missing").map((e) => e.name),
    supportsApplied: evidence.filter((e) => e.verdict === "objects-present").map((e) => e.name),
    noEvidence: blind.map((e) => e.name),
    noEvidenceCeiling: {
      probeable: byCeiling("probeable-read-only"),
      permanent: byCeiling("permanent"),
      // A blind file with no ceiling at all carries no recognised statement
      // either — it is as unclassified as one carrying an unknown label, and
      // dropping it here would make the three lists silently not sum.
      unclassified: blind.filter((e) => !e.ceiling || e.ceiling.ceiling === "unclassified").map((e) => e.name),
    },
  };
}

/**
 * The OpenAPI root, reduced to the shape above. Kept here (rather than in the
 * script) so the parsing the tests grade is the parsing that runs.
 */
export function liveSchemaFromOpenApi(doc: unknown): LiveSchema {
  const root = (doc ?? {}) as Record<string, unknown>;
  const defs =
    (root.definitions as Record<string, { properties?: Record<string, unknown> }> | undefined) ??
    ((root.components as { schemas?: Record<string, { properties?: Record<string, unknown> }> } | undefined)
      ?.schemas ??
      {});

  const out: LiveSchema = {};
  for (const [table, def] of Object.entries(defs)) {
    out[table.toLowerCase()] = Object.keys(def?.properties ?? {}).map((c) => c.toLowerCase());
  }
  return out;
}

/**
 * Same document, the half inc.52 did not read: PostgREST publishes each exposed
 * function as a path `/rpc/<name>`. Names only — arity and return type are not
 * recoverable from the root, so this proves a function of that name is callable
 * and nothing finer. That is still strictly more than the "invisible" this
 * replaces.
 */
export function liveRpcsFromOpenApi(doc: unknown): string[] {
  const paths = ((doc ?? {}) as { paths?: Record<string, unknown> }).paths ?? {};
  return Object.keys(paths)
    .filter((p) => p.startsWith("/rpc/"))
    .map((p) => p.slice("/rpc/".length).toLowerCase())
    .filter(Boolean);
}

/**
 * inc.57 — the third half of the same document: PostgREST renders `comment on`
 * into `description`, on a definition (table/view), on a property (column) and on
 * an `/rpc/<name>` path (function). Generated PK/FK notes are stripped first —
 * see `humanDescription`.
 */
export function liveDocumentedFromOpenApi(doc: unknown): string[] {
  const root = (doc ?? {}) as Record<string, unknown>;
  const defs =
    (root.definitions as Record<string, { description?: unknown; properties?: Record<string, unknown> }> | undefined) ??
    ((
      root.components as
        | { schemas?: Record<string, { description?: unknown; properties?: Record<string, unknown> }> }
        | undefined
    )?.schemas ??
      {});

  const out: string[] = [];
  for (const [table, def] of Object.entries(defs)) {
    const t = table.toLowerCase();
    if (humanDescription(def?.description)) out.push(`table:${t}`);
    for (const [col, prop] of Object.entries(def?.properties ?? {})) {
      if (humanDescription((prop as { description?: unknown })?.description)) out.push(`column:${t}.${col.toLowerCase()}`);
    }
  }

  const paths = ((doc ?? {}) as { paths?: Record<string, Record<string, unknown>> }).paths ?? {};
  for (const [p, ops] of Object.entries(paths)) {
    if (!p.startsWith("/rpc/")) continue;
    for (const op of Object.values(ops ?? {})) {
      const o = op as { description?: unknown; summary?: unknown };
      if (humanDescription(o?.description) || humanDescription(o?.summary)) {
        out.push(`function:${p.slice("/rpc/".length).toLowerCase()}`);
        break;
      }
    }
  }
  return out;
}

export function liveShapeFromOpenApi(doc: unknown): LiveShape {
  return {
    tables: liveSchemaFromOpenApi(doc),
    rpcs: liveRpcsFromOpenApi(doc),
    documented: liveDocumentedFromOpenApi(doc),
  };
}
