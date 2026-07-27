import { describe, expect, it } from "vitest";
import {
  RECORDING_MEDIA_PATH,
  playbackLabel,
  playbackSource,
  seekSeconds,
} from "@/lib/calls/recordingAudio";

const TWILIO_URL =
  "https://api.twilio.com/2010-04-01/Accounts/AC00000000000000000000000000000000/Recordings/RE11111111111111111111111111111111.mp3";
const SID = "RE11111111111111111111111111111111";

describe("playbackSource", () => {
  it("renders no player at all when the call carries no recording (rule 4)", () => {
    expect(playbackSource({ recordingSid: SID, recordingUrl: null })).toEqual({ kind: "absent" });
    expect(playbackSource({ recordingSid: SID, recordingUrl: "   " })).toEqual({ kind: "absent" });
    expect(playbackSource({ recordingSid: null, recordingUrl: undefined })).toEqual({ kind: "absent" });
  });

  it("points the player at our own route, never at the Twilio URL (rule 1)", () => {
    const src = playbackSource({ recordingSid: SID, recordingUrl: TWILIO_URL });
    expect(src).toEqual({ kind: "proxied", sid: SID, src: `${RECORDING_MEDIA_PATH}?sid=${SID}` });
    // The whole point: the upstream address does not travel to the browser.
    if (src.kind !== "proxied") throw new Error("unreachable");
    expect(src.src).not.toContain("api.twilio.com");
    expect(src.src).not.toContain("Accounts");
  });

  it("never carries the recording URL in the src, whatever the URL is (rule 2)", () => {
    for (const url of [
      TWILIO_URL,
      "https://api.twilio.com/anything.mp3?X-Amz-Signature=abc",
      "https://media.twiliocdn.com/x/y.mp3",
    ]) {
      const src = playbackSource({ recordingSid: SID, recordingUrl: url });
      expect(src.kind).toBe("proxied");
      if (src.kind !== "proxied") throw new Error("unreachable");
      expect(src.src).toBe(`${RECORDING_MEDIA_PATH}?sid=${SID}`);
    }
  });

  it("refuses to fall back to the URL when there is no sid (rule 2)", () => {
    const src = playbackSource({ recordingSid: null, recordingUrl: TWILIO_URL });
    expect(src.kind).toBe("unplayable");
    if (src.kind !== "unplayable") throw new Error("unreachable");
    expect(src.reason).toMatch(/cannot be played/i);
    // A recording we will not play is never handed over as a link instead.
    expect(JSON.stringify(src)).not.toContain("twilio");
  });

  it("refuses a sid that is not a plain token — it becomes a query param and a lookup key", () => {
    for (const sid of ["RE 1111", "RE/../../etc", "RE'1--", "short", "RE?x=1", "RE111111111%"]) {
      const src = playbackSource({ recordingSid: sid, recordingUrl: TWILIO_URL });
      expect(src.kind, sid).toBe("unplayable");
    }
  });

  it("refuses a foreign host rather than proxying it with our credential (rule 3)", () => {
    const src = playbackSource({ recordingSid: SID, recordingUrl: "https://evil.example/rec.mp3" });
    expect(src.kind).toBe("unplayable");
    if (src.kind !== "unplayable") throw new Error("unreachable");
    expect(src.reason).toContain("evil.example");
  });

  it("does not let a suffix lookalike host through", () => {
    for (const host of ["api.twilio.com.evil.example", "notapi.twilio.com", "api-twilio.com", "evil.example#api.twilio.com"]) {
      const src = playbackSource({ recordingSid: SID, recordingUrl: `https://${host}/rec.mp3` });
      expect(src.kind, host).toBe("unplayable");
    }
  });

  it("accepts a known host case-insensitively", () => {
    expect(playbackSource({ recordingSid: SID, recordingUrl: "https://API.Twilio.COM/rec.mp3" }).kind).toBe("proxied");
  });

  it("refuses anything that is not https", () => {
    for (const url of ["http://api.twilio.com/rec.mp3", "file:///etc/passwd", "gopher://api.twilio.com/x"]) {
      expect(playbackSource({ recordingSid: SID, recordingUrl: url }).kind, url).toBe("unplayable");
    }
  });

  it("refuses an unparseable address rather than guessing at one", () => {
    const src = playbackSource({ recordingSid: SID, recordingUrl: "api.twilio.com/rec.mp3" });
    expect(src.kind).toBe("unplayable");
  });

  it("keeps unplayable distinct from absent for every refusal (rule 4)", () => {
    const refusals = [
      { recordingSid: null, recordingUrl: TWILIO_URL },
      { recordingSid: "bad sid", recordingUrl: TWILIO_URL },
      { recordingSid: SID, recordingUrl: "https://evil.example/x.mp3" },
      { recordingSid: SID, recordingUrl: "http://api.twilio.com/x.mp3" },
    ];
    for (const input of refusals) {
      const src = playbackSource(input);
      expect(src.kind).toBe("unplayable");
      if (src.kind !== "unplayable") throw new Error("unreachable");
      expect(src.reason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("playbackLabel", () => {
  it("names the call so a page of a dozen recordings does not read as one", () => {
    expect(playbackLabel({ direction: "outbound", duration: "3:24" })).toBe("Recording of this outbound call (3:24)");
    expect(playbackLabel({ direction: "inbound", duration: null })).toBe("Recording of this inbound call");
    expect(playbackLabel({})).toBe("Recording of this call");
  });
});

describe("seekSeconds", () => {
  it("passes a real time through, including a genuine zero", () => {
    expect(seekSeconds(0)).toBe(0);
    expect(seekSeconds(7.5)).toBe(7.5);
  });

  it("never turns an unknown time into 0:00 (inc.27 rule 2 at the last hop)", () => {
    for (const bad of [null, undefined, NaN, Infinity, -1, "7", {}]) {
      expect(seekSeconds(bad)).toBeNull();
    }
  });
});
