import { describe, expect, it } from "vitest";
import { isPublicPath } from "../../proxy";

describe("isPublicPath (basic-auth gate exemptions)", () => {
  it("keeps Twilio voice + webhook routes reachable without Basic auth", () => {
    expect(isPublicPath("/api/twilio/voice")).toBe(true);
    expect(isPublicPath("/api/webhooks/twilio-recording")).toBe(true);
  });

  it("keeps Vercel cron routes reachable (they carry CRON_SECRET auth)", () => {
    expect(isPublicPath("/api/cron/dedup")).toBe(true);
    expect(isPublicPath("/api/cron")).toBe(false); // bare prefix stays gated
  });

  it("keeps /api/health reachable (uptime monitors, data-free payload)", () => {
    expect(isPublicPath("/api/health")).toBe(true);
    expect(isPublicPath("/api/health/extra")).toBe(false); // exact match only
  });

  it("gates everything else, including the money graph and token mint", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/api/network")).toBe(false);
    expect(isPublicPath("/api/twilio/token")).toBe(false);
    expect(isPublicPath("/api/dev-chat")).toBe(false);
    expect(isPublicPath("/rep")).toBe(false);
  });

  it("does not let lookalike prefixes through", () => {
    expect(isPublicPath("/api/twilio/voicemail")).toBe(false);
    expect(isPublicPath("/api/webhooks")).toBe(false);
    expect(isPublicPath("/api/twilio/voice/extra")).toBe(false);
  });
});
