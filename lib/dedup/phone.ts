// Phone normalization — core, not vendor.
//
// This lived in lib/vapi.ts until the Q74 seam test caught lib/dedup/match.ts
// importing it: the matcher, which is entity logic any instance would reuse,
// was reaching into a Vapi-integration module carrying env vars and webhook
// secrets. The dependency now runs the correct direction — vapi re-exports
// from here, so every existing caller is unchanged and nothing in dedup
// depends on a phone vendor.

// US-centric normalization: compare on the last 10 digits so
// "+1 (239) 555-0142", "239.555.0142", and "12395550142" all match.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}
