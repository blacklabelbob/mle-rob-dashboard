/**
 * Q70 inc.2 (2026-07-28) — where a person's or an org's identity comes from.
 *
 * THE RULE THIS MODULE EXISTS TO HOLD: an id is a record number, never a name.
 *
 * Until 0031 the id WAS the name, slugified — 'caleb-green'. Rob read the schema cold and
 * called it: "you need number records not names." The old scheme had already failed in
 * production and been papered over, in this codebase's own words (lib/comms/emailPeople.ts):
 *
 *     "two strangers at the same company on one thread both slugify to the same base id
 *      ... the second person becomes `dana-reyes-2`"
 *
 * `dana-reyes-2` is not an identity. It is the order two emails happened to arrive in, and
 * it means the SECOND Dana Reyes is permanently labelled as a duplicate of the first. Rename
 * anybody and the id either lies or 18 foreign keys break.
 *
 * It also blocks the ingest agent, which is the reason this landed before the agent and not
 * after: resolving "Mike" from a transcript to a row cannot key on the very string it is
 * trying to disambiguate without eventually merging two real people into one.
 *
 * WHY A NUMBER AND NOT A UUID. Rob has to say these out loud — "pull up P-1043" — and read
 * them off a screen. A uuid is unreadable. A bare integer collides across the two tables
 * where they meet in `edges`, so the letter is load-bearing, not decoration.
 *
 * PURE (CR-3). No clock, no network, no store. The caller passes the ids already taken —
 * the same contract `personIdFor`/`orgIdFor` always had — so the next number is a function
 * of what exists, and two runs over the same input produce the same answer. In Postgres the
 * sequences in 0031 do this job; this is the file-store and planning path, and the two agree
 * on shape, which is all they need to agree on.
 */

/** Person ids look like `P-1001`. */
export const PERSON_ID_RE = /^P-\d+$/;
/** Org ids look like `C-2001` — C for company, so a person and an org can never collide. */
export const ORG_ID_RE = /^C-\d+$/;

/** Sequence floors. They match `people_record_no_seq` / `orgs_record_no_seq` in 0031. */
const PERSON_FLOOR = 1001;
const ORG_FLOOR = 2001;

export function isPersonId(value: string): boolean {
  return PERSON_ID_RE.test(value);
}

export function isOrgId(value: string): boolean {
  return ORG_ID_RE.test(value);
}

/** True for any id this scheme mints. Anything else is a pre-0031 slug. */
export function isRecordId(value: string): boolean {
  return isPersonId(value) || isOrgId(value);
}

function nextNumber(taken: Iterable<string>, prefix: "P" | "C", floor: number): string {
  let highest = floor - 1;
  for (const id of taken) {
    // A `taken` set legitimately contains pre-0031 slugs during the cutover; they carry no
    // number and simply do not raise the ceiling.
    if (id.length < 3 || id[0] !== prefix || id[1] !== "-") continue;
    const n = Number(id.slice(2));
    if (Number.isInteger(n) && n > highest) highest = n;
  }
  return `${prefix}-${highest + 1}`;
}

/**
 * The next free person id.
 *
 * Never collides, never empty, and — unlike the scheme it replaces — never has to fall back
 * to a "-2" suffix, because it was never derived from anything two people could share.
 */
export function nextPersonId(taken: Iterable<string>): string {
  return nextNumber(taken, "P", PERSON_FLOOR);
}

/** The next free org id. */
export function nextOrgId(taken: Iterable<string>): string {
  return nextNumber(taken, "C", ORG_FLOOR);
}

/**
 * The human handle for a row, stored in `legacy_slug`.
 *
 * This is the string the id used to be. It is kept for one reason: every /people/caleb-green
 * URL, bookmark and external link that existed before 0031 still has to resolve. It is a
 * LOOK-UP KEY ONLY. Nothing may key a foreign key on it, and nothing may treat two rows with
 * a colliding handle as the same row — that is the whole defect we just removed.
 */
export function handleFor(name: string, fallback: string, taken: Iterable<string>): string {
  const base = slugifyHandle(name) || slugifyHandle(fallback) || "record";
  const seen = taken instanceof Set ? taken : new Set(taken);
  let handle = base;
  for (let n = 2; seen.has(handle); n++) handle = `${base}-${n}`;
  return handle;
}

/** The pre-0031 slug shape, preserved exactly so old links keep matching. */
export function slugifyHandle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve whatever came in off a URL to the thing a query should match on.
 *
 * A request can carry either shape for as long as old links exist in the world, which is
 * forever. Callers use this instead of guessing, so no route has to remember the rule.
 */
export function idOrHandle(value: string): { column: "id" | "legacy_slug"; value: string } {
  return isRecordId(value)
    ? { column: "id", value }
    : { column: "legacy_slug", value };
}
