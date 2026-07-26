// Q68 (c) inc.8 — the webhook's transcribe/skip decision, pinned away from the route.
import { describe, expect, it } from "vitest";
import {
  planTranscription,
  transcriptionLabel,
} from "@/lib/calls/recordingTranscription";

const base = {
  configured: true,
  filed: true,
  recordingSid: "RE123",
  recordingUrl: "https://api.twilio.com/rec.mp3",
};

describe("planTranscription", () => {
  it("transcribes a filed call when a key is configured", () => {
    expect(planTranscription(base)).toEqual({
      kind: "transcribe",
      recordingSid: "RE123",
      recordingUrl: "https://api.twilio.com/rec.mp3",
    });
  });

  it("skips with no recording sid — nothing to key a transcript on", () => {
    for (const recordingSid of [null, undefined, "", "   "]) {
      expect(planTranscription({ ...base, recordingSid })).toEqual({
        kind: "skipped",
        reason: "no-recording-sid",
      });
    }
  });

  it("does NOT transcribe an unfiled call — the row would orphan customer speech", () => {
    expect(planTranscription({ ...base, filed: false })).toEqual({
      kind: "skipped",
      reason: "unfiled",
    });
  });

  it("skips when DEEPGRAM_API_KEY is unset, and never as a failure", () => {
    expect(planTranscription({ ...base, configured: false })).toEqual({
      kind: "skipped",
      reason: "disabled",
    });
  });

  it("orders reasons most-fundamental first", () => {
    // No sid outranks both: there is nothing to store OR file.
    expect(
      planTranscription({ ...base, recordingSid: "", filed: false, configured: false })
    ).toEqual({ kind: "skipped", reason: "no-recording-sid" });
    // Unfiled outranks disabled: a key would not have made it reachable.
    expect(planTranscription({ ...base, filed: false, configured: false })).toEqual({
      kind: "skipped",
      reason: "unfiled",
    });
  });

  it("passes a missing/unusable url THROUGH — inc.7 owes it a visible failed row", () => {
    // Deliberately not a skip: pre-empting it here turns a stated failure back into
    // an absence on the call.
    for (const recordingUrl of [null, undefined, "", "not a url", "file:///etc/passwd"]) {
      const plan = planTranscription({ ...base, recordingUrl });
      expect(plan.kind).toBe("transcribe");
    }
  });

  it("trims the sid and the url rather than keying on whitespace", () => {
    expect(
      planTranscription({ ...base, recordingSid: "  RE9  ", recordingUrl: "  https://x/a.mp3 " })
    ).toEqual({
      kind: "transcribe",
      recordingSid: "RE9",
      recordingUrl: "https://x/a.mp3",
    });
  });

  it("labels every outcome in one readable string", () => {
    expect(transcriptionLabel(planTranscription(base))).toBe("queued");
    expect(transcriptionLabel(planTranscription({ ...base, filed: false }))).toBe(
      "skipped:unfiled"
    );
    expect(transcriptionLabel(planTranscription({ ...base, configured: false }))).toBe(
      "skipped:disabled"
    );
    expect(transcriptionLabel(planTranscription({ ...base, recordingSid: null }))).toBe(
      "skipped:no-recording-sid"
    );
  });
});
