import { resolvedFrom } from "@/lib/flags/supersede";
import { resolveNoteFor } from "@/lib/comms/proposalFlag";

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

  return (
    `This note ends with "Resolved from ${typed}." — the ledger reads that sentence as its ` +
    `own record of which page a finding was closed from, so it would be taken out of your ` +
    `quote and shown as the ledger's line instead of yours. This click writes no such stamp, ` +
    `which would leave ${typed} standing as provenance nobody recorded. Reword it so the ` +
    `sentence does not end there — "Closed after ${typed} was checked", or put the id earlier ` +
    `— and it stays exactly as you typed it.`
  );
}
