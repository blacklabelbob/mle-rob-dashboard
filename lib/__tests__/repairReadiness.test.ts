import { describe, expect, it } from "vitest";
import { BACKFILL_REQUIRED_ENV } from "@/lib/calls/backfillTrigger";
import { SUMMARY_REQUIRED_ENV } from "@/lib/calls/summaryTrigger";
import {
  REPAIR_AUTH_ENV,
  REPAIR_ENV_NAMES,
  repairPresenceFromEnv,
  repairReadiness,
} from "@/lib/calls/repairReadiness";

const present = (...names: string[]) => new Set(names);
const all = () => new Set(REPAIR_ENV_NAMES);
const door = (present: Set<string>, id: "transcript" | "summary") =>
  repairReadiness(present).doors.find((d) => d.door === id)!;

describe("repairReadiness — the two spend doors, told the truth about", () => {
  it("asks for CRON_SECRET FIRST on every door — it is the gate, checked before config", () => {
    // Rule 3, and the reason the module exists: `CRON_SECRET` is in neither trigger's
    // required-env list, so no other surface has ever asked Rob for it. Listing it after
    // the provider keys has a human add Deepgram, redeploy, and get the same 503.
    for (const d of repairReadiness(present()).doors) {
      expect(d.requires[0]).toBe(REPAIR_AUTH_ENV);
      expect(d.missing[0]).toBe(REPAIR_AUTH_ENV);
    }
    expect(repairReadiness(present()).missing[0]).toBe(REPAIR_AUTH_ENV);
  });

  it("takes each door's env from the TRIGGER's own list, never a copy", () => {
    // Rule 2. If either trigger's required env changes, this assertion changes with it —
    // which is the point: a drifted copy reports a door `open` that answers 503.
    expect(door(present(), "transcript").requires).toEqual([
      REPAIR_AUTH_ENV,
      ...BACKFILL_REQUIRED_ENV,
    ]);
    expect(door(present(), "summary").requires).toEqual([
      REPAIR_AUTH_ENV,
      ...SUMMARY_REQUIRED_ENV,
    ]);
  });

  it("does NOT require Deepgram for the summary door — inc.42 rule 1, preserved here", () => {
    // The whole reason the summary branch is separate: it never contacts Deepgram. A
    // report demanding DEEPGRAM_API_KEY would call a door inert that could run perfectly.
    const summaryArmed = present(
      REPAIR_AUTH_ENV,
      "ANTHROPIC_API_KEY",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    expect(door(summaryArmed, "summary").state).toBe("open");
    expect(door(summaryArmed, "summary").missing).toEqual([]);
    // ...and the transcript door, on that same deployment, is honestly still inert.
    expect(door(summaryArmed, "transcript").missing).toEqual(["DEEPGRAM_API_KEY"]);
    expect(door(summaryArmed, "transcript").state).toBe("inert");
  });

  it("distinguishes a shut GATE from an unconfigured PASS — two different 503s", () => {
    // A human debugging these gets sent to two different places, so the report must not
    // flatten them: no CRON_SECRET means nothing is even triggerable.
    expect(door(present(), "summary").effect).toMatch(/gate/i);
    expect(door(present(), "summary").effect).toContain(REPAIR_AUTH_ENV);

    const gated = present(REPAIR_AUTH_ENV);
    expect(door(gated, "summary").effect).toMatch(/not-configured/);
    expect(door(gated, "summary").effect).not.toMatch(/gate/i);
    expect(door(gated, "summary").missing).not.toContain(REPAIR_AUTH_ENV);
  });

  it("dedupes the roll-up across doors while keeping gate-first order", () => {
    const r = repairReadiness(present());
    expect(r.missing).toEqual([...new Set(r.missing)]);
    expect(r.missing).toContain("DEEPGRAM_API_KEY");
    expect(r.missing.filter((m) => m === "ANTHROPIC_API_KEY")).toHaveLength(1);
  });

  it("never claims a backlog was repaired, however armed the doors are", () => {
    // Rule 4 / inc.21's `proven: false`, one branch over: env is not evidence.
    const r = repairReadiness(all());
    expect(r.doors.every((d) => d.state === "open")).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.repaired).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/\bworking\b|\brepaired the\b/i);
  });
});

describe("repairPresenceFromEnv — names in, values never", () => {
  it("reports presence and carries no fragment of any key", () => {
    // Rule 5. Realistic-looking secrets go in; only NAMES may come out.
    const secret = "sk-ant-inc43-do-not-leak";
    const p = repairPresenceFromEnv({
      CRON_SECRET: "cron-inc43-do-not-leak",
      ANTHROPIC_API_KEY: secret,
    } as NodeJS.ProcessEnv);
    expect(p.has(REPAIR_AUTH_ENV)).toBe(true);
    expect(p.has("ANTHROPIC_API_KEY")).toBe(true);
    expect(p.has("SUPABASE_URL")).toBe(false);

    const serialised = JSON.stringify(repairReadiness(p));
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain("do-not-leak");
  });

  it("treats an empty string as unset — a blank env var arms nothing", () => {
    const p = repairPresenceFromEnv({ CRON_SECRET: "" } as NodeJS.ProcessEnv);
    expect(p.has(REPAIR_AUTH_ENV)).toBe(false);
  });
});
