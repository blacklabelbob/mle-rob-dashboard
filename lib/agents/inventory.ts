// Q79 increment 1 — the pure seam under "agents and skills, visible AND auditable"
// (Rob, ROB-ANSWERS-2026-07-29-night.md §2: "Its really hard to see if any of them
// are giving the wrong insttructions when I dont even know they exist").
//
// WHY THIS EXISTS: there are ~40 agent files and ~92 skill directories in
// `~/.claude/`, and not one of them is surfaced anywhere Rob can look. The ask is
// NOT a tidy list — the second sentence is the requirement: he wants to catch an
// agent that is telling people the wrong thing, and he has a live example (a
// marketing agent still saying he works at STG, a company he left). So the
// inventory is half (a) and the AUDIT is half (b), and the audit is the point.
//
// WHAT THIS MODULE IS: pure. It takes already-read file contents and returns
// records + findings. No filesystem, no clock, no randomness — the caller
// (`scripts/gen-agent-inventory.mjs`) does the walking and the stamping, so the
// classification logic is the thing the tests grade rather than a copy of it.
//
// WHAT IT DELIBERATELY DOES NOT DO: it does not edit or "fix" any agent file.
// Removing the stale STG claims is Q83, a content sweep across files OUTSIDE this
// repo. This module's job is to make a wrong instruction FINDABLE and to fail a
// gate on it. A detector that silently rewrites its own evidence is a detector
// nobody can audit.

/** Agents are single files; skills are directories with a SKILL.md. Both count. */
export type AssetKind = "agent" | "skill";

/** One file as the caller found it. `lastModified` is passed in, never read here (CR-3). */
export interface AssetSource {
  kind: AssetKind;
  /** Stable identifier: the agent filename without `.md`, or the skill directory name. */
  slug: string;
  /** Where it actually lives, so a finding is traceable to a file Rob can open. */
  path: string;
  content: string;
  /** ISO 8601. Supplied by the caller's stat() — this module has no clock. */
  lastModified: string;
}

export interface AssetRecord {
  kind: AssetKind;
  slug: string;
  /** Frontmatter `name` when present, else the slug. Never invented. */
  name: string;
  /** One line, from frontmatter `description`. `null` when the file declares none. */
  purpose: string | null;
  /** Frontmatter `model`, when the asset pins one. */
  model: string | null;
  /** Frontmatter `tools`, verbatim. An agent's tool grant is a security fact. */
  tools: string | null;
  path: string;
  lastModified: string;
  /**
   * False when the file has no `---` block at all. Reported rather than defaulted:
   * a skill with no frontmatter is a skill the loader may never surface, which is
   * itself worth seeing on the page.
   */
  hasFrontmatter: boolean;
}

/**
 * `high` fails the gate. `medium` is listed but does not — the distinction is not
 * cosmetic, it is what keeps the gate meaningful. A file that asserts Rob's job
 * title wrongly is a lie in an instruction; a file that merely mentions STG may be
 * carrying roofing domain data, which `~/.claude/rules/strategy.md` says to KEEP.
 */
export type FindingSeverity = "high" | "medium";

export interface AuditFinding {
  slug: string;
  kind: AssetKind;
  path: string;
  severity: FindingSeverity;
  /** Machine-stable reason code, so a fix can be verified against the same name. */
  code: string;
  /** Plain English — no internal codes. Rob reads this line, not the regex. */
  detail: string;
  /** The matched text, trimmed. A finding with no quotable evidence is an opinion. */
  evidence: string;
  /**
   * The reason from the file's own `stg-audit: reviewed — <reason>` marker, or
   * `null` when nobody has looked. This is the difference between "a human read
   * this line and decided it stays" and "the ladder tolerated it" — see below.
   */
  reviewed: string | null;
}

/**
 * Q83 inc.3 — the marker that separates DELIBERATE from UNEXAMINED.
 *
 * WHY IT EXISTS: inc.2 measured a real limit. All three of the bare `medium`
 * findings scored identically (`stg_reference`, evidence literally "STG") — two
 * were catastrophic rubric lines that had to be rewritten, one was a rule AGAINST
 * STG branding that had to be left exactly as it was. The gate could not tell them
 * apart, so a reviewed file and a never-opened file looked the same on the page.
 *
 * SHAPE: Q80's `md-gate-audit: exempt — <reason>` hatch, deliberately. The reason
 * is REQUIRED and ECHOED — a marker with nothing after the dash does not count, so
 * "reviewed" can never be a silent stamp.
 *
 * WHAT IT DOES NOT DO: it never changes severity and never touches `passes`. A
 * `high` finding is a live wrong instruction; if a marker could turn one green,
 * the marker would be an escape hatch for lies rather than a record of judgement.
 * Reviewing a lie does not make it true — it makes it a lie somebody has seen.
 */
// The reason may never contain the comment terminator: with a plain lazy `.+?`,
// `<!-- stg-audit: reviewed —   -->` captured the literal `-->` as its reason, and
// an empty stamp would have read as a review. Caught by the empty-marker test.
const REVIEWED_RE = /stg-audit:\s*reviewed\s*[—–-]\s*((?:(?!-->)[^\n])*?)\s*(?:-->|\)|$)/im;

/** Blanks the marker in place — same length, so every match index stays truthful. */
function maskReviewedMarker(content: string): string {
  const global = new RegExp(REVIEWED_RE.source, "gim");
  return content.replace(global, (m) => " ".repeat(m.length));
}

/** The marker's reason, or `null` when absent or written with an empty reason. */
export function reviewedReason(content: string): string | null {
  const match = REVIEWED_RE.exec(content);
  if (!match) return null;
  const reason = match[1]?.trim() ?? "";
  return reason.length > 0 ? reason : null;
}

/**
 * The one asset where STG language is expected rather than stale: the global
 * CLAUDE.md declares `stg-brand-guidelines` DEPRECATED ON PURPOSE (Rob left STG,
 * the skill is kept as a record). Its findings are still LISTED — they are just
 * demoted out of the gate, with the reason named, because a permanently-red gate
 * on a knowingly-deprecated file trains everyone to ignore the gate.
 */
export const DEPRECATED_BY_RULE: readonly string[] = ["stg-brand-guidelines"];

/**
 * Assets whose JOB is to name the wrong instructions, so they necessarily quote them.
 *
 * WHY: `instruction-auditor` is the agent that hunts stale-identity claims. Its file
 * lists the very strings it detects — `"VP of Sales"`, `"Rob is VP of Sales at STG"` —
 * inside a table of detection patterns and a record of the five defects found by hand
 * on 2026-07-29. Those quotes are the SPECIFICATION, not a claim about Rob.
 *
 * On its first run the gate scored that file HIGH on the bare string `"VP of Sales"`.
 * `NEGATION_CUES` could not save it: the line is a quoted pattern in a table with no
 * surrounding sentence to negate. So the auditor reddened the gate on itself, forever,
 * for doing its job correctly.
 *
 * That is the same failure `NEGATION_CUES` exists to prevent, stated in its own comment:
 * *a gate that reddens on a correct file gets ignored within a week, and then a real lie
 * sails through it.* A self-tripping auditor is the purest form of it.
 *
 * SCOPE IS DELIBERATELY ONE SLUG. This is an allowlist, not a pattern — anything broader
 * ("files that look like they're quoting") would hand every agent a way to launder a real
 * lie by wrapping it in quotation marks. Findings here are still LISTED and still visible
 * on /ops/agents; they are demoted out of the gate only, exactly like DEPRECATED_BY_RULE.
 * Adding a second entry needs the same standard: the file's PURPOSE must be to name the
 * defect. Never add one merely to turn a push green.
 */
export const PATTERN_DEFINING_BY_RULE: readonly string[] = ["project:instruction-auditor"];

/**
 * Cues that the sentence around a match is CORRECTING the claim, not making it.
 *
 * WHY THIS LIST EXISTS: the first run of this audit flagged `head-of-marketing.md`
 * high on the line "⚠️ Rob LEFT STG. He is not VP of Sales anywhere" — the file was
 * right and the detector was wrong. That failure mode is the one that matters: a
 * gate that reddens on a correct file gets ignored within a week, and then a real
 * lie sails through it. So a match inside a negation reads as a correction and is
 * demoted to medium — still listed, never counted as a lie.
 */
const NEGATION_CUES: readonly RegExp[] = [
  /\bnot\b/i,
  /\bnever\b/i,
  /\bno longer\b/i,
  /\bisn'?t\b/i,
  /\bdon'?t\b/i,
  /\bdoes ?n'?o?t\b/i,
  /\bleft\b/i,
  /\bstale\b/i,
  /\bdeprecated\b/i,
  /\bformer(?:ly)?\b/i,
  /\bex-\b/i,
];

/** The line the match sits on — the unit a human reads when judging the claim. */
function lineAround(content: string, index: number): string {
  const start = content.lastIndexOf("\n", index) + 1;
  const end = content.indexOf("\n", index);
  return content.slice(start, end === -1 ? content.length : end);
}

function isCorrection(content: string, index: number): boolean {
  const line = lineAround(content, index);
  return NEGATION_CUES.some((cue) => cue.test(line));
}

interface Rule {
  code: string;
  severity: FindingSeverity;
  pattern: RegExp;
  detail: string;
}

/**
 * Explicit ladder, no scoring by feel. Each rule states what it catches and why it
 * is that severity — the same shape as every other threshold table in this repo.
 */
const RULES: readonly Rule[] = [
  {
    code: "stale_role_claim_vp_of_sales",
    severity: "high",
    pattern: /\bVP of Sales\b/i,
    detail:
      "Calls Rob a VP of Sales. He is the founder of AI VoiceTech — this instruction would have the agent introduce him with a job he no longer holds.",
  },
  {
    code: "stale_role_claim_works_at_stg",
    severity: "high",
    pattern:
      /\b(?:rob|robert|he)\b[^.\n]{0,60}?\b(?:at|for|with|joined)\s+(?:STG|Sales Transformation Group)\b/i,
    detail:
      "States that Rob works at STG. He left STG — an agent repeating this is giving out a false affiliation.",
  },
  {
    code: "stg_branding_instruction",
    severity: "high",
    pattern:
      /\b(?:apply|use|follow|per)\b[^.\n]{0,40}\b(?:STG|Sales Transformation Group)\b[^.\n]{0,20}\b(?:brand|branding|voice|guidelines)\b/i,
    detail:
      "Tells the agent to brand output as STG. Rob's brand is AI VoiceTech; STG branding must never be reintroduced.",
  },
  {
    code: "stg_reference",
    severity: "medium",
    pattern: /\b(?:STG|Sales Transformation Group)\b/,
    detail:
      "Mentions STG. May be legitimate roofing/contractor domain knowledge (which is kept) — worth a human look, not automatically wrong.",
  },
];

/** Frontmatter parse: only the leading `---` block, only single-line `key: value`. */
function splitFrontmatter(content: string): {
  fields: Record<string, string>;
  hasFrontmatter: boolean;
} {
  const fields: Record<string, string> = {};
  // Must be the very first thing in the file — a `---` mid-document is a horizontal
  // rule, and treating one as frontmatter is how a body sentence becomes a "name".
  if (!content.startsWith("---")) return { fields, hasFrontmatter: false };
  const lines = content.split("\n");
  let closed = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") {
      closed = true;
      break;
    }
    const colon = line.indexOf(":");
    // Continuation lines of a folded YAML value have no `key:` — skip rather than
    // guess. Descriptions in these files are one line in practice; if that ever
    // changes, the purpose reads as null and that is visible, not silently wrong.
    if (colon <= 0 || /^\s/.test(line)) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key) fields[key] = value;
  }
  return { fields, hasFrontmatter: closed };
}

/** First sentence of the description, capped. Truncation is marked, never silent. */
export function firstSentence(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.!?](?:\s|$)/);
  const sentence = end > 0 ? flat.slice(0, end + 1) : flat;
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max - 1).trimEnd()}…`;
}

export function parseAsset(src: AssetSource): AssetRecord {
  const { fields, hasFrontmatter } = splitFrontmatter(src.content);
  const description = fields.description ?? "";
  return {
    kind: src.kind,
    slug: src.slug,
    name: fields.name?.length ? fields.name : src.slug,
    purpose: description.length ? firstSentence(description) : null,
    model: fields.model?.length ? fields.model : null,
    tools: fields.tools?.length ? fields.tools : null,
    path: src.path,
    lastModified: src.lastModified,
    hasFrontmatter,
  };
}

/**
 * Findings for one file. At most one finding per rule — a file that says "STG"
 * eleven times is one problem, and eleven rows would bury the other 39 files.
 */
export function auditAsset(src: AssetSource): AuditFinding[] {
  // Two independent reasons a file's findings are expected rather than defective:
  // it is the deprecated STG record, or it is the auditor that names the patterns.
  // Both demote to medium and stay listed; neither suppresses the row.
  const demoted =
    DEPRECATED_BY_RULE.includes(src.slug) || PATTERN_DEFINING_BY_RULE.includes(src.slug);
  const reviewed = reviewedReason(src.content);
  // The marker is masked out before the rules run, because a reason that names STG
  // would otherwise become its own evidence — the page would quote the audit note
  // back instead of the instruction it is about. Blanked in place, not deleted, so
  // every match index still points at the real line.
  const content = maskReviewedMarker(src.content);
  const findings: AuditFinding[] = [];
  for (const rule of RULES) {
    // Every occurrence is examined, not just the first: a file may correct the claim
    // in its header and still assert it further down, and the assertion is the defect.
    const global = new RegExp(rule.pattern.source, `${rule.pattern.flags}g`);
    let match: RegExpExecArray | null = null;
    let corrected: RegExpExecArray | null = null;
    for (let m = global.exec(content); m; m = global.exec(content)) {
      if (isCorrection(content, m.index)) {
        corrected ??= m;
        continue;
      }
      match = m;
      break;
    }
    const hit = match ?? corrected;
    if (!hit) continue;
    // A medium mention inside a file that already tripped a high rule adds nothing.
    if (rule.severity === "medium" && findings.length > 0) continue;

    const isCorrected = match === null;
    const severity: FindingSeverity =
      demoted || isCorrected ? "medium" : rule.severity;
    let code = rule.code;
    let detail = rule.detail;
    if (isCorrected) {
      code = `corrected:${code}`;
      detail = `${detail} Demoted: the file states this only to correct it, so no agent reads it as true.`;
    }
    if (demoted) {
      code = `deprecated_by_rule:${code}`;
      detail = `${detail} Demoted: this asset is kept deliberately as the deprecated STG brand record.`;
    }
    if (reviewed) {
      // Prefix, never replace: the original code stays readable so a fix can still
      // be verified against the same name. Severity is untouched on purpose.
      code = `reviewed:${code}`;
      detail = `${detail} Reviewed on purpose: ${reviewed}`;
    }
    findings.push({
      slug: src.slug,
      kind: src.kind,
      path: src.path,
      severity,
      code,
      detail,
      evidence: match?.[0].replace(/\s+/g, " ").trim() ?? lineAround(content, hit.index).trim(),
      reviewed,
    });
  }
  return findings;
}

export interface Inventory {
  assets: AssetRecord[];
  findings: AuditFinding[];
  counts: {
    agents: number;
    skills: number;
    high: number;
    medium: number;
    /**
     * Flagged files carrying a `stg-audit: reviewed — <reason>` marker, and flagged
     * files carrying none. This pair is the DoD's "count of files changed reported
     * to Rob" as GENERATED data rather than a number typed onto a page — a typed
     * count is correct for one day and wrong afterwards (CR-3).
     */
    reviewed: number;
    unexamined: number;
  };
  /** True when nothing gate-failing was found. The script's exit code is this. */
  passes: boolean;
}

/** Deterministic order: agents before skills, then by slug. Same input, same file. */
export function buildInventory(sources: readonly AssetSource[]): Inventory {
  const ordered = [...sources].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.slug.localeCompare(b.slug),
  );
  const assets = ordered.map(parseAsset);
  const findings = ordered.flatMap(auditAsset);
  const high = findings.filter((f) => f.severity === "high").length;
  // Counted per FILE, not per finding: two findings on one file are one file a
  // human either judged or did not.
  const flagged = new Set(findings.map((f) => `${f.kind}:${f.slug}`));
  const reviewedFiles = new Set(
    findings.filter((f) => f.reviewed !== null).map((f) => `${f.kind}:${f.slug}`),
  );
  return {
    assets,
    findings,
    counts: {
      agents: assets.filter((a) => a.kind === "agent").length,
      skills: assets.filter((a) => a.kind === "skill").length,
      high,
      medium: findings.length - high,
      reviewed: reviewedFiles.size,
      unexamined: flagged.size - reviewedFiles.size,
    },
    passes: high === 0,
  };
}
