#!/usr/bin/env node
// Q79 increment 1 — generate the agent/skill inventory AND run the instruction gate.
//
// USAGE
//   node --import ./scripts/ts-loader.mjs scripts/gen-agent-inventory.mjs [--check]
//     (default)  rewrites data/agent-skill-inventory.json from the files themselves
//     --check    verifies the committed file matches the filesystem, writes nothing
//
// EXIT CODES — this is the "fails a gate" half of Q79's DoD:
//   0  no high-severity instruction findings
//   1  at least one high finding (a stale role/branding claim in a live asset)
//   2  --check and the committed inventory is stale
//
// WHY A SCRIPT AND NOT A HAND-KEPT LIST (CR-3): a list of 40 agents maintained by
// hand is wrong within a week, and a stale inventory is worse than none — it reads
// as coverage. The classification lives in `lib/agents/inventory.ts` under 20 tests;
// this file only walks the filesystem and stamps time, so nothing judged by the
// tests is duplicated here.
//
// NOTE ON SCOPE: the assets live in `~/.claude/`, OUTSIDE this repo, so the JSON is
// a dated snapshot of another tree — not a source of truth for it. That is exactly
// why `--check` exists and why every row carries its own `lastModified`.

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { buildInventory } from "../lib/agents/inventory.ts";

const CLAUDE_HOME = process.env.CLAUDE_HOME ?? path.join(homedir(), ".claude");
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_PATH = path.join(REPO_ROOT, "data", "agent-skill-inventory.json");
const CHECK = process.argv.includes("--check");

/**
 * Agent roots, in scan order. TWO of them, and the second is the point:
 *
 *   ~/.claude/agents/            global — the flat 40-file pile Rob cannot see into
 *   <repo>/.claude/agents/       PROJECT-SCOPED — the single-job MLE agents
 *
 * The project root was added 2026-07-30, the same night six project-scoped agents were
 * written into it. Until then this script read only the global directory, so those six
 * would have been INVISIBLE on `/ops/agents` — the page whose entire purpose is answering
 * Rob's "it's really hard to see if any of them are giving the wrong instructions when I
 * don't even know they exist." An inventory that silently omits a whole tree of agents is
 * the exact failure it was built to prevent, and it reads as coverage while doing it.
 *
 * A missing root yields [] — reported through the counts, never faked as zero problems.
 * Slugs are prefixed by scope so a global and a project agent sharing a name stay distinct.
 */
const AGENT_ROOTS = [
  { dir: path.join(CLAUDE_HOME, "agents"), scope: "global" },
  { dir: path.join(REPO_ROOT, ".claude", "agents"), scope: "project" },
];

async function readAgents() {
  const out = [];
  for (const { dir, scope } of AGENT_ROOTS) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // A missing dir is reported by the counts, never faked as zero problems.
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const full = path.join(dir, entry.name);
      const slug = entry.name.replace(/\.md$/, "");
      out.push({
        kind: "agent",
        scope,
        slug: scope === "project" ? `project:${slug}` : slug,
        path: full,
        content: await readFile(full, "utf8"),
        lastModified: (await stat(full)).mtime.toISOString(),
      });
    }
  }
  return out;
}

/**
 * Skills: one directory each. The instructions live in `SKILL.md`; a skill dir with
 * no SKILL.md is still LISTED (with empty content, so it reports as
 * frontmatter-less) because an unreadable skill is itself a thing worth seeing.
 */
async function readSkills() {
  const dir = path.join(CLAUDE_HOME, "skills");
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name, "SKILL.md");
    let content = "";
    let lastModified = "";
    try {
      content = await readFile(full, "utf8");
      lastModified = (await stat(full)).mtime.toISOString();
    } catch {
      lastModified = (await stat(path.join(dir, entry.name))).mtime.toISOString();
    }
    out.push({ kind: "skill", slug: entry.name, path: full, content, lastModified });
  }
  return out;
}

const sources = [...(await readAgents()), ...(await readSkills())];
const inventory = buildInventory(sources);

// `generatedAt` is stamped HERE, not in the pure module, and is the only field that
// changes between two identical runs — so `--check` compares everything else.
const payload = { generatedAt: new Date().toISOString(), source: CLAUDE_HOME, ...inventory };
const serialized = `${JSON.stringify(payload, null, 2)}\n`;

if (CHECK) {
  let committed = null;
  try {
    committed = JSON.parse(await readFile(OUT_PATH, "utf8"));
  } catch {
    console.error("STALE: data/agent-skill-inventory.json is missing or unreadable.");
    process.exit(2);
  }
  const strip = ({ generatedAt: _g, ...rest }) => JSON.stringify(rest);
  if (strip(committed) !== strip(payload)) {
    console.error(
      "STALE: the committed inventory no longer matches ~/.claude. Re-run without --check.",
    );
    process.exit(2);
  }
  console.log("Inventory is current.");
} else {
  await writeFile(OUT_PATH, serialized, "utf8");
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

const { agents, skills, high, medium } = inventory.counts;
console.log(`${agents} agents, ${skills} skills · ${high} high, ${medium} medium findings`);
for (const f of inventory.findings) {
  console.log(`  [${f.severity}] ${f.kind}/${f.slug} — ${f.code} — "${f.evidence}"`);
}
if (!inventory.passes) {
  console.error(
    `\nGATE FAILED: ${high} live asset(s) carry a wrong instruction about Rob. Fix them (Q83) or the gate stays red.`,
  );
  process.exit(1);
}
