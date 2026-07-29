#!/usr/bin/env node
// Attendee de-PII for "MLE Internal Meetings/manifest.json".
//
// The manifest is COMMITTED and git never forgets, so it must never carry an
// address. What it must keep is the ability to answer "which meeting is this?" —
// title, date, duration, keywords, link. Those stay; the mailboxes go.
//
// Two consumers, one implementation, on purpose:
//   - scripts/fireflies-ingest.mjs imports redactAttendees() and shapes the
//     manifest at the point of creation, so a future pull cannot re-introduce
//     emails by simply running the ingest again;
//   - this file is also a CLI that rewrites an existing manifest in place, with
//     no network and no API key:
//         node scripts/manifest-privacy.mjs "MLE Internal Meetings/manifest.json"
//     Idempotent — a second run is a no-op.

import { readFileSync, writeFileSync } from "node:fs";

/** Domain of an email, lowercased. Null for anything that isn't one. */
export function emailDomain(value) {
  if (typeof value !== "string") return null;
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  return value.slice(at + 1).trim().toLowerCase() || null;
}

/**
 * Attendee identity -> shape. Never returns an address.
 *
 * A participant that isn't an email still COUNTS (Fireflies sometimes hands back
 * a display name) — dropping it would understate who was in the room, and the
 * count is the one attendance fact we are keeping.
 */
export function redactAttendees({ organizer, participants } = {}) {
  const list = Array.isArray(participants) ? participants : [];
  const seen = new Set();
  for (const p of list) {
    if (typeof p !== "string") continue;
    const key = p.trim().toLowerCase();
    if (key) seen.add(key);
  }
  const domains = new Set();
  for (const key of seen) {
    const d = emailDomain(key);
    if (d) domains.add(d);
  }
  return {
    organizerDomain: emailDomain(organizer),
    participantCount: seen.size,
    participantDomains: [...domains].sort(),
  };
}

/**
 * Strip `organizer`/`participants` off one manifest entry.
 *
 * The redacted fields are written where the originals sat, so a redacted
 * manifest diffs cleanly against its predecessor instead of reshuffling
 * every line. An entry with neither field (a `fetch-failed` row) is untouched.
 */
export function redactMeeting(meeting) {
  if (!meeting || typeof meeting !== "object" || Array.isArray(meeting)) return meeting;
  if (!("organizer" in meeting) && !("participants" in meeting)) return meeting;

  const redacted = redactAttendees(meeting);
  const out = {};
  for (const [key, value] of Object.entries(meeting)) {
    if (key === "organizer") {
      out.organizerDomain = redacted.organizerDomain;
    } else if (key === "participants") {
      out.participantCount = redacted.participantCount;
      out.participantDomains = redacted.participantDomains;
    } else {
      out[key] = value;
    }
  }
  // `participants` absent but `organizer` present: still record the (zero) count
  // rather than leaving the shape inconsistent across entries.
  if (!("participants" in meeting)) {
    out.participantCount = redacted.participantCount;
    out.participantDomains = redacted.participantDomains;
  }
  return out;
}

/** Whole-manifest pass. */
export function redactManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.meetings)) return manifest;
  return { ...manifest, meetings: manifest.meetings.map(redactMeeting) };
}

// --- CLI ---------------------------------------------------------------------
const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (invokedDirectly && process.argv[2]) {
  const path = process.argv[2];
  const before = readFileSync(path, "utf8");
  const after = JSON.stringify(redactManifest(JSON.parse(before)), null, 2) + "\n";
  if (before === after) {
    console.log(`${path}: already redacted — no change.`);
  } else {
    writeFileSync(path, after);
    console.log(`${path}: attendee emails removed (organizerDomain + participantCount + participantDomains).`);
  }
}
