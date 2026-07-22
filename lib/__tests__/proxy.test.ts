import { describe, expect, it } from "vitest";
import { isPublicPath } from "../../proxy";

describe("isPublicPath (basic-auth gate exemptions)", () => {
  it("keeps Twilio voice + webhook routes reachable without Basic auth", () => {
    expect(isPublicPath("/api/twilio/voice")).toBe(true);
    expect(isPublicPath("/api/webhooks/twilio-recording")).toBe(true);
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
