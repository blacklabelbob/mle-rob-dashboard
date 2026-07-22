import { describe, expect, it } from "vitest";
import {
  captureFlagTitle,
  errorToFlag,
} from "@/lib/integrity/captureAlert";

// PRD Task 3.6 — n8n Error Trigger payload → flags-ledger row.
const NOW = "2026-07-22T09:15:00.000Z";

describe("errorToFlag", () => {
  it("maps a workflow-run failure to a high-severity flag with message, node and execution ref", () => {
    const flag = errorToFlag(
      {
        workflow: { id: "JnIJiCbOqSaK8uN2", name: "Gmail capture" },
        execution: {
          id: "231",
          url: "https://boostn8n.app.n8n.cloud/execution/231",
          lastNodeExecuted: "Gmail Trigger",
          error: { message: "Unable to sign without access token" },
        },
      },
      NOW
    );
    expect(flag).not.toBeNull();
    expect(flag!.severity).toBe("high");
    expect(flag!.title).toBe("Capture workflow failing: Gmail capture (2026-07-22)");
    expect(flag!.detail).toContain("Unable to sign without access token");
    expect(flag!.detail).toContain("node: Gmail Trigger");
    expect(flag!.detail).toContain("https://boostn8n.app.n8n.cloud/execution/231");
  });

  it("handles the polling-trigger failure variant (bad credential: no execution ever starts)", () => {
    const flag = errorToFlag(
      {
        workflow: { name: "Gmail capture" },
        trigger: { error: { message: "401 - Invalid Credentials" } },
      },
      NOW
    );
    expect(flag).not.toBeNull();
    expect(flag!.detail).toContain("401 - Invalid Credentials");
    expect(flag!.detail).toContain("no execution started");
  });

  it("is idempotent per workflow per day: same day → same title, next day → new title", () => {
    const payload = { workflow: { name: "Gmail capture" }, execution: { id: "1" } };
    const a = errorToFlag(payload, "2026-07-22T00:00:01.000Z")!;
    const b = errorToFlag(payload, "2026-07-22T23:59:59.000Z")!;
    const c = errorToFlag(payload, "2026-07-23T00:00:01.000Z")!;
    expect(a.title).toBe(b.title); // failure storm all day → one flag
    expect(a.title).not.toBe(c.title); // still broken tomorrow → re-alert
    expect(c.title).toBe(captureFlagTitle("Gmail capture", "2026-07-23"));
  });

  it("distinct workflows never share a flag title", () => {
    const a = errorToFlag({ workflow: { name: "Gmail capture" } }, NOW)!;
    const b = errorToFlag({ workflow: { name: "AIDRE sender" } }, NOW)!;
    expect(a.title).not.toBe(b.title);
  });

  it("returns null without a workflow name (never a fabricated flag)", () => {
    expect(errorToFlag({}, NOW)).toBeNull();
    expect(errorToFlag({ workflow: { name: "  " } }, NOW)).toBeNull();
  });

  it("falls back to 'unknown error' when n8n sends no message", () => {
    const flag = errorToFlag(
      { workflow: { name: "Gmail capture" }, execution: { id: "9" } },
      NOW
    )!;
    expect(flag.detail).toContain("unknown error");
    expect(flag.detail).toContain("execution 9");
  });
});
