/**
 * Q87 inc.4 — the DECISIONS the deep-dive command line makes, lifted out of the shell that does
 * the IO so they can be asserted.
 *
 * inc.2 shipped the question (`deepDiveDue.ts`), inc.3 shipped the place an answer gets written
 * down (`deepDiveLedger.ts`), and the Atlas note on inc.3 named what was still missing in one
 * line: *"still no writer on the other end (nothing appends yet)"*. Both modules are pure and
 * neither can read a file, so until something reads prod orgs, reads the ledger off disk and
 * writes a row back, `due-unattributed` was a verdict no run could ever leave.
 *
 * THE SHELL IS ALLOWED TO TOUCH THE WORLD; IT IS NOT ALLOWED TO DECIDE ANYTHING. Everything the
 * command does that could be wrong — which flags it accepts, what it refuses, what the operator
 * sees — lives here, pure (CR-3), so a test can hold it. `scripts/enrichment/deep-dive-worklist.mjs`
 * keeps exactly the parts a test cannot hold: Supabase, `readFileSync`, `writeFileSync`, `Date`.
 *
 * THE REFUSAL THAT MATTERS IS `--record` WITHOUT `--by`. `recordRun` already throws on a run with
 * no producer, but by then the operator has typed a command that reads like it worked and is one
 * stack trace away from adding `--by max` to make the error go away. The producer is the whole
 * point of the row: it is what separates "a deep dive ran" from "someone typed a paragraph", the
 * distinction inc.2 was built to make. So the refusal is stated in the operator's own words, at
 * the point they typed it, with the reason — not as a validation error one layer down.
 *
 * AND IT REFUSES TO RECORD A RUN IT DID NOT WITNESS. `--record` writes provenance; it does not do
 * research. A driver that can hand itself `covered` by typing one flag has rebuilt the exact
 * unfalsifiable claim inc.2 measured, so the command demands `--by` name a real producer AND
 * carries that name through to the row verbatim. Whoever reads the ledger later can go ask it.
 */

export interface DeepDiveCliArgs {
  /** `list` (default), `record`, or `pass`. */
  mode: "list" | "record" | "pass";
  /** Only set in `record` mode. */
  orgId?: string;
  producedBy?: string;
  /** ISO day for the run. The shell supplies today when the operator does not. */
  ranAt?: string;
  /** Days a recorded run stays fresh; handed to `deepDiveDue`. */
  freshDays?: number;
  /** `pass` mode only. Rule 4 of `deepDivePass`: never defaulted true, always stated. */
  execute?: boolean;
  /** `pass` mode only. Positive cap on orgs dived this tick. */
  limit?: number;
}

export interface CliRefusal {
  refusal: string;
}

const isRefusal = <T>(v: T | CliRefusal): v is CliRefusal =>
  typeof v === "object" && v !== null && Object.prototype.hasOwnProperty.call(v, "refusal");

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse `process.argv.slice(2)`. Returns either the args or a single refusal sentence — never
 * a partially-filled object, because a half-parsed `record` is how a run gets written against
 * the wrong org.
 */
export function parseDeepDiveArgs(argv: string[]): DeepDiveCliArgs | CliRefusal {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) return { refusal: `unexpected argument "${a}" — every input is a --flag` };
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.set(key, "");
    } else {
      flags.set(key, next);
      i += 1;
    }
  }

  const known = new Set(["record", "by", "on", "fresh-days", "pass", "execute", "limit"]);
  for (const key of flags.keys()) {
    if (!known.has(key)) {
      return {
        refusal: `unknown flag --${key} (known: --record, --by, --on, --fresh-days, --pass, --execute, --limit)`,
      };
    }
  }

  let freshDays: number | undefined;
  if (flags.has("fresh-days")) {
    const raw = flags.get("fresh-days") ?? "";
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n <= 0) return { refusal: `--fresh-days "${raw}" is not a positive number of days` };
    freshDays = n;
  }

  // Two writers with one command line. `--record` attributes a run an operator witnessed;
  // `--pass` lets the pass earn rows from dossiers. Which one wrote a row must never be a
  // question the ledger cannot answer, so they are refused together rather than ordered.
  if (flags.has("pass") && flags.has("record")) {
    return { refusal: "--pass and --record are two different writers — run one or the other, never both" };
  }

  if (flags.has("pass")) {
    if (flags.has("by") || flags.has("on")) {
      return {
        refusal:
          "--by / --on only mean something with --record: the pass NEVER names the producer, it " +
          "reads that name off the dossier the researcher wrote",
      };
    }
    if ((flags.get("pass") ?? "") !== "") {
      return { refusal: `--pass takes no value (got "${flags.get("pass")}") — it dives every org the worklist says is owed` };
    }
    if ((flags.get("execute") ?? "") !== "") {
      return { refusal: `--execute takes no value (got "${flags.get("execute")}")` };
    }
    let limit: number | undefined;
    if (flags.has("limit")) {
      const raw = flags.get("limit") ?? "";
      const n = Number(raw);
      if (!raw || !Number.isInteger(n) || n <= 0) return { refusal: `--limit "${raw}" is not a positive whole number of orgs` };
      limit = n;
    }
    // Rule 4 of `deepDivePass` restated at the point the operator types it: a bare `--pass`
    // PLANS. Spending a research budget is something a caller says out loud.
    return { mode: "pass", freshDays, execute: flags.has("execute"), limit };
  }

  if (flags.has("execute") || flags.has("limit")) {
    return { refusal: "--execute / --limit only mean something with --pass" };
  }

  if (!flags.has("record")) {
    if (flags.has("by") || flags.has("on")) {
      return { refusal: "--by / --on only mean something with --record <orgId>" };
    }
    return { mode: "list", freshDays };
  }

  const orgId = flags.get("record") ?? "";
  if (!orgId) return { refusal: "--record needs the org id of the company the deep dive ran on" };

  const producedBy = flags.get("by") ?? "";
  if (!producedBy) {
    return {
      refusal:
        `refusing to record a run on ${orgId} with no --by: the producer is what separates a deep dive from a ` +
        `paragraph someone typed, and it is the only reason a row here can ever say "covered"`,
    };
  }

  const ranAt = flags.get("on");
  if (ranAt !== undefined && !ISO_DAY_RE.test(ranAt)) {
    return { refusal: `--on "${ranAt}" is not an ISO day (YYYY-MM-DD)` };
  }

  return { mode: "record", orgId, producedBy, ranAt: ranAt || undefined, freshDays };
}

export { isRefusal as isCliRefusal };

/** The one on-disk location. Named here so the script and its test cannot disagree about it. */
export const DEEP_DIVE_LEDGER_PATH = "data/enrichment/deep-dive-runs.json";

/** Where `lead-enricher` drops what it found — one file per org, named by org id. */
export const DEEP_DIVE_DOSSIER_DIR = "data/enrichment/dossiers";

/**
 * The dossier file for one org, or a refusal.
 *
 * This is the loader's only decision, and it is the one worth holding: the org id arrives from
 * a PROD TABLE, and it is about to be pasted into a filesystem path. `C-2021` is fine;
 * `../../.env.local` is a read of Rob's service key wearing an org id's clothes. So the id is
 * checked against the shape ids actually have rather than scanned for bad substrings — a
 * denylist of `..` and `/` is the version of this check that gets bypassed.
 *
 * Pure (CR-3): it joins strings and returns them. Nothing here opens anything.
 */
export function dossierPath(orgId: string): string | CliRefusal {
  const id = typeof orgId === "string" ? orgId.trim() : "";
  if (!id) return { refusal: "cannot locate a dossier for an org with no id" };
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    return {
      refusal:
        `"${id}" is not a usable org id for a filename — a dossier path is built from it, so ` +
        `anything but letters, digits, dot, dash and underscore is refused rather than escaped`,
    };
  }
  if (id.includes("..")) {
    return { refusal: `"${id}" contains ".." — refused before it becomes a path` };
  }
  return `${DEEP_DIVE_DOSSIER_DIR}/${id}.json`;
}
