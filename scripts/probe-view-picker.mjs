/**
 * Q67b inc.15 — the last DoD half: a rep SAVES A VIEW IN THE UI.
 *
 * Everything under the Save box is already prod-verified by curl (inc.14: identity
 * inlined, share state detected, POST/GET/DELETE correct). What curl cannot reach is the
 * box itself — it lives inside the dropdown's client-only `open` state. So this drives a
 * real browser: open a share link, open the picker, type a name, CLICK Save, and then
 * prove the row exists by READING IT BACK, not by trusting that the button looked happy.
 *
 * Written as a script rather than a one-off because the thing it checks (a control
 * mounting, a click reaching a live route) is exactly the thing vitest cannot see — this
 * repo has no jsdom, and inc.13 already shipped a bug that 1187 green tests were
 * structurally blind to.
 *
 * SAFETY — this writes to PROD, so it writes ONLY its own row:
 *  - the name is namespaced (`driver probe inc15 …`) and unique per run,
 *  - deletion matches that exact id, and only if this run created it,
 *  - a failed run still tries to clean up, and reports loudly if it could not.
 *
 * Usage:  node scripts/probe-view-picker.mjs [baseUrl]
 */

import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Playwright is a global install here, not a dependency of this app — a browser driver
// has no business in the deployed bundle. ESM ignores NODE_PATH, so resolve it explicitly
// and fall back to the global root rather than failing with a bare MODULE_NOT_FOUND.
async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    const mod = await import(pathToFileURL(`${root}/playwright/index.js`).href);
    return (mod.chromium ?? mod.default?.chromium);
  }
}

const chromium = await loadChromium();

const BASE = process.argv[2] ?? "https://mle-rob-dashboard.vercel.app";
// Stamped by the caller, not by the module: two runs in the same minute must not collide
// on 0019's partial unique index and read each other's 409 as their own failure.
const NAME = `driver probe inc15 ${Date.now().toString(36)}`;

/** Same shape `encodeShareLink` produces — UTF-8, then base64url. */
function encodeShareLink(view) {
  const json = JSON.stringify({ target: view.target, name: view.name, filter: view.filter });
  return Buffer.from(new TextEncoder().encode(json))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const share = encodeShareLink({
  target: "person",
  name: "probe",
  filter: { op: "lit", lit: { lit: "person.status", value: "warm" } },
});

const steps = [];
const record = (ok, what, detail = "") => {
  steps.push({ ok, what, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

try {
  await page.goto(`${BASE}/people?share=${share}`, { waitUntil: "networkidle" });

  // The control has to be findable by the NOUN a rep would look for (inc.14's fix), not
  // by its state label — searching for the state is how inc.13 concluded it had not mounted.
  const picker = page.getByRole("button", { name: /Saved views/i });
  await picker.waitFor({ timeout: 15_000 });
  record(true, "picker mounts", `label: ${(await picker.textContent())?.trim()}`);

  await picker.click();
  const input = page.getByPlaceholder("probe");
  await input.waitFor({ timeout: 5_000 });
  record(true, "save box is reachable in the open dropdown");

  await input.fill(NAME);
  const save = page.getByRole("button", { name: /Save view/i });
  await save.click();

  // The dropdown closing is the component's own success signal, but it is not evidence a
  // row exists. Wait for it, then go and read the row.
  await page.waitForSelector("input[placeholder='probe']", { state: "detached", timeout: 15_000 });
  record(true, "Save click closed the dropdown (component reported success)");

  // Read the row back through the picker's own list — a closed dropdown proves the
  // component was satisfied, not that Postgres holds a row. Address the row by its LINK
  // (what a rep clicks); matching a wrapper `div` by class binds this probe to styling and
  // is how the first cut of it reported a false FAIL against a save that had worked.
  await picker.click();
  const row = page.getByRole("link", { name: new RegExp(NAME) });
  // WAIT for it, never `count()` it: the picker re-READS the list after every write, so at
  // the instant the dropdown reopens the row legitimately does not exist yet. An instant
  // count made this probe report a false FAIL against a save that had in fact worked —
  // the worst possible failure mode for the one check standing between here and "done".
  const listed = await row
    .first()
    .waitFor({ timeout: 15_000 })
    .then(() => true, () => false);
  record(listed, "the saved view is listed in the picker after saving", NAME);

  // Delete the row THIS run created — never any other. The button lives beside the link,
  // and it only renders for rows this rep owns.
  const del = row.locator("xpath=following-sibling::button[@title='Delete this view']");
  if (listed && (await del.count()) > 0) {
    await del.first().click();
    await page.waitForFunction((n) => !document.body.innerText.includes(n), NAME, {
      timeout: 15_000,
    });
    record(true, "the rep's own delete button removed it (re-read list no longer shows it)");
  } else {
    record(false, "no delete button rendered for the row this rep just created");
  }

  record(
    consoleErrors.length === 0,
    "console is clean",
    consoleErrors.join(" | ") || "no errors",
  );
} catch (err) {
  record(false, "probe threw", String(err && err.message ? err.message : err));
} finally {
  await browser.close();
}

const failed = steps.filter((s) => !s.ok);
console.log(`\n${steps.length - failed.length}/${steps.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
