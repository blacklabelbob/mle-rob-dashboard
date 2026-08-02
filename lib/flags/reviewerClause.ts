import { resolvedFrom } from "@/lib/flags/supersede";
import { resolveNoteFor } from "@/lib/comms/proposalFlag";
import { flagNamedRecordIds } from "@/lib/flags/recordLinks";

/**
 * Q84 inc.97 — the reviewer's own trailing `Resolved from C-….` read back as the ledger's
 * provenance, on the paths where the writer never stamps.
 *
 * THE DEFECT. `resolvedFromNote` returns the body UNTOUCHED on two early returns — off a
 * record page (`from` is not a minted id) and on a row that names nothing else and is filed
 * where the click happened — and `resolveNoteFor` adds a third for a proposal. inc.91 taught
 * the writer to refuse a masquerade, but that guard sits BELOW those returns: it compares a
 * typed clause against `from` only once it has already decided to stamp. On the three paths
 * that decide not to, a sentence a HUMAN typed is persisted verbatim, and then:
 *
 *   - `archiveResolvedFromMark` reads it with `resolvedFrom` and prints it as *Resolved from
 *     C-1234's page — it is one finding, so closing it there closed it here*, and
 *   - `resolutionNoteBody` STRIPS it out of the quoted note, so the reviewer's own words
 *     vanish from the reviewer's own quote.
 *
 * That is inc.91's defect exactly — Rob's sentence adopted as the ledger's — on the branches
 * inc.91 could not reach. inc.36 (a machine sentence attributed to Rob), inc.91, inc.95 (an
 * author the ledger never recorded) and inc.96 (an actor nobody verified) are the same defect;
 * this is its last live spelling on the resolve path. 0 rows on prod carry a clause today, so
 * this closes the door before anything walks through it rather than cleaning up after.
 *
 * WHY THE READER CANNOT BE THE FIX — the half of inc.96's handover that had to be answered
 * before anything was built. The obvious move is to have `archiveResolvedFromMark` refuse a
 * clause naming a record outside the row's own scope; it already receives `named`, `printed`
 * and `filedOn`. It must not. A LEGITIMATE machine stamp routinely names a record the row
 * never prints — that is the entire reason `qualifiedRecordRef(from, false)` exists (inc.34):
 * `/api/admin/flags?person=P-…` fans out through `org_memberships`, so prod #137 names two
 * companies and no person and is resolvable from three people's pages. Refusing out-of-scope
 * clauses would delete the provenance on precisely the rows inc.34/inc.35 were spent building.
 * The reader cannot tell the two authors apart, and no evidence it holds would let it.
 *
 * So two authors in one text field IS unsolvable at the reader — and the answer is not a
 * column either (inc.96 ruled on writing unverified authorship into the schema). It is
 * solvable at the WRITER, which is the one party that knows whether it wrote the clause: it
 * refuses the collision instead of silently creating it.
 *
 * AND IT REFUSES RATHER THAN REWRITES. Stripping or re-punctuating the reviewer's sentence
 * would be the ledger editing a note it renders in quotes as that person's own words — the
 * thing `resolutionNoteBody` exists to prevent, done by the other hand.
 */

/**
 * Refuse a resolve whose typed note would be read back as the ledger's own provenance stamp,
 * or `null` when it would not. `null` is the normal answer — a note without the grammar, and
 * every note on prod today, returns it.
 *
 * ONE LADDER, NOT A SECOND COPY (inc.4/inc.5): "would this click stamp?" is answered by
 * asking `resolveNoteFor` — the very function the caller then uses to build the note — rather
 * than by restating its conditions here. A branch added there is met here for free.
 *
 * Arguments mirror `resolveNoteFor` exactly so a caller cannot answer a different question by
 * accident.
 *
 * @param title      the flag's title, which is what says whether this row is a proposal
 * @param note       what the reviewer typed
 * @param fromRecord the record page the click was made on, or null/undefined off a record page
 * @param others     the OTHER records this row names (`flagNamedScope().others`)
 * @param homeRecord the record this row is FILED on (`entity_ref ?? entity_id`), when known
 */
export function reviewerClauseRefusal(
  title: string,
  note: string,
  fromRecord?: string | null,
  others: readonly string[] = [],
  homeRecord?: string | null,
): string | null {
  const body = (note ?? "").trim();
  const typed = resolvedFrom(body);
  if (typed === null) return null;

  // The writer stamps: its own clause lands last, `RESOLVED_FROM` is anchored at `$`, and the
  // reviewer's sentence stays inside the reviewer's quote. inc.91 already owns this case.
  if (resolveNoteFor(title, note, fromRecord, others, homeRecord) !== body) return null;

  // True idempotence, kept for the same reason inc.91 kept it: a reviewer standing on C-2017
  // who types "Resolved from C-2017." has typed the exact string the machine would have
  // written. There is nothing to disentangle and no reader that could be misled.
  if (typed === (fromRecord ?? "").trim()) return null;

  return clauseRefusalMessage(typed);
}

/**
 * The one sentence, written once. inc.90's lesson: a string spelled out in two places is how
 * the third copy gets written differently — and this one is read by a human deciding whether
 * their own words are safe, so the two callers disagreeing would be worse than usual.
 */
function clauseRefusalMessage(typed: string): string {
  return (
    `This note ends with "Resolved from ${typed}." — the ledger reads that sentence as its ` +
    `own record of which page a finding was closed from, so it would be taken out of your ` +
    `quote and shown as the ledger's line instead of yours. This click writes no such stamp, ` +
    `which would leave ${typed} standing as provenance nobody recorded. Reword it so the ` +
    `sentence does not end there — "Closed after ${typed} was checked", or put the id earlier ` +
    `— and it stays exactly as you typed it.`
  );
}

/**
 * Q84 inc.98 — the same refusal at the ROUTE, and it is deliberately NARROWER than the one
 * the UI runs.
 *
 * inc.96's ruling, which inc.97 then re-proved on its own path: *the UI never offering a thing
 * is not the same as the server refusing it.* `PATCH /api/admin/flags` stores `note.trim()`
 * raw, so every no-stamp path inc.97 closed is still reachable by any agent, script or curl in
 * the fleet. The handover asked whether the route can be handed enough of the row to run the
 * one ladder. Read from the code, it cannot — and the shape of what it *can* do is the finding.
 *
 * WHAT THE ROUTE DOES NOT HAVE. Every branch of `resolvedFromNote` pivots on `fromRecord` —
 * the record page the click was made on — and that is browser context, not a column. It is
 * not on the wire, and putting it there would be a claim the route cannot check, which is
 * exactly what inc.96 refused for `resolvedBy`. Worse, the route cannot even tell the two
 * authors apart after the fact: the CLIENT appends the machine stamp before sending, so a
 * legitimate stamp and a reviewer's typed clause arrive as the identical string. Refusing
 * every trailing clause would refuse the writer's own provenance on precisely the rows
 * inc.34/inc.35 were spent building — inc.97's reader problem, moved one layer out.
 *
 * WHAT IT DOES HAVE, and why this is a strict SUBSET rather than a second, different rule:
 *
 *  1. *Does this row stamp at all?* — asked, not restated, by running `resolveNoteFor` on an
 *     empty note with a probe `from` that would stamp on any ordinary row (the idiom
 *     `proposalHint` already uses). A title that suppresses the clause for a stamping `from`
 *     suppresses it for every `from`, so no browser context is needed to know the answer. A
 *     proposal is the one such row today; the day that rule changes here follows it for free,
 *     which is why this asks the writer instead of importing `proposalDomain`.
 *  2. *Could the exempt case apply?* — inc.97 lets a reviewer standing on C-2017 type
 *     "Resolved from C-2017.", because there is nothing to disentangle. The route cannot know
 *     where they stood, so it over-approximates: any record the row is FILED on or NAMES is
 *     treated as a page the click could have come from, held or not. Ids the row has no
 *     relationship to are the only ones refused. Over-approximating here costs refusals, and
 *     a refusal the UI would not have shown is the inc.94 defect (a layer disagreeing with the
 *     layer above it) — so the miss is taken deliberately in that direction.
 *
 * The result: the server closes the proposal path outright and leaves the other two to the
 * client, and that gap is stated rather than papered over. It is not "the same ladder", and
 * calling it that would be the false claim.
 *
 * @param title  the flag's title — what says whether this row is a proposal
 * @param detail the flag's detail — read only for the ids the row prints
 * @param note   what the caller is asking to persist
 * @param homeRecord the record the row is filed on (`entity_ref ?? entity_id`), when known
 */
export function routeClauseRefusal(
  title: string | null | undefined,
  detail: string | null | undefined,
  note: string,
  homeRecord?: string | null,
): string | null {
  const typed = resolvedFrom((note ?? "").trim());
  if (typed === null) return null;

  // Probe `from`/`others` chosen only so an ordinary row WOULD stamp; the empty note keeps
  // the answer collision-free (a caller's own text can never be mistaken for the stamp).
  const rowTitle = title ?? "";
  if (resolveNoteFor(rowTitle, "", "C-0", ["C-1"]) !== "") return null;

  const reachable = new Set(flagNamedRecordIds(rowTitle, detail));
  const home = (homeRecord ?? "").trim();
  if (home) reachable.add(home);
  if (reachable.has(typed)) return null;

  return clauseRefusalMessage(typed);
}

/**
 * Q84 inc.100 — the same sentence arriving through the OTHER door, where the route can prove
 * it outright.
 *
 * inc.99 closed the fleet's one off-page RESOLVE (an agent instruction, gated by a test). Its
 * handover asked the obvious next thing: `meeting-scribe`'s other write is a POST, whose
 * `detail` is free text composed by the same agent that has just read a ledger whose house
 * sentence is literally `Resolved from C-1234.` — can a FILED finding end in it too?
 *
 * IT CAN, AND IT COSTS MORE THAN A MISREAD SENTENCE. `flagNamedScope` reads the `detail` (and
 * the title) for minted ids, and every one of prod's 142 rows carries a null `entity_id`, so
 * every row is scope-bearing. An id inside that trailing sentence therefore joins `named` —
 * the row starts rendering on that record's page with a Resolve button on it — and joins
 * `others`, which is the exact input `resolvedFromNote` early-returns on
 * (`!others.length && !filedElsewhere`). So a fabricated stamp in the DETAIL manufactures the
 * condition under which the machine later writes a REAL one into the note. Not provenance that
 * merely reads wrong: provenance that becomes genuine.
 *
 * WHY THIS ONE IS PROVABLE AT THE SERVER WHEN inc.98's WAS NOT. inc.98 could only close a
 * subset, because on the resolve path the client appends the machine's stamp before sending —
 * a legitimate stamp and a typed clause arrive as the identical string, and refusing both would
 * delete the provenance inc.34/inc.35 were spent building. Here the FIELD tells them apart:
 * `resolvedFromNote` writes that sentence into `resolution_note` and nowhere else, and no
 * producer in this repo writes it into a `title` or a `detail`. There is no legitimate author
 * to refuse, so this refusal is total rather than a subset — and it is the first one on this
 * ladder that can say so honestly.
 *
 * IT REFUSES A POSITION, NOT AN ID. Eight rows on prod name minted ids inside their detail and
 * are meant to; that is how a finding reaches the records it concerns. Only the TERMINAL
 * sentence is the ledger's grammar (`RESOLVED_FROM` is anchored at `$`), so moving the id
 * earlier keeps every bit of the row's reach and costs the caller nothing real.
 *
 * @param title  the title being filed
 * @param detail the detail being filed
 */
export function filedClauseRefusal(
  title: string | null | undefined,
  detail: string | null | undefined,
): string | null {
  // Detail first: it is the longer field, the one an agent narrates into, and the one every
  // caller must send. Same reader as the writer's own (inc.4/inc.5) — never a second regex.
  const inDetail = resolvedFrom((detail ?? "").trim());
  if (inDetail !== null) return filedClauseRefusalMessage("detail", inDetail);
  const inTitle = resolvedFrom((title ?? "").trim());
  if (inTitle !== null) return filedClauseRefusalMessage("title", inTitle);
  return null;
}

/** The one sentence, written once (inc.90), naming the alternative rather than just the no. */
function filedClauseRefusalMessage(field: "title" | "detail", typed: string): string {
  return (
    `This flag's ${field} ends with "Resolved from ${typed}." — that sentence is the ledger's ` +
    `own record of which page a finding was CLOSED from, and a flag being filed has not been ` +
    `closed by anyone. Ending there also puts ${typed} in the records this row names, so it ` +
    `would appear on that record's page and the resolve stamp written later would cite a page ` +
    `nobody clicked. Move the id earlier in the sentence — "…, filed against ${typed}" — and ` +
    `the row still reaches ${typed} exactly as it would have.`
  );
}
