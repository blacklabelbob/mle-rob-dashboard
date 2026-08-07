/**
 * Q86 inc.5 — the snapshot redaction, pinned.
 *
 * inc.3 and inc.4 hand-transcribed a live Calendar MCP response into the committed snapshot, so
 * the only thing keeping Rob's live contacts out of git was an agent remembering to drop fields.
 * `guard:pii` already caught that once. These tests pin the redaction now that it is code, and the
 * last one reads the REAL committed snapshot off disk — a fixture would go green on exactly the
 * omission this is guarding against (the same reason inc.4's attachment test reads the real file).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// @ts-expect-error — the redactor is a .mjs script module; it has no .d.ts and needs none.
import { redactCalendarPayload } from "@/scripts/calendar-snapshot-from-mcp.mjs";

const META = {
  comment: "test",
  fetchedAt: "2026-08-07T17:24:00-04:00",
  calendarId: "rob@aivoicetech.io",
  timeZone: "America/New_York",
  window: { start: "2026-06-01T00:00:00-04:00", end: "2026-08-08T00:00:00-04:00" },
  pii: "test",
};

const RAW_EVENT = {
  id: "abc123",
  summary: "Rob & Austin | MArtin Fierro",
  status: "confirmed",
  eventType: "DEFAULT",
  location: "https://meet.google.com/snf-vmxj-dpo",
  conferenceUrl: "https://meet.google.com/twu-rpxe-fvg",
  start: { dateTime: "2026-08-03T14:00:00-04:00", timeZone: "America/New_York" },
  attendees: [
    { email: "rob@aivoicetech.io", self: true, responseStatus: "accepted" },
    { email: "austin@example-client.com", displayName: "Austin R", responseStatus: "accepted" },
  ],
  attachments: [
    {
      fileUrl: "https://docs.google.com/document/d/1JD70/edit",
      title: "Notes by Gemini",
      iconLink: "https://drive-thirdparty.googleusercontent.com/icon.png",
    },
  ],
  description: "Dial-in PIN 8842#. Rob's cell 239-555-0134.",
  creator: { email: "rob@aivoicetech.io", self: true },
  organizer: { email: "austin@example-client.com", displayName: "Austin R" },
  htmlLink: "https://www.google.com/calendar/event?eid=X2M4c2pl",
};

describe("redactCalendarPayload", () => {
  it("keeps every field fromCalendarEvents reads", () => {
    const { events } = redactCalendarPayload({ events: [RAW_EVENT] }, META);
    expect(events[0]).toMatchObject({
      id: "abc123",
      summary: "Rob & Austin | MArtin Fierro",
      status: "confirmed",
      eventType: "DEFAULT",
      location: "https://meet.google.com/snf-vmxj-dpo",
      conferenceUrl: "https://meet.google.com/twu-rpxe-fvg",
      start: { dateTime: "2026-08-03T14:00:00-04:00" },
    });
  });

  it("drops every attendee address while preserving self and the COUNT", () => {
    const { events } = redactCalendarPayload({ events: [RAW_EVENT] }, META);
    // The count is load-bearing — it is how a solo entry is told from a meeting — so redaction
    // must never collapse the array.
    expect(events[0].attendees).toEqual([{ self: true }, {}]);
  });

  it("carries a Gemini attachment's locator and title, and nothing else", () => {
    const { events } = redactCalendarPayload({ events: [RAW_EVENT] }, META);
    expect(events[0].attachments).toEqual([
      { fileUrl: "https://docs.google.com/document/d/1JD70/edit", title: "Notes by Gemini" },
    ]);
  });

  it("drops description, creator, organizer and htmlLink entirely", () => {
    const { events } = redactCalendarPayload({ events: [RAW_EVENT] }, META);
    const serialized = JSON.stringify(events[0]);
    for (const leak of ["austin@example-client.com", "Austin R", "239-555-0134", "8842#", "htmlLink"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("is deterministic — no clock, so the same payload yields the same snapshot", () => {
    const a = JSON.stringify(redactCalendarPayload({ events: [RAW_EVENT] }, META));
    const b = JSON.stringify(redactCalendarPayload({ events: [RAW_EVENT] }, META));
    expect(a).toBe(b);
  });

  it("the REAL committed snapshot carries no attendee address", () => {
    const path = join(process.cwd(), "MLE Internal Meetings", "calendar-snapshot-2026-08-07.json");
    const snapshot = JSON.parse(readFileSync(path, "utf8"));
    // Guard the guard: if the snapshot ever loses its attendee arrays this test would pass
    // vacuously, so first prove there are attendees to leak.
    const withAttendees = snapshot.events.filter((e: { attendees?: unknown[] }) => e.attendees?.length);
    expect(withAttendees.length).toBeGreaterThan(0);
    for (const event of snapshot.events) {
      for (const attendee of event.attendees ?? []) {
        expect(Object.keys(attendee).every((k: string) => k === "self")).toBe(true);
      }
    }
    // rob@aivoicetech.io may appear as the calendarId; no OTHER address may appear anywhere.
    const others = JSON.stringify(snapshot)
      .match(/[A-Za-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)
      ?.filter((a: string) => a !== "rob@aivoicetech.io");
    expect(others ?? []).toEqual([]);
  });

  it("the REAL committed snapshot covers the archive's earliest row — the window is no longer 2 weeks", () => {
    const path = join(process.cwd(), "MLE Internal Meetings", "calendar-snapshot-2026-08-07.json");
    const snapshot = JSON.parse(readFileSync(path, "utf8"));
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "MLE Internal Meetings", "manifest.json"), "utf8"),
    );
    const earliest = manifest.meetings
      .map((m: { date: string }) => m.date)
      .sort()[0]
      .slice(0, 10);
    expect(snapshot.window.start.slice(0, 10) <= earliest).toBe(true);
  });
});
