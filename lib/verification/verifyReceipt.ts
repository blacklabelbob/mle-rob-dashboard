/**
 * The verify helper owed by INCIDENT-LEDGER #47 and again by #48.
 *
 * Both incidents have the same generator: a "verified" paragraph was WRITTEN
 * for a measurement that was never TAKEN. #47 read rc from the wrong process
 * (a wrapper's `tail`); #48's increment was killed by the 480s alarm after it
 * had already typed the paragraph and before it ran the command. A rule saying
 * "read rc from `$?` immediately" is satisfied by both of those runs, which is
 * why the rule did not hold — nothing FAILS a claim that was never measured.
 *
 * This module is the missing half: an rc may only enter prose by way of a
 * RECEIPT that some process actually produced. The receipt is written by
 * `scripts/verify.mjs`, which captures rc itself. Everything here is pure —
 * no clock, no fs, no network (CR-3); the caller hands in the receipts it read.
 */

export type VerifyTool = "vitest" | "build" | "typecheck" | "other";

export type VerifyReceipt = {
  /** The command exactly as it was handed to the shell. */
  command: string;
  /** Normalised from `command` — never supplied by hand, see `makeReceipt`. */
  tool: VerifyTool;
  /** Captured from the command's own exit status, never from a wrapper's. */
  rc: number;
  startedAt: string;
  finishedAt: string;
};

/**
 * Which check a command IS, decided from the command text alone.
 *
 * Deliberately coarse: the audit's question is "did a vitest run happen this
 * increment", not "was it the same flags". A finer match would let a claim go
 * unbacked because the receipt said `--silent`, which trains the reader to
 * ignore the gate.
 */
const TOOL_MARKERS: ReadonlyArray<[VerifyTool, RegExp]> = [
  ["vitest", /vitest/g],
  ["build", /next build|\bnpm run build\b/g],
  ["typecheck", /\btsc\b|typecheck/g],
];

/**
 * The NEAREST named command wins, not the first one in this list.
 *
 * A verification row routinely names two checks in one sentence — "`npx vitest
 * run` → rc=0 … `npm run build` → rc=0" — and the second claim's context window
 * reaches back over the first command. Priority order would then let the vitest
 * receipt vouch for the build claim, which is the whole failure this module
 * exists to make impossible. So: scan for every marker and take the one that
 * ends LAST, i.e. the command closest to the claim.
 */
export function classifyCommand(command: string): VerifyTool {
  const c = command.toLowerCase();
  let best: VerifyTool = "other";
  let bestEnd = -1;
  for (const [tool, marker] of TOOL_MARKERS) {
    for (const m of c.matchAll(marker)) {
      const end = (m.index ?? 0) + m[0].length;
      if (end > bestEnd) {
        bestEnd = end;
        best = tool;
      }
    }
  }
  return best;
}

export function makeReceipt(
  input: Omit<VerifyReceipt, "tool">,
): VerifyReceipt {
  return { ...input, tool: classifyCommand(input.command) };
}

/**
 * The only sanctioned way to write a verification line.
 *
 * It throws rather than returning a placeholder on purpose: a formatter that
 * degrades gracefully produces a sentence that still READS like a verification,
 * which is exactly the failure mode of #48 (a price list with every dollar
 * figure deleted still read fluently).
 */
export function formatVerifiedLine(receipt: VerifyReceipt): string {
  if (!receipt.command.trim()) {
    throw new Error("formatVerifiedLine: refusing to verify an empty command");
  }
  if (!Number.isInteger(receipt.rc)) {
    throw new Error(
      `formatVerifiedLine: rc must be an integer measured from the command, got ${JSON.stringify(receipt.rc)}`,
    );
  }
  if (!receipt.startedAt || !receipt.finishedAt) {
    throw new Error(
      "formatVerifiedLine: a receipt without both timestamps did not observe a run",
    );
  }
  if (Date.parse(receipt.finishedAt) < Date.parse(receipt.startedAt)) {
    throw new Error(
      "formatVerifiedLine: finishedAt precedes startedAt — this receipt did not come from a run",
    );
  }
  return `MEASURED \`${receipt.command}\` → rc=${receipt.rc} (${receipt.tool}, finished ${receipt.finishedAt})`;
}

export type RcClaim = {
  /** The claimed exit code, as written in the prose. */
  rc: number;
  /** Which check the surrounding words say it belongs to. */
  tool: VerifyTool;
  /** The matched text, for pointing a human at the sentence. */
  text: string;
  index: number;
};

/** `rc=0`, `rc = 0`, `exit 0`, `exit code 0`, `exitCode 0`. */
const RC_CLAIM = /\brc\s*=\s*(\d+)|\bexit(?:\s*code|Code)?\s*[:=]?\s*(\d+)\b/gi;

/** How far back to read for the command a claim is about. */
const CONTEXT_CHARS = 120;

/**
 * Pull every exit-code claim out of a block of prose (a PRD row, a queue
 * annotation, a commit message).
 *
 * The tool is read from the words BEFORE the claim, because that is how these
 * sentences are actually written: "`npx vitest run` → rc=0".
 */
export function parseRcClaims(prose: string): RcClaim[] {
  const claims: RcClaim[] = [];
  for (const m of prose.matchAll(RC_CLAIM)) {
    const raw = m[1] ?? m[2];
    if (raw === undefined) continue;
    const index = m.index ?? 0;
    const context = prose.slice(Math.max(0, index - CONTEXT_CHARS), index);
    claims.push({
      rc: Number(raw),
      tool: classifyCommand(context),
      text: m[0],
      index,
    });
  }
  return claims;
}

export type ClaimAudit = {
  /** A receipt from this run agrees with the claim. */
  backed: RcClaim[];
  /** Attributed to a real check, and NO receipt says so. This fails a run. */
  unbacked: RcClaim[];
  /**
   * The surrounding words name no check we recognise. Reported, never dropped:
   * a filter that quietly discards what it cannot classify is green about
   * nothing (the #48 fixture that could not reach its own branch).
   */
  unattributed: RcClaim[];
};

export function auditVerificationClaims(
  prose: string,
  receipts: readonly VerifyReceipt[],
): ClaimAudit {
  const audit: ClaimAudit = { backed: [], unbacked: [], unattributed: [] };
  for (const claim of parseRcClaims(prose)) {
    if (claim.tool === "other") {
      audit.unattributed.push(claim);
      continue;
    }
    const match = receipts.some(
      (r) => r.tool === claim.tool && r.rc === claim.rc,
    );
    (match ? audit.backed : audit.unbacked).push(claim);
  }
  return audit;
}
