/**
 * Q84 inc.99 — the survey inc.98 asked for, turned into a gate.
 *
 * THE QUESTION, verbatim from inc.98's handover: *which fleet callers actually PATCH a
 * resolve off-page, whether any of them can produce a trailing clause at all, and what the
 * archive should render when one does.*
 *
 * READ FROM THE CODE, THE ANSWER IS ONE CALLER AND IT IS NOT A SCRIPT. Every fleet writer
 * that touches `/api/admin/flags` — `scripts/migration-backlog.mjs`, `scripts/notion-crm-check.mjs`,
 * `components/GenericDomainBlocklist.tsx` — **POSTs**. They file findings; not one of them
 * resolves. The only PATCH writers are `components/ThingsToAddress.tsx` (Rob's own click, which
 * runs `reviewerClauseRefusal` since inc.97) and **one agent instruction**:
 * `.claude/agents/meeting-scribe.md`, told to close a Meeting-capture flag with
 * `PATCH /api/admin/flags {id, action:"resolve", note}` after folding one of Rob's dumps.
 *
 * SO THE ANSWER TO "CAN IT PRODUCE A TRAILING CLAUSE" IS YES, AND BY IMITATION. That note is
 * free text written by an agent that has just read the ledger — where the house sentence is
 * literally `Resolved from C-1234.`. It runs no ladder, it is off every record page, so the
 * client-side refusal never sees it; and `routeClauseRefusal` (inc.98) is a strict subset that
 * only closes the PROPOSAL path, while a Meeting-capture row is an ordinary row. The clause
 * would be stored raw and then read back by `archiveResolvedFromMark` as *Resolved from
 * C-1234's page — it is one finding, so closing it there closed it here*: a claim about where a
 * human clicked, made about a machine that clicked nowhere. That is inc.36/inc.91/inc.95/inc.96
 * again — an author the ledger never recorded.
 *
 * WHY THE FIX IS HERE AND NOT AT THE READER OR THE ROUTE. inc.97 ruled the reader cannot tell
 * the two authors apart (a legitimate stamp routinely names a record the row never prints), and
 * inc.98 ruled the route cannot either (the client appends the stamp before sending, so both
 * arrive as the identical string). The one party that knows is the party composing the note. For
 * the browser that is `reviewerClauseRefusal`; for this caller it is the instruction file — so
 * the instruction has to carry the rule, and a rule in prose is only as good as whatever fails
 * when it goes missing. This module is that check, pure per CR-3: bytes in, finding out, no
 * filesystem and no clock — its test walks `.claude/agents/` and the gate is the assertion.
 */

/** A `PATCH /api/admin/flags … action: "resolve"` instruction, however the file spaces it. */
const RESOLVE_INSTRUCTION =
  /PATCH\s+`?\/api\/admin\/flags[^\n]{0,120}action:\s*"resolve"/i;

/**
 * The caution, spelled one way on purpose (inc.90). A file satisfies the gate by carrying this
 * literal phrase, so "did the author actually write the rule" is decidable rather than a guess
 * at whether some nearby paragraph means it.
 */
export const CLAUSE_CAUTION = 'must not end with "Resolved from';

/**
 * `null` when the file is fine — which is every agent file that never resolves a flag, and any
 * that does and states the rule. Otherwise the sentence naming what is missing.
 *
 * @param path    where the file lives, so a finding is traceable to something openable
 * @param content the file, already read by the caller
 */
export function resolveNoteInstructionGap(path: string, content: string): string | null {
  if (!RESOLVE_INSTRUCTION.test(content ?? "")) return null;
  if (content.includes(CLAUSE_CAUTION)) return null;
  return (
    `${path} tells an agent to PATCH a flag resolve with a free-typed note but never says the ` +
    `note ${CLAUSE_CAUTION} <id>." — a trailing clause there is read back by ` +
    `archiveResolvedFromMark as the ledger's own record of which page the finding was closed ` +
    `from, and this caller was on no page at all.`
  );
}
