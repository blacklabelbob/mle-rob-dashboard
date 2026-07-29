#!/usr/bin/env node
/**
 * verify:offline — drives the README's demo path and OBSERVES that it makes
 * zero network calls, rather than inferring it from "every seam is env-gated".
 *
 * The DoD of Q71 says: `git clone && npm i && npm run dev:demo` gives a
 * populated dashboard with zero real names, ZERO NETWORK CALLS, and zero
 * secrets. The names and secrets halves are enforced by guard:pii and the
 * README test. This is the network half.
 *
 * Method (a clone is simulated, not described):
 *   1. `git archive HEAD` into a scratch tree — tracked files ONLY, so no
 *      .env.local, no gitignored overlay, nothing a clone would not receive.
 *   2. node_modules is cloned in rather than installed: `npm i` fetches from
 *      the network by definition, and it is the DEV SERVER we are measuring,
 *      not the installer.
 *   3. `next dev` runs there with a preloaded net-sentinel that appends every
 *      non-loopback socket/DNS attempt to a log, under an env that carries no
 *      credential of any kind.
 *   4. The three pages are fetched. Then the log must be empty.
 *
 * Exit 0 = the demo path is genuinely offline. Any finding is printed with the
 * stack frames that caused it, because "something phoned home" is useless
 * without "this line did".
 */
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.OFFLINE_PORT ?? 3199);
const PAGES = ['/', '/people', '/deals'];
const PROBE_ROUTE = '/offline-probe-net-sentinel';

const BOOT_TIMEOUT_MS = 120_000;

const scratch = mkdtempSync(join(tmpdir(), 'mle-offline-'));
const logPath = join(scratch, '.net-sentinel.log');
let server;

function cleanup() {
  if (server && !server.killed) {
    try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
  rmSync(scratch, { recursive: true, force: true });
}

function fail(message, detail) {
  console.error(`\n❌ ${message}`);
  if (detail) console.error(detail);
  cleanup();
  process.exit(1);
}

async function main() {
  console.log(`▸ scratch tree: ${scratch}`);
  execSync(`git archive HEAD | tar -x -C "${scratch}"`, { cwd: REPO, stdio: 'inherit', shell: '/bin/bash' });

  // A clone gets no env file but the committed example. If the archive ever
  // carries a real one, the whole measurement is void — check, do not assume.
  for (const leaked of ['.env', '.env.local', '.env.development', '.env.development.local', '.env.production']) {
    if (existsSync(join(scratch, leaked))) fail(`the tracked tree contains ${leaked} — a clone would receive credentials`);
  }

  // Turbopack refuses a node_modules symlink that points outside the project
  // root, so the tree is copy-on-write cloned instead (APFS `cp -c`, ~6s, no
  // real disk cost). `-R` is the fallback where clonefile is unavailable.
  try {
    execSync(`cp -Rc "${join(REPO, 'node_modules')}" "${join(scratch, 'node_modules')}"`, { stdio: 'pipe' });
  } catch {
    execSync(`cp -R "${join(REPO, 'node_modules')}" "${join(scratch, 'node_modules')}"`, { stdio: 'inherit' });
  }

  // The instrument is copied in from the working tree rather than read out of
  // the archive: it measures the clone, it is not part of what the clone does.
  const sentinel = join(scratch, '.net-sentinel.cjs');
  copyFileSync(join(REPO, 'scripts', 'net-sentinel.cjs'), sentinel);
  writeFileSync(logPath, '');

  // OFFLINE_INJECT=1 plants a page that deliberately phones home, so the
  // harness can be proven able to FAIL. A green run means nothing unless the
  // instrument has been shown to fire inside this exact setup — including
  // through the worker process Next forks to render (where NODE_OPTIONS must
  // still be in effect). Expect: exit 1 naming example.com.
  //
  // The route segment must NOT start with an underscore: the App Router treats
  // `_foo` as a PRIVATE folder and excludes it from routing entirely, so the
  // first draft's `__offline_probe__` 404'd and the negative control silently
  // proved nothing. Named plainly, and asserted 200 like any other page.
  if (process.env.OFFLINE_INJECT) {
    const probeDir = join(scratch, 'app', PROBE_ROUTE.slice(1));
    mkdirSync(probeDir, { recursive: true });
    writeFileSync(join(probeDir, 'page.tsx'), [
      "export const dynamic = 'force-dynamic';",
      'export default async function Probe() {',
      "  await fetch('https://example.com').catch(() => {});",
      '  return <p>probe</p>;',
      '}',
      '',
    ].join('\n'));
    PAGES.push(PROBE_ROUTE);
    console.log('▸ OFFLINE_INJECT: planted a page that calls example.com — this run MUST fail');
  }

  // Deliberately minimal: no SUPABASE_*, no ANTHROPIC_*, no VAPI_*, nothing.
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: process.env.LANG ?? 'en_US.UTF-8',
    PORT: String(PORT),
    STORAGE_SOURCE: 'file',
    NET_SENTINEL_LOG: logPath,
    NODE_OPTIONS: `--require ${sentinel}`,
  };

  server = spawn('npx', ['next', 'dev', '--port', String(PORT)], {
    cwd: scratch,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout.on('data', (d) => { serverOutput += d; });
  server.stderr.on('data', (d) => { serverOutput += d; });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  let up = false;
  while (Date.now() < deadline && !up) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.status < 500) up = true;
    } catch { /* still booting */ }
  }
  if (!up) fail(`dev server never answered on :${PORT} within ${BOOT_TIMEOUT_MS / 1000}s`, serverOutput);

  for (const page of PAGES) {
    const res = await fetch(`http://127.0.0.1:${PORT}${page}`);
    const body = await res.text();
    if (res.status !== 200) fail(`${page} returned ${res.status}`, serverOutput);
    console.log(`  ${page} → 200 (${body.length} bytes)`);
  }

  // Give any fire-and-forget call (telemetry, background refresh) a moment to
  // reach the socket layer before we read the verdict.
  await new Promise((r) => setTimeout(r, 3000));

  const findings = readFileSync(logPath, 'utf8').trim();
  if (findings) {
    fail(`the demo path made ${findings.split('\n').length} network call(s) — the DoD says zero`, findings);
  }

  console.log(`\n✅ zero network calls across ${PAGES.length} pages on the demo path (tracked files only, no credentials in env)`);
  cleanup();
}

process.on('SIGINT', () => { cleanup(); process.exit(130); });
main().catch((err) => fail(err.message, err.stack));
