// Q74 — the core-vs-instance seam, enforced instead of described.
//
// "Core" = a module any entity could run: a spin-off, a vertical instance, a
// client's own platform. "Instance" = everything that only makes sense because
// this deployment is MLE's — MLE's vocabulary, MLE's branding, MLE's records.
// The seam is only real if a build can fail on it, so this file is the
// declaration and `seamViolations` is the check; prose about which modules are
// "reusable" rots the first time someone adds an import (CR-3).
//
// Deliberately narrow: one proven extraction candidate beats a whole-tree
// taxonomy nobody can enforce. Adding a core root is the commitment — you are
// promising that directory can be lifted out whole.

export type SeamDeclaration = {
  /** Repo-relative directory prefixes that must stay extractable. */
  coreRoots: string[];
  /** Package-import prefixes core may depend on (a spin-off can install these). */
  allowedExternals: string[];
  /** Literals that mean "this deployment is MLE's", not "this is a CRM". */
  instanceMarkers: RegExp[];
};

export const SEAM: SeamDeclaration = {
  // lib/dedup is the first candidate: duplicate detection over {name, email,
  // phone, domain} records is the same problem for any CRM-shaped instance,
  // and it already reaches nothing MLE-specific — this test pins that.
  coreRoots: ["lib/dedup"],
  allowedExternals: ["node:", "@supabase/supabase-js"],
  instanceMarkers: [
    /\bMyLocalEverything\b/i,
    /\bmylocaleverything\.com\b/i,
    /\bmle-admin\b/i,
    /\bMLE\b/,
  ],
};

/**
 * Roots being *evaluated* for core status — not promised, measured.
 *
 * Promoting a root is a promise that the directory lifts out whole, so the
 * second root cannot be declared the way the first was: `lib/filters` and the
 * CSV trio reach the instance today, and flipping them into `coreRoots` would
 * only paint the suite red without saying what the debt actually is. A
 * candidate is surveyed instead — every outside module it touches is counted
 * and pinned, so the debt is an inventory that cannot silently grow, and
 * promotion happens when the list reaches empty.
 */
export type SeamCandidate = {
  name: string;
  /** Every root that would leave together — an extraction unit, not a directory. */
  roots: string[];
};

/**
 * A directory that does not lift out whole — it is split.
 *
 * inc.2 measured `lib/filters` as one block and the shape was the finding: the
 * filter *language* (parse a string into a tree, name a view, share it) is
 * already instance-clean, and every leak sat in the files that map MLE's rows
 * or run React hooks. So the unit of extraction here is not the directory, it
 * is the language half — and saying so is only worth anything if the split is
 * exhaustive. Every module under `dir` must be claimed by exactly one side; an
 * unclassified file is how a directory quietly stops matching its own map.
 */
export type SeamPartition = {
  dir: string;
  /** Modules that would leave together as the core candidate. */
  core: string[];
  /** Modules that stay: they speak MLE's row shapes, React, or the network. */
  instance: string[];
};

export const SEAM_PARTITIONS: SeamPartition[] = [
  {
    dir: "lib/filters",
    core: [
      "lib/filters/ast",
      "lib/filters/parse",
      "lib/filters/savedViews",
      "lib/filters/viewIdentity",
      "lib/filters/viewPicker",
      "lib/filters/viewsClient",
      "lib/filters/browserView",
      "lib/filters/page",
      "lib/filters/demo",
    ],
    instance: [
      // Row mapping: these know what a *person* is in this deployment.
      "lib/filters/rows",
      "lib/filters/tableRows",
      // The client page loop: fetch + accumulator + its reducer.
      "lib/filters/pageClient",
      "lib/filters/pageState",
      // React/Next hooks — a spin-off may not even be a React app.
      "lib/filters/useTableRows",
      "lib/filters/useViewPage",
      "lib/filters/useViewPicker",
    ],
  },
];

/** Modules under a partitioned directory that neither side claims. */
export function partitionGaps(partition: SeamPartition, paths: string[]): string[] {
  const claimed = new Set([...partition.core, ...partition.instance]);
  return paths.filter((p) => !claimed.has(p)).sort();
}

export const SEAM_CANDIDATES: SeamCandidate[] = [
  // Not `lib/filters` — the language half of it, which is the part that can
  // actually leave. See SEAM_PARTITIONS.
  { name: "filters-lang", roots: SEAM_PARTITIONS[0].core },
  // The CSV trio is one unit: csvMapping drives csvImport drives csv. Surveyed
  // apart, each would count its own siblings as debt and overstate the seam.
  { name: "csv-import", roots: ["lib/csv", "lib/csvImport", "lib/csvMapping"] },
];

export type CandidateSurvey = {
  name: string;
  fileCount: number;
  /** Repo-relative modules outside the candidate that it imports. */
  reaches: string[];
  /** Packages it imports that core's allowlist does not cover. */
  externals: string[];
  /** Files with an instance name baked into code. */
  instanceLiterals: string[];
};

/**
 * What would this candidate cost to extract? Pure; the caller supplies the
 * files. Imports *within* the candidate are free — it would be its own root —
 * so what is left is exactly the seam it has not paid for yet.
 */
export function surveyCandidate(
  candidate: SeamCandidate,
  files: SeamFile[],
  decl: SeamDeclaration = SEAM,
): CandidateSurvey {
  const inside = [...candidate.roots, ...decl.coreRoots];
  const reaches = new Set<string>();
  const externals = new Set<string>();
  const instanceLiterals = new Set<string>();
  for (const f of files) {
    for (const spec of importSpecifiers(f.source)) {
      const resolved = resolveSpecifier(spec, f.path);
      if (resolved === null) {
        if (!decl.allowedExternals.some((p) => spec === p || spec.startsWith(p))) externals.add(spec);
      } else if (!underRoot(resolved, inside)) reaches.add(resolved);
    }
    const code = stripComments(f.source);
    if (decl.instanceMarkers.some((m) => m.test(code))) instanceLiterals.add(f.path);
  }
  const sorted = (s: Set<string>) => [...s].sort();
  return {
    name: candidate.name,
    fileCount: files.length,
    reaches: sorted(reaches),
    externals: sorted(externals),
    instanceLiterals: sorted(instanceLiterals),
  };
}

export type SeamViolation = {
  file: string;
  kind: "instance-import" | "unlisted-external" | "instance-literal";
  detail: string;
};

export type SeamFile = { path: string; source: string };

/**
 * Strip comments so a marker mentioned in a note ("MLE's own ledger lives
 * elsewhere") is not confused with a marker baked into behaviour. Crude on
 * purpose: string literals containing `//` are rare in these modules, and the
 * failure direction is a false positive someone must look at, never a silent
 * pass.
 */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Every static/dynamic import + re-export specifier in a source file. */
export function importSpecifiers(src: string): string[] {
  const code = stripComments(src);
  const out: string[] = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) out.push(m[1]);
  }
  return [...new Set(out)];
}

/** Resolve an import specifier to a repo-relative module path, or null if it is a package. */
export function resolveSpecifier(spec: string, fromFile: string): string | null {
  let rel: string;
  if (spec.startsWith("@/")) {
    rel = spec.slice(2);
  } else if (spec.startsWith(".")) {
    const dir = fromFile.split("/").slice(0, -1);
    const parts = spec.split("/");
    for (const p of parts) {
      if (p === "." || p === "") continue;
      if (p === "..") dir.pop();
      else dir.push(p);
    }
    rel = dir.join("/");
  } else {
    return null;
  }
  return rel.replace(/\.(ts|tsx|js|mjs)$/, "");
}

const underRoot = (path: string, roots: string[]) =>
  roots.some((r) => path === r || path.startsWith(`${r}/`));

/**
 * Pure check. Callers supply the files under the core roots; this decides
 * whether any of them has reached back into the instance.
 */
export function seamViolations(files: SeamFile[], decl: SeamDeclaration = SEAM): SeamViolation[] {
  const violations: SeamViolation[] = [];
  for (const f of files) {
    for (const spec of importSpecifiers(f.source)) {
      const resolved = resolveSpecifier(spec, f.path);
      if (resolved === null) {
        if (!decl.allowedExternals.some((p) => spec === p || spec.startsWith(p)))
          violations.push({
            file: f.path,
            kind: "unlisted-external",
            detail: `imports package "${spec}" — a spin-off would have to carry it; list it in allowedExternals or drop it`,
          });
        continue;
      }
      if (!underRoot(resolved, decl.coreRoots))
        violations.push({
          file: f.path,
          kind: "instance-import",
          detail: `imports "${spec}" (${resolved}), which lives outside the core roots — extracting this module would drag the instance with it`,
        });
    }
    const code = stripComments(f.source);
    for (const marker of decl.instanceMarkers) {
      const hit = code.match(marker);
      if (hit)
        violations.push({
          file: f.path,
          kind: "instance-literal",
          detail: `contains instance literal "${hit[0]}" in code — core modules must not name this deployment`,
        });
    }
  }
  return violations;
}
