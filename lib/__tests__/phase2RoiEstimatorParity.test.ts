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
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
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
