/**
 * Parity guard: docs/plans/PHASE2-ROI-ESTIMATOR.html vs lib/roi/*
 *
 * WHY THIS FILE EXISTS. The Estimator (Q63 leg 4) shipped as a standalone, no-build HTML
 * page so Rob can open it and publish it as an artifact. To do that it necessarily carries
 * its OWN copy of the BLS rate table and its own inline arithmetic — a second
 * implementation of a money-facing formula. CR-3 says the arithmetic lives in tested code;
 * this test is what keeps the page honest to that code. If either side is edited alone,
 * these assertions fail with the exact figure that drifted.
 *
 * It reads the HTML as text (no DOM, no jsdom) and re-runs the page's own defaults through
 * lib/roi/phase2.ts, pinning the two numbers the spec prints (§4a): +11.6% labor-only and
 * +149.6% with the conservative revenue estimates loaded, both at day 30 of 91 on $9,100.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DAYS_PER_MONTH, estimatePhase2Roi } from "../roi/phase2";
import { LABOR_ROLES, rateFor, type RateRegion } from "../roi/laborRates";
import {
  DEFAULT_PHASE2_ESTIMATE,
  SEED_AUTOMATIONS,
  buildAutomations,
  enabledAutomations,
  seededHoursPerWeek,
} from "../roi/automations";

const HTML_PATH = path.join(__dirname, "..", "..", "docs", "plans", "PHASE2-ROI-ESTIMATOR.html");
const html = readFileSync(HTML_PATH, "utf8");

/** Pull a JS object/array literal out of the page's inline script by its const name. */
function literal<T>(name: string, open: "{" | "["): T {
  const start = html.indexOf(`const ${name} = ${open}`);
  if (start === -1) throw new Error(`Estimator HTML no longer declares \`const ${name}\``);
  const from = html.indexOf(open, start);
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = from; i < html.length; i++) {
    if (html[i] === open) depth++;
    else if (html[i] === close && --depth === 0) {
      return new Function(`return (${html.slice(from, i + 1)})`)() as T;
    }
  }
  throw new Error(`Unbalanced ${open}${close} in \`${name}\``);
}

/** Read a default off one of the page's inputs, e.g. `id="inv" value="9100"`. */
function inputDefault(id: string): number {
  const m = html.match(new RegExp(`id="${id}"[^>]*\\bvalue="([\\d.]+)"`));
  if (!m) throw new Error(`Estimator HTML has no numeric input #${id}`);
  return Number(m[1]);
}

type HtmlRole = { t: string; r: Record<"naples" | "fl" | "us", number | null> };
type HtmlAutomation = { id: string; name: string; what: string; soc: string; hrs: number; lift: number; suggest: number; why: string };

const ROLES = literal<Record<string, HtmlRole>>("ROLES", "{");
const AUTOMATIONS = literal<HtmlAutomation[]>("AUTOMATIONS", "[");
const REGION: Exclude<RateRegion, "custom"> = "naples"; // the page's selected option

/** The page's own defaults, re-run through the module instead of its inline copy. */
function runModule(useSuggestedRevenue: boolean) {
  return estimatePhase2Roi({
    estInvestment: inputDefault("inv"),
    daysElapsed: inputDefault("days"),
    guaranteeDays: inputDefault("window"),
    automations: AUTOMATIONS.map((a) => {
      const rf = rateFor(a.soc, REGION);
      if (!rf) throw new Error(`No module rate for SOC ${a.soc} (${a.name})`);
      return {
        id: a.id,
        name: a.name,
        what: a.what,
        role: ROLES[a.soc].t,
        soc: a.soc,
        hourlyRate: rf.rate,
        rateRegionLabel: rf.usedRegion,
        rateSource: `https://www.bls.gov/oes/current/oes${a.soc}.htm`,
        humanHoursPerWeek: a.hrs,
        revenueLiftPerMonth: useSuggestedRevenue ? a.suggest : a.lift,
      };
    }),
  });
}

describe("Estimator HTML ↔ lib/roi parity", () => {
  it("carries the same BLS rate table as laborRates.ts, including the published nulls", () => {
    for (const [soc, role] of Object.entries(ROLES)) {
      const mod = LABOR_ROLES.find((r) => r.soc === soc);
      expect(mod, `SOC ${soc} is on the page but not in LABOR_ROLES`).toBeDefined();
      // null must survive as null: BLS publishes no Naples figure for Telemarketers, and
      // back-filling it from the state number is the exact dishonesty the table forbids.
      expect({ soc, ...role.r }).toEqual({ soc, ...mod!.medianHourly });
    }
    expect(Object.keys(ROLES).length).toBe(LABOR_ROLES.length);
  });

  it("uses the module's month constant, not a rounded 30", () => {
    const m = html.match(/const DAYS_PER_MONTH = ([\d.]+)/);
    expect(Number(m?.[1])).toBe(DAYS_PER_MONTH);
  });

  it("ships every revenue lift at $0 — nothing is claimed until a human opts in", () => {
    expect(AUTOMATIONS.map((a) => a.lift)).toEqual(AUTOMATIONS.map(() => 0));
    expect(AUTOMATIONS.some((a) => a.suggest > 0)).toBe(true);
  });

  it("is seeded for ONE small business (~0.8 FTE), not a department", () => {
    const weekly = AUTOMATIONS.reduce((s, a) => s + a.hrs, 0);
    expect(weekly).toBeCloseTo(31.5, 2);
    expect(weekly / 40).toBeLessThan(1); // under one full-time equivalent
  });

  it("reproduces the spec's day-30 labor-only read of +11.6%", () => {
    const { summary } = runModule(false);
    expect(summary.roiPct).not.toBeNull();
    expect((summary.roiPct! * 100).toFixed(1)).toBe("11.6");
    expect(summary.status).toBe("surplus");
    expect(summary.roiDollars).toBeGreaterThan(0);
  });

  it("reproduces the spec's +149.6% once conservative revenue is loaded", () => {
    const { summary } = runModule(true);
    expect((summary.roiPct! * 100).toFixed(1)).toBe("149.6");
  });

  it("pro-rates the target the way Rob wrote it: investment ÷ window × days", () => {
    const { summary } = runModule(false);
    const inv = inputDefault("inv");
    const win = inputDefault("window");
    const days = inputDefault("days");
    expect(summary.targetToDate).toBeCloseTo((inv / win) * days, 6);
    expect(summary.guaranteeDays).toBe(win);
  });
});

// ---------------------------------------------------------------------------
// Q63 (2026-07-25) — the mounted component made a THIRD copy of the catalogue a
// real risk. The nine automations now live in lib/roi/automations.ts and the
// in-app estimator reads them from there; the standalone artifact still carries
// its own literal, because being self-contained is the property that lets Rob
// open and publish it. So the artifact is now the copy under guard, and drift in
// either direction fails here naming the row that moved.
// ---------------------------------------------------------------------------
describe("Estimator HTML ↔ SEED_AUTOMATIONS parity (Q63 mount)", () => {
  it("holds the same nine automations, in the same order, with the same ids", () => {
    expect(SEED_AUTOMATIONS.map((a) => a.id)).toEqual(AUTOMATIONS.map((a) => a.id));
  });

  it("matches every seeded row field-for-field", () => {
    for (const page of AUTOMATIONS) {
      const mod = SEED_AUTOMATIONS.find((a) => a.id === page.id);
      expect(mod, `automation ${page.id} is on the page but not in SEED_AUTOMATIONS`).toBeDefined();
      expect({
        id: mod!.id,
        name: mod!.name,
        what: mod!.what,
        soc: mod!.soc,
        hrs: mod!.hoursPerWeek,
        lift: mod!.revenueLiftPerMonth,
        suggest: mod!.suggest,
        why: mod!.why,
      }).toEqual(page);
    }
  });

  it("keeps the module's seeded total at the tuned 31.5 h/wk", () => {
    // The first pass seeded 58 h/wk and printed +477% at day 30 — the number a
    // client stops believing. Pinning the total makes that tuning enforced.
    expect(seededHoursPerWeek()).toBeCloseTo(31.5, 2);
    expect(seededHoursPerWeek()).toBeCloseTo(
      AUTOMATIONS.reduce((s, a) => s + a.hrs, 0),
      6,
    );
  });

  it("builds rows whose rates and sources come from LABOR_ROLES, with fallback flagged", () => {
    const built = buildAutomations(REGION);
    expect(built.length).toBe(SEED_AUTOMATIONS.length); // no row silently dropped
    for (const b of built) {
      const role = LABOR_ROLES.find((r) => r.soc === b.soc)!;
      expect(b.rateSource).toBe(role.source);
      // Telemarketers has no Naples figure — the builder must SAY it stepped out
      // rather than presenting the state number as if it were local.
      expect(b.fellBack).toBe(role.medianHourly[REGION] == null);
    }
  });

  it("reproduces the page's day-30 read from the module catalogue alone", () => {
    // The strongest form of the guard: build from SEED_AUTOMATIONS (what the app
    // renders) and assert it lands on the same +11.6% the artifact publishes.
    const { summary } = estimatePhase2Roi({
      estInvestment: inputDefault("inv"),
      daysElapsed: inputDefault("days"),
      guaranteeDays: inputDefault("window"),
      automations: enabledAutomations(buildAutomations(REGION)),
    });
    expect((summary.roiPct! * 100).toFixed(1)).toBe("11.6");
  });

  // Caught in review 2026-07-25: the mounted component seeded $12,000 (the spec's
  // §2a worked example) while the artifact opens at $9,100, so the SAME company read
  // +11.6% on the page Rob emails a client and −15.3% on the record he opens in the
  // dashboard. The test above could not see it — it feeds the module the PAGE's
  // defaults, never the module's own. This one closes that hole.
  it("opens on the artifact's defaults, so page and app agree before anyone types", () => {
    expect(DEFAULT_PHASE2_ESTIMATE.estInvestment).toBe(inputDefault("inv"));
    expect(DEFAULT_PHASE2_ESTIMATE.daysElapsed).toBe(inputDefault("days"));
    expect(DEFAULT_PHASE2_ESTIMATE.guaranteeDays ?? 91).toBe(inputDefault("window"));
    expect(DEFAULT_PHASE2_ESTIMATE.region).toBe(REGION);
  });

  it("an untouched company record therefore also reads +11.6%", () => {
    const { summary } = estimatePhase2Roi({
      estInvestment: DEFAULT_PHASE2_ESTIMATE.estInvestment,
      daysElapsed: DEFAULT_PHASE2_ESTIMATE.daysElapsed,
      guaranteeDays: DEFAULT_PHASE2_ESTIMATE.guaranteeDays,
      automations: enabledAutomations(
        buildAutomations(DEFAULT_PHASE2_ESTIMATE.region, DEFAULT_PHASE2_ESTIMATE.overrides),
      ),
    });
    expect((summary.roiPct! * 100).toFixed(1)).toBe("11.6");
    expect(summary.status).toBe("surplus");
  });

  it("drops a deselected automation from the estimate instead of zeroing it", () => {
    const built = buildAutomations(REGION, { recep: { enabled: false } });
    expect(built.length).toBe(SEED_AUTOMATIONS.length); // still rendered, greyed
    expect(enabledAutomations(built).length).toBe(SEED_AUTOMATIONS.length - 1);
    expect(enabledAutomations(built).some((a) => a.id === "recep")).toBe(false);
  });

  it("lets an operator override hours and lift without touching the seed", () => {
    const built = buildAutomations(REGION, {
      recep: { hoursPerWeek: 12, revenueLiftPerMonth: 2000 },
    });
    const row = built.find((a) => a.id === "recep")!;
    expect(row.humanHoursPerWeek).toBe(12);
    expect(row.revenueLiftPerMonth).toBe(2000);
    // the catalogue itself is untouched — overrides are a layer, not a mutation
    expect(SEED_AUTOMATIONS.find((a) => a.id === "recep")!.hoursPerWeek).toBe(7);
  });
});
