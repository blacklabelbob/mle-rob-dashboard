#!/usr/bin/env node
// Q84 inc.145 — compose the driver's prompt so the gate that says "first" actually is.
//
// USAGE (from ~/.claude/scripts/crm-build-driver.sh)
//   PROMPT="$(DRIVER_ORPHANED="$ORPHANED" DRIVER_UNFOLDED="$UNFOLDED" \
//             DRIVER_WATCHDOG="$WATCHDOG_PREFIX" DRIVER_CLOCK_GATE="$CLOCK_GATE" \
//             node --import ./scripts/ts-loader.mjs scripts/driver-prompt.mjs <base-prompt-file>)"
//
// WHY ENV AND NOT ARGV. These four strings are multi-sentence, contain quotes, backticks and a
// `git status --porcelain` dump. Threading them through argv in shell is where the quoting bug
// lives; env vars carry bytes without re-parsing.
//
// EXIT CODES
//   0  composed prompt on stdout, nothing else
//   1  the base prompt file could not be read — the caller must fall back to concatenation rather
//      than run with no standing prompt at all
//
// The ladder and the precedence sentence live in `lib/integrity/driverPrefixes.ts` under test;
// this file reads bytes and prints, so nothing the tests pin is re-decided here (CR-3).

import { readFile } from "node:fs/promises";
import { composeDriverPrompt } from "../lib/integrity/driverPrefixes.ts";

const basePath = process.argv[2];
if (!basePath) {
  console.error("usage: driver-prompt.mjs <base-prompt-file>");
  process.exit(1);
}

let base;
try {
  base = await readFile(basePath, "utf8");
} catch (err) {
  console.error(`driver-prompt: cannot read ${basePath} — ${err.message}`);
  process.exit(1);
}

process.stdout.write(
  composeDriverPrompt(
    {
      orphaned: process.env.DRIVER_ORPHANED,
      unfolded: process.env.DRIVER_UNFOLDED,
      watchdog: process.env.DRIVER_WATCHDOG,
      clockGate: process.env.DRIVER_CLOCK_GATE,
    },
    base,
  ),
);
