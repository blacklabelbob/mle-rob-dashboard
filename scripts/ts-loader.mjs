// Q71 Phase 4: let a CLI script import the repo's REAL TypeScript modules.
//
// Node 24 strips types from `.ts` on its own, so no transform is needed here. The one thing
// it will not do is guess an extension: `lib/` is written for the bundler's resolver, so
// `import "./transcriptSegments"` — no `.ts` — is unresolvable to plain Node and every
// import in that tree looks like that.
//
// WHY THIS EXISTS AT ALL. `scripts/seed-local-crm.mjs` faced the same wall and answered it
// by COPYING the mappers out of `lib/crm.ts`, then pinning the copy with a test that asserts
// the two agree. That works, but it is a second copy of load-bearing logic, and the reason
// it needed pinning is that copies rot. A resolver hook removes the copy instead of
// policing it: `scripts/transcripts-to-supabase.mjs` imports `lib/calls/firefliesMapping.ts`
// itself, so the mapping the script applies is the mapping 19 tests grade, by construction.
//
// Deliberately narrow. It only appends `.ts` (then `/index.ts`) AFTER Node's own resolution
// has failed, so it can never shadow a real `.js`/`.mjs` file or a package — a resolver that
// guesses first is a resolver that eventually loads the wrong module. Anything it cannot
// resolve is re-thrown untouched, so a genuine typo still reports as a missing module.

import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CANDIDATES = [".ts", "/index.ts"];

// Q84 inc.15: `@/…` is the repo's own path alias (tsconfig `paths`, `@/*` → repo root) and
// most of `lib/` imports its siblings that way. Without it here, a script that reaches into
// `lib/` can only use modules whose whole import graph happens to be relative — which is how
// `seed-local-crm.mjs` ended up COPYING logic, the exact failure the header above describes.
// Resolved to a real file URL under the repo root and then handed to Node, so the extension
// guessing below still applies and a genuinely missing `@/…` file still reports as missing.
const REPO_ROOT = new URL("../", import.meta.url);

/** Registered as a resolve hook; `next` is Node's own resolution. */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return resolve(new URL(specifier.slice(2), REPO_ROOT).href, context, next);
  }
  try {
    return await next(specifier, context);
  } catch (err) {
    // Only extension-guessing is in scope. A bare package name that is genuinely absent
    // must keep reporting as absent rather than being probed for on disk.
    // Relative specifiers, plus the absolute `file:` URLs the `@/` branch above rewrites to —
    // both are paths into this repo. A bare package name that is genuinely absent must still
    // report as absent rather than being probed for on disk.
    if (err?.code !== "ERR_MODULE_NOT_FOUND" || !(specifier.startsWith(".") || specifier.startsWith("file:"))) {
      throw err;
    }
    for (const suffix of CANDIDATES) {
      try {
        return await next(specifier + suffix, context);
      } catch {
        // try the next shape
      }
    }
    throw err;
  }
}

// Self-registration, so callers write `node --import ./scripts/ts-loader.mjs …` rather than
// having to know the register/hooks incantation.
register(import.meta.url, pathToFileURL("./"));
