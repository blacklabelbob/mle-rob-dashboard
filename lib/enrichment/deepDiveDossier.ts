/**
 * Q87 inc.6 — THE `dive()` SEAM GETS AN IMPLEMENTATION.
 *
 * inc.5 shipped the pass and named its own gap in one line: *"the pass has no `dive`
 * implementation — the research belongs to `lead-enricher`"*. `DeepDivePassDeps.dive` is a
 * function type with nothing behind it, so `runDeepDivePass` can be executed today and will
 * always record nothing.
 *
 * The research itself is an agent's job and stays one — `lead-enricher` reads the web, this
 * module does not. What has been missing is the HANDOFF: somewhere for that agent to put what it
 * found, and a rule for what the pass is allowed to accept from it. That is this file. The agent
 * writes a dossier per org; this turns a dossier into a `DeepDiveFinding`, or refuses it by name.
 *
 * THE FAILURE THIS MODULE EXISTS TO PREVENT is narrower and nastier than "bad research". It is
 * ONE dossier covering FOUR companies. All four referral targets share an owner (Steven A. Hale II
 * chairs or presides over every one of them — Q87, 2026-08-05), so a single Hale Partnership
 * write-up genuinely reads as relevant background on Monarch, Viceroy and HG Holdings too. Handed
 * to the pass four times it would clear the whole worklist to `covered` off one piece of research
 * — the INCIDENT-LEDGER #22/#34 shape again, and the pass upstream could not catch it, because by
 * the time a finding reaches `runFromFinding` it carries no claim about WHICH company it is about.
 * So:
 *
 *   1. A DOSSIER DECLARES ITS OWN SUBJECT, AND IT MUST MATCH. `dossier.orgId` is compared to the
 *      org being dived and a mismatch is refused, naming both ids. A dossier that declares no
 *      subject at all is refused too — an undeclared subject is the same laundering path with the
 *      claim left off, and defaulting it to "whichever org we asked about" is exactly the
 *      convenience that makes the mismatch check pointless.
 *
 *   2. A SOURCE IS A URL. `~/.claude/rules/external-facts.md`. These are companies MLE has never
 *      met, and this very item already carries the counter-example: Scott's *"$125M net profit"*
 *      for Monarch is recorded as an UNVERIFIED CLAIM ATTRIBUTED TO SCOTT and flagged never to be
 *      quoted. `"Scott said"` and `"per the 7/28 call"` are attributions, not sources, so
 *      non-URL entries are dropped WITH their reason rather than passed along to be counted.
 *      A dossier whose sources are all attributions is refused for having none.
 *
 *   3. A PLAN IS NOT A DIVE. A dossier may say what it is (`status`). Anything that is not
 *      `complete` — `planned`, `in-progress`, `blocked` — is refused as unfinished. Absent is
 *      treated as complete, because the field is optional and inventing a blocker from silence is
 *      the opposite failure.
 *
 *   4. NOTHING IS FILLED IN. `producedBy`, `ranAt` and `summary` pass through untouched, never
 *      defaulted. This module may DROP a claim; it may not MAKE one. The pass's own rules 1–3
 *      still fire afterwards on whatever survives, so a dossier with no producer is refused by
 *      `runFromFinding` exactly as any other nameless result is.
 *
 *   5. A MISSING DOSSIER IS NOT AN EMPTY DIVE. "The researcher never ran" and "the researcher
 *      found nothing" are different facts about a company and get different words. Reading them
 *      as the same is how a never-started worklist reads as a finished one.
 *
 * PURE (CR-3): no fs, no clock, no fetch. The dossier arrives as already-parsed JSON; whoever
 * opened the file lives in the script. `makeDossierDive` is the only thing here that touches the
 * pass, and it takes the load function rather than performing the load.
 */

import type { DeepDiveDecision } from "./deepDiveDue";
import type { DeepDiveFinding } from "./deepDivePass";

/** Refusal shape — the reason travels, always. A dropped dossier without a reason is a bug. */
export interface DossierRefusal {
  refused: string;
}

export interface DossierRead {
  finding: DeepDiveFinding;
  /** Entries that were not URLs, with why. Reported even on success — a half-sourced dossier
   *  should be visible to whoever reads the run, not silently trimmed to the good half. */
  droppedSources: { value: string; reason: string }[];
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** http/https only. A `file://` path or a bare domain is not something a reader can check. */
function urlReason(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "not a URL — an attribution is not a source (external-facts.md)";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `"${parsed.protocol}" is not a web source anyone else can open`;
  }
  return null;
}

const isRefusal = (v: DossierRead | DossierRefusal): v is DossierRefusal =>
  Object.prototype.hasOwnProperty.call(v, "refused");

/**
 * Turn one dossier into a finding the pass may consider, or refuse it by name.
 *
 * Exported and tested directly: this is the only place that knows a dossier claims a subject, and
 * the subject check is the whole reason the module exists.
 */
export function dossierToFinding(orgId: string, raw: unknown): DossierRead | DossierRefusal {
  if (raw === null || raw === undefined) {
    // Rule 5 — said in the words of what happened, not "no findings".
    return { refused: `no dossier on file for ${orgId} — nothing has researched it yet` };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { refused: `the dossier for ${orgId} is not an object — it cannot be read as research` };
  }

  const d = raw as Record<string, unknown>;

  // Rule 1 — before anything else. A dossier that is about someone else is not weak evidence
  // about this company, it is evidence about a different company.
  const subject = text(d.orgId);
  if (!subject) {
    return {
      refused: `the dossier offered for ${orgId} names no subject — a dossier that does not say which company it researched cannot cover one`,
    };
  }
  if (subject !== orgId) {
    return {
      refused: `the dossier offered for ${orgId} is about ${subject} — shared ownership is not shared research, and one write-up may not cover two companies`,
    };
  }

  // Rule 3.
  const status = text(d.status).toLowerCase();
  if (status && status !== "complete") {
    return { refused: `the dossier for ${orgId} is "${status}", not complete — a plan is not a dive` };
  }

  // Rule 2 — drop with reasons, never quietly.
  const rawSources = Array.isArray(d.sources) ? d.sources : [];
  const sources: string[] = [];
  const droppedSources: { value: string; reason: string }[] = [];
  for (const entry of rawSources) {
    const value = text(entry);
    if (!value) {
      droppedSources.push({ value: String(entry ?? ""), reason: "empty" });
      continue;
    }
    const reason = urlReason(value);
    if (reason) droppedSources.push({ value, reason });
    else sources.push(value);
  }

  // Rule 4 — pass through, never fill in. The pass refuses what is missing, with its own words.
  return {
    finding: {
      producedBy: text(d.producedBy) || undefined,
      ranAt: text(d.ranAt) || undefined,
      summary: text(d.summary) || undefined,
      sources,
    },
    droppedSources,
  };
}

/**
 * Adapt a dossier loader into the pass's `dive`.
 *
 * A refusal is THROWN on purpose. The pass already has one channel for "this org produced nothing
 * recordable and here is why" — rule 6, which contains the failure to the one org, names it in the
 * outcome, and leaves the company `due-unattributed`. That is precisely the right result for a
 * mis-filed or unfinished dossier, and inventing a second channel for it would mean two paths to
 * the same outcome with two chances to get one wrong.
 */
export function makeDossierDive(
  load: (decision: DeepDiveDecision) => Promise<unknown>,
  onRead?: (decision: DeepDiveDecision, read: DossierRead) => void,
): (decision: DeepDiveDecision) => Promise<DeepDiveFinding> {
  return async (decision) => {
    const result = dossierToFinding(decision.orgId, await load(decision));
    if (isRefusal(result)) throw new Error(result.refused);
    onRead?.(decision, result);
    return result.finding;
  };
}
